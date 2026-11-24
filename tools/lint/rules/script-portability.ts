/*
 * script-portability.ts - the `script-portability` rule type: every tracked script must run on
 * Windows (Git Bash) and macOS. Checks a shebang on each `.sh` file, no CRLF line ending, no
 * bash-only syntax in a `#!/bin/sh` script and no GNU-only tool form, gawk extension or bash 4
 * feature in a `.sh` file unless it is paired with its BSD counterpart.
 */

import type { Finding, RuleType, Tree } from "../engine.ts";

export interface ScriptPortabilityParams {
  extensions: string[];
  exclude: string[];
}

const BASHISMS: Array<{ name: string; test: (line: string) => boolean }> = [
  { name: "[[ (bash conditional, not a POSIX [[:class:]] bracket expr)", test: (l) => /\[\[(?!:)/.test(l) },
  { name: "(( (bash arithmetic command, not $(( expansion)", test: (l) => /(?<!\$)\(\(/.test(l) },
  { name: "NAME=( (bash array assignment)", test: (l) => /[A-Za-z0-9_]=\(/.test(l) },
  { name: "local -X (bash local flags)", test: (l) => /\blocal\s+-/.test(l) },
  { name: "<<< (bash here-string)", test: (l) => /<<</.test(l) },
  { name: "${var// (bash parameter substitution)", test: (l) => /\$\{[A-Za-z_][A-Za-z0-9_]*\/\//.test(l) },
  { name: "${BASH_ (bash-only variable)", test: (l) => /\$\{BASH_/.test(l) },
  { name: "function NAME (bash function keyword)", test: (l) => /\bfunction\s+[A-Za-z_]/.test(l) },
];

/** `pairedBy` marks a form that is legitimate once the file also carries its BSD counterpart,
 *  looked for file-wide because the probe often sits lines above the call it guards. The regexes
 *  are non-global on purpose: a /g/ regex carries lastIndex between calls. */
const GNUISMS: Array<{ name: string; test: RegExp; pairedBy?: RegExp }> = [
  { name: "grep -P (BSD grep has no PCRE)", test: /\bgrep\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*P\b|--perl-regexp/ },
  { name: "sed -r (BSD sed spells it -E)", test: /\bsed\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*r\b/ },
  { name: "sed -i with no backup suffix (BSD sed requires one, e.g. -i '')", test: /\bsed\b[^\n]*\s-i(?![A-Za-z])\s*(?!''|"")/ },
  { name: "readlink -f/-e (absent from BSD readlink)", test: /\breadlink\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*[fe]\b/ },
  { name: "sort -V (BSD sort has no version sort)", test: /\bsort\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*V\b|--version-sort/ },
  { name: "find -printf (GNU-only predicate)", test: /\bfind\b[^\n]*\s-printf\b/ },
  { name: "cp --parents (GNU-only)", test: /--parents\b/ },
  { name: "mktemp -p (BSD mktemp has no -p)", test: /\bmktemp\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*p\b/ },
  { name: "xargs -r (BSD xargs already skips empty input)", test: /\bxargs\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*r\b|--no-run-if-empty/ },
  { name: "echo -e/-n (BSD echo prints the flag)", test: /\becho\s+-[en]\b/ },
  {
    name: "md5sum/sha1sum/sha256sum (macOS has md5, shasum and openssl)",
    test: /\b(?:md5sum|sha1sum|sha256sum)\b/,
    pairedBy: /\b(?:shasum|openssl|md5)\b/,
  },
  { name: "tac (macOS has tail -r)", test: /(?:^|[\s;&|(])tac(?:\s|$)/ },
  { name: "nproc (macOS has sysctl -n hw.ncpu)", test: /(?:^|[\s;&|(=$])nproc(?:\s|$|\))/ },
  { name: "timeout (GNU coreutils, not on macOS)", test: /(?:^|[\s;&|(])timeout\s+[-\d]/ },
  { name: "realpath (added to macOS only in 12.3)", test: /(?:^|[\s;&|(=$])realpath(?:\s|$|\))/ },
  { name: "date +%N (BSD date has no nanoseconds)", test: /\bdate\b[^\n]*%s?%N/ },
  {
    name: "stat -c (BSD stat spells it -f)",
    test: /\bstat\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*c\b/,
    pairedBy: /\bstat\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*f\b/,
  },
  {
    // anchored on `date` as the command word: `--date=` also belongs to `git log --date=short`
    name: "date -d (BSD date spells it -j -f, or -v for relative)",
    test: /(?:^|[\s;&|($])date\s+(?:-[A-Za-z]+\s+)*(?:-d\s|--date[= ])/,
    pairedBy: /\bdate\s+(?:-[A-Za-z]+\s+)*-[jv]/,
  },
  {
    name: "gawk-only function or variable",
    test: /\b(?:gensub|asorti?|patsplit|systime|strftime|mktime)\s*\(|\b(?:IGNORECASE|PROCINFO|FIELDWIDTHS|FPAT|BEGINFILE|ENDFILE|RT)\b|\bnextfile\b/,
  },
  { name: "GNU word-boundary escape in a regex (\\< \\> \\y \\B)", test: /\\[<>yB]/ },
  { name: "declare/local -A or -n (bash 4 associative array / nameref)", test: /\b(?:declare|local|typeset)\s+-[A-Za-z]*[An]\b/ },
  { name: "mapfile/readarray (bash 4)", test: /\b(?:mapfile|readarray)\b/ },
  { name: "${var^^} / ${var,,} case modification (bash 4)", test: /\$\{[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?(?:\^\^?|,,?)\}/ },
  { name: "shopt -s globstar (bash 4)", test: /\bglobstar\b/ },
  { name: ";;& or ;& case fall-through (bash 4)", test: /;;&|;&\s*$/ },
  { name: "wait -n (bash 4.3)", test: /\bwait\s+-n\b/ },
  { name: "[[ -v (bash 4.2)", test: /\[\[\s+-v\s/ },
  { name: "coproc (bash 4)", test: /\bcoproc\b/ },
];

function fileFindings(path: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");
  const isSh = path.endsWith(".sh");

  if (isSh && !lines[0].startsWith("#!")) findings.push({ path, line: 1, message: "missing shebang on line 1" });

  const crlf = content.indexOf("\r\n");
  if (crlf >= 0) {
    findings.push({ path, line: content.slice(0, crlf).split("\n").length, message: "contains a CRLF line ending" });
  }

  // a comment-only line becomes empty, so the index of every other line stays its line number
  const code = lines.map((l) => (l.trim().startsWith("#") ? "" : l));

  if (lines[0].trim().startsWith("#!/bin/sh") && !path.split("/").includes("vendor")) {
    for (let i = 1; i < code.length; i++) {
      for (const b of BASHISMS) {
        if (b.test(code[i])) findings.push({ path, line: i + 1, message: `bashism under #!/bin/sh - ${b.name}` });
      }
    }
  }

  if (isSh) {
    const codeText = code.join("\n");
    for (let i = 0; i < code.length; i++) {
      for (const g of GNUISMS) {
        if (!g.test.test(code[i])) continue;
        if (g.pairedBy && g.pairedBy.test(codeText)) continue;
        findings.push({ path, line: i + 1, message: `GNU-only, breaks on macOS - ${g.name}` });
      }
    }
  }
  return findings;
}

function check(tree: Tree, params: ScriptPortabilityParams): Finding[] {
  const findings: Finding[] = [];
  for (const file of tree.files) {
    if (!params.extensions.some((e) => file.path.endsWith(e))) continue;
    if (params.exclude.some((p) => file.path.startsWith(p))) continue;
    const content = tree.read(file.path);
    if (content === null) continue;
    findings.push(...fileFindings(file.path, content));
  }
  return findings;
}

const scriptPortability: RuleType<ScriptPortabilityParams> = {
  name: "script-portability",
  check,
  selfCheck: {
    tree: {
      files: [{ path: "bad.sh", mode: "100644" }],
      read: () => "echo hi\n",
      list: () => [],
    },
    params: { extensions: [".sh"], exclude: [] },
  },
};

export default scriptPortability;

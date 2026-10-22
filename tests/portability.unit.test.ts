/*
 * portability.unit.test.ts - a static cross-OS invariant sweep over every shipped
 * script (`*.sh` / `*.ts` outside `tests/` and `docs/`, enumerated from the git index so
 * only tracked, shipped files count): every script has a shebang on line 1
 * (`.ts` exempt - a module with none is only ever `import`ed, never
 * executed), no CRLF line ending anywhere, and the `100755` exec bit
 * whenever a `SKILL.md` or a plugin's `hooks/hooks.json` invokes it without an
 * interpreter word (`bash …`/`sh …`) in front. Every `!` preload line and
 * every ```! ``` fenced block in every `SKILL.md` and every `parts/*.md` beside
 * one (found on disk, so an untracked part is swept too) gets its own sweep: a glob
 * character (`?`, `*`, `[`) in a bare (unquoted) argument aborts a whole
 * fork load under zsh's default `nomatch`, so every such argument must be
 * quoted, and `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_SKILL_DIR}` must be
 * double-quoted (they need variable expansion). Finally, every `#!/bin/sh`
 * script is swept, comment lines stripped, for bash-only syntax that a real
 * POSIX `/bin/sh` (dash, etc.) does not understand.
 *
 * Each rule is a small pure function (file text / mode+path in, a list of
 * violation strings out) with its own self-check proving it fires on a
 * synthetic bad sample - see the "self-check" tests below - so the sweep's
 * green run on this tree is proven meaningful, not just vacuously green.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is
 * run directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/portability.unit.test.ts
 */

import { test } from "./harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { spawnSync } from "node:child_process";

const INTERPRETER_WORDS = new Set(["bash", "sh", "node"]);
const GLOB_CHARS = ["?", "*", "["];
const ROOT_VARS = ["${CLAUDE_PLUGIN_ROOT}", "${CLAUDE_SKILL_DIR}"];

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

/** GNU-only constructs a shipped script must not depend on. macOS ships BSD
 *  userland, `/usr/bin/awk` is the one-true-awk rather than gawk, and
 *  `/bin/bash` is 3.2 - so each of these runs on Linux and Git-Bash and fails,
 *  often silently, on a Mac.
 *
 *  `pairedBy` marks the forms that are legitimate once the file ALSO carries
 *  its BSD counterpart, which is the shape every guarded site in this repo
 *  already has (`stat -c %Y … || stat -f %m …`, a `date -v-1d` probe in front
 *  of `date -d`). The pair is looked for file-wide rather than on the same
 *  line, because that probe sits four lines above the call it guards; the
 *  price is that a file mixing one guarded and one bare `stat -c` reads as
 *  clean. Everything without `pairedBy` has no BSD spelling at all and is a
 *  violation wherever it appears.
 *
 *  Regexes are deliberately non-global: a /g/ regex carries lastIndex between
 *  calls and would skip every other match of the same rule. */
const GNUISMS: Array<{ name: string; test: RegExp; pairedBy?: RegExp }> = [
  // --- coreutils: no BSD spelling ---
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
    // lib_sha256.sh is the shape this allows: sha256sum probed with
    // `command -v`, shasum and openssl behind it as the macOS path
    name: "md5sum/sha1sum/sha256sum (macOS has md5, shasum and openssl)",
    test: /\b(?:md5sum|sha1sum|sha256sum)\b/,
    pairedBy: /\b(?:shasum|openssl|md5)\b/,
  },
  { name: "tac (macOS has tail -r)", test: /(?:^|[\s;&|(])tac(?:\s|$)/ },
  { name: "nproc (macOS has sysctl -n hw.ncpu)", test: /(?:^|[\s;&|(=$])nproc(?:\s|$|\))/ },
  { name: "timeout (GNU coreutils, not on macOS)", test: /(?:^|[\s;&|(])timeout\s+[-\d]/ },
  { name: "realpath (added to macOS only in 12.3)", test: /(?:^|[\s;&|(=$])realpath(?:\s|$|\))/ },
  { name: "date +%N (BSD date has no nanoseconds)", test: /\bdate\b[^\n]*%s?%N/ },
  // --- coreutils: fine once the file carries the BSD form too ---
  {
    name: "stat -c (BSD stat spells it -f)",
    test: /\bstat\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*c\b/,
    pairedBy: /\bstat\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*f\b/,
  },
  {
    // anchored on `date` as the command word, because `--date=` also belongs to
    // `git log --date=short`, which has nothing to do with date(1)
    name: "date -d (BSD date spells it -j -f, or -v for relative)",
    test: /(?:^|[\s;&|($])date\s+(?:-[A-Za-z]+\s+)*(?:-d\s|--date[= ])/,
    pairedBy: /\bdate\s+(?:-[A-Za-z]+\s+)*-[jv]/,
  },
  // --- gawk extensions: the one-true-awk on macOS knows none of these ---
  {
    name: "gawk-only function or variable",
    test: /\b(?:gensub|asorti?|patsplit|systime|strftime|mktime)\s*\(|\b(?:IGNORECASE|PROCINFO|FIELDWIDTHS|FPAT|BEGINFILE|ENDFILE|RT)\b|\bnextfile\b/,
  },
  { name: "GNU word-boundary escape in a regex (\\< \\> \\y \\B)", test: /\\[<>yB]/ },
  // --- bash 4+: macOS /bin/bash is 3.2 ---
  { name: "declare/local -A or -n (bash 4 associative array / nameref)", test: /\b(?:declare|local|typeset)\s+-[A-Za-z]*[An]\b/ },
  { name: "mapfile/readarray (bash 4)", test: /\b(?:mapfile|readarray)\b/ },
  { name: "${var^^} / ${var,,} case modification (bash 4)", test: /\$\{[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?(?:\^\^?|,,?)\}/ },
  { name: "shopt -s globstar (bash 4)", test: /\bglobstar\b/ },
  { name: ";;& or ;& case fall-through (bash 4)", test: /;;&|;&\s*$/ },
  { name: "wait -n (bash 4.3)", test: /\bwait\s+-n\b/ },
  { name: "[[ -v (bash 4.2)", test: /\[\[\s+-v\s/ },
  { name: "coproc (bash 4)", test: /\bcoproc\b/ },
];

// ---------------------------------------------------------------------------
// Detectors - each is a pure function over file text (or mode+path), so each
// gets its own synthetic self-check below with no filesystem/git involved.
// ---------------------------------------------------------------------------

/** A shebang on line 1 is required for every `.sh` script; a `.ts` module is
 *  exempt (allowed to have none - it is `import`ed, never executed; the few
 *  that ARE run as a CLI always carry `#!/usr/bin/env node` anyway, but the
 *  absence of one is not itself a violation). */
function shebangViolations(filePath: string, content: string): string[] {
  if (!filePath.endsWith(".sh")) return [];
  const firstLine = content.split("\n", 1)[0];
  if (firstLine.startsWith("#!")) return [];
  return [`${filePath}:1: missing shebang on line 1`];
}

/** No shipped script may carry a CRLF line ending anywhere, on any OS. */
function crlfViolations(filePath: string, content: string): string[] {
  if (!content.includes("\r\n")) return [];
  const lineNo = content.slice(0, content.indexOf("\r\n")).split("\n").length;
  return [`${filePath}:${lineNo}: contains a CRLF line ending`];
}

/** Strips a #!/bin/sh script's comment-only lines and flags any bash-only
 *  construct - a real POSIX /bin/sh (dash, etc.) does not understand these,
 *  so a bashism here is invisible on a bash-as-sh machine (macOS, most
 *  Linux) and breaks only on a strict one. Line 1 (the shebang itself) is
 *  always skipped - it can never itself contain a bashism. */
function bashismViolations(filePath: string, content: string): string[] {
  if (filePath.split("/").includes("vendor")) return [];
  const lines = content.split("\n");
  if (!lines[0].trim().startsWith("#!/bin/sh")) return [];
  const violations: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("#")) continue; // comment-only line, stripped
    for (const bashism of BASHISMS) {
      if (bashism.test(line)) {
        violations.push(`${filePath}:${i + 1}: bashism under #!/bin/sh - ${bashism.name}`);
      }
    }
  }
  return violations;
}

/** Sweeps a shell script for GNU-only constructs, comment-only lines stripped
 *  first (the shebang is one, so line 1 drops out with them). A `pairedBy`
 *  rule is suppressed when the file carries its BSD counterpart anywhere -
 *  see GNUISMS for why the pair is file-wide rather than per line. */
function gnuismViolations(filePath: string, content: string): string[] {
  if (!filePath.endsWith(".sh")) return [];
  // a comment-only line becomes empty rather than disappearing, so the index
  // of every surviving line still IS its line number
  const code = content.split("\n").map((line) => (line.trim().startsWith("#") ? "" : line));
  const codeText = code.join("\n");
  const violations: string[] = [];
  for (let i = 0; i < code.length; i++) {
    for (const rule of GNUISMS) {
      if (!rule.test.test(code[i])) continue;
      if (rule.pairedBy && rule.pairedBy.test(codeText)) continue;
      violations.push(`${filePath}:${i + 1}: GNU-only, breaks on macOS - ${rule.name}`);
    }
  }
  return violations;
}

/** Per-character quote state of `word` (a whitespace-delimited shell token
 *  that may itself embed one or more quoted runs) - `'none'` for a char
 *  outside any quotes, else the enclosing quote's kind. */
function quoteStates(word: string): Array<"none" | "single" | "double"> {
  const states: Array<"none" | "single" | "double"> = [];
  let state: "none" | "single" | "double" = "none";
  for (const ch of word) {
    if (state === "none" && ch === "'") {
      state = "single";
      states.push("single");
    } else if (state === "none" && ch === '"') {
      state = "double";
      states.push("double");
    } else if (state === "single" && ch === "'") {
      states.push("single");
      state = "none";
    } else if (state === "double" && ch === '"') {
      states.push("double");
      state = "none";
    } else {
      states.push(state);
    }
  }
  return states;
}

/** Splits a shell command line into words on whitespace outside quotes -
 *  good enough for the fixed, simple invocation shapes this repo's SKILL.md
 *  preloads actually use (no need for full shell-grammar fidelity). */
function splitWords(line: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (const ch of line) {
    if (quote === null && (ch === " " || ch === "\t")) {
      if (current.length > 0) words.push(current);
      current = "";
      continue;
    }
    if (quote === null && (ch === "'" || ch === '"')) quote = ch;
    else if (quote !== null && ch === quote) quote = null;
    current += ch;
  }
  if (current.length > 0) words.push(current);
  return words;
}

/** Checks one already-extracted preload command line (from a `` !`…` ``
 *  line or a ```! fenced block) for the two zsh-nomatch-safety rules: a glob
 *  character must never sit in a bare (unquoted) position, and
 *  `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_SKILL_DIR}` must be double-quoted. */
function preloadLineViolations(location: string, line: string): string[] {
  const violations: string[] = [];
  for (const word of splitWords(line)) {
    const states = quoteStates(word);
    for (let i = 0; i < word.length; i++) {
      if (GLOB_CHARS.includes(word[i]) && states[i] === "none") {
        violations.push(`${location}: unquoted '${word[i]}' in argument "${word}" (zsh nomatch risk)`);
      }
    }
    for (const rootVar of ROOT_VARS) {
      const idx = word.indexOf(rootVar);
      if (idx !== -1 && states[idx] !== "double") {
        violations.push(`${location}: ${rootVar} must be double-quoted in argument "${word}"`);
      }
    }
  }
  return violations;
}

/** Extracts every `` !`…` `` single-line preload and every ```! fenced
 *  block from a SKILL.md's content, paired with its 1-based line number(s),
 *  and runs `preloadLineViolations` over each. A backtick-preload match
 *  requires the closing backtick to end the line (only trailing whitespace
 *  after it) - this is what real preloads look like here, and it excludes
 *  prose that merely mentions the `` !`…` `` syntax mid-sentence. */
function preloadQuotingViolations(filePath: string, content: string): string[] {
  const violations: string[] = [];
  const lines = content.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    if (!inFence && line.trim() === "```!") {
      inFence = true;
      continue;
    }
    if (inFence && line.trim() === "```") {
      inFence = false;
      continue;
    }
    if (inFence) {
      violations.push(...preloadLineViolations(`${filePath}:${lineNo}`, line));
      continue;
    }
    const match = line.match(/!`(.*)`\s*$/);
    if (match) {
      violations.push(...preloadLineViolations(`${filePath}:${lineNo}`, match[1]));
    }
  }
  return violations;
}

interface CorpusHit {
  file: string;
  lineNo: number;
  explicit: boolean;
}

interface InvocationPattern {
  text: string;
  /** When set, only corpus files under this directory are searched. A bare,
   *  skill-relative call reads as "relative to whoever wrote the line", so it
   *  must never be attributed to a same-named script in another skill. */
  ownerDir?: string;
  /** When set, the match counts only where it BEGINS a whitespace-delimited
   *  token. A bare relative path is a substring of every absolute spelling of
   *  the same script (`"${CLAUDE_SKILL_DIR}/scripts/x.sh"`) and of every prose
   *  mention of it (`` the bundled `scripts/x.sh` ``); counted there it would
   *  both double-report the absolute call and lose the `bash`/`sh` word that
   *  makes it explicit. */
  standalone?: boolean;
}

/** Every occurrence, across all SKILL.md files and hooks.json, of `pattern`
 *  (the literal `${CLAUDE_PLUGIN_ROOT}/...`, `${CLAUDE_SKILL_DIR}/...` or
 *  bare skill-relative invocation text for one script) - classified as
 *  `explicit` (the word immediately before the opening quote is
 *  `bash`/`sh`/`node`) or bare. */
function findInvocations(
  { text: pattern, ownerDir, standalone }: InvocationPattern,
  corpus: Array<{ file: string; content: string }>,
): CorpusHit[] {
  const hits: CorpusHit[] = [];
  for (const { file, content } of corpus) {
    if (ownerDir !== undefined && !file.startsWith(`${ownerDir}/`)) continue;
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      let searchFrom = 0;
      for (;;) {
        const at = line.indexOf(pattern, searchFrom);
        if (at === -1) break;
        searchFrom = at + pattern.length;
        if (standalone && at > 0 && !/\s/.test(line[at - 1])) continue;
        const before = line.slice(0, at - 1).trimEnd();
        // Strip a wrapping inline-code backtick (`` `bash "..." `` `` in
        // prose) so the interpreter word compares cleanly.
        const lastWord = (before.split(/\s+/).pop() ?? "").replace(/^`+|`+$/g, "");
        hits.push({ file, lineNo: idx + 1, explicit: INTERPRETER_WORDS.has(lastWord) });
      }
    });
  }
  return hits;
}

/** The invocation text(s) a script would appear under in a SKILL.md/hooks.json,
 *  derived from its repo-relative path: the `${CLAUDE_PLUGIN_ROOT}/...` form
 *  and, when it lives under `<plugin>/skills/<name>/...`, the
 *  `${CLAUDE_SKILL_DIR}/...` form plus the BARE skill-relative path
 *  (`scripts/x.sh`). That last one is the wrong path form for a bundled
 *  script - it resolves against the host project, not the plugin - but it is
 *  exactly how a skill has shipped such a call before, and a rule that only
 *  searches the `${CLAUDE_PLUGIN_ROOT}` corpus treats the script as
 *  unreferenced and lets a 100644 mode through. It is searched only inside the
 *  owning skill's own directory: two skills may carry a same-named script. */
function invocationPatterns(repoRelativePath: string): InvocationPattern[] {
  const segments = repoRelativePath.split("/");
  const pluginRelative = segments.slice(1).join("/");
  const patterns: InvocationPattern[] = [{ text: `\${CLAUDE_PLUGIN_ROOT}/${pluginRelative}` }];
  if (segments[1] === "skills" && segments.length > 3) {
    const skillRelative = segments.slice(3).join("/");
    patterns.push({ text: `\${CLAUDE_SKILL_DIR}/${skillRelative}` });
    patterns.push({ text: skillRelative, ownerDir: segments.slice(0, 3).join("/"), standalone: true });
  }
  return patterns;
}

/** The exec-bit rule itself: a script invoked bare (no interpreter word) in
 *  at least one SKILL.md/hooks.json line must carry the `100755` exec bit
 *  in the git index; a script found only under explicit `bash …`/`sh …`
 *  invocations, or not found in the corpus at all (e.g. sourced by another
 *  script rather than invoked directly), is not constrained either way. */
function execBitViolations(
  repoRelativePath: string,
  mode: string,
  corpus: Array<{ file: string; content: string }>,
): string[] {
  if (!repoRelativePath.endsWith(".sh")) return [];
  const hits = invocationPatterns(repoRelativePath).flatMap((pattern) => findInvocations(pattern, corpus));
  const bareHit = hits.find((hit) => !hit.explicit);
  if (!bareHit) return [];
  if (mode === "100755") return [];
  return [
    `${repoRelativePath}: invoked bare at ${bareHit.file}:${bareHit.lineNo} but git mode is ${mode} (expected 100755)`,
  ];
}

/** The grouped switch keys `switch-text.sh` (viber/scripts/switch-text.sh)
 *  recognizes, each mapped to its valid values. A key outside this set - a
 *  flat `memory` included - is always a violation (DoD.2); a fragment file's
 *  value suffix must be one of its own key's list (DoD.3). */
const SWITCH_VALUES: Record<string, string[]> = {
  "planning.adr": ["true", "false"],
  "planning.outside-plan-review": ["true", "false"],
  "build.baseline-tests": ["off", "fast", "full"],
  "build.final-review": ["true", "false"],
  "build.memory": ["true", "false"],
  "build.rules": ["true", "false"],
  "build.qa": ["true", "false"],
  "build.cleanup": ["true", "false"],
  "build.red-check": ["true", "false"],
  "github.issues": ["true", "false"],
  "branching.mode": ["off", "allowed", "required"],
  "build.extensions": ["off", "on"],
};

interface SwitchTextCall {
  lineNo: number;
  key: string;
  name: string;
}

/** Every `switch-text.sh <key> "${CLAUDE_SKILL_DIR}" <name>` call in a
 *  SKILL.md's content, one fixed shape per C1. A key argument may carry a
 *  literal `""` splice (`branching.""mode`, the trick that keeps the raw
 *  substring `branching.mode` out of a grep ban while still resolving to it
 *  as one bash word) - quote characters carry no expansion here, so they are
 *  simply stripped to read the resolved key/name. */
function switchTextCalls(content: string): SwitchTextCall[] {
  const CALL_RE = /"\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/switch-text\.sh"\s+(\S+)\s+"\$\{CLAUDE_SKILL_DIR\}"\s+(\S+)/;
  const calls: SwitchTextCall[] = [];
  content.split("\n").forEach((line, idx) => {
    const m = line.match(CALL_RE);
    if (!m) return;
    calls.push({ lineNo: idx + 1, key: m[1].replace(/['"]/g, ""), name: m[2].replace(/['"]/g, "") });
  });
  return calls;
}

/** The fragment-call sweep for one skill (DoD.1-4): every `switch-text.sh`
 *  call in its SKILL.md and in its `parts/*.md` files cross-checked against the
 *  basenames actually present in its own `fragments/` directory.
 *   - DoD.1: a call's name has no `<name>.<value>.md` file for ANY valid
 *     value of its key - a fragment family the skill never wrote.
 *   - DoD.2: a call's key is not one of SWITCH_VALUES - an unknown switch.
 *   - DoD.3: an existing fragment file's `<value>` suffix is not one of the
 *     valid values for the key its own skill's calls name it under.
 *   - DoD.4: an existing fragment file that no call in its own skill's
 *     SKILL.md names at all (dead weight - never selected, ever). */
function fragmentCallViolations(
  skillMdPath: string,
  skillMdContent: string,
  fragmentBasenames: string[],
  partFiles: Array<{ file: string; content: string }> = [],
): string[] {
  const violations: string[] = [];
  // a call in a part file of the skill counts as a call of that skill
  const calls = [{ file: skillMdPath, content: skillMdContent }, ...partFiles].flatMap(({ file, content }) =>
    switchTextCalls(content).map((call) => ({ ...call, file })),
  );
  const callsByName = new Map<string, Array<SwitchTextCall & { file: string }>>();
  for (const call of calls) {
    if (!(call.key in SWITCH_VALUES)) {
      violations.push(`${call.file}:${call.lineNo}: switch-text.sh call names unknown key '${call.key}'`);
      continue;
    }
    const list = callsByName.get(call.name) ?? [];
    list.push(call);
    callsByName.set(call.name, list);
  }

  for (const [name, callList] of callsByName) {
    for (const call of callList) {
      const values = SWITCH_VALUES[call.key];
      const hasAny = values.some((value) => fragmentBasenames.includes(`${name}.${value}.md`));
      if (!hasAny) {
        violations.push(
          `${call.file}:${call.lineNo}: switch-text.sh call names fragment '${name}' with no file for any value of key '${call.key}'`,
        );
      }
    }
  }

  const fragmentDir = `${path.dirname(skillMdPath)}/fragments`;
  for (const basename of fragmentBasenames) {
    const match = basename.match(/^([a-z0-9-]+)\.([a-z]+)\.md$/);
    if (!match) continue;
    const [, name, value] = match;
    const callList = callsByName.get(name);
    if (!callList || callList.length === 0) {
      violations.push(`${fragmentDir}/${basename}: called by no SKILL.md of its own skill`);
      continue;
    }
    for (const call of callList) {
      if (!SWITCH_VALUES[call.key].includes(value)) {
        violations.push(`${fragmentDir}/${basename}: value '${value}' is not valid for key '${call.key}'`);
      }
    }
  }

  return violations;
}

/** The `parts/*.md` files beside each SKILL.md, read through `readDir` (the
 *  names in a directory, or none when it does not exist). Found on disk rather
 *  than in the git index, so a part file of a task still in progress is swept
 *  before it is added. */
function skillPartFiles(skillMdFiles: string[], readDir: (dir: string) => string[]): string[] {
  return skillMdFiles.flatMap((skillMd) => {
    const partsDir = `${path.dirname(skillMd)}/parts`;
    return readDir(partsDir)
      .filter((name) => name.endsWith(".md"))
      .sort()
      .map((name) => `${partsDir}/${name}`);
  });
}

/** The preload-quoting sweep over a corpus of SKILL.md and part files. */
function preloadQuotingSweep(corpus: Array<{ file: string; content: string }>): string[] {
  return corpus.flatMap(({ file, content }) => preloadQuotingViolations(file, content));
}

/** The files the exec-bit rule searches for a bare script call. */
function execBitCorpusFiles(groups: {
  skillMdFiles: string[];
  hooksJsonFiles: string[];
  fragmentFiles: string[];
  partFiles: string[];
}): string[] {
  return [...groups.skillMdFiles, ...groups.hooksJsonFiles, ...groups.fragmentFiles, ...groups.partFiles];
}

// ---------------------------------------------------------------------------
// Self-checks - one synthetic bad sample per detector, proving each one
// actually fires before it is trusted over the real tree below.
// ---------------------------------------------------------------------------

test("self-check: shebangViolations fires on a .sh file with no shebang", () => {
  assert.deepEqual(shebangViolations("plugin/scripts/foo.sh", "echo hi\n"), [
    "plugin/scripts/foo.sh:1: missing shebang on line 1",
  ]);
});

test("self-check: shebangViolations does not fire on a .ts file with no shebang", () => {
  assert.deepEqual(shebangViolations("plugin/scripts/foo.ts", "export const x = 1;\n"), []);
});

test("self-check: crlfViolations fires on a CRLF line", () => {
  const violations = crlfViolations("plugin/scripts/foo.sh", "#!/bin/sh\r\necho hi\n");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /foo\.sh:1: contains a CRLF line ending/);
});

test("self-check: crlfViolations does not fire on plain LF content", () => {
  assert.deepEqual(crlfViolations("plugin/scripts/foo.sh", "#!/bin/sh\necho hi\n"), []);
});

test("self-check: bashismViolations fires on [[ under a #!/bin/sh script", () => {
  const violations = bashismViolations("plugin/scripts/foo.sh", "#!/bin/sh\nif [[ -n \"$x\" ]]; then\n  echo y\nfi\n");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /foo\.sh:2: bashism under #!\/bin\/sh - \[\[/);
});

test("self-check: bashismViolations ignores a POSIX [[:space:]] bracket class and $(( arithmetic", () => {
  const content = '#!/bin/sh\nsed -e \'s/[[:space:]]*//\' file\nx=$((i-1))\n';
  assert.deepEqual(bashismViolations("plugin/scripts/foo.sh", content), []);
});

test("self-check: bashismViolations skips a comment line and a #!/usr/bin/env bash script entirely", () => {
  const commentedOut = "#!/bin/sh\n# example: if [[ -n $x ]]; then\necho ok\n";
  assert.deepEqual(bashismViolations("plugin/scripts/foo.sh", commentedOut), []);
  const bashScript = "#!/usr/bin/env bash\nif [[ -n $x ]]; then\n  echo y\nfi\n";
  assert.deepEqual(bashismViolations("plugin/scripts/foo.sh", bashScript), []);
});

test("self-check: gnuismViolations fires on grep -P, ${x^^} and a gawk-only function", () => {
  const bad = ["#!/usr/bin/env bash", 'grep -oP "x" f', 'echo "${name^^}"', "awk '{ print gensub(/a/, \"b\", 1) }'"].join("\n");
  const found = gnuismViolations("s.sh", bad);
  assert.equal(found.length, 3, found.join("\n"));
  assert.match(found[0], /^s\.sh:2: .*grep -P/);
  assert.match(found[1], /^s\.sh:3: .*case modification/);
  assert.match(found[2], /^s\.sh:4: .*gawk-only/);
});

test("self-check: gnuismViolations accepts a GNU form the file pairs with its BSD counterpart", () => {
  // the shape every guarded site in this repo has: same line for stat, and a
  // probe several lines up for date - both must read as clean
  const paired = [
    "#!/usr/bin/env bash",
    't="$(stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null)"',
    "if date -v-1d >/dev/null 2>&1; then",
    '  since="$(date -v-7d +%F)"',
    "else",
    '  since="$(date -d "-7 days" +%F)"',
    "fi",
    'if command -v sha256sum >/dev/null 2>&1; then out="$(sha256sum < "$f")"',
    'else out="$(shasum -a 256 < "$f")"; fi',
  ].join("\n");
  assert.deepEqual(gnuismViolations("s.sh", paired), []);
});

test("self-check: gnuismViolations does not read git's own --date= flag as date(1)", () => {
  // the false positive the rule shipped with: `git log --date=short` has
  // nothing to do with date(1), so the rule anchors on the command word
  const gitLog = ["#!/usr/bin/env bash", 'stamp="$(git log -1 --date=short --format=%cd)"'].join("\n");
  assert.deepEqual(gnuismViolations("s.sh", gitLog), []);
});

test("self-check: gnuismViolations fires on the same two forms when the file carries no BSD counterpart", () => {
  const bare = ["#!/usr/bin/env bash", 't="$(stat -c %Y "$1")"', 'since="$(date -d "-7 days" +%F)"'].join("\n");
  const found = gnuismViolations("s.sh", bare);
  assert.equal(found.length, 2, found.join("\n"));
  assert.match(found[0], /^s\.sh:2: .*stat -c/);
  assert.match(found[1], /^s\.sh:3: .*date -d/);
});

test("self-check: gnuismViolations skips a comment mentioning a GNU-ism, and skips .ts files entirely", () => {
  const commented = ["#!/usr/bin/env bash", "# a mutation (a redirect, sed -i, an external editor)", "printf 'ok\\n'"].join("\n");
  assert.deepEqual(gnuismViolations("s.sh", commented), []);
  assert.deepEqual(gnuismViolations("m.ts", "const x = `grep -P foo`;\n"), []);
});

test("self-check: preloadQuotingViolations fires on an unquoted '?plan' glob argument", () => {
  const content = 'name: foo\n---\n\nRun: !`"${CLAUDE_PLUGIN_ROOT}/scripts/take-input.sh" ?plan`\n';
  const violations = preloadQuotingViolations("plugin/skills/foo/SKILL.md", content);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /SKILL\.md:4: unquoted '\?' in argument "\?plan"/);
});

test("self-check: preloadQuotingViolations does not fire on a single-quoted '?plan' argument", () => {
  const content = "Run: !`\"${CLAUDE_PLUGIN_ROOT}/scripts/take-input.sh\" '?plan'`\n";
  assert.deepEqual(preloadQuotingViolations("plugin/skills/foo/SKILL.md", content), []);
});

test("self-check: preloadQuotingViolations does not fire on a legitimate '*' inside a double-quoted string", () => {
  const content = 'Run: !`"${CLAUDE_PLUGIN_ROOT}/scripts/glob.sh" "prefix-*-suffix"`\n';
  assert.deepEqual(preloadQuotingViolations("plugin/skills/foo/SKILL.md", content), []);
});

test("self-check: preloadQuotingViolations fires on an unquoted ${CLAUDE_PLUGIN_ROOT}", () => {
  const content = "Run: !`${CLAUDE_PLUGIN_ROOT}/scripts/foo.sh`\n";
  const violations = preloadQuotingViolations("plugin/skills/foo/SKILL.md", content);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /must be double-quoted/);
});

test("self-check: preloadQuotingViolations ignores prose that merely mentions the !` syntax", () => {
  const content = "Field schemas (frontmatter fields, allowed values, paths, `!`-block + `$ARGUMENTS` safety) →\n";
  assert.deepEqual(preloadQuotingViolations("plugin/skills/foo/SKILL.md", content), []);
});

test("self-check: preloadQuotingViolations sweeps a ```! fenced block line-by-line", () => {
  const content = ['```!', 'sh "${CLAUDE_PLUGIN_ROOT}/scripts/foo.sh" ?bad', '```', ''].join("\n");
  const violations = preloadQuotingViolations("plugin/skills/foo/SKILL.md", content);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /SKILL\.md:2: unquoted '\?'/);
});

test("self-check: execBitViolations fires on a 100644 mode for a bare-invoked script", () => {
  const corpus = [
    { file: "plugin/skills/foo/SKILL.md", content: 'Run: !`"${CLAUDE_PLUGIN_ROOT}/scripts/bare.sh"`\n' },
  ];
  const violations = execBitViolations("plugin/scripts/bare.sh", "100644", corpus);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /invoked bare at plugin\/skills\/foo\/SKILL\.md:1 but git mode is 100644/);
});

test("self-check: execBitViolations does not fire on an explicit bash-invoked script with mode 100644", () => {
  const corpus = [
    { file: "plugin/skills/foo/SKILL.md", content: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/wrapped.sh"\n' },
  ];
  assert.deepEqual(execBitViolations("plugin/scripts/wrapped.sh", "100644", corpus), []);
});

test("self-check: execBitViolations fires on a bare skill-relative call with mode 100644 (the form that shipped unguarded)", () => {
  const corpus = [
    { file: "plugin/skills/foo/SKILL.md", content: "1. Detect state\n   scripts/detect_state.sh /path/to/project\n" },
  ];
  const violations = execBitViolations("plugin/skills/foo/scripts/detect_state.sh", "100644", corpus);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /invoked bare at plugin\/skills\/foo\/SKILL\.md:2 but git mode is 100644/);
});

test("self-check: a bare skill-relative call is never attributed to a same-named script in another skill", () => {
  const corpus = [
    { file: "plugin/skills/foo/SKILL.md", content: "   scripts/detect_state.sh /path/to/project\n" },
  ];
  assert.deepEqual(execBitViolations("plugin/skills/bar/scripts/detect_state.sh", "100644", corpus), []);
});

test("self-check: execBitViolations does not fire on a script absent from the corpus", () => {
  assert.deepEqual(execBitViolations("plugin/scripts/unreferenced.sh", "100644", []), []);
});

test("self-check: execBitViolations recognizes an explicit invocation wrapped in a prose backtick span", () => {
  const corpus = [
    {
      file: "plugin/skills/foo/SKILL.md",
      content: 'Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/wrapped.sh" "<arg>"` to do the thing.\n',
    },
  ];
  assert.deepEqual(execBitViolations("plugin/scripts/wrapped.sh", "100644", corpus), []);
});

test("self-check: execBitViolations fires on a script invoked bare only from a fragment file (100644, DoD.5)", () => {
  const corpus = [
    {
      file: "plugin/skills/foo/fragments/issues-input.true.md",
      content: 'run "${CLAUDE_PLUGIN_ROOT}/scripts/issue-facts.sh" "<argument>"\n',
    },
  ];
  const violations = execBitViolations("plugin/scripts/issue-facts.sh", "100644", corpus);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /invoked bare at plugin\/skills\/foo\/fragments\/issues-input\.true\.md:1 but git mode is 100644/);
});

test("self-check: fragmentCallViolations fires on a call whose name has no fragment file for any valid value of its key (DoD.1)", () => {
  const content = '```!\n"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" github.issues "${CLAUDE_SKILL_DIR}" issues-ghost\n```\n';
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", content, []);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /SKILL\.md:2: switch-text\.sh call names fragment 'issues-ghost' with no file for any value of key 'github\.issues'/);
});

test("self-check: fragmentCallViolations fires on a call naming a flat switch key outside its group (DoD.2)", () => {
  const content = '```!\n"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" memory "${CLAUDE_SKILL_DIR}" memory\n```\n';
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", content, ["memory.true.md"]);
  assert.deepEqual(violations, [
    "plugin/skills/foo/SKILL.md:2: switch-text.sh call names unknown key 'memory'",
    "plugin/skills/foo/fragments/memory.true.md: called by no SKILL.md of its own skill",
  ]);
});

test("self-check: fragmentCallViolations fires on a call naming a key outside the switches and branching.mode (DoD.2)", () => {
  const content = '```!\n"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" bogus "${CLAUDE_SKILL_DIR}" issues-input\n```\n';
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", content, []);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /SKILL\.md:2: switch-text\.sh call names unknown key 'bogus'/);
});

test("self-check: fragmentCallViolations fires on a fragment file whose value suffix is invalid for the key its calls name (DoD.3)", () => {
  const content = '```!\n"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" github.issues "${CLAUDE_SKILL_DIR}" issues-input\n```\n';
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", content, [
    "issues-input.true.md",
    "issues-input.allowed.md",
  ]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /plugin\/skills\/foo\/fragments\/issues-input\.allowed\.md: value 'allowed' is not valid for key 'github\.issues'/);
});

test("self-check: fragmentCallViolations fires on a fragment file no SKILL.md of its own skill calls (DoD.4)", () => {
  const content = "# foo\n\nno preloads here.\n";
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", content, ["issues-input.true.md"]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /plugin\/skills\/foo\/fragments\/issues-input\.true\.md: called by no SKILL\.md of its own skill/);
});

test("self-check: fragmentCallViolations accepts a final-review call with a .true.md fragment for it (DoD.5)", () => {
  const content = '```!\n"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.final-review "${CLAUDE_SKILL_DIR}" final-review\n```\n';
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", content, ["final-review.true.md"]);
  assert.deepEqual(violations, []);
});

test("self-check: fragmentCallViolations accepts a baseline-tests call with a .fast.md fragment for it", () => {
  const content = '```!\n"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.baseline-tests "${CLAUDE_SKILL_DIR}" baseline-run\n```\n';
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", content, ["baseline-run.fast.md"]);
  assert.deepEqual(violations, []);
});

test("self-check: fragmentCallViolations accepts a build.extensions call with off and on fragments", () => {
  const content = '```!\n"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.extensions "${CLAUDE_SKILL_DIR}" extensions\n```\n';
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", content, ["extensions.off.md", "extensions.on.md"]);
  assert.deepEqual(violations, []);
});

test("self-check: fragmentCallViolations fires on a build.extensions fragment named serial (no longer an extension state)", () => {
  const content = '```!\n"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.extensions "${CLAUDE_SKILL_DIR}" extensions\n```\n';
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", content, ["extensions.on.md", "extensions.serial.md"]);
  assert.deepEqual(violations, [
    "plugin/skills/foo/fragments/extensions.serial.md: value 'serial' is not valid for key 'build.extensions'",
  ]);
});

test("self-check: fragmentCallViolations fires on a build.extensions fragment whose value is true (not an extension state)", () => {
  const content = '```!\n"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.extensions "${CLAUDE_SKILL_DIR}" extensions\n```\n';
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", content, ["extensions.on.md", "extensions.true.md"]);
  assert.deepEqual(violations, [
    "plugin/skills/foo/fragments/extensions.true.md: value 'true' is not valid for key 'build.extensions'",
  ]);
});

test("self-check: fragmentCallViolations does not fire when every call resolves and every fragment file is called", () => {
  const content = [
    '```!',
    '"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" github.issues "${CLAUDE_SKILL_DIR}" issues-input',
    '```',
    '```!',
    '"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching',
    '```',
    '',
  ].join("\n");
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", content, [
    "issues-input.true.md",
    "issues-input.false.md",
    "branching.allowed.md",
  ]);
  assert.deepEqual(violations, []);
});

test("self-check: fragmentCallViolations counts a call in a skill's part file as a call of that skill (a fragment called only there is not reported)", () => {
  const part = {
    file: "plugin/skills/foo/parts/close.md",
    content: '```!\n"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.memory "${CLAUDE_SKILL_DIR}" memory\n```\n',
  };
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", "# foo\n", ["memory.true.md"], [part]);
  assert.deepEqual(violations, []);
});

test("self-check: fragmentCallViolations reports an unknown key in a part file's call with the part file's path and line", () => {
  const part = {
    file: "plugin/skills/foo/parts/close.md",
    content: 'text\n"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" bogus "${CLAUDE_SKILL_DIR}" memory\n',
  };
  const violations = fragmentCallViolations("plugin/skills/foo/SKILL.md", "# foo\n", [], [part]);
  assert.deepEqual(violations, ["plugin/skills/foo/parts/close.md:2: switch-text.sh call names unknown key 'bogus'"]);
});

test("self-check: skillPartFiles finds the parts/*.md of every skill through the directory read, not the git index", () => {
  const tree: Record<string, string[]> = { "plugin/skills/foo/parts": ["close.md", "notes.txt", "open.md"] };
  const found = skillPartFiles(["plugin/skills/foo/SKILL.md", "plugin/skills/bar/SKILL.md"], (dir) => tree[dir] ?? []);
  assert.deepEqual(found, ["plugin/skills/foo/parts/close.md", "plugin/skills/foo/parts/open.md"]);
});

test("self-check: preloadQuotingSweep checks every fenced ! block of a part file", () => {
  const part = {
    file: "plugin/skills/foo/parts/close.md",
    content: ['```!', 'sh "${CLAUDE_PLUGIN_ROOT}/scripts/a.sh" ?one', '```', 'prose', '```!', 'sh "${CLAUDE_PLUGIN_ROOT}/scripts/b.sh" *two', '```', ''].join("\n"),
  };
  const violations = preloadQuotingSweep([part]);
  assert.equal(violations.length, 2, violations.join("\n"));
  assert.match(violations[0], /parts\/close\.md:2: unquoted '\?'/);
  assert.match(violations[1], /parts\/close\.md:6: unquoted '\*'/);
});

test("self-check: the exec-bit corpus includes every part file", () => {
  const files = execBitCorpusFiles({
    skillMdFiles: ["plugin/skills/foo/SKILL.md"],
    hooksJsonFiles: ["plugin/hooks/hooks.json"],
    fragmentFiles: ["plugin/skills/foo/fragments/a.true.md"],
    partFiles: ["plugin/skills/foo/parts/close.md"],
  });
  assert.ok(files.includes("plugin/skills/foo/parts/close.md"), files.join("\n"));
});

// ---------------------------------------------------------------------------
// The real sweep - every shipped script, enumerated from the git index.
// ---------------------------------------------------------------------------

interface IndexEntry {
  mode: string;
  repoRelativePath: string;
}

/** Synchronous on purpose: the corpus is read once, at load, before any case
 *  registers, and a read-only git query needs none of runScript's plumbing. */
function git(args: string[], cwd?: string) {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? String(result.error) };
}

function repoRoot(): string {
  const result = git(["rev-parse", "--show-toplevel"]);
  if (result.status !== 0) throw new Error(`git rev-parse --show-toplevel failed: ${result.stderr}`);
  return result.stdout.trim();
}

function listIndexed(root: string, pathspecs: string[]): IndexEntry[] {
  const result = git(["ls-files", "-s", "--", ...pathspecs], root);
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`);
  return result.stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      // "<mode> <sha> <stage>\t<path>"
      const [meta, repoRelativePath] = line.split("\t");
      const mode = meta.split(" ")[0];
      return { mode, repoRelativePath };
    });
}

const root = repoRoot();
// `docs/` holds archived, never-shipped plugin sources (docs/archive/) - out of scope.
const shipped = (p: string): boolean => !p.startsWith("docs/");
const shippedScripts = listIndexed(root, ["*.sh", "*.ts"]).filter(
  (entry) => !entry.repoRelativePath.startsWith("tests/") && shipped(entry.repoRelativePath),
);
const skillMdFiles = listIndexed(root, ["*.md"])
  .map((entry) => entry.repoRelativePath)
  .filter((p) => path.basename(p) === "SKILL.md" && shipped(p));
const hooksJsonFiles = listIndexed(root, ["hooks.json"])
  .map((entry) => entry.repoRelativePath)
  .filter(shipped);
// Every fragment file (`<plugin>/skills/<name>/fragments/<basename>.md`): a
// switch-selected script call now lives only here, so the exec-bit corpus
// must widen to see it (DoD.5), and the fragment sweep below groups these
// basenames by their own skill directory (DoD.1-4).
const fragmentFiles = listIndexed(root, ["*/fragments/*.md"])
  .map((entry) => entry.repoRelativePath)
  .filter(shipped);
// Every `parts/*.md` beside an indexed SKILL.md, found on disk so a part file
// of a task in progress (not yet `git add`ed) is swept too.
const partFiles = skillPartFiles(skillMdFiles, (dir) => {
  const abs = path.join(root, dir);
  return fs.existsSync(abs) ? fs.readdirSync(abs) : [];
});
const fragmentBasenamesBySkillDir = new Map<string, string[]>();
for (const file of fragmentFiles) {
  const skillDir = path.dirname(path.dirname(file));
  const list = fragmentBasenamesBySkillDir.get(skillDir) ?? [];
  list.push(path.basename(file));
  fragmentBasenamesBySkillDir.set(skillDir, list);
}

test("every shipped script has a shebang (or is an exempt .ts module) and no CRLF line ending", () => {
  const violations: string[] = [];
  for (const { repoRelativePath } of shippedScripts) {
    const content = fs.readFileSync(path.join(root, repoRelativePath), "utf-8");
    violations.push(...shebangViolations(repoRelativePath, content));
    violations.push(...crlfViolations(repoRelativePath, content));
  }
  assert.equal(violations.length, 0, `portability violations:\n${violations.join("\n")}`);
});

test("every #!/bin/sh script contains no bash-only syntax", () => {
  const violations: string[] = [];
  for (const { repoRelativePath } of shippedScripts) {
    const content = fs.readFileSync(path.join(root, repoRelativePath), "utf-8");
    violations.push(...bashismViolations(repoRelativePath, content));
  }
  assert.equal(violations.length, 0, `bashism violations:\n${violations.join("\n")}`);
});

test("no shipped script depends on a GNU-only utility, gawk extension or bash 4 feature (it has to run on macOS too)", () => {
  const violations: string[] = [];
  for (const { repoRelativePath } of shippedScripts) {
    const content = fs.readFileSync(path.join(root, repoRelativePath), "utf-8");
    violations.push(...gnuismViolations(repoRelativePath, content));
  }
  assert.equal(violations.length, 0, `GNU-only constructs:\n${violations.join("\n")}`);
});

test("every script invoked bare from a SKILL.md/hooks.json/fragment/part line carries the 100755 exec bit", () => {
  const corpus = execBitCorpusFiles({ skillMdFiles, hooksJsonFiles, fragmentFiles, partFiles }).map((file) => ({
    file,
    // hooks.json escapes its embedded quotes (\") - unescape so the same
    // literal-substring search used for SKILL.md prose applies unchanged.
    content: fs.readFileSync(path.join(root, file), "utf-8").replace(/\\"/g, '"'),
  }));
  const violations: string[] = [];
  for (const { mode, repoRelativePath } of shippedScripts) {
    violations.push(...execBitViolations(repoRelativePath, mode, corpus));
  }
  assert.equal(violations.length, 0, `exec-bit violations:\n${violations.join("\n")}`);
});

test("every SKILL.md and part file ! preload quotes its glob-bearing arguments and double-quotes its plugin/skill-root variables", () => {
  const corpus = [...skillMdFiles, ...partFiles].map((file) => ({
    file,
    content: fs.readFileSync(path.join(root, file), "utf-8"),
  }));
  const violations = preloadQuotingSweep(corpus);
  assert.equal(violations.length, 0, `preload quoting violations:\n${violations.join("\n")}`);
});

test("every switch-text.sh call names a fragment file that exists, a known key, and every fragment file is called by its own skill (DoD.6)", () => {
  const violations: string[] = [];
  for (const file of skillMdFiles) {
    const content = fs.readFileSync(path.join(root, file), "utf-8");
    const skillDir = path.dirname(file);
    const fragmentBasenames = fragmentBasenamesBySkillDir.get(skillDir) ?? [];
    const skillParts = partFiles
      .filter((part) => path.dirname(path.dirname(part)) === skillDir)
      .map((part) => ({ file: part, content: fs.readFileSync(path.join(root, part), "utf-8") }));
    violations.push(...fragmentCallViolations(file, content, fragmentBasenames, skillParts));
  }
  assert.equal(violations.length, 0, `fragment-call violations:\n${violations.join("\n")}`);
});

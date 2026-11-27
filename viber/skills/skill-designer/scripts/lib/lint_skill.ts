/*
 * lint_skill.ts - the skill lint core: holds a skill directory or one skill or
 * agent file to the platform caps and the style rules of skill-designer, and
 * reports each break as a FAIL or a WARN line. The contract and the rule list
 * live in the header of ../lint_skill.ts.
 */

import { byteOrder } from "./byte-order.ts";
import type { Fs } from "./ports.ts";

export interface LintSkillResult {
  stdout: string;
  stderr: string;
  exit: number;
}

const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{263F}\u{2680}-\u{26BF}\u{2700}-\u{27BF}]/u;
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const TABLE = /^\s*\|/;
const FENCE = /^\s*(```|~~~)/;
const STAR_ITALICS = /(^|[^*\p{L}\p{N}])\*[^* ][^*]*[^* ]\*([^*\p{L}\p{N}]|$)/u;
const UNDERSCORE_ITALICS = /(^|\s)_[^_ ][^_]*[^_ ]_([\s\p{P}\p{S}]|$)/u;
const MEMORY_READ = /(read|load|check|consult)[^.]*CLAUDE\.md/i;
const FOREIGN_REPO = /(host|target|audited|under audit|repo you were given)/i;
const SHOUT = /\b(MUST|NEVER|ALWAYS|CRITICAL|IMPORTANT)\b/g;
const HEDGE = /(^|[^"])\b(try to|if possible|feel free to|you might want to|you may want to|please)\b/gi;
const NARRATIVE = /(you are (invoked|called|spawned) by|is (invoked|called) by the|as part of the .* pipeline|the caller (passes|sends|gives))/i;
const EXTERNAL_TOOL = /(^|[\s|;(])(jq|bc)(\s|$)/;
const WHEN_CUE = /(use (this|it|when|whenever)|invoke|trigger|whenever)/i;
const FIRST_PERSON = /(^|[^\p{L}\p{N}_/])I('m)?([\s,.;:!?]|$)/u;
const SECOND_PERSON = /(^|[^\p{L}\p{N}_])your?([^\p{L}\p{N}_]|$)/iu;

/** The lines of a text, a carriage return at a line end dropped, so a CRLF file reads as its LF copy. */
const linesOf = (text: string): string[] => text.split("\n").map((line) => line.replace(/\r$/, ""));
/** What `wc -l` counts. */
const newlines = (text: string): number => text.split("\n").length - 1;
const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
const dirName = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) || "/" : ".");
/** The value of the first `<key>:` line of the frontmatter, quotes dropped. */
const valueOf = (frontmatter: string[], key: string): string => (frontmatter.find((line) => line.startsWith(`${key}:`)) ?? "").slice(key.length + 1).trimStart().replace(/["']/g, "");

/** The description of a frontmatter: its own line, or a block scalar continued on the indented lines below. */
function descriptionOf(frontmatter: string[]): string {
  let text = "";
  let open = false;
  for (const line of frontmatter) {
    if (line.startsWith("description:")) {
      const value = line.slice("description:".length).trimStart();
      text += /^[>|]/.test(value) ? "" : value;
      open = true;
    } else if (open && /^\s+\S/.test(line)) {
      text += ` ${line.trimStart()}`;
    } else {
      open = false;
    }
  }
  return text.replace(/^ /, "");
}

/** The lines outside fenced blocks, code spans and call patterns such as `Bash(node:*)` removed: a star or an underscore there is literal text. */
function proseOf(lines: string[]): string[] {
  const prose: string[] = [];
  let fenced = false;
  for (const line of lines) {
    if (FENCE.test(line)) fenced = !fenced;
    else if (!fenced) prose.push(line.replace(/`[^`]*`/g, "").replace(/[\p{L}\p{N}_]+\([^()]*\)/gu, ""));
  }
  return prose;
}

/** "" when the table of contents in the first 40 lines matches the `##` headings both ways, "NOTOC" without one, else the mismatch text. */
function tocProblem(lines: string[]): string {
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").replace(/^ /, "").replace(/ $/, "");
  const starts = (entry: string, heading: string): boolean => entry === heading || (entry.startsWith(heading) && !/[\p{L}\p{N}]/u.test(entry.charAt(heading.length)));
  const headings: string[] = [];
  const entries: string[] = [];
  let fenced = false;
  let found = false;
  let inToc = false;
  lines.forEach((line, index) => {
    const head = index < 40;
    if (FENCE.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    if (line.startsWith("#")) {
      const title = line.replace(/^#+\s*/, "").replace(/[\s#]*$/, "");
      if (head && !found && /^(table of )?contents$/.test(norm(title))) {
        found = true;
        inToc = true;
        return;
      }
      inToc = false;
      if (/^##[^#]/.test(line)) headings.push(title);
      return;
    }
    if (head && (inToc || /^[-*+]\s+\[[^\]]*\]\(#/.test(line)) && /^([-*+]|[0-9]+\.)\s/.test(line)) {
      found = true;
      const item = line.replace(/^([-*+]|[0-9]+\.)\s+/, "");
      const close = item.indexOf("]");
      entries.push(item.startsWith("[") ? item.slice(1, close < 0 ? undefined : close) : item);
    }
    if (head && line.toLowerCase().includes("table of contents")) found = true;
  });
  if (!found) return "NOTOC";
  const missing = headings.filter((heading) => !entries.some((entry) => starts(norm(entry), norm(heading))));
  const dead = entries.filter((entry) => !headings.some((heading) => starts(norm(entry), norm(heading))));
  return [missing.length > 0 ? ` missing: ${missing.join(", ")}` : "", dead.length > 0 ? ` not a heading: ${dead.join(", ")}` : ""].filter((part) => part !== "").join(";");
}

/** Every regular `.md` file below dir, a directory before the files after it in byte order; a link is neither listed nor followed. */
function markdownBelow(dir: string, fs: Fs): string[] {
  const real = fs.realPath(dir);
  const found: string[] = [];
  for (const name of fs.listDir(dir).sort(byteOrder)) {
    const path = `${dir}/${name}`;
    // A link is the one entry whose real path is not its directory's real path plus its own name.
    if (real === null || fs.realPath(path) !== `${real.replace(/\/$/, "")}/${name}`) continue;
    const kind = fs.kind(path);
    if (kind === "dir") found.push(...markdownBelow(path, fs));
    else if (kind === "file" && name.endsWith(".md")) found.push(path);
  }
  return found;
}

/** The regular files of a directory a `*<suffix>` glob names: no name opening with a dot, in byte order. */
function globbed(dir: string, suffix: string, fs: Fs): string[] {
  return fs
    .listDir(dir)
    .filter((name) => !name.startsWith(".") && name.endsWith(suffix) && fs.kind(`${dir}/${name}`) === "file")
    .sort(byteOrder)
    .map((name) => `${dir}/${name}`);
}

/** The stdout, stderr and exit code of one lint call. Never throws. */
export function runLintSkill(argv: string[], ports: { fs: Fs }): LintSkillResult {
  const { fs } = ports;
  const target = argv[0] ?? "";
  if (target === "") return { stdout: "", stderr: "usage: lint_skill.sh <skill-dir | file.md>\n", exit: 2 };

  const out: string[] = [];
  let fails = 0;
  let warns = 0;
  const fail = (message: string): void => {
    out.push(`FAIL ${message}`);
    fails += 1;
  };
  const warn = (message: string): void => {
    out.push(`WARN ${message}`);
    warns += 1;
  };
  const done = (): LintSkillResult => ({ stdout: [...out, `FAIL=${fails} WARN=${warns}`].map((line) => `${line}\n`).join(""), stderr: "", exit: fails === 0 ? 0 : 1 });

  // A directory, or a file named SKILL.md, is swept whole; any other file is linted alone.
  let main = target;
  let sweep = "";
  if (fs.kind(target) === "dir") {
    sweep = target.length > 1 ? target.replace(/\/+$/, "") : target;
    main = `${sweep}/SKILL.md`;
    if (fs.kind(main) !== "file") {
      fail(`${target}: SKILL.md missing`);
      return done();
    }
  } else if (fs.kind(main) !== "file") {
    fail(`${target}: file not found`);
    return done();
  } else if (baseName(main) === "SKILL.md") {
    sweep = dirName(main);
  }

  const mainText = fs.readText(main) ?? "";
  const mainLines = linesOf(mainText);
  let bodyStart = 1;
  let frontmatter: string[] | null = null;
  if (mainLines[0] !== "---") {
    fail(`${main}: no YAML frontmatter`);
  } else {
    const close = mainLines.findIndex((line, index) => index > 0 && /^---\s*$/.test(line));
    if (close < 0) {
      fail(`${main}: frontmatter not closed`);
    } else {
      frontmatter = mainLines.slice(1, close);
      bodyStart = close + 2;
    }
  }

  if (frontmatter !== null) {
    const name = valueOf(frontmatter, "name");
    if (name === "") {
      fail(`${main}: frontmatter missing name`);
    } else {
      const chars = [...name].length;
      if (chars > 64) fail(`${main}: name has ${chars} chars, the platform caps it at 64`);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) fail(`${main}: name '${name}' must be lowercase letters, digits and single hyphens`);
      if (/(anthropic|claude)/i.test(name)) warn(`${main}: name '${name}' uses a reserved word (anthropic, claude)`);
    }
    const description = descriptionOf(frontmatter);
    if (description === "") {
      fail(`${main}: frontmatter missing description`);
    } else {
      const chars = [...description].length;
      if (chars > 1024) fail(`${main}: description has ${chars} chars, the platform truncates past 1024 and the trigger words in the tail are lost`);
      else if (chars > 800) warn(`${main}: description has ${chars} chars, approaching the 1024 limit`);
      if (/[<>]/.test(description)) fail(`${main}: description contains an angle bracket, XML tags are rejected`);
      const words = description.split(/[ \t\n\v\f\r]+/).filter((word) => word !== "").length;
      if (words < 15) warn(`${main}: description has ${words} words, add what it does and when to trigger`);
      if (words > 120) warn(`${main}: description has ${words} words, metadata should stay around 100`);
      // A skill hidden from the user is entered by its caller's own instruction, so it needs no when-to-use cue.
      if (valueOf(frontmatter, "user-invocable").replaceAll(" ", "") !== "false" && !WHEN_CUE.test(description)) warn(`${main}: description has no explicit when-to-use cue`);
      if (FIRST_PERSON.test(description) || SECOND_PERSON.test(description)) warn(`${main}: description uses I or you, write it in the third person`);
    }
  }

  const bodyLines = newlines(mainText) - bodyStart + 1;
  if (bodyLines > 500) fail(`${main}: body has ${bodyLines} lines (limit 500), move detail to references/`);
  else if (bodyLines > 400) warn(`${main}: body has ${bodyLines} lines, approaching the 500 limit`);

  const checkFile = (file: string): void => {
    const text = fs.readText(file) ?? "";
    const lines = linesOf(text);
    const count = (pattern: RegExp): number => lines.reduce((sum, line) => sum + [...line.matchAll(pattern)].length, 0);
    if (EMOJI.test(text)) fail(`${file}: emoji found`);
    if (DASH.test(text)) fail(`${file}: em/en dash found, use plain hyphen`);
    if (lines.some((line) => TABLE.test(line))) fail(`${file}: markdown table found`);
    const prose = proseOf(lines);
    if (prose.some((line) => STAR_ITALICS.test(line))) warn(`${file}: possible italics with *...*`);
    if (prose.some((line) => UNDERSCORE_ITALICS.test(line))) warn(`${file}: possible italics with _..._`);
    // A read of a repository the worker was pointed at is correct; only a line naming no such repository warns.
    if (lines.some((line) => MEMORY_READ.test(line) && !FOREIGN_REPO.test(line))) warn(`${file}: names a CLAUDE.md read, the harness injects the worker's own project memory`);
    const shouts = count(SHOUT);
    if (shouts > 5) warn(`${file}: ${shouts} all-caps directives, replace with a short why`);
    const hedges = count(HEDGE);
    if (hedges > 0) warn(`${file}: ${hedges} hedged phrases (try to, if possible, please...), state the rule in the imperative`);
    if (lines.some((line) => NARRATIVE.test(line))) warn(`${file}: caller narrative cue in body, keep routing in description: only`);
    if (lines.some((line) => EXTERNAL_TOOL.test(line))) warn(`${file}: uses jq or bc, keep to clean bash`);
  };
  if (sweep === "") checkFile(main);
  else for (const file of markdownBelow(sweep, fs)) checkFile(file);

  if (sweep !== "" && fs.kind(`${sweep}/scripts`) === "dir") {
    for (const script of globbed(`${sweep}/scripts`, "", fs)) {
      if (baseName(script) === "lint_skill.sh") continue;
      if (linesOf(fs.readText(script) ?? "").some((line) => EXTERNAL_TOOL.test(line))) warn(`${script}: uses jq or bc, keep to clean bash`);
      if (script.endsWith(".sh") && !fs.executable(script)) warn(`${script}: not executable`);
    }
  }

  if (sweep !== "" && fs.kind(`${sweep}/references`) === "dir") {
    // A fragment is preloaded into the body, so a pointer there counts as one in the main file.
    const pointers = [mainText, ...globbed(`${dirName(main)}/fragments`, ".md", fs).map((file) => fs.readText(file) ?? "")];
    for (const reference of globbed(`${sweep}/references`, ".md", fs)) {
      const text = fs.readText(reference) ?? "";
      const size = newlines(text);
      const problem = size > 100 ? tocProblem(linesOf(text)) : "";
      const report = size > 300 ? fail : warn;
      if (problem === "NOTOC") report(`${reference}: ${size} lines without a table of contents${size > 300 ? "" : ", partial reads see only the head"}`);
      else if (problem !== "") report(`${reference}: table of contents does not match its ## headings -${problem}`);
      if (!pointers.some((pointer) => pointer.includes(baseName(reference)))) warn(`${reference}: not referenced from ${baseName(main)} or its fragments`);
    }
  }
  return done();
}

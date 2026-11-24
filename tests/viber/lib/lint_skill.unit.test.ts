/*
 * lint_skill.unit.test.ts - the skill lint core on a fake file system: a skill
 * directory or one skill or agent file is held to the platform caps and the
 * style rules of skill-designer, each break one `FAIL` or `WARN` line, then
 * always `FAIL=<n> WARN=<m>`; the exit is 1 with a FAIL line, 2 with no
 * argument, else 0.
 *
 * The cases pin what an author relies on: a CR LF file lints like its LF copy
 * (a carriage return on the opener must not read as missing frontmatter), a
 * file target never reports a sibling, every rule fires on the text it names
 * and stays silent on the look-alikes beside it (bold, a glob star, a quoted
 * hedge, a read of a foreign repository's memory), and the table of contents
 * of a long reference is matched against its `##` headings both ways.
 *
 * The wrapper is run as a process by tests/viber/lint_skill.critical.test.ts;
 * the lint job runs it over every shipped skill and agent
 * (.github/scripts/lint-skills.sh).
 */

import assert from "node:assert/strict";
import { fakeFs, type FakeFsOpts } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runLintSkill } from "../../../viber/lib/lint_skill.ts";

const DIR = "/s";
const MAIN = `${DIR}/SKILL.md`;
const DESCRIPTION = "Summarizes a changelog into release notes for a project. Use when the user asks for release notes or a changelog digest.";
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const CHECK_MARK = String.fromCharCode(0x2714);
const ROCKET = "\u{1F680}";

/** A SKILL.md with the given frontmatter lines and body. */
const skill = (frontmatter: string[], body = "# Sample skill\n\nRead the changelog and write the notes.\n"): string => ["---", ...frontmatter, "---", "", body].join("\n");
/** A valid SKILL.md, the body lines appended to it. */
const valid = (...body: string[]): string => skill(["name: sample-skill", `description: ${DESCRIPTION}`], body.map((line) => `${line}\n`).join(""));
const filler = (n: number): string => Array.from({ length: n }, (_, i) => `Line ${i}.\n`).join("");
const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

/** files: a path below the skill directory to its text. The report lines are returned without the directory prefix and the count line. */
function lint(files: Record<string, string>, target = DIR, opts: FakeFsOpts = {}) {
  const seeded = Object.fromEntries(Object.entries(files).map(([rel, text]) => [`${DIR}/${rel}`, text]));
  const result = runLintSkill([target], { fs: fakeFs(seeded, opts) });
  const lines = result.stdout.split("\n").filter((line) => line !== "");
  return { ...result, counts: lines.at(-1), reports: lines.slice(0, -1).map((line) => line.replace(`${DIR}/`, "")) };
}

test("a valid SKILL.md with LF endings prints FAIL=0 WARN=0 and exits 0", () => {
  assert.deepEqual(runLintSkill([MAIN], { fs: fakeFs({ [MAIN]: valid() }) }), { stdout: "FAIL=0 WARN=0\n", stderr: "", exit: 0 });
});

test("the CRLF copy of a valid SKILL.md prints FAIL=0 WARN=0 and exits 0 (a carriage return on the opener must not read as missing frontmatter)", () => {
  const result = lint({ "SKILL.md": valid().replace(/\n/g, "\r\n") });
  assert.deepEqual([result.stdout, result.exit], ["FAIL=0 WARN=0\n", 0]);
});

test("a SKILL.md with no frontmatter still reports no YAML frontmatter and exits 1", () => {
  const result = lint({ "SKILL.md": "# Sample skill\n\nRead the changelog and write the notes.\n" });
  assert.deepEqual([result.reports, result.counts, result.exit], [["FAIL SKILL.md: no YAML frontmatter"], "FAIL=1 WARN=0", 1]);
});

test("no argument prints the usage on stderr, nothing on stdout, and exits 2", () => {
  assert.deepEqual(runLintSkill([], { fs: fakeFs({}) }), { stdout: "", stderr: "usage: lint_skill.sh <skill-dir | file.md>\n", exit: 2 });
});

test("a directory holding no SKILL.md and a path naming nothing each report one FAIL and exit 1", () => {
  const missing = lint({ "readme.txt": "x\n" });
  const absent = lint({ "readme.txt": "x\n" }, `${DIR}/nope.md`);
  assert.deepEqual([missing.stdout, missing.exit], [`FAIL ${DIR}: SKILL.md missing\nFAIL=1 WARN=0\n`, 1]);
  assert.deepEqual([absent.stdout, absent.exit], [`FAIL ${DIR}/nope.md: file not found\nFAIL=1 WARN=0\n`, 1]);
});

test("a frontmatter never closed is reported, and its name and description are not looked for", () => {
  assert.deepEqual(lint({ "SKILL.md": "---\nname: x\n\nBody.\n" }).reports, ["FAIL SKILL.md: frontmatter not closed"]);
});

test("a frontmatter holding neither a name nor a description reports both, an empty one included", () => {
  const expected = ["FAIL SKILL.md: frontmatter missing name", "FAIL SKILL.md: frontmatter missing description"];
  assert.deepEqual([lint({ "SKILL.md": skill(["model: x"]) }).reports, lint({ "SKILL.md": "---\n---\nBody.\n" }).reports], [expected, expected]);
});

const NAME_ROWS: Array<{ label: string; name: string; reports: string[] }> = [
  { label: "an upper-case letter and an underscore", name: "Bad_Name", reports: ["FAIL SKILL.md: name 'Bad_Name' must be lowercase letters, digits and single hyphens"] },
  { label: "a doubled hyphen", name: "double--hyphen", reports: ["FAIL SKILL.md: name 'double--hyphen' must be lowercase letters, digits and single hyphens"] },
  { label: "65 characters", name: "a".repeat(65), reports: ["FAIL SKILL.md: name has 65 chars, the platform caps it at 64"] },
  { label: "a reserved word", name: "my-claude-helper", reports: ["WARN SKILL.md: name 'my-claude-helper' uses a reserved word (anthropic, claude)"] },
  { label: "64 characters in quotes", name: `"${"a".repeat(64)}"`, reports: [] },
];

for (const row of NAME_ROWS) {
  test(`a name of ${row.label} reports ${row.reports.length === 0 ? "nothing" : row.reports[0].slice(0, 4)}`, () => {
    assert.deepEqual(lint({ "SKILL.md": skill([`name: ${row.name}`, `description: ${DESCRIPTION}`]) }).reports, row.reports);
  });
}

const DESCRIPTION_ROWS: Array<{ label: string; lines: string[]; reports: string[] }> = [
  { label: "1025 characters", lines: [`description: Use when ${"x".repeat(1016)}`], reports: ["FAIL SKILL.md: description has 1025 chars, the platform truncates past 1024 and the trigger words in the tail are lost", "WARN SKILL.md: description has 3 words, add what it does and when to trigger"] },
  { label: "801 characters", lines: [`description: Trigger ${words(14)} ${"y".repeat(801 - `Trigger ${words(14)} `.length)}`], reports: ["WARN SKILL.md: description has 801 chars, approaching the 1024 limit"] },
  { label: "an angle bracket", lines: [`description: ${DESCRIPTION} <tag>`], reports: ["FAIL SKILL.md: description contains an angle bracket, XML tags are rejected"] },
  { label: "14 words", lines: [`description: Use when ${words(12)}`], reports: ["WARN SKILL.md: description has 14 words, add what it does and when to trigger"] },
  { label: "121 words", lines: [`description: Use when ${Array(119).fill("ab").join(" ")}`], reports: ["WARN SKILL.md: description has 121 words, metadata should stay around 100"] },
  { label: "no when-to-use cue", lines: [`description: ${DESCRIPTION.replace("Use when", "Runs once")}`], reports: ["WARN SKILL.md: description has no explicit when-to-use cue"] },
  { label: "no when-to-use cue on a skill hidden from the user", lines: [`description: ${DESCRIPTION.replace("Use when", "Runs once")}`, 'user-invocable: "false"'], reports: [] },
  { label: "the first person", lines: [`description: ${DESCRIPTION} I'm fast.`], reports: ["WARN SKILL.md: description uses I or you, write it in the third person"] },
  { label: "the second person", lines: [`description: ${DESCRIPTION.replace("the user asks", "your team asks")}`], reports: ["WARN SKILL.md: description uses I or you, write it in the third person"] },
  { label: "i.e., I/O and youth, which are no person", lines: [`description: ${DESCRIPTION} Covers I/O, i.e. youth files.`], reports: [] },
  { label: "a block scalar continued on indented lines", lines: ["description: >", "  Summarizes a changelog into release notes for a project.", "  Use when the user asks for release notes or a changelog digest.", "model: x"], reports: [] },
];

for (const row of DESCRIPTION_ROWS) {
  test(`a description of ${row.label} reports ${row.reports.length === 0 ? "nothing" : row.reports.map((line) => line.slice(0, 4)).join(" and ")}`, () => {
    assert.deepEqual(lint({ "SKILL.md": skill(["name: sample-skill", ...row.lines]) }).reports, row.reports);
  });
}

test("a body of 401 lines warns, one of 501 fails, one of 400 passes (the frontmatter lines never count)", () => {
  const body = (n: number): string => skill(["name: sample-skill", `description: ${DESCRIPTION}`], filler(n - 1));
  assert.deepEqual(
    [lint({ "SKILL.md": body(400) }).reports, lint({ "SKILL.md": body(401) }).reports, lint({ "SKILL.md": body(501) }).reports],
    [[], ["WARN SKILL.md: body has 401 lines, approaching the 500 limit"], ["FAIL SKILL.md: body has 501 lines (limit 500), move detail to references/"]],
  );
});

const CONTENT_ROWS: Array<{ label: string; body: string[]; reports: string[] }> = [
  { label: "an emoji past U+FFFF", body: [`Go ${ROCKET} now.`], reports: ["FAIL SKILL.md: emoji found"] },
  { label: "a check mark symbol", body: [`Done ${CHECK_MARK}.`], reports: ["FAIL SKILL.md: emoji found"] },
  { label: "an em dash", body: [`One ${EM_DASH} two.`], reports: ["FAIL SKILL.md: em/en dash found, use plain hyphen"] },
  { label: "an en dash", body: [`Pages 1${EN_DASH}2.`], reports: ["FAIL SKILL.md: em/en dash found, use plain hyphen"] },
  { label: "a table row, indented or inside a fence", body: ["```", "  | a | b |", "```"], reports: ["FAIL SKILL.md: markdown table found"] },
  { label: "star italics", body: ["This is *really important* text."], reports: ["WARN SKILL.md: possible italics with *...*"] },
  { label: "underscore italics", body: ["This is _also this_ one."], reports: ["WARN SKILL.md: possible italics with _..._"] },
  { label: "a read of the project memory", body: ["First, read the CLAUDE.md of the project."], reports: ["WARN SKILL.md: names a CLAUDE.md read, the harness injects the worker's own project memory"] },
  { label: "six all-caps directives", body: ["MUST NEVER ALWAYS CRITICAL IMPORTANT MUST do it."], reports: ["WARN SKILL.md: 6 all-caps directives, replace with a short why"] },
  { label: "three hedged phrases on two lines", body: ["Please try to do it.", "Stop if possible."], reports: ["WARN SKILL.md: 3 hedged phrases (try to, if possible, please...), state the rule in the imperative"] },
  { label: "a caller narrative cue", body: ["You are invoked by the planner."], reports: ["WARN SKILL.md: caller narrative cue in body, keep routing in description: only"] },
  { label: "a jq call", body: ["result | jq ."], reports: ["WARN SKILL.md: uses jq or bc, keep to clean bash"] },
  { label: "bold, a snake_case name, a product, a glob star and a list", body: ["A **bold** word, a snake_case_name, 2 * 3 * 4, a*b*c and a glob *.md here.", "* item one", "* item two"], reports: [] },
  { label: "stars and underscores inside a fence, a code span and a call pattern", body: ["```", "*not italics here* _x y_", "```", "Use `*code star*` and Bash(a *b* c) only."], reports: [] },
  { label: "a memory read of a foreign repository, and a line naming the file with no read verb before it", body: ["Consult the audited repo CLAUDE.md first.", "Load the notes. Then CLAUDE.md is skipped."], reports: [] },
  { label: "five all-caps directives beside MUSTARD", body: ["MUST NEVER ALWAYS CRITICAL IMPORTANT only five, MUSTARD apart."], reports: [] },
  { label: "a hedge inside quotes (a mention, not an instruction)", body: ['Never write "please" in a prompt.'], reports: [] },
  { label: "jquery, the abc tool and (jq) in brackets", body: ["The abc tool and jquery are fine; (jq) is fine."], reports: [] },
];

for (const row of CONTENT_ROWS) {
  test(`${row.label} in a file reports ${row.reports.length === 0 ? "nothing" : row.reports[0].slice(0, 4)}`, () => {
    assert.deepEqual(lint({ "SKILL.md": valid(...row.body) }).reports, row.reports);
  });
}

test("a file target lints that file and nothing else, a file named SKILL.md lints its whole directory", () => {
  const files = { "SKILL.md": valid(), "other.md": "Please stop.\n", "agent.md": valid("| a | b |") };
  const hedge = "WARN other.md: 1 hedged phrases (try to, if possible, please...), state the rule in the imperative";
  const table = "FAIL agent.md: markdown table found";
  assert.deepEqual([lint(files, `${DIR}/agent.md`).reports, lint(files, MAIN).reports, lint(files).reports], [[table], [table, hedge], [table, hedge]]);
});

test("a directory target reads every .md file below it, a directory before the files after it in byte order, and no other file", () => {
  const files = { "SKILL.md": valid(), "sub/deep/more.md": "| a |\n", "zeta.md": "| a |\n", "Alpha.md": "| a |\n", "sub/notes.txt": "| a |\n" };
  assert.deepEqual(lint(files).reports, ["FAIL Alpha.md: markdown table found", "FAIL sub/deep/more.md: markdown table found", "FAIL zeta.md: markdown table found"]);
});

test("a directory link below the skill directory is not followed (a link back to the directory would never end)", () => {
  const files = { "SKILL.md": valid(), "real/a.md": "| a |\n" };
  assert.deepEqual(lint(files, DIR, { links: { [`${DIR}/loop`]: DIR, [`${DIR}/alias`]: `${DIR}/real` } }).reports, ["FAIL real/a.md: markdown table found"]);
});

test("a script of scripts/ naming jq or bc warns, a .sh file with no exec bit warns, and lint_skill.sh and a name opening with a dot are left out", () => {
  const files = {
    "SKILL.md": valid(),
    "scripts/a.sh": "#!/bin/sh\necho a\n",
    "scripts/b.sh": "#!/bin/sh\necho b\n",
    "scripts/calc.txt": "echo 1+1 | bc\n",
    "scripts/tool.ts": "const x = 1;\n",
    "scripts/lint_skill.sh": "#!/bin/sh\njq .\n",
    "scripts/.hidden.sh": "#!/bin/sh\njq .\n",
  };
  assert.deepEqual(lint(files, DIR, { exec: [`${DIR}/scripts/b.sh`] }).reports, ["WARN scripts/a.sh: not executable", "WARN scripts/calc.txt: uses jq or bc, keep to clean bash"]);
});

test("the scripts and references of a directory are not swept for a file target that is no SKILL.md", () => {
  const files = { "agent.md": valid(), "scripts/a.sh": "jq .\n", "references/big.md": filler(150) };
  assert.deepEqual(lint(files, `${DIR}/agent.md`).reports, []);
});

const toc = (lines: string[], size: number): string => [...lines, ""].join("\n") + filler(size);

const REFERENCE_ROWS: Array<{ label: string; text: string; reports: string[] }> = [
  { label: "100 lines and no table of contents", text: filler(100), reports: [] },
  { label: "101 lines and no table of contents", text: filler(101), reports: ["WARN references/ref.md: 101 lines without a table of contents, partial reads see only the head"] },
  { label: "301 lines and no table of contents", text: filler(301), reports: ["FAIL references/ref.md: 301 lines without a table of contents"] },
  { label: "a Contents list matching its headings by their opening words", text: toc(["## Contents", "", "- Alpha part", "- Beta: the second", "1. Gamma", "", "## Alpha part", "## Beta", "## Gamma ##", "### Not counted", "```", "## fenced heading", "```"], 120), reports: [] },
  { label: "a link list with no Contents heading", text: toc(["- [One](#one)", "* [Two: more](#two)", "", "## One", "## Two"], 120), reports: [] },
  {
    label: "a list naming no heading and missing one, under 300 lines",
    text: toc(["## Table of Contents", "", "- Alpha", "- Ghost entry", "- Betamax", "", "## Alpha", "## Beta"], 120),
    reports: ["WARN references/ref.md: table of contents does not match its ## headings - missing: Beta; not a heading: Ghost entry, Betamax"],
  },
  {
    label: "a list missing a heading, past 300 lines",
    text: toc(["## Contents", "", "- Alpha", "", "## Alpha", "## Beta"], 300),
    reports: ["FAIL references/ref.md: table of contents does not match its ## headings - missing: Beta"],
  },
  { label: "a Contents heading past line 40", text: filler(45) + toc(["## Contents", "", "- One", "", "## One"], 80), reports: ["WARN references/ref.md: 130 lines without a table of contents, partial reads see only the head"] },
  { label: "the words table of contents in a sentence and no list", text: toc(["The table of contents is elsewhere.", "", "## One"], 120), reports: ["WARN references/ref.md: table of contents does not match its ## headings - missing: One"] },
];

for (const row of REFERENCE_ROWS) {
  test(`a reference of ${row.label} reports ${row.reports.length === 0 ? "nothing" : row.reports[0].slice(0, 4)}`, () => {
    assert.deepEqual(lint({ "SKILL.md": valid("See ref.md."), "references/ref.md": row.text }).reports, row.reports);
  });
}

test("a CR LF reference reports its mismatch with no carriage return inside the line", () => {
  const text = toc(["## Contents", "", "- Alpha", "- Ghost entry", "", "## Alpha", "## Beta"], 120).replace(/\n/g, "\r\n");
  assert.deepEqual(lint({ "SKILL.md": valid("See ref.md."), "references/ref.md": text }).reports, ["WARN references/ref.md: table of contents does not match its ## headings - missing: Beta; not a heading: Ghost entry"]);
});

test("a reference named by neither the main file nor a fragment warns, one a fragment names does not (a fragment is preloaded into the body)", () => {
  const files = { "SKILL.md": valid("See main.md."), "fragments/x.md": "Read frag.md when needed.\n", "references/main.md": "a\n", "references/frag.md": "b\n", "references/lost.md": "c\n", "references/notes.txt": "d\n" };
  assert.deepEqual(lint(files).reports, ["WARN references/lost.md: not referenced from SKILL.md or its fragments"]);
});

test("the count line sums every FAIL and WARN line and one FAIL makes the exit 1", () => {
  const result = lint({ "SKILL.md": valid("| a |", "Please stop.", `A dash ${EM_DASH}.`) });
  assert.deepEqual([result.reports.length, result.counts, result.exit], [3, "FAIL=2 WARN=1", 1]);
});

/*
 * qa-ledger.unit.test.ts - the qa-ledger core on a fake file system: the
 * scenario list a qa.e2e.md handoff gives the e2e skill, the e2e-writer
 * dispatch block of the next scenario to handle, the ASCII table report of
 * every scenario, and the refusals (exit 2, one `error:` line, empty stdout).
 *
 * The handoff grammar was awk text rules; each rule has its case here (the
 * carriage return and trailing blanks of a line, the section a line stands in,
 * the last state of an ID). A length counts code points, so a table of accented
 * text stays aligned. The backslash and drive-letter spellings of the handoff
 * and of the script path run here on every system.
 */

import assert from "node:assert/strict";
import { fakeFs, type FakeFsOpts } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runQaLedger, type QaLedgerResult } from "../../../viber/lib/qa-ledger.ts";

const DIR = "/run";
const FILE = `${DIR}/qa.e2e.md`;
const SCRIPT = "/plugins/viber/skills/e2e/scripts/qa-ledger.ts";
const REFS = "/plugins/viber/references";

const HEAD = [
  "Base: http://localhost:3000",
  "Launch: npm run dev",
  "Accounts: admin admin@example.test - vault",
  "",
  "## UI scenarios",
  "",
  "### QA-01 Sign in",
  "- Covers: AC1 A user signs in",
  "- Role: admin",
  "- Route: /login",
  "- Seed: none",
  "- Steps:",
  "  1. Open the login page",
  "- Assert: the dashboard shows",
  "- Files: src/login.tsx",
  "",
  "### QA-02 Create a project",
  "- Covers: AC2 A project is created",
  "",
  "### QA-03 Print an invoice",
  "- Covers: AC3 An invoice prints",
  "",
  "## API scenarios",
  "",
  "### QA-04 List projects",
  "- Covers: AC4 Projects are listed",
  "",
  "### QA-05 Delete a project",
  "- Covers: AC5 A project is deleted",
  "",
  "## Not automatable",
  "- QA-03 - the printer is physical",
  "",
  "## Out of scope",
  "- AC6 Billing - no scenario",
  "",
];
const AUTOMATION = ["## Automation", "- QA-01: file tests/e2e/qa-01-sign-in.spec.ts", "- QA-02: blocked - the project form returns 500", ""];
const HANDOFF = [...HEAD, ...AUTOMATION].join("\n");
const NEXT_ARGS = ["--spec-dir", "tests/e2e", "--base-url", "http://localhost:3000", "--accounts", "admin admin@example.test - vault"];

interface Scene extends FakeFsOpts {
  cwd?: string;
  script?: string;
  /** The path the handoff text is planted at; the first argument is `handoff` when given, else this path. */
  file?: string;
  handoff?: string;
}

/** One call on a handoff holding `text`, `args` after its path. */
function run(text: string, args: string[], scene: Scene = {}): QaLedgerResult {
  const file = scene.file ?? FILE;
  return runQaLedger([scene.handoff ?? file, ...args], scene.cwd ?? DIR, scene.script ?? SCRIPT, { fs: fakeFs({ [file]: text }, scene) });
}

const answered = (...lines: string[]): QaLedgerResult => ({ stdout: lines.map((line) => `${line}\n`).join(""), stderr: "", exit: 0 });
const refused = (reason: string): QaLedgerResult => ({ stdout: "", stderr: `error: ${reason}\n`, exit: 2 });
const block = (id: string, handoff = FILE, refs = REFS): QaLedgerResult =>
  answered(
    `NEXT: dispatch | id: ${id} | agent: viber:e2e-writer`,
    `handoff: ${handoff}`,
    `id: ${id}`,
    "spec-dir: tests/e2e",
    "base-url: http://localhost:3000",
    "accounts: admin admin@example.test - vault",
    `refs: ${refs}`,
  );

test("list prints one id line per automatable scenario in file order with its state and title, none for a not automatable one, then the counts", () => {
  assert.deepEqual(
    run(HANDOFF, ["list"]),
    answered("id: QA-01 | file | Sign in", "id: QA-02 | blocked | Create a project", "id: QA-04 | pending | List projects", "id: QA-05 | pending | Delete a project", "counts: 1 file, 1 blocked, 2 pending"),
  );
});

test("a handoff with no Automation section lists every scenario pending", () => {
  assert.deepEqual(
    run(HEAD.join("\n"), ["list"]),
    answered("id: QA-01 | pending | Sign in", "id: QA-02 | pending | Create a project", "id: QA-04 | pending | List projects", "id: QA-05 | pending | Delete a project", "counts: 0 file, 0 blocked, 4 pending"),
  );
});

test("next prints the dispatch block of the first blocked or pending scenario, skipping a file one", () => {
  assert.deepEqual(run(HANDOFF, ["next", ...NEXT_ARGS]), block("QA-02"));
});

test("next with --after prints the first blocked or pending scenario listed after it", () => {
  assert.deepEqual(run(HANDOFF, ["next", ...NEXT_ARGS, "--after", "QA-02"]), block("QA-04"));
});

test("next --after a scenario already automated still moves on to the next unfinished one (a not automatable ID between them is never offered)", () => {
  assert.deepEqual(run(HANDOFF, ["next", ...NEXT_ARGS, "--after", "QA-01"]), block("QA-02"));
});

test("next prints NEXT: commit when the --after scenario is the last one left", () => {
  assert.deepEqual(run(HANDOFF, ["next", ...NEXT_ARGS, "--after", "QA-05"]), answered("NEXT: commit"));
});

test("next prints NEXT: commit when every scenario already has a file line", () => {
  const done = [...HEAD, "## Automation", "- QA-01: file a.spec.ts", "- QA-02: file b.spec.ts", "- QA-04: file c.spec.ts", "- QA-05: file d.spec.ts", ""].join("\n");
  assert.deepEqual(run(done, ["next", ...NEXT_ARGS]), answered("NEXT: commit"));
});

test("next prints NEXT: commit for a handoff with no scenario, and its report is a table of no row", () => {
  assert.deepEqual(run("", ["next", ...NEXT_ARGS]), answered("NEXT: commit"));
  assert.deepEqual(run("", ["list"]), answered("counts: 0 file, 0 blocked, 0 pending"));
  assert.deepEqual(run("", ["report"]), answered("+----+-------+--------+", "| ID | State | Detail |", "+----+-------+--------+", "+----+-------+--------+", "counts: 0 file, 0 blocked, 0 pending"));
});

test("a repeated option keeps its last value, and every value is printed as given", () => {
  const out = run(HANDOFF, ["next", "--spec-dir", "first", "--after", "QA-04", "--base-url", "-x", "--accounts", "%s $HOME `x` a\\b", "--spec-dir", "a b\\c", "--after", "QA-01"]);
  assert.deepEqual(
    out,
    answered("NEXT: dispatch | id: QA-02 | agent: viber:e2e-writer", `handoff: ${FILE}`, "id: QA-02", "spec-dir: a b\\c", "base-url: -x", "accounts: %s $HOME `x` a\\b", `refs: ${REFS}`),
  );
});

test("report draws one ASCII table row per listed scenario in file order, each column as wide as its widest cell, then the counts line", () => {
  assert.deepEqual(
    run(HANDOFF, ["report"]),
    answered(
      "+-------+---------+---------------------------------+",
      "| ID    | State   | Detail                          |",
      "+-------+---------+---------------------------------+",
      "| QA-01 | file    | tests/e2e/qa-01-sign-in.spec.ts |",
      "| QA-02 | blocked | the project form returns 500    |",
      "| QA-04 | pending | -                               |",
      "| QA-05 | pending | -                               |",
      "+-------+---------+---------------------------------+",
      "counts: 1 file, 1 blocked, 2 pending",
    ),
  );
});

test("report cuts a blocked reason past 60 characters to 57 and ends it in ... (the Detail column then stops at 60)", () => {
  const text = ["## UI scenarios", "### QA-01 Checkout", "## Automation", "- QA-01: blocked - the checkout form keeps returning a server error after submit", ""].join("\n");
  assert.deepEqual(
    run(text, ["report"]),
    answered(
      "+-------+---------+--------------------------------------------------------------+",
      "| ID    | State   | Detail                                                       |",
      "+-------+---------+--------------------------------------------------------------+",
      "| QA-01 | blocked | the checkout form keeps returning a server error after su... |",
      "+-------+---------+--------------------------------------------------------------+",
      "counts: 0 file, 1 blocked, 0 pending",
    ),
  );
});

test("report keeps a blocked reason of exactly 60 characters whole", () => {
  const text = ["## UI scenarios", "### QA-01 Checkout", "## Automation", "- QA-01: blocked - the checkout form keeps returning a server error after save.", ""].join("\n");
  assert.ok(run(text, ["report"]).stdout.includes("| QA-01 | blocked | the checkout form keeps returning a server error after save. |\n"));
});

test("report never cuts the path of a file line, however long (only a blocked reason is cut)", () => {
  const spec = "tests/e2e/a/very/long/path/that/goes/past/sixty/characters/for/sure/qa-01.spec.ts";
  const text = ["## UI scenarios", "### QA-01 Checkout", "## Automation", `- QA-01: file ${spec}`, ""].join("\n");
  assert.ok(run(text, ["report"]).stdout.includes(`| QA-01 | file  | ${spec} |\n`));
});

test("report counts characters, not bytes: accented text is cut at 57 characters and every row stays as wide as the rule", () => {
  const text = [
    "## UI scenarios",
    "### QA-01 Zażółć gęślą",
    "### QA-02 Emoji",
    "## Automation",
    "- QA-01: blocked - zażółć gęślą jaźń zażółć gęślą jaźń zażółć gęślą jaźń zażółć gęślą jaźń",
    "- QA-02: file tests/e2e/zażółć-\u{1F600}.spec.ts",
    "",
  ].join("\n");
  assert.deepEqual(
    run(text, ["report"]),
    answered(
      "+-------+---------+--------------------------------------------------------------+",
      "| ID    | State   | Detail                                                       |",
      "+-------+---------+--------------------------------------------------------------+",
      "| QA-01 | blocked | zażółć gęślą jaźń zażółć gęślą jaźń zażółć gęślą jaźń zaż... |",
      `| QA-02 | file    | tests/e2e/zażółć-\u{1F600}.spec.ts${" ".repeat(34)} |`,
      "+-------+---------+--------------------------------------------------------------+",
      "counts: 1 file, 1 blocked, 0 pending",
    ),
  );
});

test("a handoff with carriage returns reads as one without: a line loses its carriage return and its trailing blanks before any rule", () => {
  const crlf = [...HEAD, ...AUTOMATION].join("\r\n");
  assert.deepEqual(run(crlf, ["list"]), run(HANDOFF, ["list"]));
  assert.deepEqual(run(crlf, ["report"]), run(HANDOFF, ["report"]));
  const blanks = ["## UI scenarios  \t", "### QA-01 Sign in \t ", "## Automation ", "- QA-01: blocked - slow  \t", ""].join("\n");
  assert.deepEqual(run(blanks, ["list"]), answered("id: QA-01 | blocked | Sign in", "counts: 0 file, 1 blocked, 0 pending"));
  assert.ok(run(blanks, ["report"]).stdout.includes("| QA-01 | blocked | slow   |\n"));
});

test("a carriage return inside a line stays in the title", () => {
  const text = ["## UI scenarios", "### QA-01 a\rb", ""].join("\n");
  assert.deepEqual(run(text, ["list"]), answered("id: QA-01 | pending | a\rb", "counts: 0 file, 0 blocked, 1 pending"));
});

test("a last line with no newline is still read", () => {
  assert.deepEqual(run("## UI scenarios\n### QA-01 Last line", ["list"]), answered("id: QA-01 | pending | Last line", "counts: 0 file, 0 blocked, 1 pending"));
});

const EDGE = [
  "### QA-00 before any section",
  "##  UI scenarios  \t",
  "### QA-1",
  "### QA-2\tTabbed  title  ",
  "###  QA-3 two blanks",
  "### QA-4x glued",
  "### QA-5 | pipe | in title",
  "### QA-6 dup",
  "### QA-6 dup again",
  "### QA-7 last state wins",
  "### QA-8 file with no path",
  "### QA-9 blocked with no reason",
  "### QA-10 state then cleared",
  "### QA-11 skipped by colon form",
  "### QA-12 fileX is no state",
  "### QA-13 dash only",
  "##",
  "### QA-14 under an empty heading line",
  "## Not automatable",
  "- QA-11: with a colon",
  "- QA-99",
  "-QA-1 no blank",
  "## Automation",
  "- QA-7: blocked - first",
  "- QA-7:file second.spec.ts",
  "- QA-8: file",
  "- QA-9: blocked",
  "- QA-10: file a.spec.ts",
  "- QA-10: blocked -  spaced   reason  ",
  "- QA-12: fileX",
  "- QA-13: blocked -",
  "- QA-1: pending",
  "- QA-2:\tblocked\t-\ttabbed reason",
  "## API scenarios",
  "### QA-20 a second scenario section",
  "## Automation",
  "- QA-20: blocked - - double dash",
  "",
].join("\n");

test("list reads each grammar edge: a heading outside the scenario sections, a glued or doubly spaced ID, a tab, a repeated ID, an empty title, a heading line of two hashes alone, the last state line of an ID and a word that only starts like a state", () => {
  assert.deepEqual(
    run(EDGE, ["list"]),
    answered(
      "id: QA-1 | pending | ",
      "id: QA-2 | blocked | Tabbed  title",
      "id: QA-5 | pending | | pipe | in title",
      "id: QA-6 | pending | dup",
      "id: QA-6 | pending | dup again",
      "id: QA-7 | file | last state wins",
      "id: QA-8 | file | file with no path",
      "id: QA-9 | blocked | blocked with no reason",
      "id: QA-10 | blocked | state then cleared",
      "id: QA-12 | pending | fileX is no state",
      "id: QA-13 | blocked | dash only",
      "id: QA-14 | pending | under an empty heading line",
      "id: QA-20 | blocked | a second scenario section",
      "counts: 2 file, 5 blocked, 6 pending",
    ),
  );
});

test("report reads each detail edge: a state with no detail is a dash, one leading dash of a reason is dropped, the inner blanks of a reason stay", () => {
  assert.deepEqual(
    run(EDGE, ["report"]),
    answered(
      "+-------+---------+-----------------+",
      "| ID    | State   | Detail          |",
      "+-------+---------+-----------------+",
      "| QA-1  | pending | -               |",
      "| QA-2  | blocked | tabbed reason   |",
      "| QA-5  | pending | -               |",
      "| QA-6  | pending | -               |",
      "| QA-6  | pending | -               |",
      "| QA-7  | file    | second.spec.ts  |",
      "| QA-8  | file    | -               |",
      "| QA-9  | blocked | -               |",
      "| QA-10 | blocked | spaced   reason |",
      "| QA-12 | pending | -               |",
      "| QA-13 | blocked | -               |",
      "| QA-14 | pending | -               |",
      "| QA-20 | blocked | - double dash   |",
      "+-------+---------+-----------------+",
      "counts: 2 file, 5 blocked, 6 pending",
    ),
  );
});

test("next --after a repeated ID passes every scenario of that ID, and a title holding a pipe changes no state", () => {
  assert.deepEqual(run(EDGE, ["next", ...NEXT_ARGS, "--after", "QA-6"]).stdout.split("\n")[0], "NEXT: dispatch | id: QA-9 | agent: viber:e2e-writer");
  assert.deepEqual(run(EDGE, ["next", ...NEXT_ARGS, "--after", "QA-5"]).stdout.split("\n")[0], "NEXT: dispatch | id: QA-6 | agent: viber:e2e-writer");
});

for (const [label, handoff, cwd, file, printed] of [
  ["a relative handoff", "qa.e2e.md", DIR, FILE, FILE],
  ["a relative handoff from a directory below", "../qa.e2e.md", `${DIR}/sub`, FILE, FILE],
  ["a handoff with a . segment, a .. segment and a doubled slash", `${DIR}/./x/..//qa.e2e.md`, "/elsewhere", FILE, FILE],
  ["a backslash drive-letter handoff", "C:\\runs\\one\\qa.e2e.md", "D:\\elsewhere", "C:/runs/one/qa.e2e.md", "C:/runs/one/qa.e2e.md"],
  ["a relative backslash handoff from a backslash drive-letter cwd", "one\\qa.e2e.md", "C:\\runs", "C:/runs/one/qa.e2e.md", "C:/runs/one/qa.e2e.md"],
  ["a relative handoff from the file system root", "qa.e2e.md", "/", "/qa.e2e.md", "/qa.e2e.md"],
] as const) {
  test(`${label} prints the handoff: line absolute with forward slashes (${handoff} from ${cwd} is ${printed})`, () => {
    assert.deepEqual(run(HANDOFF, ["next", ...NEXT_ARGS], { handoff, cwd, file }), block("QA-02", printed));
  });
}

for (const [label, script, refs] of [
  ["a forward slash path", "/opt/plugins/viber/skills/e2e/scripts/qa-ledger.ts", "/opt/plugins/viber/references"],
  ["a backslash drive-letter path", "C:\\Users\\me\\plugins\\viber\\skills\\e2e\\scripts\\qa-ledger.ts", "C:/Users/me/plugins/viber/references"],
  ["a forward slash drive-letter path", "C:/Users/me/plugins/viber/skills/e2e/scripts/qa-ledger.ts", "C:/Users/me/plugins/viber/references"],
  ["a path with mixed separators", "C:\\Users\\me\\plugins\\viber\\skills\\e2e\\scripts/qa-ledger.ts", "C:/Users/me/plugins/viber/references"],
  ["a plugin at a drive root", "C:\\skills\\e2e\\scripts\\qa-ledger.ts", "C:/references"],
  ["a plugin at the file system root", "/skills/e2e/scripts/qa-ledger.ts", "/references"],
] as const) {
  test(`started by ${label}, the refs: line names the references directory three directories above the script's own, with forward slashes (${refs})`, () => {
    assert.deepEqual(run(HANDOFF, ["next", ...NEXT_ARGS], { script }), block("QA-02", FILE, refs));
  });
}

const USAGE = "usage: qa-ledger.sh <handoff> list | <handoff> report | <handoff> next --spec-dir <dir> --base-url <url> --accounts <value> [--after QA-<nn>]";

for (const [what, args, reason] of [
  ["an unknown mode", ["status"], "unknown mode status: use list, next or report"],
  ["an empty mode", [""], "unknown mode : use list, next or report"],
  ["a list call with an option", ["list", "--after", "QA-01"], "unknown option --after for list"],
  ["a report call with an option", ["report", "--after", "QA-01"], "unknown option --after for report"],
  ["an unknown option of next", ["next", ...NEXT_ARGS, "--before", "QA-01"], "unknown option --before"],
  ["a stray word of next", ["next", "stray"], "unknown option stray"],
  ["a next call with no option", ["next"], "next needs --spec-dir"],
  ["a next call without --spec-dir", ["next", "--base-url", "http://localhost:3000", "--accounts", "admin"], "next needs --spec-dir"],
  ["a next call without --base-url", ["next", "--spec-dir", "tests/e2e", "--accounts", "admin"], "next needs --base-url"],
  ["a next call without --accounts", ["next", "--spec-dir", "tests/e2e", "--base-url", "http://localhost:3000"], "next needs --accounts"],
  ["an option with no value at the end of the line", ["next", ...NEXT_ARGS, "--after"], "option --after needs a value"],
  ["an option whose value is another option", ["next", "--spec-dir", "--base-url", "http://localhost:3000", "--accounts", "admin"], "option --spec-dir needs a value"],
  ["an option whose value is empty", ["next", "--spec-dir", "", "--base-url", "u", "--accounts", "a"], "option --spec-dir needs a value"],
  ["an --after naming no listed scenario", ["next", ...NEXT_ARGS, "--after", "QA-99"], "--after QA-99 names no listed scenario"],
  ["an --after naming a not automatable scenario", ["next", ...NEXT_ARGS, "--after", "QA-03"], "--after QA-03 names no listed scenario"],
  ["an --after in another letter case", ["next", ...NEXT_ARGS, "--after", "qa-02"], "--after qa-02 names no listed scenario"],
] as const) {
  test(`${what} prints one error: line, nothing on stdout, exit 2`, () => {
    assert.deepEqual(run(HANDOFF, [...args]), refused(reason));
  });
}

test("a handoff path that does not exist, is a directory, cannot be read or ends on a slash prints one error: line naming it as given, nothing on stdout, exit 2", () => {
  const scene = { dirs: [`${DIR}/adir`], unreadable: [`${DIR}/locked.md`] };
  for (const handoff of [`${DIR}/missing.md`, `${DIR}/adir`, `${DIR}/locked.md`, `${FILE}/`, `${FILE}\\`, "no\\there\\new.md", ""]) {
    assert.deepEqual(run(HANDOFF, ["list"], { ...scene, handoff }), refused(`no handoff file at ${handoff}`));
  }
});

test("a missing handoff is reported before an unknown mode", () => {
  assert.deepEqual(run(HANDOFF, ["status"], { handoff: `${DIR}/missing.md` }), refused(`no handoff file at ${DIR}/missing.md`));
});

test("no argument at all, and a handoff with no mode, print the usage as one error: line, nothing on stdout, exit 2", () => {
  const fs = fakeFs({ [FILE]: HANDOFF });
  assert.deepEqual(runQaLedger([], DIR, SCRIPT, { fs }), refused(USAGE));
  assert.deepEqual(runQaLedger([FILE], DIR, SCRIPT, { fs }), refused(USAGE));
});

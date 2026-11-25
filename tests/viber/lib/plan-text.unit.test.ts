/*
 * plan-text.unit.test.ts - the plan reader of the plan-build core:
 * `parsePlan(text)` finds the task blocks, the contract blocks, the acceptance
 * criteria, the `### Must not change` lines and the `### File map` lines of a
 * plan, and `slicesOf(count)` cuts a task count into the runs the final
 * review of a build gets.
 *
 * The cases pin what a slice brief relies on: a block ends before the blank
 * lines that only separate it from the next one, a `## ` line inside a task
 * block or a fenced block opens no section, a fenced block under Must not change
 * is quoted whole, a criterion opens at column 0 alone, a field is read once per
 * task, and the cut is the one `scripts/plan-index.sh` prints (ceil(n / 8) runs,
 * sizes differing by at most one, the larger first).
 *
 * `openItemsOf(lines)` and `withOpenItems(lines, items)` read and write the
 * `## Open items` section the plan-build core keeps above `## Tasks`: critical
 * problems first, at most 3 notes per task, a note past the third kept as a plan
 * note, and no section at all for a plan with no item.
 *
 * The cutters read the files the planning agents write: `cutFrame` the frame
 * file at its `<!-- SLICES -->` and `<!-- DECISIONS -->` lines, `cutAuthor` an
 * author file at its `<!-- NOTES -->` line, `cutSliceText` the task blocks and
 * the local contract blocks of a slice. `reorderTasks`, `renumberTasks`,
 * `renameTaskIds`, `renameTokens` and `withDepends` are how the plan-build core
 * orders and numbers the tasks and the local blocks of an assembled plan, reads
 * the task ids its authors wrote through the new numbers and writes every
 * computed `Depends-on` line.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { cutAuthor, cutFrame, cutSliceText, linesOf, listOf, mapTasks, openItemsOf, parsePlan, renameTaskIds, renameTokens, renumberTasks, reorderTasks, slicesOf, withDepends, withOpenItems, type OpenItem } from "../../../viber/lib/plan-text.ts";

const PLAN = [
  "---",
  "source: /p/plan.md",
  "---",
  "",
  "# Title",
  "",
  "## Current behaviour",
  "",
  "### Must not change",
  "",
  "- the login keeps its route",
  "```",
  "POST /login",
  "```",
  "- the audit stays",
  "",
  "## Acceptance criteria",
  "",
  "1. The first criterion.",
  "   Its second line.",
  "   1. A step of it.",
  "2. The second criterion.",
  "",
  "## Scope",
  "",
  "### File map",
  "",
  "- modify - src/a.ts - the retry loop",
  "- add - `./src/b.ts` - its helper",
  "- modify - src/c.ts, `./src/d.ts` - two files of one owner",
  "",
  "### Out of scope",
  "",
  "- nothing",
  "",
  "## Tasks",
  "",
  "<!-- TASK -->",
  "### T1 - First",
  "- TDD: required",
  "- Covers: AC1, AC2",
  "- Uses: C1",
  "- Depends-on: none",
  "- Files: src/a.ts, ./src/b.ts",
  "- Delivers: the loop",
  "- Verification: npm test -> green",
  "- DoD: it works",
  "## not a section",
  "<!-- /TASK -->",
  "",
  "<!-- TASK -->",
  "### T2 - Second",
  "- TDD: none",
  "- Covers: AC2",
  "- Uses: none",
  "- Files: src/b.ts",
  "- Files: src/ignored.ts",
  "<!-- /TASK -->",
  "",
  "## Contracts",
  "",
  "### C1 - Retry",
  "",
  "File: src/a.ts",
  "",
  "```",
  "### not a contract",
  "## not a section either",
  "```",
  "",
  "### C2 - Other",
  "",
  "File: none",
  "",
].join("\n");

test("a plan gives its tasks with their ids, marker lines and fields, a field read once per task", () => {
  const plan = parsePlan(PLAN);
  assert.deepEqual(plan.tasks.map((task) => [task.id, plan.lines[task.first], plan.lines[task.last]]), [
    ["T1", "<!-- TASK -->", "<!-- /TASK -->"],
    ["T2", "<!-- TASK -->", "<!-- /TASK -->"],
  ]);
  assert.deepEqual([plan.tasks[0].fields.get("Covers"), plan.tasks[0].fields.get("Verification"), plan.tasks[1].fields.get("Files"), plan.tasks[1].fields.get("DoD")], ["AC1, AC2", "npm test -> green", "src/b.ts", undefined]);
});

test("a contract block runs from its heading to its last line with text, a heading inside a fenced block opening nothing", () => {
  const plan = parsePlan(PLAN);
  assert.deepEqual(plan.contracts.map((block) => [block.id, plan.lines[block.first], plan.lines[block.last]]), [
    ["C1", "### C1 - Retry", "```"],
    ["C2", "### C2 - Other", "File: none"],
  ]);
});

test("an acceptance criterion keeps its continuation lines, an indented numbered step among them, and ends before the blank line after it", () => {
  const plan = parsePlan(PLAN);
  assert.deepEqual(plan.criteria.map((item) => [item.id, plan.lines.slice(item.first, item.last + 1)]), [
    ["AC1", ["1. The first criterion.", "   Its second line.", "   1. A step of it."]],
    ["AC2", ["2. The second criterion."]],
  ]);
});

test("the must-not-change lines come without their heading and outer blank lines, a fenced block among them whole, the file map by path with a leading ./ and backticks dropped, a line naming several paths under each of them (plan-index.sh takes that line, and keyed by its first path alone a slice brief lost it)", () => {
  const plan = parsePlan(PLAN);
  assert.deepEqual(plan.mustNot, ["- the login keeps its route", "```", "POST /login", "```", "- the audit stays"]);
  assert.deepEqual([...plan.fileMap.keys()], ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"]);
  assert.deepEqual([plan.fileMap.get("src/c.ts"), plan.fileMap.get("src/d.ts")], Array(2).fill("- modify - src/c.ts, `./src/d.ts` - two files of one owner"));
  assert.equal(plan.fileMap.get("src/b.ts"), "- add - `./src/b.ts` - its helper");
});

test("a text with carriage returns and no final line feed reads as the same lines", () => {
  assert.deepEqual(linesOf("a\r\nb\r\n"), ["a", "b"]);
  assert.deepEqual(linesOf("a\nb"), ["a", "b"]);
  assert.deepEqual(linesOf(""), []);
});

test("a field value lists its entries, none and blanks dropped", () => {
  assert.deepEqual([listOf("AC1, AC2"), listOf("none"), listOf(undefined), listOf(" T1 ,, T2 ")], [["AC1", "AC2"], [], [], ["T1", "T2"]]);
});

// [task count, the runs as from-to]: the cut of the final review blocks.
for (const [count, runs] of [
  [0, []],
  [1, ["1-1"]],
  [8, ["1-8"]],
  [9, ["1-5", "6-9"]],
  [13, ["1-7", "8-13"]],
  [16, ["1-8", "9-16"]],
  [17, ["1-6", "7-12", "13-17"]],
  [31, ["1-8", "9-16", "17-24", "25-31"]],
] as [number, string[]][]) {
  test(`${count} tasks are cut into the runs ${runs.join(", ") || "none"}`, () => {
    assert.deepEqual(slicesOf(count).map((slice) => `${slice.from}-${slice.to}`), runs);
  });
}

test("a frame file is cut into the plan text, its SLICE: lines and the decision log, the blank lines at both ends of each part dropped", () => {
  const frame = cutFrame(["", "---", "source: /p.md", "---", "", "## Tasks", "", "<!-- SLICES -->", "SLICE: 1 | covers: AC1, AC3 | uses: C1 | the login loop | and its log", "- SLICE: 2 | covers: AC2 | uses: none | the page", "not a slice line", "<!-- DECISIONS -->", "", "- one writer: no lock", ""]);
  assert.deepEqual(frame.text, ["---", "source: /p.md", "---", "", "## Tasks"]);
  assert.deepEqual(frame.slices, [
    { slice: 1, covers: ["AC1", "AC3"], uses: ["C1"], delivers: "the login loop | and its log" },
    { slice: 2, covers: ["AC2"], uses: [], delivers: "the page" },
  ]);
  assert.deepEqual(frame.decisions, ["- one writer: no lock"]);
});

test("a frame file with no marker is plan text alone, and one with the decisions ahead of the slices keeps both parts", () => {
  assert.deepEqual(cutFrame(["---", "x"]), { text: ["---", "x"], slices: [], decisions: [] });
  const swapped = cutFrame(["---", "<!-- DECISIONS -->", "- d", "<!-- SLICES -->", "SLICE: 1 | covers: AC1 | the loop"]);
  assert.deepEqual([swapped.text, swapped.decisions, swapped.slices], [["---"], ["- d"], [{ slice: 1, covers: ["AC1"], uses: [], delivers: "the loop" }]]);
});

test("an author file is cut at its notes marker into the text and the FACT:, GAP: and OUTSIDE: lines below it, a list mark in front of one dropped and any other line left out", () => {
  const author = cutAuthor(["<!-- TASK -->", "### T1 - A", "<!-- /TASK -->", "", "<!-- NOTES -->", "FACT: src/a.ts:12 | retry(3) | the loop retries three times", "- GAP: C1 names no error code", "  OUTSIDE: docs/x.md | the old route stays documented", "OUTSIDE: no bar", "a remark"]);
  assert.deepEqual(author.text, ["<!-- TASK -->", "### T1 - A", "<!-- /TASK -->"]);
  assert.deepEqual(author.facts, ["FACT: src/a.ts:12 | retry(3) | the loop retries three times"]);
  assert.deepEqual(author.gaps, ["C1 names no error code"]);
  assert.deepEqual(author.outside, [{ path: "docs/x.md", text: "the old route stays documented" }]);
  assert.deepEqual(cutAuthor(["GAP: above the marker is plan text"]), { text: ["GAP: above the marker is plan text"], facts: [], gaps: [], outside: [] });
});

const SLICE_TEXT = [
  "A remark of the author.",
  "<!-- TASK -->",
  "### T1 - First",
  "- Uses: L1, C1",
  "### a heading inside a task",
  "<!-- /TASK -->",
  "",
  "<!-- TASK -->",
  "- Uses: none",
  "<!-- /TASK -->",
  "",
  "### L1 - Local shape",
  "",
  "File: src/a.ts",
  "",
  "```",
  "### not a block",
  "```",
  "",
  "### L2 - Other",
  "",
  "File: none",
  "",
  "## A section ends the last block",
  "left out",
];

test("the text of a slice gives its task blocks whole and its local contract blocks from heading to last line with text, every other line left out", () => {
  const cut = cutSliceText(SLICE_TEXT);
  assert.deepEqual(cut.tasks, [
    ["<!-- TASK -->", "### T1 - First", "- Uses: L1, C1", "### a heading inside a task", "<!-- /TASK -->"],
    ["<!-- TASK -->", "- Uses: none", "<!-- /TASK -->"],
  ]);
  assert.deepEqual(cut.blocks, [
    { id: "L1", lines: ["### L1 - Local shape", "", "File: src/a.ts", "", "```", "### not a block", "```"] },
    { id: "L2", lines: ["### L2 - Other", "", "File: none"] },
  ]);
});

test("renumberTasks numbers the task blocks T1.. in order on the first heading of each, answers the id each one held, and leaves a block with no heading as it is", () => {
  const lines = ["## Tasks", "<!-- TASK -->", "### T7 - Seventh", "### T9 - a second heading", "<!-- /TASK -->", "<!-- TASK -->", "- Uses: none", "<!-- /TASK -->", "<!-- TASK -->", "### NEW - Added", "<!-- /TASK -->", "### T7 - a contract-like heading outside a task"];
  const numbered = renumberTasks(lines);
  assert.deepEqual(numbered.lines, ["## Tasks", "<!-- TASK -->", "### T1 - Seventh", "### T9 - a second heading", "<!-- /TASK -->", "<!-- TASK -->", "- Uses: none", "<!-- /TASK -->", "<!-- TASK -->", "### T3 - Added", "<!-- /TASK -->", "### T7 - a contract-like heading outside a task"]);
  assert.deepEqual(numbered.ids, [{ old: "T7", fresh: "T1" }, { old: "", fresh: "T2" }, { old: "NEW", fresh: "T3" }]);
});

test("renameTokens renames a whole token in the Uses, Delivers and DoD lines of a task block and in no other line, a longer id or a path holding it left alone", () => {
  const block = ["<!-- TASK -->", "### T1 - Uses L1 in its title", "- Uses: L1, L10, C1", "- Files: src/L1.ts", "- Delivers: the L1 shape (L1)", "- Verification: grep L1 src -> 1", "- DoD: `L1` is exported; XL1, L1-b and src/L1.ts stay. It ends on L1.", "<!-- /TASK -->"];
  assert.deepEqual(renameTokens(block, new Map([["L1", "C3"]])), ["<!-- TASK -->", "### T1 - Uses L1 in its title", "- Uses: C3, L10, C1", "- Files: src/L1.ts", "- Delivers: the C3 shape (C3)", "- Verification: grep L1 src -> 1", "- DoD: `C3` is exported; XL1, L1-b and src/L1.ts stay. It ends on C3.", "<!-- /TASK -->"]);
});

const BLOCKS = ["## Tasks", "", "<!-- TASK -->", "### T1 - First", "<!-- /TASK -->", "", "between", "<!-- TASK -->", "### T2 - Second", "- Uses: none", "<!-- /TASK -->", "<!-- TASK -->", "### T3 - Third", "<!-- /TASK -->", "", "## Contracts"];

test("reorderTasks moves the task blocks into the order given and leaves every line between and around them where it is", () => {
  assert.deepEqual(reorderTasks(BLOCKS, [2, 0, 1]), ["## Tasks", "", "<!-- TASK -->", "### T3 - Third", "<!-- /TASK -->", "", "between", "<!-- TASK -->", "### T1 - First", "<!-- /TASK -->", "<!-- TASK -->", "### T2 - Second", "- Uses: none", "<!-- /TASK -->", "", "## Contracts"]);
});

test("reorderTasks moves nothing for the order the blocks stand in, and for an order that does not name every block once", () => {
  for (const order of [[0, 1, 2], [1, 0], [0, 0, 1], [0, 1, 5]]) assert.equal(reorderTasks(BLOCKS, order), BLOCKS);
});

test("mapTasks rewrites each task block with its place and no other line", () => {
  assert.deepEqual(mapTasks(BLOCKS, (block, at) => (at === 1 ? [`block ${at}: ${block.length} lines`] : block)).slice(6, 9), ["between", "block 1: 4 lines", "<!-- TASK -->"]);
});

test("renameTaskIds renames a task id in the Delivers, Verification and DoD lines of a block, outside backtick spans and as a whole token alone, and leaves an id that is a plain word, an unchanged id and every other line as they are", () => {
  const names = new Map([["T1", "T4"], ["T4", "T7"], ["NEW1", "T5"], ["page", "T9"], ["T2", "T2"]]);
  const block = ["### T1 - After T4", "- Uses: T1", "- Delivers: what T1 starts and T4 ends, T11 and src/T1.ts left alone, `T1` too.", "- Verification: npm test tests/T1.test.ts -> green, as NEW1 is", "- DoD: the page of T2 works; it follows T1."];
  assert.deepEqual(renameTaskIds(block, names), ["### T1 - After T4", "- Uses: T1", "- Delivers: what T4 starts and T7 ends, T11 and src/T1.ts left alone, `T1` too.", "- Verification: npm test tests/T1.test.ts -> green, as T5 is", "- DoD: the page of T2 works; it follows T4."]);
  assert.equal(renameTaskIds(block, new Map([["T2", "T2"]])), block);
});

test("withDepends writes the value of each task in order as its Depends-on line, in place of the one it holds or below its Uses line, and touches no other line", () => {
  const lines = ["<!-- TASK -->", "### T1 - A", "- Uses: none", "- Depends-on: T9, T8", "- Files: a.ts", "<!-- /TASK -->", "- Depends-on: outside a task", "<!-- TASK -->", "### T2 - B", "- Uses: C1", "- Files: b.ts", "<!-- /TASK -->", "<!-- TASK -->", "### T3 - C", "- Files: c.ts", "<!-- /TASK -->"];
  assert.deepEqual(withDepends(lines, ["none", "T1", "T1, T2"]), ["<!-- TASK -->", "### T1 - A", "- Uses: none", "- Depends-on: none", "- Files: a.ts", "<!-- /TASK -->", "- Depends-on: outside a task", "<!-- TASK -->", "### T2 - B", "- Uses: C1", "- Depends-on: T1", "- Files: b.ts", "<!-- /TASK -->", "<!-- TASK -->", "### T3 - C", "- Depends-on: T1, T2", "- Files: c.ts", "<!-- /TASK -->"]);
});

const note = (where: string, text: string): OpenItem => ({ kind: "note", where, text });
const OPEN = ["## Open items", "", "- critical | T2 | the DoD contradicts AC1", "- note | T1 | name the retry cap | once", "- note | plan | the summary names no rollback", ""];
const withSection = (): string[] => {
  const lines = linesOf(PLAN);
  const at = lines.indexOf("## Tasks");
  return [...lines.slice(0, at), ...OPEN, ...lines.slice(at)];
};

test("the open items of a plan are the lines of its Open items section, the text everything after the second bar, a line of another shape and a line of another section read as none", () => {
  const lines = withSection();
  lines.splice(lines.indexOf("- note | plan | the summary names no rollback"), 0, "- a line of another shape", "- note | T9");
  assert.deepEqual(openItemsOf(lines), [
    { kind: "critical", where: "T2", text: "the DoD contradicts AC1" },
    { kind: "note", where: "T1", text: "name the retry cap | once" },
    { kind: "note", where: "plan", text: "the summary names no rollback" },
  ]);
  assert.deepEqual(openItemsOf(linesOf(PLAN)), []);
});

test("withOpenItems writes the section as the last one above the Tasks heading, critical problems first, an item given twice kept once, in place of the section the plan held", () => {
  const written = withOpenItems(withSection(), [note("T1", "first"), { kind: "critical", where: "plan", text: "AC2 - no task proves it" }, note("plan", "for the user"), note("T1", "first")]);
  const at = written.indexOf("## Open items");
  assert.deepEqual(written.slice(at - 1, at + 8), ["", "## Open items", "", "- critical | plan | AC2 - no task proves it", "- note | T1 | first", "- note | plan | for the user", "", "## Tasks", ""]);
  assert.equal(written.filter((line) => line === "## Open items").length, 1);
  assert.deepEqual([...written.slice(0, at), ...written.slice(at + 6)], linesOf(PLAN));
});

test("withOpenItems keeps at most 3 notes per task, the ones fixed after the last review ahead of the others in the order given, and rewrites each note past the third as a plan note naming its task", () => {
  const items = [note("T1", "one"), note("T1", "two"), note("T2", "other task"), note("T1", "three"), note("T1", "fixed after the last review: the DoD names the cap"), note("T1", "four")];
  assert.deepEqual(openItemsOf(withOpenItems(linesOf(PLAN), items)), [
    note("T1", "fixed after the last review: the DoD names the cap"),
    note("T1", "one"),
    note("T1", "two"),
    note("T2", "other task"),
    note("plan", "(T1) three"),
    note("plan", "(T1) four"),
  ]);
});

test("withOpenItems with no item drops the section and leaves a plan that never held one line for line as it was (a plan with no notes builds as before)", () => {
  assert.deepEqual(withOpenItems(withSection(), []), linesOf(PLAN));
  assert.deepEqual(withOpenItems(linesOf(PLAN), []), linesOf(PLAN));
});

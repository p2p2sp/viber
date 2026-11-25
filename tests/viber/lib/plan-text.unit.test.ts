/*
 * plan-text.unit.test.ts - the plan reader of the plan-build core:
 * `parsePlan(text)` finds the task blocks, the contract blocks, the acceptance
 * criteria, the `### Must not change` lines and the `### File map` lines of a
 * plan, and `slicesOf(count)` cuts a task count into the runs the task
 * reviewers and the task authors get.
 *
 * The cases pin what a slice brief relies on: a block ends before the blank
 * lines that only separate it from the next one, a `## ` line inside a task
 * block or a fenced block opens no section, a fenced block under Must not change
 * is quoted whole, a criterion opens at column 0 alone, a field is read once per
 * task, and the cut is the one `scripts/plan-index.sh` prints (ceil(n / 8) runs,
 * sizes differing by at most one, the larger first).
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { linesOf, listOf, parsePlan, rangeOf, slicesOf } from "../../../viber/lib/plan-text.ts";

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
  "- Verification: PENDING",
  "- DoD: PENDING",
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
  assert.deepEqual([plan.tasks[0].fields.get("Covers"), plan.tasks[0].fields.get("Verification"), plan.tasks[1].fields.get("Files"), plan.tasks[1].fields.get("DoD")], ["AC1, AC2", "PENDING", "src/b.ts", undefined]);
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

test("the must-not-change lines come without their heading and outer blank lines, a fenced block among them whole, the file map by path with a leading ./ and backticks dropped", () => {
  const plan = parsePlan(PLAN);
  assert.deepEqual(plan.mustNot, ["- the login keeps its route", "```", "POST /login", "```", "- the audit stays"]);
  assert.deepEqual([...plan.fileMap.keys()], ["src/a.ts", "src/b.ts"]);
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

// [task count, the runs as from-to]: the cut plan-index.sh prints for the task reviewers.
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

test("a slice is labelled by the ids of its first and last task", () => {
  const plan = parsePlan(PLAN);
  assert.equal(rangeOf(plan, { from: 1, to: 2 }), "T1-T2");
});

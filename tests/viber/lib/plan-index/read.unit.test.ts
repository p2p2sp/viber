/*
 * read.unit.test.ts - what one line of a plan shows on its own: the markers that
 * open a task, the fields and phases the index prints, the headings a fence turns
 * into text, and the defects of a slot, a scenario heading, a file map path, a
 * malformed heading and a line of the Open items section, each in line order.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { slotsOf } from "../../../../viber/lib/plan-index/read.ts";
import { CONTRACT, PLAN_REL, planBody, TWO_TASKS } from "../../plan-body.ts";
import { answerOf, indexOf, labelled, PLUGIN, refused, type Scene } from "./scene.ts";

const PLAN = planBody(TWO_TASKS);
const FULL = planBody(TWO_TASKS, 2, CONTRACT, "full");

test("a marker mentioned mid-sentence creates no task: only a marker alone on its line opens one", () => {
  const plan = PLAN.replace("## Goal\n", "## Goal\n\nMentioning <!-- TASK --> inside a sentence must not open one.\n\n");
  assert.equal(indexOf(plan).lines[2], "progress: 0/2");
});

test("a plan with no task blocks exits 3", () => {
  assert.deepEqual(answerOf(indexOf(planBody([]))), refused(3, `FIX: no <!-- TASK --> blocks in ${PLAN_REL}`));
});

test("task blocks under a heading other than Tasks exit 4 (the cut is that heading, so tasks/ would come out empty)", () => {
  assert.deepEqual(answerOf(indexOf(PLAN.replace("## Tasks", "## Zadania"))), refused(4, `FIX: ${PLAN_REL} carries <!-- TASK --> blocks but no "## Tasks" heading - that heading is where the specification is cut off`));
});

const FENCED = ["```md", "# Report", "", "## Findings", "", "## Coverage notes", "```"];
const LONG_FENCE = ["````md", "```", "## Quoted heading", "````"];
for (const [label, shape] of [
  ["a fenced shape holding ## headings", FENCED],
  ["a four-backtick shape holding a bare three-backtick line", LONG_FENCE],
] as const) {
  test(`a contract block after ${label} is found by its task's Uses`, () => {
    const contracts = ["### C1 - Report shape", "", "File: none", "", ...shape, "", "### C2 - Login endpoint", "", "File: none", "", "POST /login -> 200"];
    assert.equal(indexOf(planBody([{ ...TWO_TASKS[0], uses: "C1" }, { ...TWO_TASKS[1], uses: "C2" }], 2, contracts)).exit, 0);
  });
}

/** A plan whose `## Phases` lists exactly these entries, placed as the templates place it. */
const phasesPlan = (...entries: string[]): string => PLAN.replace("## Acceptance criteria\n", ["## Phases", "", "<!-- 9. guidance (this plan) -->", "", ...entries, "", "## Acceptance criteria", ""].join("\n"));
const PHASES: Array<[string, string, string[]]> = [
  ["the entry after the one marked (this plan), a trailing marker stripped from its name and every numbered entry counted", phasesPlan("1. Account model (this plan)", "2. Session expiry (built)", "3. Audit log"), ["next: phase 2 of 3 - Session expiry"]],
  ["the entry after it under the Roadmap heading a plan was approved under", phasesPlan("1. Add login (this plan)", "2. Audit log").replace("## Phases", "## Roadmap"), ["next: phase 2 of 2 - Audit log"]],
  ["nothing when the marked entry is the last one", phasesPlan("1. Account model (built)", "2. Add login (this plan)"), []],
  ["nothing when no entry is marked", phasesPlan("1. Account model (built)", "2. Add login"), []],
  ["nothing for a numbered line of a later section", phasesPlan("1. Add login (this plan)").replace("- Password reset.\n", "2. Session expiry\n- Password reset.\n"), []],
];
for (const [label, plan, lines] of PHASES) {
  test(`the next line names ${label}`, () => {
    assert.deepEqual(labelled(indexOf(plan).lines, "next"), lines);
  });
}

const TEMPLATE = `${PLUGIN}/skills/planner/templates/spec-lite.md`;
const SLOTS: Scene = { files: { [TEMPLATE]: "## Goal\n\n<2-4 sentences: what gets built and why.>\n\n### S<n> - x\n\n<!-- <hidden> --> and <repo-relative path>\n" } };
const slotGoal = (text: string): string => planBody([{ id: "T1" }], 1).replace("The session is durable.", text);

test("slotsOf lists each <...> span of the templates once, those inside an HTML comment left out, a comment over several lines included", () => {
  assert.deepEqual(slotsOf(["<a> <!-- <hidden> --> <b>\n<!--\n<hidden too>\n-->\n", "<a>\r\n<c d>"]), ["<a>", "<b>", "<c d>"]);
});

const LEFT: Array<[string, string, string[]]> = [
  ["the goal slot", planBody([{ id: "T1" }], 1).replace("Users can log in.", "<2-4 sentences: what gets built and why.>"), ["FIX: line 5: template slot <2-4 sentences: what gets built and why.> left unfilled - replace it (Filled)"]],
  ["the number of a scenario heading", slotGoal("### S<n> - Login"), ["FIX: line 6: template slot <n> left unfilled - replace it (Filled)"]],
];
for (const [label, plan, lines] of LEFT) {
  test(`${label} left in a fresh plan is refused by line and slot`, () => {
    assert.deepEqual(answerOf(indexOf(plan, [], SLOTS)), refused(4, ...lines));
  });
}

const NOT_PLAN_TEXT: Array<[string, string]> = [
  ["a fenced block", slotGoal("```\n<n>\n```")],
  ["a backtick span", slotGoal("Write `<repo-relative path>` here.")],
  ["an HTML comment on one line", slotGoal("<!-- <n> -->")],
  ["an HTML comment over several lines", slotGoal("<!--\n<repo-relative path>\n-->")],
  ["the Contracts appendix", planBody([{ id: "T1" }], 1, [...CONTRACT, "", "Path: <repo-relative path> and <n>"])],
  ["a template's own comment", slotGoal("<hidden>")],
];
for (const [label, plan] of NOT_PLAN_TEXT) {
  test(`a slot inside ${label} is no slot left in the plan`, () => {
    assert.equal(indexOf(plan, [], SLOTS).exit, 0);
  });
}

const SECOND_SCENARIO = (heading: string): string => FULL.replace("### Edge cases", `${heading}\n\nA customer resets.\n\n### Edge cases`);
const SCENARIOS: Array<[string, string, string[]]> = [
  ["a heading that is no numbered scenario", FULL.replace("### S1 - Signing in [NEW]", "### Signing in"), ['FIX: line 22: scenario heading "Signing in" must be "### S<k> - <title>", the 1th scenario in order - number it (Scenarios)']],
  ["a scenario numbered out of order", SECOND_SCENARIO("### S3 - Resetting [NEW]"), ['FIX: line 30: scenario heading "S3 - Resetting [NEW]" must be "### S<k> - <title>", the 2th scenario in order - number it (Scenarios)']],
];
for (const [label, plan, lines] of SCENARIOS) {
  test(`${label} under ## Behaviour is refused by line`, () => {
    assert.deepEqual(answerOf(indexOf(plan)), refused(4, ...lines));
  });
}

for (const [label, plan] of [
  ["S1, S2 and Edge cases", SECOND_SCENARIO("### S2 - Resetting [NEW]")],
  ["a heading inside a fenced block", SECOND_SCENARIO("```\n### Notes\n```")],
] as const) {
  test(`${label} under ## Behaviour pass`, () => {
    assert.equal(indexOf(plan).exit, 0);
  });
}

const MAP_ADD = "- add - src/login.ts - the handler";
const mapPlan = (line: string): string => PLAN.replace(MAP_ADD, line);
const HELD: Scene = { files: { "src/held.ts": "x\n" } };
const missing = (kind: string, path: string): string => `FIX: file map: ${kind} ${path}, which the tree does not hold - correct the path or list it as add (File map)`;
const MAPS: Array<[string, string[]]> = [
  ["- modify - src/gone.ts - the handler", [missing("modify", "src/gone.ts")]],
  ["- delete - `./src/gone.ts` - the old handler", [missing("delete", "src/gone.ts")]],
  ["- modify - src/held.ts, src/gone-a.ts, src/gone-b.ts - the handlers", [missing("modify", "src/gone-a.ts"), missing("modify", "src/gone-b.ts")]],
];
for (const [line, lines] of MAPS) {
  test(`the file map line "${line}" is refused for each path the tree does not hold`, () => {
    assert.deepEqual(answerOf(indexOf(mapPlan(line), [], HELD)), refused(4, ...lines));
  });
}

test("a file map adding a missing path and modifying a held one passes", () => {
  assert.equal(indexOf(mapPlan(`${MAP_ADD}\n- modify - src/held.ts - the shared helper`), [], HELD).exit, 0);
});

const BROKEN_TASK = planBody([
  { id: "T1", files: "src/a.ts" },
  { id: "T2", title: "heading to break", tdd: "maybe", covers: "AC2", uses: "none", deps: "T1", files: "src/b.ts" },
]).replace("### T2 - heading", "### T2 heading");
const BROKEN_WRITER = planBody([{ id: "T1", title: "Add it", files: "src/login.ts" }, { id: "T2", covers: "AC2", uses: "none", files: "src/b.ts" }], 2, ["### C1 - Login endpoint", "", "File: src/login.ts"]).replace("### T1 - Add it", "### T1 Add it");
const BROKEN_CONTRACT = planBody(TWO_TASKS, 2, [...CONTRACT, "", "### Logout endpoint", "", "File: src/missing.ts", "", "POST /logout -> 204"]);
const HEADINGS: Array<[string, string, string]> = [
  ["a malformed task heading raises nothing else of its block: its TDD value, its criterion, its dependency", BROKEN_TASK, 'FIX: task heading must be "### <id> - <title>", got: T2 heading to break'],
  ["the file a block with a malformed heading lists still counts as created", BROKEN_WRITER, 'FIX: task heading must be "### <id> - <title>", got: T1 Add it'],
  ["a malformed contract heading raises nothing else of its block", BROKEN_CONTRACT, 'FIX: contract heading must be "### <id> - <name>", got: Logout endpoint'],
];
for (const [label, plan, line] of HEADINGS) {
  test(label, () => {
    assert.deepEqual(answerOf(indexOf(plan)), refused(4, line));
  });
}

const SLOT_LINE = "FIX: line 6: template slot <n> left unfilled - replace it (Filled)";
test("a slot and no task block at all print the slot first, then the missing blocks, and exit 3", () => {
  assert.deepEqual(answerOf(indexOf(planBody([], 1).replace("The session is durable.", "<n>"), [], SLOTS)), refused(3, SLOT_LINE, `FIX: no <!-- TASK --> blocks in ${PLAN_REL}`));
});

const withOpen = (plan: string, ...items: string[]): string => plan.replace("## Tasks\n", ["## Open items", "", ...items, "", "## Tasks", ""].join("\n"));
const lineOf = (plan: string, line: string): number => plan.split("\n").indexOf(line) + 1;

test("a line of the Open items section of another shape is refused by its line number, on a landed plan too: a kind that is none, a missing field, an empty text, prose", () => {
  const bad = ["- minor | T1 | a kind that is none", "- note | T1", "- note | T1 | ", "Prose between the items."];
  const plan = withOpen(PLAN, "- note | T1 | a sound one", ...bad, "- critical | plan | sound too");
  const lines = bad.map((line) => `FIX: open items: line ${lineOf(plan, line)} is not "- critical|note | <task id>|plan | <text>" (Open items)`);
  assert.deepEqual(answerOf(indexOf(plan)), refused(4, ...lines));
  assert.deepEqual(answerOf(indexOf(plan, [], { status: ["done: none"] })), refused(4, ...lines));
});

test("a template slot quoted in an open item is no slot left in the plan (a script wrote the line from a review, and no fix can reach it)", () => {
  assert.equal(indexOf(withOpen(planBody([{ id: "T1" }], 1), "- note | T1 | the heading still reads S<n>"), [], SLOTS).exit, 0);
});

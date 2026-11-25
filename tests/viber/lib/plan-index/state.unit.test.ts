/*
 * state.unit.test.ts - the state of a run beside its plan, as the index shows it:
 * the done and skipped tasks, the entries passed on, the decisions and the
 * rulings, and nothing for what a run does not carry.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { PLAN_DIR, planBody, TWO_TASKS } from "../../plan-body.ts";
import { indexOf } from "./scene.ts";

const PLAN = planBody(TWO_TASKS);
const HEAD = "tasks: id | state | tdd | excl | hard | deps | feeds | files | title";
/** The lines between the title and the first task row, and the state of each task. */
const stateOf = (lines: string[]) => ({
  lines: lines.slice(2, lines.indexOf(HEAD)),
  tasks: lines.filter((line) => /^T[0-9]+ \| /.test(line)).map((line) => line.split(" | ")[1]),
});

const STATES: Array<[string, string[] | undefined, { lines: string[]; tasks: string[] }]> = [
  ["a run that never started has nothing done", undefined, { lines: ["progress: 0/2"], tasks: ["todo", "todo"] }],
  ["a done task counts as progress", ["progress: 1/2", "done: T1"], { lines: ["progress: 1/2"], tasks: ["done", "todo"] }],
  ["an entry of none is not printed", ["done: none", "skipped: none", "unreviewed: -", "deferred: none", "closed: none"], { lines: ["progress: 0/2"], tasks: ["todo", "todo"] }],
  [
    "the other entries pass through, a skipped task settled rather than todo",
    ["done: T1", "skipped: T2", "unreviewed: T1", "deferred: T2:src/reject.ts", "closed: memory qa"],
    { lines: ["progress: 1/2", "skipped: T2", "unreviewed: T1", "deferred: T2:src/reject.ts", "closed: memory qa"], tasks: ["done", "skipped"] },
  ],
  ["a key no build reads is not printed", ["done: T1 T2", "owed: T1:src/a.ts", "repaired: none", "closed: memory"], { lines: ["progress: 2/2", "closed: memory"], tasks: ["done", "done"] }],
  [
    "every decision line follows the entries in file order, a colon in its text intact",
    ["done: none", "decision: T2: scope: src/reject.ts only", "closed: memory\r", "decision: T1: keep the old handler"],
    { lines: ["progress: 0/2", "closed: memory", "decision: T2: scope: src/reject.ts only", "decision: T1: keep the old handler"], tasks: ["todo", "todo"] },
  ],
];
for (const [label, status, expected] of STATES) {
  test(label, () => {
    assert.deepEqual(stateOf(indexOf(PLAN, [], { status }).lines), expected);
  });
}

test("the entries of rulings.md follow the decisions in file order, the dash dropped and a colon in the text intact", () => {
  const rulings = ["# Rulings", "", "- T2: retry: with the note | why: a flaky port | cost if wrong: one more round", "- baseline: accept | why: red before the change | cost if wrong: a hidden failure", ""].join("\n");
  const at = indexOf(PLAN, [], { status: ["decision: T1: keep the old handler"], files: { [`${PLAN_DIR}/rulings.md`]: rulings } });
  assert.deepEqual(stateOf(at.lines).lines, [
    "progress: 0/2",
    "decision: T1: keep the old handler",
    "ruling: T2: retry: with the note | why: a flaky port | cost if wrong: one more round",
    "ruling: baseline: accept | why: red before the change | cost if wrong: a hidden failure",
  ]);
});

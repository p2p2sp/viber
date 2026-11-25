/*
 * final-review.unit.test.ts - the --final-review answer: one dispatch block per
 * slice of the plan, or the skip.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { PLAN_DIR, PLAN_REL, planBody } from "../../plan-body.ts";
import { answerOf, indexOf, labelled, ok, PLUGIN } from "./scene.ts";

const review = (count: number, status: string[], config?: string) =>
  indexOf(planBody(Array.from({ length: count }, (_, k) => ({ id: `T${k + 1}`, files: `src/t${k + 1}.ts` })), 1), ["--final-review"], { status, config });

test("a plan of at most 8 tasks is one block, the model clamped into the tiers and memory read from the config", () => {
  assert.deepEqual(
    answerOf(review(3, ["done: T1 T2"], "build:\n  memory: true\ntiers:\n  min: opus\n")),
    ok([
      "NEXT: final-review | slice: 1 | model: opus",
      `run: ${PLAN_DIR}`,
      "tasks: T1, T2, T3",
      `report: ${PLAN_DIR}/work/final-review-1.md`,
      `refs: ${PLUGIN}/references`,
      "memory: true",
      `scope: "${PLUGIN}/scripts/plan-index.sh" "${PLAN_REL}" --slice "T1,T2,T3"`,
    ]),
  );
});

test("13 tasks are a block of 7 and a block of 6, a skipped task included", () => {
  assert.deepEqual(labelled(review(13, ["done: T1 T2 T3 T4", "skipped: T5"]).lines, "NEXT", "tasks", "report", "memory"), [
    "NEXT: final-review | slice: 1 | model: sonnet",
    "tasks: T1, T2, T3, T4, T5, T6, T7",
    `report: ${PLAN_DIR}/work/final-review-1.md`,
    "memory: false",
    "NEXT: final-review | slice: 2 | model: sonnet",
    "tasks: T8, T9, T10, T11, T12, T13",
    `report: ${PLAN_DIR}/work/final-review-2.md`,
    "memory: false",
  ]);
});

for (const [label, status] of [
  ["status.md closes final-review", ["done: T1 T2", "closed: memory final-review"]],
  ["no task is done", ["done: none", "skipped: T2"]],
] as const) {
  test(`the review is skipped when ${label}`, () => {
    assert.deepEqual(answerOf(review(2, [...status])), ok(["NEXT: skip"]));
  });
}

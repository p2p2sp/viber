/*
 * input.unit.test.ts - the planner's summary file against the plan: its
 * attachments, its root cause and its reproduction test.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { PLAN_REL, planBody, TWO_TASKS, type TaskFields } from "../../plan-body.ts";
import { answerOf, indexOf, refused } from "./scene.ts";

const MOCK = "/repo/.temp/viber/prototype/mock.html";
const AUDIT = "/repo/.temp/viber/code-auditor/run-1/findings.md";
const PLAN = planBody(TWO_TASKS);
const withAttachment = (body: string, path: string): string => ["---", `source: ${PLAN_REL}`, "attachments:", `  file1: "${path}"`, "---", "", body].join("\n");
const withCause = (body: string): string => body.replace("## Acceptance criteria", "## Root cause\n\nThe cache is never invalidated.\n\n## Acceptance criteria");
const REPRO: TaskFields[] = [{ id: "T1", title: "Fix the stale read", tdd: "none", repro: "tests/stale.test.ts", files: "src/login.ts,tests/stale.test.ts" }, TWO_TASKS[1]];
const validate = (plan: string, input: string[]) => answerOf(indexOf(plan, ["--input", "input.md"], { files: { "input.md": input.map((line) => `${line}\n`).join("") } }));

const CAUSE = "Root cause: the cache is never invalidated";
const ROWS: Array<[string, string, string[], string[]]> = [
  ["an attachment no map entry holds", withAttachment(PLAN, MOCK), [`Attachment: ${MOCK}`, "Attachment: /repo/other.html\r"], ["FIX: input: Attachment /repo/other.html has no entry in the attachments map - add one (Attachments)"]],
  ["a root cause line and no Root cause section", PLAN, [CAUSE], ['FIX: input gives a root cause but the plan has no "## Root cause" section - add it (Root cause)']],
  ["an audit attachment and no Root cause section", withAttachment(PLAN, AUDIT), [`Attachment: ${AUDIT}`], ['FIX: input gives a root cause but the plan has no "## Root cause" section - add it (Root cause)']],
  ["no cause and a Root cause section", withCause(PLAN), ["Issue: https://example.test/issues/1"], ['FIX: the plan carries a "## Root cause" section its input gives no cause for - drop it (Root cause)']],
  ["a Repro path on no task", planBody(REPRO), ["Repro: tests/other.test.ts"], ["FIX: input: Repro tests/other.test.ts is on no task Repro: line - put it on the fixing task (Reproduced)"]],
];
for (const [label, plan, input, lines] of ROWS) {
  test(`${label} is refused`, () => {
    assert.deepEqual(validate(plan, input), refused(4, ...lines));
  });
}

test("a mapped attachment, a cause with its section and a Repro path on a task pass", () => {
  assert.equal(validate(withAttachment(withCause(planBody(REPRO)), MOCK), [`Attachment: ${MOCK}`, CAUSE, "Repro: ./tests/stale.test.ts"]).exit, 0);
});

test("a plan validated without --input runs none of the input checks", () => {
  assert.equal(indexOf(withCause(PLAN)).exit, 0);
});

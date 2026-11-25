/*
 * dispatch.unit.test.ts - the --dispatch answer: the labelled lines of a coder and
 * of a reviewer dispatch, in order, each left out when it has no value.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { DISPATCH_TASKS, PLAN_DIR, PLAN_REL, planBody, type TaskFields } from "../../plan-body.ts";
import { answerOf, indexOf, ok, PLUGIN, type Scene } from "./scene.ts";

const dispatch = (id: string, form: string, given: Scene = {}, tasks: TaskFields[] = DISPATCH_TASKS) => answerOf(indexOf(planBody(tasks, 1), ["--dispatch", id, form], { status: ["done: none"], ...given }));

const common = (id: string): string[] => [`task: ${PLAN_DIR}/tasks/${id}.md`, `notes: ${PLAN_DIR}/work/${id}-coder.md`, `out: .temp/viber/${id}/`, `refs: ${PLUGIN}/references`];
const coder = (id: string, ...more: string[]) => ok([...common(id), `extras: ${PLAN_DIR}/work/${id}-extra.md`, `decide-file: ${PLAN_DIR}/work/${id}-options.md`, ...more]);
const LESSONS = ".temp/viber/lessons";
const IN_REPO: Scene = { repo: {} };

const ROWS: Array<[string, string, Scene, string[], TaskFields[]?]> = [
  ["a task's own dependencies are its prior notes, and no baseline line stands while build.baseline-tests is off", "T3", {}, [`prior: ${PLAN_DIR}/work/T2-coder.md`]],
  ["two dependencies name both notes in order", "T3", {}, [`prior: ${PLAN_DIR}/work/T1-coder.md, ${PLAN_DIR}/work/T2-coder.md`], [{ id: "T1", files: "src/1.ts" }, { id: "T2", files: "src/2.ts" }, { id: "T3", deps: "T1, T2", files: "src/3.ts" }]],
  ...["fast", "full"].map((value): [string, string, Scene, string[]] => [`build.baseline-tests ${value} adds the baseline line`, "T1", { config: `build:\n  baseline-tests: ${value}\n` }, [`baseline: ${PLAN_DIR}/work/tests-baseline.md`]]),
  ["deferred joins the entries naming the task, a bracketed path intact", "T1", { status: ["deferred: T1:src/x.ts T2:src/other.ts T1:src/[id]/y.ts"] }, ["deferred: src/x.ts, src/[id]/y.ts"]],
  [
    "decision lines of the task and of every task it depends on, directly or through another, follow in file order",
    "T3",
    { status: ["decision: T2: scope: src/two.ts only", "decision: T4: unrelated", "decision: T3: keep the handler", "decision: T1: older ruling"] },
    [`prior: ${PLAN_DIR}/work/T2-coder.md`, "decision: T2: scope: src/two.ts only", "decision: T3: keep the handler", "decision: T1: older ruling"],
  ],
  ["run-lessons is the second line of the lessons file, its prefix dropped", "T1", { ...IN_REPO, files: { [LESSONS]: "started: 100\nlessons: Public x2, State x1\r\n" } }, ["run-lessons: Public x2, State x1"]],
  ["run-lessons takes a bare list line as it is", "T1", { ...IN_REPO, files: { [LESSONS]: "started: 100\nPublic x2\n" } }, ["run-lessons: Public x2"]],
  ["an empty lessons line adds nothing", "T1", { ...IN_REPO, files: { [LESSONS]: "started: 100\n\n" } }, []],
];
for (const [label, id, given, more, tasks] of ROWS) {
  test(`--dispatch coder: ${label}`, () => {
    assert.deepEqual(dispatch(id, "coder", given, tasks), coder(id, ...more));
  });
}

test("--dispatch reviewer prints its own lines in order, with no prior, decide-file or run-lessons line", () => {
  const given: Scene = { ...IN_REPO, status: ["deferred: T3:src/x.ts", "decision: T1: older ruling"], config: "build:\n  baseline-tests: fast\n", files: { [LESSONS]: "started: 100\nlessons: Public x2\n" } };
  assert.deepEqual(
    dispatch("T3", "reviewer", given),
    ok([
      ...common("T3"),
      `baseline: ${PLAN_DIR}/work/tests-baseline.md`,
      "deferred: src/x.ts",
      "decision: T1: older ruling",
      `extras: ${PLAN_DIR}/work/T3-extra-review.md`,
      `scope: "${PLUGIN}/scripts/plan-index.sh" "${PLAN_REL}" --extra "T3"`,
    ]),
  );
});

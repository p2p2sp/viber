/*
 * slice.unit.test.ts - the --slice answer, over the history git answers: which
 * commits belong to the tasks of a slice and which of their files the final
 * review of it reads. What git itself lists is held by the contract cases of the
 * Git port.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { PLAN_REL, planBody, type TaskFields } from "../../plan-body.ts";
import { answerOf, indexOf, ok } from "./scene.ts";

const TASKS: TaskFields[] = ["First", "Second", "Third", "Fourth"].map((title, k) => ({ id: `T${k + 1}`, title, files: `src/${k + 1}.ts` }));

/** The answer over commits given as [subject, files], oldest first, after the one that added the plan. */
function slice(ids: string, commits: Array<[string, string[]]>) {
  const shas = commits.map((_, k) => `abc000${k + 1}`);
  return answerOf(
    indexOf(planBody(TASKS, 1), ["--slice", ids], {
      status: ["done: none"],
      repo: {
        added: { [PLAN_REL]: ["base"] },
        log: { base: commits.map(([subject], k) => ({ short: shas[k], subject })) },
        committed: Object.fromEntries(commits.map(([, files], k) => [shas[k], files])),
      },
    }),
  );
}

test("--slice prints each commit of its tasks, a numbered fix included, oldest first, and no other commit", () => {
  assert.deepEqual(
    slice("T2,T3", [
      ["T1 - First", ["src/one.ts"]],
      ["T2 - Second", ["src/two.ts"]],
      ["chore(viber): record T2 done", ["docs/status.md"]],
      ["T2(2) - Second", ["src/two.ts"]],
      ["T2(x) - Second", ["src/x.ts"]],
      ["T2 - Second thoughts", ["src/y.ts"]],
      ["T3 - Third", ["src/three.ts"]],
      ["T4 - Fourth", ["src/four.ts"]],
    ]),
    ok(["commit: T2 | abc0002 | T2 - Second", "commit: T2 | abc0004 | T2(2) - Second", "commit: T3 | abc0007 | T3 - Third", "file: src/three.ts", "file: src/two.ts"]),
  );
});

test("--slice lists each path once in byte order, less one a lower-numbered task outside the slice also changed (a higher one excludes nothing)", () => {
  assert.deepEqual(
    slice("T2", [
      ["T1 - First", ["shared.ts", "src/one.ts"]],
      ["T2 - Second", ["Zed.ts", "shared.ts", "src/gone.ts", "src/two.ts"]],
      ["T2(2) - Second", ["src/gone.ts", "src/two.ts"]],
      ["T3 - Third", ["src/two.ts"]],
    ]),
    ok(["commit: T2 | abc0002 | T2 - Second", "commit: T2 | abc0003 | T2(2) - Second", "file: Zed.ts", "file: src/gone.ts", "file: src/two.ts"]),
  );
});

test("--slice with no commit of its tasks prints nothing", () => {
  assert.deepEqual(slice("T3,T4", [["T1 - First", ["src/one.ts"]]]), ok([]));
});

test("--slice of a plan no commit added prints nothing", () => {
  assert.deepEqual(answerOf(indexOf(planBody(TASKS, 1), ["--slice", "T1"], { status: ["done: none"], repo: {} })), ok([]));
});

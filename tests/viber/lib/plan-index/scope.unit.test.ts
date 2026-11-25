/*
 * scope.unit.test.ts - the --extra answer: which paths of the coder's extras file
 * reach the reviewer's scope, in which spelling, and the done tasks they recheck.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { PLAN_DIR, planBody, SCOPE_TASKS } from "../../plan-body.ts";
import { answerOf, indexOf, ok } from "./scene.ts";

/** A run with T1 and T4 done, T3 under review, its coder's extras file holding the text. */
const scope = (extras: string | null, files: Record<string, string> = {}) =>
  answerOf(
    indexOf(planBody(SCOPE_TASKS, 1), ["--extra", "T3"], {
      status: ["progress: 2/4", "done: T1 T4"],
      files: { ...(extras === null ? {} : { [`${PLAN_DIR}/work/T3-extra.md`]: extras }), ...files },
    }),
  );

const TREE = { "src/todo.ts": "x\n", "src/done-a.ts": "x\n", "README.md": "x\n" };
const ROWS: Array<[string, string, string[]]> = [
  ["a path no task claims is printed", "lib/new.ts\n", ["extra: lib/new.ts"]],
  ["a path under .temp/ is left off", ".temp/viber/T3/out.md\nlib/new.ts\n", ["extra: lib/new.ts"]],
  ["a path a done task claims rechecks that task", "src/done-a.ts\n", ["extra: src/done-a.ts", "recheck: T1 | npm test"]],
  ["a path the task lists itself is left off", "src/own.ts\n", []],
  ["a path an open task claims is left off: its own coder owns it", "src/todo.ts\n", []],
  ["several paths print on one line in file order, each done task rechecked once in task order", "src/done-b.ts\nlib/b.ts\nsrc/done-a2.ts\nsrc/done-a.ts\nlib/b.ts\n", ["extra: src/done-b.ts,lib/b.ts,src/done-a2.ts,src/done-a.ts", "recheck: T1 | npm test", "recheck: T4 | npm test"]],
  ["blank lines are ignored and a carriage return or a leading ./ is cut", "\n./lib/a.ts\r\n\r\nlib/b.ts\r\n\n", ["extra: lib/a.ts,lib/b.ts"]],
  ["a backslashed path is read with forward slashes", "src\\b.ts\r\nsrc\\todo.ts\n", ["extra: src/b.ts"]],
  ["an absolute path of an open task's file is left off as its relative one is", "/r/src/todo.ts\n", []],
  ["an absolute path inside the repository is printed relative, one in its root included", "/r/src/done-a.ts\r\n/r/README.md\n", ["extra: src/done-a.ts,README.md", "recheck: T1 | npm test"]],
  ["an absolute path outside the repository is printed as written", "/elsewhere/lib/x.ts\n", ["extra: /elsewhere/lib/x.ts"]],
  ["a file leaving no path prints nothing", "\n.temp/viber/T3/out.md\nsrc/own.ts\n", []],
];
for (const [label, extras, lines] of ROWS) {
  test(`--extra: ${label}`, () => {
    assert.deepEqual(scope(extras, TREE), ok(lines));
  });
}

test("--extra reads the coder's file alone: with none it prints nothing, whatever the reviewer's holds", () => {
  assert.deepEqual(scope(null, { [`${PLAN_DIR}/work/T3-extra-review.md`]: "lib/reviewer-only.ts\n" }), ok([]));
});

test("--extra: a path only a skipped task lists is printed (a skipped task never finishes, so it claims nothing, as in the file guard, task-ready and the commit check), and no recheck names that task", () => {
  const at = indexOf(planBody(SCOPE_TASKS, 1), ["--extra", "T3"], {
    status: ["progress: 2/4", "done: T1 T4", "skipped: T2"],
    files: { [`${PLAN_DIR}/work/T3-extra.md`]: "src/todo.ts\nlib/new.ts\n", ...TREE },
  });
  assert.deepEqual(answerOf(at), ok(["extra: src/todo.ts,lib/new.ts"]));
});

test("under a drive root an MSYS path of the extras file is read as the drive path it spells", () => {
  const at = indexOf("", [], {
    cwd: "C:\\r",
    files: {
      [`C:/r/${PLAN_DIR}/plan.md`]: planBody(SCOPE_TASKS, 1),
      [`C:/r/${PLAN_DIR}/work/T3-extra.md`]: "/c/r/src/todo.ts\n/c/r/lib/x.ts\n/c/other/y.ts\n",
      "C:/r/src/todo.ts": "x\n",
      "C:/r/lib/x.ts": "x\n",
    },
  });
  assert.deepEqual(at.call(`C:\\r\\${PLAN_DIR.replaceAll("/", "\\")}\\plan.md`, "--extra", "T3").stdout, "extra: lib/x.ts,/c/other/y.ts\n");
});

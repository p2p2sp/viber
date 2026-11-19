/*
 * pr-threads.critical.test.ts - the critical tier of
 * viber/scripts/pr-threads.sh: a ready run prints the status block with one
 * thread line per unresolved thread and the threads file.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by pr-threads.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/pr-threads.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import {
  assertPosix,
  withScene,
  type FixtureThread,
  ghOut,
  comment,
  runThreads,
  lines,
  THREADS_PATH,
} from "./pr-threads-fixture.ts";

test("a ready run prints THREADS_FILE=, SKIPPED=, TRUNCATED= and one THREAD= line per unresolved thread after PUSHED=, none for a resolved one", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const threads: FixtureThread[] = [
        { path: "src/a.ts", line: 12, comments: [comment(101, "alice", "first")] },
        { resolved: true, path: "src/b.ts", line: 3, comments: [comment(102, "bob", "done")] },
        { path: "src/c.ts", line: 30, comments: [comment(103, "carol", "second"), comment(104, "dave", "reply")] },
      ];
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { threads }) } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(lines(result).slice(6), [
        `THREADS_FILE=${THREADS_PATH}`,
        "SKIPPED=0",
        "TRUNCATED=no",
        "THREAD=1 | 101 | src/a.ts:12 | alice | current",
        "THREAD=2 | 103 | src/c.ts:30 | carol | current",
      ]);
    });
  });
});

/*
 * map-signals.critical.test.ts - the critical tier of
 * viber/skills/code-auditor/scripts/map-signals.sh: the script prints the
 * mapper block naming the run file, lens file, signals file and map output.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by map-signals.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/map-signals.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { withGitRepo } from "../harness/tmp.ts";
import { assertPosix, lines, frame, run } from "./map-signals-fixture.ts";

test("stdout is the NEXT: mapper block naming the run file, the lens file, the signals file and the map output", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      const ws = frame(repo, ["# Signals"]);
      const result = await run(shell, repo, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      const expected = lines([
        "NEXT: mapper",
        `Run file: ${ws}/run.md`,
        `Lens file: ${ws}/lens.md`,
        `Signals: ${ws}/signals.md`,
        `Output: ${ws}/map.md`,
      ]);
      assert.equal(result.stdout, expected);
    });
  });
});

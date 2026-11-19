/*
 * pr-facts.critical.test.ts - the critical tier of viber/scripts/pr-facts.sh:
 * a ready block prints every line in order for a given target, and the rerun
 * line keeps the drive-letter spelling of the invoked path on Windows.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by pr-facts.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/pr-facts.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";

import { runScript, type RunResult } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import {
  SUT,
  assertPosix,
  REPO_URL,
  withScene,
  onBranch,
  runFacts,
  lines,
  value,
  shortSha,
  PLUGIN_ROOT,
} from "./pr-facts-fixture.ts";

/** The output lines with the stamped BODY_FILE= value masked as `<stamped path>`. */
function stampless(result: RunResult): string[] {
  return lines(result).map((l) => (l.startsWith("BODY_FILE=") ? "BODY_FILE=<stamped path>" : l));
}

test("a ready block prints every C9 line in order, QA= right after SPEC=, for a target given on the command line", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x");
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(stampless(result), [
        "STATUS=ready",
        `REPO=${REPO_URL}`,
        "BRANCH=feature/x",
        "DEFAULT=main",
        "MODE=off",
        "ENTRY=",
        "TARGET=develop",
        "CLOSES=no",
        "TYPE=feat",
        "ISSUE_TITLE=",
        "TEMPLATE=",
        "SPEC=",
        "QA=",
        "TITLE_PATTERN=[{issue-number}] {summary}",
        `COMMIT=${await shortSha(scene.work, "HEAD")} work`,
        "TITLE=",
        "TITLE_TEMPLATE=[] {summary}",
        "BODY_FILE=<stamped path>",
      ]);
    });
  });
});

// The invoked spelling is the contract: a C:\ or C:/ path is printed as C:/, a /c/ path as /c/.
// Neither spelling names a file outside Windows, so the cases skip there.
const WINDOWS_ONLY = process.platform === "win32" ? false : "a C:\\ or /c/ spelling names a file only on Windows";
const MSYS = (p: string) => slash(p).replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

const SPELLINGS: Array<{ label: string; invoked: string; root: string }> = [
  { label: "a C:\\ path", invoked: SUT, root: PLUGIN_ROOT },
  { label: "a C:/ path", invoked: slash(SUT), root: PLUGIN_ROOT },
  { label: "a /c/ path", invoked: MSYS(SUT), root: MSYS(PLUGIN_ROOT) },
];

for (const row of SPELLINGS) {
  test(`invoked by ${row.label}, RERUN= names pr-facts.sh under the plugin root in that spelling (AC1)`, { skip: WINDOWS_ONLY }, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        await onBranch(scene, "feature/x");
        const result = await runScript(row.invoked, [], { shell, cwd: scene.work.dir, env: scene.work.env, stubDirs: [scene.stubDir] });
        assert.equal(value(result, "RERUN"), `"${row.root}/scripts/pr-facts.sh" --target "<branch>"`);
      });
    });
  });
}

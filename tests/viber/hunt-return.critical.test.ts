/*
 * hunt-return.critical.test.ts - the critical tier of
 * viber/skills/code-auditor/scripts/hunt-return.sh, the wrapper of the
 * hunt-return.ts entry: each claim prints one critic block in ascending order,
 * and the block names its paths in the C:/ form on Windows, whichever spelling
 * invoked it.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the id
 * rules, the retries and every block are proven in process by
 * tests/viber/lib/hunt-return.unit.test.ts. This file runs on every operating
 * system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/hunt-return.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import {
  SUT,
  SKILL_DIR,
  PLUGIN_ROOT,
  assertPosix,
  frame,
  run,
  put,
  U1_LEDGER,
  criticBlock,
} from "./hunt-return-fixture.ts";

test("each claim prints one critic block in ascending k whatever the order the sidecars were written in", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("hunt-return-", async (dir) => {
      const { ws, lensFile } = frame(dir, { ledger: U1_LEDGER });
      put(ws, "U1-3.claim.md", "LOCATION: c\n");
      put(ws, "U1-1.claim.md", "LOCATION: a\n");
      put(ws, "U1-2.claim.md", "LOCATION: b\n");
      put(ws, "U1-1.md", "report\n");
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(
        slash(result.stdout),
        criticBlock(ws, lensFile, "U1-1") + criticBlock(ws, lensFile, "U1-2") + criticBlock(ws, lensFile, "U1-3"),
      );
    });
  });
});

// Every invoked spelling prints the C:/ form: the MSYS runtime hands node the entry path of a /c/ call as C:/...
// Neither spelling names a file outside Windows, so the cases skip there.
const WINDOWS_ONLY = process.platform === "win32" ? false : "a C:\\ or /c/ spelling names a file only on Windows";
const MSYS = (p: string) => slash(p).replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

const SPELLINGS: Array<{ label: string; invoked: string; skillDir: string; pluginRoot: string }> = [
  { label: "a C:\\ path", invoked: SUT, skillDir: SKILL_DIR, pluginRoot: PLUGIN_ROOT },
  { label: "a C:/ path", invoked: slash(SUT), skillDir: SKILL_DIR, pluginRoot: PLUGIN_ROOT },
  { label: "a /c/ path", invoked: MSYS(SUT), skillDir: SKILL_DIR, pluginRoot: PLUGIN_ROOT },
];

for (const row of SPELLINGS) {
  test(`invoked by ${row.label}, a critic block prints its worktree script, overlay script and test rules in the C:/ form`, { skip: WINDOWS_ONLY }, async () => {
    await assertPosix(async (shell) => {
      await withTempDir("hunt-return-", async (dir) => {
        const { ws } = frame(dir, { lens: "tests", worktree: true, ledger: ["hunt: A-alpha | wave: 1 | unit: none | angle: alpha"] });
        put(ws, "A-alpha-1.claim.md", "LOCATION: a\n");
        const result = await runScript(row.invoked, [ws, "hunter", "A-alpha"], { shell, cwd: path.dirname(ws) });
        assert.equal(result.status, 0, `stderr=${result.stderr}`);
        assert.deepEqual(result.stdout.split("\n").filter((line) => /^(Test rules|Worktree script|Overlay script): /.test(line)), [
          `Worktree script: ${row.skillDir}/scripts/worktree.sh`,
          `Overlay script: ${row.skillDir}/scripts/diff-overlay.sh`,
          `Test rules: ${row.pluginRoot}/references/test-strategy.md`,
        ]);
      });
    });
  });
}

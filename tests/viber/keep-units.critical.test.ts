/*
 * keep-units.critical.test.ts - the critical tier of
 * viber/skills/code-auditor/scripts/keep-units.sh, the wrapper of the
 * keep-units.ts entry: a directory scope prints one hunter block per unit, and
 * the block names its paths in the C:/ form on Windows, whichever spelling
 * invoked it.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the map
 * gate, the scouts, the kept order and the variant wave are proven in process
 * by tests/viber/lib/keep-units.unit.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/keep-units.critical.test.ts
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
  lines,
  mapOf,
  unitLines,
  frame,
  run,
} from "./keep-units-fixture.ts";

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
  test(`invoked by ${row.label}, a hunter block prints its worktree script, overlay script and test rules in the C:/ form`, { skip: WINDOWS_ONLY }, async () => {
    await assertPosix(async (shell) => {
      await withTempDir("keep-units-", async (dir) => {
        const { ws } = frame(dir, { lens: "tests", worktree: true, angles: ["only"] });
        const result = await runScript(row.invoked, [ws], { shell, cwd: path.dirname(ws) });
        assert.equal(result.status, 0, `stderr=${result.stderr}`);
        assert.deepEqual(result.stdout.split("\n").filter((line) => /^(Test rules|Worktree script|Overlay script): /.test(line)), [
          `Test rules: ${row.pluginRoot}/references/test-strategy.md`,
          `Worktree script: ${row.skillDir}/scripts/worktree.sh`,
          `Overlay script: ${row.skillDir}/scripts/diff-overlay.sh`,
        ]);
      });
    });
  });
}

test("a directory scope with no more units than 8 prints one hunter block per unit, the unit line verbatim, id U<n>", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("keep-units-", async (dir) => {
      const { ws, lensFile } = frame(dir, { scope: "src", map: mapOf(unitLines(8)) });
      const result = await run(shell, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      const out = slash(result.stdout);
      assert.equal(out.split("NEXT: hunter").length - 1, 8);
      assert.ok(
        out.includes(
          lines(
            "NEXT: hunter | id: U3 | background",
            `Run file: ${ws}/run.md`,
            `Lens file: ${lensFile}`,
            `Schema: ${SKILL_DIR}/references/synthesis.md`,
            `Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`,
            "Hunt: U3",
            "Unit: - U3 | src/m3 | why 3",
            `Reports: ${ws}/reports/U3`,
          ),
        ),
        out,
      );
      assert.equal(out.includes("Angle:"), false);
    });
  });
});

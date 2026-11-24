/*
 * switch-text.critical.test.ts - the critical tier of
 * viber/scripts/switch-text.sh, the wrapper of the switch-text.ts entry: a
 * true switch prints its fragment byte for byte, and a skill directory written
 * with backslashes still derives the plugin root.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the
 * selection itself is proven in process by
 * tests/viber/lib/switch-text.unit.test.ts. This file runs on every operating
 * system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/switch-text.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withGitRepo } from "../harness/tmp.ts";
import { skillDir, writeConfig, writeFragment, run } from "./switch-text-fixture.ts";

test("a true switch prints its .true.md fragment, byte for byte", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "planning:\n  adr: true\n");
    writeFragment(repo, "step.true.md", "ADR on.\n\nSecond line.\n");
    writeFragment(repo, "step.false.md", "ADR off.\n");

    const result = await run(repo, ["planning.adr", skillDir(repo), "step"]);

    assert.deepEqual([result.status, result.stdout], [0, "ADR on.\n\nSecond line.\n"]);
  });
});

test(
  "a skill directory written with backslashes derives the plugin root across them (a Windows CLAUDE_SKILL_DIR)",
  { skip: process.platform === "win32" ? "a backslash is a separator on Windows, so every other case already proves it there" : false },
  async () => {
    await withGitRepo(async (repo) => {
      writeConfig(repo, "build:\n  qa: true\n");
      const dir = "C:\\host\\plugin\\skills\\demo";
      fs.mkdirSync(path.join(repo.dir, dir, "fragments"), { recursive: true });
      fs.writeFileSync(path.join(repo.dir, dir, "fragments", "step.true.md"), "${CLAUDE_PLUGIN_ROOT}|${CLAUDE_SKILL_DIR}\n");

      const result = await run(repo, ["build.qa", dir, "step"]);

      assert.deepEqual([result.status, result.stdout], [0, `C:\\host\\plugin|${dir}\n`]);
    });
  },
);

/*
 * skill-part.critical.test.ts - the critical tier of
 * viber/scripts/skill-part.sh: a skill part prints with both root placeholders
 * expanded and a fragment block replaced by the fragment of the configured
 * switch value.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by skill-part.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/skill-part.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { withGitRepo } from "../harness/tmp.ts";
import {
  FENCE,
  MEMORY_CALL,
  skillDir,
  writeConfig,
  writePart,
  writeFragment,
  run,
} from "./skill-part-fixture.ts";

test("both root placeholders expand to the skill dir as passed and to its parent's parent", async () => {
  await withGitRepo(async (repo) => {
    writePart(repo, "close", "skill=${CLAUDE_SKILL_DIR} root=${CLAUDE_PLUGIN_ROOT} again=${CLAUDE_SKILL_DIR}\n");
    const dir = `${repo.dir}/plugin/skills/demo/`;

    const result = await run(repo, [dir, "close"]);

    assert.deepEqual(
      [result.status, result.stdout],
      [0, `skill=${dir} root=${repo.dir}/plugin again=${dir}\n`],
    );
  });
});

test("a fragment block prints the fragment of the configured switch value in its place, fence lines removed", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "build:\n  memory: true\n");
    writeFragment(repo, "memory.true.md", "Update the memory.\n\nSecond line.\n");
    writeFragment(repo, "memory.false.md", "No memory.\n");
    writePart(repo, "close", `before\n\n${FENCE}!\n${MEMORY_CALL}\n${FENCE}\n\nafter\n`);

    const result = await run(repo, [skillDir(repo), "close"]);

    assert.deepEqual([result.status, result.stdout], [0, "before\n\nUpdate the memory.\n\nSecond line.\n\nafter\n"]);
  });
});

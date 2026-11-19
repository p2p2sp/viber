/*
 * check_node.critical.test.ts - the critical tier of
 * viber/skills/pro-designer/scripts/check_node.sh: a node new enough to strip
 * types prints NODE_OK, and an old node prints NODE_MISSING.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by check_node.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/check_node.critical.test.ts
 */

import { test } from "../harness/test.ts";

import { runScript } from "../harness/run.ts";
import { withStub } from "../harness/stub.ts";
import { SUT, assertPosix, assertOneLine } from "./check_node-fixture.ts";

const NODE_OK_VERSIONS = ["v26.0.0", "v24.0.0", "v23.6.0"];
const NODE_MISSING_VERSIONS = ["v22.5.0", "v20.0.0"];

test("node >= 23.6 (type stripping on by default) -> NODE_OK node", async () => {
  await assertPosix(async (shell) => {
    for (const version of NODE_OK_VERSIONS) {
      await withStub("node", `echo '${version}'`, async (stubDir) => {
        const result = await runScript(SUT, [], { shell, stubDirs: [stubDir] });
        assertOneLine(result, "NODE_OK node");
      });
    }
  });
});

test("node < 22.6 -> NODE_MISSING", async () => {
  await assertPosix(async (shell) => {
    for (const version of NODE_MISSING_VERSIONS) {
      await withStub("node", `echo '${version}'`, async (stubDir) => {
        const result = await runScript(SUT, [], { shell, stubDirs: [stubDir] });
        assertOneLine(result, "NODE_MISSING");
      });
    }
  });
});

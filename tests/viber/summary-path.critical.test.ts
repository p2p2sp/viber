/*
 * summary-path.critical.test.ts - the critical tier of
 * viber/skills/intent/scripts/summary-path.sh, the wrapper of the
 * summary-path.ts entry: in a repository the script prints the NEXT: write
 * line with an absolute forward-slash path under .temp/viber/intent/ and a
 * stamped file name.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the root,
 * the stamp and the errors are proven in process by
 * tests/viber/lib/summary-path.unit.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/summary-path.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withGitRepo } from "../harness/tmp.ts";
import { SUT } from "./summary-path-fixture.ts";

const STAMPED_FILE = /\/\.temp\/viber\/intent\/summary-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.md\n$/;

test("in a repository it prints the NEXT: write line with an absolute forward slash path under .temp/viber/intent/ and a stamped file name", async () => {
  await withGitRepo(async (repo) => {
    const root = slash(fs.realpathSync(repo.dir));

    const result = await runScript(SUT, [], { cwd: repo.dir, env: repo.env, shell: "bash" });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.startsWith(`NEXT: write | path: ${root}/.temp/viber/intent/summary-`), result.stdout);
    assert.match(result.stdout, STAMPED_FILE);
  });
});

/*
 * issue-templates.critical.test.ts - the critical tier of
 * viber/scripts/issue-templates.sh: several issue templates are listed ready
 * in file name order with config files and markdown excluded.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by issue-templates.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/issue-templates.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { withGitRepo } from "../harness/tmp.ts";
import { assertPosix, writeTemplates, runStubbed } from "./issue-templates-fixture.ts";

test("ready: several templates listed in file name order, config.yml/.yaml and a .md file excluded", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      writeTemplates(repo.dir, {
        "z-other.yaml": "name: Other\ndescription: Something else\n",
        "a-bug.yml": "name: Bug report\ndescription: File a bug\n",
        "config.yml": "blank_issues_enabled: false\n",
        "readme.md": "# not a form\n",
      });
      const { result } = await runStubbed(shell, repo.dir, repo.env, [], { GH_STDOUT: "https://github.com/acme/widgets\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const lines = result.stdout.split("\n");
      assert.equal(lines[0], "STATUS=ready");
      assert.equal(lines[1], "REPO=https://github.com/acme/widgets");
      assert.equal(lines[3], "--- template .github/ISSUE_TEMPLATE/a-bug.yml ---");
      const nextBlock = result.stdout.indexOf("--- template .github/ISSUE_TEMPLATE/z-other.yaml ---");
      assert.ok(nextBlock > 0, result.stdout);
      assert.doesNotMatch(result.stdout, /config\.yml|readme\.md/);
    });
  });
});

/*
 * attach-lines.critical.test.ts - the critical tier of
 * viber/scripts/attach-lines.sh: files and directories under .temp/ print one
 * absolute forward-slash Attachment line each in argument order.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by attach-lines.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/attach-lines.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo } from "../harness/tmp.ts";
import { SUT, assertPosix, write, rootOf } from "./attach-lines-fixture.ts";

test("a file and a directory under .temp/ print one Attachment: line each, absolute with forward slashes, in argument order", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      write(repo, ".temp/viber/prototype/mock.html");
      write(repo, ".temp/findings.md");
      fs.mkdirSync(path.join(repo.dir, ".temp", "viber", "shots"), { recursive: true });
      const root = rootOf(repo);

      const result = await runScript(SUT, [".temp/viber/shots", ".temp/findings.md", path.join(repo.dir, ".temp", "viber", "prototype", "mock.html")], {
        cwd: repo.dir,
        env: repo.env,
        shell,
      });

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        `Attachment: ${root}/.temp/viber/shots\nAttachment: ${root}/.temp/findings.md\nAttachment: ${root}/.temp/viber/prototype/mock.html\n`,
      );
    });
  });
});

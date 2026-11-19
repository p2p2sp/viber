/*
 * diff-overlay.critical.test.ts - the critical tier of
 * viber/skills/code-auditor/scripts/diff-overlay.sh: staged, unstaged, deleted
 * and untracked changes land in the checkout while ignored and workspace files
 * stay out.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by diff-overlay.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/diff-overlay.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { assertPosix, withCheckout, overlay, stage } from "./diff-overlay-fixture.ts";

test("staged, unstaged, deleted and untracked changes land in the checkout and ignored or workspace files stay out", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(shell, async (repo, wt) => {
      fs.writeFileSync(path.join(repo.dir, "staged.txt"), "staged edit\n");
      await stage(repo, "staged.txt");
      fs.writeFileSync(path.join(repo.dir, "unstaged.txt"), "unstaged edit\n");
      const rm = await repo.git("rm", "-q", "--", "gone.txt");
      assert.equal(rm.status, 0, `git rm failed: ${rm.stderr}`);
      fs.mkdirSync(path.join(repo.dir, "sub"));
      fs.writeFileSync(path.join(repo.dir, "sub", "fresh.txt"), "fresh\n");
      fs.writeFileSync(path.join(repo.dir, "noise.log"), "ignored\n");
      fs.mkdirSync(path.join(repo.dir, ".temp/viber/code-auditor/run-1"), { recursive: true });
      fs.writeFileSync(path.join(repo.dir, ".temp/viber/code-auditor/run-1/findings.md"), "workspace\n");

      const result = await overlay(shell, repo, wt);

      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(result.stdout, "OVERLAY_APPLIED 4\n");
      assert.equal(fs.readFileSync(path.join(wt, "staged.txt"), "utf8"), "staged edit\n");
      assert.equal(fs.readFileSync(path.join(wt, "unstaged.txt"), "utf8"), "unstaged edit\n");
      assert.equal(fs.existsSync(path.join(wt, "gone.txt")), false);
      assert.equal(fs.readFileSync(path.join(wt, "sub", "fresh.txt"), "utf8"), "fresh\n");
      assert.equal(fs.readFileSync(path.join(wt, "keep.txt"), "utf8"), "keep seed\n");
      assert.equal(fs.existsSync(path.join(wt, "noise.log")), false);
      assert.equal(fs.existsSync(path.join(wt, ".temp/viber/code-auditor")), false);
    });
  });
});

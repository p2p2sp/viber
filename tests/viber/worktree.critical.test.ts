/*
 * worktree.critical.test.ts - the critical tier of
 * viber/skills/code-auditor/scripts/worktree.sh: add creates a verified
 * worktree, remove clears one holding untracked files, and a filesystem root,
 * the target root itself or its parent as the path is refused before anything
 * is deleted.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by worktree.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/worktree.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { slash } from "../harness/paths.ts";
import {
  assertPosix,
  run,
  withSeededRepo,
  assertOneLine,
  assertFailed,
  assertRepoIntact,
} from "./worktree-fixture.ts";

test("add creates a verified worktree carrying the repo content", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo, wt) => {
      const result = await run(shell, repo, ["add", repo.dir, wt]);
      assertOneLine(result, `WORKTREE_READY ${wt}`, 0);
      assert.equal(fs.readFileSync(path.join(wt, "src.txt"), "utf8"), "one\n");
    });
  });
});

test("remove clears a worktree holding untracked replay artifacts", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo, wt) => {
      assertOneLine(await run(shell, repo, ["add", repo.dir, wt]), `WORKTREE_READY ${wt}`, 0);
      fs.writeFileSync(path.join(wt, "poc.py"), "print(1)\n");
      fs.writeFileSync(path.join(wt, "src.txt"), "modified\n");
      const result = await run(shell, repo, ["remove", repo.dir, wt]);
      assertOneLine(result, `WORKTREE_REMOVED ${wt}`, 0);
      assert.equal(fs.existsSync(wt), false);
    });
  });
});

test("a filesystem root as the worktree path is rejected", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo) => {
      assertFailed(await run(shell, repo, ["remove", repo.dir, "/"]));
      assertFailed(await run(shell, repo, ["remove", repo.dir, "C:/"]));
    });
  });
});

test("the target root itself as the worktree path is rejected", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo) => {
      // slash() only rewrites separators, so this is the target root spelled a
      // second way - the guard must recognise it as the root whichever
      // separator the caller used, or `remove` rm -rf's the repo it was
      // anchored to and still reports success.
      const result = await run(shell, repo, ["remove", repo.dir, slash(repo.dir)]);
      assertFailed(result);
      assert.match(result.stdout, /must not be the target root/);
      assert.ok(fs.existsSync(repo.dir), "the target root must survive a rejected remove");
    });
  });
});

test("the parent directory of the target root as the worktree path is rejected (remove would rm -rf the repo with it)", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo) => {
      fs.writeFileSync(path.join(repo.dir, "keep.txt"), "keep\n");
      const result = await run(shell, repo, ["remove", repo.dir, slash(path.dirname(repo.dir))]);
      assertFailed(result);
      assert.match(result.stdout, /holds the target root/);
      assertRepoIntact(repo);
    });
  });
});

/*
 * diff-overlay-fixture.ts - the helpers diff-overlay.test.ts and
 * diff-overlay.critical.test.ts share: what both tiers need to seed a case and
 * run viber/skills/code-auditor/scripts/diff-overlay.sh. It holds no case of
 * its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/diff-overlay.sh");
export const WORKTREE = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/worktree.sh");

export const BINARY_SEED = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x7f]);

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

/** A repo whose HEAD holds the seed files (plus whatever `seed` writes), with a
 *  clean worktree checked out by worktree.sh (the way the skill makes one) before
 *  any working-tree change. */
export async function withCheckout<T>(
  shell: Shell,
  fn: (repo: GitRepo, wt: string) => T | Promise<T>,
  seed: (repo: GitRepo) => void | Promise<void> = () => {},
): Promise<T> {
  return await withGitRepo(async (repo) => {
    fs.writeFileSync(path.join(repo.dir, ".gitignore"), "*.log\n");
    fs.writeFileSync(path.join(repo.dir, "staged.txt"), "staged seed\n");
    fs.writeFileSync(path.join(repo.dir, "unstaged.txt"), "unstaged seed\n");
    fs.writeFileSync(path.join(repo.dir, "gone.txt"), "gone seed\n");
    fs.writeFileSync(path.join(repo.dir, "keep.txt"), "keep seed\n");
    fs.writeFileSync(path.join(repo.dir, "blob.bin"), BINARY_SEED);
    fs.writeFileSync(path.join(repo.dir, "with space.txt"), "space seed\n");
    await seed(repo);
    const add = await repo.git("add", "-A");
    assert.equal(add.status, 0, `git add failed: ${add.stderr}`);
    const commit = await repo.git("commit", "-m", "seed");
    assert.equal(commit.status, 0, `git commit failed: ${commit.stderr}`);
    const wt = slash(path.join(repo.dir, "wt-overlay"));
    const ready = await runScript(WORKTREE, ["add", repo.dir, wt], { shell, cwd: repo.dir, env: repo.env });
    assert.equal(ready.stdout, `WORKTREE_READY ${wt}\n`, `worktree add failed: ${ready.stderr}`);
    return await fn(repo, wt);
  });
}

export async function overlay(shell: Shell, repo: GitRepo, wt: string): Promise<RunResult> {
  return await runScript(SUT, [repo.dir, wt], { shell, cwd: repo.dir, env: repo.env });
}

export async function stage(repo: GitRepo, ...paths: string[]) {
  const add = await repo.git("add", "--", ...paths);
  assert.equal(add.status, 0, `git add failed: ${add.stderr}`);
}

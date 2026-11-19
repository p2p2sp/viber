/*
 * worktree-fixture.ts - the helpers worktree.test.ts and
 * worktree.critical.test.ts share: what both tiers need to seed a case and run
 * viber/skills/code-auditor/scripts/worktree.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/worktree.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export async function run(shell: Shell, repo: GitRepo, args: string[]): Promise<RunResult> {
  return await runScript(SUT, args, { shell, cwd: repo.dir, env: repo.env });
}

/** A repo with one commit, so HEAD is born and `worktree add ... HEAD`
 *  has something to detach onto. Returns the slash-form worktree path the
 *  script is expected to echo back verbatim. */
export async function withSeededRepo<T>(fn: (repo: GitRepo, wt: string) => T): Promise<T> {
  return await withGitRepo(async (repo) => {
    fs.writeFileSync(path.join(repo.dir, "src.txt"), "one\n");
    const add = await repo.git("add", "-A");
    assert.equal(add.status, 0, `git add failed: ${add.stderr}`);
    const commit = await repo.git("commit", "-m", "seed");
    assert.equal(commit.status, 0, `git commit failed: ${commit.stderr}`);
    const wt = slash(path.join(repo.dir, "wt-verify"));
    return fn(repo, wt);
  });
}

export function assertOneLine(result: RunResult, expected: string, expectedStatus: number) {
  assert.equal(result.status, expectedStatus, `unexpected exit status: stderr=${result.stderr}`);
  assert.equal(result.stdout, `${expected}\n`);
}

export function assertFailed(result: RunResult) {
  assert.equal(result.status, 1, `expected exit 1: stdout=${result.stdout} stderr=${result.stderr}`);
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.length, 1, `stdout must stay one line: ${result.stdout}`);
  assert.match(lines[0], /^WORKTREE_FAILED /);
}

export function assertRepoIntact(repo: GitRepo) {
  assert.ok(fs.existsSync(path.join(repo.dir, ".git")), "the target repo's .git must survive");
  assert.equal(fs.readFileSync(path.join(repo.dir, "keep.txt"), "utf8"), "keep\n");
}

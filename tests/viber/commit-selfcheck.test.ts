/*
 * commit-selfcheck.test.ts - proves commit-selfcheck.sh's
 * `commit-selfcheck.sh <before_sha>` contract: one word on stdout -
 * VERIFIED when HEAD moved relative to `before_sha`, FAILED when it did not
 * (or is still unborn), and exit 1 with usage on a missing argument.
 * commit-selfcheck.sh is `#!/usr/bin/env bash`, so every case runs through
 * `forEachShell("bash", ...)` via opts.shell.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/commit-selfcheck.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/commit/scripts/commit-selfcheck.sh");

async function runSelfcheck(bash: Shell, repo: GitRepo, args: string[]): Promise<RunResult> {
  return await runScript(SUT, args, { shell: bash, cwd: repo.dir, env: repo.env });
}

async function assertBash(fn: (bash: Shell) => void | Promise<void>) {
  const skips = await forEachShell("bash", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "bash");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

async function commitFile(repo: GitRepo, name: string, content: string) {
  fs.writeFileSync(path.join(repo.dir, name), content);
  const add = await repo.git("add", "-A");
  assert.equal(add.status, 0, `git add should succeed: ${add.stderr}`);
  const commit = await repo.git("commit", "-m", `seed ${name}`);
  assert.equal(commit.status, 0, `git commit should succeed: ${commit.stderr}`);
}

test("VERIFIED when HEAD moved relative to before_sha", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "one\n");
      const before = (await repo.git("rev-parse", "HEAD")).stdout.trim();
      await commitFile(repo, "b.txt", "two\n");

      const result = await runSelfcheck(bash, repo, [before]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "VERIFIED\n");
    });
  });
});

test("FAILED when HEAD did not move (before_sha equals current HEAD)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "one\n");
      const before = (await repo.git("rev-parse", "HEAD")).stdout.trim();

      const result = await runSelfcheck(bash, repo, [before]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "FAILED\n");
    });
  });
});

test("exit 1 with usage on stderr when before_sha is missing", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "one\n");
      const result = await runSelfcheck(bash, repo, []);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /missing required parameter 'before_sha'/);
      assert.match(result.stderr, /usage: commit-selfcheck\.sh <before_sha>/);
    });
  });
});

test("a before_sha that is not a valid object is treated as a plain string mismatch -> VERIFIED once HEAD exists", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "one\n");
      // The script never validates before_sha as a real object - it only
      // string-compares it against the current HEAD - so garbage that is
      // simply != the real HEAD still resolves to VERIFIED.
      const result = await runSelfcheck(bash, repo, ["not-a-real-sha-0000000"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "VERIFIED\n");
    });
  });
});

test("unborn HEAD (no commits yet): after is empty -> FAILED, never crashes", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      const result = await runSelfcheck(bash, repo, ["(none)"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "FAILED\n");
    });
  });
});

test("the '(none)' sentinel for an unborn before-state also passes at the first root commit", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      // Simulates the commit skill's own "Before SHA: !`git rev-parse ... ||
      // echo (none)`" convention used when the repo has no commits yet.
      fs.writeFileSync(path.join(repo.dir, "first.txt"), "first\n");
      const add = await repo.git("add", "-A");
      assert.equal(add.status, 0, `git add should succeed: ${add.stderr}`);
      const commit = await repo.git("commit", "-m", "root commit");
      assert.equal(commit.status, 0, `git commit should succeed: ${commit.stderr}`);

      const result = await runSelfcheck(bash, repo, ["(none)"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "VERIFIED\n");
    });
  });
});

test("detached HEAD: VERIFIED when a commit lands while detached", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "one\n");
      await commitFile(repo, "b.txt", "two\n");
      const target = (await repo.git("rev-parse", "HEAD~1")).stdout.trim();
      const checkout = await repo.git("checkout", "--detach", target);
      assert.equal(checkout.status, 0, `git checkout --detach should succeed: ${checkout.stderr}`);
      const before = (await repo.git("rev-parse", "HEAD")).stdout.trim();
      await commitFile(repo, "c.txt", "three\n");

      const result = await runSelfcheck(bash, repo, [before]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "VERIFIED\n");
    });
  });
});

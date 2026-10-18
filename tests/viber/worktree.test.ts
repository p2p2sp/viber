/*
 * worktree.test.ts - proves worktree.sh's
 * `worktree.sh add|remove <target-root> <worktree-path>` contract: exactly one
 * stdout line (WORKTREE_READY / WORKTREE_REMOVED / WORKTREE_FAILED), exit 0
 * only when the end state was verified, argument rejection (missing args,
 * relative path, filesystem root, non-repo root), and the recovery paths the
 * caller must never have to branch on - a stale registration, a leftover
 * directory, and replay artifacts a bare `worktree remove` refuses to delete.
 *
 * worktree.sh is `#!/bin/sh` and the skill invokes it as
 * `sh "${CLAUDE_SKILL_DIR}/scripts/worktree.sh" ...`, so every case here runs
 * through forEachShell("posix", ...) via opts.shell.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/worktree.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/worktree.sh");

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

async function run(shell: Shell, repo: GitRepo, args: string[]): Promise<RunResult> {
  return await runScript(SUT, args, { shell, cwd: repo.dir, env: repo.env });
}

/** A repo with one commit, so HEAD is born and `worktree add ... HEAD`
 *  has something to detach onto. Returns the slash-form worktree path the
 *  script is expected to echo back verbatim. */
async function withSeededRepo<T>(fn: (repo: GitRepo, wt: string) => T): Promise<T> {
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

function assertOneLine(result: RunResult, expected: string, expectedStatus: number) {
  assert.equal(result.status, expectedStatus, `unexpected exit status: stderr=${result.stderr}`);
  assert.equal(result.stdout, `${expected}\n`);
}

function assertFailed(result: RunResult) {
  assert.equal(result.status, 1, `expected exit 1: stdout=${result.stdout} stderr=${result.stderr}`);
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.length, 1, `stdout must stay one line: ${result.stdout}`);
  assert.match(lines[0], /^WORKTREE_FAILED /);
}

test("add creates a verified worktree carrying the repo content", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo, wt) => {
      const result = await run(shell, repo, ["add", repo.dir, wt]);
      assertOneLine(result, `WORKTREE_READY ${wt}`, 0);
      assert.equal(fs.readFileSync(path.join(wt, "src.txt"), "utf8"), "one\n");
    });
  });
});

test("add is idempotent over an already-registered worktree", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo, wt) => {
      assertOneLine(await run(shell, repo, ["add", repo.dir, wt]), `WORKTREE_READY ${wt}`, 0);
      const again = await run(shell, repo, ["add", repo.dir, wt]);
      assertOneLine(again, `WORKTREE_READY ${wt}`, 0);
      assert.equal(fs.readFileSync(path.join(wt, "src.txt"), "utf8"), "one\n");
    });
  });
});

test("add recovers from a stale registration whose directory was deleted", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo, wt) => {
      assertOneLine(await run(shell, repo, ["add", repo.dir, wt]), `WORKTREE_READY ${wt}`, 0);
      fs.rmSync(wt, { recursive: true, force: true });
      const result = await run(shell, repo, ["add", repo.dir, wt]);
      assertOneLine(result, `WORKTREE_READY ${wt}`, 0);
      assert.equal(fs.readFileSync(path.join(wt, "src.txt"), "utf8"), "one\n");
    });
  });
});

test("add recovers from an orphaned directory git never registered", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo, wt) => {
      fs.mkdirSync(wt, { recursive: true });
      fs.writeFileSync(path.join(wt, "leftover.txt"), "junk\n");
      const result = await run(shell, repo, ["add", repo.dir, wt]);
      assertOneLine(result, `WORKTREE_READY ${wt}`, 0);
      assert.equal(fs.readFileSync(path.join(wt, "src.txt"), "utf8"), "one\n");
      assert.equal(fs.existsSync(path.join(wt, "leftover.txt")), false);
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

test("remove of an absent path succeeds", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo, wt) => {
      const result = await run(shell, repo, ["remove", repo.dir, wt]);
      assertOneLine(result, `WORKTREE_REMOVED ${wt}`, 0);
    });
  });
});

test("remove leaves the registration prunable so the path can be re-added", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo, wt) => {
      assertOneLine(await run(shell, repo, ["add", repo.dir, wt]), `WORKTREE_READY ${wt}`, 0);
      assertOneLine(await run(shell, repo, ["remove", repo.dir, wt]), `WORKTREE_REMOVED ${wt}`, 0);
      const list = await repo.git("worktree", "list", "--porcelain");
      assert.equal(list.status, 0, `git worktree list failed: ${list.stderr}`);
      assert.equal(list.stdout.includes(path.basename(wt)), false, `stale registration left behind:\n${list.stdout}`);
      assertOneLine(await run(shell, repo, ["add", repo.dir, wt]), `WORKTREE_READY ${wt}`, 0);
    });
  });
});

test("a relative worktree path is rejected", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo) => {
      assertFailed(await run(shell, repo, ["add", repo.dir, "wt-verify"]));
      assertFailed(await run(shell, repo, ["add", repo.dir, "./wt-verify"]));
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

function assertRepoIntact(repo: GitRepo) {
  assert.ok(fs.existsSync(path.join(repo.dir, ".git")), "the target repo's .git must survive");
  assert.equal(fs.readFileSync(path.join(repo.dir, "keep.txt"), "utf8"), "keep\n");
}

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

test("the target root spelled with a trailing /./ as the worktree path is rejected (the text guard does not see it as the root)", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo) => {
      fs.writeFileSync(path.join(repo.dir, "keep.txt"), "keep\n");
      const result = await run(shell, repo, ["add", repo.dir, `${slash(repo.dir)}/./`]);
      assertFailed(result);
      assert.match(result.stdout, /holds the target root/);
      assertRepoIntact(repo);
    });
  });
});

test("a target root that is not a git repository is rejected", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo, wt) => {
      await withTempDir("p2p2-nonrepo-", async (dir) => {
        const result = await run(shell, repo, ["add", dir, wt]);
        assertFailed(result);
        assert.match(result.stdout, /not a git repository/);
      });
    });
  });
});

test("missing arguments and an unknown command are rejected", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo, wt) => {
      assertFailed(await run(shell, repo, []));
      assertFailed(await run(shell, repo, ["add"]));
      assertFailed(await run(shell, repo, ["add", repo.dir]));
      const unknown = await run(shell, repo, ["reset", repo.dir, wt]);
      assertFailed(unknown);
      assert.match(unknown.stdout, /unknown command/);
    });
  });
});

test("a failing add relays git stderr and still prints one stdout line", async () => {
  await assertPosix(async (shell) => {
    // Unborn HEAD: nothing to detach onto, and no recovery can create it.
    await withGitRepo(async (repo) => {
      const wt = slash(path.join(repo.dir, "wt-verify"));
      const result = await run(shell, repo, ["add", repo.dir, wt]);
      assertFailed(result);
      assert.ok(result.stderr.trim().length > 0, "git's own diagnosis must reach stderr");
      assert.equal(fs.existsSync(wt), false);
    });
  });
});

test("add reports READY when only the repository's post-checkout hook exited 1 (the worktree exists, so the hook's status says nothing about it)", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo, wt) => {
      const hooks = path.join(repo.dir, ".git", "hooks");
      fs.mkdirSync(hooks, { recursive: true });
      fs.writeFileSync(path.join(hooks, "post-checkout"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      const result = await run(shell, repo, ["add", repo.dir, wt]);
      assertOneLine(result, `WORKTREE_READY ${wt}`, 0);
      const inside = await runScript("git", ["-C", wt, "rev-parse", "--is-inside-work-tree"], { cwd: repo.dir, env: repo.env });
      assert.equal(inside.stdout.trim(), "true");
      assert.equal(fs.readFileSync(path.join(wt, "src.txt"), "utf8"), "one\n");
    });
  });
});

test("add still fails when git cannot create the target (its parent is a regular file)", async () => {
  await assertPosix(async (shell) => {
    await withSeededRepo(async (repo) => {
      const blocker = path.join(repo.dir, "blocker");
      fs.writeFileSync(blocker, "not a directory\n");
      const result = await run(shell, repo, ["add", repo.dir, slash(path.join(blocker, "wt-verify"))]);
      assertFailed(result);
      assert.ok(result.stderr.trim().length > 0, "git's own diagnosis must reach stderr");
    });
  });
});

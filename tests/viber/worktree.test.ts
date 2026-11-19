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

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import {
  assertPosix,
  run,
  withSeededRepo,
  assertOneLine,
  assertFailed,
  assertRepoIntact,
} from "./worktree-fixture.ts";

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

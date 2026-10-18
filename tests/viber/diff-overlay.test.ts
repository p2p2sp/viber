/*
 * diff-overlay.test.ts - proves diff-overlay.sh's
 * `diff-overlay.sh <target-root> <worktree-path>` contract (C9): the working
 * tree's staged, unstaged and untracked changes land on a clean checkout of
 * HEAD made by worktree.sh, a deletion removes the file (before any write, so a
 * path that turned between file, directory and symlink, or changed only case,
 * lands as the working tree has it, never written through a link), ignored files and
 * anything under .temp/viber/code-auditor/ stay out, one stdout line
 * (OVERLAY_APPLIED <n> / OVERLAY_FAILED <reason>), exit 0 only on APPLIED, and
 * the target's working tree and index are never touched.
 *
 * Both scripts are `#!/bin/sh` and the skill invokes them through `sh`, so every
 * case runs through forEachShell("posix", ...) via opts.shell.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/diff-overlay.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";
import { canSymlinkDir } from "../harness/symlinks.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/diff-overlay.sh");
const WORKTREE = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/worktree.sh");

const BINARY_SEED = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x7f]);
const BINARY_EDIT = Buffer.from([0xff, 0x00, 0x00, 0x10, 0x80, 0xfe, 0x00, 0x00, 0x42]);

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

/** A repo whose HEAD holds the seed files (plus whatever `seed` writes), with a
 *  clean worktree checked out by worktree.sh (the way the skill makes one) before
 *  any working-tree change. */
async function withCheckout<T>(
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

async function overlay(shell: Shell, repo: GitRepo, wt: string): Promise<RunResult> {
  return await runScript(SUT, [repo.dir, wt], { shell, cwd: repo.dir, env: repo.env });
}

async function stage(repo: GitRepo, ...paths: string[]) {
  const add = await repo.git("add", "--", ...paths);
  assert.equal(add.status, 0, `git add failed: ${add.stderr}`);
}

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

test("an edited binary file arrives byte-identical", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(shell, async (repo, wt) => {
      fs.writeFileSync(path.join(repo.dir, "blob.bin"), BINARY_EDIT);

      const result = await overlay(shell, repo, wt);

      assert.equal(result.stdout, "OVERLAY_APPLIED 1\n");
      assert.ok(fs.readFileSync(path.join(wt, "blob.bin")).equals(BINARY_EDIT));
    });
  });
});

test("a path holding a space arrives intact, edited or untracked", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(shell, async (repo, wt) => {
      fs.writeFileSync(path.join(repo.dir, "with space.txt"), "space edit\n");
      fs.mkdirSync(path.join(repo.dir, "my dir"));
      fs.writeFileSync(path.join(repo.dir, "my dir", "new file.txt"), "new space\n");

      const result = await overlay(shell, repo, wt);

      assert.equal(result.stdout, "OVERLAY_APPLIED 2\n");
      assert.equal(fs.readFileSync(path.join(wt, "with space.txt"), "utf8"), "space edit\n");
      assert.equal(fs.readFileSync(path.join(wt, "my dir", "new file.txt"), "utf8"), "new space\n");
    });
  });
});

test("with nothing changed it prints OVERLAY_APPLIED 0 and exits 0", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(shell, async (repo, wt) => {
      const result = await overlay(shell, repo, wt);

      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(result.stdout, "OVERLAY_APPLIED 0\n");
    });
  });
});

test("a checkout path that is not a git worktree gives OVERLAY_FAILED and exit 1", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(shell, async (repo) => {
      await withTempDir("p2p2-notwt-", async (dir) => {
        fs.writeFileSync(path.join(repo.dir, "staged.txt"), "staged edit\n");

        const result = await overlay(shell, repo, slash(dir));

        assert.equal(result.status, 1, `stdout=${result.stdout}`);
        assert.match(result.stdout, /^OVERLAY_FAILED \S.*\n$/);
        assert.equal(result.stdout.trim().split("\n").length, 1, "stdout must stay one line");
        assert.deepEqual(fs.readdirSync(dir), [], "nothing may be written to a non-worktree");
      });
    });
  });
});

test("the target repository's working tree and index are unchanged after an overlay (a git read must not refresh the index)", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(shell, async (repo, wt) => {
      fs.writeFileSync(path.join(repo.dir, "staged.txt"), "staged edit\n");
      await stage(repo, "staged.txt");
      fs.writeFileSync(path.join(repo.dir, "unstaged.txt"), "unstaged edit\n");
      fs.writeFileSync(path.join(repo.dir, "untracked.txt"), "untracked\n");
      const snapshot = async () => ({
        status: (await repo.git("status", "--porcelain=v1", "-uall")).stdout,
        index: fs.readFileSync(path.join(repo.dir, ".git", "index")),
        files: ["staged.txt", "unstaged.txt", "untracked.txt", "gone.txt", "keep.txt"].map((f) =>
          fs.readFileSync(path.join(repo.dir, f), "utf8"),
        ),
      });
      const before = await snapshot();

      const result = await overlay(shell, repo, wt);

      assert.equal(result.stdout, "OVERLAY_APPLIED 3\n");
      const after = await snapshot();
      assert.equal(after.status, before.status);
      assert.ok(after.index.equals(before.index), "the index file must stay byte-identical");
      assert.deepEqual(after.files, before.files);
    });
  });
});

test("a directory replaced by a file of the same name lands as a regular file (a directory left at the path would nest the copy inside it)", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(
      shell,
      async (repo, wt) => {
        fs.rmSync(path.join(repo.dir, "config"), { recursive: true });
        fs.writeFileSync(path.join(repo.dir, "config"), "NEW FILE\n");

        const result = await overlay(shell, repo, wt);

        assert.equal(result.status, 0, `stderr=${result.stderr}`);
        assert.equal(result.stdout, "OVERLAY_APPLIED 2\n");
        assert.ok(fs.lstatSync(path.join(wt, "config")).isFile(), "config must be a regular file");
        assert.equal(fs.readFileSync(path.join(wt, "config"), "utf8"), "NEW FILE\n");
      },
      (repo) => {
        fs.mkdirSync(path.join(repo.dir, "config"));
        fs.writeFileSync(path.join(repo.dir, "config", "settings.json"), "old\n");
      },
    );
  });
});

test("a file replaced by a directory of the same name lands with its new file (the old file must go before the directory is made)", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(
      shell,
      async (repo, wt) => {
        fs.rmSync(path.join(repo.dir, "util"));
        fs.mkdirSync(path.join(repo.dir, "util"));
        fs.writeFileSync(path.join(repo.dir, "util", "index.js"), "new\n");

        const result = await overlay(shell, repo, wt);

        assert.equal(result.status, 0, `stderr=${result.stderr}`);
        assert.equal(result.stdout, "OVERLAY_APPLIED 2\n");
        assert.equal(fs.readFileSync(path.join(wt, "util", "index.js"), "utf8"), "new\n");
      },
      (repo) => {
        fs.writeFileSync(path.join(repo.dir, "util"), "old\n");
      },
    );
  });
});

test("a submodule entry removed from the index is skipped and the overlay succeeds (the checkout holds a directory at the gitlink path, which rm -f cannot remove)", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(
      shell,
      async (repo, wt) => {
        const removed = await repo.git("rm", "-q", "--cached", "sub");
        assert.equal(removed.status, 0, `git rm failed: ${removed.stderr}`);

        const result = await overlay(shell, repo, wt);

        assert.equal(result.status, 0, `stderr=${result.stderr}`);
        assert.equal(result.stdout, "OVERLAY_APPLIED 0\n");
      },
      async (repo) => {
        // The empty directory keeps the gitlink in the index through `git add -A`.
        fs.mkdirSync(path.join(repo.dir, "sub"));
        await repo.git("update-index", "--add", "--cacheinfo", "160000,1111111111111111111111111111111111111111,sub");
      },
    );
  });
});

test("a case-only rename keeps the new spelling in the checkout (on a case-insensitive filesystem the old name still tests as present)", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(
      shell,
      async (repo, wt) => {
        // Through git: with core.ignorecase=true an on-disk rename is invisible to git.
        const mv = await repo.git("mv", "README.md", "readme.md");
        assert.equal(mv.status, 0, `git mv failed: ${mv.stderr}`);

        const result = await overlay(shell, repo, wt);

        assert.equal(result.status, 0, `stderr=${result.stderr}`);
        assert.equal(result.stdout, "OVERLAY_APPLIED 2\n");
        const names = fs.readdirSync(wt);
        assert.ok(names.includes("readme.md"), `checkout lists ${names.join(", ")}`);
        assert.ok(!names.includes("README.md"), `checkout lists ${names.join(", ")}`);
        assert.equal(fs.readFileSync(path.join(wt, "readme.md"), "utf8"), "v1\n");
      },
      (repo) => {
        fs.writeFileSync(path.join(repo.dir, "README.md"), "v1\n");
      },
    );
  });
});

test(
  "a symlink to a directory of the repo replaced by a real directory never writes through the link into the target",
  { skip: canSymlinkDir() ? false : "this account cannot create a directory symlink" },
  async () => {
    await assertPosix(async (shell) => {
      await withCheckout(
        shell,
        async (repo, wt) => {
          fs.rmSync(path.join(repo.dir, "ext"));
          fs.mkdirSync(path.join(repo.dir, "ext"));
          fs.writeFileSync(path.join(repo.dir, "ext", "a.md"), "scratch\n");

          const result = await overlay(shell, repo, wt);

          assert.equal(result.status, 0, `stderr=${result.stderr}`);
          assert.equal(result.stdout, "OVERLAY_APPLIED 2\n");
          assert.equal(fs.readFileSync(path.join(repo.dir, "docs", "a.md"), "utf8"), "committed\n");
          const status = (await repo.git("status", "--porcelain=v1", "-uall")).stdout;
          assert.doesNotMatch(status, /^(M.|.M) /m, `target status:\n${status}`);
          assert.ok(fs.lstatSync(path.join(wt, "ext")).isDirectory(), "ext must be a real directory");
          assert.equal(fs.readFileSync(path.join(wt, "ext", "a.md"), "utf8"), "scratch\n");
        },
        async (repo) => {
          const cfg = await repo.git("config", "core.symlinks", "true");
          assert.equal(cfg.status, 0, `git config failed: ${cfg.stderr}`);
          fs.mkdirSync(path.join(repo.dir, "docs"));
          fs.writeFileSync(path.join(repo.dir, "docs", "a.md"), "committed\n");
          fs.symlinkSync(path.join(repo.dir, "docs"), path.join(repo.dir, "ext"), "dir");
        },
      );
    });
  },
);

async function setIndexMode(repo: GitRepo, flag: "+x" | "-x", file: string) {
  const chmod = await repo.git("update-index", `--chmod=${flag}`, "--", file);
  assert.equal(chmod.status, 0, `git update-index failed: ${chmod.stderr}`);
}

async function checkoutIndexMode(repo: GitRepo, wt: string, file: string): Promise<string> {
  const listed = await repo.git("-C", wt, "ls-files", "-s", "--", file);
  assert.equal(listed.status, 0, `git ls-files failed: ${listed.stderr}`);
  return listed.stdout.split(" ")[0];
}

async function setFileModeOff(repo: GitRepo) {
  const cfg = await repo.git("config", "core.fileMode", "false");
  assert.equal(cfg.status, 0, `git config failed: ${cfg.stderr}`);
}

test("a file staged 100644 -> 100755 under core.fileMode=false is 100755 in the checkout's index (the disk bit says nothing there, only the source index does)", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(
      shell,
      async (repo, wt) => {
        await setIndexMode(repo, "+x", "run.sh");

        const result = await overlay(shell, repo, wt);

        assert.equal(result.status, 0, `stderr=${result.stderr}`);
        assert.equal(result.stdout, "OVERLAY_APPLIED 1\n");
        assert.equal(await checkoutIndexMode(repo, wt, "run.sh"), "100755");
      },
      async (repo) => {
        await setFileModeOff(repo);
        fs.writeFileSync(path.join(repo.dir, "run.sh"), "echo run\n");
      },
    );
  });
});

test("a file staged 100755 -> 100644 under core.fileMode=false is 100644 in the checkout's index", async () => {
  await assertPosix(async (shell) => {
    await withCheckout(
      shell,
      async (repo, wt) => {
        await setIndexMode(repo, "-x", "tool.sh");

        const result = await overlay(shell, repo, wt);

        assert.equal(result.status, 0, `stderr=${result.stderr}`);
        assert.equal(result.stdout, "OVERLAY_APPLIED 1\n");
        assert.equal(await checkoutIndexMode(repo, wt, "tool.sh"), "100644");
      },
      async (repo) => {
        await setFileModeOff(repo);
        fs.writeFileSync(path.join(repo.dir, "tool.sh"), "echo tool\n");
        await stage(repo, "tool.sh");
        await setIndexMode(repo, "+x", "tool.sh");
      },
    );
  });
});

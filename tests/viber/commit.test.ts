/*
 * commit.test.ts - proves commit.sh's `commit.sh <message> [selector]`
 * contract: stages according to the selector (all/paths) then commits,
 * prints the "<short sha> | <subject> (VERIFIED)" result line, or
 * "Nothing to commit" on a clean scope, and exits 1 on a missing message. commit.sh is `#!/usr/bin/env bash`, so every case runs through
 * `forEachShell("bash", ...)` via opts.shell.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/commit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo } from "../harness/tmp.ts";
import { SUT, runCommit, assertBash, commitFile } from "./commit-fixture.ts";

// --- a commit lands for each mode ------------------------------------------------

test("mode 'all' (no selector): a deleted tracked file is committed as a deletion", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "gone.txt", "gone\n");
      fs.rmSync(path.join(repo.dir, "gone.txt"));
      const result = await runCommit(bash, repo, ["drop gone"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const nameStatus = await repo.git("show", "--name-status", "--format=", "HEAD");
      assert.equal(nameStatus.stdout.trim(), "D\tgone.txt");
    });
  });
});

test("mode paths with a list: commits a modified, a new and a deleted path together and nothing else", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      await commitFile(repo, "gone.txt", "gone\n");
      await commitFile(repo, "c.txt", "c\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a, changed\n");
      fs.writeFileSync(path.join(repo.dir, "new.txt"), "new\n");
      fs.rmSync(path.join(repo.dir, "gone.txt"));
      fs.writeFileSync(path.join(repo.dir, "c.txt"), "c, changed\n");

      const result = await runCommit(bash, repo, ["three paths", "a.txt new.txt gone.txt"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const nameStatus = await repo.git("show", "--name-status", "--format=", "HEAD");
      assert.deepEqual(nameStatus.stdout.trim().split("\n").sort(), ["A\tnew.txt", "D\tgone.txt", "M\ta.txt"]);
      const status = await repo.git("status", "--porcelain");
      assert.equal(status.stdout.replace(/\n$/, ""), " M c.txt");
    });
  });
});

test("mode paths with the list split across several argv entries: same result as one space-joined string", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      await commitFile(repo, "b.txt", "b\n");
      await commitFile(repo, "c.txt", "c\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a, changed\n");
      fs.writeFileSync(path.join(repo.dir, "b.txt"), "b, changed\n");
      fs.writeFileSync(path.join(repo.dir, "c.txt"), "c, changed\n");

      const result = await runCommit(bash, repo, ["two paths", "a.txt", "b.txt"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const nameOnly = await repo.git("show", "--name-only", "--format=", "HEAD");
      assert.deepEqual(nameOnly.stdout.trim().split("\n").sort(), ["a.txt", "b.txt"]);
    });
  });
});

test("mode paths with an untracked file an ignore rule covers: it is not force-added", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, ".gitignore", "build/\n");
      fs.mkdirSync(path.join(repo.dir, "build"));
      fs.writeFileSync(path.join(repo.dir, "build", "out.js"), "gen\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a\n");

      const result = await runCommit(bash, repo, ["a only", "a.txt build/out.js"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const nameOnly = await repo.git("show", "--name-only", "--format=", "HEAD");
      assert.equal(nameOnly.stdout.trim(), "a.txt");
    });
  });
});

test("mode paths with a glob-looking selector and no file of that literal name: nothing is selected, exit 3 and the tracked files the glob would match stay modified", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.mkdirSync(path.join(repo.dir, "src"));
      await commitFile(repo, "src/a.ts", "a\n");
      fs.writeFileSync(path.join(repo.dir, "src", "a.ts"), "a, changed\n");
      const before = (await repo.git("rev-parse", "HEAD")).stdout;

      const result = await runCommit(bash, repo, ["x", "src/*.ts"]);
      assert.equal(result.status, 3);
      assert.equal((await repo.git("rev-parse", "HEAD")).stdout, before);
      assert.equal((await repo.git("status", "--porcelain")).stdout.replace(/\n$/, ""), " M src/a.ts");
    });
  });
});

test("mode paths with a file named 'bugs/#12.md': it alone is committed, 'bugs/other.md' stays modified and no Refs footer is written (the '#12' used to be cut out as an issue reference)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.mkdirSync(path.join(repo.dir, "bugs"));
      await commitFile(repo, "bugs/#12.md", "bug\n");
      await commitFile(repo, "bugs/other.md", "other\n");
      fs.writeFileSync(path.join(repo.dir, "bugs", "#12.md"), "bug, changed\n");
      fs.writeFileSync(path.join(repo.dir, "bugs", "other.md"), "other, changed\n");

      const result = await runCommit(bash, repo, ["docs: bug 12", "bugs/#12.md"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal((await repo.git("show", "--name-only", "--format=", "HEAD")).stdout.trim(), "bugs/#12.md");
      assert.equal((await repo.git("status", "--porcelain")).stdout.replace(/\n$/, ""), " M bugs/other.md");
      assert.doesNotMatch((await repo.git("log", "-1", "--format=%B")).stdout, /Refs:/);
    });
  });
});

// --- the result line --------------------------------------------------------------

test("mode 'all': stdout is exactly '<short sha> | <subject> (VERIFIED)', the subject being the first line of a multi-line message", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a, changed\n");
      const result = await runCommit(bash, repo, ["feat: change a\n\nbody paragraph"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const sha = (await repo.git("rev-parse", "--short", "HEAD")).stdout.trim();
      assert.equal(result.stdout, `${sha} | feat: change a (VERIFIED)\n`);
    });
  });
});

test("mode 'paths': stdout is exactly '<short sha> | <subject> (VERIFIED)' for its own commit, not for a staged change left out", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a, changed\n");
      fs.writeFileSync(path.join(repo.dir, "b.txt"), "b\n");
      await repo.git("add", "--", "b.txt");
      const result = await runCommit(bash, repo, ["fix: only a", "a.txt"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const sha = (await repo.git("rev-parse", "--short", "HEAD")).stdout.trim();
      assert.equal(result.stdout, `${sha} | fix: only a (VERIFIED)\n`);
    });
  });
});

test("mode 'paths' with a clean scope: stdout is exactly 'Nothing to commit', exit 0, even with another path changed", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      await commitFile(repo, "b.txt", "b\n");
      fs.writeFileSync(path.join(repo.dir, "b.txt"), "b, changed\n");
      const result = await runCommit(bash, repo, ["no-op", "a.txt"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "Nothing to commit\n");
    });
  });
});

test("unborn branch: the first commit prints '<short sha> | <subject> (VERIFIED)'", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.writeFileSync(path.join(repo.dir, "first.txt"), "first\n");
      const result = await runCommit(bash, repo, ["chore: root"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const sha = (await repo.git("rev-parse", "--short", "HEAD")).stdout.trim();
      assert.equal(result.stdout, `${sha} | chore: root (VERIFIED)\n`);
    });
  });
});

test("a pre-commit hook that rejects: git's exit status comes back with an empty stdout and HEAD unmoved", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      const before = (await repo.git("rev-parse", "HEAD")).stdout;
      fs.mkdirSync(path.join(repo.dir, ".git", "hooks"), { recursive: true });
      fs.writeFileSync(path.join(repo.dir, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a, changed\n");
      const result = await runCommit(bash, repo, ["rejected"]);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal((await repo.git("rev-parse", "HEAD")).stdout, before);
    });
  });
});

// --- exit codes and messages ------------------------------------------------------

test("missing message -> exit 1 with usage on stderr, nothing committed", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      const result = await runCommit(bash, repo, []);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /missing required parameter 'message'/);
      assert.match(result.stderr, /usage: commit\.sh <message> \[selector\.\.\.\]/);
    });
  });
});

test("a multi-line message round-trips verbatim into the commit body", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "content\n");
      const message = "feat: add thing\n\nlonger explanation on a second paragraph";
      const result = await runCommit(bash, repo, [message]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const body = await repo.git("log", "-1", "--format=%B");
      assert.equal(body.stdout.replace(/\n+$/, ""), message);
    });
  });
});

test("a message with a leading '-' is not mistaken for an option", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "content\n");
      const message = "-fix: dash-led message";
      const result = await runCommit(bash, repo, [message]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const subject = await repo.git("log", "-1", "--format=%s");
      assert.equal(subject.stdout.trim(), message);
    });
  });
});

test("nothing staged, mode 'all', no working-tree changes -> 'Nothing to commit' on stdout, exit 0", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "content\n");
      const result = await runCommit(bash, repo, ["no-op"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "Nothing to commit\n");
      const subject = await repo.git("log", "-1", "--format=%s");
      assert.equal(subject.stdout.trim(), "seed a.txt");
    });
  });
});

// --- edge cases: unborn HEAD, detached HEAD, missing user.email -----------------

test("unborn HEAD: the first commit succeeds as a root commit", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.writeFileSync(path.join(repo.dir, "first.txt"), "first\n");
      const result = await runCommit(bash, repo, ["root commit"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const log = await repo.git("log", "--oneline");
      assert.equal(log.stdout.trim().split("\n").length, 1);
      const subject = await repo.git("log", "-1", "--format=%s");
      assert.equal(subject.stdout.trim(), "root commit");
    });
  });
});

test("detached HEAD: a commit still lands, moving the detached HEAD forward (no branch update)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "one\n");
      await commitFile(repo, "b.txt", "two\n");
      const target = await repo.git("rev-parse", "HEAD~1");
      assert.equal(target.status, 0, `git rev-parse should succeed: ${target.stderr}`);
      const checkout = await repo.git("checkout", "--detach", target.stdout.trim());
      assert.equal(checkout.status, 0, `git checkout --detach should succeed: ${checkout.stderr}`);
      const before = await repo.git("rev-parse", "HEAD");

      fs.writeFileSync(path.join(repo.dir, "c.txt"), "three\n");
      const result = await runCommit(bash, repo, ["detached commit"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);

      const after = await repo.git("rev-parse", "HEAD");
      assert.notEqual(after.stdout.trim(), before.stdout.trim());
      const branch = await repo.git("symbolic-ref", "-q", "HEAD");
      assert.notEqual(branch.status, 0, "HEAD should still be detached (no branch)");
    });
  });
});

test("user.email unset (config AND the env override the harness normally pins): commit.sh never lies about the outcome - either HEAD genuinely moved, or it failed and HEAD is untouched", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "content\n");
      const before = await repo.git("rev-parse", "HEAD");
      const unsetEmail = await repo.git("config", "--global", "--unset", "user.email");
      assert.equal(unsetEmail.status, 0, `git config --unset should succeed: ${unsetEmail.stderr}`);
      const unsetName = await repo.git("config", "--global", "--unset", "user.name");
      assert.equal(unsetName.status, 0, `git config --unset should succeed: ${unsetName.stderr}`);

      // repo.env normally pins GIT_AUTHOR_*/GIT_COMMITTER_* env vars, which
      // would override the now-unset config identity - strip those too, so
      // this actually exercises "no identity configured anywhere".
      const noIdentityEnv = { ...repo.env };
      delete (noIdentityEnv as Record<string, string | undefined>).GIT_AUTHOR_NAME;
      delete (noIdentityEnv as Record<string, string | undefined>).GIT_AUTHOR_EMAIL;
      delete (noIdentityEnv as Record<string, string | undefined>).GIT_COMMITTER_NAME;
      delete (noIdentityEnv as Record<string, string | undefined>).GIT_COMMITTER_EMAIL;

      fs.writeFileSync(path.join(repo.dir, "b.txt"), "new\n");
      const result = await runScript(SUT, ["identity test"], { shell: bash, cwd: repo.dir, env: noIdentityEnv });

      const after = await repo.git("rev-parse", "HEAD");
      // Whether git falls back to a machine-derived identity (some
      // platforms only warn) or refuses outright (others hard-fail) is a
      // git-version/platform matter outside this script's control - what
      // commit.sh itself must never do is report success (exit 0) without
      // HEAD actually having moved, or report failure while a commit landed
      // anyway.
      if (result.status === 0) {
        assert.notEqual(after.stdout.trim(), before.stdout.trim(), "exit 0 must mean a commit genuinely landed");
      } else {
        assert.equal(after.stdout.trim(), before.stdout.trim(), "a non-zero exit must mean HEAD did not move");
      }
    });
  });
});

// --- a staged mode change under core.fileMode=false --------------------------------

test("mode paths: an exec bit staged with 'git update-index --chmod=+x' under core.fileMode=false is committed, alone or beside a content change (a pathspec commit took the mode from HEAD and failed as 'nothing to commit')", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await repo.git("config", "core.fileMode", "false");
      await commitFile(repo, "run.sh", "echo run\n");
      await commitFile(repo, "a.txt", "a\n");
      await repo.git("update-index", "--chmod=+x", "--", "run.sh");

      const alone = await runCommit(bash, repo, ["exec bit", "run.sh"]);
      assert.equal(alone.status, 0, `stderr: ${alone.stderr}`);
      assert.match((await repo.git("ls-tree", "HEAD", "--", "run.sh")).stdout, /^100755 /);
      assert.equal((await repo.git("diff", "--cached", "--name-only")).stdout.trim(), "");

      await repo.git("update-index", "--chmod=-x", "--", "run.sh");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a, changed\n");
      const beside = await runCommit(bash, repo, ["both", "run.sh a.txt"]);
      assert.equal(beside.status, 0, `stderr: ${beside.stderr}`);
      assert.match((await repo.git("ls-tree", "HEAD", "--", "run.sh")).stdout, /^100644 /);
      const names = (await repo.git("show", "--name-only", "--format=", "HEAD")).stdout.trim().split("\n").sort();
      assert.deepEqual(names, ["a.txt", "run.sh"]);
      assert.equal((await repo.git("status", "--porcelain")).stdout.trim(), "");
    });
  });
});

// --- a staged mode change under core.fileMode=true ---------------------------------

test(
  "mode paths: an exec bit staged with 'git update-index --chmod=+x' over a 0644 file under core.fileMode=true is committed at 100755 (git add -u read the mode back from the tree and dropped it)",
  { skip: process.platform === "win32" ? "core.fileMode=true does not occur on a Windows checkout" : false },
  async () => {
    await assertBash(async (bash) => {
      await withGitRepo(async (repo) => {
        await repo.git("config", "core.fileMode", "true");
        await commitFile(repo, "run.sh", "echo run\n");
        await repo.git("update-index", "--chmod=+x", "--", "run.sh");

        const result = await runCommit(bash, repo, ["chore: exec", "run.sh"]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.match((await repo.git("ls-tree", "HEAD", "--", "run.sh")).stdout, /^100755 /);
      });
    });
  },
);

test(
  "mode 'all': an exec bit staged with 'git update-index --chmod=+x' over a 0644 file under core.fileMode=true is committed at 100755 (git add -A read the mode back from the tree and dropped it)",
  { skip: process.platform === "win32" ? "core.fileMode=true does not occur on a Windows checkout" : false },
  async () => {
    await assertBash(async (bash) => {
      await withGitRepo(async (repo) => {
        await repo.git("config", "core.fileMode", "true");
        await commitFile(repo, "run.sh", "echo run\n");
        await repo.git("update-index", "--chmod=+x", "--", "run.sh");

        const result = await runCommit(bash, repo, ["chore: exec"]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.match((await repo.git("ls-tree", "HEAD", "--", "run.sh")).stdout, /^100755 /);
      });
    });
  },
);

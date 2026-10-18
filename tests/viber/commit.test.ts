/*
 * commit.test.ts - proves commit.sh's `commit.sh <message> [selector]`
 * contract: stages according to the selector (all/paths) then commits,
 * reports "Nothing to commit." on a clean scope, and exits 1 on a missing
 * message. commit.sh is `#!/usr/bin/env bash`, so every case runs through
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

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { forEachShell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/commit/scripts/commit.sh");

async function runCommit(bash: string, repo: GitRepo, args: string[]): Promise<RunResult> {
  return await runScript(SUT, args, { shell: bash, cwd: repo.dir, env: repo.env });
}

async function assertBash(fn: (bash: string) => void | Promise<void>) {
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

// --- a commit lands for each mode ------------------------------------------------

test("mode 'all' (no selector): stages and commits every pending change, including untracked", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "content\n");
      const result = await runCommit(bash, repo, ["commit all"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const subject = await repo.git("log", "-1", "--format=%s");
      assert.equal(subject.stdout.trim(), "commit all");
      const status = await repo.git("status", "--porcelain");
      assert.equal(status.stdout.trim(), "");
    });
  });
});

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

test("mode paths: commits only the given path, other changes are left uncommitted", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      await commitFile(repo, "b.txt", "b\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a, changed\n");
      fs.writeFileSync(path.join(repo.dir, "b.txt"), "b, changed\n");

      const result = await runCommit(bash, repo, ["only a.txt", "a.txt"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const subject = await repo.git("log", "-1", "--format=%s");
      assert.equal(subject.stdout.trim(), "only a.txt");
      const nameOnly = await repo.git("show", "--name-only", "--format=", "HEAD");
      assert.equal(nameOnly.stdout.trim(), "a.txt");

      // b.txt's change is neither staged nor committed - the path selector
      // must isolate it from the rest of the working tree. (Do not
      // `.trim()` - porcelain status lines carry a meaningful leading space.)
      const status = await repo.git("status", "--porcelain", "--", "b.txt");      assert.equal(status.stdout.replace(/\n$/, ""), " M b.txt");
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

test("mode paths with directories already removed by git rm: every one is committed, not just the one still on disk (a path gone from disk and index used to drop out of the list)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      for (const d of ["p1", "p2", "p3"]) {
        fs.mkdirSync(path.join(repo.dir, d));
        fs.writeFileSync(path.join(repo.dir, d, "f.txt"), `${d}\n`);
      }
      await commitFile(repo, "other.txt", "o\n");
      await repo.git("rm", "-rq", "p1", "p2", "p3");
      // p1 keeps a build leftover on disk, the way bin/obj outlive a git rm
      fs.mkdirSync(path.join(repo.dir, "p1", "obj"), { recursive: true });
      fs.writeFileSync(path.join(repo.dir, "other.txt"), "o, changed\n");
      await repo.git("add", "other.txt");

      const result = await runCommit(bash, repo, ["drop three", "p1 p2 p3"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const nameStatus = await repo.git("show", "--name-status", "--format=", "HEAD");
      assert.deepEqual(nameStatus.stdout.trim().split("\n").sort(), ["D\tp1/f.txt", "D\tp2/f.txt", "D\tp3/f.txt"]);
      const staged = await repo.git("diff", "--cached", "--name-only");
      assert.equal(staged.stdout.trim(), "other.txt");
    });
  });
});

test("mode paths with a tracked file under a directory its .gitignore ignores: committed with exit 0, nothing else swept in (git add exits 1 on the ignored parent)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.mkdirSync(path.join(repo.dir, "skills", "k", "refs"), { recursive: true });
      fs.writeFileSync(path.join(repo.dir, "skills", ".gitignore"), "*\n!.gitignore\n!k/\n");
      fs.writeFileSync(path.join(repo.dir, "skills", "k", "refs", "a.md"), "a\n");
      fs.writeFileSync(path.join(repo.dir, "skills", "k", "refs", "b.md"), "b\n");
      await repo.git("add", "-f", "skills");
      await repo.git("commit", "-m", "seed skills");
      await commitFile(repo, "other.txt", "o\n");
      fs.writeFileSync(path.join(repo.dir, "skills", "k", "refs", "a.md"), "a, changed\n");
      fs.writeFileSync(path.join(repo.dir, "skills", "k", "refs", "b.md"), "b, changed\n");
      await repo.git("add", "-f", "skills/k/refs/b.md");
      fs.writeFileSync(path.join(repo.dir, "other.txt"), "o, changed\n");
      await repo.git("add", "other.txt");

      const result = await runCommit(bash, repo, ["refs", "skills/k/refs/a.md skills/k/refs/b.md"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const nameOnly = await repo.git("show", "--name-only", "--format=", "HEAD");
      assert.deepEqual(nameOnly.stdout.trim().split("\n").sort(), ["skills/k/refs/a.md", "skills/k/refs/b.md"]);
      const staged = await repo.git("diff", "--cached", "--name-only");
      assert.equal(staged.stdout.trim(), "other.txt");
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

test("a selector naming only paths that do not exist exits 3 and commits nothing - staged work elsewhere stays staged (it used to fall back to 'git add -A' of everything)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "a\n");
      fs.writeFileSync(path.join(repo.dir, "a.txt"), "a, changed\n");
      await repo.git("add", "a.txt");
      fs.writeFileSync(path.join(repo.dir, "b.txt"), "untracked\n");
      const before = (await repo.git("rev-parse", "HEAD")).stdout;

      const result = await runCommit(bash, repo, ["typo", "src/nope.ts lib/gone"]);
      assert.equal(result.status, 3);
      assert.match(result.stderr, /none of the named paths exists: src\/nope\.ts lib\/gone/);
      assert.equal((await repo.git("rev-parse", "HEAD")).stdout, before);
      assert.equal((await repo.git("diff", "--cached", "--name-only")).stdout.trim(), "a.txt");
      assert.match((await repo.git("status", "--porcelain")).stdout, /^\?\? b\.txt$/m);
    });
  });
});

test("mode paths with a bracketed path: 'app/[id]/page.tsx' commits that file only, the sibling 'app/i/page.tsx' a glob would also match stays modified (the selector is a literal path, not a pathspec glob)", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      fs.mkdirSync(path.join(repo.dir, "app", "[id]"), { recursive: true });
      fs.mkdirSync(path.join(repo.dir, "app", "i"), { recursive: true });
      await commitFile(repo, "app/[id]/page.tsx", "id\n");
      await commitFile(repo, "app/i/page.tsx", "i\n");
      fs.writeFileSync(path.join(repo.dir, "app", "[id]", "page.tsx"), "id, changed\n");
      fs.writeFileSync(path.join(repo.dir, "app", "i", "page.tsx"), "i, changed\n");

      const result = await runCommit(bash, repo, ["fix: id page", "app/[id]/page.tsx"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal((await repo.git("show", "--name-only", "--format=", "HEAD")).stdout.trim(), "app/[id]/page.tsx");
      assert.equal((await repo.git("status", "--porcelain")).stdout.replace(/\n$/, ""), " M app/i/page.tsx");
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

test("nothing staged, mode 'all', no working-tree changes -> 'Nothing to commit.' on stdout, exit 0", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "a.txt", "content\n");
      const result = await runCommit(bash, repo, ["no-op"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "Nothing to commit.\n");
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

test("mode paths: an exec bit staged with 'git update-index --chmod=+x' over a 0644 file under core.fileMode=true is committed at 100755 (git add -u read the mode back from the tree and dropped it)", async () => {
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
});

test("mode 'all': an exec bit staged with 'git update-index --chmod=+x' over a 0644 file under core.fileMode=true is committed at 100755 (git add -A read the mode back from the tree and dropped it)", async () => {
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
});

test("mode paths: a staged deletion is committed and a path staged outside the selector stays staged, out of the commit", async () => {
  await assertBash(async (bash) => {
    await withGitRepo(async (repo) => {
      await commitFile(repo, "gone.txt", "gone\n");
      await repo.git("rm", "-q", "--", "gone.txt");
      fs.writeFileSync(path.join(repo.dir, "other.txt"), "staged before\n");
      await repo.git("add", "--", "other.txt");

      const result = await runCommit(bash, repo, ["drop gone", "gone.txt"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal((await repo.git("show", "--name-status", "--format=", "HEAD")).stdout.trim(), "D\tgone.txt");
      assert.equal((await repo.git("diff", "--cached", "--name-only")).stdout.trim(), "other.txt");
    });
  });
});

// --- run from a subdirectory of the repository ------------------------------------

const SUBDIR_FORMS = ["cwd-relative", "root-relative", "absolute", "msys"];

/** "pkg/src/c" spelled in `form` by a caller whose cwd is "pkg" of `root`:
 *  relative to that cwd, relative to the root, absolute with forward slashes,
 *  or the MSYS "/c/..." form (undefined off Windows, where it does not exist). */
function subdirSelector(root: string, form: string): string | undefined {
  const abs = slash(path.join(fs.realpathSync.native(root), "pkg", "src", "c"));
  const drive = /^([A-Za-z]):\//.exec(abs);
  if (form === "cwd-relative") return "src/c";
  if (form === "root-relative") return "pkg/src/c";
  if (form === "absolute") return abs;
  return drive ? `/${drive[1].toLowerCase()}${abs.slice(2)}` : undefined;
}

/** pkg/src/c/f.txt modified in the tree, pkg/src/d/g.txt modified and staged. */
async function seedSubdir(repo: GitRepo) {
  fs.mkdirSync(path.join(repo.dir, "pkg", "src", "c"), { recursive: true });
  fs.mkdirSync(path.join(repo.dir, "pkg", "src", "d"), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, "pkg", "src", "c", "f.txt"), "f\n");
  await commitFile(repo, "pkg/src/d/g.txt", "g\n");
  fs.writeFileSync(path.join(repo.dir, "pkg", "src", "c", "f.txt"), "f, changed\n");
  fs.writeFileSync(path.join(repo.dir, "pkg", "src", "d", "g.txt"), "g, staged\n");
  await repo.git("add", "--", "pkg/src/d/g.txt");
}

test("run from a subdirectory: every path spelling commits exactly the selected file at its real path, other staged changes stay staged (a cwd-relative ls-files once moved the files to the root)", async () => {
  await assertBash(async (bash) => {
    for (const form of SUBDIR_FORMS) {
      await withGitRepo(async (repo) => {
        const selector = subdirSelector(repo.dir, form);
        if (selector === undefined) return;
        await seedSubdir(repo);

        const result = await runScript(SUT, [`commit ${form}`, selector], { shell: bash, cwd: path.join(repo.dir, "pkg"), env: repo.env });
        assert.equal(result.status, 0, `${form}: ${result.stderr}`);
        assert.equal((await repo.git("show", "--name-status", "--format=", "HEAD")).stdout.trim(), "M\tpkg/src/c/f.txt", form);
        assert.deepEqual((await repo.git("ls-tree", "-r", "--name-only", "HEAD", "--", "pkg")).stdout.trim().split("\n"), ["pkg/src/c/f.txt", "pkg/src/d/g.txt"], form);
        assert.equal((await repo.git("ls-tree", "HEAD", "--", "src")).stdout, "", form);
        assert.equal((await repo.git("diff", "--cached", "--name-only")).stdout.trim(), "pkg/src/d/g.txt", form);
      });
    }
  });
});

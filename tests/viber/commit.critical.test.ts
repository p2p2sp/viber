/*
 * commit.critical.test.ts - the critical tier of
 * viber/skills/commit/scripts/commit.sh: each selector stages exactly its own
 * paths (all, a path, git rm removals, ignored parents, bracket literals,
 * subdirectory spellings), a missing path commits nothing, and work staged
 * outside the selector stays staged.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by commit.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/commit.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import { SUT, runCommit, assertBash, commitFile } from "./commit-fixture.ts";

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
      assert.equal(result.stdout, "");
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

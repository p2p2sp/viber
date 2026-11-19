/*
 * attach-lines.test.ts - proves viber/scripts/attach-lines.sh's contract (C11): it prints one
 * `Attachment: <absolute path>` line per argument naming an existing file or directory strictly
 * under <repository root>/.temp/ (absolute, forward slashes, in argument order, a repeat once, a
 * relative path resolved from the cwd), prints nothing for any other argument, and exits 2 with
 * one `error:` line and an empty stdout with no argument or outside a git repository.
 *
 * attach-lines.sh is `#!/bin/sh`, so every case runs through forEachShell("posix", ...) in a
 * throwaway git repository whose `.temp/` files the case writes itself.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/attach-lines.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { SUT, assertPosix, write, rootOf } from "./attach-lines-fixture.ts";

test("a path named twice, once relative and once absolute, prints once at its first place", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      write(repo, ".temp/a.md");
      write(repo, ".temp/b.md");
      const root = rootOf(repo);

      const result = await runScript(SUT, [".temp/a.md", ".temp/b.md", path.join(repo.dir, ".temp", "a.md"), "./.temp/b.md"], {
        cwd: repo.dir,
        env: repo.env,
        shell,
      });

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `Attachment: ${root}/.temp/a.md\nAttachment: ${root}/.temp/b.md\n`);
    });
  });
});

test("a relative path resolves against the cwd, not the repository root", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      write(repo, ".temp/viber/n.md");
      write(repo, "src/.temp/inner.md");
      const root = rootOf(repo);

      const result = await runScript(SUT, ["../.temp/viber/n.md", ".temp/inner.md"], {
        cwd: path.join(repo.dir, "src"),
        env: repo.env,
        shell,
      });

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `Attachment: ${root}/.temp/viber/n.md\n`);
    });
  });
});

test("a path outside .temp/, a missing one, the .temp/ directory itself and an empty argument print nothing and exit 0", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      write(repo, "src/app.ts");
      write(repo, "docs/.temp-notes.md");
      write(repo, ".temp/real.md");

      const result = await runScript(SUT, ["src/app.ts", "docs/.temp-notes.md", ".temp/missing.md", ".temp", ".temp/", "", ".temp/../src/app.ts"], {
        cwd: repo.dir,
        env: repo.env,
        shell,
      });

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
    });
  });
});

test("a path outside .temp/ between two valid ones is dropped without disturbing their lines or order", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      write(repo, ".temp/one.md");
      write(repo, ".temp/two.md");
      write(repo, "README.md");
      const root = rootOf(repo);

      const result = await runScript(SUT, [".temp/two.md", "README.md", ".temp/one.md"], { cwd: repo.dir, env: repo.env, shell });

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `Attachment: ${root}/.temp/two.md\nAttachment: ${root}/.temp/one.md\n`);
    });
  });
});

test("no argument exits 2 with one error: line and an empty stdout", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      const result = await runScript(SUT, [], { cwd: repo.dir, env: repo.env, shell });

      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^error: [^\n]+\n$/);
    });
  });
});

test("outside a git repository it exits 2 with one error: line and an empty stdout, even for a path under a .temp/", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("attach-lines-", async (dir) => {
      fs.mkdirSync(path.join(dir, ".temp"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".temp", "a.md"), "x\n");

      const result = await runScript(SUT, [".temp/a.md"], { cwd: dir, shell });

      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^error: [^\n]+\n$/);
    });
  });
});

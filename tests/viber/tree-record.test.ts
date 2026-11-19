/*
 * tree-record.test.ts - proves viber/skills/fixer/scripts/tree-record.sh's contract:
 * `--save` writes the paths `git status` reports (staged, unstaged, untracked, a rename as its
 * new path; ignored ones and everything under .temp/ left out) to
 * `.temp/viber/fixer/tree-record` and prints `NEXT: trace` plus one `recorded:` line per path;
 * `--check [<test path>]` lists, as `path:` lines under a `STOP:` line, every reported path that
 * is neither recorded nor the given test path, or prints `NEXT: handoff` when there is none;
 * a missing or unknown mode, an extra argument, a `--check` without a record and a run outside a
 * git repository exit 2 with one `error:` line and an empty stdout.
 *
 * Every case builds a throwaway repository. The harness keeps its global git config as
 * `.gitconfig-global` inside the repository directory, so each case excludes it through
 * `.git/info/exclude`, together with the ignored file the cases create.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run directly by
 * Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/tree-record.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { SUT, STOP, write, treeRecord, recordFile, seed } from "./tree-record-fixture.ts";

test("--save records a renamed file as its new path only", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await repo.git("mv", "mod.txt", "renamed.txt");

    const result = await treeRecord(repo, ["--save"]);

    assert.equal(result.stdout, "NEXT: trace\nrecorded: renamed.txt\n");
    assert.equal(fs.readFileSync(recordFile(repo), "utf-8"), "renamed.txt\n");
  });
});

for (const spelling of ["tests/repro.test.ts", "./tests/repro.test.ts"]) {
  test(`--check "${spelling}" after only that test was added prints NEXT: handoff`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);
      write(repo.dir, "mod.txt", "two\n");
      await treeRecord(repo, ["--save"]);
      write(repo.dir, "tests/repro.test.ts", "x\n");

      const result = await treeRecord(repo, ["--check", spelling]);

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "NEXT: handoff\n");
    });
  });
}

test("--check given the reproduction test relative to a subdirectory of the repository prints NEXT: handoff", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "mod.txt", "two\n");
    await treeRecord(repo, ["--save"]);
    write(repo.dir, "tests/repro.test.ts", "x\n");

    const result = await treeRecord(repo, ["--check", "repro.test.ts"], path.join(repo.dir, "tests"));

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "NEXT: handoff\n");
  });
});

test("--check given an absolute path outside the repository compares it as given, so the test file still counts as changed", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await treeRecord(repo, ["--save"]);
    write(repo.dir, "tests/repro.test.ts", "x\n");
    const outside = path.join(path.dirname(fs.realpathSync.native(repo.dir)), "elsewhere", "tests", "repro.test.ts");

    const result = await treeRecord(repo, ["--check", outside]);

    assert.equal(result.stdout, `${STOP}\npath: tests/repro.test.ts\n`);
  });
});

test("--check given the reproduction test as an absolute path still prints the STOP: line naming a second changed file", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await treeRecord(repo, ["--save"]);
    write(repo.dir, "tests/repro.test.ts", "x\n");
    write(repo.dir, "src/other.ts", "x\n");

    const result = await treeRecord(repo, [
      "--check",
      path.join(fs.realpathSync.native(repo.dir), "tests", "repro.test.ts"),
    ]);

    assert.equal(result.stdout, `${STOP}\npath: src/other.ts\n`);
  });
});

const REFUSED: Array<[string, string[]]> = [
  ["--check before any --save", ["--check", "tests/repro.test.ts"]],
  ["an unknown mode", ["--bogus"]],
  ["no mode", []],
  ["--save with an argument", ["--save", "extra"]],
  ["--check with two arguments", ["--check", "a", "b"]],
];

for (const [name, args] of REFUSED) {
  test(`${name} prints one error: line, an empty stdout and exits 2`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);

      const result = await treeRecord(repo, args);

      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^error: [^\n]+\n$/);
    });
  });
}

test("--save outside a git repository prints one error: line, an empty stdout and exits 2", async () => {
  await withTempDir("p2p2-tree-record-", async (dir) => {
    const result = await runScript(SUT, ["--save"], {
      cwd: dir,
      env: { GIT_CEILING_DIRECTORIES: path.dirname(dir) },
      shell: "bash",
    });

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: [^\n]+\n$/);
  });
});

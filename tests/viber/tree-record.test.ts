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
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/fixer/scripts/tree-record.sh");
const STOP = "STOP: changed since the record - revert before the handoff";

function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function treeRecord(repo: GitRepo, args: string[]) {
  return runScript(SUT, args, { cwd: repo.dir, env: repo.env, shell: "bash" });
}

function recordFile(repo: GitRepo): string {
  return path.join(repo.dir, ".temp/viber/fixer/tree-record");
}

/** A repository holding `mod.txt` and `stg.txt` committed, with the harness config and `ign.log` excluded. */
async function seed(repo: GitRepo): Promise<void> {
  fs.appendFileSync(path.join(repo.dir, ".git/info/exclude"), ".gitconfig-global\nign.log\n");
  write(repo.dir, "mod.txt", "one\n");
  write(repo.dir, "stg.txt", "one\n");
  await repo.git("add", "mod.txt", "stg.txt");
  await repo.git("commit", "-m", "seed");
}

test("--save records a modified, a staged and an untracked file, leaves out an ignored file and everything under .temp/, lists an untracked directory file by file, and prints NEXT: trace then one recorded: line each", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "mod.txt", "two\n");
    write(repo.dir, "stg.txt", "two\n");
    await repo.git("add", "stg.txt");
    write(repo.dir, "new/dir/f.txt", "x\n");
    write(repo.dir, "ign.log", "x\n");
    write(repo.dir, ".temp/scratch.txt", "x\n");

    const result = await treeRecord(repo, ["--save"]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      ["NEXT: trace", "recorded: mod.txt", "recorded: new/dir/f.txt", "recorded: stg.txt", ""].join("\n"),
    );
    assert.equal(fs.readFileSync(recordFile(repo), "utf-8"), "mod.txt\nnew/dir/f.txt\nstg.txt\n");
  });
});

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

test("--check after another file changed prints the STOP: line and a path: line for that file only, never a recorded path changed further nor the test path", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "mod.txt", "two\n");
    await treeRecord(repo, ["--save"]);
    write(repo.dir, "mod.txt", "three\n");
    write(repo.dir, "tests/repro.test.ts", "x\n");
    write(repo.dir, "src/other.ts", "x\n");

    const result = await treeRecord(repo, ["--check", "tests/repro.test.ts"]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
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

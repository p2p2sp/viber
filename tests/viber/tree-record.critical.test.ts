/*
 * tree-record.critical.test.ts - the critical tier of
 * viber/skills/fixer/scripts/tree-record.sh: save records the changed files of
 * the tree, check stops on a second changed file, and the reproduction test is
 * recognised under the C:/, /c/ and other-case drive spellings on Windows.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by tree-record.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/tree-record.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withGitRepo } from "../harness/tmp.ts";
import { STOP, write, treeRecord, recordFile, seed } from "./tree-record-fixture.ts";

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

const WINDOWS = process.platform === "win32";

/** Each spelling of the repository root's `tests/repro.test.ts` an absolute argument can take. */
const ABSOLUTE_SPELLINGS: Array<[string, (root: string) => string]> = [
  ["the native absolute path", (root) => path.join(root, "tests", "repro.test.ts")],
  ...(WINDOWS
    ? ([
        ["the C:/ form", (root) => path.join(root, "tests", "repro.test.ts").replaceAll("\\", "/")],
        [
          "the /c/ form",
          (root) => path.join(root, "tests", "repro.test.ts").replaceAll("\\", "/").replace(/^([A-Za-z]):/, (_m, d: string) => `/${d}`),
        ],
        [
          "a drive letter in the other case",
          (root) =>
            path
              .join(root, "tests", "repro.test.ts")
              .replaceAll("\\", "/")
              .replace(/^([A-Za-z]):/, (_m, d: string) => `${d === d.toUpperCase() ? d.toLowerCase() : d.toUpperCase()}:`),
        ],
      ] as Array<[string, (root: string) => string]>)
    : []),
];

for (const [name, spell] of ABSOLUTE_SPELLINGS) {
  test(`--check given the reproduction test as ${name} after only that test was added prints NEXT: handoff`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);
      write(repo.dir, "mod.txt", "two\n");
      await treeRecord(repo, ["--save"]);
      write(repo.dir, "tests/repro.test.ts", "x\n");

      const result = await treeRecord(repo, ["--check", spell(fs.realpathSync.native(repo.dir))]);

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

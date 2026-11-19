/*
 * summary-path.test.ts - proves viber/skills/intent/scripts/summary-path.sh's contract:
 * run with no argument it prints one `NEXT: write | path: <root>/.temp/viber/intent/summary-<stamp>.md`
 * line (absolute path, forward slashes, stamp `YYYY-MM-DD-HH-MM-SS`), creates that directory and writes no
 * file; <root> is the repository root from any subdirectory and the cwd outside a repository; any argument
 * exits 2 with one `error:` line and an empty stdout.
 * Every case runs the script in a throwaway directory and reads the result back.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/summary-path.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { SUT } from "./summary-path-fixture.ts";

test("it creates the .temp/viber/intent/ directory and writes no file in it (the hand-off writes the summary itself)", async () => {
  await withGitRepo(async (repo) => {
    await runScript(SUT, [], { cwd: repo.dir, env: repo.env, shell: "bash" });

    const dir = path.join(repo.dir, ".temp", "viber", "intent");
    assert.deepEqual(fs.readdirSync(dir), []);
  });
});

test("run from a subdirectory it names the repository root, not the subdirectory", async () => {
  await withGitRepo(async (repo) => {
    const root = slash(fs.realpathSync(repo.dir));
    const sub = path.join(repo.dir, "src", "deep");
    fs.mkdirSync(sub, { recursive: true });

    const result = await runScript(SUT, [], { cwd: sub, env: repo.env, shell: "bash" });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.startsWith(`NEXT: write | path: ${root}/.temp/viber/intent/summary-`), result.stdout);
    assert.equal(fs.existsSync(path.join(sub, ".temp")), false);
  });
});

test("outside a repository it names the cwd as the root", async () => {
  await withTempDir("summary-path-", async (dir) => {
    const root = slash(fs.realpathSync(dir));

    const result = await runScript(SUT, [], { cwd: dir, shell: "bash" });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.startsWith(`NEXT: write | path: ${root}/.temp/viber/intent/summary-`), result.stdout);
    assert.equal(fs.existsSync(path.join(dir, ".temp", "viber", "intent")), true);
  });
});

test("any argument exits 2 with one error: line and an empty stdout, creating nothing", async () => {
  await withGitRepo(async (repo) => {
    const result = await runScript(SUT, ["extra"], { cwd: repo.dir, env: repo.env, shell: "bash" });

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: [^\n]+\n$/);
    assert.equal(fs.existsSync(path.join(repo.dir, ".temp")), false);
  });
});

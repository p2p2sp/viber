/*
 * check-playwright.test.ts - proves viber/scripts/check-playwright.sh's fixed
 * two-line report ("playwright-cli: ...", "@playwright/test: ..."), exit 0
 * always, across presence/absence of each tool independently.
 *
 * Exit 0 is the whole point: the script is the `e2e` skill's `!` preload, and a
 * non-zero exit there aborts the skill load, so a host missing both tools would
 * lose the skill instead of being offered the install.
 *
 * PATH isolation: `stubDirs` only PREPENDS to the real PATH, so on a host that
 * already has a real `playwright-cli` on PATH the "not found" cases would flip.
 * Every case therefore pins `opts.env.PATH` to the harness's minimal PATH
 * (`coreUtilsPath` in tests/harness/stub.ts, which carries the full rationale,
 * `git` included), and the found cases prepend one `withStub` dir on top of it.
 *
 * Repo reality: no build, no lint, no npm, no package.json (for THIS repo) -
 * this file is run directly by Node's native test runner + TypeScript type
 * stripping:
 *   node --test tests/viber/check-playwright.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/check-playwright.sh");

const STUB_VERSION_1_2_3 = 'echo "1.2.3"';
const STUB_VERSION_FAILS = "exit 1";

function run(dir: string, stubDirs: string[] = []) {
  return runScript(SUT, [], { cwd: dir, env: { PATH: coreUtilsPath() }, stubDirs });
}

/** coreUtilsPath() plus the directory that resolves the real `git` binary.
 *  Git for Windows splits git.exe (mingw64/bin) away from grep and bash
 *  (usr/bin), so coreUtilsPath() alone leaves `git ls-files` unresolved and
 *  the nested-package.json probe would silently see no tracked files. */
function pathWithGit(): string {
  const exe = (name: string) => (process.platform === "win32" ? [`${name}.exe`, name] : [name]);
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const gitDir = dirs.find((dir) => exe("git").some((n) => fs.existsSync(path.join(dir, n))));
  if (!gitDir) throw new Error("check-playwright.test.ts: no directory on PATH resolves git");
  return [coreUtilsPath(), gitDir].join(path.delimiter);
}

function runInRepo(dir: string) {
  return runScript(SUT, [], { cwd: dir, env: { PATH: pathWithGit() } });
}

test("no playwright-cli on PATH and no package.json: both lines report not found, and the exit is still 0", async () => {
  await withTempDir("p2p2-viber-playwright-", async (dir) => {
    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "playwright-cli: not found\n@playwright/test: not found\n");
  });
});

test("playwright-cli resolving and --version printing a line reports found with that version", async () => {
  await withStub("playwright-cli", STUB_VERSION_1_2_3, async (stubDir) => {
    await withTempDir("p2p2-viber-playwright-", async (dir) => {
      const result = await run(dir, [stubDir]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "playwright-cli: found 1.2.3\n@playwright/test: not found\n");
    });
  });
});

test("playwright-cli present but --version exiting 1 reports found (version unknown) rather than not found", async () => {
  await withStub("playwright-cli", STUB_VERSION_FAILS, async (stubDir) => {
    await withTempDir("p2p2-viber-playwright-", async (dir) => {
      const result = await run(dir, [stubDir]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "playwright-cli: found (version unknown)\n@playwright/test: not found\n");
    });
  });
});

test("a root package.json naming @playwright/test under devDependencies reports it found", async () => {
  await withTempDir("p2p2-viber-playwright-", async (dir) => {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "fixture", devDependencies: { "@playwright/test": "^1.40.0" } }, null, 2),
    );
    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "playwright-cli: not found\n@playwright/test: found\n");
  });
});

test("a tracked nested package.json naming @playwright/test reports it found even though the root package.json names nothing", async () => {
  await withGitRepo(async (repo) => {
    fs.mkdirSync(path.join(repo.dir, "apps", "web"), { recursive: true });
    fs.writeFileSync(
      path.join(repo.dir, "apps", "web", "package.json"),
      JSON.stringify({ name: "web", devDependencies: { "@playwright/test": "^1.40.0" } }, null, 2),
    );
    await repo.git("add", "apps/web/package.json");
    await repo.git("commit", "-m", "add web package.json");
    const result = await runInRepo(repo.dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "playwright-cli: not found\n@playwright/test: found\n");
  });
});

test("a tracked nested package.json under a non-ASCII directory naming @playwright/test reports it found (git quotes such a path in its default listing)", async () => {
  await withGitRepo(async (repo) => {
    fs.mkdirSync(path.join(repo.dir, "apps", "źródło"), { recursive: true });
    fs.writeFileSync(
      path.join(repo.dir, "apps", "źródło", "package.json"),
      JSON.stringify({ name: "zrodlo", devDependencies: { "@playwright/test": "^1.40.0" } }, null, 2),
    );
    await repo.git("add", "apps/źródło/package.json");
    await repo.git("commit", "-m", "add zrodlo package.json");
    const result = await runInRepo(repo.dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "playwright-cli: not found\n@playwright/test: found\n");
  });
});

test("an untracked nested package.json naming @playwright/test is not probed and reports it not found", async () => {
  await withGitRepo(async (repo) => {
    fs.mkdirSync(path.join(repo.dir, "apps", "web"), { recursive: true });
    fs.writeFileSync(
      path.join(repo.dir, "apps", "web", "package.json"),
      JSON.stringify({ name: "web", devDependencies: { "@playwright/test": "^1.40.0" } }, null, 2),
    );
    // Never `git add`-ed: the file stays untracked.
    const result = await runInRepo(repo.dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "playwright-cli: not found\n@playwright/test: not found\n");
  });
});

test("a repo naming @playwright/test nowhere, tracked or untracked, reports it not found", async () => {
  await withGitRepo(async (repo) => {
    fs.writeFileSync(path.join(repo.dir, "package.json"), JSON.stringify({ name: "root" }, null, 2));
    await repo.git("add", "package.json");
    await repo.git("commit", "-m", "add root package.json");
    const result = await runInRepo(repo.dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "playwright-cli: not found\n@playwright/test: not found\n");
  });
});

test("a package.json that does not name @playwright/test reports it not found (the two dimensions are independent)", async () => {
  await withStub("playwright-cli", STUB_VERSION_1_2_3, async (stubDir) => {
    await withTempDir("p2p2-viber-playwright-", async (dir) => {
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "fixture", devDependencies: { vitest: "^1.0.0" } }, null, 2),
      );
      const result = await run(dir, [stubDir]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "playwright-cli: found 1.2.3\n@playwright/test: not found\n");
    });
  });
});

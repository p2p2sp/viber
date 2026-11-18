/*
 * run-changes.test.ts - proves viber/scripts/run-changes.sh's contract: it prints the
 * base commit of a run and one `changed:` line per path that differs from it, with no
 * model involved.
 *
 * Properties that carry the design. The base of a run directory is the oldest commit
 * that added its `plan.md`, so a plan deleted and added again still starts the run at
 * its first commit; with no argument the base is HEAD; a run no commit added prints
 * `base: none` and nothing else. The changed paths are the tracked paths that differ
 * from the base (committed since or not) and then the untracked ones, a path both
 * lists hold printed once. The repository root is the cwd of the work, so a call from
 * a subdirectory prints what a call from the root prints. Exit 2 is the only refusal:
 * outside a repository, or with more than one argument.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/run-changes.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/run-changes.sh");

const RUN = "docs/_specs/2026-01-01-00-00-00_demo";
const PLAN = `${RUN}/plan.md`;

function run(cwd: string, env: Record<string, string>, args: string[]) {
  return runScript(SUT, args, { cwd, env, shell: "bash" });
}

function write(dir: string, rel: string, body: string): void {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

async function commitAll(repo: GitRepo, message: string): Promise<string> {
  await repo.git("add", "-A");
  await repo.git("commit", "-m", message);
  return (await repo.git("rev-parse", "HEAD")).stdout.trim();
}

/** Two tracked files, then the commit adding the run's plan; returns that commit. */
async function seed(repo: GitRepo): Promise<string> {
  // The repo keeps its git config as an untracked file in its own directory.
  fs.appendFileSync(path.join(repo.dir, ".git/info/exclude"), ".gitconfig-global\n");
  write(repo.dir, "tracked.txt", "one\n");
  write(repo.dir, "other.txt", "one\n");
  await commitAll(repo, "seed");
  write(repo.dir, PLAN, "plan\n");
  return commitAll(repo, "plan");
}

test("a run directory prints the commit that added its plan, then the tracked paths that differ from it and the untracked ones", async () => {
  await withGitRepo(async (repo) => {
    const base = await seed(repo);
    write(repo.dir, "tracked.txt", "two\n");
    await commitAll(repo, "work");
    write(repo.dir, "other.txt", "two\n");
    write(repo.dir, "new.txt", "new\n");

    const result = await run(repo.dir, repo.env, [RUN]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `base: ${base}\nchanged: other.txt\nchanged: tracked.txt\nchanged: new.txt\n`);
  });
});

test("a plan added, deleted and added again starts the run at its first commit (the oldest of the commits adding it)", async () => {
  await withGitRepo(async (repo) => {
    const first = await seed(repo);
    await repo.git("rm", "-q", "--", PLAN);
    await commitAll(repo, "drop plan");
    write(repo.dir, PLAN, "plan again\n");
    await commitAll(repo, "plan again");

    const result = await run(repo.dir, repo.env, [RUN]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `base: ${first}\nchanged: ${PLAN}\n`);
  });
});

test("a path deleted since the base and written again untracked is printed once (the diff and the untracked list both hold it)", async () => {
  await withGitRepo(async (repo) => {
    const base = await seed(repo);
    await repo.git("rm", "-q", "--", "tracked.txt");
    await commitAll(repo, "drop tracked");
    write(repo.dir, "tracked.txt", "back\n");

    const result = await run(repo.dir, repo.env, [RUN]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `base: ${base}\nchanged: tracked.txt\n`);
  });
});

test("no argument makes the base HEAD, so only the uncommitted and untracked paths are changes", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "tracked.txt", "two\n");
    await commitAll(repo, "committed work");
    write(repo.dir, "other.txt", "two\n");
    write(repo.dir, "new.txt", "new\n");

    const result = await run(repo.dir, repo.env, []);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "base: HEAD\nchanged: other.txt\nchanged: new.txt\n");
  });
});

test("a run directory whose plan.md no commit added prints base: none alone, whatever else changed", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "other.txt", "two\n");
    write(repo.dir, "new.txt", "new\n");

    const result = await run(repo.dir, repo.env, ["docs/_specs/no-such-run"]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "base: none\n");
  });
});

test("a call from a subdirectory prints the same lines as a call from the repository root (the paths stay relative to the root)", async () => {
  await withGitRepo(async (repo) => {
    const base = await seed(repo);
    write(repo.dir, "other.txt", "two\n");
    write(repo.dir, "sub/new.txt", "new\n");

    const result = await run(path.join(repo.dir, "sub"), repo.env, [RUN]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `base: ${base}\nchanged: other.txt\nchanged: sub/new.txt\n`);
  });
});

test("outside a repository it exits 2 and prints nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const result = await run(tmp, { GIT_CEILING_DIRECTORIES: path.dirname(tmp) }, [RUN]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
  });
});

test("more than one argument exits 2 and prints nothing on stdout", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);

    const result = await run(repo.dir, repo.env, [RUN, "second"]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
  });
});

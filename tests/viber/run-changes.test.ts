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
import path from "node:path";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { RUN, PLAN, run, write, commitAll, seed } from "./run-changes-fixture.ts";

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

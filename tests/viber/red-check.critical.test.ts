/*
 * red-check.critical.test.ts - the critical tier of
 * viber/scripts/red-check.sh: a test failing on HEAD yields FAIL-AS-EXPECTED,
 * another task's dirty file in the shared tree is left untouched, and a TERM
 * mid-run leaves no worktree or temp directory and the main node_modules
 * intact.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by red-check.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/red-check.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { canSymlinkDir } from "../harness/symlinks.ts";
import { withStub } from "../harness/stub.ts";
import {
  SUT,
  REAL_CMD,
  PLAN_REL,
  LOG_REL,
  run,
  write,
  seed,
  changeProduction,
  status,
  worktrees,
} from "./red-check-fixture.ts";

/** A stand-in for the same tool that makes the link and then sends TERM to
 *  red-check, so its trap runs right after an entry link exists: on Windows the
 *  one `cmd` call running the junction batch, elsewhere an `ln` whose link lies
 *  inside the worktree's node_modules. Every other call reaches the real tool. */
const TERM_AFTER_LINK = process.platform === "win32"
  ? { name: "cmd", body: 'case "$*" in\n  *mklink*) "$REAL_CMD" "$@"; kill -TERM "$PPID" ;;\n  *) exec "$REAL_CMD" "$@" ;;\nesac' }
  : { name: "ln", body: 'command -p ln "$@"\ncase "$*" in */wt/node_modules/?*) kill -TERM "$PPID" ;; esac' };

test("a test written first that fails on HEAD and passes with the change yields FAIL-AS-EXPECTED and the log", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    changeProduction(repo.dir);
    write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n[ "$(answer)" = 42 ]\n');
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `red-check: FAIL-AS-EXPECTED ${LOG_REL}\nNEXT: review\n`);
    const log = fs.readFileSync(path.join(repo.dir, LOG_REL), "utf-8");
    assert.match(log, /red run exit: 1/);
    assert.match(log, /control run exit: 0/);
  });
});

test("another task's dirty production file in the shared tree leaves the verdict, the tree and the worktree list untouched (parallel coders share the main tree)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    changeProduction(repo.dir);
    write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n. ./src/other.sh\n[ "$(answer)" = 42 ]\n');
    // T2's work in progress: copied into the worktree, it would fail both runs.
    write(repo.dir, "src/other.sh", "exit 3\n");
    const before = await status(repo);
    const listBefore = await worktrees(repo);
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `red-check: FAIL-AS-EXPECTED ${LOG_REL}\nNEXT: review\n`);
    assert.equal(await status(repo), before);
    assert.deepEqual(await worktrees(repo), listBefore);
    assert.equal(fs.readFileSync(path.join(repo.dir, "src/other.sh"), "utf-8"), "exit 3\n");
  });
});

// Root cause: red-check.sh recorded a link in its cleanup list only after mklink returned.
// Actual: a TERM landing between the two ran the cleanup without that link, so
// `git worktree remove --force` deleted the main tree's node_modules through the junction.
// Expected: the linked directory keeps its files and red-check exits 130.
// Fix direction: record the link before it is made.
test("a TERM landing right after an entry link is made exits 130 and leaves no registered worktree and no temp directory, the main tree's node_modules and its entries untouched (a link made but not yet recorded is skipped by the cleanup, so the forced remove deletes through it)", {
  skip: process.platform !== "win32" && !canSymlinkDir() ? "this account cannot create a directory symlink" : false,
}, async () => {
  await withGitRepo(async (repo) => {
    await withTempDir("red-check-tmp-", async (tmp) => {
      await seed(repo);
      changeProduction(repo.dir);
      write(repo.dir, "node_modules/pkg/precious.txt", "keep\n");
      write(repo.dir, "node_modules/.bin/tool.txt", "keep too\n");
      write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n[ "$(answer)" = 42 ]\n');
      await withStub(TERM_AFTER_LINK.name, TERM_AFTER_LINK.body, async (stubDir) => {
        const r = await runScript(SUT, [PLAN_REL, "T1"], {
          cwd: repo.dir,
          env: { ...repo.env, TMPDIR: tmp, REAL_CMD },
          stubDirs: [stubDir],
          shell: "bash",
          timeout: 120000,
        });
        assert.equal(r.status, 130, r.stderr);
        assert.deepEqual(fs.readdirSync(path.join(repo.dir, "node_modules")).sort(), [".bin", "pkg"]);
        assert.equal(fs.readFileSync(path.join(repo.dir, "node_modules/pkg/precious.txt"), "utf-8"), "keep\n");
        assert.equal(fs.readFileSync(path.join(repo.dir, "node_modules/.bin/tool.txt"), "utf-8"), "keep too\n");
        assert.equal((await worktrees(repo)).length, 1);
        assert.deepEqual(fs.readdirSync(tmp), []);
      });
    });
  });
});

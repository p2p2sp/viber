/*
 * commit-task.test.ts - proves viber/scripts/commit-task.sh's contract:
 * `commit-task.sh <plan-file> <task-id>` stages ONLY the paths on that task's
 * `- Files:` line and commits through that same pathspec - a file staged before
 * or beside the run stays in the index instead of riding along - under the
 * task's own heading line
 * (`### T1 - <title>`) as the subject, writes the `done:` and `progress:` lines
 * of the run's `status.md` - never the plan, which is frozen the moment it lands
 * - and prints `committed: <sha>` and `progress: x/N`
 * on stdout. Its stderr warning is scoped by subtracting the WHOLE plan's file
 * map, not the one task's slice: coders run in parallel, so another task's work
 * in progress is always in the tree and a warning naming it would fire on every
 * commit and mean nothing. What survives the subtraction is a change no task
 * accounted for.
 *
 * The entry and the commit are ATOMIC: the entry is written first so it rides
 * IN the commit, and any failure from there on (a refused `git commit`, a plan
 * outside the repository) restores `status.md` from its backup - or removes it
 * again when that call is what created it - and exits 5 with
 * nothing committed and nothing recorded. A status claiming a task is done that was
 * never committed would be skipped forever when a build resumes after a context
 * reset, and the orchestrator never re-verifies the script - so this is the one
 * invariant the suite exists for.
 *
 * `commit-task.sh <plan-file> <task-id> <fix-number> <file>...` is the post-test
 * repair of an already committed task: subject `T1(2) - <title>` off the same
 * heading, the plan untouched, and nothing the caller did not name - `.temp/`
 * reports above all - reaching the history.
 *
 * `commit-task.sh --repair <plan-file> <round> <file>...` is a whole repair round in
 * one call: each file a task lists lands in that task's fix commit (the
 * highest-numbered task when several list it), every other file in a DERIVED
 * commit (`fix(viber): post-test repair (round 2)`) instead of a borrowed heading,
 * so a regression in code the plan never touched is committable without inventing
 * a task id. A group with no change is skipped, and a commit failing mid-call lists
 * the paths still uncommitted. The cases below prove the `.temp/` refusal for it and
 * for `--chore`, `--qa` and `--e2e`.
 *
 * `--chore`, `--qa` and `--e2e` are the three forms for what a run produces beside
 * its task map - the knowledge files a close wrote, that close's QA documents, and
 * the Playwright specs a later e2e pass generated. None takes a task id or a
 * subject: each DERIVES its own, so the plan's progress is never touched and no
 * caller can get a hand-written subject into the history through them. The first
 * two take the plan to record the close in it; `--e2e` runs after the build, when
 * nothing resumes any more, and takes none.
 *
 * What a later session cannot derive from the tree is recorded in `status.md`
 * beside the done entry: `--skip` (the user dropped a task),
 * `--unreviewed` (the user waived the review gate), `--defer` (this task left a
 * path for a later one to prove, `<task-id>:<path>`) and the close entries above.
 * `--rule` writes the run's ruling register, `rulings.md` beside the plan, with
 * no commit; every commit form taking the plan carries it once it changed.
 * `--leftovers <plan> --drift <n>|none` accounts for every path the build left
 * uncommitted (the `plan-index.sh` skipped, dirty and orphan lines), commits the
 * unexplained ones under the `--outside` subject with one `Leftover:` line each, and
 * rewrites the leftovers section and the `Drift:` line of the run's `outcome.md`.
 * Every commit form also carries the run's own trail - the notes and reports
 * under `<run-dir>/work/` - derived from the task id or the round, so a parallel
 * task's notes never ride along and the trail reaches another machine.
 *
 * A named path is staged in whatever state it arrives - already staged, already
 * removed with `git rm`, tracked under a directory an ignore rule covers - so
 * it never drops out of the pathspec and stays staged, uncommitted.
 * `--landed <sha>` records a task whose work another commit already carried: a
 * status-only commit under a derived subject, refused unless the sha is in
 * HEAD's history, touches the task's files, and those files are clean.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/commit-task.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import {
  run,
  RUN_DIR,
  PLAN_REL,
  STATUS_REL,
  write,
  planBody,
  statusBody,
  TWO_TASKS,
  seed,
  readStatus,
  subjects,
  committedFiles,
  stagedFiles,
  breakCommit,
  headMode,
  OUTSIDE_SUBJECT,
  CMDLINE_CAP,
  MANY_PATHS,
  cappedGitEnv,
  writeMany,
  LONG_LIST_TIMEOUT,
  OUTCOME_REL,
  OUTCOME_HEAD,
  NO_NOTE_REASON,
  seedLeftovers,
  runLeftovers,
  readOutcome,
  headSha,
} from "./commit-task-fixture.ts";

/** Commits a hand-written plan body verbatim, for a case `planBody`'s task
 *  shape cannot express (a Contracts appendix, prose mentioning the marker). */
async function seedRaw(repo: GitRepo, planText: string, total: number): Promise<void> {
  write(repo.dir, PLAN_REL, planText);
  write(repo.dir, STATUS_REL, statusBody(total));
  write(repo.dir, "README.md", "seed\n");
  await repo.git("add", "-A");
  await repo.git("commit", "-m", "seed");
}

/** Two real tasks plus a `## Contracts` appendix whose own heading is shaped
 *  exactly like a task's (`### C3 - <name>`) - the case `--skip`/`--defer`
 *  must not confuse with a task id. */
const CONTRACTS_PLAN = [
  "# Plan - feat x",
  "",
  "## Tasks",
  "",
  "<!-- TASK -->",
  "### T1 - task T1",
  "- Files: src/a.ts",
  "<!-- /TASK -->",
  "",
  "<!-- TASK -->",
  "### T2 - task T2",
  "- Files: src/b.ts",
  "<!-- /TASK -->",
  "",
  "## Contracts",
  "",
  "### C3 - TASK marker line",
  "",
  "File: none",
  "",
].join("\n");

function planDirEntries(repo: GitRepo): string[] {
  return fs.readdirSync(path.join(repo.dir, path.dirname(PLAN_REL))).sort();
}

async function fixCommit(repo: GitRepo): Promise<void> {
  await repo.git("config", "commit.gpgsign", "false");
}

test("a bracketed Files path its own coder never wrote commits nothing - it does not fall back to the sibling its character class covers", async () => {
  await withGitRepo(async (repo) => {
    // The case the literal pathspec is FOR: git only prefers an exact match when
    // the exact path is there. With T1's file still unwritten, "src/app/[id]/..."
    // read as a pattern matches a parallel coder's "src/app/i/..." instead, and
    // that work would land under T1's subject with T1 marked done.
    await seed(repo, [["T1", "src/app/[id]/page.tsx"]]);
    write(repo.dir, "src/app/i/page.tsx", "another coder, mid-task\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 4, `stdout: ${result.stdout} stderr: ${result.stderr}`);
    assert.deepEqual(await subjects(repo), ["seed"]);
    assert.deepEqual(await stagedFiles(repo), []);
    assert.match(readStatus(repo), /^done: none$/m);
  });
});

test("a run whose status file is missing gets one created inside the task's own commit (a build that never split still commits)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    fs.rmSync(path.join(repo.dir, STATUS_REL));
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "no status file");
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /progress: 1\/2\n$/);
    assert.match(readStatus(repo), /^done: T1$/m);
    assert.match(readStatus(repo), /^skipped: none$/m);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("the commit subject is the task's whole heading line, taken from the plan (the orchestrator never composes or paraphrases it)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", "src/a.ts", "add the plan index"], ["T2", "src/b.ts"]]);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal((await subjects(repo))[0], "T1 - add the plan index");
  });
});

test("a changed file no task in the plan claims stays out of the commit and is named on stderr", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/UNRELATED.ts", "not mine\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
    assert.match(result.stderr, /changed, claimed by no task in the plan/);
    assert.match(result.stderr, /src\/UNRELATED\.ts/);
  });
});

test("--with adds a path no task claims to the task's own commit, so the commit that lands a task is the whole task", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    // the file the task's own work forced: the plan gave it no owner
    write(repo.dir, "src/wiring.ts", "register\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", "src/wiring.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", "src/wiring.ts"].sort());
    assert.doesNotMatch(result.stderr, /claimed by no task in the plan/);
  });
});

test("--with takes a path claimed by a task already done and names that task on stderr (no later commit would ever stage the file)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, STATUS_REL, statusBody(2).replace("done: none", "done: T2").replace("progress: 0/2", "progress: 1/2"));
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "T2 done");
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/b.ts", "a defect T1's tests exposed\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", "src/b.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /took src\/b\.ts - claimed by committed task T2/);
    assert.doesNotMatch(result.stderr, /refused/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", "src/b.ts"].sort());
    assert.match(readStatus(repo), /^done: T2 T1$/m);
  });
});

test("an extras path that another open task's extras file lists is refused and left out of the commit (that task's coder may be writing it now)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "lib/shared.ts", "both tasks forced this\n");
    write(repo.dir, `${RUN_DIR}/work/T1-extra-review.md`, "lib/shared.ts\n");
    write(repo.dir, `${RUN_DIR}/work/T2-extra.md`, "lib/shared.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /warning: refused lib\/shared\.ts - claimed by task T2/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", `${RUN_DIR}/work/T1-extra-review.md`].sort());
  });
});

test("--with a path that another open task's extras file lists gets the same refusal", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "lib/shared.ts", "both tasks forced this\n");
    write(repo.dir, `${RUN_DIR}/work/T2-extra-review.md`, "lib/shared.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", "lib/shared.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /warning: refused lib\/shared\.ts - claimed by task T2/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("an extras path that only a done task's extras file lists is taken, naming the committed task", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, `${RUN_DIR}/work/T2-extra.md`, "lib/shared.ts\n");
    write(repo.dir, STATUS_REL, statusBody(2).replace("done: none", "done: T2").replace("progress: 0/2", "progress: 1/2"));
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "T2 done");
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "lib/shared.ts", "both tasks forced this\n");
    write(repo.dir, `${RUN_DIR}/work/T1-extra-review.md`, "lib/shared.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /warning: took lib\/shared\.ts - claimed by committed task T2/);
    assert.doesNotMatch(result.stderr, /refused/);
    assert.deepEqual(
      await committedFiles(repo),
      [STATUS_REL, "lib/shared.ts", "src/a.ts", `${RUN_DIR}/work/T1-extra-review.md`].sort(),
    );
  });
});

test("an extras path that no other task's extras file lists is staged without a warning, whatever the other extras files hold", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "lib/shared.ts", "only T1 forced this\n");
    write(repo.dir, `${RUN_DIR}/work/T1-extra.md`, "lib/shared.ts\n");
    write(repo.dir, `${RUN_DIR}/work/T2-extra.md`, "lib/other.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /refused|took/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "lib/shared.ts", "src/a.ts", `${RUN_DIR}/work/T1-extra.md`].sort());
  });
});

test("--with still refuses a path whose owner was skipped (its half-finished files stay uncommitted and visible)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, STATUS_REL, statusBody(2).replace("skipped: none", "skipped: T2"));
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "T2 skipped");
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/b.ts", "half-finished\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", "src/b.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused src\/b\.ts - claimed by task T2/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("--with a path the task already claims commits it once, not twice", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", "src/a.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("--with a .temp path is refused, like any other form (machine state never reaches the history)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, ".temp/viber/T1/build.log", "noise\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", ".temp/viber/T1/build.log"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused \.temp\/viber\/T1\/build\.log/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("an extras-file line holding a task's file as an absolute path is refused like its relative spelling (an absolute spelling is not a way past the ownership check)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/b.ts", "T2's coder, still running\n");
    write(repo.dir, `${RUN_DIR}/work/T1-extra.md`, `${path.join(repo.dir, "src/b.ts")}\n`);

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused src\/b\.ts - claimed by task T2/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", `${RUN_DIR}/work/T1-extra.md`].sort());
  });
});

test("--with an absolute path of a file another open task claims is refused like its relative spelling", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/b.ts", "T2's coder, still running\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", path.join(repo.dir, "src/b.ts")]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused src\/b\.ts - claimed by task T2/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("an extras-file line with a trailing space is staged under its trimmed name", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "lib/x.ts", "forced\n");
    write(repo.dir, `${RUN_DIR}/work/T1-extra.md`, "lib/x.ts \n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "lib/x.ts", "src/a.ts", `${RUN_DIR}/work/T1-extra.md`].sort());
  });
});

test("an extras-file line with leading spaces is staged under its trimmed name", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "lib/x.ts", "forced\n");
    write(repo.dir, `${RUN_DIR}/work/T1-extra.md`, "   lib/x.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "lib/x.ts", "src/a.ts", `${RUN_DIR}/work/T1-extra.md`].sort());
  });
});

test("--with an absolute path no task claims is committed under its repo-relative name", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/wiring.ts", "register\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", path.join(repo.dir, "src/wiring.ts")]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", "src/wiring.ts"].sort());
  });
});

test("--with an absolute path under .temp is refused like its relative form (an absolute spelling is not a way past the machine-state refusal)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, ".temp/viber/T1/build.log", "noise\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", path.join(repo.dir, ".temp/viber/T1/build.log")]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused \.temp\/viber\/T1\/build\.log - \.temp is machine state/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("--with an absolute path outside the repository still fails in git and commits nothing", async () => {
  await withGitRepo(async (repo) => {
    await withTempDir("p2p2-outside-", async (outside) => {
      await seed(repo);
      write(repo.dir, "src/a.ts", "work\n");
      write(outside, "stray.ts", "elsewhere\n");

      const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", path.join(outside, "stray.ts")]);
      assert.notEqual(result.status, 0);
      assert.deepEqual(await subjects(repo), ["seed"]);
    });
  });
});

test("--defer records the repo-relative form of an absolute path", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [
      PLAN_REL,
      "T1",
      "--defer",
      `T2:${path.join(repo.dir, "src/a.ts")}`,
    ]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(readStatus(repo), /^deferred: T2:src\/a\.ts$/m);
  });
});

test("--with combines with --unreviewed in either order, and --with alone with no path exits 2", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/wiring.ts", "register\n");

    assert.equal((await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with"])).status, 2);
    assert.equal((await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", "--unreviewed"])).status, 2);

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--unreviewed", "--with", "src/wiring.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(readStatus(repo), /^unreviewed: T1$/m);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", "src/wiring.ts"].sort());
  });
});

test("--defer records who owes a path its test, and that entry rides in the task's own commit", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--defer", "T2:src/a.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(readStatus(repo), /^deferred: T2:src\/a\.ts$/m);

    // read back out of history: a resumed session in another context still
    // knows which task owes the proof
    const fromHistory = (await repo.git("show", `HEAD:${STATUS_REL}`)).stdout;
    assert.match(fromHistory, /^deferred: T2:src\/a\.ts$/m);
    // the path is already in the task's own map - --defer stages nothing
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("--defer normalizes a leading './' on the path half of an entry, like every other path argument", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--defer", "T2:./src/a.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(readStatus(repo), /^deferred: T2:src\/a\.ts$/m);
  });
});

test("--defer takes several entries and appends each one once, so a repeated deferral does not pile up", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");

    assert.equal(
      (await run(repo.dir, repo.env, [PLAN_REL, "T1", "--defer", "T2:src/a.ts", "T2:src/wiring.ts"])).status,
      0,
    );
    assert.match(readStatus(repo), /^deferred: T2:src\/a\.ts T2:src\/wiring\.ts$/m);

    // the same entry on the next commit is a no-op, like every other key
    write(repo.dir, "src/b.ts", "work\n");
    assert.equal((await run(repo.dir, repo.env, [PLAN_REL, "T2", "--defer", "T2:src/a.ts"])).status, 0);
    assert.match(readStatus(repo), /^deferred: T2:src\/a\.ts T2:src\/wiring\.ts$/m);
  });
});

test("--defer refuses an entry no task in the plan owns and commits anyway (untested code with no owner is unfinished, not deferred)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [
      PLAN_REL,
      "T1",
      "--defer",
      "T9:src/a.ts",
      "src/a.ts",
      "T2:src/a.ts",
    ]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused T9:src\/a\.ts - no task T9 in the plan/);
    assert.match(result.stderr, /refused src\/a\.ts - a --defer entry is <task-id>:<path>/);
    assert.match(readStatus(repo), /^deferred: T2:src\/a\.ts$/m);
    assert.match(readStatus(repo), /^done: T1$/m);

    // and it is a flag like the others: no entry at all is a usage error
    assert.equal((await run(repo.dir, repo.env, [PLAN_REL, "T2", "--defer"])).status, 2);
    assert.equal((await run(repo.dir, repo.env, [PLAN_REL, "T2", "--defer", "--unreviewed"])).status, 2);
  });
});

test("a refused git commit rolls the deferred entry back with the done entry - neither outlives a commit that did not happen", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    const before = readStatus(repo);
    await breakCommit(repo);

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--defer", "T2:src/a.ts"]);
    assert.equal(result.status, 5);
    assert.equal(readStatus(repo), before);
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("another task's work in progress is not named on stderr (coders run in parallel, so a warning scoped to one task's map would fire on every commit)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/b.ts", "T2's coder, still running\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
    assert.doesNotMatch(result.stderr, /claimed by no task/);
    assert.doesNotMatch(result.stderr, /src\/b\.ts/);
  });
});

test("a wholly untracked directory holding another task's file is not warned about (git collapses it to 'dir/' unless every untracked file is listed)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", "src/a.ts"], ["T2", "lib/b.ts"]]);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "lib/b.ts", "T2's coder, in a directory git has never seen\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /claimed by no task/);
    assert.doesNotMatch(result.stderr, /lib/);
  });
});

test("a refused git commit leaves no backup or temp file in the run directory", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await breakCommit(repo);

    await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.deepEqual(planDirEntries(repo), ["plan.md", "status.md"]);
  });
});

test("a refused commit on a run with no status file leaves none behind (the call is what created it)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    fs.rmSync(path.join(repo.dir, STATUS_REL));
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "no status file");
    write(repo.dir, "src/a.ts", "work\n");
    await breakCommit(repo);

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 5);
    assert.deepEqual(planDirEntries(repo), ["plan.md"]);
  });
});

test("a refused git commit leaves the task's work staged, so the same call retried after the cause is fixed commits it", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await breakCommit(repo);

    const refused = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(refused.status, 5);
    assert.ok((await stagedFiles(repo)).includes("src/a.ts"), `staged: ${(await stagedFiles(repo)).join(", ")}`);

    await fixCommit(repo);
    const retried = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(retried.status, 0, `stderr: ${retried.stderr}`);
    assert.match(retried.stdout, /progress: 1\/2\n$/);
    assert.match(readStatus(repo), /^done: T1$/m);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("work left staged by a refused commit does not ride along in the next task's commit (the user answered 'skip', not 'retry')", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await breakCommit(repo);
    assert.equal((await run(repo.dir, repo.env, [PLAN_REL, "T1"])).status, 5);
    await fixCommit(repo);

    write(repo.dir, "src/b.ts", "the task after the skipped one\n");
    const result = await run(repo.dir, repo.env, [PLAN_REL, "T2"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/b.ts"].sort());
    assert.deepEqual(await stagedFiles(repo), ["src/a.ts"]);
    assert.match(readStatus(repo), /^done: T2$/m);
  });
});

test("a plan outside the repository fails while staging and leaves no state file behind", async () => {
  // The plan mode hand-over case: plan mode can name a file outside the project,
  // where `git add` is fatal - the entry must not survive that either, and the
  // status file this call created must be gone with it.
  await withTempDir("p2p2-viber-outside-", async (outside) => {
    await withGitRepo(async (repo) => {
      await seed(repo);
      write(repo.dir, "src/a.ts", "work\n");
      const plan = path.join(outside, "plan.md");
      fs.writeFileSync(plan, planBody(TWO_TASKS));
      const before = fs.readFileSync(plan, "utf-8");

      const result = await run(repo.dir, repo.env, [plan, "T1"]);
      assert.equal(result.status, 5);
      assert.equal(result.stdout, "");
      assert.equal(fs.readFileSync(plan, "utf-8"), before);
      assert.deepEqual(fs.readdirSync(outside), ["plan.md"]);
      assert.deepEqual(await subjects(repo), ["seed"]);
    });
  });
});

test("the second task advances the counter to 2/2 and appends to the done entry", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    write(repo.dir, "src/b.ts", "more\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T2"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /progress: 2\/2\n$/);
    assert.match(readStatus(repo), /^done: T1 T2$/m);
    assert.match(readStatus(repo), /^progress: 2\/2$/m);
  });
});

test("committing the same task id twice does not duplicate it in the done entry or double the counter", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    write(repo.dir, "src/a.ts", "more work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /progress: 1\/2\n$/);
    assert.match(readStatus(repo), /^done: T1$/m);
    assert.match(readStatus(repo), /^progress: 1\/2$/m);
  });
});

test("a fix commits only the files it names, even when other work is already staged", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    write(repo.dir, "src/a.ts", "repair\n");
    write(repo.dir, "src/b.ts", "another task's work, staged and not yet committed\n");
    await repo.git("add", "--", "src/b.ts");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "2", "src/a.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), ["src/a.ts"]);
    assert.deepEqual(await stagedFiles(repo), ["src/b.ts"]);
  });
});

test("a fix refuses a .temp path instead of writing machine state into the history", async () => {
  // The whole point of the explicit list: a run's own review and test reports
  // live under .temp/viber/ and must never reach a commit.
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "repair\n");
    write(repo.dir, ".temp/viber/2026-09-20-10-00-00_feat-x/tests-1.md", "one failure\n");

    const result = await run(repo.dir, repo.env, [
      PLAN_REL,
      "T1",
      "1",
      "src/a.ts",
      ".temp/viber/2026-09-20-10-00-00_feat-x/tests-1.md",
    ]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), ["src/a.ts"]);
    assert.match(result.stderr, /refused \.temp\/viber/);
  });
});

test("a fix number without a file list exits 2 rather than falling back to the whole tree", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "repair\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "1"]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /usage: commit-task\.sh <plan-file> <task-id>/);
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("a third argument that is not a fix number exits 2 (a caller passing a hand-written subject is refused, never committed under it)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "repair\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "fix: post-test repair", "src/a.ts"]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /usage: commit-task\.sh <plan-file> <task-id>/);
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("a task id that is not in the plan exits 3 without touching the run's state or the history", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T9"]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /no task 'T9' in/);
    assert.equal(readStatus(repo), before);
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("a task whose tracked files produced no change is recorded done in a record-only commit (a verification task that found nothing to fix needs no question)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "verified\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^subject: chore\(viber\): record T1 done, no change needed$/m);
    assert.match(result.stdout, /^progress: 1\/\d+$/m);
    assert.match(readStatus(repo), /^done: T1$/m);
    assert.deepEqual(await subjects(repo), ["chore(viber): record T1 done, no change needed", "seed", "seed"]);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL]);
  });
});

test("a task whose file was never written exits 4 without touching the run's state (an unwritten new file is unfinished work, not verified work)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /task T1 committed nothing - a path it names is missing/);
    assert.equal(readStatus(repo), before);
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("a tracked file under a directory its .gitignore ignores is committed, staged or not (git add exits 1 on the ignored parent yet stages the file)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", "skills/k-x/refs/a.md, skills/k-x/refs/b.md, skills/k-x/refs/c.md"], ["T2", "src/b.ts"]]);
    write(repo.dir, "skills/.gitignore", "*\n!.gitignore\n!k-*/\n");
    for (const f of ["a", "b", "c"]) write(repo.dir, `skills/k-x/refs/${f}.md`, "old\n");
    await repo.git("add", "-f", "skills");
    await repo.git("commit", "-m", "base");
    write(repo.dir, "skills/k-x/refs/a.md", "new\n");
    write(repo.dir, "skills/k-x/refs/b.md", "new\n");
    await repo.git("add", "skills/k-x/refs/b.md");
    await repo.git("rm", "-q", "skills/k-x/refs/c.md");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /could not stage/);
    assert.deepEqual(
      await committedFiles(repo),
      [STATUS_REL, "skills/k-x/refs/a.md", "skills/k-x/refs/b.md", "skills/k-x/refs/c.md"].sort(),
    );
    assert.deepEqual(await stagedFiles(repo), []);
  });
});

test("an untracked file an ignore rule covers is still refused with a warning (a Files entry never force-adds what the repo ignores)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", "src/a.ts, build/out.js"], ["T2", "src/b.ts"]]);
    write(repo.dir, ".gitignore", "build/\n");
    await repo.git("add", ".gitignore");
    await repo.git("commit", "-m", "ignore");
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "build/out.js", "gen\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /could not stage build\/out\.js/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("--repair stages a path already removed with git rm (the flag forms share the same staging)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "lib/x.ts", "old\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "base");
    await repo.git("rm", "-q", "lib/x.ts");

    const result = await run(repo.dir, repo.env, ["--repair", PLAN_REL, "1", "lib/x.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), ["lib/x.ts"]);
  });
});

test("--landed refuses a commit that touches none of the task's files, and one that is not in HEAD's history, without recording anything", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    const seedSha = (await repo.git("rev-parse", "HEAD")).stdout.trim();
    const before = readStatus(repo);

    const wrong = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--landed", seedSha]);
    assert.equal(wrong.status, 4);
    assert.match(wrong.stderr, /touches none of task T1's files/);

    const unknown = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--landed", "deadbeef"]);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /not a commit in HEAD's history/);

    assert.equal(readStatus(repo), before);
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("--landed refuses while the task's files still carry uncommitted changes (they belong in a normal task commit)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await repo.git("add", "src/a.ts");
    await repo.git("commit", "-m", "landed elsewhere");
    const sha = (await repo.git("rev-parse", "HEAD")).stdout.trim();
    write(repo.dir, "src/a.ts", "more\n");
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--landed", sha]);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /still has uncommitted changes/);
    assert.equal(readStatus(repo), before);
  });
});

test("--landed marks a task done through a --no-ff merge commit that brought its files in on the first parent's diff", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await repo.git("checkout", "-b", "feature");
    write(repo.dir, "src/a.ts", "work\n");
    await repo.git("add", "src/a.ts");
    await repo.git("commit", "-m", "add a.ts on feature");
    await repo.git("checkout", "main");
    await repo.git("merge", "--no-ff", "feature", "-m", "merge feature");
    const sha = (await repo.git("rev-parse", "HEAD")).stdout.trim();

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--landed", sha.slice(0, 7)]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(
      result.stdout,
      /^committed: [0-9a-f]{7,}\nsubject: chore\(viber\): record T1 done, landed in [0-9a-f]{7,}\nprogress: 1\/2\n$/,
    );
    assert.deepEqual(await committedFiles(repo), [STATUS_REL]);
    assert.match(readStatus(repo), /^done: T1$/m);
  });
});

test("--landed refuses a --no-ff merge commit that brought in only files no task's map claims, even though the merge itself changed the tree", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await repo.git("checkout", "-b", "feature");
    write(repo.dir, "src/UNRELATED.ts", "not part of any task\n");
    await repo.git("add", "src/UNRELATED.ts");
    await repo.git("commit", "-m", "add unrelated file on feature");
    await repo.git("checkout", "main");
    await repo.git("merge", "--no-ff", "feature", "-m", "merge unrelated");
    const sha = (await repo.git("rev-parse", "HEAD")).stdout.trim();
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--landed", sha]);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /touches none of task T1's files/);
    assert.equal(readStatus(repo), before);
    // no new commit was made recording the task done - the three from the
    // fixture merge are all there is, in whatever order equal pinned commit
    // dates leave them
    assert.deepEqual((await subjects(repo)).sort(), ["add unrelated file on feature", "merge unrelated", "seed"]);
  });
});

test("a missing argument exits 2 with usage on stderr", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    const result = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /usage: commit-task\.sh <plan-file> <task-id>/);
  });
});

test("a plan path that does not exist exits 2 (never a half-run against a typo'd path)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    const result = await run(repo.dir, repo.env, ["docs/_specs/nope/plan.md", "T1"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /plan file not found/);
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

// --- --repair: a post-test fix outside the plan's file map ------------------

test("--repair without a numeric round, without a file, or against a missing plan exits 2 (the fallback never becomes a way to commit anything at all)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/legacy.ts", "the regression the suite caught\n");

    const noRound = await run(repo.dir, repo.env, ["--repair", PLAN_REL, "src/legacy.ts"]);
    assert.equal(noRound.status, 2);
    assert.match(noRound.stderr, /usage: commit-task\.sh/);

    const noFiles = await run(repo.dir, repo.env, ["--repair", PLAN_REL, "1"]);
    assert.equal(noFiles.status, 2);
    assert.match(noFiles.stderr, /usage: commit-task\.sh/);

    const noPlan = await run(repo.dir, repo.env, ["--repair", "docs/_specs/nope/plan.md", "1", "src/legacy.ts"]);
    assert.equal(noPlan.status, 2);
    assert.match(noPlan.stderr, /plan file not found/);

    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

/** A `git` function that makes the `failing`-th "git commit" of the call fail, the
 *  way a rejected signature does, while every other git call runs as it is. */
function failingCommitEnv(repo: GitRepo, failing: number): Record<string, string> {
  const gitDir = path.join(repo.dir, ".git").replace(/\\/g, "/");
  const file = path.join(repo.dir, ".git", "commit-fail-shim.sh");
  fs.writeFileSync(path.join(repo.dir, ".git", "commit-calls.txt"), "");
  fs.writeFileSync(
    file,
    [
      "git() {",
      '  if [ "$1" = commit ]; then',
      `    echo x >> "${gitDir}/commit-calls.txt"`,
      `    if [ "$(wc -l < "${gitDir}/commit-calls.txt")" -eq ${failing} ]; then`,
      "      return 1",
      "    fi",
      "  fi",
      '  command git "$@"',
      "}",
      "",
    ].join("\n"),
  );
  return { ...repo.env, BASH_ENV: file.replace(/\\/g, "/") };
}

const REPAIR_TASKS: Array<[string, string, string?]> = [
  ["T1", "src/a.ts", "first"],
  ["T2", "src/b.ts", "second"],
  ["T3", "src/b.ts, src/c.ts", "third"],
];

async function filesOf(repo: GitRepo, rev: string): Promise<string[]> {
  return (await repo.git("show", "--name-only", "--format=", rev)).stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

test("--repair lands a file a task lists in that task's fix commit, the highest-numbered task when several list it (a skipped one included), and every other file in the post-test commit, one commit per task in task order, the round's trail in the first commit", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, REPAIR_TASKS);
    await run(repo.dir, repo.env, ["--skip", PLAN_REL, "T3"]);
    write(repo.dir, "src/legacy.ts", "outside every map\n");
    write(repo.dir, "src/b.ts", "listed by T2 and T3\n");
    write(repo.dir, "src/a.ts", "listed by T1\n");
    write(repo.dir, `${RUN_DIR}/work/tests-2.md`, "the failing run\n");
    write(repo.dir, `${RUN_DIR}/work/repair-2-coder.md`, "what the repair changed\n");

    const result = await run(repo.dir, repo.env, ["--repair", PLAN_REL, "2", "src/legacy.ts", "src/b.ts", "src/a.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(result.stdout.match(/^subject: .*$/gm), [
      "subject: T1(2) - first",
      "subject: T3(2) - third",
      "subject: fix(viber): post-test repair (round 2)",
    ]);
    assert.equal(result.stdout.match(/^committed: [0-9a-f]{7,}$/gm)?.length, 3);
    assert.match(result.stdout, /^progress: unchanged$/m);

    assert.deepEqual((await subjects(repo)).slice(0, 3), [
      "fix(viber): post-test repair (round 2)",
      "T3(2) - third",
      "T1(2) - first",
    ]);
    assert.deepEqual(await filesOf(repo, "HEAD~2"), [`${RUN_DIR}/work/repair-2-coder.md`, `${RUN_DIR}/work/tests-2.md`, "src/a.ts"].sort());
    assert.deepEqual(await filesOf(repo, "HEAD~1"), ["src/b.ts"]);
    assert.deepEqual(await filesOf(repo, "HEAD"), ["src/legacy.ts"]);
    assert.match((await repo.git("log", "-1", "--format=%b", "HEAD~1")).stdout, /Refs: docs\/_specs\/\S+ task T3 fix 2/);
    assert.match((await repo.git("log", "-1", "--format=%b", "HEAD")).stdout, /Refs: docs\/_specs\/\S+ post-test fix 2/);
  });
});

test("--repair skips a group with no change and exits 4 only when every group had none (the trail then rides in the first group that did change)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, REPAIR_TASKS);
    write(repo.dir, "src/a.ts", "listed by T1\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "already committed");
    write(repo.dir, "src/c.ts", "listed by T3\n");
    write(repo.dir, `${RUN_DIR}/work/tests-1.md`, "the failing run\n");

    const result = await run(repo.dir, repo.env, ["--repair", PLAN_REL, "1", "src/a.ts", "src/c.ts", "src/none.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(result.stdout.match(/^subject: .*$/gm), ["subject: T3(1) - third"]);
    assert.deepEqual(await filesOf(repo, "HEAD"), [`${RUN_DIR}/work/tests-1.md`, "src/c.ts"].sort());

    const again = await run(repo.dir, repo.env, ["--repair", PLAN_REL, "1", "src/a.ts", "src/c.ts"]);
    assert.equal(again.status, 4);
    assert.equal(again.stdout, "");
    assert.deepEqual((await subjects(repo)).slice(0, 2), ["T3(1) - third", "already committed"]);
  });
});

test("--repair failing on a later group's commit exits 5 with the earlier groups committed and printed, one uncommitted line per path of the failed and later groups, and the same call run again commits what is left", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, REPAIR_TASKS);
    write(repo.dir, "src/a.ts", "listed by T1\n");
    write(repo.dir, "src/c.ts", "listed by T3\n");
    write(repo.dir, "src/legacy.ts", "outside every map\n");
    write(repo.dir, "src/other.ts", "outside every map\n");
    write(repo.dir, `${RUN_DIR}/work/tests-3.md`, "the failing run\n");
    const args = ["--repair", PLAN_REL, "3", "src/a.ts", "src/c.ts", "src/legacy.ts", "src/other.ts"];

    const failed = await run(repo.dir, failingCommitEnv(repo, 2), args);
    assert.equal(failed.status, 5, `stderr: ${failed.stderr}`);
    assert.deepEqual(failed.stdout.match(/^subject: .*$/gm), ["subject: T1(3) - first"]);
    assert.deepEqual(failed.stdout.match(/^uncommitted: .*$/gm), [
      "uncommitted: src/c.ts",
      "uncommitted: src/legacy.ts",
      "uncommitted: src/other.ts",
    ]);
    assert.doesNotMatch(failed.stdout, /progress:/);
    assert.deepEqual((await subjects(repo)).slice(0, 2), ["T1(3) - first", "seed"]);
    assert.deepEqual(await filesOf(repo, "HEAD"), [`${RUN_DIR}/work/tests-3.md`, "src/a.ts"].sort());

    const again = await run(repo.dir, repo.env, args);
    assert.equal(again.status, 0, `stderr: ${again.stderr}`);
    assert.deepEqual(again.stdout.match(/^subject: .*$/gm), ["subject: T3(3) - third", "subject: fix(viber): post-test repair (round 3)"]);
    assert.deepEqual(await filesOf(repo, "HEAD~1"), ["src/c.ts"]);
    assert.deepEqual(await filesOf(repo, "HEAD"), ["src/legacy.ts", "src/other.ts"]);
  });
});

test("--repair failing on the first commit lists every named path as uncommitted and the status of the run is left alone", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, REPAIR_TASKS);
    write(repo.dir, "src/a.ts", "listed by T1\n");
    write(repo.dir, "src/legacy.ts", "outside every map\n");
    const before = readStatus(repo);

    const result = await run(repo.dir, failingCommitEnv(repo, 1), ["--repair", PLAN_REL, "1", "src/legacy.ts", "src/a.ts"]);
    assert.equal(result.status, 5, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "uncommitted: src/a.ts\nuncommitted: src/legacy.ts\n");
    assert.deepEqual(await subjects(repo), ["seed"]);
    assert.equal(readStatus(repo), before);
  });
});

// --- --chore: what the close produced, which no task owns -------------------

test("--chore commits nothing it was not given, and refuses a .temp/ path outright", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "CLAUDE.md", "memory\n");
    write(repo.dir, ".temp/viber/run/T1-coder.md", "the notes memory was written from\n");
    write(repo.dir, "src/a.ts", "a coder left this behind\n");

    const result = await run(repo.dir, repo.env, ["--chore", PLAN_REL, "CLAUDE.md", ".temp/viber/run/T1-coder.md"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused \.temp\/viber\/run\/T1-coder\.md/);

    // status.md rides along because the close records itself there, nothing else
    assert.deepEqual(await committedFiles(repo), ["CLAUDE.md", STATUS_REL].sort());
    // git collapses an untracked directory in --short, so both show as the dir
    const dirty = (await repo.git("status", "--short")).stdout;
    assert.match(dirty, /\?\? \.temp\//);
    assert.match(dirty, /\?\? src\//);
  });
});

test("--chore with nothing changed exits 4, and without a plan or a file exits 2", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "CLAUDE.md", "memory\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "already recorded");

    const unchanged = await run(repo.dir, repo.env, ["--chore", PLAN_REL, "CLAUDE.md"]);
    assert.equal(unchanged.status, 4);
    assert.match(unchanged.stderr, /no changes to commit/);

    const noFiles = await run(repo.dir, repo.env, ["--chore", PLAN_REL]);
    assert.equal(noFiles.status, 2);
    assert.match(noFiles.stderr, /usage: commit-task\.sh/);

    const noPlan = await run(repo.dir, repo.env, ["--chore"]);
    assert.equal(noPlan.status, 2);
    assert.match(noPlan.stderr, /usage: commit-task\.sh/);
  });
});

// --- --qa and --e2e: the QA documents a build's close wrote, and the specs a
// --- later e2e pass generated, neither of which any task's map names ----------

/** --qa records the close in the run's status and so takes the plan; --e2e runs after the
 *  build, when nothing resumes any more, and takes no plan at all. */
function closeArgs(form: string, files: string[]): string[] {
  return form === "--e2e" ? [form, ...files] : [form, PLAN_REL, ...files];
}

test("--qa and --e2e each carry a fixed derived subject, so no caller composes a commit subject here either", async () => {
  const cases: Array<[form: string, files: string[], subject: string]> = [
    ["--qa", [`${RUN_DIR}/qa.md`, `${RUN_DIR}/qa.e2e.md`], "docs(viber): qa scenarios"],
    ["--e2e", ["tests/e2e/qa-01-approve-a-timesheet.spec.ts", `${RUN_DIR}/qa.e2e.md`], "test(viber): e2e specs"],
  ];

  for (const [form, files, subject] of cases) {
    await withGitRepo(async (repo) => {
      await seed(repo);
      for (const f of files) write(repo.dir, f, "written after the build\n");

      const result = await run(repo.dir, repo.env, closeArgs(form, files));
      assert.equal(result.status, 0, `${form} -> stderr: ${result.stderr}`);
      assert.match(result.stdout, /^committed: [0-9a-f]{7,}\n/);
      assert.match(result.stdout, new RegExp(`^subject: ${subject.replace(/[()]/g, "\\$&")}$`, "m"));
      assert.equal((await subjects(repo))[0], subject);
      const expected = form === "--e2e" ? [...files] : [...files, STATUS_REL];
      assert.deepEqual(await committedFiles(repo), expected.sort());
    });
  }
});

test("--qa and --e2e close out no task, so neither ever touches the progress counter", async () => {
  for (const form of ["--qa", "--e2e"]) {
    await withGitRepo(async (repo) => {
      await seed(repo);
      const before = readStatus(repo);
      write(repo.dir, `${RUN_DIR}/qa.e2e.md`, "Base: unknown\n");

      const result = await run(repo.dir, repo.env, closeArgs(form, [`${RUN_DIR}/qa.e2e.md`]));
      assert.equal(result.status, 0, `${form} -> stderr: ${result.stderr}`);
      assert.doesNotMatch(result.stdout, /progress:/);
      assert.match(readStatus(repo), /^done: none$/m);
      assert.match(readStatus(repo), /^progress: 0\/2$/m);
      // --e2e records nothing at all; --qa adds only its closed entry
      if (form === "--e2e") assert.equal(readStatus(repo), before);
      else assert.match(readStatus(repo), /^closed: qa$/m);
    });
  }
});

test("--qa and --e2e commit nothing they were not given, and refuse a .temp/ path outright", async () => {
  for (const form of ["--qa", "--e2e"]) {
    await withGitRepo(async (repo) => {
      await seed(repo);
      write(repo.dir, `${RUN_DIR}/qa.md`, "the acceptance document\n");
      write(repo.dir, ".temp/viber/e2e/launch.log", "the log the run redirected\n");
      write(repo.dir, "src/a.ts", "a coder left this behind\n");

      const result = await run(repo.dir, repo.env, closeArgs(form, [`${RUN_DIR}/qa.md`, ".temp/viber/e2e/launch.log"]));
      assert.equal(result.status, 0, `${form} -> stderr: ${result.stderr}`);
      assert.match(result.stderr, /refused \.temp\/viber\/e2e\/launch\.log/);

      const expected = form === "--e2e" ? [`${RUN_DIR}/qa.md`] : [`${RUN_DIR}/qa.md`, STATUS_REL];
      assert.deepEqual(await committedFiles(repo), expected.sort());
      const dirty = (await repo.git("status", "--short")).stdout;
      assert.match(dirty, /\?\? \.temp\//);
      assert.match(dirty, /\?\? src\//);
    });
  }
});

test("--qa and --e2e with nothing changed exit 4, and with no file at all exit 2", async () => {
  for (const form of ["--qa", "--e2e"]) {
    await withGitRepo(async (repo) => {
      await seed(repo);
      write(repo.dir, `${RUN_DIR}/qa.md`, "already committed\n");
      await repo.git("add", "-A");
      await repo.git("commit", "-m", "already recorded");

      const unchanged = await run(repo.dir, repo.env, closeArgs(form, [`${RUN_DIR}/qa.md`]));
      assert.equal(unchanged.status, 4, `${form} -> stderr: ${unchanged.stderr}`);
      assert.match(unchanged.stderr, /no changes to commit/);

      const noFiles = await run(repo.dir, repo.env, closeArgs(form, []));
      assert.equal(noFiles.status, 2);
      assert.match(noFiles.stderr, /usage: commit-task\.sh/);
    });
  }
});

// --- --review: the one commit that lands the final review's fix -------------

test("--review commits the named files under 'fix(viber): final review', with a Refs footer naming the plan, and records final-review on status.md's closed line", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "the final review's fix\n");

    const result = await run(repo.dir, repo.env, ["--review", PLAN_REL, "src/a.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^committed: [0-9a-f]{7,}\nsubject: fix\(viber\): final review\n$/);
    assert.equal((await subjects(repo))[0], "fix(viber): final review");
    assert.match((await repo.git("log", "-1", "--format=%b")).stdout, new RegExp(`Refs: ${PLAN_REL} final review`));
    assert.deepEqual(await committedFiles(repo), ["src/a.ts", STATUS_REL].sort());
    assert.match(readStatus(repo), /^closed: final-review$/m);
  });
});

test("--review carries every 'work/final-review-*.md' report (slice reviews and rechecks) and every 'work/final-fix-coder-*.md' fix-round notes file present in the run directory, and no other task's own trail", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "the fix\n");
    write(repo.dir, `${RUN_DIR}/work/final-review-1.md`, "reviewer A's findings\n");
    write(repo.dir, `${RUN_DIR}/work/final-review-2.md`, "reviewer B's findings\n");
    write(repo.dir, `${RUN_DIR}/work/final-review-recheck-1.md`, "recheck of fix round 1\n");
    write(repo.dir, `${RUN_DIR}/work/final-fix-coder-1.md`, "what fix round 1 changed\n");
    write(repo.dir, `${RUN_DIR}/work/final-fix-coder-2.md`, "what fix round 2 changed\n");
    write(repo.dir, `${RUN_DIR}/work/T1-coder.md`, "an ordinary task's own notes, not this trail\n");

    const result = await run(repo.dir, repo.env, ["--review", PLAN_REL, "src/a.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(
      await committedFiles(repo),
      [
        "src/a.ts",
        STATUS_REL,
        `${RUN_DIR}/work/final-review-1.md`,
        `${RUN_DIR}/work/final-review-2.md`,
        `${RUN_DIR}/work/final-review-recheck-1.md`,
        `${RUN_DIR}/work/final-fix-coder-1.md`,
        `${RUN_DIR}/work/final-fix-coder-2.md`,
      ].sort(),
    );
  });
});

test("--review with named files producing no change exits 4, nothing committed and status.md unchanged", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "already committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "already recorded");
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, ["--review", PLAN_REL, "src/a.ts"]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /no changes to commit/);
    assert.equal(readStatus(repo), before);
    assert.deepEqual(await subjects(repo), ["already recorded", "seed"]);
  });
});

test("--review against a missing plan exits 2, and calling it with no file at all names --review in the usage error", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");

    const noPlan = await run(repo.dir, repo.env, ["--review", "docs/_specs/nope/plan.md", "src/a.ts"]);
    assert.equal(noPlan.status, 2);
    assert.match(noPlan.stderr, /plan file not found/);

    const noFiles = await run(repo.dir, repo.env, ["--review", PLAN_REL]);
    assert.equal(noFiles.status, 2);
    assert.match(noFiles.stderr, /--review <plan-file> <file> \[<file>\.\.\.\]/);
  });
});

test("--review leaves the progress counter unchanged", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    write(repo.dir, "src/b.ts", "the final review's fix\n");

    const result = await run(repo.dir, repo.env, ["--review", PLAN_REL, "src/b.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(readStatus(repo), /^progress: 1\/2$/m);
    assert.doesNotMatch(result.stdout, /progress:/);
  });
});

test("--review commits an exec bit staged with 'git update-index --chmod=+x' under core.fileMode=false, beside a content fix, and leaves nothing staged (a pathspec commit took the mode from HEAD and left it staged)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await repo.git("config", "core.fileMode", "false");
    write(repo.dir, "scripts/run.sh", "echo run\n");
    await repo.git("add", "--", "scripts/run.sh");
    await repo.git("commit", "-m", "script at 100644");
    await repo.git("update-index", "--chmod=+x", "--", "scripts/run.sh");
    write(repo.dir, "src/a.ts", "the final review's fix\n");

    const result = await run(repo.dir, repo.env, ["--review", PLAN_REL, "src/a.ts", "scripts/run.sh"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(await headMode(repo, "scripts/run.sh"), "100755");
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "scripts/run.sh", "src/a.ts"].sort());
    assert.deepEqual(await stagedFiles(repo), []);
  });
});

test("--review naming only a path whose staged change is its mode commits it, instead of failing as 'nothing to commit'", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await repo.git("config", "core.fileMode", "false");
    write(repo.dir, "scripts/run.sh", "echo run\n");
    await repo.git("add", "--", "scripts/run.sh");
    await repo.git("commit", "-m", "script at 100644");
    await repo.git("update-index", "--chmod=+x", "--", "scripts/run.sh");

    const result = await run(repo.dir, repo.env, ["--review", PLAN_REL, "scripts/run.sh"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(await headMode(repo, "scripts/run.sh"), "100755");
    assert.deepEqual(await stagedFiles(repo), []);
  });
});

/** Every commit form that takes a caller's path, as the argv after the script,
 *  each naming the one script whose exec bit the index holds. */
const MODE_FORMS: Array<[form: string, args: string[]]> = [
  ["a task commit", [PLAN_REL, "T1"]],
  ["a fix-number repair", [PLAN_REL, "T1", "2", "scripts/run.sh"]],
  ["--repair", ["--repair", PLAN_REL, "1", "scripts/run.sh"]],
  ["--review", ["--review", PLAN_REL, "scripts/run.sh"]],
  ["--chore", ["--chore", PLAN_REL, "scripts/run.sh"]],
  ["--qa", ["--qa", PLAN_REL, "scripts/run.sh"]],
  ["--outside", ["--outside", PLAN_REL, "scripts/run.sh"]],
];

/** Stages scripts/run.sh at 100755 in the index while the file on disk stays
 *  0644: a new script added that way, or a committed 100644 one whose only
 *  staged change is its mode - what a coder's "git update-index --chmod=+x"
 *  leaves behind. */
async function stageExecBit(repo: GitRepo, fileMode: boolean, committed: boolean): Promise<void> {
  await seed(repo, [["T1", "scripts/run.sh"]]);
  await repo.git("config", "core.fileMode", String(fileMode));
  write(repo.dir, "scripts/run.sh", "echo run\n");
  fs.chmodSync(path.join(repo.dir, "scripts/run.sh"), 0o644);
  if (committed) {
    await repo.git("add", "--", "scripts/run.sh");
    await repo.git("commit", "-m", "script at 100644");
    await repo.git("update-index", "--chmod=+x", "--", "scripts/run.sh");
  } else {
    await repo.git("update-index", "--add", "--chmod=+x", "--", "scripts/run.sh");
  }
}

for (const [form, args] of MODE_FORMS) {
  for (const committed of [false, true]) {
    const what = committed ? "a mode-only change of a committed script" : "a new script";
    test(
      `${form} under core.fileMode=true keeps the 100755 the index holds for ${what} whose file on disk is 0644, and leaves the tree clean (git add -u read the mode back from the tree and the commit was refused as empty)`,
      { skip: process.platform === "win32" ? "core.fileMode=true does not occur on a Windows checkout" : false },
      async () => {
        await withGitRepo(async (repo) => {
          await stageExecBit(repo, true, committed);

          const result = await run(repo.dir, repo.env, args);
          assert.equal(result.status, 0, `stderr: ${result.stderr}`);
          assert.equal(await headMode(repo, "scripts/run.sh"), "100755");
          assert.deepEqual(await stagedFiles(repo), []);
          assert.equal((await repo.git("status", "--porcelain", "--", "scripts/run.sh")).stdout, "");
        });
      },
    );
  }
  test(`${form} under core.fileMode=false keeps the 100755 the index holds for a new script`, async () => {
    await withGitRepo(async (repo) => {
      await stageExecBit(repo, false, false);

      const result = await run(repo.dir, repo.env, args);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(await headMode(repo, "scripts/run.sh"), "100755");
      assert.deepEqual(await stagedFiles(repo), []);
    });
  });
}

// --- the run's own state: the two decisions and the trail -------------------

test("a task commit carries its own trail and no other task's, so the notes travel with the code they describe", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "the work\n");
    write(repo.dir, `${RUN_DIR}/work/T1-coder.md`, "what the diff does not say\n");
    write(repo.dir, `${RUN_DIR}/work/review-T1-1.md`, "round 1 findings\n");
    write(repo.dir, `${RUN_DIR}/work/T2-coder.md`, "another coder, still working\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(
      await committedFiles(repo),
      ["src/a.ts", STATUS_REL, `${RUN_DIR}/work/T1-coder.md`, `${RUN_DIR}/work/review-T1-1.md`].sort(),
    );
    // the run's own directory is not part of any task's map, so it is never
    // reported as an unclaimed change either
    assert.doesNotMatch(result.stderr, /claimed by no task/);
  });
});

test("a post-test fix carries its round's trail, not the task's", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "the work\n");
    await run(repo.dir, repo.env, [PLAN_REL, "T1"]);

    write(repo.dir, "src/a.ts", "the repair\n");
    write(repo.dir, `${RUN_DIR}/work/tests-2.md`, "the failing run\n");
    write(repo.dir, `${RUN_DIR}/work/repair-2-coder.md`, "what the repair changed\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "2", "src/a.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(
      await committedFiles(repo),
      ["src/a.ts", `${RUN_DIR}/work/tests-2.md`, `${RUN_DIR}/work/repair-2-coder.md`].sort(),
    );
    assert.match(result.stdout, /^progress: unchanged$/m);
  });
});

test("--unreviewed records the waived review gate in the same commit that marks the task done", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "accepted as it stands\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--unreviewed"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^progress: 1\/2$/m);

    const status = readStatus(repo);
    assert.match(status, /^done: T1$/m);
    assert.match(status, /^unreviewed: T1$/m);
    // the entry is written before the commit, so it rides in that same one
    assert.deepEqual(await committedFiles(repo), ["src/a.ts", STATUS_REL].sort());
    assert.match((await repo.git("show", "HEAD:" + STATUS_REL)).stdout, /^unreviewed: T1$/m);
  });
});

test("--skip records a dropped task without a commit, because it has none to ride in", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);

    const result = await run(repo.dir, repo.env, ["--skip", PLAN_REL, "T2"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^skipped: T2$/m);
    assert.match(result.stdout, /^progress: unchanged$/m);

    const status = readStatus(repo);
    assert.match(status, /^skipped: T2$/m);
    assert.match(status, /^done: none$/m);
    assert.match(status, /^progress: 0\/2$/m);
    assert.deepEqual(await subjects(repo), ["seed"]);
    // it waits in status.md for whichever commit comes next
    assert.deepEqual(await stagedFiles(repo), []);
    assert.match((await repo.git("status", "--short")).stdout, new RegExp(`M {1,2}${STATUS_REL}`));
  });
});

test("--skip twice does not duplicate the id, and an unknown id exits 3 without touching the state", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await run(repo.dir, repo.env, ["--skip", PLAN_REL, "T2"]);
    await run(repo.dir, repo.env, ["--skip", PLAN_REL, "T2"]);
    assert.match(readStatus(repo), /^skipped: T2$/m);

    const before = readStatus(repo);
    const unknown = await run(repo.dir, repo.env, ["--skip", PLAN_REL, "T9"]);
    assert.equal(unknown.status, 3);
    assert.match(unknown.stderr, /no task 'T9'/);
    assert.equal(readStatus(repo), before);
  });
});

test("--skip with a contract id exits 3 (a Contracts heading is shaped like a task's, but it is not one)", async () => {
  await withGitRepo(async (repo) => {
    await seedRaw(repo, CONTRACTS_PLAN, 2);

    const result = await run(repo.dir, repo.env, ["--skip", PLAN_REL, "C3"]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /no task 'C3' in/);
  });
});

test("--skip with a regex metacharacter in the id exits 3 instead of matching a task heading as a pattern (the id is compared as a fixed string)", async () => {
  // "T." would match task heading "### T1 - ..." as a regex (any char after
  // "T"), so this exiting 3 proves the id is compared literally. No bare "*"
  // here: on Git-Bash the MSYS runtime expands it against the cwd before argv
  // ever reaches the script (see plan-path.test.ts).
  await withGitRepo(async (repo) => {
    await seed(repo);

    const result = await run(repo.dir, repo.env, ["--skip", PLAN_REL, "T."]);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /no task 'T\.' in/);
  });
});

test("--skip with a task already committed as done exits 2, naming it as already done", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, ["--skip", PLAN_REL, "T1"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /task 'T1' is already done - it cannot be skipped/);
    assert.equal(readStatus(repo), before);
  });
});

test("--decide appends one decision line to status.md and prints its two lines without a commit (it has none to ride in)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "keep the old parser"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "decided: T2\nprogress: unchanged\n");
    assert.equal(readStatus(repo), `${before}decision: T2: keep the old parser\n`);
    assert.deepEqual(await subjects(repo), ["seed"]);
    assert.deepEqual(await stagedFiles(repo), []);
  });
});

test("a decision line rides in the next task commit", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "keep the old parser"]);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match((await repo.git("show", `HEAD:${STATUS_REL}`)).stdout, /^decision: T2: keep the old parser$/m);
  });
});

test("a refused task commit rolls status.md back with its decision lines intact", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "keep the old parser"]);
    write(repo.dir, "src/a.ts", "work\n");
    await breakCommit(repo);

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 5);
    assert.equal(readStatus(repo), `${statusBody(2)}decision: T2: keep the old parser\n`);
  });
});

const DECIDE_REFUSALS: Array<[name: string, args: string[], code: number, stderr: RegExp]> = [
  ["an unknown task id exits 3", ["T9", "keep it"], 3, /no task 'T9'/],
  ["a task on the done list exits 2", ["T1", "keep it"], 2, /task 'T1' is already done/],
  ["a task on the skipped list exits 2", ["T2", "keep it"], 2, /task 'T2' is skipped/],
  ["an empty text exits 2", ["T3", ""], 2, /one non-empty line/],
  ["a whitespace-only text exits 2", ["T3", "   "], 2, /one non-empty line/],
  ["a multi-line text exits 2", ["T3", "first\nsecond"], 2, /one non-empty line/],
  ["a text carrying a carriage return exits 2", ["T3", "first\rsecond"], 2, /one non-empty line/],
  ["a missing text exits 2", ["T3"], 2, /usage: commit-task\.sh/],
];

for (const [name, args, code, stderr] of DECIDE_REFUSALS) {
  test(`--decide refuses ${name} and leaves status.md byte-for-byte unchanged`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo, [
        ["T1", "src/a.ts"],
        ["T2", "src/b.ts"],
        ["T3", "src/c.ts"],
      ]);
      write(repo.dir, STATUS_REL, "# status\n\nprogress: 1/3\ndone: T1\nskipped: T2\nunreviewed: none\ndeferred: none\nclosed: none\n");
      const before = readStatus(repo);

      const result = await run(repo.dir, repo.env, ["--decide", PLAN_REL, ...args]);
      assert.equal(result.status, code, `stderr: ${result.stderr}`);
      assert.match(result.stderr, stderr);
      assert.equal(result.stdout, "");
      assert.equal(readStatus(repo), before);
    });
  });
}

test("--decide against a missing plan exits 2", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, ["--decide", `${RUN_DIR}/nope.md`, "T1", "keep it"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /plan file not found/);
    assert.equal(readStatus(repo), before);
  });
});

test("--decide with the same task id and text twice leaves one line", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "keep the old parser"]);

    const result = await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "keep the old parser"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(readStatus(repo).match(/^decision: /gm)?.length, 1);
  });
});

test("--decide stores a text holding a colon intact", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);

    await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "scope: src/b.ts only, note: no retry"]);
    assert.match(readStatus(repo), /^decision: T2: scope: src\/b\.ts only, note: no retry$/m);
  });
});

test("--decide on a run with no status file creates it holding the decision line", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    fs.rmSync(path.join(repo.dir, STATUS_REL));

    const result = await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T1", "keep it"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(readStatus(repo), `${statusBody(2)}decision: T1: keep it\n`);
  });
});

test("--decide on a status file with no final newline starts its line on a line of its own", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, STATUS_REL, statusBody(2).trimEnd());

    await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T1", "keep it"]);
    assert.equal(readStatus(repo), `${statusBody(2)}decision: T1: keep it\n`);
  });
});

// --- --rule: the run's ruling register, rulings.md beside the plan ---------

const RULINGS_REL = `${RUN_DIR}/rulings.md`;

function readRulings(repo: GitRepo): string {
  return fs.readFileSync(path.join(repo.dir, RULINGS_REL), "utf-8");
}

const RULE_ARGS = ["keep the old parser", "the new one breaks CRLF input", "one more parser task"];
const RULE_LINE = "keep the old parser | why: the new one breaks CRLF input | cost if wrong: one more parser task";

for (const subject of ["T2", "baseline", "tests", "final-review", "commit"]) {
  test(`--rule with the subject '${subject}' creates rulings.md beside the plan holding its heading and one entry, prints its two lines and commits nothing`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);

      const result = await run(repo.dir, repo.env, ["--rule", PLAN_REL, subject, ...RULE_ARGS]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `ruled: ${subject}\nprogress: unchanged\n`);
      assert.equal(readRulings(repo), `# Rulings\n\n- ${subject}: ${RULE_LINE}\n`);
      assert.deepEqual(await subjects(repo), ["seed"]);
      assert.deepEqual(await stagedFiles(repo), []);
    });
  });
}

test("--rule appends a second, different ruling under the first, keeping the heading once", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await run(repo.dir, repo.env, ["--rule", PLAN_REL, "T2", ...RULE_ARGS]);

    const result = await run(repo.dir, repo.env, ["--rule", PLAN_REL, "tests", "rerun once", "a flaky timer", "a red run hidden"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      readRulings(repo),
      `# Rulings\n\n- T2: ${RULE_LINE}\n- tests: rerun once | why: a flaky timer | cost if wrong: a red run hidden\n`,
    );
  });
});

test("--rule recording the same entry twice leaves one line", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await run(repo.dir, repo.env, ["--rule", PLAN_REL, "T2", ...RULE_ARGS]);

    const result = await run(repo.dir, repo.env, ["--rule", PLAN_REL, "T2", ...RULE_ARGS]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(readRulings(repo), `# Rulings\n\n- T2: ${RULE_LINE}\n`);
  });
});

const RULE_REFUSALS: Array<[name: string, args: string[], code: number, stderr: RegExp]> = [
  ["an empty ruling exits 2", [PLAN_REL, "T1", "", "why", "cost"], 2, /one non-empty line/],
  ["a whitespace-only why exits 2", [PLAN_REL, "T1", "rule", "   ", "cost"], 2, /one non-empty line/],
  ["a multi-line cost exits 2", [PLAN_REL, "T1", "rule", "why", "first\nsecond"], 2, /one non-empty line/],
  ["a ruling carrying a carriage return exits 2", [PLAN_REL, "T1", "first\rsecond", "why", "cost"], 2, /one non-empty line/],
  ["an unknown fixed subject exits 2", [PLAN_REL, "baselines", "rule", "why", "cost"], 2, /unknown subject 'baselines'/],
  ["a task id the plan does not hold exits 3", [PLAN_REL, "T9", "rule", "why", "cost"], 3, /no task 'T9'/],
  ["a missing field exits 2", [PLAN_REL, "T1", "rule", "why"], 2, /usage: commit-task\.sh/],
  ["an empty subject exits 2", [PLAN_REL, "", "rule", "why", "cost"], 2, /usage: commit-task\.sh/],
  ["a missing plan exits 2", [`${RUN_DIR}/nope.md`, "T1", "rule", "why", "cost"], 2, /plan file not found/],
];

for (const [name, args, code, stderr] of RULE_REFUSALS) {
  test(`--rule refuses ${name} and leaves rulings.md byte-for-byte unchanged`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);
      write(repo.dir, RULINGS_REL, `# Rulings\n\n- T2: ${RULE_LINE}\n`);
      const before = readRulings(repo);

      const result = await run(repo.dir, repo.env, ["--rule", ...args]);
      assert.equal(result.status, code, `stderr: ${result.stderr}`);
      assert.match(result.stderr, stderr);
      assert.equal(result.stdout, "");
      assert.equal(readRulings(repo), before);
    });
  });
}

test("a refused --rule on a run with no register creates none (a run that records no ruling has no rulings.md)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);

    const result = await run(repo.dir, repo.env, ["--rule", PLAN_REL, "T1", "", "why", "cost"]);
    assert.equal(result.status, 2);
    assert.ok(!fs.existsSync(path.join(repo.dir, RULINGS_REL)));
  });
});

test("a task commit made after a --rule call carries rulings.md in that commit", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await run(repo.dir, repo.env, ["--rule", PLAN_REL, "T2", ...RULE_ARGS]);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [RULINGS_REL, STATUS_REL, "src/a.ts"].sort());
    assert.equal((await repo.git("show", `HEAD:${RULINGS_REL}`)).stdout, `# Rulings\n\n- T2: ${RULE_LINE}\n`);
  });
});

/** Each commit form taking a plan, arranged so its call commits: the files it
 *  needs are written (and, for --landed, committed) and its argv returned. */
const RULE_CARRIERS: Array<[form: string, arrange: (repo: GitRepo) => string[] | Promise<string[]>]> = [
  ["--review", (repo) => (write(repo.dir, "src/a.ts", "fix\n"), ["--review", PLAN_REL, "src/a.ts"])],
  ["--chore", (repo) => (write(repo.dir, "CLAUDE.md", "memory\n"), ["--chore", PLAN_REL, "CLAUDE.md"])],
  ["--qa", (repo) => (write(repo.dir, `${RUN_DIR}/qa.md`, "qa\n"), ["--qa", PLAN_REL, `${RUN_DIR}/qa.md`])],
  ["--repair", (repo) => (write(repo.dir, "src/z.ts", "fix\n"), ["--repair", PLAN_REL, "1", "src/z.ts"])],
  ["fix-number", (repo) => (write(repo.dir, "src/a.ts", "fix\n"), [PLAN_REL, "T1", "2", "src/a.ts"])],
  ["--outside", (repo) => (write(repo.dir, "src/legacy.ts", "hand edit\n"), ["--outside", PLAN_REL, "src/legacy.ts"])],
  ["--extension", (repo) => (write(repo.dir, "docs/help/a.md", "help\n"), ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md"])],
  [
    "--landed",
    async (repo) => {
      write(repo.dir, "src/a.ts", "landed elsewhere\n");
      await repo.git("add", "src/a.ts");
      await repo.git("commit", "-m", "manual");
      return [PLAN_REL, "T1", "--landed", (await repo.git("rev-parse", "HEAD")).stdout.trim()];
    },
  ],
];

for (const [form, arrange] of RULE_CARRIERS) {
  test(`a ${form} commit made after a --rule call carries rulings.md`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);
      const args = await arrange(repo);
      await run(repo.dir, repo.env, ["--rule", PLAN_REL, "final-review", ...RULE_ARGS]);

      const result = await run(repo.dir, repo.env, args);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.ok((await committedFiles(repo)).includes(RULINGS_REL), `committed: ${(await committedFiles(repo)).join(", ")}`);
      assert.equal((await repo.git("show", `HEAD:${RULINGS_REL}`)).stdout, `# Rulings\n\n- final-review: ${RULE_LINE}\n`);
    });
  });
}

test("--defer naming a contract id is refused with a warning, like an id no task owns", async () => {
  await withGitRepo(async (repo) => {
    await seedRaw(repo, CONTRACTS_PLAN, 2);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--defer", "C3:src/a.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused C3:src\/a\.ts - no task C3 in the plan/);
    assert.doesNotMatch(readStatus(repo), /deferred: C3/);
  });
});

test("a plan mentioning the TASK marker in prose keeps its real task total (only a marker standing alone on its line opens or closes a block)", async () => {
  await withGitRepo(async (repo) => {
    const plan = [
      "# Plan - feat x",
      "",
      "## Tasks",
      "",
      "Note: every task is bounded by an `<!-- TASK -->` marker on its own line.",
      "",
      "<!-- TASK -->",
      "### T1 - task T1",
      "- Files: src/a.ts",
      "<!-- /TASK -->",
      "",
      "<!-- TASK -->",
      "### T2 - task T2",
      "- Files: src/b.ts",
      "<!-- /TASK -->",
      "",
    ].join("\n");
    await seedRaw(repo, plan, 2);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /progress: 1\/2\n$/);
  });
});

test("committing T1 does not stage a report shaped like a different task's own (review-T1-b-1.md is not T1's review-T1-<n>.md)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, `${RUN_DIR}/work/T1-coder.md`, "notes\n");
    write(repo.dir, `${RUN_DIR}/work/review-T1-1.md`, "T1's own round 1\n");
    write(repo.dir, `${RUN_DIR}/work/review-T1-b-1.md`, "a different task's report\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(
      await committedFiles(repo),
      ["src/a.ts", STATUS_REL, `${RUN_DIR}/work/T1-coder.md`, `${RUN_DIR}/work/review-T1-1.md`].sort(),
    );
    assert.deepEqual(await stagedFiles(repo), []);
    assert.ok(fs.existsSync(path.join(repo.dir, `${RUN_DIR}/work/review-T1-b-1.md`)));
  });
});

test("a plan Files entry with a leading './' stages the normalized path and is recognized by claimant lookups the same as the unprefixed form", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", "./src/a.ts"], ["T2", "src/b.ts"]]);
    write(repo.dir, "src/b.ts", "T2 work\n");
    write(repo.dir, "src/a.ts", "T1's own file, not yet committed - still open\n");

    // T2 tries to pull T1's file in through --with while T1 is still open: the
    // claimant lookup must recognize "src/a.ts" as T1's "./src/a.ts" entry and
    // refuse it, the same as if the plan had spelled it without the "./".
    const blocked = await run(repo.dir, repo.env, [PLAN_REL, "T2", "--with", "src/a.ts"]);
    assert.equal(blocked.status, 0, `stderr: ${blocked.stderr}`);
    assert.match(blocked.stderr, /refused src\/a\.ts - claimed by task T1/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/b.ts"].sort());

    // once T1 lands, its own commit stages the normalized path, not the literal "./" one
    write(repo.dir, "src/a.ts", "T1 work\n");
    const landed = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(landed.status, 0, `stderr: ${landed.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
    assert.doesNotMatch(landed.stderr, /claimed by no task/);
  });
});

test("a '--with' path with a leading './' before '.temp' is refused like its normalized form (the leading './' is not a bypass)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, ".temp/x", "noise\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", "./.temp/x"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused \.temp\/x - \.temp is machine state, never committed/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("--chore and --qa record which half of the close is done, so a resumed run does not repeat it", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "CLAUDE.md", "memory\n");
    write(repo.dir, `${RUN_DIR}/qa.md`, "the acceptance document\n");

    await run(repo.dir, repo.env, ["--chore", PLAN_REL, "CLAUDE.md"]);
    assert.match(readStatus(repo), /^closed: memory$/m);

    await run(repo.dir, repo.env, ["--qa", PLAN_REL, `${RUN_DIR}/qa.md`]);
    assert.match(readStatus(repo), /^closed: memory qa$/m);
    assert.match((await repo.git("log", "--format=%b", "-1")).stdout, new RegExp(`Refs: ${PLAN_REL} close`));
  });
});

test("a refused close commit rolls the closed entry back, so the run never claims a close the history does not show", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    const before = readStatus(repo);
    write(repo.dir, "CLAUDE.md", "memory\n");
    await breakCommit(repo);

    const result = await run(repo.dir, repo.env, ["--chore", PLAN_REL, "CLAUDE.md"]);
    assert.equal(result.status, 5);
    assert.match(result.stderr, /status rolled back, the close is NOT recorded/);
    assert.equal(readStatus(repo), before);
    assert.deepEqual(await subjects(repo), ["seed"]);
    assert.deepEqual(planDirEntries(repo), ["plan.md", "status.md"]);

    await fixCommit(repo);
  });
});

test("a fix number refuses a '.temp' path even with a leading './' (the leading './' is not a bypass)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    write(repo.dir, "src/a.ts", "repair\n");
    write(repo.dir, ".temp/x", "noise\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "2", "src/a.ts", "./.temp/x"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused \.temp\/x - \.temp is machine state, never committed/);
    assert.deepEqual(await committedFiles(repo), ["src/a.ts"]);
  });
});

// --- a run tied to an issue: every commit that takes the plan links it -------

const ISSUE_URL = "https://github.com/acme/widgets/issues/42";

/** The run's plan behind a frontmatter, as planner writes it for a run tied to an issue. */
async function seedWithFrontmatter(repo: GitRepo, lines: string[]): Promise<void> {
  await seedRaw(repo, ["---", ...lines, "---", "", planBody(TWO_TASKS)].join("\n"), TWO_TASKS.length);
}

/** The commit body's last paragraph, which is where git reads trailers from. */
async function lastParagraph(repo: GitRepo): Promise<string> {
  const paragraphs = (await repo.git("log", "-1", "--format=%b")).stdout.trim().split(/\n\s*\n/);
  return paragraphs[paragraphs.length - 1];
}

test("a plan whose frontmatter names an issue adds Refs: #<N> under the run's own Refs line in every form that takes the plan", async () => {
  const forms: Array<[name: string, act: (repo: GitRepo) => void | Promise<void>, runRefs: string]> = [
    ["task", async (repo) => {
      write(repo.dir, "src/a.ts", "work\n");
      await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    }, `Refs: ${PLAN_REL} task T1`],
    ["fix", async (repo) => {
      write(repo.dir, "src/a.ts", "work\n");
      await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
      write(repo.dir, "src/a.ts", "repair\n");
      await run(repo.dir, repo.env, [PLAN_REL, "T1", "2", "src/a.ts"]);
    }, `Refs: ${PLAN_REL} task T1 fix 2`],
    ["--repair", async (repo) => {
      write(repo.dir, "src/legacy.ts", "regression\n");
      await run(repo.dir, repo.env, ["--repair", PLAN_REL, "2", "src/legacy.ts"]);
    }, `Refs: ${PLAN_REL} post-test fix 2`],
    ["--chore", async (repo) => {
      write(repo.dir, "CLAUDE.md", "memory\n");
      await run(repo.dir, repo.env, ["--chore", PLAN_REL, "CLAUDE.md"]);
    }, `Refs: ${PLAN_REL} close`],
    ["--qa", async (repo) => {
      write(repo.dir, `${RUN_DIR}/qa.md`, "the acceptance document\n");
      await run(repo.dir, repo.env, ["--qa", PLAN_REL, `${RUN_DIR}/qa.md`]);
    }, `Refs: ${PLAN_REL} close`],
    ["--review", async (repo) => {
      write(repo.dir, "src/a.ts", "work\n");
      await run(repo.dir, repo.env, ["--review", PLAN_REL, "src/a.ts"]);
    }, `Refs: ${PLAN_REL} final review`],
  ];
  for (const [name, act, runRefs] of forms) {
    await withGitRepo(async (repo) => {
      await seedWithFrontmatter(repo, [`source: /home/u/plans/feat-x.md`, `issue: ${ISSUE_URL}`]);
      await act(repo);
      assert.notEqual((await subjects(repo))[0], "seed", `${name} committed nothing`);
      assert.equal(await lastParagraph(repo), `${runRefs}\nRefs: #42`, name);
    });
  }
});

test("--landed also links the issue, after the landed sha", async () => {
  await withGitRepo(async (repo) => {
    await seedWithFrontmatter(repo, [`issue: ${ISSUE_URL}`]);
    write(repo.dir, "src/a.ts", "work\n");
    await repo.git("add", "src/a.ts");
    await repo.git("commit", "-m", "landed elsewhere");
    const sha = (await repo.git("rev-parse", "HEAD")).stdout.trim();

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--landed", sha]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(await lastParagraph(repo), `Refs: ${PLAN_REL} task T1 landed ${sha}\nRefs: #42`);
  });
});

test("no issue link is added for a plan without the key, a URL that is no issue, or an issue: line outside the frontmatter (a wrong #N would link an unrelated issue)", async () => {
  const plans: Array<[name: string, text: string]> = [
    ["no key", ["---", "source: /home/u/plans/feat-x.md", "---", "", planBody(TWO_TASKS)].join("\n")],
    ["pull request URL", ["---", "issue: https://github.com/acme/widgets/pull/42", "---", "", planBody(TWO_TASKS)].join("\n")],
    ["no frontmatter", [`issue: ${ISSUE_URL}`, "", planBody(TWO_TASKS)].join("\n")],
    ["unclosed frontmatter", ["---", `issue: ${ISSUE_URL}`, "", planBody(TWO_TASKS)].join("\n")],
  ];
  for (const [name, text] of plans) {
    await withGitRepo(async (repo) => {
      await seedRaw(repo, text, TWO_TASKS.length);
      write(repo.dir, "src/a.ts", "work\n");
      const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
      assert.equal(result.status, 0, `${name} -> stderr: ${result.stderr}`);
      assert.equal(await lastParagraph(repo), `Refs: ${PLAN_REL} task T1`, name);
    });
  }
});

test("a CRLF plan still yields the issue link (the key is matched with its carriage return cut)", async () => {
  await withGitRepo(async (repo) => {
    const text = ["---", `issue: ${ISSUE_URL}`, "---", "", planBody(TWO_TASKS)].join("\n").replace(/\n/g, "\r\n");
    await seedRaw(repo, text, TWO_TASKS.length);
    write(repo.dir, "CLAUDE.md", "memory\n");
    const result = await run(repo.dir, repo.env, ["--chore", PLAN_REL, "CLAUDE.md"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(await lastParagraph(repo), `Refs: ${PLAN_REL} close\nRefs: #42`);
  });
});

test("--repair refuses a '.temp' path even with a leading './' (the leading './' is not a bypass)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/legacy.ts", "the regression the suite caught\n");
    write(repo.dir, ".temp/x", "noise\n");

    const result = await run(repo.dir, repo.env, ["--repair", PLAN_REL, "2", "src/legacy.ts", "./.temp/x"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused \.temp\/x - \.temp is machine state, never committed/);
    assert.deepEqual(await committedFiles(repo), ["src/legacy.ts"]);
  });
});

// --- --outside: changes made beside the plan, committed on their own ---------

test("--outside commits exactly the named paths in one commit of their own under a derived subject, footed by the run's outside-the-plan Refs line and the issue link", async () => {
  await withGitRepo(async (repo) => {
    await seedWithFrontmatter(repo, [`issue: ${ISSUE_URL}`]);
    write(repo.dir, "src/legacy.ts", "a hand edit\n");
    write(repo.dir, "docs/notes.md", "a note\n");
    write(repo.dir, "src/unnamed.ts", "changed, but never named\n");

    const result = await run(repo.dir, repo.env, ["--outside", PLAN_REL, "src/legacy.ts", "docs/notes.md"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^committed: [0-9a-f]{7,}\nsubject: chore\(viber\): commit changes made outside the plan\n$/);
    assert.deepEqual(await subjects(repo), [OUTSIDE_SUBJECT, "seed"]);
    assert.deepEqual(await committedFiles(repo), ["docs/notes.md", "src/legacy.ts"]);
    assert.equal(await lastParagraph(repo), `Refs: ${PLAN_REL} outside the plan\nRefs: #42`);
  });
});

test("--outside given the plan as an absolute path inside the repository commits and foots exactly as the relative form (closeout's call once absolutized it)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/legacy.ts", "a hand edit\n");
    write(repo.dir, `${RUN_DIR}/spec.md`, "edited by closeout\n");

    const result = await run(repo.dir, repo.env, ["--outside", path.join(repo.dir, PLAN_REL), "src/legacy.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), ["src/legacy.ts"]);
    assert.equal(await lastParagraph(repo), `Refs: ${PLAN_REL} outside the plan`);
    assert.doesNotMatch(result.stderr, /spec\.md/, "the run directory is never unclaimed");
  });
});

test("--outside leaves a path staged beside the call staged and out of its commit", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/b.ts", "staged by someone else\n");
    await repo.git("add", "src/b.ts");
    write(repo.dir, "src/legacy.ts", "a hand edit\n");

    const result = await run(repo.dir, repo.env, ["--outside", PLAN_REL, "src/legacy.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), ["src/legacy.ts"]);
    assert.deepEqual(await stagedFiles(repo), ["src/b.ts"]);
  });
});

test("--outside refuses a .temp path with a warning and commits the other named paths", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/legacy.ts", "a hand edit\n");
    write(repo.dir, ".temp/viber/run/log.txt", "machine state\n");

    const result = await run(repo.dir, repo.env, ["--outside", PLAN_REL, "src/legacy.ts", ".temp/viber/run/log.txt"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused \.temp\/viber\/run\/log\.txt - \.temp is machine state, never committed/);
    assert.deepEqual(await committedFiles(repo), ["src/legacy.ts"]);
  });
});

test("--outside with named paths producing no change exits 4 and commits nothing", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/legacy.ts", "already committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "already recorded");

    const result = await run(repo.dir, repo.env, ["--outside", PLAN_REL, "src/legacy.ts"]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /no changes to commit/);
    assert.deepEqual(await subjects(repo), ["already recorded", "seed"]);
  });
});

// --- --extension: the files of a host project's own closing agent -------------

const EXTENSION_SUBJECT = "chore(viber): extension user-help-writer";

test("--extension commits only the named file under a subject derived from the extension's name, leaving a changed file it was not given out", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "docs/help/a.md", "help\n");
    write(repo.dir, "docs/help/b.md", "changed, but never named\n");

    const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal((await subjects(repo))[0], EXTENSION_SUBJECT);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "docs/help/a.md"].sort());
  });
});

test("--extension closes its message on the run's close Refs line, and adds the issue link when the plan names an issue", async () => {
  await withGitRepo(async (repo) => {
    await seedWithFrontmatter(repo, [`issue: ${ISSUE_URL}`]);
    write(repo.dir, "docs/help/a.md", "help\n");

    const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(await lastParagraph(repo), `Refs: ${PLAN_REL} close\nRefs: #42`);
  });
});

test("--extension on a plan with no issue closes its message on the close Refs line alone", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "docs/help/a.md", "help\n");

    const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(await lastParagraph(repo), `Refs: ${PLAN_REL} close`);
  });
});

test("--extension records the extension on status.md's closed line, in the commit itself", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "docs/help/a.md", "help\n");

    const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match((await repo.git("show", `HEAD:${STATUS_REL}`)).stdout, /^closed: extension:user-help-writer$/m);
  });
});

test("--extension called twice for one extension keeps one entry on the closed line", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "docs/help/a.md", "help\n");
    await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md"]);
    write(repo.dir, "docs/help/a.md", "help, revised\n");

    const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(readStatus(repo), /^closed: extension:user-help-writer$/m);
  });
});

test("--extension adds its entry beside the entries the close already holds", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "CLAUDE.md", "memory\n");
    await run(repo.dir, repo.env, ["--chore", PLAN_REL, "CLAUDE.md"]);
    write(repo.dir, "docs/help/a.md", "help\n");

    const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(readStatus(repo), /^closed: memory extension:user-help-writer$/m);
  });
});

test("--extension prints exactly the committed and subject lines", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "docs/help/a.md", "help\n");

    const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^committed: [0-9a-f]{7,}\nsubject: chore\(viber\): extension user-help-writer\n$/);
  });
});

test("--extension refuses a .temp path with the existing warning and commits the other named paths", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "docs/help/a.md", "help\n");
    write(repo.dir, ".temp/viber/ext/log.txt", "machine state\n");

    const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md", ".temp/viber/ext/log.txt"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused \.temp\/viber\/ext\/log\.txt - \.temp is machine state, never committed/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "docs/help/a.md"].sort());
  });
});

const EXTENSION_BAD_NAMES: Array<[name: string, value: string]> = [
  ["an empty name", ""],
  ["a name holding a space", "user help"],
  ["a name holding a colon", "a:b"],
  ["a name holding a path separator", "../x"],
  ["a name opening with a dash", "-x"],
];

for (const [name, value] of EXTENSION_BAD_NAMES) {
  test(`--extension refuses ${name} with exit 2 and commits nothing`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);
      write(repo.dir, "docs/help/a.md", "help\n");
      const before = readStatus(repo);

      const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, value, "docs/help/a.md"]);
      assert.equal(result.status, 2, `stderr: ${result.stderr}`);
      assert.deepEqual(await subjects(repo), ["seed"]);
      assert.equal(readStatus(repo), before);
    });
  });
}

test("--extension with no file exits 2 and commits nothing", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "docs/help/a.md", "help\n");

    const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer"]);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("--extension with named paths producing no change exits 4, commits nothing and records no close", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "docs/help/a.md", "already committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "already recorded");
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md"]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.deepEqual(await subjects(repo), ["already recorded", "seed"]);
    assert.equal(readStatus(repo), before);
  });
});

test("a refused git commit of --extension rolls the closed entry back", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "docs/help/a.md", "help\n");
    await breakCommit(repo);
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, ["--extension", PLAN_REL, "user-help-writer", "docs/help/a.md"]);
    assert.equal(result.status, 5, `stderr: ${result.stderr}`);
    assert.equal(readStatus(repo), before);
  });
});

test("the usage text lists the --extension form", async () => {
  await withGitRepo(async (repo) => {
    const result = await run(repo.dir, repo.env, []);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--extension <plan-file> <name> <file> \[<file>\.\.\.\]/);
  });
});

/** The whole long list is tracked and clean, so what a run does next decides on
 *  the last path alone. */
async function seedTrackedMany(repo: GitRepo): Promise<void> {
  await seed(repo, [["T1", MANY_PATHS.join(", ")]]);
  writeMany(repo);
  await repo.git("add", "-A");
  await repo.git("commit", "-m", "tracked");
}

test(`a task commit of a Files list past ${CMDLINE_CAP} chars whose only change is its last path commits that path`, { timeout: LONG_LIST_TIMEOUT }, async () => {
  await withGitRepo(async (repo) => {
    await seedTrackedMany(repo);
    const last = MANY_PATHS[MANY_PATHS.length - 1];
    write(repo.dir, last, "changed\n");

    const result = await run(repo.dir, cappedGitEnv(repo), [PLAN_REL, "T1"], LONG_LIST_TIMEOUT);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [last, STATUS_REL].sort());
  });
});

test(`a task commit of a Files list past ${CMDLINE_CAP} chars with no change records the task done with status.md alone`, { timeout: LONG_LIST_TIMEOUT }, async () => {
  await withGitRepo(async (repo) => {
    await seedTrackedMany(repo);

    const result = await run(repo.dir, cappedGitEnv(repo), [PLAN_REL, "T1"], LONG_LIST_TIMEOUT);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL]);
  });
});

/*
 * Staging a task's paths runs fewer git processes than it has paths: the count grows by
 * chunk, never by path. Every git call of one run is tallied by a `git` shell function
 * in front of the real one (BASH_ENV), so the count covers the whole script.
 */
const BATCH_PATHS = Array.from({ length: 60 }, (_, i) => `src/pkg/file-${String(i).padStart(2, "0")}.ts`);

/** A `git` function that appends one line to a tally file per invocation. */
function countedGitEnv(repo: GitRepo): { env: Record<string, string>; tally: string } {
  const file = path.join(repo.dir, ".git", "git-tally.sh");
  const tally = path.join(repo.dir, ".git", "git-tally.txt");
  fs.writeFileSync(tally, "");
  fs.writeFileSync(
    file,
    ["git() {", `  echo x >> "${tally.replace(/\\/g, "/")}"`, '  command git "$@"', "}", ""].join("\n"),
  );
  return { env: { ...repo.env, BASH_ENV: file.replace(/\\/g, "/") }, tally };
}

function gitProcesses(tally: string): number {
  return fs.readFileSync(tally, "utf-8").split("\n").filter(Boolean).length;
}

test("a plain task commit of 60 new paths runs fewer git processes than it has paths and commits all 60", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", BATCH_PATHS.join(", ")]]);
    for (const p of BATCH_PATHS) write(repo.dir, p, `${p}\n`);
    const { env, tally } = countedGitEnv(repo);

    const result = await run(repo.dir, env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [...BATCH_PATHS, STATUS_REL].sort());
    assert.ok(gitProcesses(tally) < BATCH_PATHS.length, `${gitProcesses(tally)} git processes for ${BATCH_PATHS.length} paths`);
  });
});

test("a task of 60 new paths plus one path neither on disk nor known to git commits the 60 and warns about that path, still in fewer git processes than paths", async () => {
  await withGitRepo(async (repo) => {
    const files = [...BATCH_PATHS, "src/pkg/ghost.ts"];
    await seed(repo, [["T1", files.join(", ")]]);
    for (const p of BATCH_PATHS) write(repo.dir, p, `${p}\n`);
    const { env, tally } = countedGitEnv(repo);

    const result = await run(repo.dir, env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /warning: could not stage src\/pkg\/ghost\.ts/);
    assert.deepEqual(await committedFiles(repo), [...BATCH_PATHS, STATUS_REL].sort());
    assert.ok(gitProcesses(tally) < files.length, `${gitProcesses(tally)} git processes for ${files.length} paths`);
  });
});

test("a task whose Files list names a directory commits every changed file under it, in fewer git processes than files", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", "src/pkg"]]);
    for (const p of BATCH_PATHS) write(repo.dir, p, `${p}\n`);
    const { env, tally } = countedGitEnv(repo);

    const result = await run(repo.dir, env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [...BATCH_PATHS, STATUS_REL].sort());
    assert.ok(gitProcesses(tally) < BATCH_PATHS.length, `${gitProcesses(tally)} git processes for ${BATCH_PATHS.length} files`);
  });
});

// --- the task's two extras files (C4): paths taken as if passed on --with -----

const EXTRA_CODER_REL = `${RUN_DIR}/work/T1-extra.md`;
const EXTRA_REVIEW_REL = `${RUN_DIR}/work/T1-extra-review.md`;

test("a coder-file path and a reviewer-file path no task claims both land in the task's commit", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/wiring.ts", "the coder's\n");
    write(repo.dir, "src/fixture.ts", "the reviewer's\n");
    write(repo.dir, EXTRA_CODER_REL, "src/wiring.ts\n");
    write(repo.dir, EXTRA_REVIEW_REL, "src/fixture.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(
      await committedFiles(repo),
      [STATUS_REL, "src/a.ts", "src/fixture.ts", "src/wiring.ts", EXTRA_CODER_REL, EXTRA_REVIEW_REL].sort(),
    );
  });
});

test("an extras path an unfinished task claims is refused with its owner named and the rest commits", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/b.ts", "another task's file\n");
    write(repo.dir, "src/wiring.ts", "register\n");
    write(repo.dir, EXTRA_CODER_REL, "src/b.ts\nsrc/wiring.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /warning: refused src\/b\.ts - claimed by task T2/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", "src/wiring.ts", EXTRA_CODER_REL].sort());
  });
});

test("an extras path a done task claims lands with the committed task named on stderr", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, STATUS_REL, statusBody(2).replace("done: none", "done: T2").replace("progress: 0/2", "progress: 1/2"));
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "T2 done");
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/b.ts", "a defect T1's tests exposed\n");
    write(repo.dir, EXTRA_REVIEW_REL, "src/b.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /warning: took src\/b\.ts - claimed by committed task T2/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", "src/b.ts", EXTRA_REVIEW_REL].sort());
  });
});

test("an extras path under .temp is refused and stays out of the commit", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, ".temp/viber/T1/build.log", "noise\n");
    write(repo.dir, EXTRA_CODER_REL, ".temp/viber/T1/build.log\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused \.temp\/viber\/T1\/build\.log/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", EXTRA_CODER_REL].sort());
  });
});

test("a path on --with and in an extras file is committed once, and its ownership warning is not repeated", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, STATUS_REL, statusBody(2).replace("done: none", "done: T2").replace("progress: 0/2", "progress: 1/2"));
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "T2 done");
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/b.ts", "a defect T1's tests exposed\n");
    write(repo.dir, EXTRA_CODER_REL, "src/b.ts\n");
    write(repo.dir, EXTRA_REVIEW_REL, "src/b.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", "src/b.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr.split("warning: took src/b.ts").length - 1, 1, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", "src/b.ts", EXTRA_CODER_REL, EXTRA_REVIEW_REL].sort());
  });
});

test("an extras file with blank lines, carriage returns and a leading ./ commits the paths it lists", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/x.ts", "x\n");
    write(repo.dir, "src/y.ts", "y\n");
    write(repo.dir, EXTRA_CODER_REL, "\r\n\n./src/x.ts\r\n\nsrc/y.ts\r\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /could not stage/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", "src/x.ts", "src/y.ts", EXTRA_CODER_REL].sort());
  });
});

test("an extras file whose last line has no newline still commits that path", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/x.ts", "x\n");
    write(repo.dir, EXTRA_CODER_REL, "src/x.ts");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", "src/x.ts", EXTRA_CODER_REL].sort());
  });
});

test("--unreviewed commits the extras paths and both extras files too", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/wiring.ts", "the coder's\n");
    write(repo.dir, "src/fixture.ts", "the reviewer's\n");
    write(repo.dir, EXTRA_CODER_REL, "src/wiring.ts\n");
    write(repo.dir, EXTRA_REVIEW_REL, "src/fixture.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--unreviewed"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(
      await committedFiles(repo),
      [STATUS_REL, "src/a.ts", "src/fixture.ts", "src/wiring.ts", EXTRA_CODER_REL, EXTRA_REVIEW_REL].sort(),
    );
  });
});

test("another task's extras file and its paths do not ride in this task's commit", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/wiring.ts", "T2's coder, still running\n");
    write(repo.dir, `${RUN_DIR}/work/T2-extra.md`, "src/wiring.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("--landed ignores both extras files: their paths and the files themselves stay uncommitted", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await repo.git("add", "src/a.ts");
    await repo.git("commit", "-m", "landed elsewhere");
    const sha = (await repo.git("rev-parse", "HEAD")).stdout.trim();
    write(repo.dir, "src/wiring.ts", "the coder's\n");
    write(repo.dir, "src/fixture.ts", "the reviewer's\n");
    write(repo.dir, EXTRA_CODER_REL, "src/wiring.ts\n");
    write(repo.dir, EXTRA_REVIEW_REL, "src/fixture.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--landed", sha]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL]);
  });
});

// --- C6: --rule and --decide read the arbiter's ruling file ------------------

const RULING_REL = `${RUN_DIR}/work/ruling-1.md`;
const OPTIONS_REL = `${RUN_DIR}/work/T2-options.md`;
const RULING_FILE = ["VERDICT: RULED", `RULING: ${RULE_ARGS[0]}`, `WHY: ${RULE_ARGS[1]}`, `COST: ${RULE_ARGS[2]}`, ""].join("\n");

/** Writes a file, or nothing for a case whose file is absent. */
function putFile(repo: GitRepo, rel: string, content: string | null): void {
  if (content !== null) write(repo.dir, rel, content);
}

/** A file's text, or null when it does not exist. */
function readOrNull(repo: GitRepo, rel: string): string | null {
  const file = path.join(repo.dir, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null;
}

test("--rule --from appends the register line the text form writes, prints its two lines, commits nothing and keeps the file", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, RULING_REL, RULING_FILE);

    const result = await run(repo.dir, repo.env, ["--rule", PLAN_REL, "T2", "--from", RULING_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "ruled: T2\nprogress: unchanged\n");
    assert.equal(readRulings(repo), `# Rulings\n\n- T2: ${RULE_LINE}\n`);
    assert.deepEqual(await subjects(repo), ["seed"]);
    assert.deepEqual(await stagedFiles(repo), []);
    assert.equal(readOrNull(repo, RULING_REL), RULING_FILE);
  });
});

test("--rule --from strips a carriage return from every line and ignores the lines it does not read", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, RULING_REL, RULING_FILE.replace(/\n/g, "\r\n") + "NOTE: ignored\r\n");

    const result = await run(repo.dir, repo.env, ["--rule", PLAN_REL, "T2", "--from", RULING_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(readRulings(repo), `# Rulings\n\n- T2: ${RULE_LINE}\n`);
  });
});

const NASTY_RULING = 'say "hi" $HOME `date` back\\slash $(touch pwned)';
const NASTY_WHY = "why: it's \"quoted\" and `ticked` and \\n literal";
const NASTY_COST = "cost: $PATH ${HOME} \\\\ \"";

test("--rule --from records texts carrying a double quote, a dollar sign, a backtick and a backslash verbatim", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, RULING_REL, `VERDICT: RULED\nRULING: ${NASTY_RULING}\nWHY: ${NASTY_WHY}\nCOST: ${NASTY_COST}\n`);

    const result = await run(repo.dir, repo.env, ["--rule", PLAN_REL, "T2", "--from", RULING_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(readRulings(repo), `# Rulings\n\n- T2: ${NASTY_RULING} | why: ${NASTY_WHY} | cost if wrong: ${NASTY_COST}\n`);
  });
});

test("--rule --from recording the same file twice leaves one register line", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, RULING_REL, RULING_FILE);
    await run(repo.dir, repo.env, ["--rule", PLAN_REL, "T2", "--from", RULING_REL]);

    const result = await run(repo.dir, repo.env, ["--rule", PLAN_REL, "T2", "--from", RULING_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(readRulings(repo), `# Rulings\n\n- T2: ${RULE_LINE}\n`);
  });
});

test("--decide --from appends 'decision: <id>: auto: <ruling>' to status.md and prints its two lines without a commit", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    const before = readStatus(repo);
    write(repo.dir, RULING_REL, "VERDICT: RULED\nRULING: keep the old parser\n");

    const result = await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "--from", RULING_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "decided: T2\nprogress: unchanged\n");
    assert.equal(readStatus(repo), `${before}decision: T2: auto: keep the old parser\n`);
    assert.deepEqual(await subjects(repo), ["seed"]);
    assert.equal(readOrNull(repo, RULING_REL), "VERDICT: RULED\nRULING: keep the old parser\n");
  });
});

test("--decide --from takes an absolute or './' plan and ruling inside the repository as their relative forms, in any mix", async () => {
  const abs = (rel: string, repo: GitRepo) => path.join(repo.dir, rel);
  const mixes: Array<(repo: GitRepo) => [string, string]> = [
    (repo) => [abs(PLAN_REL, repo), RULING_REL],
    (repo) => [abs(PLAN_REL, repo), abs(RULING_REL, repo)],
    (repo) => [PLAN_REL, abs(RULING_REL, repo)],
    () => [`./${PLAN_REL}`, `./${RULING_REL}`],
  ];
  for (const mix of mixes) {
    await withGitRepo(async (repo) => {
      await seed(repo);
      const before = readStatus(repo);
      write(repo.dir, RULING_REL, "RULING: keep the old parser\n");
      const [plan, ruling] = mix(repo);

      const result = await run(repo.dir, repo.env, ["--decide", plan, "T2", "--from", ruling]);
      assert.equal(result.status, 0, `${plan} ${ruling}: ${result.stderr}`);
      assert.equal(readStatus(repo), `${before}decision: T2: auto: keep the old parser\n`);
    });
  }
});

test("--decide --from refuses an absolute ruling path carrying a '..' segment, even one resolving under work/", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    const before = readStatus(repo);
    write(repo.dir, RULING_REL, "RULING: keep the old parser\n");
    const dotted = `${repo.dir}/${RUN_DIR}/work/../work/ruling-1.md`;

    const result = await run(repo.dir, repo.env, ["--decide", path.join(repo.dir, PLAN_REL), "T2", "--from", dotted]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /is outside/);
    assert.equal(readStatus(repo), before);
  });
});

test("--decide --from writes the same line as the text form for 'auto: <ruling>'", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, RULING_REL, `RULING: ${NASTY_RULING}\n`);
    await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "--from", RULING_REL]);
    const fromFile = readStatus(repo);
    write(repo.dir, STATUS_REL, statusBody(2));

    await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", `auto: ${NASTY_RULING}`]);
    assert.equal(fromFile, readStatus(repo));
  });
});

test("--decide --first-of records the first option of an options file as 'auto: <option>'", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    const before = readStatus(repo);
    write(repo.dir, OPTIONS_REL, "VERDICT: FAIL\nDECIDE: a $x | b\n");

    const result = await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "--first-of", OPTIONS_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "decided: T2\nprogress: unchanged\n");
    assert.equal(readStatus(repo), `${before}decision: T2: auto: a $x\n`);
  });
});

const FIRST_OF_REFUSALS: Array<[name: string, content: string]> = [
  ["no DECIDE line", "VERDICT: FAIL\nREASON: nothing\n"],
  ["a DECIDE line with no text", "DECIDE: \n"],
  ["an empty first option", "DECIDE:  | b\n"],
  ["a DECIDE line whose first option is blank", "DECIDE: | b\n"],
  ["an empty file", ""],
];

for (const [name, content] of FIRST_OF_REFUSALS) {
  test(`--decide --first-of on an options file with ${name} exits 2 and leaves status.md unchanged`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);
      const before = readStatus(repo);
      write(repo.dir, OPTIONS_REL, content);

      const result = await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "--first-of", OPTIONS_REL]);
      assert.equal(result.status, 2, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.equal(readStatus(repo), before);
    });
  });
}

test("a task commit stages a changed <task-id>-options.md with the task's trail", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, `${RUN_DIR}/work/T1-options.md`, "DECIDE: a | b\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", `${RUN_DIR}/work/T1-options.md`].sort());
  });
});

test("a task commit leaves another task's options file out", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, OPTIONS_REL, "DECIDE: a | b\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

const FROM_ENTRY_REFUSALS: Array<[name: string, rel: string, content: string | null]> = [
  ["a file with no RULING line", RULING_REL, "WHY: w\nCOST: c\n"],
  ["a file with no WHY line", RULING_REL, "RULING: r\nCOST: c\n"],
  ["a file with no COST line", RULING_REL, "RULING: r\nWHY: w\n"],
  ["a file with an empty RULING", RULING_REL, "RULING: \nWHY: w\nCOST: c\n"],
  ["a file with an empty WHY", RULING_REL, "RULING: r\nWHY: \nCOST: c\n"],
  ["a file with a whitespace-only COST", RULING_REL, "RULING: r\nWHY: w\nCOST:    \n"],
  ["an absent file", `${RUN_DIR}/work/ruling-9.md`, null],
  ["a path in the run directory outside work/", `${RUN_DIR}/ruling-1.md`, RULING_FILE],
  ["a path in another directory", "elsewhere/work/ruling-1.md", RULING_FILE],
  ["a path leaving work/ through a '..' segment", `${RUN_DIR}/work/../ruling-1.md`, RULING_FILE],
];

for (const [name, rel, content] of FROM_ENTRY_REFUSALS) {
  test(`--rule --from refuses ${name} with exit 2 and leaves rulings.md, status.md and the file unchanged`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);
      write(repo.dir, RULINGS_REL, `# Rulings\n\n- T2: ${RULE_LINE}\n`);
      putFile(repo, rel, content);
      const rulingsBefore = readRulings(repo);
      const statusBefore = readStatus(repo);

      const result = await run(repo.dir, repo.env, ["--rule", PLAN_REL, "T1", "--from", rel]);
      assert.equal(result.status, 2, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.equal(readRulings(repo), rulingsBefore);
      assert.equal(readStatus(repo), statusBefore);
      assert.equal(readOrNull(repo, rel), content);
    });
  });
}

const DECIDE_FROM_REFUSALS: Array<[name: string, rel: string, content: string | null]> = [
  ["a file with no RULING line", RULING_REL, "WHY: w\n"],
  ["a file with an empty RULING", RULING_REL, "RULING: \n"],
  ["an absent file", `${RUN_DIR}/work/ruling-9.md`, null],
  ["a path in the run directory outside work/", `${RUN_DIR}/ruling-1.md`, "RULING: r\n"],
  ["a path leaving work/ through a '..' segment", `${RUN_DIR}/work/../ruling-1.md`, "RULING: r\n"],
];

for (const [name, rel, content] of DECIDE_FROM_REFUSALS) {
  test(`--decide --from refuses ${name} with exit 2 and leaves status.md and the file unchanged`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);
      putFile(repo, rel, content);
      const statusBefore = readStatus(repo);

      const result = await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "--from", rel]);
      assert.equal(result.status, 2, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.equal(readStatus(repo), statusBefore);
      assert.equal(readOrNull(repo, rel), content);
    });
  });
}

test("--decide --first-of refuses a path outside work/ with exit 2 and leaves status.md unchanged", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, `${RUN_DIR}/T2-options.md`, "DECIDE: a | b\n");
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, ["--decide", PLAN_REL, "T2", "--first-of", `${RUN_DIR}/T2-options.md`]);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.equal(readStatus(repo), before);
  });
});

const FROM_SUBJECT_REFUSALS: Array<[name: string, form: string[], code: number, stderr: RegExp]> = [
  ["--rule with an unknown fixed subject", ["--rule", PLAN_REL, "baselines", "--from", RULING_REL], 2, /unknown subject 'baselines'/],
  ["--rule with a task id the plan lacks", ["--rule", PLAN_REL, "T9", "--from", RULING_REL], 3, /no task 'T9'/],
  ["--decide with a task id the plan lacks", ["--decide", PLAN_REL, "T9", "--from", RULING_REL], 3, /no task 'T9'/],
  ["--decide --first-of with a task id the plan lacks", ["--decide", PLAN_REL, "T9", "--first-of", OPTIONS_REL], 3, /no task 'T9'/],
  ["--decide with a task on the done list", ["--decide", PLAN_REL, "T1", "--from", RULING_REL], 2, /task 'T1' is already done/],
  ["--decide with a task on the skipped list", ["--decide", PLAN_REL, "T3", "--from", RULING_REL], 2, /task 'T3' is skipped/],
];

for (const [name, form, code, stderr] of FROM_SUBJECT_REFUSALS) {
  test(`${name} keeps the text forms' refusal when it reads a file, leaving the register and status.md unchanged`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo, [
        ["T1", "src/a.ts"],
        ["T2", "src/b.ts"],
        ["T3", "src/c.ts"],
      ]);
      write(repo.dir, STATUS_REL, "# status\n\nprogress: 1/3\ndone: T1\nskipped: T3\nunreviewed: none\ndeferred: none\nclosed: none\n");
      write(repo.dir, RULING_REL, RULING_FILE);
      write(repo.dir, OPTIONS_REL, "DECIDE: a | b\n");
      const before = readStatus(repo);

      const result = await run(repo.dir, repo.env, form);
      assert.equal(result.status, code, `stderr: ${result.stderr}`);
      assert.match(result.stderr, stderr);
      assert.equal(readStatus(repo), before);
      assert.equal(readOrNull(repo, RULINGS_REL), null);
    });
  });
}

test("the usage text lists the --from and --first-of forms", async () => {
  await withGitRepo(async (repo) => {
    const result = await run(repo.dir, repo.env, []);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--rule <plan-file> <subject> --from <ruling-file>/);
    assert.match(result.stderr, /--decide <plan-file> <task-id> --from <ruling-file>/);
    assert.match(result.stderr, /--decide <plan-file> <task-id> --first-of <options-file>/);
  });
});

for (const [form, arrange] of RULE_CARRIERS) {
  test(`a ${form} commit stages a changed ruling-*.md of the run's work directory with the register`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);
      const args = await arrange(repo);
      write(repo.dir, RULING_REL, RULING_FILE);

      const result = await run(repo.dir, repo.env, args);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.ok((await committedFiles(repo)).includes(RULING_REL), `committed: ${(await committedFiles(repo)).join(", ")}`);
    });
  });
}

// --- no owed-path record ------------------------------------------------------

test("--owe and --repaired are no forms of the script: each exits 2 with the usage text and leaves status.md untouched (nothing reads an owed path any more)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    const before = readStatus(repo);

    for (const args of [[PLAN_REL, "T1", "--owe", "src/a.ts"], ["--repaired", PLAN_REL, "T1"]]) {
      const result = await run(repo.dir, repo.env, args);
      assert.equal(result.status, 2, `${args.join(" ")}: ${result.stderr}`);
      assert.match(result.stderr, /^error: usage:/);
      assert.equal(readStatus(repo), before);
    }
    const usage = (await run(repo.dir, repo.env, [])).stderr;
    assert.doesNotMatch(usage, /--owe|--repaired/);
  });
});

test("committing a done task again stages a new path its extras file lists that no task claims", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    assert.equal((await run(repo.dir, repo.env, [PLAN_REL, "T1"])).status, 0);

    write(repo.dir, "src/late.ts", "the repair pass's file\n");
    write(repo.dir, EXTRA_CODER_REL, "src/late.ts\n");
    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), ["src/late.ts", EXTRA_CODER_REL].sort());
    assert.match(readStatus(repo), /^done: T1$/m);
  });
});

/*
 * Root cause: a "git add" failing on a path of the task made stage_named drop it with the same
 * "could not stage" warning an unknown path gets, and the commit went ahead without it, so the task
 * was recorded done with part of its work uncommitted. Fix: a path git knows (index or HEAD) that
 * could not be staged ends the call with exit 5; an unknown or ignored-untracked path only warns.
 */

test("a Files path git does not know still gets 'warning: could not stage <path>' and the commit goes ahead", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", "src/a.ts, src/ghost.ts"]]);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /warning: could not stage src\/ghost\.ts/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
    assert.match(readStatus(repo), /^done: T1$/m);
  });
});

test("a task commit of a skipped task exits 2 with the C2 error line, status.md unchanged and no commit (a resumed build must never commit a dropped task's half-finished files)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await run(repo.dir, repo.env, ["--skip", PLAN_REL, "T2"]);
    write(repo.dir, "src/b.ts", "half finished\n");
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T2"]);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: task 'T2' is skipped - it cannot be committed$/m);
    assert.equal(readStatus(repo), before);
    assert.deepEqual(await subjects(repo), ["seed"]);
    assert.deepEqual(await stagedFiles(repo), []);
  });
});

test("a skipped task refuses a task commit carrying --with or --defer too", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await run(repo.dir, repo.env, ["--skip", PLAN_REL, "T2"]);
    write(repo.dir, "src/b.ts", "half finished\n");
    write(repo.dir, "src/free.ts", "free\n");

    for (const extra of [["--with", "src/free.ts"], ["--defer", "T1:src/b.ts"]]) {
      const result = await run(repo.dir, repo.env, [PLAN_REL, "T2", ...extra]);
      assert.equal(result.status, 2, `${extra[0]}: ${result.stderr}`);
      assert.match(result.stderr, /task 'T2' is skipped - it cannot be committed/);
    }
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("the fix-number form for a skipped task still commits (only the task commit is refused)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    await run(repo.dir, repo.env, ["--skip", PLAN_REL, "T2"]);
    write(repo.dir, "src/b.ts", "fix\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T2", "1", "src/b.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^progress: unchanged$/m);
    assert.deepEqual((await subjects(repo))[0], "T2(1) - task T2");
  });
});

test("--drop reads a path given with a leading ./ and a path inside a directory the same way", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "tmp/deep/scratch.txt", "debug\n");

    const result = await run(repo.dir, repo.env, ["--drop", PLAN_REL, "./tmp/deep/scratch.txt"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "dropped: tmp/deep/scratch.txt\n");
    assert.equal(fs.existsSync(path.join(repo.dir, "tmp/deep/scratch.txt")), false);
  });
});

const DROP_KEPT: Array<[name: string, setup: (repo: GitRepo) => Promise<string>, reason: RegExp]> = [
  [
    "a tracked file",
    async (repo) => {
      write(repo.dir, "src/tracked.ts", "x\n");
      await repo.git("add", "src/tracked.ts");
      await repo.git("commit", "-m", "track it");
      return "src/tracked.ts";
    },
    /^warning: kept src\/tracked\.ts - tracked$/m,
  ],
  [
    "a path a task Files line lists",
    async (repo) => {
      write(repo.dir, "src/a.ts", "work\n");
      return "src/a.ts";
    },
    /^warning: kept src\/a\.ts - claimed by task T1$/m,
  ],
  [
    "a path the coder extras file of another task lists",
    async (repo) => {
      write(repo.dir, `${RUN_DIR}/work/T2-extra.md`, "./lib/helper.ts\n");
      write(repo.dir, "lib/helper.ts", "x\n");
      return "lib/helper.ts";
    },
    /^warning: kept lib\/helper\.ts - listed by extras of task T2$/m,
  ],
  [
    "a path a reviewer extras file lists",
    async (repo) => {
      write(repo.dir, `${RUN_DIR}/work/T1-extra-review.md`, "lib\\helper.ts\r\n");
      write(repo.dir, "lib/helper.ts", "x\n");
      return "lib/helper.ts";
    },
    /^warning: kept lib\/helper\.ts - listed by extras of task T1$/m,
  ],
  [
    "an ignored path",
    async (repo) => {
      write(repo.dir, ".gitignore", "*.log\n");
      await repo.git("add", ".gitignore");
      await repo.git("commit", "-m", "ignore logs");
      write(repo.dir, "build.log", "x\n");
      return "build.log";
    },
    /^warning: kept build\.log - ignored by git$/m,
  ],
  [
    "a path inside the run directory",
    async (repo) => {
      write(repo.dir, `${RUN_DIR}/work/notes.md`, "x\n");
      return `${RUN_DIR}/work/notes.md`;
    },
    /^warning: kept docs\/_specs\/[^ ]+\/work\/notes\.md - inside the run directory$/m,
  ],
  [
    "a directory",
    async (repo) => {
      write(repo.dir, "scratchdir/file.txt", "x\n");
      return "scratchdir";
    },
    /^warning: kept scratchdir - not a file$/m,
  ],
  [
    "a missing path",
    async () => "no/such/file.txt",
    /^warning: kept no\/such\/file\.txt - not found$/m,
  ],
];

for (const [name, setup, reason] of DROP_KEPT) {
  test(`--drop keeps ${name} with its reason while another path of the same call is still dropped`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo);
      const kept = await setup(repo);
      write(repo.dir, "scratch.txt", "debug\n");
      const existedBefore = fs.existsSync(path.join(repo.dir, kept));

      const result = await run(repo.dir, repo.env, ["--drop", PLAN_REL, kept, "scratch.txt"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stderr, reason);
      assert.equal(result.stdout, "dropped: scratch.txt\n");
      assert.equal(fs.existsSync(path.join(repo.dir, "scratch.txt")), false);
      assert.equal(fs.existsSync(path.join(repo.dir, kept)), existedBefore);
    });
  });
}

test("--drop with a plan and no path exits 2 with the usage text and deletes nothing", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "scratch.txt", "debug\n");

    const result = await run(repo.dir, repo.env, ["--drop", PLAN_REL]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^error: usage: commit-task\.sh/);
    assert.equal(result.stdout, "");
    assert.equal(fs.existsSync(path.join(repo.dir, "scratch.txt")), true);
  });
});

test("--drop against a missing plan exits 2 and deletes nothing", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "scratch.txt", "debug\n");

    const result = await run(repo.dir, repo.env, ["--drop", `${RUN_DIR}/nope.md`, "scratch.txt"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /plan file not found/);
    assert.equal(result.stdout, "");
    assert.equal(fs.existsSync(path.join(repo.dir, "scratch.txt")), true);
  });
});

test("the usage text lists the --drop form", async () => {
  await withGitRepo(async (repo) => {
    const result = await run(repo.dir, repo.env, []);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--drop <plan-file> <path> \[<path>\.\.\.\]/);
  });
});

// --- --leftovers: the leftovers section of outcome.md, the unexplained paths committed ---

test("--leftovers gives a skipped task's Repro path and the dirty paths of a skipped and of an open task their reasons, leaves all three uncommitted and writes them under the heading above the Drift line", async () => {
  await withGitRepo(async (repo) => {
    await seedLeftovers(repo, { skipped: "T2" });
    write(repo.dir, `${RUN_DIR}/tasks/T2.md`, "### T2 - task T2\n- Repro: test/b.test.ts\n");
    write(repo.dir, "src/a.ts", "half done\n");
    write(repo.dir, "src/b.ts", "half done\n");
    write(repo.dir, "test/b.test.ts", "RED\n");

    const result = await runLeftovers(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "left: 3\n");
    assert.equal(
      readOutcome(repo),
      [
        "Build summary.",
        "",
        "## Leftovers",
        "test/b.test.ts: reproduction test of skipped task T2 - left uncommitted",
        "src/a.ts: unfinished work of task T1 - left uncommitted",
        "src/b.ts: unfinished work of skipped task T2 - left uncommitted",
        "",
        "Drift: none",
        "",
      ].join("\n"),
    );
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("--leftovers leaves an orphan path a summary marker names uncommitted under the marker's reason, while a dirty reason wins over a marker for the same path", async () => {
  await withGitRepo(async (repo) => {
    const summary = [
      "Build summary.",
      "left uncommitted: tools/out.log | kept as evidence",
      "left uncommitted: src/a.ts | a marker beside a dirty path",
    ];
    await seedLeftovers(repo, { outcome: `${summary.join("\n")}\n\n## Leftovers\n` });
    write(repo.dir, "tools/out.log", "evidence\n");
    write(repo.dir, "src/a.ts", "half done\n");

    const result = await runLeftovers(repo, "1");
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "left: 2\n");
    assert.equal(
      readOutcome(repo),
      [
        ...summary,
        "",
        "## Leftovers",
        "src/a.ts: unfinished work of task T1 - left uncommitted",
        "tools/out.log: kept as evidence - left uncommitted",
        "",
        "Drift: 1",
        "",
      ].join("\n"),
    );
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("--leftovers leaves an orphan path a skipped task's note names uncommitted as written outside its Files", async () => {
  await withGitRepo(async (repo) => {
    await seedLeftovers(repo, { skipped: "T2" });
    write(repo.dir, `${RUN_DIR}/work/T2-coder.md`, "- wrote lib/x.ts beside its Files\n");
    write(repo.dir, "lib/x.ts", "stray\n");

    const result = await runLeftovers(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "left: 1\n");
    assert.match(readOutcome(repo), /^lib\/x\.ts: written by skipped task T2 outside its Files - left uncommitted$/m);
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("--leftovers refuses a .temp path with the warning's text as its reason and still commits the other unexplained path", async () => {
  await withGitRepo(async (repo) => {
    await seedLeftovers(repo);
    write(repo.dir, ".temp/x", "machine state\n");
    write(repo.dir, "lib/x.ts", "a tool output\n");

    const result = await runLeftovers(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const sha = await headSha(repo);
    assert.equal(result.stdout, `committed: ${sha}\nleft: 1\n`);
    assert.deepEqual(await committedFiles(repo), ["lib/x.ts"]);
    assert.match(
      readOutcome(repo),
      /^\.temp\/x: refused \.temp\/x - \.temp is machine state, never committed - left uncommitted$/m,
    );
  });
});

test("--leftovers leaves every path of a failing commit uncommitted under git's error line and exits 0", async () => {
  await withGitRepo(async (repo) => {
    await seedLeftovers(repo);
    write(repo.dir, "lib/x.ts", "a tool output\n");
    write(repo.dir, "tools/y.txt", "a tool output\n");
    await breakCommit(repo);

    const result = await runLeftovers(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "left: 2\n");
    assert.deepEqual(await subjects(repo), ["seed"]);
    const outcome = readOutcome(repo);
    assert.match(outcome, /^lib\/x\.ts: error: [^\n]* - left uncommitted$/m);
    assert.match(outcome, /^tools\/y\.txt: error: [^\n]* - left uncommitted$/m);
  });
});

test("--leftovers with nothing left drops the heading line and ends the summary on the Drift line", async () => {
  await withGitRepo(async (repo) => {
    await seedLeftovers(repo);

    const result = await runLeftovers(repo, "2");
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "left: none\n");
    assert.equal(readOutcome(repo), "Build summary.\n\nDrift: 2\n");
  });
});

test("--leftovers lists a path an earlier call committed first, as committed, and the new leftovers after it", async () => {
  await withGitRepo(async (repo) => {
    await seedLeftovers(repo);
    write(repo.dir, "lib/x.ts", "a tool output\n");
    const earlier = await runLeftovers(repo);
    assert.equal(earlier.status, 0, `stderr: ${earlier.stderr}`);
    const sha = await headSha(repo);
    write(repo.dir, "src/a.ts", "half done\n");

    const result = await runLeftovers(repo, "3");
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "left: 1\n");
    assert.deepEqual(await subjects(repo), [OUTSIDE_SUBJECT, "seed"]);
    assert.equal(
      readOutcome(repo),
      [
        "Build summary.",
        "",
        "## Leftovers",
        `lib/x.ts: ${NO_NOTE_REASON} - committed ${sha}`,
        "src/a.ts: unfinished work of task T1 - left uncommitted",
        "",
        "Drift: 3",
        "",
      ].join("\n"),
    );
  });
});

test("--leftovers lists a carried path that is a leftover again once, by its new line", async () => {
  await withGitRepo(async (repo) => {
    await seedLeftovers(repo);
    write(repo.dir, "lib/x.ts", "a tool output\n");
    const earlier = await runLeftovers(repo);
    assert.equal(earlier.status, 0, `stderr: ${earlier.stderr}`);
    write(repo.dir, "lib/x.ts", "changed again\n");

    const result = await runLeftovers(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const sha = await headSha(repo);
    assert.deepEqual(await subjects(repo), [OUTSIDE_SUBJECT, OUTSIDE_SUBJECT, "seed"]);
    assert.deepEqual(
      readOutcome(repo)
        .split("\n")
        .filter((line) => line.startsWith("lib/x.ts:")),
      [`lib/x.ts: ${NO_NOTE_REASON} - committed ${sha}`],
    );
  });
});

test("--leftovers with a plan plan-index.sh refuses writes the one 'leftover check not performed' line and commits nothing", async () => {
  await withGitRepo(async (repo) => {
    await seedRaw(repo, "# Plan - feat x\n", 0);
    write(repo.dir, OUTCOME_REL, OUTCOME_HEAD);
    write(repo.dir, "src/legacy.ts", "a hand edit\n");

    const result = await runLeftovers(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "left: none\n");
    assert.deepEqual(await subjects(repo), ["seed"]);
    assert.match(
      readOutcome(repo),
      /^Build summary\.\n\n## Leftovers\nleftover check not performed: FIX: no <!-- TASK --> blocks in [^\n]+\n\nDrift: none\n$/,
    );
  });
});

test("--leftovers without an outcome.md exits 2 and commits nothing", async () => {
  await withGitRepo(async (repo) => {
    await seedLeftovers(repo, { outcome: null });
    write(repo.dir, "lib/x.ts", "a tool output\n");

    const result = await runLeftovers(repo);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /outcome\.md/);
    assert.equal(result.stdout, "");
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

for (const drift of ["abc", "-1", "1.5"]) {
  test(`--leftovers with --drift ${drift} exits 2 and leaves outcome.md and the tree alone`, async () => {
    await withGitRepo(async (repo) => {
      await seedLeftovers(repo);
      write(repo.dir, "lib/x.ts", "a tool output\n");

      const result = await runLeftovers(repo, drift);
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.equal(readOutcome(repo), OUTCOME_HEAD);
      assert.deepEqual(await subjects(repo), ["seed"]);
    });
  });
}

test("--leftovers without --drift exits 2 with the usage text", async () => {
  await withGitRepo(async (repo) => {
    await seedLeftovers(repo);

    const result = await run(repo.dir, repo.env, ["--leftovers", PLAN_REL]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^error: usage: commit-task\.sh/);
    assert.equal(readOutcome(repo), OUTCOME_HEAD);
  });
});

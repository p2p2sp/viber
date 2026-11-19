/*
 * plan-index.critical.test.ts - the critical tier of
 * viber/scripts/plan-index.sh: a valid plan prints its index, --split writes
 * spec.md and the task files and commits only the run directory, a rejected or
 * foreign plan leaves nothing written, and Windows separator and drive-letter
 * spellings work.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by plan-index.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/plan-index.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { slash } from "../harness/paths.ts";
import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import {
  SUT,
  PLAN_DIR,
  PLAN_REL,
  run,
  write,
  planBody,
  TWO_TASKS,
  seed,
  readRun,
  taskFiles,
  subjects,
  seedScope,
  scope,
  DISPATCH_ROOT,
  seedDispatch,
} from "./plan-index-fixture.ts";

test("the index carries one row per task: id, state, TDD marker, exclusivity, normalised deps, files and title", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      [
        `plan: ${PLAN_REL}`,
        "title: Add login",
        "progress: 0/2",
        "tasks: id | state | tdd | excl | hard | deps | feeds | files | title",
        "T1 | todo | required | - | - | - | - | src/login.ts | Add the login handler",
        "T2 | todo | required | - | - | T1 | - | src/reject.ts | Reject a bad password",
        "verify: T1 | npm test",
        "verify: T2 | npm test",
        "review: single",
        "dispatch: viber:planner-review",
        "",
      ].join("\n"),
    );
  });
});

test("--split refuses any plan but the run's own <dir>/plan.md - it rebuilds <dir>/tasks and would delete a real one", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // the exact shape that would cost a project its own tasks/ directory:
    // a plan sitting loose in the repository root
    write(dir, "plan.md", planBody(TWO_TASKS));
    write(dir, "tasks/keep.txt", "a directory this project owns\n");
    write(dir, `${PLAN_DIR}/steps.md`, planBody(TWO_TASKS));

    for (const rel of ["plan.md", `${PLAN_DIR}/steps.md`]) {
      const result = await run(dir, {}, [rel, "--split"]);
      assert.equal(result.status, 2, `${rel} -> stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /--split expects the run/);
    }

    assert.deepEqual(fs.readdirSync(path.join(dir, "tasks")), ["keep.txt"]);
  });
});

test(
  "--split accepts the run's own plan.md handed over with Windows separators (dirname splits a backslash, the shell's own expansion does not - disagreeing, they refuse a legitimate plan)",
  {
    skip:
      process.platform === "win32"
        ? false
        : "off Windows a backslash is a legal filename character, so the argument names no file",
  },
  async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, planBody(TWO_TASKS));

      const result = await run(dir, {}, [PLAN_REL.replace(/\//g, "\\"), "--split"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);
    });
  },
);

test("a <!-- TASK --> block above the plan's own \"## Tasks\" heading is refused, naming the task, and --split writes nothing for it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // the cut point IS the "## Tasks" heading: a block that opens before it has
    // ever been seen would ride into spec.md rather than decompose into its own
    // task file, which is silent drift a coder never notices
    const misplaced = [
      "<!-- TASK -->",
      "### T0 - Misplaced task",
      "- TDD: required",
      "- Covers: AC1",
      "- Uses: none",
      "- Depends-on: none",
      "- Files: src/misplaced.ts",
      "- Delivers: the thing",
      "- Verification: npm test -> green",
      "- DoD: it works",
      "<!-- /TASK -->",
      "",
      "",
    ].join("\n");
    const body = planBody(TWO_TASKS).replace("## Goal\n", `## Goal\n\n${misplaced}`);
    seed(dir, body);

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /task T0: <!-- TASK --> block sits above the "## Tasks" heading/);
    assert.deepEqual(fs.readdirSync(path.join(dir, PLAN_DIR)), ["plan.md"]);
  });
});

test("a rejected plan is never decomposed - --split writes nothing when validation fails", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", covers: "AC9" }]));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 4);
    assert.deepEqual(fs.readdirSync(path.join(dir, PLAN_DIR)), ["plan.md"]);
  });
});

test("--split writes the specification and one file per task, and still prints the index", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^T2 \| todo \| required \| - \| - \| T1 \| - \| src\/reject\.ts \| Reject a bad password$/m);

    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);

    // spec.md is everything ABOVE the task list: WHAT and WHY, no task and -
    // because the appendix sits below the tasks - no contract either.
    const spec = readRun(dir, "spec.md");
    assert.match(spec, /^# Add login$/m);
    assert.match(spec, /^- add - src\/login\.ts - the handler$/m);
    assert.match(spec, /^### Out of scope$/m);
    assert.doesNotMatch(spec, /## Tasks/);
    assert.doesNotMatch(spec, /Add the login handler/);
    assert.doesNotMatch(spec, /## Contracts|POST \/login/);
  });
});

test("tasks/ is rebuilt from scratch, so a task dropped from the plan leaves no stale file behind", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);
    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);

    seed(dir, planBody([TWO_TASKS[0]!], 1));
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);
    assert.deepEqual(taskFiles(dir), ["T1.md"]);
  });
});

test("the decomposition is committed with the plan, and nothing outside the run directory rides along", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, "README.md", "seed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    seed(repo.dir, planBody(TWO_TASKS));
    // a change the user has open, and one they already staged: neither is this
    // script's business
    write(repo.dir, "README.md", "edited\n");
    write(repo.dir, "src/other.ts", "staged by the user\n");
    await repo.git("add", "src/other.ts");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    assert.deepEqual(await subjects(repo), [
      "chore(viber): decompose plan 2026-09-20-10-00-00_add-login",
      "seed",
    ]);
    const committed = (await repo
      .git("show", "--name-only", "--format=", "HEAD"))
      .stdout.trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();
    assert.deepEqual(committed, [
      PLAN_REL,
      `${PLAN_DIR}/spec.md`,
      `${PLAN_DIR}/status.md`,
      `${PLAN_DIR}/tasks/T1.md`,
      `${PLAN_DIR}/tasks/T2.md`,
    ].sort());

    // the user's own work is exactly where they left it
    assert.equal(fs.readFileSync(path.join(repo.dir, "README.md"), "utf-8"), "edited\n");
    assert.match((await repo.git("status", "--short")).stdout, /README\.md/);
    assert.match((await repo.git("status", "--short")).stdout, /src\/other\.ts/);
  });
});

test("an untracked work/ trail file beside the plan stays out of the decomposition commit and stays untracked", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, "README.md", "seed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    seed(repo.dir, planBody(TWO_TASKS));
    write(repo.dir, `${PLAN_DIR}/work/T3-notes.md`, "a coder's own trail, not the decomposition\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    const committed = (await repo
      .git("show", "--name-only", "--format=", "HEAD"))
      .stdout.trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();
    assert.deepEqual(committed, [
      PLAN_REL,
      `${PLAN_DIR}/spec.md`,
      `${PLAN_DIR}/status.md`,
      `${PLAN_DIR}/tasks/T1.md`,
      `${PLAN_DIR}/tasks/T2.md`,
    ].sort());
    assert.ok(!committed.includes(`${PLAN_DIR}/work/T3-notes.md`));

    // still on disk, still untracked - never staged, never committed
    assert.equal(
      fs.readFileSync(path.join(repo.dir, `${PLAN_DIR}/work/T3-notes.md`), "utf-8"),
      "a coder's own trail, not the decomposition\n",
    );
    assert.match((await repo.git("status", "--short")).stdout, /\?\? .*work\//);
  });
});

test("a backslashed coder-file path prints on the extra line in its forward-slash form", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "src\\b.ts\r\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "extra: src/b.ts\n");
  });
});

test("a backslashed coder-file path of a file a task not yet done claims is left off exactly as its forward-slash spelling is", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "src\\todo.ts\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
  });
});

// The invoked spelling is the contract: a C:\ or C:/ path is printed as C:/, a /c/ path as /c/.
// Neither spelling names a file outside Windows, so the cases skip there.
const WINDOWS_ONLY = process.platform === "win32" ? false : "a C:\\ or /c/ spelling names a file only on Windows";
const MSYS = (p: string) => slash(p).replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

const SPELLINGS: Array<{ label: string; invoked: string; root: string }> = [
  { label: "a C:\\ path", invoked: SUT, root: DISPATCH_ROOT },
  { label: "a C:/ path", invoked: slash(SUT), root: DISPATCH_ROOT },
  { label: "a /c/ path", invoked: MSYS(SUT), root: MSYS(DISPATCH_ROOT) },
];

for (const row of SPELLINGS) {
  test(`--dispatch invoked by ${row.label} prints refs and scope under the plugin root in that spelling (AC1)`, { skip: WINDOWS_ONLY }, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seedDispatch(dir);

      const result = await runScript(row.invoked, [PLAN_REL, "--dispatch", "T1", "reviewer"], { cwd: dir, shell: "bash" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.ok(result.stdout.includes(`\nrefs: ${row.root}/references\n`), `stdout: ${result.stdout}`);
      assert.ok(
        result.stdout.endsWith(`\nscope: "${row.root}/scripts/plan-index.sh" "${PLAN_REL}" --extra "T1"\n`),
        `stdout: ${result.stdout}`,
      );
    });
  });
}

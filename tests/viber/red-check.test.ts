/*
 * red-check.test.ts - proves viber/scripts/red-check.sh's contract:
 * `red-check.sh <plan> <id>` builds a detached worktree of HEAD in the system
 * temp directory, copies in only the task's changed test files and runs the
 * task's Verification command (the red run), then copies in the task's changed
 * production files and runs it again (the control run). It prints exactly one
 * `red-check:` line with exit 0: `FAIL-AS-EXPECTED <log>` when the red run
 * fails and the control run passes, `PASSED-WITHOUT-CHANGE <files>` when the
 * red run already passes, `UNRUNNABLE <reason>` when there is no test file, the
 * control run fails too, or the worktree cannot be built. Bad arguments or plan
 * exit 2.
 *
 * The cases that matter most are the isolation ones: coders build in parallel
 * in the main tree, so another task's dirty file must never reach the worktree,
 * the main tree's `git status` must read the same before and after, no
 * worktree may stay registered, and a linked `node_modules` (a real directory
 * in the worktree holding one link per entry, a workspace entry pointing into
 * the worktree) must survive the forced worktree removal with its content,
 * after a normal call, after a TERM and when a later call reclaims the
 * worktree a killed call left behind.
 *
 * The fixture's Verification command is a plain `bash tests/check.sh`, which
 * sources the production file `src/lib.sh`: a shell test keeps each case to a
 * few spawns.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/red-check.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import { canSymlinkDir } from "../harness/symlinks.ts";
import { withStub } from "../harness/stub.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/red-check.sh");

/** The real Windows `cmd.exe`, slash-separated, for a `cmd` stand-in to pass its calls on to. */
const REAL_CMD = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe").replace(/\\/g, "/");

/** A stand-in for the tool red-check.sh links with (`cmd /c mklink /J` on
 *  Windows, `ln -s` elsewhere) that makes no link and exits 1; on Windows every
 *  other `cmd` call (the cleanup's `rmdir`) reaches the real one. */
const FAILING_LINK = process.platform === "win32"
  ? { name: "cmd", body: 'case "$*" in *mklink*) exit 1 ;; esac\nexec "$REAL_CMD" "$@"' }
  : { name: "ln", body: "exit 1" };

/** A stand-in for the same tool that makes the link and then sends TERM to
 *  red-check, so its trap runs right after an entry link exists: on Windows the
 *  one `cmd` call running the junction batch, elsewhere an `ln` whose link lies
 *  inside the worktree's node_modules. Every other call reaches the real tool. */
const TERM_AFTER_LINK = process.platform === "win32"
  ? { name: "cmd", body: 'case "$*" in\n  *mklink*) "$REAL_CMD" "$@"; kill -TERM "$PPID" ;;\n  *) exec "$REAL_CMD" "$@" ;;\nesac' }
  : { name: "ln", body: 'command -p ln "$@"\ncase "$*" in */wt/node_modules/?*) kill -TERM "$PPID" ;; esac' };

const RUN_DIR = "docs/_specs/2026-10-20-10-00-00_red-check";
const PLAN_REL = `${RUN_DIR}/plan.md`;
const LOG_REL = ".temp/viber/T1/red-check.log";

function run(dir: string, env: Record<string, string>, args: string[]) {
  return runScript(SUT, args, { cwd: dir, env, shell: "bash", timeout: 120000 });
}

function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** A lite plan plan-index.sh validates: T1 owns the production file and its
 *  test, T2 owns another production file a parallel coder is editing. */
function planBody(verification = "bash tests/check.sh"): string {
  const task = (id: string, files: string, verification: string) => [
    "<!-- TASK -->",
    `### ${id} - task ${id}`,
    "- TDD: required",
    "- Covers: AC1",
    "- Uses: none",
    "- Depends-on: none",
    `- Files: ${files}`,
    "- Delivers: the thing",
    `- Verification: ${verification} -> green`,
    "- DoD: it works",
    "<!-- /TASK -->",
    "",
  ];
  return [
    "# Red check",
    "",
    "## Goal",
    "",
    "The answer is right.",
    "",
    "## Acceptance criteria",
    "",
    "1. The answer is 42.",
    "",
    "## Scope",
    "",
    "### File map",
    "",
    "- edit - src/lib.sh - the answer",
    "",
    "### Out of scope",
    "",
    "- Nothing else.",
    "",
    "## Tasks",
    "",
    ...task("T1", "src/lib.sh, tests/check.sh", verification),
    ...task("T2", "src/other.sh", "bash src/other.sh"),
  ].join("\n");
}

/** Commits the plan, the production files at their HEAD state and an ignore
 *  file for `.temp/` and `node_modules/`, as a host project carries them. */
async function seed(repo: GitRepo, verification?: string): Promise<void> {
  fs.appendFileSync(path.join(repo.dir, ".git", "info", "exclude"), ".gitconfig-global\n");
  write(repo.dir, PLAN_REL, planBody(verification));
  write(repo.dir, ".gitignore", ".temp/\nnode_modules/\n");
  write(repo.dir, "src/lib.sh", "answer() { echo 0; }\n");
  write(repo.dir, "src/other.sh", "other() { echo ok; }\n");
  await repo.git("add", "-A");
  await repo.git("commit", "-m", "seed");
}

/** The task's production change: the answer becomes 42. */
function changeProduction(dir: string): void {
  write(dir, "src/lib.sh", "answer() { echo 42; }\n");
}

async function status(repo: GitRepo): Promise<string> {
  return (await repo.git("status", "--porcelain", "-uall")).stdout;
}

async function worktrees(repo: GitRepo): Promise<string[]> {
  const out = (await repo.git("worktree", "list", "--porcelain")).stdout;
  return out.split("\n").filter((l) => l.startsWith("worktree "));
}

test("a test that passes on HEAD without the production change yields PASSED-WITHOUT-CHANGE naming the test file (a test written after the code proves nothing)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    changeProduction(repo.dir);
    write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n[ -n "$(answer)" ]\n');
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "red-check: PASSED-WITHOUT-CHANGE tests/check.sh\n");
  });
});

test("a test written first that fails on HEAD and passes with the change yields FAIL-AS-EXPECTED and the log", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    changeProduction(repo.dir);
    write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n[ "$(answer)" = 42 ]\n');
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `red-check: FAIL-AS-EXPECTED ${LOG_REL}\n`);
    const log = fs.readFileSync(path.join(repo.dir, LOG_REL), "utf-8");
    assert.match(log, /red run exit: 1/);
    assert.match(log, /control run exit: 0/);
  });
});

test("a test file named only on the task's extras line still counts as the task's test", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    changeProduction(repo.dir);
    write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n[ -n "$(answer)" ]\n');
    write(repo.dir, "tests/extra.test.sh", "exit 0\n");
    write(repo.dir, `${RUN_DIR}/work/T1-extra.md`, "tests/extra.test.sh\n");
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "red-check: PASSED-WITHOUT-CHANGE tests/check.sh tests/extra.test.sh\n");
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
    assert.equal(r.stdout, `red-check: FAIL-AS-EXPECTED ${LOG_REL}\n`);
    assert.equal(await status(repo), before);
    assert.deepEqual(await worktrees(repo), listBefore);
    assert.equal(fs.readFileSync(path.join(repo.dir, "src/other.sh"), "utf-8"), "exit 3\n");
  });
});

test("a task whose changes hold no test file yields UNRUNNABLE without building a worktree", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    changeProduction(repo.dir);
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "red-check: UNRUNNABLE no test files among the task's changes\n");
    assert.equal((await worktrees(repo)).length, 1);
  });
});

test("a control run that fails with the change in place yields UNRUNNABLE, never FAIL-AS-EXPECTED (an environment error must not pose as red)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    changeProduction(repo.dir);
    write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n[ "$(answer)" = 43 ]\n');
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `red-check: UNRUNNABLE control run failed (exit 1): ${LOG_REL}\n`);
    assert.equal((await worktrees(repo)).length, 1);
  });
});

test("a Verification wrapped in Markdown backticks runs as the bare command and yields FAIL-AS-EXPECTED (the wrapped text ran as a shell substitution and always failed)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, "`bash tests/check.sh`");
    changeProduction(repo.dir);
    write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n[ "$(answer)" = 42 ]\n');
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `red-check: FAIL-AS-EXPECTED ${LOG_REL}\n`);
  });
});

test("a control run exiting 127 on a command-not-found word that is not the command's first word yields the mangled-command line (shell substitution ate part of the command)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, "bash tests/check.sh && nosuchword_t8");
    changeProduction(repo.dir);
    write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n[ "$(answer)" = 42 ]\n');
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `red-check: UNRUNNABLE verify command mangled by shell substitution: ${LOG_REL}\n`);
  });
});

test("a control run exiting 127 on the command's own first word keeps the control-run-failed line (a missing tool is not a mangled command)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, "nosuchtool_t8 tests/check.sh");
    changeProduction(repo.dir);
    write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n[ "$(answer)" = 42 ]\n');
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `red-check: UNRUNNABLE control run failed (exit 127): ${LOG_REL}\n`);
  });
});

// Root cause: red-check.sh place() copies with `cp -p`, keeping the main-tree mtime.
// Actual: a changed production file older than the red run's build output is skipped
// by an mtime-comparing build (make, MSBuild CoreCompile), so the control run tests
// stale output and reads UNRUNNABLE. Expected: FAIL-AS-EXPECTED.
// Fix direction: place() gives every placed file a fresh mtime (touch after cp -p).
test("a changed production file whose main-tree mtime is older than the red run's build output is rebuilt in the control run (an mtime-comparing build such as MSBuild must not reuse the red run's output)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    changeProduction(repo.dir);
    const hourAgo = new Date(Date.now() - 3600 * 1000);
    fs.utimesSync(path.join(repo.dir, "src/lib.sh"), hourAgo, hourAgo);
    // A make-like build: out/lib.built is rebuilt only when missing or older than src/lib.sh.
    // find -newer compares below the second, where bash 3.2's -nt does not.
    write(repo.dir, "tests/check.sh", 'mkdir -p out\n{ [ -f out/lib.built ] && [ -z "$(find src/lib.sh -newer out/lib.built)" ]; } || cp src/lib.sh out/lib.built\n. ./out/lib.built\n[ "$(answer)" = 42 ]\n');
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `red-check: FAIL-AS-EXPECTED ${LOG_REL}\n`);
  });
});

test("a production change that sets the exec bit reaches the control run with that mode (a plain copy over the HEAD file would keep its old mode)", {
  skip: process.platform === "win32" ? "Windows has no exec bit to stage" : false,
}, async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    fs.chmodSync(path.join(repo.dir, "src/lib.sh"), 0o755);
    write(repo.dir, "tests/check.sh", "[ -x src/lib.sh ]\n");
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `red-check: FAIL-AS-EXPECTED ${LOG_REL}\n`);
  });
});

test("a node_modules directory of the main tree becomes a real directory in the worktree holding one link per entry, dot entries included, an @scope directory holding one link per entry of its own, and survives the cleanup with its content (a whole-directory link hands the main tree's workspace links to the red run)", {
  skip: process.platform !== "win32" && !canSymlinkDir() ? "this account cannot create a directory symlink" : false,
}, async () => {
  await withGitRepo(async (repo) => {
    await withTempDir("red-check-tmp-", async (tmp) => {
      await seed(repo);
      changeProduction(repo.dir);
      write(repo.dir, "node_modules/pkg/value.txt", "7\n");
      write(repo.dir, "node_modules/.bin/tool.txt", "8\n");
      write(repo.dir, "node_modules/@acme/core/index.txt", "9\n");
      // Exit 9 fails both runs, so any other layout reads UNRUNNABLE.
      write(repo.dir, "tests/check.sh", [
        "[ -d node_modules ] && [ ! -L node_modules ] || exit 9",
        "[ -L node_modules/pkg ] && [ -L node_modules/.bin ] || exit 9",
        "[ -d node_modules/@acme ] && [ ! -L node_modules/@acme ] && [ -L node_modules/@acme/core ] || exit 9",
        '[ "$(cat node_modules/pkg/value.txt node_modules/.bin/tool.txt node_modules/@acme/core/index.txt)" = "$(printf \'7\\n8\\n9\')" ] || exit 9',
        ". ./src/lib.sh",
        '[ "$(answer)" = 42 ]',
        "",
      ].join("\n"));
      const before = await status(repo);
      const r = await run(repo.dir, { ...repo.env, TMPDIR: tmp }, [PLAN_REL, "T1"]);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, `red-check: FAIL-AS-EXPECTED ${LOG_REL}\n`);
      assert.deepEqual(fs.readdirSync(path.join(repo.dir, "node_modules")).sort(), [".bin", "@acme", "pkg"]);
      assert.equal(fs.readFileSync(path.join(repo.dir, "node_modules/pkg/value.txt"), "utf-8"), "7\n");
      assert.equal(fs.readFileSync(path.join(repo.dir, "node_modules/.bin/tool.txt"), "utf-8"), "8\n");
      assert.equal(fs.readFileSync(path.join(repo.dir, "node_modules/@acme/core/index.txt"), "utf-8"), "9\n");
      assert.equal(await status(repo), before);
      assert.equal((await worktrees(repo)).length, 1);
      // The worktree's temp directory is gone too: nothing is left behind in TMPDIR.
      assert.deepEqual(fs.readdirSync(tmp), []);
    });
  });
});

test("a fixture under a testdata/ directory travels with the tests into the red run (a fixture counted as production would make any test fail there and seal it falsely)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    changeProduction(repo.dir);
    write(repo.dir, "src/testdata/expected.txt", "7\n");
    write(repo.dir, "tests/check.sh", '[ "$(cat src/testdata/expected.txt)" = 7 ]\n');
    write(repo.dir, `${RUN_DIR}/work/T1-extra.md`, "src/testdata/expected.txt\n");
    const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "red-check: PASSED-WITHOUT-CHANGE tests/check.sh src/testdata/expected.txt\n");
  });
});

test("a workspace package link inside node_modules resolving into the repository outside node_modules points into the worktree, so a test failing on HEAD's package code yields FAIL-AS-EXPECTED (a link into the main tree would load the changed code in the red run)", {
  skip: process.platform !== "win32" && !canSymlinkDir() ? "this account cannot create a directory symlink" : false,
}, async () => {
  await withGitRepo(async (repo) => {
    await withTempDir("red-check-tmp-", async (tmp) => {
      await seed(repo);
      changeProduction(repo.dir);
      const entry = path.join(repo.dir, "node_modules", "@acme", "core");
      fs.mkdirSync(path.dirname(entry), { recursive: true });
      fs.symlinkSync("../../src", entry, "junction");
      write(repo.dir, "tests/check.sh", '. ./node_modules/@acme/core/lib.sh\n[ "$(answer)" = 42 ]\n');
      const r = await run(repo.dir, { ...repo.env, TMPDIR: tmp }, [PLAN_REL, "T1"]);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, `red-check: FAIL-AS-EXPECTED ${LOG_REL}\n`);
      assert.equal(fs.readFileSync(path.join(repo.dir, "src/lib.sh"), "utf-8"), "answer() { echo 42; }\n");
      assert.equal(fs.lstatSync(entry).isSymbolicLink(), true);
      assert.equal((await worktrees(repo)).length, 1);
      assert.deepEqual(fs.readdirSync(tmp), []);
    });
  });
});

/** The shapes a killed call leaves its worktree's node_modules in, each with
 *  the owner file lines naming what it linked. */
const STALE_LAYOUTS = [
  {
    shape: "the whole directory, itself one link",
    owner: "node_modules",
    build: (left: string, main: string) => fs.symlinkSync(path.join(main, "node_modules"), path.join(left, "node_modules"), "junction"),
  },
  {
    shape: "the whole directory, a real one holding one link per entry",
    owner: "node_modules",
    build: (left: string, main: string) => {
      fs.mkdirSync(path.join(left, "node_modules"));
      fs.symlinkSync(path.join(main, "node_modules", "pkg"), path.join(left, "node_modules", "pkg"), "junction");
    },
  },
  {
    shape: "single entries",
    owner: "node_modules/pkg",
    build: (left: string, main: string) => {
      fs.mkdirSync(path.join(left, "node_modules"));
      fs.symlinkSync(path.join(main, "node_modules", "pkg"), path.join(left, "node_modules", "pkg"), "junction");
    },
  },
];

for (const layout of STALE_LAYOUTS) {
  test(`a worktree an earlier call left behind, its owner PID dead and its owner file listing ${layout.shape}, is reclaimed links first and the linked directory keeps its content (a killed call never ran its trap)`, {
    skip: process.platform !== "win32" && !canSymlinkDir() ? "this account cannot create a directory symlink" : false,
  }, async () => {
    await withGitRepo(async (repo) => {
      await withTempDir("red-check-stale-", async (stale) => {
        await seed(repo);
        changeProduction(repo.dir);
        write(repo.dir, "node_modules/pkg/value.txt", "7\n");
        write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n[ "$(answer)" = 42 ]\n');
        const left = path.join(stale, "wt");
        await repo.git("worktree", "add", "--detach", left, "HEAD");
        layout.build(left, repo.dir);
        // A PID that belonged to a process already gone.
        const dead = spawnSync(process.execPath, ["-e", ""]).pid;
        fs.writeFileSync(path.join(stale, "red-check.owner"), `${dead}\n${layout.owner}\n`);
        assert.equal((await worktrees(repo)).length, 2);
        const r = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(r.stdout, `red-check: FAIL-AS-EXPECTED ${LOG_REL}\n`);
        assert.equal((await worktrees(repo)).length, 1);
        assert.equal(fs.existsSync(left), false);
        assert.equal(fs.readFileSync(path.join(repo.dir, "node_modules/pkg/value.txt"), "utf-8"), "7\n");
      });
    });
  });
}

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

test("a link that cannot be made yields UNRUNNABLE naming the entry (a missing node_modules entry must never pose as red)", async () => {
  await withGitRepo(async (repo) => {
    await withTempDir("red-check-tmp-", async (tmp) => {
      await seed(repo);
      changeProduction(repo.dir);
      write(repo.dir, "node_modules/pkg/value.txt", "7\n");
      write(repo.dir, "tests/check.sh", '. ./src/lib.sh\n[ "$(answer)" = 42 ]\n');
      await withStub(FAILING_LINK.name, FAILING_LINK.body, async (stubDir) => {
        const r = await runScript(SUT, [PLAN_REL, "T1"], {
          cwd: repo.dir,
          env: { ...repo.env, TMPDIR: tmp, REAL_CMD },
          stubDirs: [stubDir],
          shell: "bash",
          timeout: 120000,
        });
        assert.equal(r.stdout, "red-check: UNRUNNABLE link failed: node_modules/pkg\n");
      });
    });
  });
});

test("a missing argument, a missing plan or an id the plan does not hold exits 2 with nothing on stdout", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    for (const args of [[], [PLAN_REL], [`${RUN_DIR}/missing.md`, "T1"], [PLAN_REL, "T9"], [PLAN_REL, ""]]) {
      const r = await run(repo.dir, repo.env, args);
      assert.equal(r.status, 2, `args ${JSON.stringify(args)}: ${r.stdout}`);
      assert.equal(r.stdout, "");
      assert.match(r.stderr, /^error: /);
    }
  });
});

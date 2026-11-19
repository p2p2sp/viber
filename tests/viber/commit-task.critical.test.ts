/*
 * commit-task.critical.test.ts - the critical tier of
 * viber/scripts/commit-task.sh: a task commit stages only its own Files
 * (bracket paths literal, a staged file beside it stays staged), a failed
 * commit restores status.md, and the fix, repair, chore, landed, leftovers and
 * drop forms take only what they name, including backslash and long path
 * lists.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by commit-task.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/commit-task.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import {
  run,
  RUN_DIR,
  PLAN_REL,
  STATUS_REL,
  write,
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
  NO_NOTE_REASON,
  seedLeftovers,
  runLeftovers,
  readOutcome,
  headSha,
} from "./commit-task-fixture.ts";

function readPlan(repo: GitRepo): string {
  return fs.readFileSync(path.join(repo.dir, PLAN_REL), "utf-8");
}

test("a task commits only its own Files: paths, with the done entry and the counter riding in that same commit", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    const planBefore = readPlan(repo);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^committed: [0-9a-f]{7,}\nprogress: 1\/2\n$/);

    assert.match(readStatus(repo), /^done: T1$/m);
    assert.match(readStatus(repo), /^progress: 1\/2$/m);
    // the plan defines the work and is never edited to record how it is going
    assert.equal(readPlan(repo), planBefore);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());

    // Read back out of history, not out of the working tree: a resume after a
    // context reset must find the entry in the commit itself.
    const fromHistory = (await repo.git("show", `HEAD:${STATUS_REL}`)).stdout;
    assert.match(fromHistory, /^done: T1$/m);
    assert.match(fromHistory, /^progress: 1\/2$/m);
  });
});

test("a Files path made of bracketed segments is staged literally - the App Router route lands, the sibling its character class covers does not", async () => {
  await withGitRepo(async (repo) => {
    // Every Next.js App Router route carries brackets in its own name. Git reads
    // "[id]" in a pathspec as a wildmatch character class, so without
    // GIT_LITERAL_PATHSPECS the neighbouring "src/app/i/page.tsx" - one char out
    // of {i,d} - is a candidate for the same commit.
    const route = "src/app/[id]/page.tsx";
    await seed(repo, [["T1", route]]);
    write(repo.dir, route, "work\n");
    write(repo.dir, "src/app/i/page.tsx", "someone else\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^committed: [0-9a-f]{7,}\nprogress: 1\/1\n$/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, route].sort());
    assert.match(result.stderr, /src\/app\/i\/page\.tsx/);
  });
});

test("--with refuses a path another task's Files claims and commits the rest (that task may have a coder writing the file right now)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/b.ts", "another task's file\n");
    write(repo.dir, "src/wiring.ts", "register\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", "src/b.ts", "src/wiring.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused src\/b\.ts - claimed by task T2/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", "src/wiring.ts"].sort());
  });
});

test("an extras-file line spelled with a backslash for a file another open task claims is refused in its forward-slash form (a backslash is not a way past the ownership check)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/b.ts", "T2's coder, still running\n");
    write(repo.dir, `${RUN_DIR}/work/T1-extra.md`, "src\\b.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /warning: refused src\/b\.ts - claimed by task T2/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", `${RUN_DIR}/work/T1-extra.md`].sort());
  });
});

test("--with a backslash-spelled path of a file another open task claims gets the same refusal as its forward-slash form", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/b.ts", "T2's coder, still running\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", "src\\b.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /warning: refused src\/b\.ts - claimed by task T2/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
  });
});

test("an extras-file line spelled with a backslash for an unowned file is staged under its forward-slash name", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "lib/c.ts", "forced\n");
    write(repo.dir, `${RUN_DIR}/work/T1-extra.md`, "lib\\c.ts\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "lib/c.ts", "src/a.ts", `${RUN_DIR}/work/T1-extra.md`].sort());
  });
});

test("--defer writes a backslashed path byte for byte, on one line (awk -v would turn \\n and \\t into control characters)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [
      PLAN_REL,
      "T1",
      "--defer",
      "T2:src\\new\\b.ts",
    ]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      readStatus(repo),
      "# status\n\nprogress: 1/2\ndone: T1\nskipped: none\nunreviewed: none\n" +
        "deferred: T2:src\\new\\b.ts\nclosed: none\n",
    );
  });
});

test("--with refuses a path whose owner's Files entry holds a backslash (the claimant check compares both in their forward-slash form)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [
      ["T1", "src/a.ts"],
      ["T2", "src\\new\\table.ts"],
    ]);
    write(repo.dir, "src/a.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--with", "src\\new\\table.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /refused src\/new\/table\.ts - claimed by task T2/);
  });
});

test("a task id holding a backslash is found in the plan and recorded byte for byte", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [
      ["T1", "src/a.ts"],
      ["T\\t9", "src/b.ts"],
    ]);
    write(repo.dir, "src/b.ts", "work\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T\\t9"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(readStatus(repo), /^done: T\\t9$/m);
  });
});

test("a file staged before the run stays staged and out of the task's commit (the orchestrator has no Bash to notice a dirty index)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/PRESTAGED.ts", "staged by the user before the build\n");
    await repo.git("add", "--", "src/PRESTAGED.ts");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts"].sort());
    assert.deepEqual(await stagedFiles(repo), ["src/PRESTAGED.ts"]);
  });
});

test("a refused git commit leaves status.md byte-for-byte unchanged and exits 5 (a task marked done but never committed is skipped forever on resume)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    const before = readStatus(repo);
    await breakCommit(repo);

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 5);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /status rolled back, task T1 is NOT marked done/);

    assert.equal(readStatus(repo), before);
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("a fix number commits a repair of that task under 'T<n>(<round>) - <title>', naming the task it repairs and leaving the plan's progress alone", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", "src/a.ts", "add the plan index"], ["T2", "src/b.ts"]]);
    write(repo.dir, "src/a.ts", "work\n");
    await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    const before = readStatus(repo);
    write(repo.dir, "src/a.ts", "repair\n");
    write(repo.dir, "src/UNRELATED.ts", "not part of the fix\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "2", "src/a.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^committed: [0-9a-f]{7,}\nprogress: unchanged\n$/);
    assert.equal(readStatus(repo), before);
    assert.deepEqual(await committedFiles(repo), ["src/a.ts"]);
    assert.equal((await subjects(repo))[0], "T1(2) - add the plan index");
    assert.match(result.stderr, /changed, claimed by no task in the plan/);
    assert.match(result.stderr, /src\/UNRELATED\.ts/);
  });
});

test("a Files path its coder already removed with git rm rides in the task's commit, and another staged path stays staged (a path gone from index and tree fails 'git add')", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", "src/a.ts, src/gone.ts"], ["T2", "src/b.ts"]]);
    write(repo.dir, "src/gone.ts", "old\n");
    write(repo.dir, "src/other.ts", "old\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "base");
    await repo.git("rm", "-q", "src/gone.ts");
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/other.ts", "new\n");
    await repo.git("add", "src/other.ts");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /could not stage/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "src/a.ts", "src/gone.ts"].sort());
    assert.deepEqual(await stagedFiles(repo), ["src/other.ts"]);
  });
});

test("--landed marks a task done whose work another commit already carried, in a status-only commit under a derived subject", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/a.ts", "work\n");
    await repo.git("add", "src/a.ts");
    await repo.git("commit", "-m", "landed elsewhere");
    const sha = (await repo.git("rev-parse", "HEAD")).stdout.trim();

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1", "--landed", sha.slice(0, 7)]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^committed: [0-9a-f]{7,}\nsubject: chore\(viber\): record T1 done, landed in [0-9a-f]{7,}\nprogress: 1\/2\n$/);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL]);
    assert.match(readStatus(repo), /^done: T1$/m);
    assert.match((await repo.git("log", "-1", "--format=%b")).stdout, new RegExp(`Refs: ${PLAN_REL} task T1 landed ${sha}`));
  });
});

test("--repair commits a fix in a file no task's map names, under a derived subject and with the plan untouched", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "src/legacy.ts", "the regression the suite caught\n");
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, ["--repair", PLAN_REL, "2", "src/legacy.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^committed: [0-9a-f]{7,}\n/);
    assert.match(result.stdout, /^subject: fix\(viber\): post-test repair \(round 2\)$/m);
    assert.match(result.stdout, /^progress: unchanged$/m);

    assert.equal((await subjects(repo))[0], "fix(viber): post-test repair (round 2)");
    assert.deepEqual(await committedFiles(repo), ["src/legacy.ts"]);
    assert.match((await repo.git("log", "-1", "--format=%b")).stdout, /Refs: docs\/_specs\/\S+ post-test fix 2/);
    assert.equal(readStatus(repo), before);
  });
});

test("--chore derives its subject from the paths, so the orchestrator composes no commit subject here either", async () => {
  const cases: Array<[files: string[], subject: string]> = [
    [["CLAUDE.md"], "chore(viber): update project memory"],
    [["src/CLAUDE.md"], "chore(viber): update project memory"],
    [[".claude/rules/naming.md"], "chore(viber): update project rules"],
    [["CLAUDE.md", ".claude/rules/naming.md"], "chore(viber): update project memory and rules"],
    [["docs/notes.md"], "chore(viber): update project knowledge"],
  ];

  for (const [files, subject] of cases) {
    await withGitRepo(async (repo) => {
      await seed(repo);
      for (const f of files) write(repo.dir, f, "written by the close\n");

      const result = await run(repo.dir, repo.env, ["--chore", PLAN_REL, ...files]);
      assert.equal(result.status, 0, `${files.join(",")} -> stderr: ${result.stderr}`);
      assert.match(result.stdout, /^committed: [0-9a-f]{7,}\n/);
      assert.match(result.stdout, new RegExp(`^subject: ${subject.replace(/[()]/g, "\\$&")}$`, "m"));
      assert.equal((await subjects(repo))[0], subject);
      assert.deepEqual(await committedFiles(repo), [...files, STATUS_REL].sort());
    });
  }
});

test("a task commit carries a staged deletion and a staged exec bit of its own files, and still leaves a file staged before the run out of it", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", "src/a.ts, src/old.ts, scripts/run.sh"]]);
    await repo.git("config", "core.fileMode", "false");
    write(repo.dir, "src/old.ts", "old\n");
    write(repo.dir, "scripts/run.sh", "echo run\n");
    await repo.git("add", "--", "src/old.ts", "scripts/run.sh");
    await repo.git("commit", "-m", "pre-existing files");
    write(repo.dir, "src/a.ts", "work\n");
    await repo.git("rm", "-q", "--", "src/old.ts");
    await repo.git("update-index", "--chmod=+x", "--", "scripts/run.sh");
    write(repo.dir, "src/PRESTAGED.ts", "staged by the user before the build\n");
    await repo.git("add", "--", "src/PRESTAGED.ts");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [STATUS_REL, "scripts/run.sh", "src/a.ts", "src/old.ts"].sort());
    assert.equal((await repo.git("ls-tree", "HEAD", "--", "src/old.ts")).stdout, "");
    assert.equal(await headMode(repo, "scripts/run.sh"), "100755");
    assert.deepEqual(await stagedFiles(repo), ["src/PRESTAGED.ts"]);
  });
});

const LONG_TASK_FORMS: Array<[form: string, arrange: (repo: GitRepo) => Promise<string[]>]> = [
  [
    "a plain task commit",
    async (repo) => {
      writeMany(repo);
      return [PLAN_REL, "T1"];
    },
  ],
  [
    "--landed",
    async (repo) => {
      writeMany(repo);
      await repo.git("add", "-A");
      await repo.git("commit", "-m", "landed elsewhere");
      return [PLAN_REL, "T1", "--landed", (await repo.git("rev-parse", "HEAD")).stdout.trim()];
    },
  ],
];

for (const [form, arrange] of LONG_TASK_FORMS) {
  test(`${form} of a task whose Files list runs past ${CMDLINE_CAP} chars records the task done (one git call per whole list fails on Windows with 'Argument list too long')`, { timeout: LONG_LIST_TIMEOUT }, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo, [["T1", MANY_PATHS.join(", ")]]);
      const args = await arrange(repo);

      const result = await run(repo.dir, cappedGitEnv(repo), args, LONG_LIST_TIMEOUT);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match((await repo.git("show", `HEAD:${STATUS_REL}`)).stdout, /^done: T1$/m);
    });
  });
}

test("--e2e run from a subdirectory commits a cwd-relative path at its real path, never moved to the root, and another staged path stays staged", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "pkg/README.md", "pkg\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "pkg");
    write(repo.dir, "pkg/tests/e2e/a.spec.ts", "spec\n");
    write(repo.dir, "pkg/README.md", "pkg, staged\n");
    await repo.git("add", "--", "pkg/README.md");

    const result = await run(path.join(repo.dir, "pkg"), repo.env, ["--e2e", "tests/e2e/a.spec.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), ["pkg/tests/e2e/a.spec.ts"]);
    assert.equal((await repo.git("ls-tree", "HEAD", "--", "tests")).stdout, "");
    assert.deepEqual(await stagedFiles(repo), ["pkg/README.md"]);
  });
});

/** A `git` function that holds .git/index.lock around the first `failures` "git add"
 *  calls, so the real git refuses them the way a concurrent writer makes it. */
function lockedAddEnv(repo: GitRepo, failures: number): Record<string, string> {
  const gitDir = path.join(repo.dir, ".git").replace(/\\/g, "/");
  const file = path.join(repo.dir, ".git", "index-lock-shim.sh");
  fs.writeFileSync(path.join(repo.dir, ".git", "add-calls.txt"), "");
  fs.writeFileSync(
    file,
    [
      "git() {",
      '  if [ "$1" = add ]; then',
      `    echo x >> "${gitDir}/add-calls.txt"`,
      `    if [ "$(wc -l < "${gitDir}/add-calls.txt")" -le ${failures} ]; then`,
      `      : > "${gitDir}/index.lock"`,
      '      command git "$@"',
      "      local rc=$?",
      `      rm -f "${gitDir}/index.lock"`,
      "      return $rc",
      "    fi",
      "  fi",
      '  command git "$@"',
      "}",
      "",
    ].join("\n"),
  );
  return { ...repo.env, BASH_ENV: file.replace(/\\/g, "/") };
}

test("a tracked Files path whose git add fails ends the call with exit 5, status.md restored and no commit made (the task would be recorded done with part of its work uncommitted)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, [["T1", "src/a.ts, src/c.ts"]]);
    write(repo.dir, "src/a.ts", "first\n");
    write(repo.dir, "src/c.ts", "first\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "tracked");
    write(repo.dir, "src/a.ts", "work\n");
    write(repo.dir, "src/c.ts", "work\n");
    const before = readStatus(repo);

    const result = await run(repo.dir, lockedAddEnv(repo, 2), [PLAN_REL, "T1"]);
    assert.equal(result.status, 5, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /src\/a\.ts/);

    assert.equal(readStatus(repo), before);
    assert.doesNotMatch(readStatus(repo), /^done: T1$/m);
    assert.deepEqual(await subjects(repo), ["tracked", "seed"]);
  });
});

test("--drop deletes an untracked, unignored file no task or extras file lists, prints its dropped line and exits 0, leaving the index, status.md and history alone", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo);
    write(repo.dir, "scratch.txt", "debug\n");
    const before = readStatus(repo);

    const result = await run(repo.dir, repo.env, ["--drop", PLAN_REL, "scratch.txt"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "dropped: scratch.txt\n");
    assert.equal(result.stderr, "");
    assert.equal(fs.existsSync(path.join(repo.dir, "scratch.txt")), false);
    assert.deepEqual(await stagedFiles(repo), []);
    assert.equal(readStatus(repo), before);
    assert.deepEqual(await subjects(repo), ["seed"]);
  });
});

test("--leftovers commits the unexplained paths in one commit under the --outside subject and footer with one Leftover line each, linking a path to the lowest-numbered task whose note names it", async () => {
  await withGitRepo(async (repo) => {
    await seedLeftovers(repo);
    write(repo.dir, `${RUN_DIR}/work/T10-coder.md`, "- also lib/x.ts\n");
    write(repo.dir, `${RUN_DIR}/work/T3-extra.md`, "lib/x.ts\n");
    write(repo.dir, "lib/x.ts", "changed after its commit\n");
    write(repo.dir, "tools/y.txt", "a tool output\n");

    const result = await runLeftovers(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const sha = await headSha(repo);
    assert.equal(result.stdout, `committed: ${sha}\nleft: none\n`);
    assert.deepEqual(await subjects(repo), [OUTSIDE_SUBJECT, "seed"]);
    assert.deepEqual(await committedFiles(repo), ["lib/x.ts", "tools/y.txt"]);
    assert.equal(
      (await repo.git("log", "-1", "--format=%b")).stdout.trim(),
      [
        "Leftover: lib/x.ts | written by T3, changed after its commit or outside its Files",
        `Leftover: tools/y.txt | ${NO_NOTE_REASON}`,
        "",
        `Refs: ${PLAN_REL} outside the plan`,
      ].join("\n"),
    );
    assert.equal(
      readOutcome(repo),
      [
        "Build summary.",
        "",
        "## Leftovers",
        `lib/x.ts: written by T3, changed after its commit or outside its Files - committed ${sha}`,
        `tools/y.txt: ${NO_NOTE_REASON} - committed ${sha}`,
        "",
        "Drift: none",
        "",
      ].join("\n"),
    );
  });
});

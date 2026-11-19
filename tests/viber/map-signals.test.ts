/*
 * map-signals.test.ts - proves map-signals.sh's `sh map-signals.sh <ws>`
 * contract (C3): every fenced bash block of the lens's signals file is run in
 * the target root with `<scope>` substituted, and replaced in `<ws>/signals.md`
 * by a fenced text block (its stdout, `empty`, or its stdout then an `error:`
 * line); the prose outside the blocks stays verbatim; `## Fix commits` closes
 * the file; stdout is the `NEXT: mapper` block; a missing workspace or run file
 * exits 2 with one `error:` line.
 *
 * map-signals.sh is `#!/bin/sh` and the skill invokes it as
 * `sh "${CLAUDE_SKILL_DIR}/scripts/map-signals.sh" ...`, so every case runs
 * through forEachShell("posix", ...) via opts.shell. Each case builds its own
 * throwaway repo and workspace; no case shares state with another. The signals
 * file of a case is its own small fixture, never a shipped lens file.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/map-signals.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import { SUT, assertPosix, lines, frame, run } from "./map-signals-fixture.ts";

const DAY_MS = 24 * 3600 * 1000;

/** One fenced bash block of a signals file, fence lines included. */
function bash(command: string): string[] {
  return ["```bash", command, "```"];
}

/** The fenced text block that replaces a bash block. */
function text(...rows: string[]): string[] {
  return ["```text", ...rows, "```"];
}

function signalsOf(ws: string): string {
  return fs.readFileSync(path.join(ws, "signals.md"), "utf-8");
}

async function commitAt(repo: GitRepo, daysAgo: number, message: string): Promise<string> {
  const date = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  const env = { ...repo.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  const file = `${message.replace(/\W+/g, "-")}.txt`;
  fs.writeFileSync(path.join(repo.dir, file), `${message}\n`);
  const add = await runScript("git", ["add", file], { cwd: repo.dir, env });
  assert.equal(add.status, 0, `git add failed: ${add.stderr}`);
  const commit = await runScript("git", ["commit", "-q", "-m", message], { cwd: repo.dir, env });
  assert.equal(commit.status, 0, `git commit failed: ${commit.stderr}`);
  const head = await repo.git("log", "-1", "--format=%h");
  return head.stdout.trim();
}

const SCOPE_ROWS: [string, string][] = [
  ["diff", "."],
  ["repo", "."],
  ["src/my app", "src/my app"],
];

for (const [scope, substituted] of SCOPE_ROWS) {
  test(`on the scope ${scope} a block runs in the target root with <scope> read as ${substituted} and is replaced by its output`, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        const ws = frame(repo, ["# Signals", ...bash("printf '%s\\n' '<scope>'; basename \"$(pwd)\"")], { scope });
        const result = await run(shell, repo, ws);
        assert.equal(result.status, 0, `stderr=${result.stderr}`);
        const expected = lines(["# Signals", ...text(substituted, path.basename(repo.dir)), "", "## Fix commits", "none"]);
        assert.equal(signalsOf(ws), expected);
      });
    });
  });
}

test("a block ending with exit 1 and empty stderr reads empty in a repository with a commit (a grep that matched nothing)", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await commitAt(repo, 5, "feat: seed");
      const ws = frame(repo, bash("exit 1"), { base: "HEAD" });
      const result = await run(shell, repo, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.ok(signalsOf(ws).startsWith(lines(text("empty"))), signalsOf(ws));
    });
  });
});

test("a block ending with exit 1 and a stderr line reads its stdout, then an error line (only an empty stderr makes exit 1 a miss)", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await commitAt(repo, 5, "feat: seed");
      const ws = frame(repo, bash("echo oops >&2; exit 1"), { base: "HEAD" });
      const result = await run(shell, repo, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.ok(signalsOf(ws).startsWith(lines(text("error: exit 1: oops"))), signalsOf(ws));
    });
  });
});

test("a failing block reads its stdout lines, then the first stderr line as an error line, when the repository has a commit", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await commitAt(repo, 5, "feat: seed");
      const ws = frame(repo, bash("echo partial; echo boom >&2; echo second >&2; exit 3"), { base: "HEAD" });
      const result = await run(shell, repo, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.ok(signalsOf(ws).startsWith(lines(text("partial", "error: exit 3: boom"))), signalsOf(ws));
    });
  });
});

test("a failing block reads empty when the run file reads Base: none, even in a repository with a commit", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await commitAt(repo, 5, "feat: seed");
      const ws = frame(repo, bash("echo boom >&2; exit 3"), { base: "none" });
      const result = await run(shell, repo, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.ok(signalsOf(ws).startsWith(lines(text("empty"))), signalsOf(ws));
    });
  });
});

test("a failing block reads empty in a repository with no commit, whatever the run file's base reads", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      const ws = frame(repo, bash("echo boom >&2; exit 3"), { base: "HEAD" });
      const result = await run(shell, repo, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.ok(signalsOf(ws).startsWith(lines(text("empty"))), signalsOf(ws));
    });
  });
});

test("the prose and the non-bash fences of the signals file stay verbatim around the replaced blocks, a <scope> in prose included", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      const prose = [
        "# Bugs lens map signals",
        "Rank by `churn`, scope <scope> stays here.",
        "",
        "Fix history:",
        ...bash("echo first"),
        "",
        "A note block:",
        "```text",
        "keep me as is",
        "```",
        "Last words.",
      ];
      const ws = frame(repo, prose);
      const result = await run(shell, repo, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      const expected = lines([
        "# Bugs lens map signals",
        "Rank by `churn`, scope <scope> stays here.",
        "",
        "Fix history:",
        ...text("first"),
        "",
        "A note block:",
        "```text",
        "keep me as is",
        "```",
        "Last words.",
        "",
        "## Fix commits",
        "none",
      ]);
      assert.equal(signalsOf(ws), expected);
    });
  });
});

test("Fix commits lists the fix commits of the last 12 months newest first as hash and subject, and leaves out an older fix and a non-fix subject", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await commitAt(repo, 400, "fix: ancient crash");
      await commitAt(repo, 10, "feat: add the export");
      const recent = await commitAt(repo, 5, "fix: recent crash");
      const reverted = await commitAt(repo, 2, "Revert the export");
      const ws = frame(repo, ["# Signals"], { base: "HEAD" });
      const result = await run(shell, repo, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      const expected = lines(["# Signals", "", "## Fix commits", `${reverted} Revert the export`, `${recent} fix: recent crash`]);
      assert.equal(signalsOf(ws), expected);
    });
  });
});

test("Fix commits reads none when no commit of the last 12 months is a fix", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await commitAt(repo, 5, "feat: add the export");
      const ws = frame(repo, ["# Signals"], { base: "HEAD" });
      const result = await run(shell, repo, ws);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.equal(signalsOf(ws), lines(["# Signals", "", "## Fix commits", "none"]));
    });
  });
});

/** [what is missing, the workspace argument, the directory that exists]. */
const MISSING_ROWS: [string, string, string][] = [
  ["workspace directory", "gone", "."],
  ["run file", "no-run", "no-run"],
];

for (const [what, dir, existing] of MISSING_ROWS) {
  test(`a missing ${what} exits 2 with one error: line on stderr and nothing on stdout`, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        fs.mkdirSync(path.join(repo.dir, existing), { recursive: true });
        const ws = slash(path.join(repo.dir, dir));
        const result = await runScript(SUT, [ws], { shell, cwd: repo.dir, env: repo.env });
        assert.equal(result.status, 2);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /^error: [^\n]+\n?$/);
      });
    });
  });
}

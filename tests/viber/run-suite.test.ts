/*
 * run-suite.test.ts - proves viber/scripts/run-suite.sh's contract: `run` executes a
 * test command file from the repository root into its log and ends the log on
 * `exit=<code>`, and `wait` reports that exit line once a log at least as new as the
 * command file holds it.
 *
 * Every case builds its own throwaway git repository, because the script resolves the
 * repository root itself and keeps its files under `.temp/viber/test-runner/` there.
 * The command files are tiny shell scripts the case writes; the staleness cases set
 * file times explicitly with `utimes`, so no case depends on how fast the machine is.
 * The cases that expect `wait` to run out of time set RUN_SUITE_WAIT=1.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/run-suite.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/run-suite.sh");

const REPORT = "docs/_specs/x/work/T11-report.md";
const CMD = ".temp/viber/test-runner/T11-report.cmd";
const LOG = ".temp/viber/test-runner/T11-report.log";

/** Writes `body` as the command file of the report, creating its directory. */
function writeCommand(dir: string, body: string): void {
  fs.mkdirSync(path.join(dir, path.dirname(CMD)), { recursive: true });
  fs.writeFileSync(path.join(dir, CMD), body);
}

function run(repo: { dir: string; env: Record<string, string> }, args: string[], cwd = repo.dir, wait = "1") {
  return runScript(SUT, args, { cwd, shell: "bash", env: { ...repo.env, RUN_SUITE_WAIT: wait } });
}

test("run executes the command file from the repository root and ends the log on its exit code", async () => {
  await withGitRepo(async (repo) => {
    fs.writeFileSync(path.join(repo.dir, "marker.txt"), "at-root\n");
    fs.mkdirSync(path.join(repo.dir, "sub"));
    writeCommand(repo.dir, "cat marker.txt\necho out\necho err >&2\nexit 3\n");

    const result = await run(repo, ["run", REPORT, CMD], path.join(repo.dir, "sub"));

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^log: .*\/\.temp\/viber\/test-runner\/T11-report\.log\n$/);
    assert.equal(fs.readFileSync(path.join(repo.dir, LOG), "utf-8"), "at-root\nout\nerr\nexit=3\n");
  });
});

test("run deletes an earlier log instead of appending to it", async () => {
  await withGitRepo(async (repo) => {
    writeCommand(repo.dir, "echo fresh\n");
    fs.writeFileSync(path.join(repo.dir, LOG), "stale\nexit=1\n");

    const result = await run(repo, ["run", REPORT, CMD]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(fs.readFileSync(path.join(repo.dir, LOG), "utf-8"), "fresh\nexit=0\n");
  });
});

test("run puts the exit line on a line of its own when the command output ends without a newline", async () => {
  await withGitRepo(async (repo) => {
    writeCommand(repo.dir, "printf partial\n");

    const result = await run(repo, ["run", REPORT, CMD]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(fs.readFileSync(path.join(repo.dir, LOG), "utf-8"), "partial\nexit=0\n");
  });
});

test("wait prints the log path and the exit line of a log that run just finished", async () => {
  await withGitRepo(async (repo) => {
    writeCommand(repo.dir, "echo out\nexit 3\n");
    const ran = await run(repo, ["run", REPORT, CMD]);
    assert.equal(ran.status, 0, `stderr: ${ran.stderr}`);

    const result = await run(repo, ["wait", REPORT]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^log: .*\/\.temp\/viber\/test-runner\/T11-report\.log\nexit=3\n$/);
  });
});

test("wait counts a log with the same timestamp as its command file as current", async () => {
  await withGitRepo(async (repo) => {
    writeCommand(repo.dir, "echo out\n");
    fs.mkdirSync(path.join(repo.dir, path.dirname(LOG)), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, LOG), "out\nexit=0\n");
    const same = new Date("2020-01-01T00:00:00Z");
    fs.utimesSync(path.join(repo.dir, CMD), same, same);
    fs.utimesSync(path.join(repo.dir, LOG), same, same);

    const result = await run(repo, ["wait", REPORT]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^log: .*T11-report\.log\nexit=0\n$/);
  });
});

test("wait never reads an earlier run's log left at the same path", async () => {
  await withGitRepo(async (repo) => {
    writeCommand(repo.dir, "echo out\n");
    fs.mkdirSync(path.join(repo.dir, path.dirname(LOG)), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, LOG), "old\nexit=0\n");
    fs.utimesSync(path.join(repo.dir, LOG), new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"));
    fs.utimesSync(path.join(repo.dir, CMD), new Date("2020-01-01T00:00:05Z"), new Date("2020-01-01T00:00:05Z"));

    const result = await run(repo, ["wait", REPORT]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^log: .*T11-report\.log\nNEXT: wait\n$/);
  });
});

test("wait that runs out of time before any exit line prints the log path and NEXT: wait", async () => {
  await withGitRepo(async (repo) => {
    writeCommand(repo.dir, "echo out\n");
    fs.mkdirSync(path.join(repo.dir, path.dirname(LOG)), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, LOG), "still running\n");

    const result = await run(repo, ["wait", REPORT]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^log: .*T11-report\.log\nNEXT: wait\n$/);
  });
});

/** Each case: what is missing -> the arguments; no case writes a command file. */
const USAGE: Array<[string, string[]]> = [
  ["no mode", []],
  ["an unknown mode", ["bogus", REPORT]],
  ["run without a report path", ["run"]],
  ["run without a command file", ["run", REPORT]],
  ["run with a command file that does not exist", ["run", REPORT, CMD]],
  ["wait without a report path", ["wait"]],
  ["wait for a report with no command file", ["wait", REPORT]],
];

for (const [label, args] of USAGE) {
  test(`${label} exits 2 and prints nothing on stdout`, async () => {
    await withGitRepo(async (repo) => {
      const result = await run(repo, args);
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
    });
  });
}

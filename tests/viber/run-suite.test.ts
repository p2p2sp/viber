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
import { withGitRepo } from "../harness/tmp.ts";
import { REPORT, CMD, LOG, writeCommand, run } from "./run-suite-fixture.ts";

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

/*
 * run-summary.test.ts - proves viber/scripts/run-summary.sh's contract: with no
 * argument it prints the run's start mark, with an epoch argument it prints how long
 * ago that mark was taken, and with a run directory after the mark it goes on to the
 * run's token report: it reads the agent transcripts a run left under the Claude Code
 * projects directory and prints one `tokens:` line per agent role and model, then the
 * line saying what is not counted, or the single `tokens: unavailable` line.
 *
 * Clock properties. It exits 0 for the mark and for the elapsed line, because it runs
 * as a `!` preload where a non-zero exit aborts the entire skill load - so every
 * unusable mark (empty, non-numeric, in the future) is the VALUE `elapsed: unknown`
 * rather than an error, and the orchestrator drops the line instead of inventing a
 * duration. And the clock touches no file, so the caller's cwd cannot change a byte of
 * its output. The elapsed cases pin the clock: a stub `date` on PATH prints a fixed
 * epoch second, so a loaded machine delaying the spawn cannot move a duration by a
 * second. Only the cases about the real start mark read the real clock.
 *
 * Token properties. A transcript counts only when its first line names the run
 * directory, so another run's agents never leak into the sums. A message id written on
 * several lines is one message: the last line's usage counts. The role comes from the
 * meta file beside the transcript, `unknown` when it cannot be read. Unreadable
 * transcripts never fail the build: the script says `unavailable` and exits 0, and
 * only an unusable argument exits 2. The closeout agent and the `<synthetic>` lines of
 * an API error never reach a row, and a transcript last written before the day the run
 * key names is never opened. Every token report follows the `elapsed:` line; the token
 * tests read the lines after it.
 *
 * A run whose status.md holds a `refused:` key ends on one `refused:` line per path
 * a task commit refused, after the rounds line: the lines run-notes.sh lists, so a
 * close with no closeout still shows them. Every other report ends on a `rounds:` line: the plan review transcripts (plan-judge, one
 * per review round) naming the path of the `planned:` line of the run's
 * plan.md, counted whenever they were written, or the reason that count is unavailable.
 *
 * After the build rows come the planning rows: one `tokens:` line per role and model
 * of the plan-judge, adr-screener, plan-surveyor, plan-architect and plan-author transcripts
 * naming the same `planned:` path, whenever written, each transcript counted once.
 *
 * The run key opens with a date long past, so every fixture written now is newer
 * than it on any machine clock.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/run-summary.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withTempDir } from "../harness/tmp.ts";
import {
  SUT,
  NOW,
  MARK,
  runAtNow,
  KEY,
  SONNET,
  NOT_COUNTED,
  prompt,
  assistant,
  seed,
  transcript,
  run,
  report,
  stdoutLines,
  reportLines,
  PLANNED,
  writePlan,
  review,
} from "./run-summary-fixture.ts";

// --- the clock: no argument and the mark alone ---

function runClock(args: string[] = [], cwd?: string) {
  return runScript(SUT, args, { cwd, shell: "bash" });
}

/** The start mark the script itself hands out, as a number. */
async function startMark(): Promise<number> {
  const result = await runClock();
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const mark = Number(result.stdout.trim().replace("started: ", ""));
  assert.ok(Number.isInteger(mark), `not an epoch: ${result.stdout}`);
  return mark;
}

/** Runs the elapsed mode for a mark `seconds` before NOW. */
function elapsed(seconds: number) {
  return runAtNow([String(NOW - seconds)]);
}

test("no argument prints one `started:` line carrying the current epoch second", async () => {
  const before = Math.floor(Date.now() / 1000);
  const result = await runClock();
  const after = Math.floor(Date.now() / 1000);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout.trim().split("\n").length, 1);
  assert.match(result.stdout, /^started: \d+\n$/);

  const mark = Number(result.stdout.trim().slice("started: ".length));
  assert.ok(mark >= before && mark <= after, `${mark} outside [${before}, ${after}]`);
});

/** Each case: seconds ago -> the duration it reads as. */
const DURATIONS: Array<[number, string]> = [
  [0, "elapsed: 0s"],
  [7, "elapsed: 7s"],
  [59, "elapsed: 59s"],
  [60, "elapsed: 1m 00s"],
  [65, "elapsed: 1m 05s"],
  [3599, "elapsed: 59m 59s"],
  [3600, "elapsed: 1h 00m 00s"],
  [8043, "elapsed: 2h 14m 03s"],
  [90061, "elapsed: 25h 01m 01s"],
];

for (const [seconds, expected] of DURATIONS) {
  test(`${seconds} seconds ago reads as ${expected.slice("elapsed: ".length)}`, async () => {
    const result = await elapsed(seconds);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `${expected}\n`);
  });
}

test("the largest non-zero unit comes first and hours never roll over into days", async () => {
  // Epoch 0 is decades back: the hour count runs into six digits and stays an
  // hour count, and a leading-zero-free `10#` arithmetic never reads it as octal.
  const result = await runClock(["0"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /^elapsed: \d{5,}h \d{2}m \d{2}s\n$/);
});

test("a leading zero is decimal, never octal", async () => {
  const padded = await runAtNow([`0${NOW - 8043}`]);
  assert.equal(padded.status, 0, `stderr: ${padded.stderr}`);
  assert.equal(padded.stdout, "elapsed: 2h 14m 03s\n");
});

/** Every argument that cannot be a mark, including the two shapes a lost
 *  context produces: an unsubstituted placeholder and the script's own
 *  `started: unknown` handed straight back. */
const UNUSABLE: Array<[string, string]> = [
  ["empty", ""],
  ["non-numeric", "abc"],
  ["an unsubstituted placeholder", "<started>"],
  ["the word unknown", "unknown"],
  ["a fractional epoch", "1750000000.5"],
  ["a negative number", "-1750000000"],
  ["a whole `started:` line", "started: 1750000000"],
];

for (const [label, argument] of UNUSABLE) {
  test(`${label} is \`elapsed: unknown\`, not an error`, async () => {
    const result = await runClock([argument]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "elapsed: unknown\n");
  });
}

test("a mark in the future is unknown rather than a negative duration", async () => {
  const result = await runClock([String(await startMark() + 600)]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, "elapsed: unknown\n");
});

test("the exit is 0 whatever the argument, because a preload that fails takes the skill load with it", async () => {
  for (const args of [[], [""], ["abc"], ["0"], [String(Math.floor(Date.now() / 1000) + 99999)]]) {
    const result = await runClock(args);
    assert.equal(result.status, 0, `args ${JSON.stringify(args)} -> stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
  }
});

test("the cwd is irrelevant: a temp directory outside the repository reads the same clock", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const started = await runClock([], dir);
    assert.equal(started.status, 0, `stderr: ${started.stderr}`);
    assert.match(started.stdout, /^started: \d+\n$/);

    const result = await runAtNow([String(NOW - 65)], dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "elapsed: 1m 05s\n");
  });
});

// --- the token report: fixtures ---
const OPUS = "claude-opus-4";

/** An assistant line carrying no usage block. */
function assistantWithoutUsage(id: string, model: string): string {
  return JSON.stringify({ type: "assistant", message: { model, id, type: "message", role: "assistant", content: [] } });
}

/** The `tokens:` lines of a report, whatever lines follow them. */
function tokenLines(stdout: string): string[] {
  return stdoutLines(stdout).filter((line) => line.startsWith("tokens:"));
}

// --- DoD.1: one line per role and model, summed over sessions, a message id once ---

test("a run whose agents left transcripts in two sessions on two models prints one line per role and model, sorted, each message id counted once with its last usage", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    transcript(fx, "s2", "a0", "viber:task-reviewer", [
      prompt(fx.runPrompt),
      assistant("m5", OPUS, { in: 1, out: 1, cacheRead: 1, cacheWrite: 1 }),
    ]);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 10, out: 1, cacheRead: 100, cacheWrite: 5 }),
      assistant("m1", SONNET, { in: 10, out: 20, cacheRead: 100, cacheWrite: 5 }),
      assistant("m2", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    transcript(fx, "s2", "a2", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m3", SONNET, { in: 2, out: 3, cacheRead: 4, cacheWrite: 5 }),
      assistant("m4", OPUS, { in: 7, out: 8, cacheRead: 9, cacheWrite: 10 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:task-coder claude-opus-4 in 7 out 8 cache-read 9 cache-write 10",
      "tokens: viber:task-coder claude-sonnet-4 in 13 out 25 cache-read 107 cache-write 14",
      "tokens: viber:task-reviewer claude-opus-4 in 1 out 1 cache-read 1 cache-write 1",
      NOT_COUNTED,
    ]);
  });
});

// --- DoD.2: a transcript of another run adds nothing ---

test("a transcript whose first line names another run directory adds nothing to any sum", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    transcript(fx, "s1", "a2", "viber:task-coder", [
      prompt("docs/_specs/2026-01-01-00-00-00_other-run"),
      assistant("m2", SONNET, { in: 100, out: 200, cacheRead: 300, cacheWrite: 400 }),
    ]);
    transcript(fx, "s1", "a3", "viber:task-coder", [
      JSON.stringify({ type: "user", message: { content: "start" } }),
      assistant("m3", SONNET, { in: 1000, out: 2000, cacheRead: 3000, cacheWrite: 4000 }),
      JSON.stringify({ type: "user", message: { content: `later mention of ${fx.runPrompt}/` } }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      NOT_COUNTED,
    ]);
  });
});

test("a prompt naming the bare run directory counts, and one naming a directory whose name only starts with the run key does not (a dispatch line `run: <dir>` carries no trailing slash)", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    transcript(fx, "s1", "a1", "viber:test-runner", [
      JSON.stringify({ type: "user", message: { role: "user", content: `run: ${fx.runPrompt}\nreport: elsewhere` } }),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    transcript(fx, "s1", "a2", "viber:test-runner", [
      JSON.stringify({ type: "user", message: { role: "user", content: `run: ${fx.runPrompt}` } }),
      assistant("m2", SONNET, { in: 10, out: 20, cacheRead: 30, cacheWrite: 40 }),
    ]);
    transcript(fx, "s1", "a3", "viber:test-runner", [
      prompt(`${fx.runPrompt}-two`),
      assistant("m3", SONNET, { in: 100, out: 200, cacheRead: 300, cacheWrite: 400 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:test-runner claude-sonnet-4 in 11 out 22 cache-read 33 cache-write 44",
      NOT_COUNTED,
    ]);
  });
});

test("a transcript of the closeout agent naming the run adds no row (the last line says it is not counted, so an earlier refused closeout of a resumed build must not appear above it)", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    transcript(fx, "s1", "a2", "viber:closeout", [
      prompt(fx.runPrompt),
      assistant("m2", SONNET, { in: 100, out: 200, cacheRead: 300, cacheWrite: 400 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      NOT_COUNTED,
    ]);
  });
});

test("an assistant line of the model <synthetic> adds no row and no count (Claude Code writes one for an API error, with every usage number zero)", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
      assistant("m2", "<synthetic>", { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }),
    ]);
    transcript(fx, "s1", "a2", "viber:task-coder", [prompt(fx.runPrompt), assistantWithoutUsage("m3", "<synthetic>")]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      NOT_COUNTED,
    ]);
  });
});

test("a transcript last written before the day the run key names is not counted, even when it names the run (it is never opened)", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    transcript(fx, "s0", "a2", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m2", SONNET, { in: 100, out: 200, cacheRead: 300, cacheWrite: 400 }),
    ]);
    const old = new Date("2019-06-01T00:00:00Z");
    fs.utimesSync(path.join(fx.config, "projects", "proj", "s0", "subagents", "agent-a2.jsonl"), old, old);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      NOT_COUNTED,
    ]);
  });
});

// --- DoD.3: no meta file, role unknown ---

test("a counted transcript with no meta file beside it is summed under the role unknown", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    transcript(fx, "s1", "a1", null, [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 5, out: 6, cacheRead: 7, cacheWrite: 8 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: unknown claude-sonnet-4 in 5 out 6 cache-read 7 cache-write 8",
      NOT_COUNTED,
    ]);
  });
});

// --- DoD.4: the not-counted line closes the report ---

test("the last tokens line of a report is the not-counted line", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", OPUS, { in: 1, out: 1, cacheRead: 1, cacheWrite: 1 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(tokenLines(result.stdout).at(-1), NOT_COUNTED);
  });
});

// --- DoD.5: unavailable, exit 0 ---

test("with no projects directory the report is the single unavailable line and the exit is 0", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    const result = await run(tmp, [MARK, slash(fx.runDir)], { CLAUDE_CONFIG_DIR: slash(path.join(tmp, "missing-config")) });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), ["tokens: unavailable - no projects directory"]);
  });
});

test("with no transcript naming the run the report is the single unavailable line and the exit is 0", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt("docs/_specs/2026-01-01-00-00-00_other-run"),
      assistant("m1", SONNET, { in: 1, out: 1, cacheRead: 1, cacheWrite: 1 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), ["tokens: unavailable - no agent transcript names this run"]);
  });
});

test("a counted transcript holding assistant lines but no readable usage makes the report the single unavailable line", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 1, out: 1, cacheRead: 1, cacheWrite: 1 }),
    ]);
    transcript(fx, "s1", "a2", "viber:task-coder", [prompt(fx.runPrompt), assistantWithoutUsage("m2", SONNET)]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), ["tokens: unavailable - a transcript holds no readable usage"]);
  });
});

// --- DoD.6: argv ---

test("with no argument the output is the start mark and the exit is 0, whatever run directory exists", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    const result = await run(tmp, [], { CLAUDE_CONFIG_DIR: slash(fx.config) });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^started: \d+\n$/);
    assert.equal(result.stderr, "");
  });
});

test("with three arguments the exit is 2, one error line on stderr and nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    const result = await run(tmp, [MARK, slash(fx.runDir), slash(fx.runDir)], {});
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: [^\n]*\n$/);
  });
});

test("with a run directory that does not exist the elapsed line is printed, then the exit is 2 with one error line on stderr", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const result = await run(tmp, [MARK, slash(path.join(tmp, "docs", "_specs", KEY))], {});
    assert.equal(result.status, 2);
    assert.match(result.stdout, /^elapsed: [^\n]*\n$/);
    assert.match(result.stderr, /^error: [^\n]*\n$/);
  });
});

// --- the plan review rounds line closes the report ---

test("a transcript of another review agent type, of a non-review agent or naming another plan path adds no round", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    review(fx, "r1", "viber:plan-judge", PLANNED);
    review(fx, "r2", "viber:outside-plan-review", PLANNED);
    review(fx, "r3", "viber:plan-author", PLANNED);
    review(fx, "r4", "viber:task-coder", PLANNED);
    review(fx, "r5", "viber:plan-judge", "C:/plans/other.md");
    review(fx, "r6", "viber:plan-judge", "C:/plans/p.md.bak");
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(stdoutLines(result.stdout).includes("rounds: plan review 1"), result.stdout);
  });
});

test("a plan.md with no planned line makes the rounds line unavailable", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, null);
    review(fx, "r1", "viber:plan-judge", PLANNED);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(stdoutLines(result.stdout).at(-1), "rounds: plan review unavailable - no planned line in plan.md");
  });
});

test("a planned line with no review transcript naming the path makes the rounds line unavailable", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    review(fx, "r1", "viber:plan-judge", "C:/plans/other.md");
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      stdoutLines(result.stdout).at(-1),
      "rounds: plan review unavailable - no review transcript names the plan",
    );
  });
});

test("with no projects directory the unavailable token line is followed by the no projects directory rounds line", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    const result = await run(tmp, [MARK, slash(fx.runDir)], { CLAUDE_CONFIG_DIR: slash(path.join(tmp, "missing-config")) });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(reportLines(result.stdout), [
      "tokens: unavailable - no projects directory",
      "rounds: plan review unavailable - no projects directory",
    ]);
  });
});

test("with no transcript naming the run the unavailable token line is followed by the rounds line", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    review(fx, "r1", "viber:plan-judge", PLANNED, [
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(reportLines(result.stdout), [
      "tokens: unavailable - no agent transcript names this run",
      "tokens: viber:plan-judge claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      "rounds: plan review 1",
    ]);
  });
});

// --- the planning rows follow the build rows ---

const OLD = new Date("2019-06-01T00:00:00Z");

test("a transcript of each of the five planning roles naming the planned path adds a row for its role with the summed usage, one older than the run day and one retried dispatch included", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    review(fx, "p1", "viber:plan-judge", PLANNED, [
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    review(fx, "p2", "viber:plan-judge", PLANNED, [
      assistant("m2", SONNET, { in: 10, out: 20, cacheRead: 30, cacheWrite: 40 }),
    ]);
    review(fx, "p6", "viber:plan-surveyor", PLANNED, [
      assistant("m6", SONNET, { in: 17, out: 18, cacheRead: 19, cacheWrite: 20 }),
    ]);
    review(fx, "p7", "viber:adr-screener", PLANNED, [
      assistant("m7", SONNET, { in: 21, out: 22, cacheRead: 23, cacheWrite: 24 }),
    ]);
    review(fx, "p8", "viber:plan-architect", PLANNED, [
      assistant("m9", SONNET, { in: 25, out: 26, cacheRead: 27, cacheWrite: 28 }),
    ]);
    review(fx, "p9", "viber:plan-author", PLANNED, [
      assistant("m10", SONNET, { in: 29, out: 30, cacheRead: 31, cacheWrite: 32 }),
    ]);
    review(fx, "p10", "viber:plan-author", PLANNED, [
      assistant("m11", SONNET, { in: 33, out: 34, cacheRead: 35, cacheWrite: 36 }),
    ]);
    fs.utimesSync(path.join(fx.config, "projects", "proj", "plan", "subagents", "agent-p7.jsonl"), OLD, OLD);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m8", SONNET, { in: 100, out: 200, cacheRead: 300, cacheWrite: 400 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 100 out 200 cache-read 300 cache-write 400",
      "tokens: viber:adr-screener claude-sonnet-4 in 21 out 22 cache-read 23 cache-write 24",
      "tokens: viber:plan-architect claude-sonnet-4 in 25 out 26 cache-read 27 cache-write 28",
      "tokens: viber:plan-author claude-sonnet-4 in 62 out 64 cache-read 66 cache-write 68",
      "tokens: viber:plan-judge claude-sonnet-4 in 11 out 22 cache-read 33 cache-write 44",
      "tokens: viber:plan-surveyor claude-sonnet-4 in 17 out 18 cache-read 19 cache-write 20",
      NOT_COUNTED,
    ]);
  });
});

test("a planning transcript naming both the run directory and the planned path counts once", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    transcript(fx, "plan", "p1", "viber:plan-judge", [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: `Review the plan at ${PLANNED} for ${fx.runPrompt}/ now` },
      }),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:plan-judge claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      NOT_COUNTED,
    ]);
  });
});

test("a planning transcript naming another path adds no row", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    review(fx, "p1", "viber:plan-judge", "C:/plans/other.md", [
      assistant("m2", SONNET, { in: 100, out: 200, cacheRead: 300, cacheWrite: 400 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      NOT_COUNTED,
    ]);
  });
});

test("a planning transcript with no readable usage adds no row", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    review(fx, "p1", "viber:plan-judge", PLANNED, [assistantWithoutUsage("m2", SONNET)]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      NOT_COUNTED,
    ]);
  });
});

test("a run whose plan.md has no planned line adds no planning row", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, null);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    review(fx, "p1", "viber:plan-judge", PLANNED, [
      assistant("m2", SONNET, { in: 100, out: 200, cacheRead: 300, cacheWrite: 400 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      NOT_COUNTED,
    ]);
  });
});

test("the planning rows come after the build rows, sorted by role then model, then the not-counted line and the rounds line", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    review(fx, "p1", "viber:plan-judge", PLANNED, [
      assistant("m2", SONNET, { in: 5, out: 6, cacheRead: 7, cacheWrite: 8 }),
      assistant("m3", OPUS, { in: 9, out: 10, cacheRead: 11, cacheWrite: 12 }),
    ]);
    review(fx, "p2", "viber:adr-screener", PLANNED, [
      assistant("m4", SONNET, { in: 13, out: 14, cacheRead: 15, cacheWrite: 16 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(reportLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      "tokens: viber:adr-screener claude-sonnet-4 in 13 out 14 cache-read 15 cache-write 16",
      "tokens: viber:plan-judge claude-opus-4 in 9 out 10 cache-read 11 cache-write 12",
      "tokens: viber:plan-judge claude-sonnet-4 in 5 out 6 cache-read 7 cache-write 8",
      NOT_COUNTED,
      "rounds: plan review 1",
    ]);
  });
});

test("with a counted transcript holding no readable usage the unavailable token line is followed by the rounds line", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    transcript(fx, "s1", "a1", "viber:task-coder", [prompt(fx.runPrompt), assistantWithoutUsage("m1", SONNET)]);
    review(fx, "r1", "viber:plan-judge", PLANNED);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(reportLines(result.stdout), [
      "tokens: unavailable - a transcript holds no readable usage",
      "rounds: plan review 1",
    ]);
  });
});

// --- the paths task commits refused follow the rounds line ---

/** A landed plan of two tasks, T1 on src/a.ts and T2 on src/b.ts, with a `planned:` line. */
function writeTaskPlan(fx: { runDir: string }): void {
  const task = (id: string, file: string): string[] => ["<!-- TASK -->", `### ${id} - task ${id}`, `- Files: ${file}`, "<!-- /TASK -->", ""];
  fs.writeFileSync(path.join(fx.runDir, "plan.md"), ["---", "source: docs/_specs/x/plan.md", `planned: ${PLANNED}`, "---", "# Plan", "", "## Tasks", "", ...task("T1", "src/a.ts"), ...task("T2", "src/b.ts")].join("\n") + "\n");
}

const STATUS = ["# status", "", "progress: 1/2", "done: T1", "skipped: none", "unreviewed: none", "deferred: none", "closed: none"];

test("a run whose status.md holds a refused: key ends its report on one refused: line per path, after the rounds line, the path whole and its claimant named, whether or not the token report is available (a refused path reaches the final summary of a build whose closeout never runs)", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writeTaskPlan(fx);
    fs.writeFileSync(path.join(fx.runDir, "status.md"), [...STATUS, "refused: T1:src/b.ts T1:lib/my%20shared.ts"].join("\n") + "\n");
    fs.mkdirSync(path.join(fx.runDir, "work"));
    fs.writeFileSync(path.join(fx.runDir, "work", "T2-extra.md"), "lib/my shared.ts\n");
    const refused = ["refused: T1 | src/b.ts | claimed by task T2", "refused: T1 | lib/my shared.ts | claimed by task T2"];

    const none = await report(tmp, fx);
    assert.equal(none.status, 0, none.stderr);
    assert.deepEqual(reportLines(none.stdout), ["tokens: unavailable - no agent transcript names this run", "rounds: plan review unavailable - no review transcript names the plan", ...refused]);

    transcript(fx, "s1", "a1", "viber:task-coder", [prompt(fx.runPrompt), assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 })]);
    const counted = await report(tmp, fx);
    assert.equal(counted.status, 0, counted.stderr);
    assert.deepEqual(reportLines(counted.stdout), ["tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4", NOT_COUNTED, "rounds: plan review unavailable - no review transcript names the plan", ...refused]);

    // The same run named by a path relative to the cwd, as the implementor names it.
    const relative = await run(path.join(tmp, "repo"), [MARK, `docs/_specs/${KEY}`], { CLAUDE_CONFIG_DIR: slash(fx.config) });
    assert.deepEqual(reportLines(relative.stdout).slice(-2), refused, relative.stderr);
  });
});

test("a run with no refused: key, or with one reading none, prints no refused: line, and one whose paths cannot be listed says so in one line (the report never hides that a commit refused a path)", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writeTaskPlan(fx);
    const tail = ["tokens: unavailable - no agent transcript names this run", "rounds: plan review unavailable - no review transcript names the plan"];
    for (const keys of [STATUS, [...STATUS, "refused: none"]]) {
      fs.writeFileSync(path.join(fx.runDir, "status.md"), keys.join("\n") + "\n");
      const result = await report(tmp, fx);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(reportLines(result.stdout), tail, keys[keys.length - 1]);
    }
    // No plan.md: run-notes.sh cannot name a claimant, the key is still there.
    fs.writeFileSync(path.join(fx.runDir, "status.md"), [...STATUS, "refused: T1:src/b.ts"].join("\n") + "\n");
    fs.rmSync(path.join(fx.runDir, "plan.md"));
    const lost = await report(tmp, fx);
    assert.equal(lost.status, 0, lost.stderr);
    assert.deepEqual(reportLines(lost.stdout), ["tokens: unavailable - no agent transcript names this run", "rounds: plan review unavailable - no planned line in plan.md", "refused: unavailable - run-notes.sh could not list the paths the refused: key of status.md holds"]);
  });
});

/*
 * run-tokens.test.ts - proves viber/scripts/run-tokens.sh's contract: it reads the
 * agent transcripts a run left under the Claude Code projects directory and prints
 * the run's token report, one `tokens:` line per agent role and model, then the
 * line saying what is not counted, or the single `tokens: unavailable` line.
 *
 * Properties that carry the design. A transcript counts only when its first line
 * names the run directory, so another run's agents never leak into the sums. A
 * message id written on several lines is one message: the last line's usage
 * counts. The role comes from the meta file beside the transcript, `unknown` when
 * it cannot be read. Unreadable transcripts never fail the build: the script says
 * `unavailable` and exits 0, and only an unusable argument exits 2. The closeout
 * agent and the `<synthetic>` lines of an API error never reach a row, and a
 * transcript last written before the day the run key names is never opened.
 *
 * Every report ends on a `rounds:` line: the plan review transcripts (planner-review
 * and planner-graph-review) naming the path of the `planned:` line of the run's
 * plan.md, counted whenever they were written, or the reason that count is unavailable.
 * The token tests read the `tokens:` lines alone.
 *
 * After the build rows come the planning rows: one `tokens:` line per role and model
 * of the planner-review, planner-spec-review, planner-graph-review, planner-task-review,
 * impact-mapper and adr-screener transcripts naming the same `planned:` path, whenever
 * written, each transcript counted once.
 *
 * The run key opens with a date long past, so every fixture written now is newer
 * than it on any machine clock.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/run-tokens.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withTempDir } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/run-tokens.sh");

const KEY = "2020-01-02-11-25-26_token-report";
const OPUS = "claude-opus-4";
const SONNET = "claude-sonnet-4";
const NOT_COUNTED = "tokens: agents only - the main session and the closeout agent are not counted";

interface Usage {
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
}

/** The first line of a transcript: the prompt that started the agent. */
function prompt(runDir: string): string {
  return JSON.stringify({ type: "user", message: { role: "user", content: `Build the run in ${runDir}/ now` } });
}

/** One assistant line of a transcript, shaped as Claude Code writes it. */
function assistant(id: string, model: string, usage: Usage): string {
  return JSON.stringify({
    type: "assistant",
    message: {
      model,
      id,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "working" }],
      usage: {
        input_tokens: usage.in,
        cache_creation_input_tokens: usage.cacheWrite,
        cache_read_input_tokens: usage.cacheRead,
        cache_creation: { ephemeral_5m_input_tokens: usage.cacheWrite, ephemeral_1h_input_tokens: 0 },
        output_tokens: usage.out,
      },
    },
  });
}

/** An assistant line carrying no usage block. */
function assistantWithoutUsage(id: string, model: string): string {
  return JSON.stringify({ type: "assistant", message: { model, id, type: "message", role: "assistant", content: [] } });
}

interface Fixture {
  config: string;
  runDir: string;
  runPrompt: string;
}

/** A temp tree holding an existing run directory and an empty config directory. */
function seed(tmp: string): Fixture {
  const runDir = path.join(tmp, "repo", "docs", "_specs", KEY);
  fs.mkdirSync(runDir, { recursive: true });
  const config = path.join(tmp, "config");
  fs.mkdirSync(path.join(config, "projects"), { recursive: true });
  return { config, runDir, runPrompt: slash(path.join("docs", "_specs", KEY)) };
}

/** Writes `agent-<id>.jsonl` (and its meta file when `role` is given) in one session. */
function transcript(fx: Fixture, session: string, id: string, role: string | null, lines: string[]): void {
  const dir = path.join(fx.config, "projects", "proj", session, "subagents");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `agent-${id}.jsonl`), lines.join("\n") + "\n");
  if (role !== null) fs.writeFileSync(path.join(dir, `agent-${id}.meta.json`), JSON.stringify({ agentType: role }));
}

function run(tmp: string, args: string[], env: Record<string, string>) {
  return runScript(SUT, args, { cwd: tmp, shell: "bash", env });
}

function report(tmp: string, fx: Fixture) {
  return run(tmp, [slash(fx.runDir)], { CLAUDE_CONFIG_DIR: slash(fx.config) });
}

function stdoutLines(stdout: string): string[] {
  return stdout.split("\n").filter((line) => line !== "");
}

/** The `tokens:` lines of a report, whatever lines follow them. */
function tokenLines(stdout: string): string[] {
  return stdoutLines(stdout).filter((line) => line.startsWith("tokens:"));
}

const PLANNED = "C:/plans/p.md";

/** Writes the run's `plan.md`, with a `planned:` line when `planned` is given. */
function writePlan(fx: Fixture, planned: string | null): void {
  const lines = ["---", "source: docs/_specs/x/plan.md"];
  if (planned !== null) lines.push(`planned: ${planned}`);
  lines.push("---", "# Plan");
  fs.writeFileSync(path.join(fx.runDir, "plan.md"), lines.join("\n") + "\n");
}

/** A transcript of a plan reviewer: its first line, the prompt, and the assistant lines given. */
function review(fx: Fixture, id: string, role: string, namedPath: string, lines: string[] = []): void {
  transcript(fx, "plan", id, role, [
    JSON.stringify({ type: "user", message: { role: "user", content: `Review the plan at ${namedPath} now` } }),
    ...lines,
  ]);
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
    const result = await run(tmp, [slash(fx.runDir)], { CLAUDE_CONFIG_DIR: slash(path.join(tmp, "missing-config")) });
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

// --- DoD.6: unusable argv, exit 2 ---

test("with no argument the exit is 2, one error line on stderr and nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const result = await run(tmp, [], {});
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: [^\n]*\n$/);
  });
});

test("with two arguments the exit is 2, one error line on stderr and nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    const result = await run(tmp, [slash(fx.runDir), slash(fx.runDir)], {});
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: [^\n]*\n$/);
  });
});

test("with a run directory that does not exist the exit is 2, one error line on stderr and nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const result = await run(tmp, [slash(path.join(tmp, "docs", "_specs", KEY))], {});
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: [^\n]*\n$/);
  });
});

// --- the plan review rounds line closes the report ---

test("every planner-review and planner-graph-review transcript naming the planned path counts once, the backslash form, a retried dispatch and a transcript older than the run day included, and the rounds line follows the token lines", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    transcript(fx, "s1", "a0", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    review(fx, "r1", "viber:planner-review", PLANNED);
    review(fx, "r2", "viber:planner-review", "C:\\plans\\p.md");
    review(fx, "r3", "viber:planner-review", PLANNED);
    review(fx, "r4", "viber:planner-graph-review", PLANNED);
    const old = new Date("2019-06-01T00:00:00Z");
    fs.utimesSync(path.join(fx.config, "projects", "proj", "plan", "subagents", "agent-r3.jsonl"), old, old);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(stdoutLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      NOT_COUNTED,
      "rounds: plan review 4",
    ]);
  });
});

test("a transcript of another review agent type, of a non-review agent or naming another plan path adds no round", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    review(fx, "r1", "viber:planner-review", PLANNED);
    review(fx, "r2", "viber:planner-spec-review", PLANNED);
    review(fx, "r3", "viber:planner-task-review", PLANNED);
    review(fx, "r4", "viber:task-coder", PLANNED);
    review(fx, "r5", "viber:planner-review", "C:/plans/other.md");
    review(fx, "r6", "viber:planner-review", "C:/plans/p.md.bak");
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(stdoutLines(result.stdout).includes("rounds: plan review 1"), result.stdout);
  });
});

test("a plan.md with no planned line makes the rounds line unavailable", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, null);
    review(fx, "r1", "viber:planner-review", PLANNED);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(stdoutLines(result.stdout).at(-1), "rounds: plan review unavailable - no planned line in plan.md");
  });
});

test("a planned line with no review transcript naming the path makes the rounds line unavailable", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    review(fx, "r1", "viber:planner-review", "C:/plans/other.md");
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
    const result = await run(tmp, [slash(fx.runDir)], { CLAUDE_CONFIG_DIR: slash(path.join(tmp, "missing-config")) });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(stdoutLines(result.stdout), [
      "tokens: unavailable - no projects directory",
      "rounds: plan review unavailable - no projects directory",
    ]);
  });
});

test("with no transcript naming the run the unavailable token line is followed by the rounds line", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    review(fx, "r1", "viber:planner-review", PLANNED, [
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(stdoutLines(result.stdout), [
      "tokens: unavailable - no agent transcript names this run",
      "tokens: viber:planner-review claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      "rounds: plan review 1",
    ]);
  });
});

// --- the planning rows follow the build rows ---

const OLD = new Date("2019-06-01T00:00:00Z");

test("a transcript of each of the six planning roles naming the planned path adds a row for its role with the summed usage, one older than the run day and one retried dispatch included", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    review(fx, "p1", "viber:planner-review", PLANNED, [
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    review(fx, "p2", "viber:planner-review", PLANNED, [
      assistant("m2", SONNET, { in: 10, out: 20, cacheRead: 30, cacheWrite: 40 }),
    ]);
    review(fx, "p3", "viber:planner-spec-review", PLANNED, [
      assistant("m3", SONNET, { in: 5, out: 6, cacheRead: 7, cacheWrite: 8 }),
    ]);
    review(fx, "p4", "viber:planner-graph-review", PLANNED, [
      assistant("m4", SONNET, { in: 9, out: 10, cacheRead: 11, cacheWrite: 12 }),
    ]);
    review(fx, "p5", "viber:planner-task-review", PLANNED, [
      assistant("m5", SONNET, { in: 13, out: 14, cacheRead: 15, cacheWrite: 16 }),
    ]);
    review(fx, "p6", "viber:impact-mapper", PLANNED, [
      assistant("m6", SONNET, { in: 17, out: 18, cacheRead: 19, cacheWrite: 20 }),
    ]);
    review(fx, "p7", "viber:adr-screener", PLANNED, [
      assistant("m7", SONNET, { in: 21, out: 22, cacheRead: 23, cacheWrite: 24 }),
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
      "tokens: viber:impact-mapper claude-sonnet-4 in 17 out 18 cache-read 19 cache-write 20",
      "tokens: viber:planner-graph-review claude-sonnet-4 in 9 out 10 cache-read 11 cache-write 12",
      "tokens: viber:planner-review claude-sonnet-4 in 11 out 22 cache-read 33 cache-write 44",
      "tokens: viber:planner-spec-review claude-sonnet-4 in 5 out 6 cache-read 7 cache-write 8",
      "tokens: viber:planner-task-review claude-sonnet-4 in 13 out 14 cache-read 15 cache-write 16",
      NOT_COUNTED,
    ]);
  });
});

test("a planning transcript naming both the run directory and the planned path counts once", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    writePlan(fx, PLANNED);
    transcript(fx, "plan", "p1", "viber:planner-review", [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: `Review the plan at ${PLANNED} for ${fx.runPrompt}/ now` },
      }),
      assistant("m1", SONNET, { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(tokenLines(result.stdout), [
      "tokens: viber:planner-review claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
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
    review(fx, "p1", "viber:planner-review", "C:/plans/other.md", [
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
    review(fx, "p1", "viber:planner-review", PLANNED, [assistantWithoutUsage("m2", SONNET)]);
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
    review(fx, "p1", "viber:planner-review", PLANNED, [
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
    review(fx, "p1", "viber:planner-review", PLANNED, [
      assistant("m2", SONNET, { in: 5, out: 6, cacheRead: 7, cacheWrite: 8 }),
      assistant("m3", OPUS, { in: 9, out: 10, cacheRead: 11, cacheWrite: 12 }),
    ]);
    review(fx, "p2", "viber:adr-screener", PLANNED, [
      assistant("m4", SONNET, { in: 13, out: 14, cacheRead: 15, cacheWrite: 16 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(stdoutLines(result.stdout), [
      "tokens: viber:task-coder claude-sonnet-4 in 1 out 2 cache-read 3 cache-write 4",
      "tokens: viber:adr-screener claude-sonnet-4 in 13 out 14 cache-read 15 cache-write 16",
      "tokens: viber:planner-review claude-opus-4 in 9 out 10 cache-read 11 cache-write 12",
      "tokens: viber:planner-review claude-sonnet-4 in 5 out 6 cache-read 7 cache-write 8",
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
    review(fx, "r1", "viber:planner-review", PLANNED);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(stdoutLines(result.stdout), [
      "tokens: unavailable - a transcript holds no readable usage",
      "rounds: plan review 1",
    ]);
  });
});

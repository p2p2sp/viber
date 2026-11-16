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
 * `unavailable` and exits 0, and only an unusable argument exits 2.
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

const KEY = "2026-11-16-11-25-26_token-report";
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
    assert.deepEqual(stdoutLines(result.stdout), [
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
    assert.deepEqual(stdoutLines(result.stdout), [
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
    assert.deepEqual(stdoutLines(result.stdout), [
      "tokens: unknown claude-sonnet-4 in 5 out 6 cache-read 7 cache-write 8",
      NOT_COUNTED,
    ]);
  });
});

// --- DoD.4: the not-counted line closes the report ---

test("the last stdout line of a report is the not-counted line", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    transcript(fx, "s1", "a1", "viber:task-coder", [
      prompt(fx.runPrompt),
      assistant("m1", OPUS, { in: 1, out: 1, cacheRead: 1, cacheWrite: 1 }),
    ]);
    const result = await report(tmp, fx);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(stdoutLines(result.stdout).at(-1), NOT_COUNTED);
  });
});

// --- DoD.5: unavailable, exit 0 ---

test("with no projects directory the report is the single unavailable line and the exit is 0", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const fx = seed(tmp);
    const result = await run(tmp, [slash(fx.runDir)], { CLAUDE_CONFIG_DIR: slash(path.join(tmp, "missing-config")) });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "tokens: unavailable - no projects directory\n");
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
    assert.equal(result.stdout, "tokens: unavailable - no agent transcript names this run\n");
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
    assert.equal(result.stdout, "tokens: unavailable - a transcript holds no readable usage\n");
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

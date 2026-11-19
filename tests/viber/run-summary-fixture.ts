/*
 * run-summary-fixture.ts - the helpers run-summary.test.ts and
 * run-summary.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/run-summary.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withStub } from "../harness/stub.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/run-summary.sh");

/** The epoch second a stubbed `date +%s` reports. */
export const NOW = 1750000000;

/** A start mark for the token cases, whose `elapsed:` line they never read. */
export const MARK = "1750000000";

/** Runs the script with `date` frozen at NOW. */
export function runAtNow(args: string[], cwd?: string, env?: Record<string, string>) {
  return withStub("date", `echo ${NOW}`, (dir) => runScript(SUT, args, { cwd, shell: "bash", env, stubDirs: [dir] }));
}

export const KEY = "2020-01-02-11-25-26_token-report";
export const SONNET = "claude-sonnet-4";
export const NOT_COUNTED = "tokens: agents only - the main session and the closeout agent are not counted";

export interface Usage {
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
}

/** The first line of a transcript: the prompt that started the agent. */
export function prompt(runDir: string): string {
  return JSON.stringify({ type: "user", message: { role: "user", content: `Build the run in ${runDir}/ now` } });
}

/** One assistant line of a transcript, shaped as Claude Code writes it. */
export function assistant(id: string, model: string, usage: Usage): string {
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

export interface Fixture {
  config: string;
  runDir: string;
  runPrompt: string;
}

/** A temp tree holding an existing run directory and an empty config directory. */
export function seed(tmp: string): Fixture {
  const runDir = path.join(tmp, "repo", "docs", "_specs", KEY);
  fs.mkdirSync(runDir, { recursive: true });
  const config = path.join(tmp, "config");
  fs.mkdirSync(path.join(config, "projects"), { recursive: true });
  return { config, runDir, runPrompt: slash(path.join("docs", "_specs", KEY)) };
}

/** Writes `agent-<id>.jsonl` (and its meta file when `role` is given) in one session. */
export function transcript(fx: Fixture, session: string, id: string, role: string | null, lines: string[]): void {
  const dir = path.join(fx.config, "projects", "proj", session, "subagents");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `agent-${id}.jsonl`), lines.join("\n") + "\n");
  if (role !== null) fs.writeFileSync(path.join(dir, `agent-${id}.meta.json`), JSON.stringify({ agentType: role }));
}

export function run(tmp: string, args: string[], env: Record<string, string>) {
  return runScript(SUT, args, { cwd: tmp, shell: "bash", env });
}

export function report(tmp: string, fx: Fixture) {
  return run(tmp, [MARK, slash(fx.runDir)], { CLAUDE_CONFIG_DIR: slash(fx.config) });
}

export function stdoutLines(stdout: string): string[] {
  return stdout.split("\n").filter((line) => line !== "");
}

/** The lines of a report after its leading `elapsed:` line. */
export function reportLines(stdout: string): string[] {
  return stdoutLines(stdout).slice(1);
}

export const PLANNED = "C:/plans/p.md";

/** Writes the run's `plan.md`, with a `planned:` line when `planned` is given. */
export function writePlan(fx: Fixture, planned: string | null): void {
  const lines = ["---", "source: docs/_specs/x/plan.md"];
  if (planned !== null) lines.push(`planned: ${planned}`);
  lines.push("---", "# Plan");
  fs.writeFileSync(path.join(fx.runDir, "plan.md"), lines.join("\n") + "\n");
}

/** A transcript of a plan reviewer: its first line, the prompt, and the assistant lines given. */
export function review(fx: Fixture, id: string, role: string, namedPath: string, lines: string[] = []): void {
  transcript(fx, "plan", id, role, [
    JSON.stringify({ type: "user", message: { role: "user", content: `Review the plan at ${namedPath} now` } }),
    ...lines,
  ]);
}

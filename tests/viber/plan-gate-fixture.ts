/*
 * plan-gate-fixture.ts - the helpers plan-gate.test.ts and
 * plan-gate.critical.test.ts share: what both tiers need to seed a case and
 * run viber/hooks/scripts/plan-gate.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/hooks/scripts/plan-gate.sh");

export function line(obj: unknown): string {
  return JSON.stringify(obj);
}

export function writeTranscript(dir: string, name: string, lines: string[]): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, lines.map((l) => `${l}\n`).join(""));
  return file;
}

export interface Decision {
  decision: string;
  reason?: string;
}

// plan-gate.sh ships mode 100755, but hooks.json invokes it as
// `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/plan-gate.sh"` - the harness runs it
// the same way, because this file tests the script's content, not its exec bit.
export async function runPayload(payload: Record<string, unknown>): Promise<Decision> {
  const result = await runScript(SUT, [], { shell: "bash", input: JSON.stringify(payload) });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  let json: { hookSpecificOutput?: { hookEventName?: string; permissionDecision?: string; permissionDecisionReason?: string } };
  try {
    json = JSON.parse(result.stdout);
  } catch {
    throw new Error(`expected parseable JSON stdout, got: ${result.stdout}`);
  }
  const out = json.hookSpecificOutput;
  assert.ok(out, `expected hookSpecificOutput, got: ${result.stdout}`);
  assert.equal(out.hookEventName, "PreToolUse");
  return { decision: out.permissionDecision ?? "", reason: out.permissionDecisionReason };
}

export async function runCase(transcriptPath: string, cwd?: string): Promise<Decision> {
  const payload: Record<string, unknown> = { transcript_path: transcriptPath, tool_name: "ExitPlanMode" };
  if (cwd) payload.cwd = cwd;
  return await runPayload(payload);
}

/** The dated plan layout plan-path.sh owns; `plans` is the directory segment the
 *  gate anchors on. A path that never exists on disk is fine for every case but
 *  the ones on the plan's frontmatter: a plan the gate cannot read keeps the
 *  planner's reviewer. */
export const PLAN = "/repo/.claude/plans/2026-09-20-10-00-00_feat-x/plan.md";

/** Signal 1a: the planner skill invoked through the Skill tool. */
export function skillUse(skill = "viber:planner"): string {
  return line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill } }] } });
}

/** Signal 2: the plan file itself, written by Write or Edit. After a FAIL it is
 *  one of the two answering writes. */
export function planWrite(filePath = PLAN, name: "Write" | "Edit" = "Write"): string {
  return line({ type: "assistant", message: { content: [{ type: "tool_use", name, input: { file_path: filePath, content: "# Plan" } }] } });
}

/** The planner's Bash call of plan-build.sh, quoted as the planner skill writes
 *  it: the subcommand, the plan path and what follows it - nothing for `open`,
 *  the reported verdict `word` for `judged`, one file argument for the rest.
 *  With `apply`, `open` or `judged ... none` it answers a FAIL, with
 *  `judged ... DENIED` a DENIED. */
export function scriptCall(sub = "apply", plan = PLAN, word = "PASS"): string {
  const rest = sub === "open" ? "" : sub === "judged" ? ` ${word}` : ' "/repo/.temp/viber/planner/in.md"';
  const command = `"/plugin/skills/planner/scripts/plan-build.sh" ${sub} "${plan}"${rest}`;
  return line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command, description: "Run the plan build" } }] } });
}

/** The reviewer of a planner plan. */
export const JUDGE = "viber:plan-judge";

/** The reviewer of a plan written outside the planner. */
export const PLAIN = "viber:outside-plan-review";

export function dispatch(id?: string, agent = JUDGE): string {
  const use: Record<string, unknown> = {
    type: "tool_use",
    name: "Agent",
    input: { subagent_type: agent, prompt: `review ${PLAN}` },
  };
  if (id) use.id = id;
  return line({ type: "assistant", message: { content: [use] } });
}

export interface VerdictOpts {
  id?: string;
  body?: string;
}

export function verdict(value: "PASS" | "FAIL" | "DENIED", opts: VerdictOpts = {}): string {
  const block: Record<string, unknown> = {
    type: "tool_result",
    content: opts.body ?? `## Plan Review\nVERDICT: ${value}\nnotes.`,
  };
  if (opts.id) block.tool_use_id = opts.id;
  return line({ type: "user", message: { content: [block] } });
}

/** A plan file that really exists, so the gate can read its frontmatter. The
 *  default content opens with the planner's frontmatter `source:` line, the
 *  second half of planner ownership; pass other content for a plain plan. */
export function realPlan(dir: string, rel = ".claude/plans/2026-09-20-10-00-00_feat-x/plan.md", content?: string): string {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content ?? `---\nsource: ${file}\n---\n# Plan\n`);
  return file;
}

export const PASS = verdict("PASS");
export const FAIL = verdict("FAIL");

/** The switch as `.claude/viber.yml` groups it: a child of `planning:`. */
export const GROUPED_ON = "planning:\n  outside-plan-review: true\n";

/** A session cwd whose .claude/viber.yml carries the given body. */
export function sessionWithConfig(dir: string, body: string): string {
  const cwd = path.join(dir, "session");
  fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".claude", "viber.yml"), body);
  return cwd;
}

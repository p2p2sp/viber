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
 *  the mtime guard - the guard is skipped when the file cannot be read. */
export const PLAN = "/repo/.claude/plans/2026-09-20-10-00-00_feat-x/plan.md";

/** Signal 1a: the planner skill invoked through the Skill tool. */
export function skillUse(skill = "viber:planner"): string {
  return line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill } }] } });
}

/** Signal 2: the plan file itself, written by Write or Edit. */
export function planWrite(filePath = PLAN, name: "Write" | "Edit" = "Write"): string {
  return line({ type: "assistant", message: { content: [{ type: "tool_use", name, input: { file_path: filePath, content: "# Plan" } }] } });
}

export function dispatch(id?: string, agent = "viber:planner-review"): string {
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
  timestamp?: string;
  body?: string;
}

export function verdict(value: "PASS" | "FAIL" | "DENIED", opts: VerdictOpts = {}): string {
  const block: Record<string, unknown> = {
    type: "tool_result",
    content: opts.body ?? `## Plan Review\nVERDICT: ${value}\nnotes.`,
  };
  if (opts.id) block.tool_use_id = opts.id;
  const obj: Record<string, unknown> = { type: "user", message: { content: [block] } };
  if (opts.timestamp) obj.timestamp = opts.timestamp;
  return line(obj);
}

/** A plan file that really exists, so the mtime guard has something to stat.
 *  The default content opens with the planner's frontmatter `source:` line, the
 *  second half of planner ownership; pass other content for a plain plan. */
export function realPlan(dir: string, rel = ".claude/plans/2026-09-20-10-00-00_feat-x/plan.md", content?: string): string {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content ?? `---\nsource: ${file}\n---\n# Plan\n`);
  return file;
}

export const PASS = verdict("PASS");
export const FAIL = verdict("FAIL");

export const PLAIN = "viber:outside-plan-review";

/** The switch as `.claude/viber.yml` groups it: a child of `planning:`. */
export const GROUPED_ON = "planning:\n  outside-plan-review: true\n";

/** A session cwd whose .claude/viber.yml carries the given body. */
export function sessionWithConfig(dir: string, body: string): string {
  const cwd = path.join(dir, "session");
  fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".claude", "viber.yml"), body);
  return cwd;
}

export type Verdict = "PASS" | "FAIL" | "DENIED";
export type Member = "spec" | "graph" | "a" | "b" | "c";

export const SET_SPEC = "viber:planner-spec-review";
export const SET_GRAPH = "viber:planner-graph-review";
export const SET_TASK = "viber:planner-task-review";

/** The members of a 20-task plan: spec, graph and three task slices of at most 8. */
export const MEMBERS: Record<Member, { agent: string; tasks?: string }> = {
  spec: { agent: SET_SPEC },
  graph: { agent: SET_GRAPH },
  a: { agent: SET_TASK, tasks: "T1-T8" },
  b: { agent: SET_TASK, tasks: "T9-T16" },
  c: { agent: SET_TASK, tasks: "T17-T20" },
};

/** A plan file with `tasks` task blocks; `eol` and `indent` shape the marker lines. */
export function taskPlan(dir: string, tasks: number, opts: { eol?: string; indent?: string; extra?: string } = {}): string {
  const eol = opts.eol ?? "\n";
  const indent = opts.indent ?? "";
  const blocks = Array.from({ length: tasks }, (_, i) => `${indent}<!-- TASK -->${eol}### T${i + 1} - task${eol}<!-- /TASK -->${eol}`).join("");
  const head = ["---", "source: x.md", "---", "# Plan", ""].join(eol);
  return realPlan(dir, ".claude/plans/2026-10-21-12-00-00_big/plan.md", head + blocks + (opts.extra ?? ""));
}

/** One review-set dispatch, its prompt carrying the `tasks:` line of a task slice. */
export function setDispatch(member: Member, id?: string, withTasks = true): string {
  const { agent, tasks } = MEMBERS[member];
  const prompt = `review ${PLAN}\nrefs: /refs${tasks && withTasks ? `\ntasks: ${tasks}` : ""}`;
  const use: Record<string, unknown> = { type: "tool_use", name: "Agent", input: { subagent_type: agent, prompt } };
  if (id) use.id = id;
  return line({ type: "assistant", message: { content: [use] } });
}

/** A member's dispatch and its verdict, paired by a tool-use id of the member's own. */
export function memberRound(member: Member, value: Verdict, opts: { round?: number; timestamp?: string } = {}): [string, string] {
  const id = `toolu_${member}_r${opts.round ?? 1}`;
  return [setDispatch(member, id), verdict(value, { id, timestamp: opts.timestamp })];
}

/** Every member of the 20-task plan, dispatched and answered in order. */
export function reviewSetRound(values: Partial<Record<Member, Verdict>>, opts: { round?: number; timestamp?: string } = {}): string[] {
  return (Object.keys(MEMBERS) as Member[]).flatMap((m) => (values[m] ? memberRound(m, values[m], opts) : []));
}

export const ALL_PASS: Record<Member, Verdict> = { spec: "PASS", graph: "PASS", a: "PASS", b: "PASS", c: "PASS" };

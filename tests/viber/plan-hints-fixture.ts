/*
 * plan-hints-fixture.ts - the helpers plan-hints.test.ts and
 * plan-hints.critical.test.ts share: what both tiers need to seed a case and
 * run viber/hooks/scripts/plan-hints.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/hooks/scripts/plan-hints.sh");

export function line(obj: unknown): string {
  return JSON.stringify(obj);
}

export function writeTranscript(dir: string, lines: string[]): string {
  const file = path.join(dir, "t.jsonl");
  fs.writeFileSync(file, lines.map((l) => `${l}\n`).join(""));
  return file;
}

export function skillUse(skill = "viber:planner"): string {
  return line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill } }] } });
}

export function permissionMode(mode: string): string {
  return line({ type: "permission-mode", permissionMode: mode, sessionId: "s" });
}

// hooks.json invokes the script as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/plan-hints.sh"`,
// so the harness runs it through bash the same way.
export async function run(input: string): Promise<string> {
  const result = await runScript(SUT, [], { shell: "bash", input });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  return result.stdout;
}

export async function runPayload(payload: Record<string, unknown>): Promise<string> {
  return await run(JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "go", ...payload }));
}

/** Parses the hint and asserts it carries every rule. */
export function assertHint(stdout: string): void {
  let json: { hookSpecificOutput?: { hookEventName?: string; additionalContext?: string } };
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new Error(`expected parseable JSON stdout, got: ${stdout}`);
  }
  const out = json.hookSpecificOutput;
  assert.ok(out, `expected hookSpecificOutput, got: ${stdout}`);
  assert.equal(out.hookEventName, "UserPromptSubmit");
  const ctx = out.additionalContext ?? "";
  assert.match(ctx, /dispatch the outside-plan-review agent once the plan is written/);
  assert.match(ctx, /dispatch it once more, adding those lines and what you changed for each to the plan path and the goal: that second review is the last/);
  assert.match(ctx, /under "## Open items", and call ExitPlanMode/);
  assert.match(ctx, /Never ask the user about a finding/);
  assert.match(ctx, /planning\.outside-plan-review/);
}

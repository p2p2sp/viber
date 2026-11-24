/*
 * shell-guard-fixture.ts - the helpers shell-guard.test.ts and
 * shell-guard.critical.test.ts share: what both tiers need to seed a case and
 * run viber/hooks/scripts/shell-guard.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import path from "node:path";

import { runScript } from "../harness/run.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/hooks/scripts/shell-guard.sh");

export function deny(reason: string): string {
  return `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"viber guard: ${reason}"}}\n`;
}

export const R1_TEXT = "one command per Bash call - run each part of the chain as its own Bash call.";
export const R1 = deny(R1_TEXT);
export const r1With = (suffix: string): string => deny(`${R1_TEXT} ${suffix}`);
export const R4 = deny("Bash never writes a file - change it with Edit or Write, and redirect scratch output only under .temp/.");
export const R6 = deny(
  "cd only to a literal path, never one holding a glob, a variable or a command substitution - or stay where you are and pass each path in full, exactly as your prompt gives it.",
);

// hooks.json invokes the script as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/shell-guard.sh"`,
// so the harness runs it through bash the same way.
export async function run(input: string): Promise<string> {
  const result = await runScript(SUT, [], { shell: "bash", input });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.doesNotMatch(result.stdout, /"permissionDecision"\s*:\s*"allow"/);
  return result.stdout;
}

export async function runCommand(command: string, agentType?: string): Promise<string> {
  const payload: Record<string, unknown> = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } };
  if (agentType !== undefined) payload.agent_type = agentType;
  return await run(JSON.stringify(payload));
}

export const CODER = "viber:task-coder";

export const r4With = (suffix: string): string => deny(`Bash never writes a file - change it with Edit or Write, and redirect scratch output only under .temp/. ${suffix}`);

/*
 * kill-guard-fixture.ts - the helpers kill-guard.test.ts and
 * kill-guard.critical.test.ts share: what both tiers need to seed a case and
 * run viber/hooks/scripts/kill-guard.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import path from "node:path";

import { runScript } from "../harness/run.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/hooks/scripts/kill-guard.sh");

// hooks.json invokes the script as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/kill-guard.sh"`,
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

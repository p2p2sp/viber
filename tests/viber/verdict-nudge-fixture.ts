/*
 * verdict-nudge-fixture.ts - the helpers verdict-nudge.test.ts and
 * verdict-nudge.critical.test.ts share: what both tiers need to seed a case
 * and run viber/hooks/scripts/verdict-nudge.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/hooks/scripts/verdict-nudge.sh");

export const BLOCK = '{"decision":"block","reason":"Finish your task, then return your output lines."}\n';

// hooks.json invokes the script as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/verdict-nudge.sh"`,
// so the harness runs it through bash the same way.
export async function run(input: string): Promise<string> {
  const result = await runScript(SUT, [], { shell: "bash", input });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  return result.stdout;
}

export async function runPayload(payload: Record<string, unknown>): Promise<string> {
  return await run(JSON.stringify({ hook_event_name: "SubagentStop", ...payload }));
}

// An agent type with no file under the plugin root's agents/ directory: the legacy test and reason apply.
export const NO_FILE = "viber:no-agent-file";

export async function runMessage(message: string, agentType = NO_FILE): Promise<string> {
  return await runPayload({ agent_type: agentType, stop_hook_active: false, last_assistant_message: message });
}

// Runs a copy of the script placed at <root>/hooks/scripts/, with <root>/agents/<name>.md written
// from `agents`, so the script reads the fixture agent files the way it reads the plugin's own.
// `invokedAs` spells the path the copy is invoked by: the native one (`C:\` separators on Windows)
// or the same path with every `\` turned into `/`. Every case but the one `C:\` case runs by the
// `/` path, so only that case fails when the hook stops reading `\` as a separator.
export async function runInRoot(
  agents: Record<string, string>,
  payload: Record<string, unknown>,
  invokedAs: "native" | "slashed" = "slashed",
): Promise<string> {
  return await withTempDir("verdict-nudge-", async (root) => {
    const scripts = path.join(root, "hooks", "scripts");
    const agentsDir = path.join(root, "agents");
    fs.mkdirSync(scripts, { recursive: true });
    fs.mkdirSync(agentsDir, { recursive: true });
    const copy = path.join(scripts, "verdict-nudge.sh");
    fs.copyFileSync(SUT, copy);
    for (const [name, text] of Object.entries(agents)) fs.writeFileSync(path.join(agentsDir, `${name}.md`), text);
    const input = JSON.stringify({ hook_event_name: "SubagentStop", ...payload });
    const invoked = invokedAs === "slashed" ? copy.replace(/\\/g, "/") : copy;
    const result = await runScript(invoked, [], { shell: "bash", input });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    return result.stdout;
  });
}

export const AGENT_FILE = [
  "Return one of these lines:",
  "- `VERDICT: PASS`",
  "- `VERDICT: FAIL`",
  "- `VERDICT: DENIED` then `REASON: <tool>`",
  "A second `VERDICT: PASS` mention changes nothing.",
].join("\n");

export const LISTED =
  '{"decision":"block","reason":"Finish your task, then end on one of these lines: VERDICT: PASS, VERDICT: FAIL, VERDICT: DENIED"}\n';

export function listedPayload(message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { agent_type: "viber:fixture-agent", stop_hook_active: false, last_assistant_message: message, ...extra };
}

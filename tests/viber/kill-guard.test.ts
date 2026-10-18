/*
 * kill-guard.test.ts - proves viber/hooks/scripts/kill-guard.sh, the PreToolUse
 * hook on Bash that refuses stopping processes by name inside viber agents.
 *
 * What it must do: when the payload's top-level `agent_type` starts with
 * `viber:`, refuse with the one-line deny object a command holding, in command
 * position, killall, pkill, taskkill with an /IM argument, xargs running kill,
 * or kill fed a command substitution; the reason opens with the "viber guard: "
 * marker. Every other command (kill <PID>,
 * kill -0 <PID>, kill $!, taskkill by PID, a name merely quoted as an argument),
 * every other agent, the main session (no agent_type) and unreadable input print
 * nothing. The hook never answers allow and every case exits 0. The last case
 * pins its registration in hooks/hooks.json.
 *
 * Payloads are built as JS objects through JSON.stringify, never hand-escaped:
 * the script reads raw text and has to unescape the command itself.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/kill-guard.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/hooks/scripts/kill-guard.sh");
const HOOKS_JSON = path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json");

const DENY =
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"viber guard: Stopping processes by name is refused in viber agents: it also stops processes you did not start. Stop only the PIDs you started yourself with kill <PID>, then confirm each is gone with kill -0 <PID>."}}\n';

// hooks.json invokes the script as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/kill-guard.sh"`,
// so the harness runs it through bash the same way.
async function run(input: string): Promise<string> {
  const result = await runScript(SUT, [], { shell: "bash", input });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.doesNotMatch(result.stdout, /"permissionDecision"\s*:\s*"allow"/);
  return result.stdout;
}

async function runCommand(command: string, agentType?: string): Promise<string> {
  const payload: Record<string, unknown> = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } };
  if (agentType !== undefined) payload.agent_type = agentType;
  return await run(JSON.stringify(payload));
}

const refused: Array<[number, string]> = [
  [1, "killall -9 dotnet"],
  [2, 'pkill -f "dotnet test"'],
  [3, "taskkill //IM dotnet.exe //F"],
  [3, "taskkill /im dotnet.exe"],
  [4, "ps aux | grep dotnet | awk '{print $1}' | xargs -r kill -9"],
  [5, "kill -9 $(pgrep -f dotnet)"],
  [5, "kill -9 `pgrep -f dotnet`"],
];

for (const [clause, command] of refused) {
  test(`DoD.${clause}: from viber:test-runner, ${JSON.stringify(command)} is refused with the deny object`, async () => {
    assert.equal(await runCommand(command, "viber:test-runner"), DENY);
  });
}

const refusedPositions = [
  "cd build && killall node",
  "sleep 1\npkill node",
  "(pkill node)",
  "echo $(killall node)",
  "taskkill /F /IM node.exe",
  "xargs -n 1 kill -9",
  "xargs -I {} kill {}",
];

for (const command of refusedPositions) {
  test(`${JSON.stringify(command)} is refused (the name-stopping form sits in command position after a separator, a newline or a substitution)`, async () => {
    assert.equal(await runCommand(command, "viber:task-coder"), DENY);
  });
}

const allowed = ["kill 1234", "kill -9 1234 5678", "kill -0 1234", "kill $!", "taskkill //PID 1234 //T //F"];

for (const command of allowed) {
  test(`DoD.6: ${JSON.stringify(command)} from a viber agent produces empty stdout (a PID the agent started is its own to stop)`, async () => {
    assert.equal(await runCommand(command, "viber:test-runner"), "");
  });
}

test('DoD.7: grep -n "killall" notes.md produces empty stdout (a name quoted as an argument is not in command position)', async () => {
  assert.equal(await runCommand('grep -n "killall" notes.md', "viber:test-runner"), "");
});

test("DoD.8: killall -9 dotnet with no agent_type (the main session) produces empty stdout", async () => {
  assert.equal(await runCommand("killall -9 dotnet"), "");
});

test("DoD.9: killall -9 dotnet from a non-viber agent produces empty stdout", async () => {
  assert.equal(await runCommand("killall -9 dotnet", "Explore"), "");
});

test("a bare viber agent_type without the colon prefix produces empty stdout (only viber: agents are covered)", async () => {
  assert.equal(await runCommand("killall -9 dotnet", "viberish"), "");
});

test("DoD.10: malformed JSON produces empty stdout", async () => {
  assert.equal(await run('{"agent_type":"viber:test-runner","tool_input":{"command":"killall'), "");
});

test("DoD.10: empty stdin produces empty stdout", async () => {
  assert.equal(await run(""), "");
});

test("a viber agent payload with no command produces empty stdout", async () => {
  assert.equal(await run(JSON.stringify({ agent_type: "viber:test-runner", tool_input: {} })), "");
});

test("a command quoting agent_type text does not make a main-session call a viber one (only the top-level key counts)", async () => {
  assert.equal(await runCommand('echo "agent_type":"viber:x"; killall node'), "");
});

test("DoD.1: an 11.5 KB pkill command holding a node -e script of 160 escaped-quote lines is refused inside the 10 s hook timeout under a UTF-8 locale (the unescape must not scan by character)", async () => {
  const script = Array.from({ length: 160 }, (_, i) => `log("alpha", "beta", "gamma", "delta", "eta", "mu", "pi"); // probe ${i}`).join("\n");
  const command = `pkill -f vite\nnode -e "\n${script}\n"`;
  assert.ok(command.length > 11000 && command.length < 12000, `payload size ${command.length}`);
  const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", agent_type: "viber:test-runner", tool_input: { command } });
  const result = await runScript(SUT, [], {
    shell: "bash",
    input,
    env: { LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" },
    timeout: 10000,
  });
  assert.equal(result.stdout, DENY);
});

test("DoD.4: the hooks.json description says both guards open their refusal with the viber guard: marker and every hook fails open", () => {
  const description: string = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8")).description;
  assert.match(description, /Both guards open every refusal with "viber guard:"/);
  assert.match(description, /Every hook fails open/);
});

test("DoD.13: hooks.json holds a PreToolUse entry with matcher Bash running kill-guard.sh through bash", () => {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8")).hooks.PreToolUse as Array<{
    matcher: string;
    hooks: Array<{ type: string; command: string }>;
  }>;
  const commands = hooks.filter((h) => h.matcher === "Bash").flatMap((h) => h.hooks.map((x) => x.command));
  assert.ok(commands.includes('bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/kill-guard.sh"'), `got: ${JSON.stringify(commands)}`);
});

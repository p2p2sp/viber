/*
 * kill-guard.critical.test.ts - the critical tier of
 * viber/hooks/scripts/kill-guard.sh: a viber agent is refused every spelling
 * that stops processes by name, in command position and inside a very large
 * command, while stopping its own PID, quoting the name as an argument and the
 * main session stay allowed.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by kill-guard.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/kill-guard.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";

import { runScript } from "../harness/run.ts";
import { SUT, runCommand } from "./kill-guard-fixture.ts";

const DENY =
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"viber guard: Stopping processes by name is refused in viber agents: it also stops processes you did not start. Stop only the PIDs you started yourself with kill <PID>, then confirm each is gone with kill -0 <PID>."}}\n';

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

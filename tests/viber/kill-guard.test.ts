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
import { run, runCommand } from "./kill-guard-fixture.ts";

const HOOKS_JSON = path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json");

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

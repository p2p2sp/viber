/*
 * verdict-nudge.test.ts - proves viber/hooks/scripts/verdict-nudge.sh, the
 * SubagentStop hook that sends a viber agent back once when it ends without its
 * output line.
 *
 * What it must do: when the payload's top-level `agent_type` starts with `viber:`
 * and is none of viber:scout, viber:mapper, viber:hunter, `stop_hook_active` is not
 * true and `last_assistant_message` holds no line starting (after whitespace and
 * leading backtick, asterisk or hyphen characters) with `VERDICT:` or `AUDIT:`,
 * print the one-line block object. Every other case prints nothing, and every case
 * exits 0. The last case pins its registration in hooks/hooks.json.
 *
 * Payloads are built as JS objects through JSON.stringify, never hand-escaped:
 * the script reads raw text and has to unescape the message itself.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/verdict-nudge.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/hooks/scripts/verdict-nudge.sh");
const HOOKS_JSON = path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json");

const BLOCK = '{"decision":"block","reason":"Finish your task, then return your output lines."}\n';

// hooks.json invokes the script as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/verdict-nudge.sh"`,
// so the harness runs it through bash the same way.
async function run(input: string): Promise<string> {
  const result = await runScript(SUT, [], { shell: "bash", input });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  return result.stdout;
}

async function runPayload(payload: Record<string, unknown>): Promise<string> {
  return await run(JSON.stringify({ hook_event_name: "SubagentStop", ...payload }));
}

async function runMessage(message: string, agentType = "viber:task-coder"): Promise<string> {
  return await runPayload({ agent_type: agentType, stop_hook_active: false, last_assistant_message: message });
}

test("DoD.1: a viber:task-coder message with no VERDICT or AUDIT line prints the block object", async () => {
  assert.equal(await runMessage("I changed three files and the tests pass."), BLOCK);
});

test("DoD.1: an empty last_assistant_message from a viber:task-coder prints the block object", async () => {
  assert.equal(await runMessage(""), BLOCK);
});

test("DoD.1: a message that mentions VERDICT: mid-line but never starts a line with it prints the block object (only a line start counts)", async () => {
  assert.equal(await runMessage("My last VERDICT: was not sent yet.\nDONE"), BLOCK);
});

test("DoD.1: a very long message with no output line still prints the block object", async () => {
  assert.equal(await runMessage("x".repeat(200000) + "\nend"), BLOCK);
});

test("DoD.2: a 17.8 KB message of quoted lines with no output line prints the block object inside the 10 s hook timeout under a UTF-8 locale (the unescape must not scan by character)", async () => {
  const message = Array.from({ length: 240 }, (_, i) => `Step ${i}: the "build" step said "ok" and the run went on to the next task.`).join("\n");
  assert.ok(message.length > 17000 && message.length < 18500, `message size ${message.length}`);
  const input = JSON.stringify({ hook_event_name: "SubagentStop", agent_type: "viber:task-coder", stop_hook_active: false, last_assistant_message: message });
  const result = await runScript(SUT, [], {
    shell: "bash",
    input,
    env: { LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" },
    timeout: 10000,
  });
  assert.equal(result.stdout, BLOCK);
});

const withVerdict: Array<[string, string]> = [
  ["a bare line", "work done\nVERDICT: PASS"],
  ["the first line", "VERDICT: PASS\nREASON: none"],
  ["an indented line", "work done\n    VERDICT: PASS"],
  ["after a leading backtick", "work done\n`VERDICT: PASS`"],
  ["after a leading asterisk pair", "work done\n**VERDICT: PASS**"],
  ["after a leading hyphen", "work done\n- VERDICT: PASS"],
  ["after a hyphen and bold markers", "work done\n- **VERDICT: PASS**"],
  ["with a CRLF line break", "work done\r\nVERDICT: PASS\r\n"],
  ["with a quoted word before it", 'He said "go" and left.\nVERDICT: PASS'],
];

for (const [label, message] of withVerdict) {
  test(`DoD.2: a VERDICT: PASS line ${label} prints nothing`, async () => {
    assert.equal(await runMessage(message), "");
  });
}

test("DoD.3: a VERDICT: DENIED line prints nothing", async () => {
  assert.equal(await runMessage("VERDICT: DENIED\nREASON: Bash: git commit"), "");
});

test("DoD.4: an AUDIT: line prints nothing", async () => {
  assert.equal(await runMessage("review done\nAUDIT: 3 findings"), "");
});

test("DoD.5: stop_hook_active true prints nothing even without an output line", async () => {
  assert.equal(
    await runPayload({ agent_type: "viber:task-coder", stop_hook_active: true, last_assistant_message: "no line" }),
    "",
  );
});

const exempt = ["viber:scout", "viber:mapper", "viber:hunter", "other:task-coder", "task-coder", "viberish"];

for (const agentType of exempt) {
  test(`DoD.6: ${agentType} without an output line prints nothing`, async () => {
    assert.equal(await runMessage("no line", agentType), "");
  });
}

test("DoD.6: a payload with no agent_type prints nothing (the main session is never nudged)", async () => {
  assert.equal(await runPayload({ last_assistant_message: "no line" }), "");
});

test("DoD.6: a message quoting agent_type text does not make a main-session stop a viber one (only the top-level key counts)", async () => {
  assert.equal(await runPayload({ last_assistant_message: 'echo "agent_type":"viber:task-coder"' }), "");
});

test("DoD.7: empty stdin prints nothing", async () => {
  assert.equal(await run(""), "");
});

test("DoD.7: malformed JSON prints nothing", async () => {
  assert.equal(await run('{"agent_type":"viber:task-coder","last_assistant_message":"no li'), "");
});

test("DoD.7: a viber:task-coder payload with no last_assistant_message prints nothing", async () => {
  assert.equal(await runPayload({ agent_type: "viber:task-coder", stop_hook_active: false }), "");
});

test("DoD.8: the block case exits 0", async () => {
  const result = await runScript(SUT, [], {
    shell: "bash",
    input: JSON.stringify({ agent_type: "viber:task-coder", last_assistant_message: "no line" }),
  });
  assert.equal(result.status, 0);
});

test("DoD.9: hooks.json holds a SubagentStop entry running verdict-nudge.sh through bash with timeout 10", () => {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8")).hooks.SubagentStop as Array<{
    hooks: Array<{ type: string; command: string; timeout: number }>;
  }>;
  const entries = hooks.flatMap((h) => h.hooks);
  assert.deepEqual(
    entries.filter((x) => x.command === 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/verdict-nudge.sh"').map((x) => x.timeout),
    [10],
  );
});

test("DoD.9: the hooks.json description names the SubagentStop hook, says every hook fails open and keeps the earlier notes", () => {
  const description = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8")).description as string;
  assert.match(description, /SubagentStop/);
  assert.match(description, /[Ee]very hook fails open|hooks fail open/);
  assert.match(description, /planning\.plain-plan-review/);
  assert.match(description, /schema note/);
});

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
 * exits 0. When the agent's file (<plugin root>/agents/<name>.md, the plugin root
 * two directories above the script) names VERDICT: values, the last output line must
 * carry one of them, else the reason lists them in file order; a throwaway plugin
 * root holding fixture agent files proves it. The last cases pin the registration
 * and description in hooks/hooks.json.
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
import { withTempDir } from "../harness/tmp.ts";

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

// An agent type with no file under the plugin root's agents/ directory: the legacy test and reason apply.
const NO_FILE = "viber:no-agent-file";

async function runMessage(message: string, agentType = NO_FILE): Promise<string> {
  return await runPayload({ agent_type: agentType, stop_hook_active: false, last_assistant_message: message });
}

// Runs a copy of the script placed at <root>/hooks/scripts/, with <root>/agents/<name>.md written
// from `agents`, so the script reads the fixture agent files the way it reads the plugin's own.
async function runInRoot(agents: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  return await withTempDir("verdict-nudge-", async (root) => {
    const scripts = path.join(root, "hooks", "scripts");
    const agentsDir = path.join(root, "agents");
    fs.mkdirSync(scripts, { recursive: true });
    fs.mkdirSync(agentsDir, { recursive: true });
    const copy = path.join(scripts, "verdict-nudge.sh");
    fs.copyFileSync(SUT, copy);
    for (const [name, text] of Object.entries(agents)) fs.writeFileSync(path.join(agentsDir, `${name}.md`), text);
    const input = JSON.stringify({ hook_event_name: "SubagentStop", ...payload });
    const result = await runScript(copy, [], { shell: "bash", input });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    return result.stdout;
  });
}

test("DoD.1: a viber agent message with no VERDICT or AUDIT line prints the block object", async () => {
  assert.equal(await runMessage("I changed three files and the tests pass."), BLOCK);
});

test("DoD.1: an empty last_assistant_message from a viber agent prints the block object", async () => {
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
  const input = JSON.stringify({ hook_event_name: "SubagentStop", agent_type: NO_FILE, stop_hook_active: false, last_assistant_message: message });
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

const AGENT_FILE = [
  "Return one of these lines:",
  "- `VERDICT: PASS`",
  "- `VERDICT: FAIL`",
  "- `VERDICT: DENIED` then `REASON: <tool>`",
  "A second `VERDICT: PASS` mention changes nothing.",
].join("\n");

const LISTED =
  '{"decision":"block","reason":"Finish your task, then end on one of these lines: VERDICT: PASS, VERDICT: FAIL, VERDICT: DENIED"}\n';

function listedPayload(message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { agent_type: "viber:fixture-agent", stop_hook_active: false, last_assistant_message: message, ...extra };
}

const unlistedEndings: Array<[string, string]> = [
  ["an unlisted value", "work done\nVERDICT: MAYBE"],
  ["no verdict line", "work done and nothing else"],
  ["a listed value only before the last verdict line", "VERDICT: PASS\nthen I changed my mind\nVERDICT: MAYBE"],
  ["a lowercase value", "VERDICT: pass"],
  ["a prefix of a listed value", "VERDICT: PAS"],
];

for (const [label, message] of unlistedEndings) {
  test(`DoD.1: an agent ending on ${label} is blocked with the reason listing its file's values in file order`, async () => {
    assert.equal(await runInRoot({ "fixture-agent": AGENT_FILE }, listedPayload(message)), LISTED);
  });
}

const listedEndings: Array<[string, string]> = [
  ["VERDICT: FAIL", "work done\nVERDICT: FAIL\nREASON: x"],
  ["an AUDIT: line", "review done\nAUDIT: 3 findings"],
  ["a listed value after an unlisted one", "VERDICT: MAYBE\nno wait\n**VERDICT: DENIED**"],
];

for (const [label, message] of listedEndings) {
  test(`DoD.2: an agent whose file names values passes when it ends on ${label}`, async () => {
    assert.equal(await runInRoot({ "fixture-agent": AGENT_FILE }, listedPayload(message)), "");
  });
}

const markedEndings: Array<[string, string]> = [
  ["bold markers around the label alone", "work done\n**VERDICT:** PASS"],
  ["no blank after the colon", "work done\nVERDICT:PASS"],
  ["backticks around the whole line", "work done\n`VERDICT: PASS`"],
];

for (const [label, message] of markedEndings) {
  test(`DoD.1: an agent whose file names VERDICT: PASS passes when its last verdict line has ${label}`, async () => {
    assert.equal(await runInRoot({ "fixture-agent": AGENT_FILE }, listedPayload(message)), "");
  });
}

test("DoD.2: a **VERDICT:** MAYBE line is blocked with the reason listing the file's values", async () => {
  assert.equal(await runInRoot({ "fixture-agent": AGENT_FILE }, listedPayload("work done\n**VERDICT:** MAYBE")), LISTED);
});

const ALTERNATIVES_FILE = "End on `VERDICT: VERIFIED | PARTIALLY VERIFIED` or `VERDICT: REFUTED`.";

test("DoD.3: a fixture naming VERDICT: VERIFIED | PARTIALLY VERIFIED passes an agent ending on VERDICT: PARTIALLY VERIFIED", async () => {
  assert.equal(await runInRoot({ "fixture-agent": ALTERNATIVES_FILE }, listedPayload("done\nVERDICT: PARTIALLY VERIFIED")), "");
});

test("DoD.3: a multi-word value is matched whole, so its first word alone is blocked with the alternatives listed one by one", async () => {
  assert.equal(
    await runInRoot({ "fixture-agent": ALTERNATIVES_FILE }, listedPayload("done\nVERDICT: PARTIALLY")),
    '{"decision":"block","reason":"Finish your task, then end on one of these lines: VERDICT: VERIFIED, VERDICT: PARTIALLY VERIFIED, VERDICT: REFUTED"}\n',
  );
});

test("DoD.4: an agent type with no agent file passes any VERDICT: line", async () => {
  assert.equal(await runInRoot({}, listedPayload("VERDICT: MAYBE")), "");
});

test("DoD.4: an agent type with no agent file and no verdict line gets today's reason", async () => {
  assert.equal(await runInRoot({}, listedPayload("no line")), BLOCK);
});

test("DoD.4: an agent file naming no value passes any VERDICT: line", async () => {
  assert.equal(await runInRoot({ "fixture-agent": "Ends on a free-form line.\nVERDICT: is mentioned in prose only." }, listedPayload("VERDICT: MAYBE")), "");
});

test("DoD.4: an agent file naming no value and a message with no verdict line gets today's reason", async () => {
  assert.equal(await runInRoot({ "fixture-agent": "Ends on a free-form line." }, listedPayload("no line")), BLOCK);
});

test("DoD.5: stop_hook_active true passes an unlisted value and a missing line alike", async () => {
  assert.equal(await runInRoot({ "fixture-agent": AGENT_FILE }, listedPayload("VERDICT: MAYBE", { stop_hook_active: true })), "");
});

test("DoD.6: the hooks.json description names the unknown-value nudge", () => {
  const description = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8")).description as string;
  assert.match(description, /VERDICT: value its agent file does not name/);
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
  assert.match(description, /planning\.outside-plan-review/);
  assert.match(description, /schema note/);
});

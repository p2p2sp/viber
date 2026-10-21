/*
 * plan-hints.test.ts - proves viber/hooks/scripts/plan-hints.sh, the
 * UserPromptSubmit hook that hands plain plan mode its plan-writing rules.
 *
 * What it must do: on a prompt whose payload carries `"permission_mode":"plan"`,
 * print one UserPromptSubmit additionalContext naming every rule (a TaskCreate
 * task list, parallel subagents for independent tasks, a closing subagent review
 * task, a plain-plan-review after every plan write, the absolute path of every
 * `.temp/` file the plan rests on) - unless a
 * planner, intent or fixer Skill tool_use, or a typed /viber:intent or
 * /viber:fixer command, sits in the current plan-mode episode, where the viber
 * chain already covers them. Any other mode, a payload
 * without the key, or empty stdin prints nothing. A missing transcript counts as
 * no chain skill, so the hint still fires. Every case asserts exit 0: a broken
 * hint must never block a prompt.
 *
 * The episode window and the Skill grep are copied from plan-gate.sh (the grep
 * widened to intent and fixer),
 * so the fixture line shapes are the ones tests/viber/plan-gate.test.ts uses,
 * serialized with JSON.stringify for the same reason: the script reads raw text
 * with grep/sed and never parses JSON.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/plan-hints.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/hooks/scripts/plan-hints.sh");
const SHIPPED_HINTS = path.resolve(import.meta.dirname, "../../viber/hooks/content/plan-hints.md");

/** Copies plan-hints.sh into `<dir>/hooks/scripts/`, with `<dir>/hooks/content/plan-hints.md`
 *  holding `hints` (none written when null): the script finds its text beside itself. */
function isolatedScript(dir: string, hints: string | null): string {
  const scriptsDir = path.join(dir, "hooks", "scripts");
  const contentDir = path.join(dir, "hooks", "content");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(contentDir, { recursive: true });
  const dest = path.join(scriptsDir, "plan-hints.sh");
  fs.copyFileSync(SUT, dest);
  fs.chmodSync(dest, 0o755);
  if (hints !== null) fs.writeFileSync(path.join(contentDir, "plan-hints.md"), hints);
  return dest;
}

// --- fixture builders -------------------------------------------------

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

function writeTranscript(dir: string, lines: string[]): string {
  const file = path.join(dir, "t.jsonl");
  fs.writeFileSync(file, lines.map((l) => `${l}\n`).join(""));
  return file;
}

function skillUse(skill = "viber:planner"): string {
  return line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill } }] } });
}

/** A typed skill command, in the shape Claude Code records it: no Skill tool_use. */
function typedCommand(name: string): string {
  return line({ type: "user", message: { role: "user", content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>` } });
}

function permissionMode(mode: string): string {
  return line({ type: "permission-mode", permissionMode: mode, sessionId: "s" });
}

function enterPlanMode(): string {
  return line({ type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_enter", name: "EnterPlanMode", input: {} }] } });
}

// hooks.json invokes the script as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/plan-hints.sh"`,
// so the harness runs it through bash the same way.
async function run(input: string): Promise<string> {
  const result = await runScript(SUT, [], { shell: "bash", input });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  return result.stdout;
}

async function runPayload(payload: Record<string, unknown>): Promise<string> {
  return await run(JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "go", ...payload }));
}

/** Parses the hint and asserts it carries every rule. */
function assertHint(stdout: string): void {
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
  assert.match(ctx, /subagent reviews the finished implementation against the plan/);
  assert.match(ctx, /independent tasks in parallel subagents/);
  assert.match(ctx, /TaskCreate/);
  assert.match(ctx, /plain-plan-review agent after every write to the plan file/);
  assert.match(ctx, /absolute path of every `\.temp\/` file the plan rests on/);
}

// --- cases ------------------------------------------------------------

test("plan mode with no planner in the transcript -> additionalContext carries every rule", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [permissionMode("plan")]);
    assertHint(await runPayload({ permission_mode: "plan", transcript_path: f }));
  });
});

test("the hint carries exactly the five rules, with no line telling the model to skip them under a viber skill (the hook itself stays silent there)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [permissionMode("plan")]);
    const ctx = JSON.parse(await runPayload({ permission_mode: "plan", transcript_path: f })).hookSpecificOutput.additionalContext as string;
    assert.equal(ctx.split("\n").filter((l) => l.startsWith("- ")).length, 5, `expected five rule lines, got: ${ctx}`);
    assert.doesNotMatch(ctx, /viber|skip/i);
  });
});

test("file limit: the Plan review rule states the 8 repository files a plan may name and that the gate refuses a plan past it", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [permissionMode("plan")]);
    const ctx = JSON.parse(await runPayload({ permission_mode: "plan", transcript_path: f })).hookSpecificOutput.additionalContext as string;
    assert.match(ctx, /Plan review:.*names at most 8 repository files: the gate refuses a plan naming more/);
  });
});

test("the hint is the shipped hooks/content/plan-hints.md verbatim, trailing newlines cut (the text lives in the file, not the script)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [permissionMode("plan")]);
    const ctx = JSON.parse(await runPayload({ permission_mode: "plan", transcript_path: f })).hookSpecificOutput.additionalContext;
    assert.equal(ctx, fs.readFileSync(SHIPPED_HINTS, "utf8").replace(/\n+$/, ""));
  });
});

test("hint text with quotes, backslashes and tabs -> still one parseable JSON line carrying it exactly (the file is escaped, not pasted)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const text = 'Rules:\n- say "done"\tC:\\plans\n';
    const script = isolatedScript(dir, text);
    const result = await runScript(script, [], { shell: "bash", input: JSON.stringify({ permission_mode: "plan" }) });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, text.replace(/\n+$/, ""));
  });
});

test("an empty or missing plan-hints.md -> exit 0, nothing printed (fail-open, no empty context injected)", async () => {
  for (const hints of ["", null]) {
    await withTempDir("p2p2-plan-hints-", async (dir) => {
      const script = isolatedScript(dir, hints);
      const result = await runScript(script, [], { shell: "bash", input: JSON.stringify({ permission_mode: "plan" }) });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "", `expected silence for hints=${JSON.stringify(hints)}`);
    });
  }
});

test("default permission mode -> nothing printed (the hint is for plan mode only)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, []);
    assert.equal(await runPayload({ permission_mode: "default", transcript_path: f }), "");
  });
});

test("a payload with no permission_mode key -> nothing printed", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, []);
    assert.equal(await runPayload({ transcript_path: f }), "");
  });
});

test("empty stdin -> exit 0, nothing printed (fail-open)", async () => {
  assert.equal(await run(""), "");
});

test("a planner Skill tool_use in the current episode -> nothing printed (the viber planner covers these rules)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [permissionMode("plan"), skillUse()]);
    assert.equal(await runPayload({ permission_mode: "plan", transcript_path: f }), "");
    const bare = writeTranscript(dir, [skillUse("planner")]);
    assert.equal(await runPayload({ permission_mode: "plan", transcript_path: bare }), "");
  });
});

test("an intent or fixer Skill tool_use in the current episode -> nothing printed (both hand off to the planner, which covers these rules)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    for (const skill of ["viber:intent", "intent", "viber:fixer", "fixer"]) {
      const f = writeTranscript(dir, [permissionMode("plan"), skillUse(skill)]);
      assert.equal(await runPayload({ permission_mode: "plan", transcript_path: f }), "", `expected silence after ${skill}`);
    }
  });
});

test("a typed /viber:intent or /viber:fixer command in the current episode -> nothing printed (a typed command records no Skill tool_use)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    for (const name of ["viber:intent", "viber:fixer"]) {
      const f = writeTranscript(dir, [permissionMode("plan"), typedCommand(name)]);
      assert.equal(await runPayload({ permission_mode: "plan", transcript_path: f }), "", `expected silence after /${name}`);
    }
  });
});

test("a typed /viber:intent with arguments, in the full record shape Claude Code writes -> nothing printed (metadata keys before the message must not hide the tag)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const real = line({
      parentUuid: "p",
      isSidechain: false,
      promptId: "b7603b85",
      type: "user",
      message: { role: "user", content: "<command-message>viber:intent</command-message>\n<command-name>/viber:intent</command-name>\n<command-args>#12</command-args>" },
      uuid: "u",
      timestamp: "2026-09-25T22:45:00.000Z",
    });
    const f = writeTranscript(dir, [permissionMode("plan"), real]);
    assert.equal(await runPayload({ permission_mode: "plan", transcript_path: f }), "");
  });
});

test("a typed command that is not viber intent or fixer, or one before the episode -> the hint fires (a bare /intent may belong to another plugin)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const other = writeTranscript(dir, [permissionMode("plan"), typedCommand("intent"), typedCommand("viber:triage")]);
    assertHint(await runPayload({ permission_mode: "plan", transcript_path: other }));
    const earlier = writeTranscript(dir, [typedCommand("viber:intent"), permissionMode("default"), permissionMode("plan")]);
    assertHint(await runPayload({ permission_mode: "plan", transcript_path: earlier }));
  });
});

test("assistant text quoting the command tag -> the hint fires (only a user message opening with the tag counts)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const quoted = line({ type: "assistant", message: { content: [{ type: "text", text: "<command-message>viber:intent</command-message>" }] } });
    const f = writeTranscript(dir, [permissionMode("plan"), quoted]);
    assertHint(await runPayload({ permission_mode: "plan", transcript_path: f }));
  });
});

test("an unrelated viber Skill in the current episode -> the hint still fires (only the planning chain silences it)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [permissionMode("plan"), skillUse("viber:triage")]);
    assertHint(await runPayload({ permission_mode: "plan", transcript_path: f }));
  });
});

test("an intent Skill before a later non-plan permission mode -> the hint fires again (an earlier interview does not silence a new plain plan)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [skillUse("viber:intent"), permissionMode("default"), permissionMode("plan")]);
    assertHint(await runPayload({ permission_mode: "plan", transcript_path: f }));
  });
});

test("a planner Skill before a later non-plan permission mode -> the hint fires again (an earlier episode does not silence a new plain plan)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [skillUse(), permissionMode("default"), permissionMode("plan")]);
    assertHint(await runPayload({ permission_mode: "plan", transcript_path: f }));
  });
});

test("a mid-turn non-plan record between the planner Skill and its own EnterPlanMode -> nothing printed (the planner still owns the episode)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [permissionMode("acceptEdits"), skillUse(), permissionMode("acceptEdits"), enterPlanMode(), permissionMode("plan")]);
    assert.equal(await runPayload({ permission_mode: "plan", transcript_path: f }), "");
  });
});

test("a planner that stopped before EnterPlanMode, then a new user prompt enters plan mode -> the hint fires (plain plan)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const prompt = line({ type: "user", message: { role: "user", content: "just plan it" } });
    const f = writeTranscript(dir, [skillUse(), permissionMode("acceptEdits"), prompt, enterPlanMode(), permissionMode("plan")]);
    assertHint(await runPayload({ permission_mode: "plan", transcript_path: f }));
  });
});

/** Claude Code's `api-request-blob` record: one line replaying an earlier message, its blocks as live-looking JSON. */
function blob(role: "assistant" | "user", content: unknown): string {
  return line({ type: "api-request-blob", sessionId: "s", hash: "h", message: { role, content } });
}

test("a blob line replaying a planner Skill tool_use -> the hint fires as without it (a replay is no live Skill call)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const replay = blob("assistant", [{ type: "tool_use", id: "toolu_s", name: "Skill", input: { skill: "viber:planner" } }]);
    const f = writeTranscript(dir, [permissionMode("plan"), replay]);
    assertHint(await runPayload({ permission_mode: "plan", transcript_path: f }));
  });
});

test("a blob line replaying a user prompt between the planner Skill and its EnterPlanMode does not end the pending entry -> nothing printed", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    const f = writeTranscript(dir, [permissionMode("acceptEdits"), skillUse(), permissionMode("acceptEdits"), blob("user", "earlier prompt"), enterPlanMode(), permissionMode("plan")]);
    assert.equal(await runPayload({ permission_mode: "plan", transcript_path: f }), "");
  });
});

test("plan mode with a transcript that does not exist -> the hint still fires (a missing transcript counts as no planner)", async () => {
  await withTempDir("p2p2-plan-hints-", async (dir) => {
    assertHint(await runPayload({ permission_mode: "plan", transcript_path: path.join(dir, "gone.jsonl") }));
    assertHint(await runPayload({ permission_mode: "plan" }));
  });
});

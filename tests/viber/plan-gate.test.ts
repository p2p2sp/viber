/*
 * plan-gate.test.ts - proves viber/hooks/scripts/plan-gate.sh, the PreToolUse
 * gate on ExitPlanMode: the planner's review round, enforced by the harness
 * rather than by the model.
 *
 * What it must do: arm ONLY when the current plan-mode episode carries both
 * signals of the planner skill driving the plan (a Skill tool_use for `planner`,
 * the only form it can take, plus a Write/Edit of a `plans/*.md` file), then allow
 * ExitPlanMode only for a `viber:planner-review` dispatch that FOLLOWED the last
 * plan write, returned `VERDICT: PASS`, and whose plan file has not been touched
 * since (mtime vs. the verdict's transcript timestamp). A plain plan-mode plan
 * (a plan write with no planner skill) is gated the same way by
 * `viber:plain-plan-review`, but only when the session cwd's `.claude/viber.yml`
 * turns `plain-plan-review` on. Everything else - plain-plan-review off, an episode that
 * already built a plan, an unreadable transcript - passes untouched: a broken
 * gate must never trap the user in plan mode, so every case here also asserts
 * exit 0 and parseable JSON.
 *
 * Fixture lines are built as JS objects and serialized with JSON.stringify, so
 * quotes, backslashes and newlines are escaped exactly the way the real
 * transcript author encodes them - the script reads that text with grep/sed/awk
 * and never parses JSON, so hand-escaped fixtures would prove the wrong thing.
 * The line shapes (`"type":"permission-mode"`, `"name":"Skill","input":{"skill":`,
 * `"subagent_type":`) are taken from real transcripts.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/plan-gate.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { withStub } from "../harness/stub.ts";
import { slash } from "../harness/paths.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/hooks/scripts/plan-gate.sh");

// --- fixture builders -------------------------------------------------

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

function writeTranscript(dir: string, name: string, lines: string[]): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, lines.map((l) => `${l}\n`).join(""));
  return file;
}

interface Decision {
  decision: string;
  reason?: string;
}

// plan-gate.sh ships mode 100755, but hooks.json invokes it as
// `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/plan-gate.sh"` - the harness runs it
// the same way, because this file tests the script's content, not its exec bit.
async function runPayload(payload: Record<string, unknown>): Promise<Decision> {
  const result = await runScript(SUT, [], { shell: "bash", input: JSON.stringify(payload) });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  let json: { hookSpecificOutput?: { hookEventName?: string; permissionDecision?: string; permissionDecisionReason?: string } };
  try {
    json = JSON.parse(result.stdout);
  } catch {
    throw new Error(`expected parseable JSON stdout, got: ${result.stdout}`);
  }
  const out = json.hookSpecificOutput;
  assert.ok(out, `expected hookSpecificOutput, got: ${result.stdout}`);
  assert.equal(out.hookEventName, "PreToolUse");
  return { decision: out.permissionDecision ?? "", reason: out.permissionDecisionReason };
}

async function runCase(transcriptPath: string, cwd?: string): Promise<Decision> {
  const payload: Record<string, unknown> = { transcript_path: transcriptPath, tool_name: "ExitPlanMode" };
  if (cwd) payload.cwd = cwd;
  return await runPayload(payload);
}

/** The dated plan layout plan-path.sh owns; `plans` is the directory segment the
 *  gate anchors on. A path that never exists on disk is fine for every case but
 *  the mtime guard - the guard is skipped when the file cannot be read. */
const PLAN = "/repo/.claude/plans/2026-09-20-10-00-00_feat-x/plan.md";

/** Signal 1a: the planner skill invoked through the Skill tool. */
function skillUse(skill = "viber:planner"): string {
  return line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill } }] } });
}

/** NOT a signal: a typed command. The planner skill is user-invocable: false, so
 *  `/viber:planner` cannot be typed at all, and a `planner` command that IS typeable
 *  belongs to some other plugin. */
function typedCommand(command = "/viber:planner"): string {
  return line({ type: "user", message: { content: `<command-name>${command}</command-name>` } });
}

/** Signal 2: the plan file itself, written by Write or Edit. */
function planWrite(filePath = PLAN, name: "Write" | "Edit" = "Write"): string {
  return line({ type: "assistant", message: { content: [{ type: "tool_use", name, input: { file_path: filePath, content: "# Plan" } }] } });
}

function dispatch(id?: string, agent = "viber:planner-review"): string {
  const use: Record<string, unknown> = {
    type: "tool_use",
    name: "Agent",
    input: { subagent_type: agent, prompt: `review ${PLAN}` },
  };
  if (id) use.id = id;
  return line({ type: "assistant", message: { content: [use] } });
}

interface VerdictOpts {
  id?: string;
  timestamp?: string;
  body?: string;
}

function verdict(value: "PASS" | "FAIL" | "DENIED", opts: VerdictOpts = {}): string {
  const block: Record<string, unknown> = {
    type: "tool_result",
    content: opts.body ?? `## Plan Review\nVERDICT: ${value}\nnotes.`,
  };
  if (opts.id) block.tool_use_id = opts.id;
  const obj: Record<string, unknown> = { type: "user", message: { content: [block] } };
  if (opts.timestamp) obj.timestamp = opts.timestamp;
  return line(obj);
}

function permissionMode(mode: string): string {
  return line({ type: "permission-mode", permissionMode: mode, sessionId: "s" });
}

/** The model entering plan mode itself, as the planner does after its Skill loads.
 *  With an id the key order is the real transcript's: type, id, name. */
function enterPlanMode(id?: string): string {
  const use = id ? { type: "tool_use", id, name: "EnterPlanMode", input: {} } : { type: "tool_use", name: "EnterPlanMode", input: {} };
  return line({ type: "assistant", message: { content: [use] } });
}

/** A typed user prompt: string content, unlike a tool_result's array. */
function userPrompt(text: string): string {
  return line({ type: "user", message: { role: "user", content: text } });
}

/** A plan file that really exists, so the mtime guard has something to stat.
 *  The default content opens with the planner's frontmatter `source:` line, the
 *  second half of planner ownership; pass other content for a plain plan. */
function realPlan(dir: string, rel = ".claude/plans/2026-09-20-10-00-00_feat-x/plan.md", content?: string): string {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content ?? `---\nsource: ${file}\n---\n# Plan\n`);
  return file;
}

const PASS = verdict("PASS");
const FAIL = verdict("FAIL");

// --- fail-open matrix -------------------------------------------------

test("empty stdin -> allow (a broken gate must never trap the user in plan mode)", async () => {
  const result = await runScript(SUT, [], { shell: "bash", input: "" });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "allow");
});

test("a payload with no transcript_path key -> allow", async () => {
  assert.equal((await runPayload({ tool_name: "ExitPlanMode" })).decision, "allow");
});

test("transcript_path pointing at a file that does not exist -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    assert.equal((await runCase(path.join(dir, "gone.jsonl"))).decision, "allow");
  });
});

test("a transcript that is not JSONL at all -> allow, no crash", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = path.join(dir, "garbage.jsonl");
    fs.writeFileSync(f, "not json at all\n{{{ random garbage\n");
    assert.equal((await runCase(f)).decision, "allow");
  });
});

// --- arming: both signals, inside the episode -------------------------

test("plain plan mode with no planner skill and no session cwd -> allow (plain-plan-review cannot be read, so it is off)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [planWrite()]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("the planner skill running with no plan write yet -> allow (nothing to review)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse()]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("both signals but no review dispatch -> deny naming the plan file", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite()]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /plan\.md/);
    assert.match(reason ?? "", /planner-review agent has not run on this version/);
  });
});

test("the planner refusal names refs: and memory:, as planner-review.md expects its input", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite()]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /refs:/);
    assert.match(reason ?? "", /memory:/);
  });
});

test("the planner refusal also names input:, as planner-review.md expects the confirmed interview summary or bug diagnosis", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite()]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /input:/);
  });
});

test("the unprefixed skill spelling 'planner' arms the gate too (the install form must not decide)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse("planner"), planWrite()]);
    assert.equal((await runCase(f)).decision, "deny");
  });
});

test("a Skill tool_use for another plugin's 'xyz:planner' does not arm the gate -> allow (only viber:planner and bare planner do)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse("xyz:planner"), planWrite()]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a typed /viber:planner does NOT arm the gate (planner is user-invocable: false; a typeable 'planner' is another plugin's)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [typedCommand(), planWrite()]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("another plugin's /xyz:planner over a plan write stays out of viber's way -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [typedCommand("/xyz:planner"), planWrite()]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("an Edit of the plan counts as the plan write, not only a Write", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(PLAN, "Edit")]);
    assert.equal((await runCase(f)).decision, "deny");
  });
});

test("a Windows plan path (backslashes) arms the gate the same way", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const win = "C:\\Users\\dariu\\repo\\docs\\plans\\2026-09-20_feat-x\\plan.md";
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(win)]);
    assert.equal((await runCase(f)).decision, "deny");
  });
});

test("a plan path merely quoted inside another tool's payload does not arm the gate -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    // A Write whose CONTENT quotes a planner Skill call: every marker is present
    // as text, but escaped one level deeper, so neither grep can match it.
    const quoted = line({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Write",
            input: { file_path: "/repo/notes.md", content: `example: {"name":"Skill","input":{"skill":"planner"}} writing ${PLAN}` },
          },
        ],
      },
    });
    const f = writeTranscript(dir, "t.jsonl", [quoted]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a plan read back rather than written does not arm the gate -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const read = line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: PLAN } }] } });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), read]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a plan written outside a directory literally named 'plans' does not arm the gate -> allow (known gap: a viber plan declares no format marker, so there is no fallback like superdev's)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite("/repo/specs/j.md")]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

// --- the episode window -----------------------------------------------

test("a non-plan permission mode recorded after both signals closes the episode -> allow (a plan approved and built earlier cannot re-arm the gate)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const armed = writeTranscript(dir, "armed.jsonl", [skillUse(), planWrite()]);
    assert.equal((await runCase(armed)).decision, "deny", "control: these two lines do arm the gate");

    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), permissionMode("default")]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a permission mode of 'plan' does not close the episode -> still gated", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), permissionMode("plan")]);
    assert.equal((await runCase(f)).decision, "deny");
  });
});

test("signals recorded after the last non-plan permission mode are inside the episode -> gated", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [permissionMode("acceptEdits"), skillUse(), planWrite()]);
    assert.equal((await runCase(f)).decision, "deny");
  });
});

test("a mid-turn non-plan record between the planner Skill and its own EnterPlanMode keeps the planner in the episode -> deny naming planner-review", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [
      permissionMode("acceptEdits"),
      skillUse(),
      permissionMode("acceptEdits"),
      enterPlanMode("toolu_enter"),
      permissionMode("plan"),
      planWrite(),
    ]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /planner-review agent has not run on this version/);

    const reviewed = writeTranscript(dir, "r.jsonl", [
      permissionMode("acceptEdits"),
      skillUse(),
      permissionMode("acceptEdits"),
      enterPlanMode(),
      permissionMode("plan"),
      planWrite(),
      dispatch(),
      PASS,
    ]);
    assert.equal((await runCase(reviewed)).decision, "allow");
  });
});

// --- the verdict ------------------------------------------------------

test("dispatch + VERDICT: PASS -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), PASS]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("dispatch + VERDICT: FAIL -> deny naming the verdict it read", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), FAIL]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /returned 'VERDICT: FAIL'/);
    assert.match(reason ?? "", /verdict on line 4/);
  });
});

test("dispatch + VERDICT: DENIED -> deny asking for the refused permission, not for findings", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const denied = verdict("DENIED", { body: "VERDICT: DENIED\nREASON: Read: /x/plan.md" });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), denied]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /returned 'VERDICT: DENIED'/);
    assert.match(reason ?? "", /grant the permission/);
    assert.doesNotMatch(reason ?? "", /fix the findings/);
  });
});

test("a dispatch that returned no verdict at all -> deny naming the dispatch line", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch()]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /returned no 'VERDICT:' line/);
    assert.match(reason ?? "", /transcript line 3/);
  });
});

test("the unprefixed subagent spelling 'planner-review' is recognized -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const bare = line({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Agent", input: { subagent_type: "planner-review", prompt: "review" } }] },
    });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), bare, PASS]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a review that ran BEFORE the last plan write does not count -> deny (the current version was never reviewed)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), PASS, planWrite()]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /has not run on this version/);
  });
});

test("FAIL then a re-review PASS -> allow (the newest completed pair binds)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), FAIL, dispatch(), PASS]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("PASS then a re-review FAIL -> deny (the newest completed pair binds both ways)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), PASS, dispatch(), FAIL]);
    assert.equal((await runCase(f)).decision, "deny");
  });
});

test("a 'VERDICT: PASS' quoted in prose with no dispatch before it -> deny (the gate does not take the model's word for it)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const quoted = line({ type: "assistant", message: { content: "The reviewer would say VERDICT: PASS here.\n" } });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), quoted]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /has not run on this version/);
  });
});

test("a qualified 'VERDICT: PASS is not warranted' does not read as a PASS -> deny on the real FAIL below it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const mixed = verdict("FAIL", { body: "VERDICT: PASS is not warranted; see below.\nVERDICT: FAIL\nfix task 3." });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), mixed]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /returned 'VERDICT: FAIL'/);
  });
});

test("a back-ticked `VERDICT: `PASS`` -> allow (the agent's own markdown must not gate the user)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const ticked = verdict("PASS", { body: "## Plan Review\nVERDICT: `PASS`\nall good." });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), ticked]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a bold '**VERDICT: PASS**' inside a background agent's <result> -> allow (the agent's own markdown must not gate the user)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const bold = line({ type: "user", message: { content: "agent finished: <result>**VERDICT: PASS**\n\n**FINDINGS:**\nnone</result>" } });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), bold]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a bold label '**VERDICT:** PASS' -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const label = verdict("PASS", { body: "**VERDICT:** PASS\n**FINDINGS:** none" });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), label]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a bold '**VERDICT: FAIL**' -> deny naming the verdict it read (markdown never turns a FAIL into a missing verdict)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const bold = verdict("FAIL", { body: "**VERDICT: FAIL**\n\n**FINDINGS:**\nfix task 3." });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), bold]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /returned 'VERDICT: FAIL'/);
  });
});

test("a bold qualified '**VERDICT: PASS** is not warranted' does not read as a PASS -> deny on the real FAIL below it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const mixed = verdict("FAIL", { body: "**VERDICT: PASS** is not warranted; see below.\n**VERDICT: FAIL**\nfix task 3." });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), mixed]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /returned 'VERDICT: FAIL'/);
  });
});

test("a verdict delivered inside a background agent's <result> element -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const bg = line({ type: "user", message: { content: "agent finished: <result>VERDICT: PASS</result>" } });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), bg]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

// --- dispatch-id binding ----------------------------------------------

test("a verdict carrying the dispatch's own tool-use id is the one that binds -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const id = "toolu_01AbCdEf";
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(id), verdict("PASS", { id })]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("an id-bearing dispatch with only a foreign VERDICT: PASS after it -> deny, own review still in flight", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const id = "toolu_01Mine";
    const f = writeTranscript(dir, "t.jsonl", [
      skillUse(),
      planWrite(),
      dispatch(id),
      verdict("PASS", { id: "toolu_01Other" }),
    ]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /let the review finish/);
  });
});

test("a sibling agent's PASS cannot stand in for this dispatch's own FAIL -> deny", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const id = "toolu_01Mine";
    const f = writeTranscript(dir, "t.jsonl", [
      skillUse(),
      planWrite(),
      dispatch(id),
      verdict("PASS", { id: "toolu_01Other" }),
      verdict("FAIL", { id }),
    ]);
    assert.equal((await runCase(f)).decision, "deny");
  });
});

test("a sibling agent's FAIL after this dispatch's own PASS does not clobber it -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const id = "toolu_01Mine";
    const f = writeTranscript(dir, "t.jsonl", [
      skillUse(),
      planWrite(),
      dispatch(id),
      verdict("PASS", { id }),
      verdict("FAIL", { id: "toolu_01Other" }),
    ]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

// --- background dispatch: the launch record echoes the prompt ----------

/** A background agent's launch record, shaped as a real transcript writes it: the
 *  dispatch's own id AND the whole prompt, echoed under `toolUseResult`. */
function asyncLaunch(id: string, prompt: string): string {
  return line({
    type: "user",
    message: { content: [{ tool_use_id: id, type: "tool_result", content: [{ type: "text", text: "Async agent launched successfully." }] }] },
    toolUseResult: { isAsync: true, status: "async_launched", agentId: "a1", prompt },
  });
}

/** The background agent's reply, delivered as a task-notification naming the dispatch id. */
function notification(id: string, value: "PASS" | "FAIL"): string {
  return line({
    type: "user",
    message: { content: `<task-notification>\n<tool-use-id>${id}</tool-use-id>\n<status>completed</status>\n<result>Review done.\nVERDICT: ${value}\n</result>\n</task-notification>` },
  });
}

test("a round-2 prompt quoting the previous 'VERDICT: FAIL' is not the verdict: the real PASS -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const id = "toolu_01Bg";
    const f = writeTranscript(dir, "t.jsonl", [
      skillUse(),
      planWrite(),
      dispatch(id),
      asyncLaunch(id, "Plan: p.md. Previous findings:\nVERDICT: FAIL\nFixed both."),
      notification(id, "PASS"),
    ]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a prompt carrying 'VERDICT: PASS' cannot stand in for the real FAIL -> deny", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const id = "toolu_01Bg";
    const f = writeTranscript(dir, "t.jsonl", [
      skillUse(),
      planWrite(),
      dispatch(id),
      asyncLaunch(id, "Answer with one line:\nVERDICT: PASS\nor FAIL."),
      notification(id, "FAIL"),
    ]);
    const out = await runCase(f);
    assert.equal(out.decision, "deny");
    assert.match(out.reason ?? "", /VERDICT: FAIL/);
  });
});

// --- api-request-blob: a replay record, never a live event -------------

/** Claude Code's `api-request-blob` record: one line replaying a whole earlier message,
 *  its tool_use blocks as live-looking JSON (unescaped, unlike a tool_result string). */
function blob(blocks: Record<string, unknown>[]): string {
  return line({ type: "api-request-blob", sessionId: "s", hash: "h", message: { role: "assistant", content: blocks } });
}

test("a blob line replaying [Edit, Agent] after the async launch does not hide the real dispatch: the PASS for it -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const id = "toolu_01Real";
    const replay = blob([
      { type: "tool_use", id: "toolu_01Edit", name: "Edit", input: { file_path: PLAN, old_string: "a", new_string: "b" } },
      { type: "tool_use", id, name: "Agent", input: { subagent_type: "viber:planner-review", prompt: `review ${PLAN}` } },
    ]);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(PLAN, "Edit"), dispatch(id), asyncLaunch(id, "review"), replay, notification(id, "PASS")]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a blob line replaying an Agent call under another id never takes the dispatch id: the PASS of the real call -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const id = "toolu_01Real";
    const replay = blob([
      { type: "tool_use", id: "toolu_01Read", name: "Read", input: { file_path: "/repo/x.md" } },
      { type: "tool_use", id: "toolu_01Other", name: "Agent", input: { subagent_type: "viber:planner-review", prompt: "review" } },
    ]);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(id), asyncLaunch(id, "review"), replay, notification(id, "PASS")]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

// --- the mtime guard: a PASS approves the plan AS REVIEWED -------------

test("a plan modified after its own PASS -> deny (catches an edit made through a channel the transcript scan cannot see)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = realPlan(dir);
    const stale = new Date(Date.now() - 3600_000).toISOString();
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatch(), verdict("PASS", { timestamp: stale })]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /was modified after its 'VERDICT: PASS'/);
  });
});

test("a plan older than its own PASS -> allow (no false tamper)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = realPlan(dir);
    const fresh = new Date(Date.now() + 3600_000).toISOString();
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatch(), verdict("PASS", { timestamp: fresh })]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a verdict line with no timestamp skips the mtime check -> allow (fail-open)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = realPlan(dir);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatch(), PASS]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a re-review after the out-of-band edit clears the mtime tamper -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = realPlan(dir);
    const stale = new Date(Date.now() - 3600_000).toISOString();
    const fresh = new Date(Date.now() + 3600_000).toISOString();
    const f = writeTranscript(dir, "t.jsonl", [
      skillUse(),
      planWrite(plan),
      dispatch(),
      verdict("PASS", { timestamp: stale }),
      dispatch(),
      verdict("PASS", { timestamp: fresh }),
    ]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a relative plan file_path resolves against the session cwd -> the mtime guard still fires", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const rel = ".claude/plans/2026-09-20-10-00-00_feat-x/plan.md";
    realPlan(dir, rel);
    const stale = new Date(Date.now() - 3600_000).toISOString();
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(rel), dispatch(), verdict("PASS", { timestamp: stale })]);
    assert.equal((await runCase(f, dir)).decision, "deny");
    // Without the cwd the path resolves to nothing and the guard is skipped.
    assert.equal((await runCase(f)).decision, "allow");
  });
});

// --- a malformed pairing read fails open --------------------------------

test("a broken awk on PATH (the pairing read comes back malformed) -> allow, not the 'no review yet' deny", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), PASS]);
    await withStub("awk", "exit 1", async (stubDir) => {
      const result = await runScript(SUT, [], {
        shell: "bash",
        input: JSON.stringify({ transcript_path: f, tool_name: "ExitPlanMode" }),
        stubDirs: [stubDir],
      });
      assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
      const json = JSON.parse(result.stdout);
      assert.equal(json.hookSpecificOutput.permissionDecision, "allow");
    });
  });
});

// --- transcript shape edge cases --------------------------------------

test("a transcript with CRLF line endings still resolves the happy path -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = path.join(dir, "crlf.jsonl");
    fs.writeFileSync(f, [skillUse(), planWrite(), dispatch(), PASS].join("\r\n") + "\r\n");
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("thousands of noise lines around the signals still resolve the happy path -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const noise = line({ type: "user", message: { content: "noise line, not relevant to the gate" } });
    const f = writeTranscript(dir, "t.jsonl", [
      ...Array(3000).fill(noise),
      skillUse(),
      planWrite(),
      ...Array(1000).fill(noise),
      dispatch(),
      PASS,
    ]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("the last of several plan writes is the one that must be reviewed", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const first = "/repo/.claude/plans/2026-09-20-09-00-00_a/plan.md";
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(first), dispatch(), PASS, planWrite(PLAN), dispatch(), PASS]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

// --- plain plan mode: plain-plan-review, behind the plain-plan-review switch --

const PLAIN = "viber:plain-plan-review";

/** The switch as `.claude/viber.yml` groups it: a child of `planning:`. */
const GROUPED_ON = "planning:\n  plain-plan-review: true\n";
const GROUPED_OFF = "planning:\n  plain-plan-review: false\n";

/** A session cwd whose .claude/viber.yml carries the given body. */
function sessionWithConfig(dir: string, body: string): string {
  const cwd = path.join(dir, "session");
  fs.mkdirSync(path.join(cwd, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".claude", "viber.yml"), body);
  return cwd;
}

test("plain plan with plain-plan-review on and no review dispatch -> deny naming plain-plan-review and what to pass it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [planWrite()]);
    const { decision, reason } = await runCase(f, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /plain-plan-review agent has not run on this version/);
    assert.match(reason ?? "", /one sentence stating the user's goal/);
    assert.match(reason ?? "", /planning\.plain-plan-review in \.claude\/viber\.yml/);
  });
});

test("the hooks.json description names the grouped key planning.plain-plan-review (the user-facing statement of what arms the gate)", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json"), "utf8"));
  assert.match(manifest.description, /planning\.plain-plan-review/);
});

test("a flat plain-plan-review: true alone leaves the plain gate unarmed -> allow (only the planning: group arms it)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, "plain-plan-review: true\n");
    const f = writeTranscript(dir, "t.jsonl", [planWrite()]);
    assert.equal((await runCase(f, cwd)).decision, "allow");
  });
});

test("plain plan with plain-plan-review off, absent, or no config file at all -> allow (the switch is the only arming signal)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [planWrite()]);
    assert.equal((await runCase(f, sessionWithConfig(path.join(dir, "a"), GROUPED_OFF))).decision, "allow");
    assert.equal((await runCase(f, sessionWithConfig(path.join(dir, "b"), "planning:\n  adr: true\n"))).decision, "allow");
    const bare = path.join(dir, "c");
    fs.mkdirSync(bare);
    assert.equal((await runCase(f, bare)).decision, "allow");
  });
});

test("plain plan with plain-plan-review on: plain-plan-review PASS -> allow, FAIL -> deny", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const pass = writeTranscript(dir, "pass.jsonl", [planWrite(), dispatch(undefined, PLAIN), PASS]);
    assert.equal((await runCase(pass, cwd)).decision, "allow");
    const fail = writeTranscript(dir, "fail.jsonl", [planWrite(), dispatch(undefined, PLAIN), FAIL]);
    const { decision, reason } = await runCase(fail, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /plain-plan-review agent returned 'VERDICT: FAIL'/);
  });
});

test("the unprefixed subagent spelling 'plain-plan-review' is recognized -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [planWrite(), dispatch(undefined, "plain-plan-review"), PASS]);
    assert.equal((await runCase(f, cwd)).decision, "allow");
  });
});

test("a planner-review PASS does not satisfy the plain gate -> deny (each path answers only to its own reviewer)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [planWrite(), dispatch(), PASS]);
    const { decision, reason } = await runCase(f, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /plain-plan-review agent has not run on this version/);
  });
});

test("a plain-plan-review PASS does not satisfy the planner gate -> deny, whatever plain-plan-review says", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(undefined, PLAIN), PASS]);
    for (const [i, body] of [GROUPED_ON, GROUPED_OFF].entries()) {
      const { decision, reason } = await runCase(f, sessionWithConfig(path.join(dir, `s${i}`), body));
      assert.equal(decision, "deny");
      assert.match(reason ?? "", /viber:planner-review agent has not run on this version/);
    }
  });
});

test("plain plan modified after its plain-plan-review PASS -> deny (the mtime guard covers the plain path too)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const plan = realPlan(dir);
    const stale = new Date(Date.now() - 3600_000).toISOString();
    const f = writeTranscript(dir, "t.jsonl", [planWrite(plan), dispatch(undefined, PLAIN), verdict("PASS", { timestamp: stale })]);
    const { decision, reason } = await runCase(f, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /was modified after its 'VERDICT: PASS' - dispatch the viber:plain-plan-review agent/);
  });
});

// --- planner ownership across a mid-turn permission-mode record ----------

test("a mid-turn record before the planner EnterPlanMode with plain-plan-review on -> planner-review still owns the plan, a plain-plan-review PASS never satisfies it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const head = [skillUse(), permissionMode("acceptEdits"), enterPlanMode(), planWrite()];
    const plain = writeTranscript(dir, "plain.jsonl", [...head, dispatch(undefined, PLAIN), PASS]);
    const { decision, reason } = await runCase(plain, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:planner-review agent has not run on this version/);
    const own = writeTranscript(dir, "own.jsonl", [...head, dispatch(), PASS]);
    assert.equal((await runCase(own, cwd)).decision, "allow");
  });
});

test("a planner from an earlier, approved episode does not own a later plain plan -> the plain path (a plan approved earlier cannot re-arm the planner gate)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [
      skillUse(),
      enterPlanMode(),
      permissionMode("plan"),
      planWrite(),
      dispatch(),
      PASS,
      permissionMode("acceptEdits"),
      userPrompt("next thing"),
      enterPlanMode(),
      permissionMode("plan"),
      planWrite(),
    ]);
    const { decision, reason } = await runCase(f, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /plain-plan-review agent has not run on this version/);
  });
});

test("a planner that stopped before EnterPlanMode, then a new user prompt enters plan mode -> the plain path, not planner-review", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [
      skillUse(),
      permissionMode("acceptEdits"),
      userPrompt("just plan it"),
      enterPlanMode(),
      permissionMode("plan"),
      planWrite(),
    ]);
    const { decision, reason } = await runCase(f, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /plain-plan-review agent has not run on this version/);
  });
});

// --- planner ownership needs the planner frontmatter in the plan file ----

/** The finding sequence: plan mode on, the planner Skill refused, then the user
 *  asks for a plain plan in the same episode. */
function refusedPlannerThenPlan(plan: string): string[] {
  return [permissionMode("plan"), skillUse(), userPrompt("write a plain plan"), planWrite(plan)];
}

test("a refused planner followed by a plain plan (no frontmatter) -> the plain path: a plain-plan-review PASS allows whatever the switch says", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = realPlan(dir, undefined, "# Plan\n");
    const f = writeTranscript(dir, "t.jsonl", [...refusedPlannerThenPlan(plan), dispatch(undefined, PLAIN), PASS]);
    for (const [i, body] of [GROUPED_ON, GROUPED_OFF].entries()) {
      assert.equal((await runCase(f, sessionWithConfig(path.join(dir, `s${i}`), body))).decision, "allow");
    }
    const unreviewed = writeTranscript(dir, "u.jsonl", refusedPlannerThenPlan(plan));
    const { decision, reason } = await runCase(unreviewed, sessionWithConfig(path.join(dir, "on"), GROUPED_ON));
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:plain-plan-review agent has not run on this version/);
  });
});

test("a plan opening with the planner frontmatter (LF or CRLF) stays with planner-review: a plain-plan-review PASS -> deny, a planner-review PASS -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const lf = realPlan(dir, ".claude/plans/lf/plan.md");
    const crlf = realPlan(dir, ".claude/plans/crlf/plan.md", "---\r\nsource: x.md\r\n---\r\n# Plan\r\n");
    for (const [n, plan] of [lf, crlf].entries()) {
      const plain = writeTranscript(dir, `plain${n}.jsonl`, [...refusedPlannerThenPlan(plan), dispatch(undefined, PLAIN), PASS]);
      for (const [i, body] of [GROUPED_ON, GROUPED_OFF].entries()) {
        const { decision, reason } = await runCase(plain, sessionWithConfig(path.join(dir, `s${n}${i}`), body));
        assert.equal(decision, "deny");
        assert.match(reason ?? "", /viber:planner-review agent has not run on this version/);
      }
      const own = writeTranscript(dir, `own${n}.jsonl`, [...refusedPlannerThenPlan(plan), dispatch(), PASS]);
      assert.equal((await runCase(own, sessionWithConfig(path.join(dir, `o${n}`), GROUPED_ON))).decision, "allow");
    }
  });
});

test("a source: line outside a leading frontmatter block does not make the plan the planner one -> the plain path", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const bodies = ["# Plan\nsource: somewhere\n", "---\ntitle: x\n---\nsource: somewhere\n", "\n---\nsource: x\n---\n"];
    for (const [i, content] of bodies.entries()) {
      const plan = realPlan(dir, `.claude/plans/b${i}/plan.md`, content);
      const f = writeTranscript(dir, `t${i}.jsonl`, refusedPlannerThenPlan(plan));
      const { decision, reason } = await runCase(f, cwd);
      assert.equal(decision, "deny");
      assert.match(reason ?? "", /viber:plain-plan-review agent has not run on this version/);
    }
  });
});

// --- the review set: a planner plan past 12 tasks ---------------------------

type Verdict = "PASS" | "FAIL" | "DENIED";
type Member = "spec" | "graph" | "a" | "b" | "c";

const SET_SPEC = "viber:planner-spec-review";
const SET_GRAPH = "viber:planner-graph-review";
const SET_TASK = "viber:planner-task-review";

/** The members of a 20-task plan: spec, graph and three task slices of at most 8. */
const MEMBERS: Record<Member, { agent: string; tasks?: string }> = {
  spec: { agent: SET_SPEC },
  graph: { agent: SET_GRAPH },
  a: { agent: SET_TASK, tasks: "T1-T8" },
  b: { agent: SET_TASK, tasks: "T9-T16" },
  c: { agent: SET_TASK, tasks: "T17-T20" },
};

const STALE = () => new Date(Date.now() - 3600_000).toISOString();
const FRESH = () => new Date(Date.now() + 3600_000).toISOString();

/** A plan file with `tasks` task blocks; `eol` and `indent` shape the marker lines. */
function taskPlan(dir: string, tasks: number, opts: { eol?: string; indent?: string; extra?: string } = {}): string {
  const eol = opts.eol ?? "\n";
  const indent = opts.indent ?? "";
  const blocks = Array.from({ length: tasks }, (_, i) => `${indent}<!-- TASK -->${eol}### T${i + 1} - task${eol}<!-- /TASK -->${eol}`).join("");
  const head = ["---", "source: x.md", "---", "# Plan", ""].join(eol);
  return realPlan(dir, ".claude/plans/2026-10-21-12-00-00_big/plan.md", head + blocks + (opts.extra ?? ""));
}

/** One review-set dispatch, its prompt carrying the `tasks:` line of a task slice. */
function setDispatch(member: Member, id?: string, withTasks = true): string {
  const { agent, tasks } = MEMBERS[member];
  const prompt = `review ${PLAN}\nrefs: /refs${tasks && withTasks ? `\ntasks: ${tasks}` : ""}`;
  const use: Record<string, unknown> = { type: "tool_use", name: "Agent", input: { subagent_type: agent, prompt } };
  if (id) use.id = id;
  return line({ type: "assistant", message: { content: [use] } });
}

/** A member's dispatch and its verdict, paired by a tool-use id of the member's own. */
function memberRound(member: Member, value: Verdict, opts: { round?: number; timestamp?: string } = {}): [string, string] {
  const id = `toolu_${member}_r${opts.round ?? 1}`;
  return [setDispatch(member, id), verdict(value, { id, timestamp: opts.timestamp })];
}

/** Every member of the 20-task plan, dispatched and answered in order. */
function reviewSetRound(values: Partial<Record<Member, Verdict>>, opts: { round?: number; timestamp?: string } = {}): string[] {
  return (Object.keys(MEMBERS) as Member[]).flatMap((m) => (values[m] ? memberRound(m, values[m], opts) : []));
}

const ALL_PASS: Record<Member, Verdict> = { spec: "PASS", graph: "PASS", a: "PASS", b: "PASS", c: "PASS" };

test("review set: a plan of exactly 12 task blocks is gated on planner-review alone -> its PASS allows", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 12);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatch(), PASS]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("review set: a set member's PASS never counts for a plan of 12 task blocks -> deny on the missing planner-review", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 12);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound(ALL_PASS)]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:planner-review agent has not run on this version/);
  });
});

test("review set: a plan the gate cannot read is gated on planner-review alone, a set member's PASS never counting", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), ...reviewSetRound(ALL_PASS)]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:planner-review agent has not run on this version/);
  });
});

test("review set: marker text that is not a <!-- TASK --> line alone is no task block -> 12 blocks plus quoted markers stay on planner-review", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const quoted = "A task opens with <!-- TASK --> and closes with <!-- /TASK -->.\n".repeat(5);
    const plan = taskPlan(dir, 12, { extra: quoted });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatch(), PASS]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("review set: marker lines with surrounding whitespace and CRLF endings count -> 13 blocks refuse a planner-review PASS alone", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 13, { eol: "\r\n", indent: "  " });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatch(), PASS]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /Next step: review the plan/);
  });
});

test("review set: past 12 tasks a planner-review PASS alone is refused with the review next step naming every member", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatch(), PASS]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: review the plan/);
    assert.match(reason ?? "", new RegExp(SET_SPEC));
    assert.match(reason ?? "", new RegExp(SET_GRAPH));
    assert.match(reason ?? "", new RegExp(`${SET_TASK} \\(uncovered tasks T1-T20\\)`));
  });
});

test("review set: the refusal names only the members still missing, with the slices of the uncovered tasks to dispatch", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound({ spec: "PASS", a: "PASS" })]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: review the plan/);
    assert.doesNotMatch(reason ?? "", new RegExp(SET_SPEC));
    assert.match(reason ?? "", new RegExp(SET_GRAPH));
    assert.match(reason ?? "", new RegExp(`${SET_TASK} \\(uncovered tasks T9-T20\\)`));
    assert.match(reason ?? "", /one dispatch per slice: T9-T16, T17-T20/);
  });
});

test("review set: a dispatch that returned no verdict yet leaves its member missing -> deny naming it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound({ spec: "PASS", a: "PASS", b: "PASS", c: "PASS" }), setDispatch("graph", "toolu_graph_r1")]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: review the plan/);
    assert.match(reason ?? "", new RegExp(SET_GRAPH));
  });
});

test("review set: every member's latest verdict PASS with the passed slices covering every task -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound(ALL_PASS)]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("review set: dispatches carrying no tool-use id pair with the first verdict after each -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const members = Object.keys(MEMBERS) as Member[];
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...members.flatMap((m) => [setDispatch(m), PASS])]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("review set: a FAIL from the spec reviewer is refused naming it and asking for the findings to be fixed", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound({ ...ALL_PASS, spec: "FAIL" })]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: fix the findings/);
    assert.match(reason ?? "", new RegExp(`${SET_SPEC} returned 'VERDICT: FAIL'`));
  });
});

test("review set: a FAIL on one task slice is refused naming the task reviewer and the failed tasks, with the whole set to dispatch again", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound({ ...ALL_PASS, b: "FAIL" })]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: fix the findings/);
    assert.match(reason ?? "", new RegExp(`${SET_TASK} \\(tasks T9-T16\\) returned 'VERDICT: FAIL'`));
    assert.match(reason ?? "", new RegExp(SET_SPEC));
    assert.match(reason ?? "", new RegExp(SET_GRAPH));
    assert.match(reason ?? "", /one dispatch per slice: T1-T8, T9-T16, T17-T20/);
  });
});

test("review set: a DENIED from the graph reviewer is refused with the permission next step naming it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound({ ...ALL_PASS, graph: "DENIED" })]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: grant the permission/);
    assert.match(reason ?? "", new RegExp(`${SET_GRAPH} returned 'VERDICT: DENIED'`));
  });
});

test("review set: a DENIED outranks a FAIL of another member -> the permission next step", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound({ ...ALL_PASS, spec: "FAIL", c: "DENIED" })]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: grant the permission/);
    assert.match(reason ?? "", new RegExp(`${SET_TASK} \\(tasks T17-T20\\)`));
  });
});

test("review set: a missing member outranks a FAIL of another -> the review next step", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound({ spec: "FAIL", a: "PASS", b: "PASS", c: "PASS" })]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: review the plan/);
    assert.match(reason ?? "", new RegExp(SET_GRAPH));
  });
});

test("review set: after a FAIL the whole set dispatched again with every PASS -> allow (the latest completed pair of each member decides)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [
      skillUse(),
      planWrite(plan),
      ...reviewSetRound({ ...ALL_PASS, b: "FAIL" }),
      ...reviewSetRound(ALL_PASS, { round: 2 }),
    ]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("review set: a later FAIL of a member overrides its earlier PASS -> deny", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound(ALL_PASS), ...reviewSetRound({ graph: "FAIL" }, { round: 2 })]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", new RegExp(`${SET_GRAPH} returned 'VERDICT: FAIL'`));
  });
});

test("review set: verdicts of reviews dispatched before the last plan write do not count -> deny naming every member", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound(ALL_PASS), planWrite(plan, "Edit")]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: review the plan/);
    assert.match(reason ?? "", new RegExp(SET_SPEC));
    assert.match(reason ?? "", new RegExp(SET_GRAPH));
    assert.match(reason ?? "", new RegExp(`${SET_TASK} \\(uncovered tasks T1-T20\\)`));
  });
});

test("review set: two task dispatches sent in one message pair each with its own verdict when the second answers first", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const [dispatchA, verdictA] = memberRound("a", "PASS");
    const [dispatchB, verdictB] = memberRound("b", "FAIL");
    const rest = reviewSetRound({ spec: "PASS", graph: "PASS", c: "PASS" });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatchA, dispatchB, verdictB, verdictA, ...rest]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", new RegExp(`${SET_TASK} \\(tasks T9-T16\\) returned 'VERDICT: FAIL'`));
    assert.doesNotMatch(reason ?? "", /\(tasks T1-T8\)/);
  });
});

test("review set: two task dispatches sent in one message pair each with its own verdict when the first answers first -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const [dispatchA, verdictA] = memberRound("a", "PASS");
    const [dispatchB, verdictB] = memberRound("b", "PASS");
    const rest = reviewSetRound({ spec: "PASS", graph: "PASS", c: "PASS" });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatchA, dispatchB, verdictA, verdictB, ...rest]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("review set: passed slices leaving tasks uncovered are refused naming the uncovered tasks", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound({ spec: "PASS", graph: "PASS", a: "PASS", c: "PASS" })]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: review the plan/);
    assert.match(reason ?? "", new RegExp(`${SET_TASK} \\(uncovered tasks T9-T16\\)`));
  });
});

test("review set: a task dispatch without a tasks: line covers nothing -> deny naming every task", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const bare = [setDispatch("a", "toolu_bare", false), verdict("PASS", { id: "toolu_bare" })];
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound({ spec: "PASS", graph: "PASS" }), ...bare]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", new RegExp(`${SET_TASK} \\(uncovered tasks T1-T20\\)`));
  });
});

test("review set: one slice spanning several others still decides per task -> a wide PASS slice covers the tasks inside it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const wide = [
      line({ type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_wide", name: "Agent", input: { subagent_type: SET_TASK, prompt: `review ${PLAN}\ntasks: T1-T20` } }] } }),
      verdict("PASS", { id: "toolu_wide" }),
    ];
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound({ spec: "PASS", graph: "PASS" }), ...wide]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("review set: a plan modified after the earliest deciding verdict is refused with the re-review next step", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const fresh = reviewSetRound({ graph: "PASS", a: "PASS", b: "PASS", c: "PASS" }, { timestamp: FRESH() });
    const stale = reviewSetRound({ spec: "PASS" }, { timestamp: STALE() });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...stale, ...fresh]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: re-review/);
  });
});

test("review set: a plan no newer than every deciding verdict -> allow (no false tamper)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound(ALL_PASS, { timestamp: FRESH() })]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("review set: the hooks.json description states the set rule", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json"), "utf8"));
  assert.match(manifest.description, /review set/);
  assert.match(manifest.description, /past 12/);
  assert.match(manifest.description, /planner-spec-review/);
  assert.match(manifest.description, /planner-graph-review/);
  assert.match(manifest.description, /planner-task-review/);
});

// --- plain plan file limit: at most 8 repository files ------------------------

/** Distinct path-shaped tokens `<prefix>1.ts` .. `<prefix>n.ts`. */
function limitFiles(n: number, prefix = "src/f"): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}.ts`);
}

/** The Git Bash spelling of a drive path: `C:/x` -> `/c/x` (unchanged on POSIX). */
function gitBashForm(p: string): string {
  return slash(p).replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`);
}

/** The drive letter lower-cased: `C:/x` -> `c:/x` (unchanged on POSIX). */
function lowerDrive(p: string): string {
  return slash(p).replace(/^[A-Za-z]:/, (m) => m.toLowerCase());
}

/** A plain plan naming `tokens`, written under `dir`, run through the gate in session `cwd`. */
async function limitRun(dir: string, cwd: string, tokens: string[], extra: string[] = []): Promise<Decision> {
  const plan = realPlan(dir, undefined, `# Plan\n\n${tokens.join("\n")}\n`);
  const f = writeTranscript(dir, "t.jsonl", [planWrite(plan), ...extra]);
  return await runCase(f, cwd);
}

/** The plain reviewer dispatched and passed on the plan version. */
const REVIEWED = [dispatch(undefined, PLAIN), PASS];

test("file limit: a plain plan naming 9 distinct repository files is refused with the narrow-or-planner next step, a plain-plan-review PASS on that version included", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const { decision, reason } = await limitRun(dir, cwd, limitFiles(9), REVIEWED);
    assert.equal(decision, "deny");
    assert.equal(
      reason,
      "Next step: narrow the plan or switch to the planner. plan.md names 9 repository files, past the 8 a plain plan-mode plan may name - narrow it to at most 8, or leave plan mode and run /viber:intent for a planned build. (This is the plan review gate (planning.plain-plan-review in .claude/viber.yml), not an error.)",
    );
  });
});

test("file limit: a plain plan naming exactly 8 repository files with a plain-plan-review PASS -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    assert.equal((await limitRun(dir, cwd, limitFiles(8), REVIEWED)).decision, "allow");
  });
});

test("file limit: a plain plan naming exactly 8 repository files and no review yet -> the review next step, not the limit", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const { decision, reason } = await limitRun(dir, cwd, limitFiles(8));
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /plain-plan-review agent has not run on this version/);
  });
});

test("file limit: a markdown link [x](src/a.ts) yields its path -> 9 linked files are refused", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const linked = limitFiles(9).map((f) => `[file](${f})`);
    const { decision, reason } = await limitRun(dir, cwd, linked, REVIEWED);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /names 9 repository files/);
  });
});

test("file limit: an absolute path under the repository root, native or lower-case drive form, folds to its relative form and counts -> 9 files are refused", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const tokens = [...limitFiles(7), `${slash(cwd)}/src/f8.ts`, `${lowerDrive(cwd)}/src/f9.ts`];
    const { decision, reason } = await limitRun(dir, cwd, tokens, REVIEWED);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /names 9 repository files/);
  });
});

test("file limit: the Git Bash form (/c/...) of a path under the repository root folds to its relative form and counts -> 9 files are refused", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const tokens = [...limitFiles(8), `${gitBashForm(cwd)}/src/f9.ts`];
    const { decision, reason } = await limitRun(dir, cwd, tokens, REVIEWED);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /names 9 repository files/);
  });
});

test("file limit: an absolute path and its relative twin count once -> 8 files named both ways are allowed", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const tokens = [...limitFiles(8), `${slash(cwd)}/src/f1.ts`, `${gitBashForm(cwd)}/src/f2.ts`];
    assert.equal((await limitRun(dir, cwd, tokens, REVIEWED)).decision, "allow");
  });
});

test("file limit: a :<line> or :<line>-<line> suffix and surrounding punctuation are stripped -> 8 files cited with them are allowed", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const tokens = [...limitFiles(8), "src/f1.ts:12", "src/f2.ts:3-5", "(`src/f3.ts`).", '"src/f4.ts",', "<src/f5.ts>;", "src/f6.ts:9,"];
    assert.equal((await limitRun(dir, cwd, tokens, REVIEWED)).decision, "allow");
  });
});

test("file limit: a path named many times counts once -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const tokens = Array.from({ length: 20 }, () => "src/a.ts");
    assert.equal((await limitRun(dir, cwd, tokens, REVIEWED)).decision, "allow");
  });
});

test("file limit: a leading ./ is stripped once -> 8 files with a ./ twin of the first are allowed", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const tokens = [...limitFiles(8), "./src/f1.ts"];
    assert.equal((await limitRun(dir, cwd, tokens, REVIEWED)).decision, "allow");
  });
});

test("file limit: a URL is not a repository file -> 8 files plus a URL are allowed", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const tokens = [...limitFiles(8), "https://example.com/docs/page.html", "[docs](https://example.com/guide.md)"];
    assert.equal((await limitRun(dir, cwd, tokens, REVIEWED)).decision, "allow");
  });
});

test("file limit: a token that is neither an existing file nor path-shaped is skipped -> 8 files plus such words are allowed", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const tokens = [...limitFiles(8), "word", "missing.ts", "src/noextension", "e.g.", "and/or"];
    assert.equal((await limitRun(dir, cwd, tokens, REVIEWED)).decision, "allow");
  });
});

test("file limit: an existing file with no slash counts -> 8 path-shaped files plus an existing README.md are refused", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    fs.writeFileSync(path.join(cwd, "README.md"), "# readme\n");
    const { decision, reason } = await limitRun(dir, cwd, [...limitFiles(8), "README.md"], REVIEWED);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /names 9 repository files/);
  });
});

test("file limit: an absolute or ~ path outside the repository root is skipped -> 8 files plus such paths are allowed", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const tokens = [...limitFiles(8), "/etc/other/x.conf", "~/notes/y.ts", "Z:/elsewhere/z.ts", "/z/elsewhere/w.ts"];
    assert.equal((await limitRun(dir, cwd, tokens, REVIEWED)).decision, "allow");
  });
});

test("file limit: a path under .temp/ is skipped, relative or absolute -> 8 files plus such paths are allowed", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const tokens = [...limitFiles(8), ".temp/viber/notes.md", "./.temp/findings.md", `${slash(cwd)}/.temp/mockup.html`];
    assert.equal((await limitRun(dir, cwd, tokens, REVIEWED)).decision, "allow");
  });
});

test("file limit: the repository root is the git top level of a session in a subdirectory -> an absolute path under the top level counts", async () => {
  await withGitRepo(async (repo) => {
    fs.mkdirSync(path.join(repo.dir, ".claude"));
    fs.writeFileSync(path.join(repo.dir, ".claude", "viber.yml"), GROUPED_ON);
    const cwd = path.join(repo.dir, "sub");
    fs.mkdirSync(cwd);
    const tokens = [...limitFiles(8), `${slash(repo.dir)}/src/f9.ts`];
    const { decision, reason } = await limitRun(repo.dir, cwd, tokens, REVIEWED);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /names 9 repository files/);
  });
});

test("file limit: with planning.plain-plan-review off nothing is counted -> 12 files are allowed", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_OFF);
    assert.equal((await limitRun(dir, cwd, limitFiles(12))).decision, "allow");
  });
});

test("file limit: on the planner path nothing is counted -> a planner plan naming 12 files passes on its planner-review PASS", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const plan = realPlan(dir, undefined, `---\nsource: x\n---\n${limitFiles(12).join("\n")}\n`);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatch(), PASS]);
    assert.equal((await runCase(f, cwd)).decision, "allow");
  });
});

test("file limit: the hooks.json description states the 8 repository files limit", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json"), "utf8"));
  assert.match(manifest.description, /more than 8 distinct repository files/);
  assert.match(manifest.description, /\/viber:intent/);
});

/*
 * plan-gate.test.ts - proves viber/hooks/scripts/plan-gate.sh, the PreToolUse
 * gate on ExitPlanMode: the trace of the plan review, enforced by the harness
 * rather than by the model.
 *
 * What it must do: arm ONLY when the current plan-mode episode carries a
 * Write/Edit of a `plans/*.md` file, pick `viber:plan-judge` when the planner
 * skill drives the plan (a Skill tool_use for `planner`, the only form it can
 * take, plus the planner's frontmatter in the plan file) and
 * `viber:outside-plan-review` otherwise, the latter only when the session cwd's
 * `.claude/viber.yml` turns `outside-plan-review` on. With V the verdict of the
 * last completed (dispatch, verdict) pair of that agent inside the episode it
 * denies in three cases only: no pair completed; V is DENIED and no
 * `plan-build.sh judged <plan> DENIED` call follows the verdict; V is FAIL and
 * no answering write follows it (a Write/Edit of the plan, a `plan-build.sh`
 * call with `apply` or `open`, or `plan-build.sh judged <plan> none`, the last
 * one for no FAIL of a dispatch whose prompt reads `round: 1`). A PASS
 * allows whatever is written to the plan after it: the review runs at most two
 * rounds, so the approved text is not the reviewed text. A plan assembled anew
 * after a `plan-build.sh survey` is another text: the pairs ahead of that
 * assembly count no more. Everything else -
 * outside-plan-review off, an episode that already built a plan, an unreadable
 * transcript - passes untouched: a broken gate must never trap the user in plan
 * mode, so every case here also asserts exit 0 and parseable JSON.
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
import { withTempDir } from "../harness/tmp.ts";
import { withStub } from "../harness/stub.ts";
import {
  SUT,
  line,
  writeTranscript,
  runPayload,
  runCase,
  PLAN,
  skillUse,
  planWrite,
  scriptCall,
  dispatch,
  verdict,
  realPlan,
  PASS,
  FAIL,
  JUDGE,
  PLAIN,
  GROUPED_ON,
  sessionWithConfig,
} from "./plan-gate-fixture.ts";

// --- fixture builders -------------------------------------------------

/** NOT a signal: a typed command. The planner skill is user-invocable: false, so
 *  `/viber:planner` cannot be typed at all, and a `planner` command that IS typeable
 *  belongs to some other plugin. */
function typedCommand(command = "/viber:planner"): string {
  return line({ type: "user", message: { content: `<command-name>${command}</command-name>` } });
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

/** The model asking to leave plan mode. With an id the key order is the real transcript's. */
function exitPlanMode(id?: string): string {
  const use = id ? { type: "tool_use", id, name: "ExitPlanMode", input: {} } : { type: "tool_use", name: "ExitPlanMode", input: {} };
  return line({ type: "assistant", message: { content: [use] } });
}

/** The answer to an ExitPlanMode the gate or the user refused, in the real key order. */
function refusedExit(id: string): string {
  return line({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "PreToolUse:ExitPlanMode hook error: Next step: review the plan.", is_error: true, tool_use_id: id }] } });
}

/** A Bash call of any command line, as the transcript records it. */
function bashCall(command: string): string {
  return line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } });
}

/** What a Bash call printed, as the transcript records it: the stdout as the
 *  tool_result content (a string, or one text block with `blocks`) and again
 *  under `toolUseResult`. */
function bashResult(stdout: string, blocks = false): string {
  const content = blocks ? [{ type: "text", text: stdout }] : stdout;
  return line({ type: "user", message: { role: "user", content: [{ tool_use_id: "toolu_01Bash", type: "tool_result", content, is_error: false }] }, toolUseResult: { stdout, stderr: "", interrupted: false } });
}

/** A dispatch of the plan judge with the block `plan-build.sh judge` prints for
 *  a round as its prompt, the way the planner skill sends it. */
function judgeBlock(round: 1 | 2): string {
  const prompt = `plan: ${PLAN}\nround: ${round}\ninput: /repo/.temp/viber/intent/summary.md\nout: /repo/.temp/viber/planner/judge-${round}.md\nAnswered: default punctuation -> none`;
  return line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Agent", input: { description: "Judge the plan", subagent_type: JUDGE, prompt } }] } });
}

/** Claude Code's `api-request-blob` record: one line replaying a whole earlier message,
 *  its blocks as live-looking JSON (unescaped, unlike a tool_result string). */
function blob(blocks: Record<string, unknown>[], role = "assistant"): string {
  return line({ type: "api-request-blob", sessionId: "s", hash: "h", message: { role, content: blocks } });
}

const DENIED = verdict("DENIED", { body: "VERDICT: DENIED\nREASON: Read: /x/plan.md\nREFUSAL: not allowed" });

const NO_VERDICT = /agent has not returned a verdict on it/;
const UNANSWERED = /^Next step: answer the review/;
const REFUSED = /^Next step: grant the permission/;

// --- fail-open matrix -------------------------------------------------

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

test("plain plan mode with no planner skill and no session cwd -> allow (outside-plan-review cannot be read, so it is off)", async () => {
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

test("a plan-build.sh call with no Write/Edit of the plan in the episode does not arm the gate -> allow (the stub the session writes is what arms it)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), scriptCall("apply")]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("the last of several plan writes is the one the refusal names", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite("/repo/.claude/plans/a/first.md"), planWrite("/repo/.claude/plans/b/second.md")]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /wrote second\.md but/);
    assert.doesNotMatch(reason ?? "", /first\.md/);
  });
});

// --- the three refusals, word for word --------------------------------

test("the planner refusals read exactly: no verdict, DENIED, FAIL not answered", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const head = [skillUse(), planWrite()];
    const none = await runCase(writeTranscript(dir, "none.jsonl", head));
    assert.equal(
      none.reason,
      "Next step: review the plan. The planner skill wrote plan.md but the viber:plan-judge agent has not returned a verdict on it - first run the planner skill steps this plan has not been through, their scripts being expected in plan mode, then plan-build.sh judge, whose printed block is the dispatch. Then dispatch it with the block plan-build.sh judge prints, then retry ExitPlanMode. (This is the planner's review gate, not an error.)",
    );
    const denied = await runCase(writeTranscript(dir, "denied.jsonl", [...head, dispatch(), DENIED]));
    assert.equal(
      denied.reason,
      "Next step: grant the permission. The viber:plan-judge agent returned 'VERDICT: DENIED' for plan.md: the harness refused one of its tool calls, the one its REASON: line names. Ask the user to allow that call, dispatch the agent again with the block plan-build.sh judge prints, then retry ExitPlanMode. (This is the planner's review gate, not an error.)",
    );
    const failed = await runCase(writeTranscript(dir, "failed.jsonl", [...head, dispatch(), FAIL]));
    assert.equal(
      failed.reason,
      "Next step: answer the review. The viber:plan-judge agent returned 'VERDICT: FAIL' for plan.md and the plan was not written since - report the verdict with plan-build.sh judged and act on what it prints, then retry ExitPlanMode. (This is the planner's review gate, not an error.)",
    );
    for (const out of [none, denied, failed]) assert.equal(out.decision, "deny");
  });
});

test("the outside plan refusals read exactly, naming no planner step: no verdict, DENIED, FAIL not answered", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const head = [planWrite()];
    const none = await runCase(writeTranscript(dir, "none.jsonl", head), cwd);
    assert.equal(
      none.reason,
      "Next step: review the plan. Plan mode wrote plan.md but the viber:outside-plan-review agent has not returned a verdict on it - dispatch it with the plan path and one sentence stating the user's goal, and on a second review the CRITICAL lines of the first plus what you changed for each, then retry ExitPlanMode. (This is the plan review gate (planning.outside-plan-review in .claude/viber.yml), not an error.)",
    );
    const denied = await runCase(writeTranscript(dir, "denied.jsonl", [...head, dispatch(undefined, PLAIN), DENIED]), cwd);
    assert.equal(
      denied.reason,
      "Next step: grant the permission. The viber:outside-plan-review agent returned 'VERDICT: DENIED' for plan.md: the harness refused one of its tool calls, the one its REASON: line names. Ask the user to allow that call, dispatch the agent again with the plan path and one sentence stating the user's goal, and on a second review the CRITICAL lines of the first plus what you changed for each, then retry ExitPlanMode. (This is the plan review gate (planning.outside-plan-review in .claude/viber.yml), not an error.)",
    );
    const failed = await runCase(writeTranscript(dir, "failed.jsonl", [...head, dispatch(undefined, PLAIN), FAIL]), cwd);
    assert.equal(
      failed.reason,
      'Next step: answer the review. The viber:outside-plan-review agent returned \'VERDICT: FAIL\' for plan.md and the plan was not written since - fix its CRITICAL lines in the plan, or add the ones you cannot fix under "## Open items", then retry ExitPlanMode. (This is the plan review gate (planning.outside-plan-review in .claude/viber.yml), not an error.)',
    );
    for (const out of [none, denied, failed]) {
      assert.equal(out.decision, "deny");
      assert.doesNotMatch(out.reason ?? "", /plan-build\.sh|planner skill steps/);
    }
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

test("a mid-turn non-plan record between the planner Skill and its own EnterPlanMode keeps the planner in the episode -> deny naming plan-judge", async () => {
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
    assert.match(reason ?? "", /viber:plan-judge agent has not returned a verdict on it/);

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

test("a review from an earlier, approved episode leaves no trace in the next one -> deny (the pair is read inside the episode only)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [
      enterPlanMode(),
      permissionMode("plan"),
      planWrite(),
      dispatch(undefined, PLAIN),
      PASS,
      exitPlanMode(),
      permissionMode("acceptEdits"),
      userPrompt("next thing"),
      enterPlanMode(),
      permissionMode("plan"),
      planWrite(),
    ]);
    const { decision, reason } = await runCase(f, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:outside-plan-review agent has not returned a verdict on it/);
  });
});

// --- the verdict ------------------------------------------------------

test("dispatch + VERDICT: FAIL with nothing after it -> deny naming the verdict it read", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), FAIL]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", UNANSWERED);
    assert.match(reason ?? "", /returned 'VERDICT: FAIL'/);
  });
});

test("dispatch + VERDICT: DENIED -> deny asking for the refused permission, not for an answer to the review", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), DENIED]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /returned 'VERDICT: DENIED'/);
    assert.match(reason ?? "", REFUSED);
    assert.doesNotMatch(reason ?? "", /answer the review/);
  });
});

test("a dispatch that returned no verdict at all -> deny with the review next step", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch()]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: review the plan/);
    assert.match(reason ?? "", NO_VERDICT);
  });
});

test("the unprefixed subagent spelling 'plan-judge' is recognized -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(undefined, "plan-judge"), PASS]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("FAIL then a second review PASS -> allow (the newest completed pair decides)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), FAIL, dispatch(), PASS]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("PASS then a second review FAIL -> deny (the newest completed pair decides both ways)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), PASS, dispatch(), FAIL]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", UNANSWERED);
  });
});

test("a second dispatch still running leaves the earlier completed pair deciding -> its PASS allows, its FAIL denies until answered", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const passed = writeTranscript(dir, "passed.jsonl", [skillUse(), planWrite(), dispatch(), PASS, dispatch()]);
    assert.equal((await runCase(passed)).decision, "allow");
    const failed = writeTranscript(dir, "failed.jsonl", [skillUse(), planWrite(), dispatch(), FAIL, dispatch()]);
    assert.match((await runCase(failed)).reason ?? "", UNANSWERED);
    const answered = writeTranscript(dir, "answered.jsonl", [skillUse(), planWrite(), dispatch(), FAIL, scriptCall("apply"), dispatch()]);
    assert.equal((await runCase(answered)).decision, "allow");
  });
});

test("a 'VERDICT: PASS' quoted in prose with no dispatch before it -> deny (the gate does not take the model's word for it)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const quoted = line({ type: "assistant", message: { content: "The reviewer would say VERDICT: PASS here.\n" } });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), quoted]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", NO_VERDICT);
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

// --- a PASS is a trace, not a seal on the text --------------------------

test("a PASS allows whatever is written to the plan after it: a Write, an Edit, a plan-build.sh apply call (the approved text is not the reviewed text)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const reviewed = [skillUse(), planWrite(), dispatch(), PASS];
    const later: Record<string, string> = {
      write: planWrite(),
      edit: planWrite(PLAN, "Edit"),
      apply: scriptCall("apply"),
    };
    for (const [name, written] of Object.entries(later)) {
      const f = writeTranscript(dir, `${name}.jsonl`, [...reviewed, written]);
      assert.equal((await runCase(f)).decision, "allow", name);
    }
  });
});

test("a plan file on disk newer than its PASS -> allow (the gate reads no mtime)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = realPlan(dir);
    const old = line({ type: "user", timestamp: new Date(Date.now() - 3600_000).toISOString(), message: { content: [{ type: "tool_result", content: "VERDICT: PASS\n" }] } });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatch(), old]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("an outside plan written again after its outside-plan-review PASS -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [planWrite(), dispatch(undefined, PLAIN), PASS, planWrite(PLAN, "Edit")]);
    assert.equal((await runCase(f, cwd)).decision, "allow");
  });
});

// --- a FAIL and its answering write -------------------------------------

test("a FAIL followed by a Write or an Edit of the plan file -> allow, one made before the verdict answers nothing", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const failed = [skillUse(), planWrite(), dispatch(), FAIL];
    for (const tool of ["Write", "Edit"] as const) {
      const f = writeTranscript(dir, `${tool}.jsonl`, [...failed, planWrite(PLAN, tool)]);
      assert.equal((await runCase(f)).decision, "allow", tool);
    }
    const early = writeTranscript(dir, "early.jsonl", [skillUse(), planWrite(), dispatch(), planWrite(PLAN, "Edit"), FAIL]);
    const { decision, reason } = await runCase(early);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", UNANSWERED);
  });
});

test("a FAIL followed by a plan-build.sh apply or open call naming the plan -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const failed = [skillUse(), planWrite(), dispatch(), FAIL];
    for (const sub of ["apply", "open"]) {
      const f = writeTranscript(dir, `${sub}.jsonl`, [...failed, scriptCall(sub)]);
      assert.equal((await runCase(f)).decision, "allow", sub);
    }
  });
});

test("a FAIL followed by a plan-build.sh call with another command -> still deny (only apply and open answer a review)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const failed = [skillUse(), planWrite(), dispatch(), FAIL];
    for (const sub of ["judge", "survey", "outline", "skeleton", "slices", "merge", "fix"]) {
      const f = writeTranscript(dir, `${sub}.jsonl`, [...failed, scriptCall(sub)]);
      const { decision, reason } = await runCase(f);
      assert.equal(decision, "deny", sub);
      assert.match(reason ?? "", UNANSWERED, sub);
    }
  });
});

test("a FAIL followed by plan-build.sh judged <plan> none -> allow, by judged <plan> FAIL or PASS -> still deny (reporting the verdict answers nothing)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const failed = [skillUse(), planWrite(), dispatch(), FAIL];
    const none = writeTranscript(dir, "none.jsonl", [...failed, scriptCall("judged", PLAN, "none")]);
    assert.equal((await runCase(none)).decision, "allow");
    for (const word of ["FAIL", "PASS", "DENIED", "nonesuch"]) {
      const f = writeTranscript(dir, `${word}.jsonl`, [...failed, scriptCall("judged", PLAN, word)]);
      const { decision, reason } = await runCase(f);
      assert.equal(decision, "deny", word);
      assert.match(reason ?? "", UNANSWERED, word);
    }
  });
});

test("the answering plan-build.sh call is read whatever quotes its call line carries: double, single, none, or behind an interpreter", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const failed = [skillUse(), planWrite(), dispatch(), FAIL];
    const spellings: Record<string, string> = {
      single: `'/plugin/skills/planner/scripts/plan-build.sh' apply '${PLAN}' '/repo/.temp/viber/planner/fix.md'`,
      bare: `/plugin/skills/planner/scripts/plan-build.sh apply ${PLAN} /repo/.temp/viber/planner/fix.md`,
      interpreter: `bash "/plugin/skills/planner/scripts/plan-build.sh"  open  "${PLAN}"`,
      "judged-single": `'/plugin/skills/planner/scripts/plan-build.sh' judged '${PLAN}' none`,
      "judged-bare": `/plugin/skills/planner/scripts/plan-build.sh judged ${PLAN} none --out /repo/.temp/viber/planner/judge.md`,
      "judged-out": `"/plugin/skills/planner/scripts/plan-build.sh" judged "${PLAN}" none --out "/repo/.temp/viber/planner/judge.md"`,
      "judged-quoted-word": `"/plugin/skills/planner/scripts/plan-build.sh" judged "${PLAN}" "none" --out "/repo/.temp/viber/planner/judge.md"`,
      "judged-single-quoted-word": `'/plugin/skills/planner/scripts/plan-build.sh' judged '${PLAN}' 'none'`,
    };
    for (const [name, command] of Object.entries(spellings)) {
      const f = writeTranscript(dir, `${name}.jsonl`, [...failed, bashCall(command)]);
      assert.equal((await runCase(f)).decision, "allow", name);
    }
    // No plans/*.md path on the call line: not an answer about a plan.
    const elsewhere = writeTranscript(dir, "elsewhere.jsonl", [...failed, bashCall(`"/plugin/skills/planner/scripts/plan-build.sh" apply "/repo/notes/plan.md" "/repo/fix.md"`)]);
    assert.equal((await runCase(elsewhere)).decision, "deny");
  });
});

test("the plan-build.sh apply call quoted in a prompt, typed by the user or echoed in a tool result answers no FAIL -> deny (only a Bash tool_use counts)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const failed = [skillUse(), planWrite(), dispatch(), FAIL];
    const command = `"/plugin/skills/planner/scripts/plan-build.sh" apply "${PLAN}" "/repo/.temp/viber/planner/fix.md"`;
    const mentions: Record<string, string> = {
      // The tool name is there, one escape level down: \"name\":\"Bash\".
      typed: userPrompt(`why did {"name":"Bash","input":{"command":"x"}} run ${command}?`),
      prompt: line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Agent", input: { subagent_type: "general-purpose", prompt: `The session then runs {"name":"Bash"} with ${command}` } }] } }),
      result: line({ type: "user", message: { content: [{ type: "tool_result", content: `Next: ${command}` }] } }),
    };
    for (const [name, mention] of Object.entries(mentions)) {
      const f = writeTranscript(dir, `${name}.jsonl`, [...failed, mention]);
      const { decision, reason } = await runCase(f);
      assert.equal(decision, "deny", name);
      assert.match(reason ?? "", UNANSWERED, name);
    }
  });
});

test("a second FAIL needs an answer of its own: the write that answered the first one does not count, a later one does", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const twice = [skillUse(), planWrite(), dispatch(), FAIL, scriptCall("apply"), dispatch(), FAIL];
    const open = writeTranscript(dir, "open.jsonl", twice);
    const { decision, reason } = await runCase(open);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", UNANSWERED);
    const answered = writeTranscript(dir, "answered.jsonl", [...twice, scriptCall("apply")]);
    assert.equal((await runCase(answered)).decision, "allow");
  });
});

test("a round-two judge failing the plan twice with a file the script cannot use -> allow once each FAIL is reported again as none, the call plan-build.sh asks for; the FAIL report alone -> deny (the calls the planner skill writes, word and file quoted)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const build = '"/plugin/skills/planner/scripts/plan-build.sh"';
    const judgedFail = bashCall(`${build} judged "${PLAN}" "FAIL" --out "/repo/.claude/plans/judge.md"`);
    const judgedNone = bashCall(`${build} judged "${PLAN}" "none"`);
    // Round 1 failed and was fixed; round 2 fails with an unusable file, is reported, sent again and fails the same way.
    const first = [skillUse(), planWrite(), dispatch(), FAIL, scriptCall("apply")];
    const reported = [...first, dispatch(), FAIL, judgedFail, judgedNone, dispatch(), FAIL, judgedFail];
    const stuck = await runCase(writeTranscript(dir, "stuck.jsonl", reported));
    assert.equal(stuck.decision, "deny");
    assert.match(stuck.reason ?? "", UNANSWERED);
    assert.equal((await runCase(writeTranscript(dir, "left.jsonl", [...reported, judgedNone]))).decision, "allow");
    // The judge call that then prints NEXT: exit-plan again changes nothing.
    assert.equal((await runCase(writeTranscript(dir, "again.jsonl", [...reported, judgedNone, scriptCall("judge")]))).decision, "allow");
  });
});

test("a round-one judge failing the plan with a file the script cannot use -> deny after the first none report and after the second, on which plan-build.sh prints STOP (a none answers a FAIL only in round two, where the script ends the review on it)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const build = '"/plugin/skills/planner/scripts/plan-build.sh"';
    const judgedFail = bashCall(`${build} judged "${PLAN}" "FAIL" --out "/repo/.claude/plans/judge.md"`);
    const judgedNone = bashCall(`${build} judged "${PLAN}" "none"`);
    const once = [skillUse(), planWrite(), judgeBlock(1), FAIL, judgedFail, judgedNone];
    const twice = [...once, judgeBlock(1), FAIL, judgedFail, judgedNone];
    const cases: Record<string, string[]> = {
      once,
      // The judge sent again and still running: the first FAIL keeps deciding.
      running: [...once, judgeBlock(1)],
      twice,
      // The reply of the judge sent again carries no verdict at all.
      silent: [...once, judgeBlock(1), judgedNone],
    };
    for (const [name, lines] of Object.entries(cases)) {
      const { decision, reason } = await runCase(writeTranscript(dir, `${name}.jsonl`, lines));
      assert.equal(decision, "deny", name);
      assert.match(reason ?? "", UNANSWERED, name);
    }
    // A usable verdict of the judge sent again, and the fix of a round-one FAIL, still open the gate.
    assert.equal((await runCase(writeTranscript(dir, "pass.jsonl", [...once, judgeBlock(1), PASS]))).decision, "allow");
    assert.equal((await runCase(writeTranscript(dir, "fixed.jsonl", [...once, judgeBlock(1), FAIL, judgedFail, scriptCall("apply")]))).decision, "allow");
    // Round two: the same two replies end the review, and the script sends the session to ExitPlanMode.
    const second = [skillUse(), planWrite(), judgeBlock(1), FAIL, scriptCall("apply"), judgeBlock(2), FAIL, judgedFail, judgedNone, judgeBlock(2), FAIL, judgedFail];
    assert.equal((await runCase(writeTranscript(dir, "second-open.jsonl", second))).decision, "deny");
    assert.equal((await runCase(writeTranscript(dir, "second.jsonl", [...second, judgedNone]))).decision, "allow");
    // A round-two judge sent again that returns no verdict: the first FAIL of the round is answered by the none reports.
    assert.equal((await runCase(writeTranscript(dir, "second-silent.jsonl", [...second.slice(0, 10), judgedNone]))).decision, "allow");
  });
});

test("the subcommand of an answering plan-build.sh call may stand in quotes of either kind, as every other argument does -> allow (a quoted subcommand left the session with no call the gate took)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const failed = [skillUse(), planWrite(), dispatch(), FAIL];
    const refused = [skillUse(), planWrite(), dispatch(), DENIED];
    const sh = "/plugin/skills/planner/scripts/plan-build.sh";
    const answers: Record<string, [string[], string]> = {
      apply: [failed, `"${sh}" "apply" "${PLAN}" "1=/repo/.temp/viber/planner/fix.md"`],
      "apply-single": [failed, `'${sh}' 'apply' '${PLAN}' '1=/repo/.temp/viber/planner/fix.md'`],
      open: [failed, `"${sh}" "open" "${PLAN}"`],
      "open-single": [failed, `'${sh}' 'open' '${PLAN}'`],
      "open-bare-script": [failed, `${sh} "open" "${PLAN}"`],
      none: [failed, `"${sh}" "judged" "${PLAN}" "none"`],
      "none-single": [failed, `'${sh}' 'judged' '${PLAN}' 'none'`],
      denied: [refused, `"${sh}" "judged" "${PLAN}" "DENIED" --out "/repo/.temp/viber/planner/judge.md"`],
      "denied-single": [refused, `'${sh}' 'judged' '${PLAN}' 'DENIED'`],
    };
    for (const [name, [before, command]] of Object.entries(answers)) {
      const f = writeTranscript(dir, `${name}.jsonl`, [...before, bashCall(command)]);
      assert.equal((await runCase(f)).decision, "allow", name);
    }
    // The quotes change no rule: another subcommand, or judged with another word, answers nothing.
    const still: Record<string, string> = {
      judge: `"${sh}" "judge" "${PLAN}"`,
      survey: `"${sh}" "survey" "${PLAN}"`,
      "judged-fail": `"${sh}" "judged" "${PLAN}" "FAIL"`,
      reopen: `"${sh}" "reopen" "${PLAN}"`,
    };
    for (const [name, command] of Object.entries(still)) {
      const { decision, reason } = await runCase(writeTranscript(dir, `still-${name}.jsonl`, [...failed, bashCall(command)]));
      assert.equal(decision, "deny", name);
      assert.match(reason ?? "", UNANSWERED, name);
    }
  });
});

test("a plan assembled anew after a new survey needs a judge of its own: the PASS of the plan it replaced no longer counts -> deny until a verdict returns on the new text (the script starts its rounds again there too)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const build = '"/plugin/skills/planner/scripts/plan-build.sh"';
    const survey = bashCall(`${build} survey "${PLAN}" --input "/repo/.temp/viber/intent/summary.md"`);
    const surveyed = bashResult("NEXT: dispatch | agent: viber:plan-surveyor\nplan: /repo/.claude/plans/p.md\nout: /repo/.temp/viber/planner/survey.md");
    const assemble = bashCall(`${build} assemble "${PLAN}" "1=/repo/.claude/plans/author.md"`);
    const assembled = bashResult("assembled: 2 tasks\nNEXT: judge");
    const reviewed = [skillUse(), planWrite(), survey, surveyed, assemble, assembled, dispatch(), PASS];
    assert.equal((await runCase(writeTranscript(dir, "first.jsonl", reviewed))).decision, "allow");

    const anew = [...reviewed, survey, surveyed, assemble, assembled];
    const { decision, reason } = await runCase(writeTranscript(dir, "anew.jsonl", anew));
    assert.equal(decision, "deny");
    assert.match(reason ?? "", NO_VERDICT);
    // The quoted subcommand and the array form of a tool result are read alike.
    const quoted = [...reviewed, bashCall(`${build} "survey" "${PLAN}"`), surveyed, assemble, bashResult("assembled: 12 tasks\nshared: src/a.ts | T1, T2\nNEXT: fix | defects", true)];
    assert.match((await runCase(writeTranscript(dir, "quoted.jsonl", quoted))).reason ?? "", NO_VERDICT);
    // The judge of the new text opens the gate again, its FAIL needs its own answer.
    assert.equal((await runCase(writeTranscript(dir, "judged.jsonl", [...anew, dispatch(), PASS]))).decision, "allow");
    assert.match((await runCase(writeTranscript(dir, "failed.jsonl", [...anew, dispatch(), FAIL]))).reason ?? "", UNANSWERED);
    assert.match((await runCase(writeTranscript(dir, "running.jsonl", [...anew, dispatch()]))).reason ?? "", NO_VERDICT);

    // What the script keeps its rounds through, the gate keeps the PASS through: a survey alone (judge then prints
    // NEXT: exit-plan), an assembly with no survey ahead of it, and an assembly the script refused.
    const kept: Record<string, string[]> = {
      "survey-alone": [...reviewed, survey, surveyed, bashCall(`${build} judge "${PLAN}"`), bashResult("NEXT: exit-plan")],
      "assemble-alone": [...reviewed, assemble, assembled],
      "assemble-refused": [...reviewed, survey, surveyed, assemble, bashResult("FIX: slice 1: the plan text holds no task block")],
      // The same words quoted in a prompt are no assembly.
      "assemble-quoted": [...reviewed, survey, surveyed, userPrompt('it printed "assembled: 2 tasks" before, why?')],
    };
    for (const [name, lines] of Object.entries(kept)) {
      assert.equal((await runCase(writeTranscript(dir, `${name}.jsonl`, lines))).decision, "allow", name);
    }
  });
});

// --- a DENIED and its answering call ------------------------------------

test("a DENIED followed by plan-build.sh judged <plan> DENIED -> allow, with an --out argument and in every quoting too (the planner reported the refused round to its script)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const refused = [skillUse(), planWrite(), dispatch(), DENIED];
    const plain = writeTranscript(dir, "plain.jsonl", [...refused, scriptCall("judged", PLAN, "DENIED")]);
    assert.equal((await runCase(plain)).decision, "allow");
    const spellings: Record<string, string> = {
      out: `"/plugin/skills/planner/scripts/plan-build.sh" judged "${PLAN}" DENIED --out "/repo/.temp/viber/planner/judge.md"`,
      single: `'/plugin/skills/planner/scripts/plan-build.sh' judged '${PLAN}' DENIED`,
      bare: `/plugin/skills/planner/scripts/plan-build.sh judged ${PLAN} DENIED --out /repo/.temp/viber/planner/judge.md`,
      "quoted-word": `"/plugin/skills/planner/scripts/plan-build.sh" judged "${PLAN}" "DENIED"`,
      "single-quoted-word": `'/plugin/skills/planner/scripts/plan-build.sh' judged '${PLAN}' 'DENIED'`,
    };
    for (const [name, command] of Object.entries(spellings)) {
      const f = writeTranscript(dir, `${name}.jsonl`, [...refused, bashCall(command)]);
      assert.equal((await runCase(f)).decision, "allow", name);
    }
  });
});

test("a DENIED followed by anything else -> still deny: judged with PASS, FAIL or none, apply, open, a Write of the plan, a judged DENIED made before the verdict", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const refused = [skillUse(), planWrite(), dispatch(), DENIED];
    const later: Record<string, string> = {
      "judged-pass": scriptCall("judged", PLAN, "PASS"),
      "judged-fail": scriptCall("judged", PLAN, "FAIL"),
      "judged-none": scriptCall("judged", PLAN, "none"),
      apply: scriptCall("apply"),
      open: scriptCall("open"),
      write: planWrite(),
      elsewhere: bashCall(`"/plugin/skills/planner/scripts/plan-build.sh" judged "/repo/notes/plan.md" DENIED`),
    };
    for (const [name, call] of Object.entries(later)) {
      const f = writeTranscript(dir, `${name}.jsonl`, [...refused, call]);
      const { decision, reason } = await runCase(f);
      assert.equal(decision, "deny", name);
      assert.match(reason ?? "", REFUSED, name);
    }
    const early = writeTranscript(dir, "early.jsonl", [skillUse(), planWrite(), scriptCall("judged", PLAN, "DENIED"), dispatch(), DENIED]);
    assert.match((await runCase(early)).reason ?? "", REFUSED);
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
    assert.match(reason ?? "", NO_VERDICT);
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
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", UNANSWERED);
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

test("a blob line replaying [Edit, Agent] after the async launch does not hide the real dispatch: the PASS for it -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const id = "toolu_01Real";
    const replay = blob([
      { type: "tool_use", id: "toolu_01Edit", name: "Edit", input: { file_path: PLAN, old_string: "a", new_string: "b" } },
      { type: "tool_use", id, name: "Agent", input: { subagent_type: JUDGE, prompt: `review ${PLAN}` } },
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
      { type: "tool_use", id: "toolu_01Other", name: "Agent", input: { subagent_type: JUDGE, prompt: "review" } },
    ]);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(id), asyncLaunch(id, "review"), replay, notification(id, "PASS")]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a verdict inside a blob record is ignored -> a replayed PASS leaves the dispatch unanswered, and a replayed PASS after the real FAIL does not supersede it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const id = "toolu_01Real";
    const replayed = blob([{ type: "tool_result", tool_use_id: id, content: "## Plan Review\nVERDICT: PASS\nnotes." }], "user");
    const pending = writeTranscript(dir, "pending.jsonl", [skillUse(), planWrite(), dispatch(id), replayed]);
    const waiting = await runCase(pending);
    assert.equal(waiting.decision, "deny");
    assert.match(waiting.reason ?? "", NO_VERDICT);

    const again = blob([{ type: "tool_use", id: "toolu_02Real", name: "Agent", input: { subagent_type: JUDGE, prompt: "review" } }]);
    const failed = writeTranscript(dir, "failed.jsonl", [skillUse(), planWrite(), dispatch(id), verdict("FAIL", { id }), again, blob([{ type: "tool_result", tool_use_id: "toolu_02Real", content: "VERDICT: PASS\n" }], "user")]);
    const kept = await runCase(failed);
    assert.equal(kept.decision, "deny");
    assert.match(kept.reason ?? "", UNANSWERED);
  });
});

test("a blob line replaying an answering write answers nothing -> a FAIL stays unanswered behind a replayed Edit, apply or judged none, a DENIED behind a replayed judged DENIED", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const call = (sub: string, rest: string) => `"/plugin/skills/planner/scripts/plan-build.sh" ${sub} "${PLAN}"${rest}`;
    const failed = [skillUse(), planWrite(), dispatch(), FAIL];
    const replays: Record<string, string> = {
      edit: blob([{ type: "tool_use", id: "toolu_01Edit", name: "Edit", input: { file_path: PLAN, old_string: "a", new_string: "b" } }]),
      apply: blob([{ type: "tool_use", id: "toolu_01Bash", name: "Bash", input: { command: call("apply", ' "/repo/.temp/viber/planner/fix.md"') } }]),
      none: blob([{ type: "tool_use", id: "toolu_01Bash", name: "Bash", input: { command: call("judged", " none") } }]),
    };
    for (const [name, replay] of Object.entries(replays)) {
      const f = writeTranscript(dir, `${name}.jsonl`, [...failed, replay]);
      const { decision, reason } = await runCase(f);
      assert.equal(decision, "deny", name);
      assert.match(reason ?? "", UNANSWERED, name);
    }
    const replay = blob([{ type: "tool_use", id: "toolu_01Bash", name: "Bash", input: { command: call("judged", " DENIED") } }]);
    const refused = writeTranscript(dir, "refused.jsonl", [skillUse(), planWrite(), dispatch(), DENIED, replay]);
    assert.match((await runCase(refused)).reason ?? "", REFUSED);
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

// --- plain plan mode: outside-plan-review, behind the outside-plan-review switch --
const GROUPED_OFF = "planning:\n  outside-plan-review: false\n";

test("the hooks.json description names the grouped key planning.outside-plan-review (the user-facing statement of what arms the gate)", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json"), "utf8"));
  assert.match(manifest.description, /planning\.outside-plan-review/);
});

test("the hooks.json description states the gate rule: the plan-judge reviewer, the three refusals and what answers a DENIED and a FAIL, and no rule about the reviewed text", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json"), "utf8"));
  assert.match(manifest.description, /viber:plan-judge/);
  assert.match(manifest.description, /no pair completed/);
  assert.match(manifest.description, /plan-build\.sh judged naming a plans\/\*\.md path with the word DENIED after it/);
  assert.match(manifest.description, /plan-build\.sh apply or open naming a plans\/\*\.md path/);
  assert.match(manifest.description, /with the word none after it/);
  assert.doesNotMatch(manifest.description, /review set|past 12|mtime|sum: </);
});

test("a flat outside-plan-review: true alone leaves the plain gate unarmed -> allow (only the planning: group arms it)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, "outside-plan-review: true\n");
    const f = writeTranscript(dir, "t.jsonl", [planWrite()]);
    assert.equal((await runCase(f, cwd)).decision, "allow");
  });
});

test("plain plan with outside-plan-review off, absent, or no config file at all -> allow (the switch is the only arming signal)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [planWrite()]);
    assert.equal((await runCase(f, sessionWithConfig(path.join(dir, "a"), GROUPED_OFF))).decision, "allow");
    assert.equal((await runCase(f, sessionWithConfig(path.join(dir, "b"), "planning:\n  adr: true\n"))).decision, "allow");
    const bare = path.join(dir, "c");
    fs.mkdirSync(bare);
    assert.equal((await runCase(f, bare)).decision, "allow");
  });
});

test("the unprefixed subagent spelling 'outside-plan-review' is recognized -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [planWrite(), dispatch(undefined, "outside-plan-review"), PASS]);
    assert.equal((await runCase(f, cwd)).decision, "allow");
  });
});

test("a plan-judge PASS does not satisfy the plain gate -> deny (each path answers only to its own reviewer)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [planWrite(), dispatch(), PASS]);
    const { decision, reason } = await runCase(f, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:outside-plan-review agent has not returned a verdict on it/);
  });
});

test("an outside-plan-review PASS does not satisfy the planner gate -> deny, whatever outside-plan-review says", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(undefined, PLAIN), PASS]);
    for (const [i, body] of [GROUPED_ON, GROUPED_OFF].entries()) {
      const { decision, reason } = await runCase(f, sessionWithConfig(path.join(dir, `s${i}`), body));
      assert.equal(decision, "deny");
      assert.match(reason ?? "", /viber:plan-judge agent has not returned a verdict on it/);
    }
  });
});

test("the verdict of the other reviewer never decides: a plan-judge FAIL beside an outside-plan-review PASS -> the planner plan denies on the FAIL, the plain plan allows on the PASS", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const both = [dispatch("toolu_judge"), verdict("FAIL", { id: "toolu_judge" }), dispatch("toolu_plain", PLAIN), verdict("PASS", { id: "toolu_plain" })];
    const planner = writeTranscript(dir, "planner.jsonl", [skillUse(), planWrite(), ...both]);
    const { decision, reason } = await runCase(planner, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:plan-judge agent returned 'VERDICT: FAIL'/);
    const plain = writeTranscript(dir, "plain.jsonl", [planWrite(), ...both]);
    assert.equal((await runCase(plain, cwd)).decision, "allow");
  });
});

test("an outside plan answers its FAIL with a Write or an Edit of the plan -> allow, and stays denied without one", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const failed = [planWrite(), dispatch(undefined, PLAIN), FAIL];
    assert.match((await runCase(writeTranscript(dir, "open.jsonl", failed), cwd)).reason ?? "", UNANSWERED);
    for (const tool of ["Write", "Edit"] as const) {
      const f = writeTranscript(dir, `${tool}.jsonl`, [...failed, planWrite(PLAN, tool)]);
      assert.equal((await runCase(f, cwd)).decision, "allow", tool);
    }
  });
});

// --- planner ownership across a mid-turn permission-mode record ----------

test("a mid-turn record before the planner EnterPlanMode with outside-plan-review on -> plan-judge still owns the plan, an outside-plan-review PASS never satisfies it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const head = [skillUse(), permissionMode("acceptEdits"), enterPlanMode(), planWrite()];
    const plain = writeTranscript(dir, "plain.jsonl", [...head, dispatch(undefined, PLAIN), PASS]);
    const { decision, reason } = await runCase(plain, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:plan-judge agent has not returned a verdict on it/);
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
      exitPlanMode(),
      permissionMode("acceptEdits"),
      userPrompt("next thing"),
      enterPlanMode(),
      permissionMode("plan"),
      planWrite(),
    ]);
    const { decision, reason } = await runCase(f, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:outside-plan-review agent has not returned a verdict on it/);
  });
});

test("a planner that stopped before EnterPlanMode, then a new user prompt enters plan mode -> the plain path, not plan-judge", async () => {
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
    assert.match(reason ?? "", /viber:outside-plan-review agent has not returned a verdict on it/);
  });
});

// --- plan mode left by hand keeps the episode open -------------------------

test("the user leaving plan mode by hand and coming back keeps the planner plan with plan-judge: its PASS allows, an outside-plan-review PASS never does (a mode toggle approves no plan)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const plan = realPlan(dir);
    const back = [permissionMode("acceptEdits"), userPrompt("back in plan mode"), permissionMode("plan"), planWrite(plan)];
    const heads: Record<string, string[]> = {
      entered: [permissionMode("acceptEdits"), skillUse(), enterPlanMode("toolu_enter"), permissionMode("plan"), planWrite(plan), ...back],
      inside: [permissionMode("plan"), skillUse(), planWrite(plan), ...back],
      refused: [permissionMode("plan"), skillUse(), planWrite(plan), exitPlanMode("toolu_exit"), refusedExit("toolu_exit"), ...back],
    };
    for (const [name, head] of Object.entries(heads)) {
      const plain = writeTranscript(dir, `plain-${name}.jsonl`, [...head, dispatch(undefined, PLAIN), PASS]);
      const { decision, reason } = await runCase(plain, cwd);
      assert.equal(decision, "deny", name);
      assert.match(reason ?? "", /viber:plan-judge agent has not returned a verdict on it/, name);
      const own = writeTranscript(dir, `own-${name}.jsonl`, [...head, dispatch(), PASS]);
      assert.equal((await runCase(own, cwd)).decision, "allow", name);
    }
  });
});

test("a review made before the user left plan mode by hand still counts on the way back -> allow (the toggle closes no episode, so the pair stays inside it)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [permissionMode("plan"), skillUse(), planWrite(), dispatch(), PASS, permissionMode("acceptEdits"), permissionMode("plan")]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("a plan written before the user left plan mode by hand still arms the gate on the way back -> deny, while an ExitPlanMode that was not refused closes the episode -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const toggled = writeTranscript(dir, "toggled.jsonl", [permissionMode("plan"), skillUse(), planWrite(), permissionMode("acceptEdits"), permissionMode("plan")]);
    assert.equal((await runCase(toggled)).decision, "deny");
    const approved = writeTranscript(dir, "approved.jsonl", [permissionMode("plan"), skillUse(), planWrite(), exitPlanMode("toolu_exit"), permissionMode("plan"), permissionMode("acceptEdits"), permissionMode("plan")]);
    assert.equal((await runCase(approved)).decision, "allow");
  });
});

// --- planner ownership needs the planner frontmatter in the plan file ----

/** The finding sequence: plan mode on, the planner Skill refused, then the user
 *  asks for a plain plan in the same episode. */
function refusedPlannerThenPlan(plan: string): string[] {
  return [permissionMode("plan"), skillUse(), userPrompt("write a plain plan"), planWrite(plan)];
}

test("a refused planner followed by a plain plan (no frontmatter) -> the plain path: an outside-plan-review PASS allows whatever the switch says", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = realPlan(dir, undefined, "# Plan\n");
    const f = writeTranscript(dir, "t.jsonl", [...refusedPlannerThenPlan(plan), dispatch(undefined, PLAIN), PASS]);
    for (const [i, body] of [GROUPED_ON, GROUPED_OFF].entries()) {
      assert.equal((await runCase(f, sessionWithConfig(path.join(dir, `s${i}`), body))).decision, "allow");
    }
    const unreviewed = writeTranscript(dir, "u.jsonl", refusedPlannerThenPlan(plan));
    const { decision, reason } = await runCase(unreviewed, sessionWithConfig(path.join(dir, "on"), GROUPED_ON));
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:outside-plan-review agent has not returned a verdict on it/);
  });
});

test("a plan opening with the planner frontmatter (LF or CRLF) stays with plan-judge: an outside-plan-review PASS -> deny, a plan-judge PASS -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const lf = realPlan(dir, ".claude/plans/lf/plan.md");
    const crlf = realPlan(dir, ".claude/plans/crlf/plan.md", "---\r\nsource: x.md\r\n---\r\n# Plan\r\n");
    for (const [n, plan] of [lf, crlf].entries()) {
      const plain = writeTranscript(dir, `plain${n}.jsonl`, [...refusedPlannerThenPlan(plan), dispatch(undefined, PLAIN), PASS]);
      for (const [i, body] of [GROUPED_ON, GROUPED_OFF].entries()) {
        const { decision, reason } = await runCase(plain, sessionWithConfig(path.join(dir, `s${n}${i}`), body));
        assert.equal(decision, "deny");
        assert.match(reason ?? "", /viber:plan-judge agent has not returned a verdict on it/);
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
      assert.match(reason ?? "", /viber:outside-plan-review agent has not returned a verdict on it/);
    }
  });
});

test("a relative plan file_path resolves against the session cwd -> its missing frontmatter hands the plan to the plain path, while without the cwd the unread plan keeps plan-judge", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const rel = ".claude/plans/2026-09-20-10-00-00_feat-x/plan.md";
    realPlan(cwd, rel, "# Plan\n");
    const f = writeTranscript(dir, "t.jsonl", refusedPlannerThenPlan(rel));
    const resolved = await runCase(f, cwd);
    assert.equal(resolved.decision, "deny");
    assert.match(resolved.reason ?? "", /viber:outside-plan-review agent has not returned a verdict on it/);
    // Without the cwd the path resolves to nothing: a read miss never loosens the gate.
    const unresolved = await runCase(f);
    assert.equal(unresolved.decision, "deny");
    assert.match(unresolved.reason ?? "", /viber:plan-judge agent has not returned a verdict on it/);
  });
});

test("a planner plan of any size is gated on plan-judge alone: 20 task blocks and one PASS -> allow (the gate counts no tasks)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const blocks = Array.from({ length: 20 }, (_, i) => `<!-- TASK -->\n### T${i + 1} - task\n<!-- /TASK -->\n`).join("");
    const plan = realPlan(dir, ".claude/plans/2026-10-21-12-00-00_big/plan.md", `---\nsource: x.md\n---\n# Plan\n${blocks}`);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), dispatch(), PASS]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

// --- outside plan: no file limit -----------------------------------------------

/** An outside plan naming `n` distinct repository files, written under `dir`. */
function outsidePlanNaming(dir: string, n: number): string {
  const files = Array.from({ length: n }, (_, i) => `src/f${i + 1}.ts`);
  return realPlan(dir, undefined, `# Plan\n\n${files.join("\n")}\n`);
}

test("no file limit: an outside plan naming 9 repository files is allowed on its outside-plan-review PASS (the gate counts no files)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const plan = outsidePlanNaming(dir, 9);
    const f = writeTranscript(dir, "t.jsonl", [planWrite(plan), dispatch(undefined, PLAIN), PASS]);
    assert.equal((await runCase(f, cwd)).decision, "allow");
  });
});

test("no file limit: an outside plan naming 12 repository files and no review yet -> the review next step, never a file count", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [planWrite(outsidePlanNaming(dir, 12))]);
    const { decision, reason } = await runCase(f, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:outside-plan-review agent has not returned a verdict on it/);
    assert.doesNotMatch(reason ?? "", /repository files/);
  });
});

const VIBER_DIR = path.resolve(import.meta.dirname, "../../viber");

test("the outside-plan-review agent replaces plain-plan-review under the same frontmatter fields, and plugin.json registers it", () => {
  const agent = fs.readFileSync(path.join(VIBER_DIR, "agents/outside-plan-review.md"), "utf8");
  const front = agent.split("---")[1];
  assert.deepEqual(
    front.split("\n").filter((l) => l.includes(":")).map((l) => l.slice(0, l.indexOf(":"))),
    ["name", "description", "tools", "model", "effort", "color"],
  );
  assert.match(front, /^name: outside-plan-review$/m);
  assert.equal(fs.existsSync(path.join(VIBER_DIR, "agents/plain-plan-review.md")), false);
  const agents: string[] = JSON.parse(fs.readFileSync(path.join(VIBER_DIR, ".claude-plugin/plugin.json"), "utf8")).agents;
  assert.ok(agents.includes("./agents/outside-plan-review.md"));
  assert.ok(!agents.includes("./agents/plain-plan-review.md"));
});

test("the outside-plan-review agent holds no Reviewed check and no closing-review clause in its calibration", () => {
  const agent = fs.readFileSync(path.join(VIBER_DIR, "agents/outside-plan-review.md"), "utf8");
  assert.doesNotMatch(agent, /Reviewed/);
  assert.doesNotMatch(agent, /closing implementation review/);
});

test("the help page links the outside-plan-review agent line and keeps no anchor to agent-plain-plan-review", () => {
  const page = fs.readFileSync(path.join(VIBER_DIR, "skills/setup/assets/help.html"), "utf8");
  assert.match(page, /id="agent-outside-plan-review"/);
  assert.doesNotMatch(page, /agent-plain-plan-review/);
});

test("the hooks.json description names outside-plan-review and states no file limit", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/hooks/hooks.json"), "utf8"));
  assert.match(manifest.description, /viber:outside-plan-review/);
  assert.match(manifest.description, /no file limit/);
  assert.doesNotMatch(manifest.description, /plain-plan-review|distinct repository files/);
});

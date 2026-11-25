/*
 * plan-gate.critical.test.ts - the critical tier of
 * viber/hooks/scripts/plan-gate.sh: the gate fails open on broken input,
 * denies ExitPlanMode while the reviewer of the plan (plan-judge under the
 * planner, outside-plan-review for a plain plan) has returned no verdict, a
 * DENIED, or a FAIL nothing answered, never takes the verdict of the other
 * reviewer, and arms and reads an answering write on Windows backslash paths.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by plan-gate.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/plan-gate.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import {
  SUT,
  writeTranscript,
  runCase,
  skillUse,
  planWrite,
  scriptCall,
  dispatch,
  verdict,
  PASS,
  FAIL,
  JUDGE,
  PLAIN,
  GROUPED_ON,
  sessionWithConfig,
} from "./plan-gate-fixture.ts";

const WIN_PLAN = "C:\\Users\\dariu\\repo\\docs\\plans\\2026-09-20_feat-x\\plan.md";

test("empty stdin -> allow (a broken gate must never trap the user in plan mode)", async () => {
  const result = await runScript(SUT, [], { shell: "bash", input: "" });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "allow");
});

test("both signals but no review dispatch -> deny naming the plan file and the plan-judge agent", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite()]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: review the plan/);
    assert.match(reason ?? "", /wrote plan\.md but the viber:plan-judge agent has not returned a verdict on it/);
  });
});

test("a Windows plan path (backslashes) arms the gate the same way", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(WIN_PLAN)]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /wrote plan\.md but/);
  });
});

test("dispatch + VERDICT: PASS -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), PASS]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("dispatch + VERDICT: DENIED -> deny with the permission next step (a reviewer that read nothing reviewed nothing)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const denied = verdict("DENIED", { body: "VERDICT: DENIED\nREASON: Read: /x/plan.md" });
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), denied]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: grant the permission/);
  });
});

test("dispatch + VERDICT: FAIL with no write after it -> deny with the answer next step (a failed review nothing answered opens no gate)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), FAIL]);
    const { decision, reason } = await runCase(f);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: answer the review/);
    assert.match(reason ?? "", /viber:plan-judge agent returned 'VERDICT: FAIL' for plan\.md and the plan was not written since/);
  });
});

test("a FAIL answered by a plan-build.sh apply call -> allow, a Windows plan path on its call line included", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    for (const plan of [undefined, WIN_PLAN]) {
      const name = plan ? "win" : "posix";
      const open = writeTranscript(dir, `${name}-open.jsonl`, [skillUse(), planWrite(plan), dispatch(), FAIL]);
      assert.equal((await runCase(open)).decision, "deny", name);
      const answered = writeTranscript(dir, `${name}.jsonl`, [skillUse(), planWrite(plan), dispatch(), FAIL, scriptCall("apply", plan)]);
      assert.equal((await runCase(answered)).decision, "allow", name);
    }
  });
});

test("plain plan with outside-plan-review on and no review dispatch -> deny naming outside-plan-review and what to pass it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [planWrite()]);
    const { decision, reason } = await runCase(f, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:outside-plan-review agent has not returned a verdict on it/);
    assert.match(reason ?? "", /one sentence stating the user's goal/);
    assert.match(reason ?? "", /planning\.outside-plan-review in \.claude\/viber\.yml/);
  });
});

test("plain plan with outside-plan-review on: outside-plan-review PASS -> allow, FAIL -> deny until an Edit of the plan answers it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const pass = writeTranscript(dir, "pass.jsonl", [planWrite(), dispatch(undefined, PLAIN), PASS]);
    assert.equal((await runCase(pass, cwd)).decision, "allow");
    const fail = writeTranscript(dir, "fail.jsonl", [planWrite(), dispatch(undefined, PLAIN), FAIL]);
    const { decision, reason } = await runCase(fail, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /viber:outside-plan-review agent returned 'VERDICT: FAIL'/);
    const answered = writeTranscript(dir, "answered.jsonl", [planWrite(), dispatch(undefined, PLAIN), FAIL, planWrite(undefined, "Edit")]);
    assert.equal((await runCase(answered, cwd)).decision, "allow");
  });
});

test("the PASS of the other reviewer opens neither gate -> a planner plan denies on an outside-plan-review PASS, a plain plan on a plan-judge PASS", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const planner = writeTranscript(dir, "planner.jsonl", [skillUse(), planWrite(), dispatch(undefined, PLAIN), PASS]);
    const own = await runCase(planner, cwd);
    assert.equal(own.decision, "deny");
    assert.match(own.reason ?? "", /viber:plan-judge agent has not returned a verdict on it/);
    const plain = writeTranscript(dir, "plain.jsonl", [planWrite(), dispatch(undefined, JUDGE), PASS]);
    const other = await runCase(plain, cwd);
    assert.equal(other.decision, "deny");
    assert.match(other.reason ?? "", /viber:outside-plan-review agent has not returned a verdict on it/);
  });
});

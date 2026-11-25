/*
 * plan-gate.critical.test.ts - the critical tier of
 * viber/hooks/scripts/plan-gate.sh: the gate fails open on broken input,
 * denies ExitPlanMode until a current review verdict PASS exists for planner,
 * plain outside-plan-review and large review-set plans, rejects stale or
 * tampered plans, reads a plan-build.sh write as a plan write, keeps a PASS
 * across a fix write only for the members that did not fail, keeps a PASS on a
 * `sum:` line only while its part of the plan is unchanged, and arms on Windows
 * backslash paths.
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
  scriptWrite,
  dispatch,
  verdict,
  realPlan,
  PASS,
  FAIL,
  PLAIN,
  GROUPED_ON,
  sessionWithConfig,
  SET_SPEC,
  SET_GRAPH,
  SET_TASK,
  taskPlan,
  reviewSetRound,
  memberRound,
  ALL_PASS,
  memberSums,
} from "./plan-gate-fixture.ts";

test("empty stdin -> allow (a broken gate must never trap the user in plan mode)", async () => {
  const result = await runScript(SUT, [], { shell: "bash", input: "" });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "allow");
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

test("a Windows plan path (backslashes) arms the gate the same way", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const win = "C:\\Users\\dariu\\repo\\docs\\plans\\2026-09-20_feat-x\\plan.md";
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(win)]);
    assert.equal((await runCase(f)).decision, "deny");
  });
});

test("dispatch + VERDICT: PASS -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(), dispatch(), PASS]);
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

test("a plan-build.sh apply call after the PASS -> deny, a Windows plan path on its call line included (the planner writes its plan through that script, so a PASS before it reviewed another text)", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const win = "C:\\Users\\dariu\\repo\\docs\\plans\\2026-09-20_feat-x\\plan.md";
    for (const plan of [undefined, win]) {
      const f = writeTranscript(dir, plan ? "win.jsonl" : "t.jsonl", [skillUse(), planWrite(plan), dispatch(), PASS, scriptWrite("apply", plan)]);
      const { decision, reason } = await runCase(f);
      assert.equal(decision, "deny", plan ?? "posix");
      assert.match(reason ?? "", /has not run on this version/);
    }
  });
});

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

test("plain plan with outside-plan-review on and no review dispatch -> deny naming outside-plan-review and what to pass it", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const f = writeTranscript(dir, "t.jsonl", [planWrite()]);
    const { decision, reason } = await runCase(f, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /outside-plan-review agent has not run on this version/);
    assert.match(reason ?? "", /one sentence stating the user's goal/);
    assert.match(reason ?? "", /planning\.outside-plan-review in \.claude\/viber\.yml/);
  });
});

test("plain plan with outside-plan-review on: outside-plan-review PASS -> allow, FAIL -> deny", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const cwd = sessionWithConfig(dir, GROUPED_ON);
    const pass = writeTranscript(dir, "pass.jsonl", [planWrite(), dispatch(undefined, PLAIN), PASS]);
    assert.equal((await runCase(pass, cwd)).decision, "allow");
    const fail = writeTranscript(dir, "fail.jsonl", [planWrite(), dispatch(undefined, PLAIN), FAIL]);
    const { decision, reason } = await runCase(fail, cwd);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /outside-plan-review agent returned 'VERDICT: FAIL'/);
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

test("review set: every member's latest verdict PASS with the passed slices covering every task -> allow", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const f = writeTranscript(dir, "t.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound(ALL_PASS)]);
    assert.equal((await runCase(f)).decision, "allow");
  });
});

test("review set: a PASS on a sum: line survives a later script write only while that sum is still the sum of its part of the plan -> matching sums allow, a member whose part changed is missing", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const sums = await memberSums(dir, plan);
    const same = writeTranscript(dir, "same.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound(ALL_PASS, { sums }), scriptWrite("apply", plan)]);
    assert.equal((await runCase(same)).decision, "allow");
    const changed = writeTranscript(dir, "changed.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound(ALL_PASS, { sums: { ...sums, b: "1-1" } }), scriptWrite("apply", plan)]);
    const { decision, reason } = await runCase(changed);
    assert.equal(decision, "deny");
    assert.match(reason ?? "", /^Next step: review the plan/);
    assert.match(reason ?? "", new RegExp(`${SET_TASK} \\(uncovered tasks T9-T16\\)`));
  });
});

test("review set: a fix write keeps the PASS of the other members only while the failed member passes again -> the failed one alone allows, another one alone or a write after a full PASS denies", async () => {
  await withTempDir("p2p2-plan-gate-", async (dir) => {
    const plan = taskPlan(dir, 20);
    const failed = [skillUse(), planWrite(plan), ...reviewSetRound({ ...ALL_PASS, b: "FAIL" }), planWrite(plan, "Edit")];
    const fixed = writeTranscript(dir, "fixed.jsonl", [...failed, ...memberRound("b", "PASS", { round: 2 })]);
    assert.equal((await runCase(fixed)).decision, "allow");
    const other = writeTranscript(dir, "other.jsonl", [...failed, ...memberRound("a", "PASS", { round: 2 })]);
    const kept = await runCase(other);
    assert.equal(kept.decision, "deny");
    assert.match(kept.reason ?? "", new RegExp(`${SET_TASK} \\(tasks T9-T16\\) returned 'VERDICT: FAIL'`));
    const voided = writeTranscript(dir, "voided.jsonl", [skillUse(), planWrite(plan), ...reviewSetRound(ALL_PASS), planWrite(plan, "Edit"), ...memberRound("b", "PASS", { round: 2 })]);
    const missing = await runCase(voided);
    assert.equal(missing.decision, "deny");
    assert.match(missing.reason ?? "", /^Next step: review the plan/);
  });
});

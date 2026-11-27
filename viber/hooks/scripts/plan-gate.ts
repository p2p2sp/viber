/*
 * plan-gate.ts - viber / PreToolUse hook for ExitPlanMode: a plan the
 * planner skill built leaves plan mode only after a passed review of the text
 * it holds. The entry holds no logic: lib/plan-gate.ts reads the transcript.
 *
 * Why a hook: the model skipping the review, or handing the user a plan whose
 * review failed, is the failure a rule in a prompt does not stop.
 *
 * Contract:
 *   stdin  : the PreToolUse payload, read for "transcript_path" alone.
 *   reads  : that transcript, a JSON record per line. Only the main session's
 *            "assistant", "user" and "queue-operation" records count.
 *   stdout : nothing when the call may pass: the hook takes no decision, so
 *            the user still approves the plan. To refuse:
 *            {"hookSpecificOutput":{"hookEventName":"PreToolUse",
 *             "permissionDecision":"deny","permissionDecisionReason":"..."}}
 *            with a reason opening on "Next step:".
 *   exit   : 0, always. Unreadable input, an unreadable transcript or any
 *            failure passes the call: a broken gate must not trap the user in
 *            plan mode.
 *
 * The gate looks only at the episode: the records after the last ExitPlanMode
 * that was not refused. It is armed when the episode holds a Skill call of
 * `planner` or `viber:planner`, that skill typed as a command, or a Bash
 * call of its `planner/scripts/plan.sh`; any other plan passes untouched.
 * The last planning skill of the episode decides: a Skill call of
 * `simple-plan` or `viber:simple-plan` whose result is no error, or that
 * skill typed as a command, after the last of those arming events disarms the
 * gate; a later arming event arms it again.
 * When armed it refuses unless, in this order, the episode holds:
 *   1. a Bash call of `plan.sh land` whose result carries `LANDED: <plan>`;
 *   2. after the last such landing, a dispatch of `viber:plan-reviewer`
 *      (a review of an earlier landing judged another text);
 *   3. for the last such dispatch, a `VERDICT: PASS` line in its tool result
 *      or in the notification naming its tool-use id, the last verdict line
 *      found deciding; no verdict yet and `VERDICT: FAIL` both refuse;
 *   4. no Write or Edit of <plan> after that dispatch.
 */

import fs from "node:fs";
import { gateReason } from "./lib/plan-gate.ts";

let reason: string | null = null;
try {
  const payload = JSON.parse(fs.readFileSync(0, "utf-8"));
  reason = gateReason(fs.readFileSync(String(payload.transcript_path), "utf-8").split("\n"));
} catch {
  reason = null;
}
if (reason !== null) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })}\n`);
}

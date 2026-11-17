VERDICT: RULED
RULING: Rule that T5 may edit and commit that file on top of the uncommitted T3/T4 edits (as the T4 decision did)
WHY: Waiting can never end because T7, the only task that can commit plan-review-prose.unit.test.ts, depends on T6, which depends on T5; moving the rule out of a Spec section breaks DoD.5; editing the file in the working tree keeps DoD.5 and the Verification run green, as T3/T4 already did.
COST: commit-task.sh refuses the path for T5 (per the reason), so the edit stays uncommitted and lands in T7's commit; if T7 rewrites that test's section list without keeping "## Spec" and the Spec/Attachments row, T5's prose case fails again and has to be redone.

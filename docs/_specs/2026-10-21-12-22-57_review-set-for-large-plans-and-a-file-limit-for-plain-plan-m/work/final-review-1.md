# Final review 1 (T1-T7)

## Blocking

none

## Minor

1. `viber/hooks/scripts/plan-gate.sh:311-325` (awk `runs()` with `chunk`): the set refusals (FAIL, DENIED, re-review, and the `uslices` of the missing refusal) print task-reviewer slices cut as 8 consecutive tasks from the start of each run (13 tasks -> `T1-T8, T9-T13`). `viber/skills/planner/SKILL.md` (step 3, review set) and the spec edge case "A plan of 13 tasks -> two slices, T1-T7 and T8-T13" define the slices as `ceil(n / 8)` runs of near-equal size, larger first (13 -> T1-T7, T8-T13; 30 -> T1-T8, T9-T16, T17-T23, T24-T30). The gate's text therefore tells the planner to dispatch different slices than its own skill prescribes. Coverage is still accepted (the gate marks tasks per range), so nothing breaks, but the two instructions disagree. Fix: have the `allslices` text (the whole set, over 1..n) use the same balanced split as the skill, and for a partial `uslices` keep chunks of at most 8; adjust the matching expectation in `tests/viber/plan-gate.test.ts` if it pins `T1-T8, T9-T13`.

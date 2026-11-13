VERDICT: RULED
RULING: rule T4 TDD: none, a test-only task whose measuring code lives in its own test file, sealed by the stubbed red run in .temp/viber/T4/red.log
WHY: T4 lists only tests/viber/rule-budget.unit.test.ts, which C4 makes hold the measuring code too, so red-check.sh treats the whole task as test and finds HEAD green; .temp/viber/T4/red.log shows the 5 synthetic tests for DoD.1 and DoD.2 failing with the measuring functions stubbed, so the test was seen to fail, and setting TDD to none states that plainly instead of waiving a check the task still claims.
COST: If wrong, T4 gets committed with no red proof that red-check.sh checked, and only the coder's stubbed log backs it; if the measuring code turns out wrong, the test has to be fixed and the five read sets measured again.

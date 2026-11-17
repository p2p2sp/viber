VERDICT: RULED
RULING: Let the next attempt add "Memory-owned" to the Task list of SCRIPT_SECTIONS in tests/viber/plan-review-prose.unit.test.ts, on top of T3's uncommitted edit, and commit that file with T4
WHY: The coder report says the only red is the missing "Memory-owned" name in the SCRIPT_SECTIONS Task list (needed for DoD.5). T3 is already committed (4938f2d8) and its Files list does not include this test file, so no actor can commit T3's leftover edit on its own. Folding the file into T4 is the only path an actor can carry out (an inference from the actor rules).
COST: T4's commit will also carry T3's Ids, Title and Blocks pins for that test, so the history credits them to T4. If those pins are wrong, the T4 commit has to be split or amended.

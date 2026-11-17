# Rulings

- T2: accept DoD.6 as met by the edited plan-index.sh header, proven by Verification alone, no header-text test | why: The plan-index.sh header (lines 260-268) already lists Ids, Blocks and Title among the exit-4 cases with the landed-plan, --split and --extra exemption; the blocking Source rule in test-strategy.md forbids a test reading script source as text, and DoD.1-4 tests prove the behaviour the header describes. | cost if wrong: If the header comment later drifts from the checks, no test catches it, and a review or a later task has to correct the comment by hand.

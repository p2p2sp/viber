# Failures

- task | review-T5-1 | tests/viber/plan-index.test.ts:1311 - Verification is red: 9 of the new profile tests fail (every `--split profile:` case, the verify/profile/dirty order test, the plain-call test); this is a finding from running `node --test tests/viber/plan-index.test.ts ...` (11 failures)
- task | review-T5-1 | tests/viber/plan-index.test.ts:3943 - two existing tests now fail because `--split` prints `profile:` lines: "the plain index and the --split index are the same lines as before the scope command existed" and "--split with a committed extras file of a task not done prints the orphan and dirty lines exactly as it would without one"

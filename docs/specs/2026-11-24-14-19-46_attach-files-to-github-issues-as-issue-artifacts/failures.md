# Failures

- task | final-review-1 | viber/skills/attach/SKILL.md:23 - the skill tells the model to name a REFUSED file "with its REASON=", but artifact-create.sh prints no REASON= line after REFUSED= (only after FAILED= and CREATED=)
- task | review-T1-1 | tests/viber/artifact-create.test.ts:104 - six tests prove none of DoD.1-DoD.5, and the task asked for no test beyond its DoD clauses: lines 104 (fragment URL), 113 (pull request URL), 124 (lookup resolving to a pull request), 135 (missing file), 145 (failed issue lookup), 157 (issue argument alone)
- task | review-T1-1 | tests/viber/artifact-create.test.ts:157 - breaks test-strategy Earned: "an issue argument alone, with no file or link, exits 2" tests a missing input, which the rule never allows as a reason for a test

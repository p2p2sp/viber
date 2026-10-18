# Final review 4

## Minor

1. `.claude/rules/tests-running.md:21` - ends with "`viber/skills/skill-designer/scripts/lint_skill.sh` has no test file at all." T31 added `tests/viber/lint_skill.test.ts` (commit f15f043b), so the statement is false and the sentence is now a stale document. Fix: delete that sentence (the basename mirror rule above it already covers the script: `lint_skill.sh` -> `tests/viber/lint_skill.test.ts`).

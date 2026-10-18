# Final review recheck 1

The stale sentence from final-review-4 is removed, but the edit broke the file.

## Minor

1. `.claude/rules/tests-running.md:21` - the fix joined two bullets into one line: the mirror bullet now ends with "(`viber/hooks/scripts/plan-gate.sh` -> `tests/viber/plan-gate.test.ts`).- There is no package.json, ..." The newline between the mirror bullet and the "There is no package.json" bullet was lost, so the second rule is no longer its own list item (visible in `git diff HEAD -- .claude/rules/tests-running.md`: the old line 22 is gone and line 21 carries both). Fix: restore a line break so the text reads "...`tests/viber/plan-gate.test.ts`)." on line 21 and "- There is no package.json, no npm script ..." starts line 22.

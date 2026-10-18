Stale statements now false (outside Files, left unedited): viber/skills/skill-designer/CLAUDE.md "Commands" says no test file covers lint_skill.sh; .claude/rules/tests-running.md says it has no test file at all; tests/viber/CLAUDE.md does not mention tests/viber/lint_skill.test.ts.
The test is integration tier (spawns the SUT), hence plain .test.ts, not .unit.test.ts.
Only the first line gets the CR strip; the closing-fence awk, name and user-invocable already tolerated CR.

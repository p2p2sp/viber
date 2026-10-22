# Final review 1 (T1-T7)

## Minor

1. viber/skills/setup/templates/viber.yml:27-29 and .claude/viber.yml:57-59 - the `outside-plan-review` comment still says "in plain plan mode" and "may name at most 8 repository files; past that, use /viber:intent". The 8-file limit is removed (S11, criterion 9) and plain plan mode is not a viber path. Fix: reword both comments to say a plan written outside the planner must pass `outside-plan-review` before plan mode can be left, with no file count. (T7 notes already flag the template.)
2. viber/docs/configuration.md:25 - the `planning.outside-plan-review` row says "in plain plan mode ... and may name at most 8 repository files". Same stale limit. Fix: drop the file limit and the plain plan mode wording.

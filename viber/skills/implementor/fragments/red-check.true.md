Red check: a coder `PASS` of a `TDD: required` task that is no coder failure gets one call before its review or commit, Bash timeout 600000, never in the background:

```
"${CLAUDE_PLUGIN_ROOT}/scripts/red-check.sh" "<plan>" "<id>"
```

- `red-check: FAIL-AS-EXPECTED <log>` -> go on as for that `PASS`.
- `red-check: PASSED-WITHOUT-CHANGE <files>` -> a coder failure, `REASON: tests pass without the change: <files>`.
- `red-check: UNRUNNABLE <reason>`, a non-zero exit or no `red-check:` line -> reviewer dispatch.
- Every reviewer dispatch of a task the check ran on carries its last `red-check:` line (`red-check: UNRUNNABLE <the exit or the missing line>` when none came).

Count each result for the final summary: `FAIL-AS-EXPECTED` sealed, `PASSED-WITHOUT-CHANGE` rejected, `UNRUNNABLE` by task id.

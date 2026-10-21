Skip this step, completing its `Final review` entry, when the index's `closed:` line names `final-review`, the build ended on `abort`, or no task was committed this run.

Cut every task of the index, in index order, skipped ones included, into groups of at most 8 consecutive tasks, one group per slice.

Dispatch one `viber:final-reviewer` (Agent tool, `model` sonnet clamped into the tiers range) per slice, all in one message, each carrying:

```
run: <dir>
tasks: <the slice's task ids, comma-separated>
report: <dir>/work/final-review-<slice number>.md
refs: ${CLAUDE_PLUGIN_ROOT}/references
memory: <the config block's build.memory value>
```

- `VERDICT: DENIED` -> `AskUserQuestion` naming that slice: retry / accept / abort.
- No reviewer returned `VERDICT: FAIL` -> complete the entry and skip the rest of this step.
- Any reviewer's `VERDICT: FAIL`, once every reviewer above has returned, been retried or been accepted -> fix round 1: dispatch `viber:task-coder` (Agent tool, `model` sonnet clamped into the tiers range), carrying:

```
spec: <dir>/spec.md
review: <a REPORT path this round fixes>, one `review:` line per such report
notes: <dir>/work/final-fix-coder-1.md
out: .temp/viber/final-fix/
refs: ${CLAUDE_PLUGIN_ROOT}/references
memory: <the config block's build.memory value>
```

- Fix coder `VERDICT: DENIED` -> `AskUserQuestion`: retry / accept / abort; `accept` commits the fix, its refused call named in the final summary.
- The fix is every `FILES:` path this step's fix coder returned. None -> no recheck and no commit.
- Otherwise dispatch one `viber:final-reviewer` (Agent tool, `model` sonnet clamped into the tiers range) to recheck the fix, carrying:

```
run: <dir>
fix: <the fix paths, comma-separated>
review: <a REPORT path>, one `review:` line per report this step wrote so far, slice and recheck alike
report: <dir>/work/final-review-recheck-1.md
refs: ${CLAUDE_PLUGIN_ROOT}/references
memory: <the config block's build.memory value>
```

- Recheck `VERDICT: PASS` -> commit the fix.
- Recheck `VERDICT: DENIED` -> `AskUserQuestion`: retry / accept / abort; `accept` commits the fix, its refused call named in the final summary.
- Recheck `VERDICT: FAIL` -> no second fix round: the arbiter with `case: final-review`, `options: accept`, `report:` the recheck's `REPORT` path. Record its ruling with subject `final-review`, then commit the fix, that `REPORT` path named in the final summary.
- Commit the fix: `"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" --review "<plan>" "<file>" ["<file>"...]` naming every fix path.

Complete the entry. Carry to the final summary: every `FIXED:` line the fix coder returned, every `OWNER:` line any reviewer or recheck returned, every fix coder's `REASON:` on `FAIL`, every accepted recheck `REPORT`, and every refusal accepted through this step.

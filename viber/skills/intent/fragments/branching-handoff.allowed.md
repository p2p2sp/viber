A new issue saved after the start step (the `ISSUE_URL=` of `issue-create.sh`; after an issue set save, this cycle's part sub-issue URL, and no re-run when that one did not land or `mode: off`) -> right after that save and before the "what next" question, run the same `--start` line once more with the same flags plus `--settled <settlement>` and the new issue URL in place of the earlier one.

- The settlement is the entry key, `no-branch`, `current` or `pr` last settled, `nothing` when none was.
- Handle its report as the start step does.
- `next: kept` -> the earlier settlement stands, nothing new is shown.
- `next: errors` with a `settled:` line -> that settlement stands.

The confirmed summary carries the run branch the start step settled, and the hand-off restates the `Work:` / `Branch:` and run branch lines as last settled: after a re-settle following an issue save they replace the confirmed summary's ones, with no new confirmation. Each line on its own, and none when the start step handed off no branch line:

- `Work: <entry key>` (after "stay" it is the only branch line besides the entry's run branch line), or `Work: none` after "no branch".
- `Branch: <the current: value>` only after "build on `current:`", never for `current: detached`.
- The run branch line beside `Work:`, in the conversation's language and opening with neither `Work:` nor `Branch:`: the entry key, the `name:` pattern, the entry's `base:` and `target:`; or, after "no branch" or "build on `current:`", that there is no run branch and commits land on `<current:>`.

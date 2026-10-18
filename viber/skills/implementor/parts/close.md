## 5. Close

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.final-review "${CLAUDE_SKILL_DIR}" final-review
```

Dispatch `viber:test-runner` with report path `<dir>/work/tests-<round>.md`, round starting at 1, and the line `run: <dir>`.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.baseline-tests "${CLAUDE_SKILL_DIR}" baseline-close
```

Repair dispatch: `viber:task-coder` (model `sonnet` clamped into the tiers range) with `spec: <dir>/spec.md`, the last `REPORT` path as `report:`, `notes: <dir>/work/repair-<round>-coder.md`, `out: .temp/viber/repair-<round>/` and `refs: ${CLAUDE_PLUGIN_ROOT}/references`.

Repair commit, every path on the coder's `FILES:` line through the form that owns it:

- A path the index's `files` column claims -> `"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" "<plan>" "<id>" "<round>" "<file>" ["<file>"...]`, one call per task.
- A path no column claims -> one `"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" --repair "<plan>" "<round>" "<file>" ["<file>"...]` for all of them. Never borrow a task id for such a file.

- Test-runner `VERDICT: PASS` or `VERDICT: SKIP` -> `TaskUpdate` -> completed.
- Test-runner `VERDICT: FAIL`, round 1 to 5 -> repair dispatch.
- Test-runner `VERDICT: FAIL`, round 6 -> the arbiter with `case: tests`, `options: accept`, `report:` that run's `REPORT` path. Record its ruling with subject `tests`, then go to step 6, that failing run named in the final summary.
- Test-runner `VERDICT: DENIED` -> `AskUserQuestion`: retry / accept / abort.
- Repair coder `PASS` or `FAIL` -> repair commit, then test-runner at the next round. No `FILES:` line -> no commit, test-runner at the next round.
- Repair coder `VERDICT: DENIED` -> commit nothing; `AskUserQuestion`: retry / accept / abort.

## 6. Record what the build taught

For each close part below the index's `closed:` line does not already name, all in one message:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.memory "${CLAUDE_SKILL_DIR}" memory
```

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.rules "${CLAUDE_SKILL_DIR}" rules
```

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.qa "${CLAUDE_SKILL_DIR}" qa
```

Any agent of this step returning `VERDICT: DENIED` -> `AskUserQuestion` naming that agent: retry / accept / abort.

Commit what the memory and rules dispatches above return, one call: memory and rule paths, through `"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" --chore "<plan>" "<file>" ["<file>"...]`, only once every writer of this step has returned. No writer returned a path, or only `VERDICT: NONE` -> no call.

`TaskUpdate` -> completed for each entry in the message answering its own writer's return, never held for another writer or the `--chore` call: the `memory` and `rules` entries on that return, the QA entry with its `--qa` call, or on that return when no call is due.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.extensions "${CLAUDE_SKILL_DIR}" extensions
```

## 7. Archive and close

First `"${CLAUDE_PLUGIN_ROOT}/scripts/run-clock.sh" "<started>"`, one call.

For the close part below, when the config block's `build.cleanup:` line reads `true`, the index's `closed:` line does not already name it and the build did not end on `abort`, compose the final summary in its archived form, then:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.cleanup "${CLAUDE_SKILL_DIR}" cleanup
```

Complete every task the last `progress: <n>/<total>` settled and every entry still open. Never delete the list.

Then close:

- `closeout` returned `VERDICT: ARCHIVED` -> print `<n>/<total> tasks committed, tests <the test verdict>, <elapsed>` (`, <elapsed>` left out on `elapsed: unknown`), then `Summary: <path>/outcome.md`, then the closing sentence, then, only with a `next: part` index line, `/viber:intent <path>/roadmap.md`; `<path>` is the directory its `PATH:` line names, the parenthesized file count dropped. Nothing else.
- Every other case (the close part not run, `abort`, `BLOCKED`, an accepted `DENIED`) -> print the final summary in its screen form.

Final summary, both forms: max 7 lines, then every line this step places after them. The 7 lines: tasks committed, review rounds spent, test verdict, the clock's `elapsed:` (none on `elapsed: unknown`, never estimated), what memory, rules and QA recorded, then the form's own line below, then everything the steps carried to it but the `FIXED:`, `OWNER:` and `left uncommitted:` lines.

- Archived form: the archive path `docs/<directories.specifications>/<key>` (the config block's `directories.specifications:` value, the landing's `key:`).
- Screen form: the drift from `closeout`'s `DRIFT:` line, when `closeout` returned one.

After the summary and outside its 7 lines, list every `FIXED:` line the final review carried, then every `OWNER:` line it carried, each verbatim. Every `left uncommitted:` line also stands outside the 7 lines, in both forms, verbatim, so it reaches `closeout`'s `summary:`.

After those, also outside its 7 lines, list the rulings: each index `ruling:` line, then each ruling this session recorded that is not already one, every one with its ruling, `why:` and `cost if wrong:`.

Closing sentence, in both forms: one sentence in the conversation's language, printed after everything above it (archived form: after the `Summary:` line). All clear when no problem kind below was found; otherwise it says `outcome.md` records a problem (on the screen form with no `outcome.md`: the summary above records a problem), naming each kind found. `OWNER:` lines and drift markers are no problem kind. The kinds:

- skipped task
- commit without review
- tests accepted while failing
- final review fix accepted over a failed recheck
- file left uncommitted (a `left uncommitted:` line, or `closeout`'s `LEFT:` line above `none`)
- deferred path without an owner

With a `next: part` index line and a build not ended on `abort`, the last line of the screen form, after the closing sentence, is `/viber:intent <dir>/roadmap.md`.

On a pull request branch (step 1) with no `next: part` index line:

- The build ended on `abort`, or `closeout` returned `BLOCKED` -> the final summary carries one line naming the `branch:` value and the `target:` value as the pull request target and suggesting `/viber:pr-create`.
- Otherwise, once everything above is printed -> `AskUserQuestion` naming both values: open the pull request now, or not now. Now -> invoke the `viber:pr-create` skill (Skill tool). Not now -> end.

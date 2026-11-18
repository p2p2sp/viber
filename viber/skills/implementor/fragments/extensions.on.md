Run the project's own extensions, once every writer above has returned and the commits of its returns have landed. Skip this step, completing its `Run extensions` entry, when the build ended on `abort`.

The steps are the `NEXT: extension` blocks the index of step 2 printed, in listed order, each block's `step:` field its step number. The `Run extensions` entry's `TaskUpdate` -> completed lands once every step has finished, or at once when the index printed no block.

Dispatch each block by its bare `name:` (Agent tool) carrying the block's four lines after `NEXT:` verbatim and nothing else.

Dispatch every block of one `step:` number in one message, then handle the returns as they arrive: when several are waiting, one commit per message, the others held for the next. Start the next step only once every return of the current one has been handled and its commits have run.

- `VERDICT: WRITTEN` -> `"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" --extension "<plan>" "<name>" "<file>" ["<file>"...]` with its `FILES:` paths.
- `VERDICT: NONE` -> no commit, nothing recorded.
- `VERDICT: FAIL` -> its `REASON:` goes to the final summary with that extension's name.
- An agent type the harness reports as not found -> that name goes to the final summary with the hint to reload the session so the harness loads the new agent file.
- `VERDICT: DENIED` -> `AskUserQuestion` naming that extension: retry / accept / abort.
- An `--extension` call exiting non-zero -> one `left uncommitted: <path> | extension <name> commit refused` line per path in the final summary.

A `FAIL`, a not-found agent type or a refused `--extension` commit gets no retry, arbiter or question and never stops the archive. Every `build.extensions-missing:` name other than `none` goes to the final summary as a listed extension with no agent file, also when no step is dispatched.

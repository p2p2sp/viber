- With a `NEXT: qa-kept` block from the index of step 2: run its `RUN:` line and dispatch no `qa-writer`; its `"<file>"` arguments are the QA paths.
- Otherwise `viber:qa-writer` with `spec: <dir>/spec.md`, `notes: <dir>/work/`, `refs: ${CLAUDE_PLUGIN_ROOT}/references` and `out: <dir>`.

QA paths of a writer, the `FILES:` of `VERDICT: WRITTEN`, commit through `"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" --qa "<plan>" "<file>" ["<file>"...]`. No `FILES:` line, or only `VERDICT: NONE` -> no call.

A `qa.md` among the QA paths, once its `--qa` commit exited 0, is posted to the run's issue (the branch's pull request when the run has none) through `"${CLAUDE_PLUGIN_ROOT}/scripts/qa-comment.sh" "<the qa.md path>"`, with no `--pr` and no question, one call, never retried. Its stdout and exit carry to the final summary:

- `STATUS=posted` -> its `COMMENT_URL=` value.
- `STATUS=skip` with `REASON=no-gh` or `REASON=no-repo` -> its `SAY=` line.
- `STATUS=skip` with `REASON=no-pr` or `REASON=exists` -> nothing.
- Exit 1 or 2 -> one line with its `ERROR` text.

No `qa.md` among the QA paths, or its `--qa` commit left uncommitted -> no call. A `qa.e2e.md` is never posted.

A `qa.e2e.md` among the QA paths earns one more line in the final summary: `/viber:e2e` turns it into Playwright tests.

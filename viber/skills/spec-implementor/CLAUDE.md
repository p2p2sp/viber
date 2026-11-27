# spec-implementor scripts

- `work/state.json` is committed and resumed on other machines: store no absolute path in it; a task's `fix`, `previous` and `report` are relative to the work directory.
- Old states must still load: one with no `before`, one with no `overruns` (`build-close.ts` sets zeros) and one at step `memory` or `rules` (resumed as `writers`). Keep that when changing `State` in `lib/build-state.ts`.
- One call holds `.temp/viber/<name>/lock/` and waits up to `LOCK_WAIT_MS` (90 s, `lib/build-run.ts`) for the call before it, whose commit hooks may run a linter.
- Git writes run `build-commit.ts` as a child process (`lib/adapters/git.ts`), so a refusing hook's stderr becomes the fix finding. Every git pathspec is literal (`GIT_LITERAL_PATHSPECS=1`), never a glob.
- The rules writer has the memory writer's send-back on its own counter, at `RULES_LIMIT` 200 bytes of net growth under `.claude/rules/viber/` (`lib/build-growth.ts`); neither limit is configurable.
- `tests/fake-ports.ts` implements the `Fs`, `Git` and `Gh` of `lib/ports.ts` and builds a `Ctx`: a new port method or `Ctx` field needs it there too.

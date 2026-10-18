Dispatch `viber:closeout` (Agent tool) carrying these lines and nothing else, the archived final summary filling every line below `summary:` up to the end of the prompt:

```
run: <dir>
summary:
<the final summary, archived form>
```

- `VERDICT: ARCHIVED` -> the close of step 7.
- `VERDICT: DENIED` -> `AskUserQuestion`: retry / accept, `accept` then read as `BLOCKED`.
- `VERDICT: BLOCKED` -> no archive commit landed; name its `REASON:` in the final summary, plus that the leftovers commit (`chore(viber): commit changes made outside the plan`) may already have landed, that `<dir>/outcome.md` may be left uncommitted, on a `DRIFT:` other than `none` that `<dir>/spec.md` holds uncommitted drift markers, and that a failed git step may have left the run moved but uncommitted (`git status` shows it).

Continue.

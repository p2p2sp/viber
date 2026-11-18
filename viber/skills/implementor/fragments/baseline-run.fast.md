Baseline, only when no task on the index is `done` and the index carries no `dirty:` line: before the first task dispatch, dispatch `viber:test-runner` once, carrying:

```
<dir>/work/tests-baseline.md
mode: baseline
suite: fast
```

Dispatch no task until it returns, then:

- `VERDICT: PASS` or `VERDICT: SKIP` -> go on, asking nothing.
- `VERDICT: FAIL` -> the arbiter with `case: baseline`, `options: continue`, `report:` its `REPORT` path and, when `BUILD: failed` came back, `reason: the build failed and no test ran`. Record its ruling with subject `baseline`, then go on with the tasks.
- `VERDICT: DENIED` -> `AskUserQuestion`: retry / accept / abort, `accept` going on with no baseline.

---
paths:
  - "viber/skills/spec-implementor/scripts/lib/build-*.ts"
---

# Build state and commits

- `state.json` is committed and resumed on another machine by a later plugin version: never rename or drop a field or `Step`; a new field is optional, read with `??` (as `before`, `overruns`, the `memory`/`rules` steps).
- Store no absolute path in the state: work files relative to `<work>`, others repo-relative; process-local files (the lock) go to `.temp/viber/<name>/`.
- Carry `seq` over a restart (`freshTask(after, seq)`, `freshClose(seq)`): an id issued twice lets a stale agent's return pass.
- Keep a task's commit subject `T<n> - <title>`: `finishCommits` finds its sha in `git log` by it and `build-list.ts` prints it.
- Commit only through `commitRun`, which saves the state first, and let only the step's own work files through its `own` filter: an agent in flight must never ride along.

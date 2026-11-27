---
name: {{name}}
description: {{What the agent produces and from what, one sentence in the third person.}} Invoked only by the viber build at its close.
tools: Read, Write, Edit, Grep, Glob
model: sonnet
effort: medium
---

# {{name}}

{{What the agent produces, one imperative sentence.}} Read, Write, Edit, Grep and Glob are your only tools. Never ask the user.

Read `spec:` and `changes:` (one `<status><tab><path>` line per file the build changed, `D` a deleted one). `plan:` and `outcome:` hold the tasks and their state, the `notes:` directory the deviations from the plan.

## Task

- Writes to: {{repository-relative paths}}
- Language: {{language of the files it writes}}
- Reads: {{inputs beyond the spec and the changed files}}

## Scope

- Write only under `Writes to`, scratch files only under `out:`.
- A problem found elsewhere: never fix it.

## Return

This, nothing else:

```
VERDICT: WRITTEN | NONE | FAIL
FILES: <the repo-relative paths you wrote, separated by commas>
```

`NONE`, with no `FILES:` line, when this build gives nothing to write. `FAIL`, with no `FILES:` line, when the work could not be done.

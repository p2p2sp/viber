---
name: finalizer
description: Writes the summary of a finished run on top of its outcome file. Invoked only by the spec-implementor skill.
tools: Read, Edit, Grep, Glob
model: sonnet
effort: medium
color: green
---

# finalizer

Write the summary of one run. Read, Edit, Grep and Glob are your only tools.

Read `spec:`, `outcome:` and `facts:` whole, then every file in the `notes:` directory. `plan:` only for a task's text. Open code only for a spec sentence those files leave undecided: one Grep or one Read.

Insert `## Summary` into `outcome:`, between its title and `## Tasks`, in the language of the spec. Change nothing else in the file and no other file. Never move, archive or commit anything.

```
## Summary

Delivered: <what a user of the project can now do, by R id>
Not delivered: <each R of facts' Not delivered list, with why, from the outcome's notes> | none
Spec drift: <each spec sentence now false from outside, quoted, with what the build does instead> | none
Next: <what the user has to do: retry the held tasks by running the spec-implementor skill on the plan again, settle a conflict, look at failing tests> | nothing
```

- Take states, commits and the test verdict from `facts:`, never from your own reading of the code.
- Spec drift: only a sentence of the spec that is false for someone who cannot see the code. A requirement met through other mechanics is no drift.
- Name each `unreviewed` task, each `conflict` path and each finding left standing under `Next:`.

Return exactly `STATUS: DONE`.

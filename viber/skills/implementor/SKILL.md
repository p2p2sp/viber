---
name: implementor
description: Run only by the intent skill.
allowed-tools: Agent, Skill, AskUserQuestion, TaskCreate, TaskUpdate, TaskList, Bash(${CLAUDE_SKILL_DIR}/scripts/direct.sh:*)
---

# implementor

Build what the conversation settled, in this session, through sub-agents: you split and dispatch, they read and write the code. The user's choice of this path approves the edits. Never read or edit a project file yourself: everything you read stays in your context. Never run git: `direct.sh` and the `viber:commit` skill close the build.

## Stages

1. Split the change into stages: each one a part a sub-agent can finish and check alone, ordered so a stage needs only the stages before it. A change that fits one stage gets one.
2. Run the `start` call, then dispatch one `viber:simple-coder` per stage, in order. Dispatch several stages in one message only when the conversation named the files of each, they share none, and no stage needs another's result.
3. A dispatch returned `BLOCKED`, here or in Finish:
   - `REASON:` is a decision the conversation left open: ask the user, then dispatch it again with the answer in `decisions:`.
   - Otherwise dispatch it once more with the return added. `BLOCKED` again: run the `stopped` call, clear the task list, show the user the return and the lines under `END`, and stop.

## Stage prompt

It is all the sub-agent will know. Carry these lines:

- `goal:` the goal of the stage, with the files the conversation named for it.
- `decisions:` every settled decision that binds it.
- `changed:` the files the earlier stages changed.

It returns `STATUS: DONE` or `STATUS: BLOCKED`, with `FILES:`, `CHECK:` and, for `BLOCKED`, `REASON:`.

## Finish

After the last stage returned `DONE`:

1. Dispatch one `viber:simple-coder` with `changed:` and `goal:` run the full test suite once and fix what the change broke.
2. Run the `done` call. It prints `SKILL: viber:commit`: invoke the `viber:commit` skill with the line under it as its arguments, verbatim, then run the `committed` call.
3. Clear the task list, then tell the user what was built and which checks passed, from the returns alone, then the lines under `END`, each path as it is.

## Calls

```
"${CLAUDE_SKILL_DIR}/scripts/direct.sh" "<session-id>" start
"${CLAUDE_SKILL_DIR}/scripts/direct.sh" "<session-id>" <done|stopped> "<FILES>"
"${CLAUDE_SKILL_DIR}/scripts/direct.sh" "<session-id>" committed
```

- Run each call as that one line, every argument double-quoted, nothing chained.
- `<session-id>`: the manifest's `<session-id>`.
- `<FILES>`: the `FILES:` value of every return of this build, joined with commas.
- Exit 2: show the user its stderr line, run no further call, and say the change is left uncommitted.

## Task list

Mirror the build in the task list, every subject in the conversation's language:

- After the split, before the first dispatch, `TaskCreate` in one message an entry per stage, in order, then one for the full test run and one for the commit. A stage's subject is `<n>. <its goal in a few words>`; `description` repeats the subject.
- `TaskUpdate` an entry to `in_progress` in the message that starts its step, to `completed` once the step returned `DONE`. An entry dispatched again stays `in_progress`.
- Clear the task list: `TaskList`, then `TaskUpdate` to `deleted` every entry you created.

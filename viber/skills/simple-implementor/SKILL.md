---
name: simple-implementor
description: Implements a settled plan stage by stage through sub-agents, then reviews the change. Run only from a simple-plan plan, or when the user asks for it by name.
allowed-tools: Agent, Skill, TaskCreate, TaskUpdate, TaskList
model: sonnet
effort: high
---

# simple-implementor

Run `ExitPlanMode` first, if plan mode is active.

Implement the plan through sub-agents: you split and dispatch, they read and write the code. With no plan, the plan is what the conversation settled. Never read or edit a project file yourself: everything you read stays in your context.

## Stages

1. Split the plan into stages: each one a part a sub-agent can finish and check alone, ordered so a stage needs only the stages before it. A plan that fits one stage gets one.
2. Dispatch one `viber:simple-coder` per stage, in order. Dispatch several stages in one message only when the plan names the files of each, they share none, and no stage needs another's result.
3. A dispatch returned `BLOCKED`, here or in Finish: dispatch it once more with the return added. `BLOCKED` again: clear the task list, show the user the return and stop.

## Stage prompt

It is all the sub-agent will know. Carry these lines:

- `goal:` the goal of the stage.
- `decisions:` every settled decision that binds it.
- `changed:` the files the earlier stages changed.

It returns `STATUS: DONE` or `STATUS: BLOCKED`, with `FILES:`, `CHECK:` and, for `BLOCKED`, `REASON:`.

## Finish

After the last stage returned `DONE`:

1. Dispatch one `viber:simple-coder` with `changed:` and `goal:` run the full test suite once and fix what the change broke.
2. Invoke the `code-review` skill on the change, adding to its arguments, with the manifest's `<session-id>` filled in: `write the result to markdown file in .temp/viber/<session-id>/code-review/, each finding with its severity (important, pre_existing or nit), return only its path, the number of findings and the number of them that are not nit`. Never read that file.
3. The second number is above 0: dispatch one `viber:simple-coder` with `changed:`, `findings:` the path, and `goal:` fix every finding except the `nit` ones, then run the full test suite once. Never review a second time.
4. Clear the task list, then tell the user what was built, which checks passed, both numbers and the review file's path, from the returns alone. Leave the change uncommitted.

## Task list

Mirror the build in the task list, every subject in the conversation's language:

- After the split, before the first dispatch, `TaskCreate` in one message an entry per stage, in order, then one for the full test run and one for the code review. A stage's subject is `<n>. <its goal in a few words>`; `description` repeats the subject.
- The entry for fixing the findings: create it only when the second number is above 0.
- `TaskUpdate` an entry to `in_progress` in the message that starts its step, to `completed` once the step returned `DONE` or the review returned its numbers. An entry dispatched again stays `in_progress`.
- Clear the task list: `TaskList`, then `TaskUpdate` to `deleted` every entry you created.

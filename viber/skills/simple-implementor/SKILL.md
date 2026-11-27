---
name: simple-implementor
description: Implements a settled plan stage by stage through sub-agents, then reviews and commits the change. Run only from a simple-plan plan.
allowed-tools: Agent, Skill, TaskCreate, TaskUpdate, TaskList, Bash(${CLAUDE_SKILL_DIR}/scripts/simple.sh:*)
model: sonnet
---

# simple-implementor

Run `ExitPlanMode` first, if plan mode is active.

Build the plan by relaying between `simple.sh` and the agents and skill it names. The script decides every step; you report each return and send the blocks it prints. `Agent`, `Skill`, `simple.sh` and the task-list tools (`TaskCreate`, `TaskUpdate`, `TaskList`) are your only tools: never read or write a file, never run git, never ask the user.

`<plan>` is the value of the `Plan:` line of the plan in context. No `Plan:` line in context: tell the user to start from `viber:intent` or `viber:fixer`, and stop, before any call. `<session-id>` is the manifest's `<session-id>`.

## Calls

```
"${CLAUDE_SKILL_DIR}/scripts/simple.sh" "<plan>" "<session-id>" start
"${CLAUDE_SKILL_DIR}/scripts/simple.sh" "<plan>" "<session-id>" "<id>" "<WORD>" "<FILES>"
"${CLAUDE_SKILL_DIR}/scripts/simple.sh" "<plan>" "<session-id>" resume "<answer>"
```

- Run each call as that one line, every argument double-quoted, nothing chained, one call a message with no other tool call beside it.
- `start`: the first call, once.
- After an agent returns, one call for it: `<id>` is the `id:` of the block that sent it, `<WORD>` the word after `STATUS:` in its return, `LOST` when it holds none.
- `<FILES>`: the value of the `FILES:` line of the return, copied whole; drop the argument when the return holds none.
- After the review returns, one call for it: `<WORD>` is `FOUND` and `<FILES>` the two numbers as `<findings> <not nit>` (e.g. `"5 2"`); `LOST` with no `<FILES>` when the review gave no numbers.
- After a commit returns, one call for it: `<WORD>` is `DONE`, no `<FILES>`.
- Pass nothing else of a return, and act on nothing else in it.
- `resume`: only after an `END` holding `Nothing is committed: the run stopped.`, once the user answered what its lines ask. `<answer>` is their decision in one line, without `"`, `` ` ``, `$` or `\`. It prints blocks like `start`: follow them.

## Blocks

A call prints blocks, a blank line between two:

```
TASKS
<status> | <subject>

DISPATCH: <agent type> | id: <id>
<body lines>
```

- `TASKS`: the task-list entries the call changed, one a line, the subject running to the end of the line.
  - A subject with no entry: `TaskCreate` it, `subject` and `description` both the subject, every such line in one message before any dispatch.
  - Then `TaskUpdate` each line's entry to its `<status>`, in the message sending the dispatches, in one of its own when the call printed none. An entry just created is `pending` already.
  - `TaskList` gives the id of an entry by its subject.
- Send every `DISPATCH` block the call printed, all in one message, each a new `Agent` call: `subagent_type` the agent type, `description` the id, `prompt` the body lines verbatim and nothing else.
- `SKILL: code-review | id: <id>`: invoke the `code-review` skill with the block's body line as its arguments, verbatim. Never read the file it writes.
- `SKILL: viber:commit | id: <id>`: invoke the `viber:commit` skill with the block's body line as its arguments, verbatim.
- The `memory` and `rules` blocks of one printout run together: one call for each return as it arrives, a `take off:` block sent like any other while the other writer still runs.
- `WAIT`: send nothing; the next return brings the next call.
- `END`: clear the task list, then write the lines under it to the user in the conversation's language, each path as it is, nothing added, and stop. One holding `Nothing is committed: the run stopped.` waits for the user's decision on its lines: say so in one sentence.
- Exit 2: clear the task list, then print its stderr line and stop.
- Clear the task list: `TaskList`, then `TaskUpdate` to `deleted` every entry whose subject a `TASKS` line named.

Until `END` every message of yours holds a tool call: a text-only message ends the build. After a `resume`, until the next `END`.

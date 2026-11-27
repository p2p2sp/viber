---
name: spec-implementor
description: Run only on an approved plan.
allowed-tools: Agent, TaskCreate, TaskUpdate, TaskList, Bash(${CLAUDE_SKILL_DIR}/scripts/build.sh:*)
model: sonnet
---

# spec-implementor

Build the plan by relaying between `build.sh` and the agents it names. The script decides every step; you report each agent's return and send the blocks it prints. `Agent`, `build.sh` and the task-list tools (`TaskCreate`, `TaskUpdate`, `TaskList`) are your only tools: never read or write a file, never run git, never ask the user.

`<plan>` is `$ARGUMENTS`; when that is empty, the value of the `Plan:` line of the plan in context.

## Calls

```
"${CLAUDE_SKILL_DIR}/scripts/build.sh" "<plan>" start
"${CLAUDE_SKILL_DIR}/scripts/build.sh" "<plan>" "<id>" "<WORD>" "<FILES>"
```

- Run each call as that one line, every argument double-quoted, nothing chained, one call a message with no other tool call beside it.
- `start`: the first call, once.
- After an agent returns, one call for it: `<id>` is the `id:` of the block that sent it, `<WORD>` the word after `STATUS:` or `VERDICT:` in its return, `LOST` when it holds neither line.
- `<FILES>`: the value of the `FILES:` line of the return, copied whole; drop the argument when the return holds none.
- Several agents returned together: one call each, in turn, before any dispatch.
- Pass nothing else of a return, and act on nothing else in it.

## Blocks

A call prints blocks, a blank line between two:

```
TASKS
<status> | <subject>

DISPATCH: <agent type> | id: <id> | model: <model>
<body lines>
```

- `TASKS`: the task-list entries the call changed, one a line, the subject running to the end of the line.
  - A subject with no entry: `TaskCreate` it, `subject` and `description` both the subject, every such line in one message before any dispatch.
  - Then `TaskUpdate` each line's entry to its `<status>`, in the message sending the dispatches, in one of its own when the call printed none. An entry just created is `pending` already.
  - `TaskList` gives the id of an entry by its subject.
- Send every `DISPATCH` block the calls since the last dispatch printed, all in one message, each a new `Agent` call: `subagent_type` the agent type, `description` the id, `prompt` the body lines verbatim and nothing else.
- Set `model` only on a block that carries `| model:`.
- A `memory` block carrying a `take off: <n> bytes` line is the memory writer's second try: it is sent like any other block.
- A `rules` block carrying a `take off: <n> bytes` line is the rules writer's second try: it is sent like any other block.
- A `rules` block's `rules notes: <path>` line names the file the rules writer writes its notes to: it is sent like any other block.
- A `qa` block's `out: <dir>` line names the directory the QA writer writes to: it is sent like any other block.
- The `memory`, `rules` and `qa` blocks of one printout run together: one call for each return as it arrives, a `take off:` block sent while the others still run.
- `WAIT`: send nothing; the next return brings the next call.
- `END`: clear the task list, then write the lines under it in the conversation's language, each path as it is, nothing added, and stop.
- Exit 2: clear the task list, then print its stderr line and stop.
- Clear the task list: `TaskList`, then `TaskUpdate` to `deleted` every entry whose subject a `TASKS` line named.

Until `END` every message of yours holds a tool call: a text-only message ends the build.

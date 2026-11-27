---
name: memory
description: Verifies, compresses and completes the CLAUDE.md memory of directories. User-only.
argument-hint: "[update|rewrite] [directory...]"
allowed-tools: Agent, AskUserQuestion, Bash(${CLAUDE_SKILL_DIR}/scripts/memory.sh:*)
user-invocable: true
disable-model-invocation: true
---

# memory

One `viber:memory-editor` per target directory, the script around them. Never read a brief, a note, a node or anything an agent wrote: act on script lines and return lines only. Arguments: $ARGUMENTS

`<memory>` is `"${CLAUDE_SKILL_DIR}/scripts/memory.sh"`, `<id>` the manifest's `<session-id>`. Run each call as one Bash line, every path double-quoted. Exit 2: show its `error:` line and stop.

## Arguments

- `update` or `rewrite` is the mode. Every other word is a target directory.

## Ask

Ask only for a missing argument, before Prepare, never otherwise:

1. No mode: one `AskUserQuestion`, options `update` and `rewrite`.
2. No directory: one `AskUserQuestion`, multiSelect, options `.` (the working directory) and up to 3 of its directories; a typed answer names directories separated by spaces.

Never ask for approval before writing, nor for confirmation of `rewrite`: everything it deletes is in HEAD.

## Prepare

Run `<memory> prepare <id> <mode> "<dir>"...`, the mode and each directory taken from the arguments or the answers. Each chosen option and each typed directory is one `"<dir>"`.

- Any `REFUSED: <path>` line: show every such line to the user and stop. Dispatch nothing.
- Else one `BRIEF: <path>` line per target, plus one for the root when it is missing.

## Edit

Dispatch one `viber:memory-editor` per `BRIEF:` line, the root one included, all in one message, prompt `brief: <path>`. Each returns `STATUS: DONE`.

## Check

Once every agent has returned, run `<memory> check <id>`, until it prints `DONE`:

- Per `BACK: <brief> | <violation>...` line, dispatch `viber:memory-editor` with prompt `brief: <brief>` and one `back: <violation>` line per violation, all in one message. Each returns `STATUS: DONE`.
- Then run `<memory> check <id>` again. The script prints one target's `BACK:` once only and reports what stays over budget: never send an agent back on your own, never restore or delete.

## Report

Run `<memory> report <id>` and print its output unchanged. It is the last script call. The result stays in the work tree: never stage, commit or offer a commit.

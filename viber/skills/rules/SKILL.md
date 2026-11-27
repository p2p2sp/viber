---
name: rules
description: Verifies, compresses and completes the project rules in .claude/rules/viber/, or rewrites them from the code. User-only.
argument-hint: "[update|rewrite] [directory...]"
allowed-tools: Agent, AskUserQuestion, Bash(${CLAUDE_SKILL_DIR}/scripts/rules.sh:*)
user-invocable: true
disable-model-invocation: true
---

# rules

One `viber:rules-editor` per target directory, the script around them. Never read a brief, a note, a rule file or anything an agent wrote: act on script lines and return lines only. Arguments: $ARGUMENTS

`<rules>` is `"${CLAUDE_SKILL_DIR}/scripts/rules.sh"`, `<id>` the manifest's `<session-id>`. Run each call as one Bash line, every path double-quoted. Exit 2: show its `error:` line and stop.

## Arguments

- `update` or `rewrite` is the mode. `update` verifies, compresses and completes the rules of each target; `rewrite` deletes the rules assigned to each target and writes them from zero.
- Every other word is a target directory. None: the repository root.

## Ask

Never ask anything but these two: no approval before writing, no confirmation of `rewrite`, since everything deleted is in HEAD.

1. Run `<rules> list`. Each `OWN: <path>` line is a user rule outside `viber/`.
2. No mode in the arguments: one `AskUserQuestion`, options `update` and `rewrite`.
3. One `AskUserQuestion` call holding the questions that apply, skipped when none does:
   - No directory in the arguments: the targets, multiSelect, options `.` (the working directory) and up to 3 of its directories; a typed answer names directories separated by spaces.
   - Any `OWN:` line, even with full arguments: the files to adopt, multiSelect, options `None` and one per `OWN:` path while they fit in 4, else `None`, `All` and a typed subset. An adopted file moves into `viber/` and is verified and edited; any other is only read to avoid a duplicate.

## Prepare

Run `<rules> prepare <id> <mode> "<dir>"...`, followed by `--adopt "<file>"...` only when files were picked.

- `REFUSED:` lines (exit 3): show them and stop.
- One `BRIEF: <path>` line per target.

## Edit

Dispatch one `viber:rules-editor` per `BRIEF:` line, all in one message, prompt `brief: <path>`. Each returns `STATUS: DONE`.

## Check

Run `<rules> check <id>`, until it prints `DONE`:

- Per `BACK: <brief> | <violation> | ...` line, dispatch that brief's editor again, all in one message, prompt `brief: <brief>` and one `back: <violation>` line per violation.
- Then run `<rules> check <id>` again. The script prints one target's `BACK:` once only: never send an editor back on your own.

## Report

Run `<rules> report <id>` and print its output unchanged. The result stays in the work tree: never stage, commit or offer a commit.

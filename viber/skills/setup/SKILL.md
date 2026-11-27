---
name: setup
description: Prepares a project for viber - seeds .claude/viber.yml and .gitignore, merges the recommended permissions into .claude/settings.json, checks the gh CLI and the commands CLAUDE.md names. User-only.
allowed-tools: Read, AskUserQuestion, Bash(${CLAUDE_SKILL_DIR}/scripts/bootstrap.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/skills/setup/scripts/merge-settings.sh:*)
user-invocable: true
disable-model-invocation: true
model: haiku
context: fork
background: true
---

# setup

```!
"${CLAUDE_SKILL_DIR}/scripts/bootstrap.sh"
```

The lines above are the result. They are idempotent and self-verifying: report them as they stand, never re-check them.

## Settings

- `ASK:` line - ask with one `AskUserQuestion` (a prose question ends the turn and the script's pre-approval with it) which of its two `<name> -> <command>` options to run:
  - merge - fill in what is missing: the template's value wins a conflict, lists only gain entries, a template entry in `permissions.ask` leaves the host's `permissions.deny`, a key the template lacks is never touched.
  - reset - replace the file with the template; the old one is kept in `.temp/viber/setup/`.
- `RUN:` line - run its command.
- Neither - the file matches the template: the preload's `settings.json:` line is the settings line.

Run the command once, as printed. Its output line is the settings line: carry it into the close literally, never re-verify or retry it, a non-zero exit included.

## CLAUDE.md

Never edit `CLAUDE.md`. Act on the preload's `CLAUDE.md:` line:

- `CLAUDE.md: present - <path>` - read that file with `Read`, fresh, never from session context. Three items count, each named only when the file contains its literal command: the build, the whole test suite, a single test file.
  - All three named - the line is `CLAUDE.md: names the build, test and single-test-file commands`.
  - Any item not named - the line is `CLAUDE.md: missing <the missing items> - paste this prompt:`, followed by the content of `${CLAUDE_SKILL_DIR}/templates/claude-md-prompt.txt`, read with `Read`, verbatim in a code block.
- `CLAUDE.md: missing` - read no `CLAUDE.md`; the line is `CLAUDE.md: missing - run /viber:memory, which writes it`, with no prompt block.

## Close

One line per item, nothing else: the preload's lines except its `settings.json:`, `CLAUDE.md:`, `ASK:` and `RUN:` ones, the settings line, the `CLAUDE.md:` line with its prompt block when it has one.

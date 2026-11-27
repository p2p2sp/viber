---
name: extension
description: Creates a project agent that a viber build runs at its close and registers it in build.extensions of .claude/viber.yml. User-only.
argument-hint: "[agent name]"
allowed-tools: Read, Write(./.claude/agents/**), Bash(${CLAUDE_SKILL_DIR}/scripts/extension.sh:*)
user-invocable: true
disable-model-invocation: true
model: sonnet
---

# extension

One agent file in `.claude/agents/`, one entry in `build.extensions`. Arguments: $ARGUMENTS

```!
"${CLAUDE_SKILL_DIR}/scripts/extension.sh"
```

The lines above are trusted: never open `.claude/viber.yml` or list `.claude/agents/` yourself.

- `CONFIG=no-file` -> name `/viber:setup` and stop.
- `CONFIG=no-key` -> say `.claude/viber.yml` needs an empty `extensions:` key under `build:` and stop.

`<name>` is the argument: lowercase letters, digits and hyphens, the first one a letter or a digit.

## Write

Never write over an agent `AGENTS=` lists: with such a `<name>`, go to Register.

Ask in one prose message, then end the turn:

- the name, when the argument gave none
- what the agent produces
- the repository-relative paths it writes
- the language of those files
- what it reads beyond the spec and the files the build changed

Read `${CLAUDE_SKILL_DIR}/templates/agent.md` and `Write` it to `.claude/agents/<name>.md`, each `{{...}}` replaced from the answers: concrete paths, no angle bracket in `description:`. Keep every other line as it stands and write no other file.

## Register

```
"${CLAUDE_SKILL_DIR}/scripts/extension.sh" add "<name>"
```

- `STATUS=added` -> the agent runs as a step of its own; `parallel: true` under its entry runs it together with the parallel entries next to it.
- `STATUS=present` -> it was registered already.
- Any other `STATUS=` -> show the line and stop.

End on the paths left uncommitted in the work tree and on one line: a new agent file loads at session start, so reload the session before a build.

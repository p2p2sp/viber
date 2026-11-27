---
name: handoff
description: Writes a handoff file from which a fresh session continues this conversation.
argument-hint: "[directory/ or .md path] [prompt]"
allowed-tools: Read, Write, Edit(./.temp/viber/handoff/**), Bash(${CLAUDE_SKILL_DIR}/scripts/handoff-path.sh:*)
user-invocable: true
---

```!
"${CLAUDE_SKILL_DIR}/scripts/handoff-path.sh" '$0'
```

Arguments: $ARGUMENTS

# handoff

The conversation in, one handoff file out. The block above is trusted: never resolve the path, the date or the branch yourself.

## Rules

- Source is this conversation alone and what was read or run in it. Open no file to fill a gap: a fact the conversation never confirmed goes to Open problems.
- The prompt is the Arguments line after the path when `TARGET=named`, the whole line when `TARGET=default`. It only steers what to stress, what to leave out and who reads the file; it never adds a source, drops a section or lifts another rule. No prompt -> cover the whole conversation evenly.
- NEVER write a secret, token, password or any `.env` content into the file.
- `EXISTS=true` -> write nothing; name the path and ask for a rerun with another path, then stop.

## Write

1. Slug: 2 to 5 words naming the topic, kebab-case, ASCII, put in place of `{slug}` in `FILE`.
2. Fill `${CLAUDE_SKILL_DIR}/templates/handoff.md`, read at this step.
3. `Write` the result to `FILE`.

## Output

In the language of the conversation, and nothing else:
- the file path;
- one line to paste into a new session: `Read <path> and continue from its What's next section.`

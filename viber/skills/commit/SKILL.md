---
name: commit
description: Commit changes to git, whenever the user asks to commit or save them. The only path to a commit - never run git add or git commit yourself, never inspect git status or diff first. Arguments, all optional - none commits every change (modified, new, deleted); space-separated paths (files or directories) commit only those; an issue reference the user gave (`#123` or a GitHub issue link) becomes the `Resolves` footer. Arguments never carry an apostrophe (').
model: haiku
effort: medium
context: fork
background: false
allowed-tools: Bash, Bash(${CLAUDE_SKILL_DIR}/scripts/commit-context.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/commit.sh:*)
---

# commit

Compose one commit message from the context below by the message rules below, in the type/scope style of its recent subjects, and commit it.

- Context opens with `STOP:`: run nothing, return that sentence.
- Context opens with `RUN:`: run that command exactly once, `<message>` replaced by your message (footer included), the rest copied as printed. A reply with no tool call commits nothing.
- Never judge that there is nothing to commit, never re-inspect the tree, never question the selection.
- Run no other command: no `git`, no push, no second `commit.sh` (a different or empty selector widens the commit to everything staged).
- Never add `Co-Authored-By` or any other Claude attribution.

## Message rules
!`cat "${CLAUDE_SKILL_DIR}/references/commit-conventions.md" 2>&1`

## Context
```!
"${CLAUDE_SKILL_DIR}/scripts/commit-context.sh" '$ARGUMENTS'
```

## Output
Return exactly one line, no other text:
- `commit.sh` exited 0: the line it printed.
- `commit.sh` exited non-zero: its error output.
- `STOP:` context: that sentence.

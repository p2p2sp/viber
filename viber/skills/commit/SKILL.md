---
name: commit
description: Use whenever the user wants to commit, save, or record changes to git - including "commit", "commit changes", "commit all", "commit these files". This is the ONLY path to a commit: never run git add/commit yourself, never branch, never inspect git status/diff first - a forked agent stages, writes the Conventional Commits message, commits and verifies. Arguments, all optional - no arguments commits every change (modified, new and deleted files); one or more space-separated paths (files or directories) commit only those. Append any issue reference the user mentioned (`#123` or a GitHub issue link) - it becomes the commit's `Refs:` footer. Arguments never carry an apostrophe (').
model: haiku
effort: medium
context: fork
background: false
allowed-tools: Bash, Bash(${CLAUDE_PLUGIN_ROOT}/skills/commit/scripts/commit-context.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/skills/commit/scripts/commit.sh:*)
---

## Commit the selected changes

Compose a commit message per the Conventional Commits rules below from the commit context below, matching the type/scope style of the recent commit subjects, then commit it.

- The context opens with a `RUN:` or a `STOP:` line. On `STOP:` run nothing and return that sentence.
- On `RUN:` run that command exactly once, with `<message>` replaced by your message (its footer included, as the rules below say) and the rest copied as printed, whatever the context shows: a reply with no tool call commits nothing. Never decide on your own that there is nothing to commit, never re-inspect the tree, never question the selection.
- Run only that command: no `git`, no push, no second `commit.sh` with a different or empty selector (that widens the commit to everything staged).
- Never add a `Co-Authored-By` line or any other Claude or Claude Code attribution.

## Conventional Commits rules
!`cat "${CLAUDE_PLUGIN_ROOT}/skills/commit/references/commit-conventions.md" 2>&1`

## Commit context (directive + recent style + changes + diff)
```!
"${CLAUDE_PLUGIN_ROOT}/skills/commit/scripts/commit-context.sh" '$ARGUMENTS'
```

## Output
Return exactly one line and no other text:
- the line `commit.sh` printed
- `commit.sh` exited non-zero: its error output
- `STOP:` context: that sentence

---
name: issue-create
description: Creates a GitHub issue from the project's issue form templates. Use when the user asks to open an issue, not to fix a bug.
argument-hint: "[what the issue is about]"
allowed-tools: Read, Edit(./.temp/viber/issue-create/**), Bash(${CLAUDE_SKILL_DIR}/scripts/issue-templates.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/issue-create.sh:*), Bash(date:*), Skill(viber:attach *)
model: sonnet
---

# issue-create

One issue filed from the project's own issue form templates, or with no template when the project has none. The block below is trusted: never list the templates or resolve the repository yourself.

```!
"${CLAUDE_SKILL_DIR}/scripts/issue-templates.sh"
```

- `STATUS=skip` -> say its `SAY=` line in one line in the conversation's language, then stop.
- `STATUS=ready` -> save the issue per `${CLAUDE_SKILL_DIR}/references/issue-save.md`, read at this step, with `content:` the argument `$ARGUMENTS` and what this conversation says about the issue. An argument that names a template or its kind picks it. No argument and nothing in the conversation to file -> ask in prose what the issue is about, then end the turn.

You run no test, change no code and open no pull request: the issue and its attachments are the only output. End on its `ISSUE_URL=`, followed by the `viber:attach` return when it has attachments, or on the reason there is no issue.

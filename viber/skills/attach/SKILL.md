---
name: attach
description: Attaches files or links the user names to a GitHub Issue as issue artifacts. Use when the user asks to attach, upload or add a file to an issue. Arguments - the issue (number or issue URL), then each file path (double-quoted) or link: the skill sees no conversation.
argument-hint: "<issue number or URL> <file or link>..."
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/artifact-create.sh:*)
model: sonnet
effort: low
context: fork
background: false
---

## Attach files to an issue

Arguments: the issue (`<N>`, `#<N>` or an issue URL), then one or more files or http(s) links.

Run this once, with the issue and the files as the arguments give them (quote each path), and never run it again, whatever it prints:

```
"${CLAUDE_SKILL_DIR}/scripts/artifact-create.sh" <issue> <files>
```

## Report

Read stdout block by block, in order:
- `CREATED=<link>`: report the link, with the `REASON=` line that follows it when there is one.
- `REFUSED=<file>`: name the file with the reason "file type not supported" and tell the user to attach it in the browser on the issue.
- `FAILED=<file>`: name the file with the `REASON=` line that follows it and tell the user to attach it in the browser on the issue.

On exit 3: attach nothing, name `gh` 2.103 as the version that brings `gh issue artifact`, and for every file tell the user to attach it in the browser on the issue.

On exit 2, or exit 1 with empty stdout: report the `ERROR` line from stderr as printed.

Add nothing else.

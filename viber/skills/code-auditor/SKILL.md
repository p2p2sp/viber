---
name: code-auditor
description: Audits one path through one or more lenses (bugs, security, web-performance, runtime-performance, tests, design). User-only.
argument-hint: "<lens>... | all <path>"
allowed-tools: Agent, Bash(${CLAUDE_SKILL_DIR}/scripts/audit-report.sh:*)
user-invocable: true
disable-model-invocation: true
---

# code-auditor

One path in, one report out, one `viber:lens-auditor` per lens. Never read a project file, a lens file or a part file yourself. Arguments: $ARGUMENTS

## Arguments

- Lenses: `bugs`, `security`, `web-performance`, `runtime-performance`, `tests`, `design`. `all` is all six.
- A word that is a lens name or `all` is a lens; `./<name>` is the path of that name. The one other word is the path.
- No lens, no path or more than one path -> print `Usage: /viber:code-auditor <lens>... | all <path>` with the lens names, then stop.

## Dispatch

One `viber:lens-auditor` per lens, all in one message. Each prompt is these lines, `<session-id>` the manifest's:

- `lens: ${CLAUDE_SKILL_DIR}/references/<lens>.md`
- `path: <path>`
- `part: .temp/viber/<session-id>/code-auditor/<lens>.md`

It returns `STATUS: DONE | BLOCKED`, `FINDINGS: <n>` and, for `BLOCKED`, `REASON:`.

## Report

Once every agent returned, with at least one `DONE`, run as one literal Bash line, every argument double-quoted:

`"${CLAUDE_SKILL_DIR}/scripts/audit-report.sh" ".temp/viber/<session-id>/code-auditor" "<path>" "<DONE lens>"...`

Tell the user the `REPORT=` path, `FINDINGS:` per lens and every `BLOCKED` reason, from the returns alone.

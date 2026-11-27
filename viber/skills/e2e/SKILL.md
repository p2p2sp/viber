---
name: e2e
description: Turns the QA scenarios of one build, its qa.e2e.md, into Playwright tests proven green against the running application. User-only.
argument-hint: "[run directory or qa.e2e.md]"
allowed-tools: Agent, AskUserQuestion, Bash(${CLAUDE_SKILL_DIR}/scripts/e2e.sh:*)
user-invocable: true
disable-model-invocation: true
---

# e2e

One `viber:e2e-writer` per scenario, one at a time, the script around them. Never open the application, the handoff, a brief, a spec file or a log: act on script lines and return lines only.

```!
"${CLAUDE_SKILL_DIR}/scripts/e2e.sh" find '$ARGUMENTS'
```

`<e2e>` is `"${CLAUDE_SKILL_DIR}/scripts/e2e.sh"`, `<id>` the manifest's `<session-id>`. Run each call as one Bash line, every argument double-quoted. Exit 2: show its `error:` line and stop.

## Stop

- `HANDOFF=none` -> say no `qa.e2e.md` was found and stop.
- `PENDING=0` -> say every scenario has its test and stop.
- Any `MISSING=<tool>: <install command>` line -> show each and stop. Install nothing.

## Values

- The test directory: the project instructions, else `SPEC_DIR=`.
- The base URL: the project instructions, else `BASE=`.
- The test accounts and where their credentials live: the project instructions, else `ACCOUNTS=`.

Ask for every value still `unknown` in one prose message, then end the turn. Take an answer verbatim: never fill a gap yourself.

## Run

Run `<e2e> start <id> "<HANDOFF=>" "<test directory>" "<base URL>" "<accounts>"`. Act on the first line of this and of every later call:

- `DOWN: <log>` -> the launch command is the project instructions', else `LAUNCH=`, else asked for in prose. Run it as one background Bash call, its output redirected to `<log>`, then `<e2e> wait <id> "120"` with a Bash timeout of 600000.
- `SILENT: <seconds>` -> one `AskUserQuestion` quoting the `log:` lines: wait or abort. Wait -> `<e2e> wait <id> "<seconds>"`, the same timeout. Abort -> stop.
- `DISPATCH: <QA> | brief: <path>` -> one `viber:e2e-writer`, prompt `brief: <path>`. It returns `VERDICT: PASS | BLOCKED | FAIL`. Run `<e2e> next <id> "<QA>" "<WORD>"`, with `FAIL` for a return holding no such line.
- `END` -> print the lines below it unchanged, in a code block.

- Never dispatch two writers at once, never send one back on your own: the script repeats a `DISPATCH:`.
- Never edit the launch command, the project's config or its ports to get an answer.
- The tests and the handoff stay uncommitted in the work tree, the application running: never stage, commit or stop it.

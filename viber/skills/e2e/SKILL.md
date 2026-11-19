---
name: e2e
description: Generates and locally verifies Playwright tests for the QA scenarios of one viber run, then commits them. Use it after a build closed with a qa.e2e.md handoff file in its run directory.
argument-hint: "[run directory, or a path to qa.e2e.md]"
allowed-tools: Read, Grep, Glob, Bash, Agent, SendMessage, AskUserQuestion, TaskCreate, TaskUpdate, Bash(${CLAUDE_PLUGIN_ROOT}/scripts/check-playwright.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/plan-path.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/config.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/app-wait.sh:*), Bash(${CLAUDE_SKILL_DIR}/scripts/qa-ledger.sh:*)
user-invocable: true
disable-model-invocation: true
---

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/config.sh"
```

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/check-playwright.sh"
```

# e2e

One run's handoff file, one pass. Every scenario of its `qa.e2e.md` becomes one `@playwright/test` file, written by `viber:e2e-writer` against the application you launched, proven green there, and committed. You resolve, launch, dispatch and commit: you write nothing into the tree yourself.

Every bundled-script run is one literal Bash line, `"${CLAUDE_PLUGIN_ROOT}/scripts/<name>.sh" <args>` or `"${CLAUDE_SKILL_DIR}/scripts/<name>.sh" <args>`, every argument double-quoted: never prefixed with an interpreter word, never assigned to a variable, never preceded by `cd`, never chained with `;`.

## 1. Resolve the run

The argument names either the run directory or the `qa.e2e.md` inside it; `<dir>` is that directory either way.

With no argument, `"${CLAUDE_PLUGIN_ROOT}/scripts/plan-path.sh"` returns the plan most recently worked on and `<dir>` is its directory. Two of its answers send you to the fallback instead: exit 3 (no open run at all) and a run it resolved that holds no `qa.e2e.md`. Then list both `docs/<runs>/*/qa.e2e.md` and `docs/<specs>/*/qa.e2e.md` with `Glob`, or with `find` through `Bash` where this build has no `Glob`, `<runs>` and `<specs>` being the `directories.runs` and `directories.specifications` values on the config block above, and take the newest by directory name across both. `<dir>` is that file's own directory.

No `<dir>/qa.e2e.md`, and the fallback found none either -> stop with one line naming the directory and saying it carries no handoff file.

## 2. Preflight

The playwright block's two lines above are the state of this host: trust them, never re-probe either. Both reading `found` -> go on.

A `not found` -> one `AskUserQuestion` naming what is missing: install it now, or abort. Abort stops the run with nothing generated. On install, one Bash call each, an explicit generous timeout on every one of them, the package names exactly as written here and never re-derived from a binary name:

- `playwright-cli` -> `npm install -g @playwright/cli@latest`
- `@playwright/test` -> `npm i -D @playwright/test`, then `npx playwright install chromium`

Installing `@playwright/test` changes this project's `package.json` and its lockfile. Say so in one line before the loop starts: those two files are the user's to commit or to stash, never this command's.

## 3. Resolve the host values

Four values, each taken from the project's own instructions first, then from the handoff's header lines (`Base:`, `Launch:`, `Accounts:`), a line reading `unknown` being silence too:

- the e2e test directory, which the handoff does not carry at all
- the base URL
- the command that starts the application
- the test accounts and where their credentials live

Each value still missing -> one `AskUserQuestion` naming it: provide it now, or abort. Take the answer verbatim. Never fill a gap yourself, never carry one over from another project, and never continue past an abort.

## 4. Start the application

Run `"${CLAUDE_SKILL_DIR}/scripts/app-wait.sh" "<base-url>" "0"`. Act on its first line:

- `NEXT: test` -> the application is already up; run no command and go to step 5.
- `NEXT: launch` -> run the launch command as one background Bash call with its output redirected to the printed log path, then run `"${CLAUDE_SKILL_DIR}/scripts/app-wait.sh" "<base-url>" "120"` with a Bash timeout of 600000 milliseconds. Its `NEXT: test` moves you on to step 5.
- `ASK:` -> `AskUserQuestion` quoting its `log:` lines: wait or abort. Abort stops the run; wait runs the script again with the `wait ->` value as the seconds, the same timeout and the command left running.

This project's launch command, its config and its ports are never edited to make the probe answer.

## 5. Generate the tests

Run `"${CLAUDE_SKILL_DIR}/scripts/qa-ledger.sh" "<dir>/qa.e2e.md" "list"`. `TaskCreate` one task per `id:` line, the `file` ones completed at creation. Then one scenario at a time, never two at once:

1. Run `"${CLAUDE_SKILL_DIR}/scripts/qa-ledger.sh" "<dir>/qa.e2e.md" "next" "--spec-dir" "<the e2e test directory>" "--base-url" "<the base URL>" "--accounts" "<the test accounts and where their credentials live>"`, adding `"--after" "QA-<nn>"` for the scenario just handled. `NEXT: commit` -> go to step 6. Otherwise `TaskUpdate` -> in progress.
2. `Agent` with `subagent_type: viber:e2e-writer`, the lines below `NEXT: dispatch` as printed and nothing else. Pass no `model:` - the writer's own frontmatter is its strength.
3. `VERDICT: PASS` plus `FILE:` -> keep that path for step 6. `TaskUpdate` -> completed.
4. `VERDICT: BLOCKED` plus `REASON:` -> the application, not the test, prevented a green run. The writer already deleted its file and wrote that ID's `blocked` line. Re-dispatch nothing, and change nothing in the application. `TaskUpdate` -> completed.
5. `VERDICT: FAIL` plus `REASON:` -> dispatch once more with the same block. A second FAIL -> `AskUserQuestion` naming the scenario: retry again, skip it (keep the reason for step 7; it wrote no status line, so the ID stays pending for a later pass), or abort (go to step 6 with the IDs already processed).
6. `VERDICT: DENIED` plus `REASON:` -> `AskUserQuestion` naming the scenario and the refused call from its `REASON:` line: permission added and retry, skip it (keep the reason for step 7; the ID stays pending), or abort (go to step 6 with the IDs already processed).

The writer's completion notice saying it "stopped with background work of its own still running": hold its verdict and `SendMessage` it, once: `Stop every process you started that is still running, then return your output lines again.` Act on what it returns then. The same notice again -> act on the verdict as returned.

The writer returning no `VERDICT:` line -> treat it as this scenario's second `FAIL`: go straight to the `AskUserQuestion` of point 5, naming the scenario, with `REASON: no verdict returned`.

Never open the application, write a spec file, edit one the writer produced, or read a red run yourself.

## 6. Commit

No `FILE:` was kept in step 5 and no `BLOCKED` was returned there -> skip to step 7, nothing new is in the tree. Otherwise one call, the handoff plus one path per `FILE:` line kept in step 5, and nothing else ever:

```
"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" --e2e "<dir>/qa.e2e.md" "<spec>" ...
```

It derives its own subject and stages only what it is given. A non-zero exit means nothing was committed -> `AskUserQuestion`: retry, or leave the files uncommitted and report that in step 7. Never stage anything yourself, never `git add`, never `git commit`.

## 7. Report

Run `"${CLAUDE_SKILL_DIR}/scripts/qa-ledger.sh" "<dir>/qa.e2e.md" "report"`. At most five sentences - the handoff, the commit, how many IDs this pass skipped as already automated, how many are still pending - then its table as printed, in a code block:

```
+---------+---------+---------------------------+
| ID      | State   | Detail                    |
+---------+---------+---------------------------+
| QA-<nn> | file    | <repo-relative spec path> |
+---------+---------+---------------------------+
counts: <f> file, <b> blocked, <p> pending
```

Then one `skipped - <reason>` line per scenario the user skipped this pass.

The application you launched is left running - stopping it is the user's call.

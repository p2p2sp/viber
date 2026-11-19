---
source: /Users/dario/Projects/viber/docs/_specs/2026-11-19-12-07-08_scripted-steps-of-git-github-setup-factory-and-the-hooks/plan.md
planned: /Users/dario/.claude-p2p2/plans/peaceful-whistling-nebula.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Scripted steps of git, GitHub, setup, factory and the hooks

## Goal

The mechanical steps that factory, commit, pr-feedback-reply, pr-create, the issue save, setup and idea-validator still apply from prose, and the two hook replies that leave the agent guessing, move into scripts that answer in directive lines or ready values. Each skill then reads fewer words, and a wrong key press, footer, title, confirmation or prompt stops depending on the model.

## Problem

Each of these steps is prose the model re-reads and applies by hand on every run: factory counts arrow presses from a screen and checks it by eye, the commit fork composes the footer from a branch regex and runs a second script to check the commit landed, pr-feedback-reply reads `review.md` and globs every reply file before posting them one call at a time, pr-create fills the title pattern, the footer and the body path itself, the issue save turns template values into flags, setup maps each `settings.json:` line to a command, and idea-validator pastes the same briefs and member files into seventeen prompts. The verdict nudge accepts any `VERDICT:` line, so an agent ending on a value its caller does not know passes, and the shell guard names the rule but not the command to run instead. Every read costs the user's Claude Code usage limits, and every hand-applied step is a chance to get it wrong.

## Current behaviour

`factory.sh` passes `list`, `screen`, `pending`, `keys`, `type`, `send`, `enroll` and `watch` to `factory.ps1`; the model works out every key sequence from `dialogs.md` and confirms each step on the printed screen. `verdict-nudge.sh` blocks a `viber:` agent once when its last message holds no `VERDICT:` or `AUDIT:` line, whatever value follows. `shell-guard.sh` denies five command forms with a fixed reason per rule. The commit fork runs `commit.sh`, then `commit-selfcheck.sh` with a preloaded `Before SHA`, and writes the result line itself; `commit-context.sh` prints a `## Selector:` line and an explicit `Refs:` footer only when the arguments name an issue, the branch-derived footer being the model's. `pr-reply.sh` posts one reply per call and its skip prints `REASON=exists` only. `pr-facts.sh` prints the raw facts and `TITLE_PATTERN=`; `pr-create` builds the title, footer and body path with `date`. `issue-create.sh` takes every template value as a flag the issue save assembles. `bootstrap.sh` prints result lines and `setup/SKILL.md` maps them to the merge, reset and page commands. `build_report.mjs` only renders the report.

### Must not change

- `factory.sh` `list`, `screen`, `pending`, `keys`, `type`, `send`, `enroll` and `watch`: their arguments, output and exit codes; only the bare call's usage line also names `answer`, `approve` and `reject`.
- `verdict-nudge.sh`: the exempt `viber:scout`, `viber:mapper` and `viber:hunter`, every `agent_type` outside `viber:` ignored, one nudge per stop (`stop_hook_active`), an `AUDIT:` line accepted, always exit 0.
- `shell-guard.sh`: which commands each rule R1 to R5 denies, their order, the guarded agents, the deny JSON shape and each rule's reason text as its opening sentence; the R2 and R5 reasons exactly as today.
- `commit.sh`: its arguments, its staging of each mode and its exit codes; every `commit-context.sh` section other than its first line, the issue footer and the branch section heading.
- `pr-reply.sh` with three arguments: what it posts, the marker, the kept body file, the `STATUS=posted` block and its exit codes.
- `pr-facts.sh`: every key it prints today, in today's order, and its exit codes.
- `issue-create.sh` without `--template`: its flags, output and exit codes.
- `bootstrap.sh`: what it writes, every line it prints today and its exit 0.
- `build_report.mjs <report-data.json> <output.html>`: validation, rendering, output lines and exit codes, and exit 2 with no argument.
- `qa-comment.sh` and `issue-templates.sh` output.

## Roadmap

Part 7 of 7 - Git, GitHub and the rest

1. Directive convention and the implementor task loop (built)
2. Implementor close (built)
3. Code auditor (built)
4. Memory and rules (built)
5. Planner validation and review (built)
6. Intent, fixer, e2e and the rest (built)
7. Git, GitHub and the rest (this plan)

## Behaviour

### S1 - Answering a dialog in another session [CHANGED - was: the model counted arrow presses and checked the screen by eye]

Given an enrolled session waiting on a one-question AskUserQuestion whose cursor sits on option 1
When the factory runs `factory.sh answer <pid> "Paris"` for option 3
Then the script sends `DOWN,DOWN`, sees the cursor on `Paris`, sends `ENTER` and answers `NEXT: done`; had the cursor landed elsewhere it answers `NEXT: keys | mismatch: cursor-moved` with no `ENTER` sent, and the model goes on by hand

### S2 - Approving and rejecting a plan [CHANGED - was: rows found by eye]

Given an enrolled session waiting on its plan approval
When the factory runs `factory.sh approve <pid>`, or `factory.sh reject <pid> "<feedback>"`
Then the script picks the `clear context` and `bypass permissions` row, else the first `Yes` row, or the `Tell Claude what to change` row with the feedback typed, and answers as in S1

### S3 - An agent ending on an unknown verdict [CHANGED - was: any `VERDICT:` line passed]

Given `viber:task-coder`, whose agent file names `VERDICT: PASS`, `VERDICT: FAIL` and `VERDICT: DENIED`
When it ends on `VERDICT: MAYBE`
Then the hook sends it back once with a reason listing those three lines

### S4 - A refused command with its correction [CHANGED - was: the rule only]

Given a task coder running `rm -f a.txt`
When the shell guard denies it
Then the reason ends on ``Run instead: `git rm -r -q -- a.txt`.``

### S5 - A commit [CHANGED - was: the fork ran a second script and wrote the result line]

Given a change on the branch `feature/task.42-login`
When the commit fork runs the preload's `RUN:` line with its message
Then the message carries the `Refs: #42` footer the context printed, and `commit.sh` prints `<sha> | <subject> (VERIFIED)`, which the fork returns as is

### S6 - Posting the replies of a pull request [CHANGED - was: `review.md` read and each reply file globbed and posted by the model]

Given `review.md` with three items, two with a reply file
When pr-feedback-reply runs `pr-reply.sh --list`, asks once, then runs its `RUN=` line
Then `--list` names two ready items and one missing, and `--all` posts both in section order, never retrying, ending on `MISSING_COUNT=1`

### S7 - Opening a pull request [CHANGED - was: title, footer and body path built by the model]

Given a branch tied to issue 12 with `CLOSES=yes`
When pr-create reads the preload
Then it takes `TITLE=`, `FOOTER=Closes #12` and `BODY_FILE=` as printed, running no `date`

### S8 - Saving an issue from a template [CHANGED - was: every template value turned into a flag by hand]

Given the chosen template `.github/ISSUE_TEMPLATE/bug.yml` with a type and two labels
When the issue save runs `issue-create.sh "<file>" "<title>" --template ".github/ISSUE_TEMPLATE/bug.yml"`
Then the issue gets that type and both labels

### S9 - Setup with an existing settings file [CHANGED - was: the line mapped to a command in prose]

Given a project whose `.claude/settings.json` differs from the template
When setup loads
Then the preload carries an `ASK:` with the merge and reset commands and ends on a `RUN:` for the help page, and setup's close shows neither line

### S10 - Council prompts [CHANGED - was: member files and formats pasted into seven prompts]

Given the working files 01 to 09 of an idea written in Polish
When idea-validator runs `build_report.mjs --prompts council-r1 <workdir> "Polish"`
Then seven prompt files are written and each member gets `Read <path> and follow it.`

### Edge cases

- `factory.sh answer` with a label no option holds, on several questions or on a multi-select -> `NEXT: keys | mismatch: <reason>`, no key sent.
- `factory.sh` called while `factory.ps1` fails -> its `ERROR:` line, exit 1, as for every other command.
- `verdict-nudge.sh` for an agent with no agent file or no `VERDICT:` value in it -> today's behaviour: any `VERDICT:` line passes, today's reason.
- A shell guard denial with no derivable correction (`sed -i`, `tee`, `xargs rm`, a part holding a newline, a redirect target holding `..`, a `/` or a quote) -> the reason as today.
- A user correcting the type, labels, assignees or projects in the issue preview -> the issue gets the corrected values.
- `commit-context.sh` on a branch with two issue numbers and no reference in the arguments -> `none`.
- `pr-reply.sh --list` with no `review.md` -> `STATUS=skip`, `REASON=no-review`, `SAY=`; with no reply file -> `REASON=none-ready`.
- `pr-reply.sh --all` when one post fails -> a `FAILED=` line and the next reply posted.
- `pr-facts.sh` with `ENTRY=` or `TARGET=` set -> no `ASK=`.
- `issue-create.sh --template` naming a path no template block holds -> exit 2, nothing created.
- `bootstrap.sh` with `settings.json: matches the template` -> no `ASK:` and no merge `RUN:`, only the page `RUN:`.
- `build_report.mjs --prompts` with an unknown stage -> exit 2 with the usage.

## Glossary

- Directive - a script's instruction to the model about what to do next and exactly what to send, never a value for the model to interpret.
- Mismatch - the factory's answer that the screen is not the one the requested step needs, so nothing more is sent and the model falls back to keys.
- Corrected command - the command the shell guard derives from a refused one that holds the same intent within the rule.

## Acceptance criteria

1. `factory.sh answer`, `approve` and `reject` (C1) send `ENTER` only after the screen shows the cursor on the target row and answer `NEXT: done` or `NEXT: keys | mismatch: <reason>`, proven by script tests against a stubbed `powershell.exe`, in the integration tier CI runs on Windows and macOS (Answered).
2. `factory/SKILL.md` and `dialogs.md` run `answer`, `approve` and `reject` for those dialogs and fall back to the keys of `dialogs.md` only on `NEXT: keys`; `factory/SKILL.md` ends below 789 words.
3. `verdict-nudge.sh` (C2) sends a `viber:` agent back once when its last `VERDICT:` value is none its agent file names, with a reason listing them.
4. `shell-guard.sh` (C3) ends the R1, R3 and R4 reasons on the corrected command when one is derivable.
5. `commit.sh` (C4) checks its own commit and prints the result line the commit fork returns, which names the commit's subject line where the fork wrote its whole message before; `commit-selfcheck.sh` and its test are removed.
6. `commit-context.sh` (C5) prints the `RUN:` or `STOP:` line and the ready issue footer, branch-derived included; `commit/SKILL.md` and `commit-conventions.md` act on them, holding no footer regex and no self-check; `commit/SKILL.md` ends below 397 words.
7. `pr-reply.sh` (C6) prints `SAY=` after its `REASON=exists`, lists the items with `--list` and posts every ready reply with `--all`; `pr-feedback-reply/SKILL.md` runs both under one confirmation and ends below 431 words.
8. `pr-facts.sh` (C7) prints `SAY=` after each stop `REASON=`, and `TITLE=`, `TITLE_TEMPLATE=`, `FOOTER=`, `BODY_FILE=`, `ASK=` and `RERUN=` in its ready block; `pr-create/SKILL.md` takes them as printed, states the `SAY=` of `pr-facts.sh` and `qa-comment.sh`, runs no `date` and ends below 824 words.
9. `issue-create.sh --template <path>` (C8) applies that template's type, labels, assignees and projects, and the issue save step 6 passes it instead of those flags whenever the user corrected none of them in the preview.
10. `bootstrap.sh` (C9) prints the `ASK:` or `RUN:` of the settings step and the `RUN:` of the help page; `setup/SKILL.md` acts on them and ends below 470 words.
11. `build_report.mjs --prompts` (C10) writes the research and both council rounds' prompt files; idea-validator dispatches each with its file path and its `SKILL.md` ends below 1016 words.
12. `tests/viber/skill-words.unit.test.ts` caps the words of `factory`, `commit`, `pr-create`, `setup` and `idea-validator` `SKILL.md` and lowers the `pr-feedback-reply` cap, each cap below its count before this plan.

## Scope

### File map

- modify - viber/skills/factory/scripts/factory.sh - `answer`, `approve`, `reject`, a portable argument encoding, its header and `Contract:` block
- add - tests/viber/factory.test.ts - the three modes against a stubbed `powershell.exe`
- modify - viber/skills/factory/SKILL.md, viber/skills/factory/references/dialogs.md - run the three modes, keys only on `NEXT: keys`
- modify - viber/hooks/scripts/verdict-nudge.sh - the agent file's verdict values and the reason naming them
- modify - viber/hooks/hooks.json - the `SubagentStop` sentence of its description names the unknown-value nudge
- modify - tests/viber/verdict-nudge.test.ts - the value cases on fixture agent files
- modify - viber/hooks/scripts/shell-guard.sh - the corrected command of R1, R3 and R4
- modify - tests/viber/shell-guard.test.ts - the corrected reasons
- modify - viber/skills/commit/scripts/commit.sh - the self-check and the result line
- delete - viber/skills/commit/scripts/commit-selfcheck.sh, tests/viber/commit-selfcheck.test.ts - replaced by `commit.sh`
- modify - tests/viber/commit.test.ts - the result line cases
- modify - viber/skills/commit/scripts/commit-context.sh - the `RUN:`/`STOP:` line and the issue footer
- modify - tests/viber/commit-context.test.ts - the first line, the footer and the preload case
- modify - viber/skills/commit/SKILL.md, viber/skills/commit/references/commit-conventions.md - act on the directive and the footer
- modify - viber/scripts/pr-reply.sh - `SAY=`, `--list`, `--all`
- modify - tests/viber/pr-reply.test.ts - their cases
- modify - viber/skills/pr-feedback-reply/SKILL.md - steps 2 and 3 run `--list` and `--all`
- modify - viber/scripts/pr-facts.sh - `SAY=` and the six ready keys
- modify - tests/viber/pr-facts.test.ts - their cases
- modify - viber/skills/pr-create/SKILL.md - takes the keys, states `SAY=`
- modify - viber/scripts/issue-create.sh - `--template`
- modify - tests/viber/issue-create.test.ts - its cases
- modify - viber/references/issue-save.md - step 6 passes `--template`
- modify - viber/skills/setup/scripts/bootstrap.sh - the settings and page directives
- modify - tests/viber/bootstrap.test.ts - the directive lines
- modify - viber/skills/setup/SKILL.md - acts on them
- modify - viber/skills/idea-validator/scripts/build_report.mjs - `--prompts`
- modify - tests/viber/build_report.unit.test.ts - the prompt content cases on the pure builder and the exit 2 cases on `main`
- modify - tests/viber/build_report.test.ts - the written prompt files, `PROMPT:` lines and exit 1
- modify - tests/viber/code-auditor.unit.test.ts - the retired `commit-selfcheck.sh` token
- modify - viber/skills/idea-validator/SKILL.md, viber/skills/idea-validator/references/council.md, viber/skills/idea-validator/references/process.md - dispatch by prompt file; `council.md` and `process.md` keep the sections the script reads
- modify - tests/viber/skill-words.unit.test.ts - the new caps

### Out of scope

- `factory.ps1`: the new modes call its existing commands; `viber/skills/factoryclient/` and the factory's Windows-only scope.
- The `viber guard:` sentences of the agent files and `tests/viber/guard-prose.unit.test.ts`: the agents still correct the command as the reason says; the R5 wording it pins is unchanged.
- `tests/viber/nudge-prose.unit.test.ts`: the script keeps today's reason for the fallback case, and the skills keep their "no verdict returned" lines.
- The agent files under `viber/agents/`: their `VERDICT:` spans are read as they stand.
- `viber/skills/commit/scripts/commit-args.sh`, and the body of the branch section of `commit-context.sh`.
- `viber/scripts/pr-threads.sh`, `qa-comment.sh`, `issue-templates.sh`, `pr-create.sh` and `merge-settings.sh`: called as today.
- The issue and pull request reference parsing of `issue-facts.sh`, `post-comment.sh`, `qa-comment.sh`, `pr-threads.sh` and `pr-reply.sh`: each keeps its own.
- `viber/skills/issue-create/SKILL.md` and the intent and fixer issue fragments: they hand over to `issue-save.md` unchanged; `issue-save.md` gets no word cap of its own, being no skill's `SKILL.md`.
- `viber/skills/idea-validator/references/dimensions.md`: the script reads its Problem strength block as it stands.
- `viber/skills/setup/assets/help.html`, the `README.md` files, `viber/docs/`, `viber/.claude-plugin/plugin.json`: they describe each skill's outcome, unchanged.
- `viber/skills/idea-validator/evals/evals.json`, `references/report-schema.md` and `tests/viber/build_report-fixture.ts`: the report contract they name is unchanged.
- `tests/viber/replay/plan-review/`: a by-hand replay kit no test reads.
- `tests/portability.unit.test.ts`: its sweep reaches the changed scripts by itself.
- Every `CLAUDE.md` node and the section files `viber/scripts/CLAUDE.github.md` and `viber/scripts/CLAUDE.run-scripts.md`: the build's memory step updates them.
- The `.claude/rules/` files citing these scripts (`shell-preload-contract.md`, `shell-script-header.md`, `literal-pathspecs.md`, `shell-loop-substitution.md`, `plugin-manifests.md`): a stale example is the build's rules step's.

## Solution requirements

- Pure refactor: every skill reaches the same outcome as before; the only behaviour changes are those the acceptance criteria name.
- Every script works on Windows (Git Bash) and macOS: bash 3.2 safe (`${arr[@]+"${arr[@]}"}`), a value reaches awk through `ENVIRON`, no apostrophe inside a single-quoted awk block, no heredoc, no GNU-only flag (`base64 -w0`, `timeout`, `sed -i`), `while read` fed by process substitution; the GitHub wrappers stay POSIX `#!/bin/sh`.
- Each changed script header documents the options and output lines this plan adds, per `.claude/rules/shell-script-header.md`; `factory.sh` gains the full header and `Contract:` block.
- `<plugin root>` in a printed command is the script's invoked path cut before its own `/scripts/` segment (`pr-reply.sh`, `pr-facts.sh`) or three directories above a skill script's directory (`commit-context.sh`, `bootstrap.sh`), never a `pwd` result.
- The factory tests stay in the integration tier (Answered); the boundary between the new modes and the real `factory.ps1` screen and `pending` formats stays unproven by any test, and so does `commit.sh`'s `(FAILED)` line, which no test setup reaches.
- The script tests of this repo spawn their script and are run by their task's `Verification`, the host's convention for scripts with no unit layer; a decision a pure function can hold (the prompt composition of `build_report.mjs`) is proven by a unit test instead.
- The `KEY=value` GitHub wrappers carry their directives as `KEY=` lines (`RUN=`, `ASK=`, `RERUN=`, `SAY=`); the other scripts use the `NEXT:`, `RUN:`, `ASK:`, `STOP:` lines of part 1.
- A path label in a printed command is single-quoted: the commit arguments never carry an apostrophe.
- Prose of every `SKILL.md` and reference this plan edits follows the `## Body` rules of `viber/skills/skill-designer/SKILL.md`: imperative, one rule per line, no history, no rationale paragraph, and a script's output replaces the prose that described it, never restating its header.
- A skill's `allowed-tools` drops every tool and script call it no longer makes and names every new one spelled as the call.
- Each script test spawns the script in a throwaway directory through `tests/harness/`; the factory tests put a `powershell.exe` stub on `PATH` (`tests/harness/stub.ts`) and stay in the integration tier with every other script test, which CI runs on Windows and macOS.
- Every prose task leaves its `SKILL.md` below its word count before this plan.

## Tasks

<!-- TASK -->
### T1 - Answer a one-question dialog through factory.sh
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: none
- Files: viber/skills/factory/scripts/factory.sh, tests/viber/factory.test.ts
- Delivers: `factory.sh answer <session> <label>` per C1 on top of a header and `Contract:` block for the whole script and an argument encoding that runs under macOS `base64`.
- Verification: node --test tests/viber/factory.test.ts -> every case passes
- DoD: `answer` on a single-select one-question dialog sends the arrow keys to the label's row, then `ENTER`, and prints `NEXT: done` with the keys sent and the last screen; `answer` on the label the cursor already sits on makes no move call and prints `NEXT: done | sent: ENTER`; `answer` whose cursor did not land on the label after the moves prints `NEXT: keys | mismatch: cursor-moved` with no `ENTER` sent; `answer` with no pending AskUserQuestion, with several questions, on a multi-select or with a label no option holds prints its C1 mismatch and sends no key; `answer` with a missing argument prints one `error:` line, empty stdout, exit 2, and a failing `factory.ps1` gives its `ERROR:` line, exit 1; an existing command such as `screen` still reaches `factory.ps1` with its arguments decoded intact, non-ASCII text included
<!-- /TASK -->

<!-- TASK -->
### T2 - Approve a plan through factory.sh
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: T1
- Files: viber/skills/factory/scripts/factory.sh, tests/viber/factory.test.ts
- Delivers: `factory.sh approve <session>` per C1.
- Verification: node --test tests/viber/factory.test.ts -> every case passes
- DoD: `approve` on a plan approval moves to the row holding `clear context` and `bypass permissions`, sends `ENTER` and prints `NEXT: done`; with the cursor already on that row it makes no move call and prints `NEXT: done | sent: ENTER`; with no such row it takes the first `Yes` row; `approve` with no pending ExitPlanMode prints `NEXT: keys | mismatch: not-asking` and sends no key
<!-- /TASK -->

<!-- TASK -->
### T3 - Reject a plan with feedback through factory.sh
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: T2
- Files: viber/skills/factory/scripts/factory.sh, tests/viber/factory.test.ts
- Delivers: `factory.sh reject <session> <feedback>` per C1.
- Verification: node --test tests/viber/factory.test.ts -> every case passes
- DoD: `reject` moves to the `Tell Claude what to change` row, types the feedback, sends `ENTER` and prints `NEXT: done` with `type` in its `sent:` list; `reject` whose screen holds no such row prints `NEXT: keys | mismatch: no-row`, and with no pending ExitPlanMode `NEXT: keys | mismatch: not-asking`, each sending no key; `reject` with no feedback prints one `error:` line, exit 2
<!-- /TASK -->

<!-- TASK -->
### T4 - Run the factory dialog modes from the skill
- TDD: none
- Covers: AC2
- Uses: C1
- Depends-on: T3
- Files: viber/skills/factory/SKILL.md, viber/skills/factory/references/dialogs.md
- Delivers: the skill's Tool list and workflow answer a one-question single-select dialog with `answer`, a plan with `approve` or `reject`, and follow `dialogs.md`'s keys after `NEXT: keys` or for any other dialog; `dialogs.md` keeps every key it holds today as the fallback and opens on when to use it.
- Verification: grep -n "NEXT: keys" viber/skills/factory/SKILL.md viber/skills/factory/scripts/factory.sh -> both files print a line; grep -c "clear context\|Tell Claude what to change" viber/skills/factory/references/dialogs.md -> 2 or more; wc -w viber/skills/factory/SKILL.md -> below 789
- DoD: `SKILL.md` lists `answer`, `approve` and `reject` with their arguments; it runs them for those dialogs and turns to `dialogs.md` on `NEXT: keys` and for the other dialogs; `dialogs.md` keeps the cursor, single-select and plan rows as fallback keys; `SKILL.md` ends below 789 words
<!-- /TASK -->

<!-- TASK -->
### T5 - Nudge an agent ending on a verdict its file does not name
- TDD: required
- Covers: AC3
- Uses: C2
- Depends-on: none
- Files: viber/hooks/scripts/verdict-nudge.sh, viber/hooks/hooks.json, tests/viber/verdict-nudge.test.ts
- Delivers: the hook reads the agent's verdict values from its agent file and nudges per C2; the `hooks.json` description says so. The test copies the script into a throwaway plugin root holding fixture agent files.
- Verification: node --test tests/viber/verdict-nudge.test.ts tests/viber/nudge-prose.unit.test.ts tests/viber/kill-guard.test.ts tests/viber/plan-gate.test.ts tests/viber/session-start.test.ts -> every case passes
- DoD: an agent whose fixture file names `VERDICT: PASS`, `VERDICT: FAIL` and `VERDICT: DENIED` ending on `VERDICT: MAYBE`, or on no verdict line, is blocked once with the C2 reason listing those three lines in file order; ending on `VERDICT: FAIL`, or on an `AUDIT:` line, passes; a fixture naming `VERDICT: VERIFIED | PARTIALLY VERIFIED` passes an agent ending on `VERDICT: PARTIALLY VERIFIED`; an agent type with no agent file, or whose file names no value, passes any `VERDICT:` line and gets today's reason without one; `stop_hook_active` true still passes every message; the `hooks.json` description names the unknown-value nudge
<!-- /TASK -->

<!-- TASK -->
### T6 - Name the separate calls of a refused chain
- TDD: required
- Covers: AC4
- Uses: C3
- Depends-on: T5
- Files: viber/hooks/scripts/shell-guard.sh, tests/viber/shell-guard.test.ts
- Delivers: the R1 reason ends on the parts of the chain per C3; the deny line keeps the literal `"permissionDecisionReason":"viber guard: ` prefix.
- Verification: node --test tests/viber/shell-guard.test.ts tests/viber/guard-prose.unit.test.ts -> every case passes
- DoD: `git status && git diff` from a task coder is denied with the R1 reason ending on ``Run instead, one call each: `git status` then `git diff`.``; a part holding a double quote reaches the reason JSON-escaped and the output still parses as JSON; a chain whose text holds a newline, `ls;` and `(a && b)` are denied with today's R1 reason alone; the `hooks.json` description checks of `shell-guard.test.ts` still pass on the current `viber/hooks/hooks.json`
<!-- /TASK -->

<!-- TASK -->
### T7 - Name the git rm form of a refused rm
- TDD: required
- Covers: AC4
- Uses: C3
- Depends-on: T6
- Files: viber/hooks/scripts/shell-guard.sh, tests/viber/shell-guard.test.ts
- Delivers: the R3 reason ends on the `git rm` form of a plain `rm` per C3.
- Verification: node --test tests/viber/shell-guard.test.ts -> every case passes
- DoD: `rm -rf build/out a.txt` is denied with the R3 reason ending on ``Run instead: `git rm -r -q -- build/out a.txt`.``; `ls | xargs rm` and `rm *.log` are denied with today's R3 reason alone
<!-- /TASK -->

<!-- TASK -->
### T8 - Name the .temp/ target of a refused redirect
- TDD: required
- Covers: AC4
- Uses: C3
- Depends-on: T7
- Files: viber/hooks/scripts/shell-guard.sh, tests/viber/shell-guard.test.ts
- Delivers: the R4 reason of a redirect ends on the command with its target moved under `.temp/` per C3.
- Verification: node --test tests/viber/shell-guard.test.ts -> every case passes
- DoD: `npm test > out.log` is denied with the R4 reason ending on ``Run instead: `npm test > .temp/out.log`.``; `ls > ./out.log` ends on ``Run instead: `ls > .temp/out.log`.``; `sed -i s/a/b/ f.txt`, `echo x | tee f.txt`, `ls > ../out.log`, `ls > logs/out.log`, `ls > "out file.log"` and `npm test > out.log 2>&1` are denied with today's R4 reason alone
<!-- /TASK -->

<!-- TASK -->
### T9 - Check the commit inside commit.sh and print the result line
- TDD: required
- Covers: AC5
- Uses: C4
- Depends-on: none
- Files: viber/skills/commit/scripts/commit.sh, viber/skills/commit/scripts/commit-selfcheck.sh, tests/viber/commit.test.ts, tests/viber/commit-selfcheck.test.ts
- Delivers: `commit.sh` prints the C4 result line, its header's stdout entry saying so; `commit-selfcheck.sh` and its test are deleted.
- Verification: node --test tests/viber/commit.test.ts -> every case passes; ls viber/skills/commit/scripts/commit-selfcheck.sh tests/viber/commit-selfcheck.test.ts -> both reported missing
- DoD: a commit in mode `all` prints exactly `<short sha> | <subject> (VERIFIED)`, the subject being the message's first line; a commit in mode `paths` prints the same line for its own commit; a clean scope prints exactly `Nothing to commit`; a commit on an unborn branch prints `(VERIFIED)`; a rejecting pre-commit hook gives git's exit status with an empty stdout; a missing message still exits 1 with its usage, a missing path exits 3
<!-- /TASK -->

<!-- TASK -->
### T10 - Print the commit call as a RUN or STOP line
- TDD: required
- Covers: AC6
- Uses: C5
- Depends-on: none
- Files: viber/skills/commit/scripts/commit-context.sh, tests/viber/commit-context.test.ts
- Delivers: the first line of `commit-context.sh` is the C5 `RUN:` or `STOP:` line.
- Verification: node --test tests/viber/commit-context.test.ts -> every case passes
- DoD: mode `all` opens on the `RUN:` line with `"<message>"` alone; mode `paths` opens on the `RUN:` line with the paths label single-quoted as its third argument, a path named `odd $HOME (1).txt` reaching it unexpanded through the preload of `commit/SKILL.md`; mode `missing` prints only the `STOP:` line, exit 0; the `RUN:` path is the plugin root three directories above the script's directory
<!-- /TASK -->

<!-- TASK -->
### T11 - Print the ready issue footer from the arguments or the branch
- TDD: required
- Covers: AC6
- Uses: C5
- Depends-on: T10
- Files: viber/skills/commit/scripts/commit-context.sh, tests/viber/commit-context.test.ts
- Delivers: the `## Issue footer` section of C5, always printed; the branch section heading reads `## Current branch`.
- Verification: node --test tests/viber/commit-context.test.ts -> every case passes
- DoD: arguments naming `#42` and an issue link to 7 give `Refs: #42, #7` on any branch; no reference on `feature/task.42-login` gives `Refs: #42`; no reference on a branch naming `issue.3` and `task.4` gives `none`; no reference on `main` gives `none`
<!-- /TASK -->

<!-- TASK -->
### T12 - Commit from the context's directive
- TDD: none
- Covers: AC6
- Uses: C4, C5
- Depends-on: T9, T11
- Files: viber/skills/commit/SKILL.md, viber/skills/commit/references/commit-conventions.md, tests/viber/code-auditor.unit.test.ts
- Delivers: the retired-name list of `code-auditor.unit.test.ts` gains the `commit-selfcheck.sh` token, built from fragments as its other tokens are; the commit fork runs the `RUN:` line with its message and the footer of the context, returns `commit.sh`'s line as printed, and returns a `STOP:` sentence; the `Before SHA` preload, the self-check and the footer regex are gone.
- Verification: grep -n "RUN:" viber/skills/commit/SKILL.md viber/skills/commit/scripts/commit-context.sh -> both files print a line; grep -c "commit-selfcheck\|Before SHA\|task|issue" viber/skills/commit/SKILL.md viber/skills/commit/references/commit-conventions.md -> 0 for both; node --test tests/viber/commit-context.test.ts tests/viber/code-auditor.unit.test.ts -> every case passes; wc -w viber/skills/commit/SKILL.md -> below 397
- DoD: the fenced `commit-context.sh '$ARGUMENTS'` preload stays the single line it is; `SKILL.md` runs the `RUN:` line once with `<message>` replaced and returns its stdout line or error; it returns a `STOP:` sentence and runs nothing; `allowed-tools` no longer names `commit-selfcheck.sh`; `commit-conventions.md` puts the footer line of the context after one blank line and holds no branch regex; `SKILL.md` ends below 397 words
<!-- /TASK -->

<!-- TASK -->
### T13 - State a skipped reply with SAY
- TDD: required
- Covers: AC7
- Uses: C6
- Depends-on: none
- Files: viber/scripts/pr-reply.sh, tests/viber/pr-reply.test.ts
- Delivers: the three-argument skip block of C6 with its `SAY=` line.
- Verification: node --test tests/viber/pr-reply.test.ts -> every case passes
- DoD: a remark already holding a viber reply prints exactly `STATUS=skip`, `REASON=exists` and the C6 `SAY=` line, exit 0, nothing posted
<!-- /TASK -->

<!-- TASK -->
### T14 - List the ready and missing replies with pr-reply.sh --list
- TDD: required
- Covers: AC7
- Uses: C6
- Depends-on: T13
- Files: viber/scripts/pr-reply.sh, tests/viber/pr-reply.test.ts
- Delivers: `pr-reply.sh --list <pull request>` per C6, calling no `gh`.
- Verification: node --test tests/viber/pr-reply.test.ts -> every case passes
- DoD: a `review.md` of three items, two with a reply file, prints `STATUS=ready`, two `READY=` and one `MISSING=` line in section order and the `RUN=` line; no reply file prints the `MISSING=` lines and `REASON=none-ready` with its `SAY=`; no `review.md` prints `REASON=no-review` with its `SAY=`; a pull request URL reads the review of its number; a malformed pull request exits 2 and a cwd outside a git repository exits 1, each per C6; the `RUN=` path is the invoked path cut before `/scripts/`
<!-- /TASK -->

<!-- TASK -->
### T15 - Post every ready reply with pr-reply.sh --all
- TDD: required
- Covers: AC7
- Uses: C6
- Depends-on: T14
- Files: viber/scripts/pr-reply.sh, tests/viber/pr-reply.test.ts
- Delivers: `pr-reply.sh --all <pull request>` per C6.
- Verification: node --test tests/viber/pr-reply.test.ts -> every case passes
- DoD: two ready replies print one `POSTED=` line each in section order and `MISSING_COUNT=` with the missing items' count; an item already replied prints its `SKIPPED=` line; a failed post prints its `FAILED=` line, is never posted again and the next reply is posted; no `gh` prints one `ERROR` line, exit 1, nothing posted
<!-- /TASK -->

<!-- TASK -->
### T16 - Post the replies through --list and --all
- TDD: none
- Covers: AC7
- Uses: C6
- Depends-on: T15
- Files: viber/skills/pr-feedback-reply/SKILL.md
- Delivers: step 2 runs `--list` and prints its lines, step 3 asks once and runs the `RUN=` line, reporting its lines; the `Read` and `Glob` of the review are gone.
- Verification: grep -n "\-\-list" viber/skills/pr-feedback-reply/SKILL.md viber/scripts/pr-reply.sh -> both files print a line; grep -c "Glob\|Read," viber/skills/pr-feedback-reply/SKILL.md -> 0; wc -w viber/skills/pr-feedback-reply/SKILL.md -> below 431
- DoD: step 2 runs `pr-reply.sh --list`, states a skip's `SAY=` and reports an exit 1 or 2 as its `ERROR` line and stops; step 3 holds one `AskUserQuestion` before the `RUN=` line, which the script-call rule lets run as printed, and no per-reply call, reporting each result line and an exit 1 or 2 as its `ERROR` line; `allowed-tools` no longer names `Read` or `Glob`; `SKILL.md` ends below 431 words
<!-- /TASK -->

<!-- TASK -->
### T17 - State each pull request stop with SAY
- TDD: required
- Covers: AC8
- Uses: C7
- Depends-on: none
- Files: viber/scripts/pr-facts.sh, tests/viber/pr-facts.test.ts
- Delivers: the C7 `SAY=` line after each stop `REASON=`.
- Verification: node --test tests/viber/pr-facts.test.ts -> every case passes
- DoD: each of the eight stop reasons prints its C7 sentence as the block's last line; `pr-exists` keeps `PR_URL=` and `QA=` before it
<!-- /TASK -->

<!-- TASK -->
### T18 - Print the finished title or its template
- TDD: required
- Covers: AC8
- Uses: C7
- Depends-on: T17
- Files: viber/scripts/pr-facts.sh, tests/viber/pr-facts.test.ts
- Delivers: `TITLE=` and `TITLE_TEMPLATE=` per C7.
- Verification: node --test tests/viber/pr-facts.test.ts -> every case passes
- DoD: an issue title gives `TITLE=[<n>] <issue title>` and an empty `TITLE_TEMPLATE=`; the pattern `{type}: {summary}` on a fix branch gives an empty `TITLE=` and `TITLE_TEMPLATE=fix: {summary}`; the default pattern with no issue gives `TITLE_TEMPLATE=[] {summary}`, as today's title step does; a pattern without `{summary}` gives the filled `TITLE=`
<!-- /TASK -->

<!-- TASK -->
### T19 - Print the footer lines and the body file path
- TDD: required
- Covers: AC8
- Uses: C7
- Depends-on: T18
- Files: viber/scripts/pr-facts.sh, tests/viber/pr-facts.test.ts
- Delivers: `FOOTER=` and `BODY_FILE=` per C7.
- Verification: node --test tests/viber/pr-facts.test.ts -> every case passes
- DoD: issues 12 and 30 with `CLOSES=yes` give `FOOTER=Closes #12` then `FOOTER=Closes #30`; `CLOSES=no` gives `Refs #` lines; no issue gives no `FOOTER=`; `BODY_FILE=` names a stamped file under the repository root's `.temp/viber/pr-create/`
<!-- /TASK -->

<!-- TASK -->
### T20 - Ask for the target or entry with the rerun command
- TDD: required
- Covers: AC8
- Uses: C7
- Depends-on: T19
- Files: viber/scripts/pr-facts.sh, tests/viber/pr-facts.test.ts
- Delivers: `ASK=` and `RERUN=` per C7.
- Verification: node --test tests/viber/pr-facts.test.ts -> every case passes
- DoD: `MODE=off` with no target gives `ASK=target` and the `--target` `RERUN=`; `MODE=allowed` with no entry gives `ASK=entry` and the `--entry` `RERUN=`; a run with `--target`, and a run resolving `ENTRY=`, give neither line; the `RERUN=` path is the invoked path cut before `/scripts/`
<!-- /TASK -->

<!-- TASK -->
### T21 - Open the pull request from the printed keys
- TDD: none
- Covers: AC8
- Uses: C7
- Depends-on: T20
- Files: viber/skills/pr-create/SKILL.md
- Delivers: step 1 states `SAY=`, step 2 asks by `ASK=` and runs `RERUN=`, step 3 takes `TITLE=` or fills `{summary}` of `TITLE_TEMPLATE=`, step 4 ends on the `FOOTER=` lines, step 5 writes to `BODY_FILE=`, step 7 states the `SAY=` of `qa-comment.sh`; no reason list, placeholder list or `date` remains.
- Verification: grep -n "TITLE_TEMPLATE=\|BODY_FILE=" viber/skills/pr-create/SKILL.md viber/scripts/pr-facts.sh -> both files print lines; grep -c "date +\|no-commits" viber/skills/pr-create/SKILL.md -> 0; wc -w viber/skills/pr-create/SKILL.md -> below 824
- DoD: steps 1 and 7 state the `SAY=` line and hold no per-reason sentence, step 1 keeping the `pr-exists` with `QA=` route to step 7; step 2 offers `DEFAULT=` first on `ASK=target` and the `CANDIDATE=` lines on `ASK=entry`, and runs `RERUN=` with its slot filled from the answer, which the script-call rule allows as printed; step 3 fills only `{summary}`, in the language of `SPEC=`'s file, else of this conversation; step 4 still replaces `{type}`, `{issue-number}`, `{entry}` and `{summary}` in a template body from `TYPE=`, the first `ISSUE=`, `ENTRY=` and the summary; `allowed-tools` no longer names `date`; `SKILL.md` ends below 824 words
<!-- /TASK -->

<!-- TASK -->
### T22 - Apply a template's values with issue-create.sh --template
- TDD: required
- Covers: AC9
- Uses: C8
- Depends-on: none
- Files: viber/scripts/issue-create.sh, tests/viber/issue-create.test.ts
- Delivers: `--template <path>` per C8; the header says exit 2 may follow the template lookup's `gh` calls.
- Verification: node --test tests/viber/issue-create.test.ts -> every case passes; grep -n "\-\-template" viber/scripts/issue-create.sh -> the header names it
- DoD: a template with `type: Bug`, two labels, an assignee and a project creates the issue with all of them, `TYPE=applied`; `--template` together with `--type`, `--label`, `--assignee` or `--project` exits 2 with one `ERROR issue-create.sh:` line; a path no template block holds, and a skip block of `issue-templates.sh`, each exit 2 with one `ERROR` line and create nothing
<!-- /TASK -->

<!-- TASK -->
### T23 - Pass the template to issue-create.sh in the issue save
- TDD: none
- Covers: AC9
- Uses: C8
- Depends-on: T22
- Files: viber/references/issue-save.md
- Delivers: step 6 runs `issue-create.sh` with `--template` and `--parent` when the user corrected none of the preview's type, labels, assignees or projects, and with today's per-value flags, taken from the corrected preview, when they did.
- Verification: grep -n "\-\-template" viber/references/issue-save.md viber/scripts/issue-create.sh -> both files print a line
- DoD: step 6 passes the chosen template's path with `--template` for an uncorrected preview; it keeps `--parent` for a preview with a `Parent` line; a preview whose type, labels, assignees or projects the user corrected passes each shown value as its flag and no `--template`
<!-- /TASK -->

<!-- TASK -->
### T24 - Print the setup settings and page directives
- TDD: required
- Covers: AC10
- Uses: C9
- Depends-on: none
- Files: viber/skills/setup/scripts/bootstrap.sh, tests/viber/bootstrap.test.ts
- Delivers: the C9 directive lines after today's lines.
- Verification: node --test tests/viber/bootstrap.test.ts -> every case passes
- DoD: after today's last line, `settings.json: present` gives the `ASK:` with the merge and reset commands; `settings.json: absent` gives the merge `RUN:`; a matching settings file gives neither; every run ends on the help page `RUN:`; each command path is the plugin root three directories above the script's directory, and the exit stays 0
<!-- /TASK -->

<!-- TASK -->
### T25 - Run setup from the preload's directives
- TDD: none
- Covers: AC10
- Uses: C9
- Depends-on: T24
- Files: viber/skills/setup/SKILL.md
- Delivers: the settings step asks the `ASK:`, its merge and reset descriptions staying as the two options' descriptions, and runs the chosen command or a `RUN:` line before the last one; the page step runs the last `RUN:` after the CLAUDE.md check; the per-line mapping and the two command lines are gone.
- Verification: grep -n "ASK:" viber/skills/setup/SKILL.md viber/skills/setup/scripts/bootstrap.sh -> both files print a line; grep -c "templates/settings.json" viber/skills/setup/SKILL.md -> 0; wc -w viber/skills/setup/SKILL.md -> below 470
- DoD: the settings step acts on `ASK:` through one `AskUserQuestion` and runs only a `RUN:` line before the last one, once; the page step runs the last `RUN:` line; the close leaves out the `ASK:` and `RUN:` lines and otherwise stays as today, the CLAUDE.md check too; `SKILL.md` ends below 470 words
<!-- /TASK -->

<!-- TASK -->
### T26 - Write the research prompt files
- TDD: required
- Covers: AC11
- Uses: C10
- Depends-on: none
- Files: viber/skills/idea-validator/scripts/build_report.mjs, tests/viber/build_report.unit.test.ts, tests/viber/build_report.test.ts
- Delivers: the pure `buildPrompts` of C10 for `research`, and `--prompts research <workdir>` writing its files. The missing-section exit is proven by copying `build_report.mjs` beside a stub `references/` directory in a throwaway directory.
- Verification: node --test tests/viber/build_report.unit.test.ts tests/viber/build_report.test.ts -> every case passes
- DoD: `buildPrompts` over the real reference texts gives the problem, market and competition prompts, each holding its brief, the research rules, the two input paths and its output path in C10 order, the problem prompt with the Problem strength anchors right after its brief; `buildPrompts` over a reference text missing a named section throws naming it; `main` with an unknown stage returns 2 with the usage, and with a wrong argument count without `--prompts` still returns 2; `--prompts research` on a relative working directory writes the three files under its `prompts/`, created when missing, and prints one `PROMPT:` line each with an absolute path; a missing working directory exits 1; a missing section exits 1 naming it
<!-- /TASK -->

<!-- TASK -->
### T27 - Write the council round 1 prompt files
- TDD: required
- Covers: AC11
- Uses: C10
- Depends-on: T26
- Files: viber/skills/idea-validator/scripts/build_report.mjs, tests/viber/build_report.unit.test.ts, tests/viber/build_report.test.ts
- Delivers: `buildPrompts` and `--prompts` for `council-r1` per C10.
- Verification: node --test tests/viber/build_report.unit.test.ts tests/viber/build_report.test.ts -> every case passes
- DoD: `buildPrompts` gives seven member prompts, each holding its member file text, the language line, the nine input paths with the read-and-cite line, its output path, the whole fenced round-1 format and the isolation line; `--prompts council-r1` writes the seven files and prints one `PROMPT:` line each; `main` with no language returns 2 with the usage
<!-- /TASK -->

<!-- TASK -->
### T28 - Write the council round 2 prompt files
- TDD: required
- Covers: AC11
- Uses: C10
- Depends-on: T27
- Files: viber/skills/idea-validator/scripts/build_report.mjs, tests/viber/build_report.unit.test.ts, tests/viber/build_report.test.ts
- Delivers: `buildPrompts` and `--prompts` for `council-r2` per C10.
- Verification: node --test tests/viber/build_report.unit.test.ts tests/viber/build_report.test.ts -> every case passes
- DoD: `buildPrompts` gives seven member prompts, each holding its member file text, its own round-1 path, the six other round-1 paths, the language line, its output path, the whole fenced round-2 format and the respond-by-name line; `--prompts council-r2` writes the seven files and prints one `PROMPT:` line each; `main` with no language returns 2 with the usage
<!-- /TASK -->

<!-- TASK -->
### T29 - Dispatch research and council by prompt file
- TDD: none
- Covers: AC11
- Uses: C10
- Depends-on: T28
- Files: viber/skills/idea-validator/SKILL.md, viber/skills/idea-validator/references/council.md, viber/skills/idea-validator/references/process.md
- Delivers: steps 3-5, 10 and 11 run `--prompts` for their stage and launch one `general-purpose` subagent per `PROMPT:` line, all in one turn, with `Read <path> and follow it.`; `council.md` keeps the members, the formats, the headings C10 reads and the moderator protocol and loses the prompt contents lists; `process.md` no longer says to paste the briefs or the research rules (its research rules heading and the line opening its briefs section), and its problem brief no longer says the anchors are pasted below it.
- Verification: grep -n "\-\-prompts" viber/skills/idea-validator/SKILL.md viber/skills/idea-validator/scripts/build_report.mjs -> both files print lines; grep -ci "prompt contains\|paste" viber/skills/idea-validator/references/council.md viber/skills/idea-validator/references/process.md -> 0 for both; node --test tests/viber/build_report.unit.test.ts -> every case passes; wc -w viber/skills/idea-validator/SKILL.md -> below 1016
- DoD: steps 3-5, 10 and 11 run their `--prompts` stage and dispatch the printed paths; no step pastes a brief, rule section or member file; `council.md` holds no "prompt contains" list and keeps the `## Round-1 output format` and `## Round 2` headings with their fenced blocks; `process.md` keeps the `## Research rules` heading opening; `SKILL.md` ends below 1016 words
<!-- /TASK -->

<!-- TASK -->
### T30 - Cap the words of every skill this plan touched
- TDD: none
- Covers: AC12
- Uses: none
- Depends-on: T4, T12, T16, T21, T25, T29
- Files: tests/viber/skill-words.unit.test.ts
- Delivers: caps for `factory`, `commit`, `pr-create`, `setup` and `idea-validator` and a lower `pr-feedback-reply` cap, each with its count before this plan as the before value.
- Verification: node --test tests/viber/skill-words.unit.test.ts -> every case passes
- DoD: the test lists `factory` below 789, `commit` below 397, `pr-create` below 824, `setup` below 470 and `idea-validator` below 1016, each cap at the file's count after its task; `pr-feedback-reply`'s cap sits below 431, its before value staying 433
<!-- /TASK -->

## Contracts

### C1 - factory.sh dialog modes

File: viber/skills/factory/scripts/factory.sh

```
factory.sh answer <session> <label>      one-question single-select AskUserQuestion
factory.sh approve <session>             ExitPlanMode
factory.sh reject <session> <feedback>   ExitPlanMode
```

Each mode reads `pending` and `screen <session> 40` through `factory.ps1`, then:
- answer target: the last option row on the screen whose text after `<n>. ` equals `<label>`.
- approve target: the first option row holding both `clear context` and `bypass permissions`, else the first option row whose text opens with `Yes`.
- reject target: the option row holding `Tell Claude what to change`; after the cursor check it runs `type <session> <feedback>`, then `keys <session> ENTER`.
- An option row is a screen line `^[ ]*(❯[ ]*)?[0-9]+\.[ ]+<text>`; the cursor row is the one holding `❯`.
- Moves: `DOWN` or `UP` as many times as the target's option number differs from the cursor row's, sent in one `keys` call; the screen that call prints must show the cursor on the target row before `ENTER` is sent. Zero moves: no move call, the screen already read is the cursor check.
- `sent:` lists every key sent in order; `reject` writes its typed feedback as `type` (`sent: DOWN,type,ENTER`).
- Arguments are checked first: a missing one exits 2 before `powershell.exe` is looked for.

stdout, exit 0:
```
NEXT: done | sent: <K1,K2,...>
<the last screen lines, verbatim>
```
or
```
NEXT: keys | mismatch: <reason>
<the last screen lines read, verbatim>
```
reasons: `not-asking` (pending tool is not AskUserQuestion for answer, not ExitPlanMode for approve/reject), `several-questions`, `multi-select`, `no-option` (label in no pending option), `no-row` (target or cursor row not on the screen), `cursor-moved` (cursor not on the target after the moves). On a mismatch no `ENTER` is sent.
- exit 1: `factory.ps1` failed or `powershell.exe` missing: its `ERROR:` line, as every command.
- exit 2: a missing argument: one `error: <reason>` line on stderr, empty stdout.

### C2 - verdict-nudge.sh values and reason

File: viber/hooks/scripts/verdict-nudge.sh

- Agent file: `<plugin root>/agents/<name>.md`, `<name>` the `agent_type` after `viber:`, `<plugin root>` two directories above the script's directory.
- Values: every match of `VERDICT: ` followed by `V( \| V)*`, `V` being `[A-Z][A-Z-]*( [A-Z][A-Z-]*)*`, anywhere in that file, each `V` one value, deduplicated in file order.
- Message value: the `V` after `VERDICT: ` on the last message's last line matching the existing line test; a last matching line opening on `AUDIT:` passes.
- Block: `{"decision":"block","reason":"Finish your task, then end on one of these lines: VERDICT: <v1>, VERDICT: <v2>, ..."}`, the values in file order, when there is no `VERDICT:` or `AUDIT:` line, or the message value is none of the values.
- No agent file, or no value in it: today's test and today's reason `Finish your task, then return your output lines.`

### C3 - shell-guard.sh corrected command

File: viber/hooks/scripts/shell-guard.sh

`permissionDecisionReason` = `viber guard: <today's reason of the rule>` plus, when derivable, one space and:
- R1: ``Run instead, one call each: `<part 1>` then `<part 2>`[ then `<part n>`].`` - the parts split at each unquoted `;`, `&&`, `||`, trimmed, empty parts dropped; only with two or more parts left, and none when an operator sits inside `(`, `$(` or backticks.
- R3: ``Run instead: `git rm -r -q -- <operands>`.`` - only for a command whose only command word is `rm` and that holds no redirect, its operands every word that does not open with `-` (words after `--` included); none when an operand holds a quote, `$`, a backtick, `*`, `?` or `[`.
- R4: ``Run instead: `<command>`.`` - only for a command holding exactly one redirect, a `>`, `>>`, `>|`, `&>` or `N>` onto an unquoted relative file name, the command with that target written `.temp/<target>`, a leading `./` dropped from it once; a target still holding a `/` (a `..` segment or a subdirectory), a quoted target and any command also holding a `>&` form (`2>&1`) get none.
- Every other denial, and any suffix whose text would hold a newline, carriage return, tab or other control character: no suffix. A `"` or `\` in the suffix is JSON-escaped.

### C4 - commit.sh result line

File: viber/skills/commit/scripts/commit.sh

stdout, exactly one line:
- `<short sha> | <subject> (VERIFIED)` - HEAD moved off the HEAD read before the commit (an unborn HEAD counts as moved once a commit exists); `<subject>` the message's first line.
- `<short sha> | <subject> (FAILED)` - git exited 0 and HEAD did not move.
- `Nothing to commit` - nothing in the scope.
git's own output goes to stderr; a git failure leaves stdout empty. Exit codes as today: 0, 1 missing message, 3 mode missing, git's own status otherwise.

### C5 - commit-context.sh first line and footer

File: viber/skills/commit/scripts/commit-context.sh

First line:
- mode `all`: `RUN: "<plugin root>/skills/commit/scripts/commit.sh" "<message>"`
- mode `paths`: `RUN: "<plugin root>/skills/commit/scripts/commit.sh" "<message>" '<paths label>'`
- mode `missing`: `STOP: Nothing committed - paths not found: <missing>`, then exit 0 with nothing else.
`<message>` is the slot the fork replaces with its message.

After the blank line, always:
```
## Issue footer (after the subject and one blank line; none -> no footer)
Refs: #<n>[, #<n>]... | none
```
Source: the arguments' references when any; else the branch's `(?i)(?:task|issue)\.(\d+)` matches when exactly one distinct number; else `none`.
The branch section heading is `## Current branch`.

### C6 - pr-reply.sh skip, --list and --all

File: viber/scripts/pr-reply.sh

- Three-argument skip: `STATUS=skip`, `REASON=exists`, `SAY=The item already holds a viber reply.`
- `pr-reply.sh --list <pull request>`: reads `<root>/.temp/viber/pr-feedback/<N>/review.md`, `<root>` the cwd (the session's working directory, as today's step 2 reads it), `<N>` the pull request number; stdout, exit 0:
  ```
  STATUS=ready|skip
  READY=<k> - <where> - <key>     0 or more, section order, the file at the section's `- Reply file:` path exists
  MISSING=<k> - <where> - <key>   0 or more, section order
  RUN="<plugin root>/scripts/pr-reply.sh" --all "<pull request>"   STATUS=ready only
  REASON=no-review|none-ready     STATUS=skip only
  SAY=<sentence>                  STATUS=skip only
  ```
  `<k>` the section heading's first part, `<where>` its last part, `<key>` its `- Comment:` value. `no-review`: `SAY=No /viber:pr-feedback run wrote a review file for this pull request.`; `none-ready`: `SAY=No reply file is written yet.` Exit 2 with the usage on a malformed pull request; exit 1 with one `ERROR pr-reply.sh:` line outside a git repository.
- `pr-reply.sh --all <pull request>`: posts each ready reply in section order as the three-argument form does, never twice; stdout, exit 0:
  ```
  POSTED=<key> <reply url>
  SKIPPED=<key> <the SAY sentence of exists>
  FAILED=<key> <the error text after "ERROR pr-reply.sh: ">
  MISSING_COUNT=<n>
  ```
  one line per ready reply, then the count. Exit 1 with one `ERROR pr-reply.sh:` line when `gh` or the repository is missing before any post; exit 2 on bad arguments or no `review.md`.

### C7 - pr-facts.sh SAY and ready keys

File: viber/scripts/pr-facts.sh

Stop block: today's lines, then `SAY=<sentence>`:
- `no-gh`: GitHub command line tool missing.
- `no-repo`: No GitHub repository reachable.
- `detached`: HEAD is detached; check out a branch.
- `dirty`: Uncommitted changes to tracked files; commit them first.
- `on-base`: The branch is the default branch or a work entry's base or target; a pull request needs its own branch.
- `pr-exists`: The branch already has an open pull request: <PR_URL>.
- `no-commits`: Nothing on the branch is ahead of its target.
- `unknown-entry`: The entry named is not a branching.work entry.

Ready block: today's lines, then:
```
TITLE=<[<first ISSUE>] <ISSUE_TITLE> | the filled pattern, runs of blanks collapsed and trimmed, when it holds no {summary} | empty>
TITLE_TEMPLATE=<the pattern, {type} {issue-number} {entry} filled, runs of blanks collapsed and trimmed | empty when TITLE= is set>
FOOTER=<Closes #<n> when CLOSES=yes | Refs #<n>>     one per ISSUE=, same order
BODY_FILE=<root>/.temp/viber/pr-create/body-<yyyy-mm-dd-HH-MM-SS>.md
ASK=target|entry      only when ENTRY= and TARGET= are both empty: target on MODE=off, else entry
RERUN="<plugin root>/scripts/pr-facts.sh" --target "<branch>" | ... --entry "<key>"   with ASK=
```
`<branch>` and `<key>` in `RERUN=` are literal slots the model fills with the answer.

### C8 - issue-create.sh --template

File: viber/scripts/issue-create.sh

`--template <repo-relative path>`: the template block of `issue-templates.sh` whose `--- template <path> ---` line names that path; it applies its `TYPE` as `--type` and each `LABELS`, `ASSIGNEES` and `PROJECTS` item as `--label`, `--assignee`, `--project`. `--template` with any of those four flags: one `ERROR issue-create.sh:` line, exit 2. A path no block names, or a skip block: one `ERROR issue-create.sh: <reason>` line, exit 2, nothing created. Output as today.

### C9 - bootstrap.sh directives

File: viber/skills/setup/scripts/bootstrap.sh

After today's lines:
- `settings.json: present`: `ASK: merge -> "<plugin root>/skills/setup/scripts/merge-settings.sh" "<plugin root>/skills/setup/templates/settings.json" | reset -> "<plugin root>/skills/setup/scripts/merge-settings.sh" --reset "<plugin root>/skills/setup/templates/settings.json"`
- `settings.json: absent`: `RUN: "<plugin root>/skills/setup/scripts/merge-settings.sh" "<plugin root>/skills/setup/templates/settings.json"`
- a matching settings file: no line.
- always last: `RUN: "<plugin root>/scripts/open-page.sh" "<plugin root>/skills/setup/assets/help.html"`

### C10 - build_report.mjs --prompts

File: viber/skills/idea-validator/scripts/build_report.mjs

```
node build_report.mjs --prompts research <workdir>
node build_report.mjs --prompts council-r1 <workdir> <language>
node build_report.mjs --prompts council-r2 <workdir> <language>

export function buildPrompts(stage, workdir, language, refs)
  refs: { process, dimensions, council, members: { customer: <text>, ... } }   the reference texts
  returns [{ name, path, text }] in the name order below; throws an Error naming a missing section
```
Writes each `text` to its `path`, `<workdir>/prompts/<stage>-<name>.md`, every path in it absolute: the CLI resolves a relative `<workdir>` against the cwd before calling `buildPrompts` and creates `prompts/` when missing.
- A heading is a column-0 `#` line outside a fenced block; a named heading matches a heading line opening with it (`## Round 2 (default on; ...)` matches `## Round 2`); a section runs to the next heading of the same or a higher level. "The fenced block under <heading>" is the first fence after that heading line through its closing fence. The `**Problem strength**` block is that bold line and the lines under it up to the next blank line.
- research, names `problem`, `market`, `competition`, each in this order: the `### <Name> research brief` section of `references/process.md`, for `problem` the `**Problem strength**` block of `references/dimensions.md`, the `## Research rules` section, the paths of `01-normalized.md` and `02-hypotheses.md`, the output path `0<3|4|5>-research-<name>.md`.
- council-r1, names `customer`, `skeptic`, `analyst`, `growth`, `operator`, `risk`, `visionary` (`references/council/<nn>-<name>.md`): the member file text; `Write in <language>.`; the paths of `01-normalized.md`, `02-hypotheses.md`, `03-research-problem.md`, `04-research-market.md`, `05-research-competition.md`, `06-business-model.md`, `07-distribution.md`, `08-side-project-fit.md` and `09-autopilot-fit.md` with `Read all of them before answering and cite the file, and the URL inside it, for every fact you use.`; the output path `10-council-r1/<name>.md`; the fenced block under `## Round-1 output format` of `references/council.md`; `Do not look for or read any file under 10-council-r1/ or 11-council-r2/.`
- council-r2: the member file text; its own `10-council-r1/<name>.md` path; the six other round-1 paths; `Write in <language>.`; the output path `11-council-r2/<name>.md`; the fenced block under `## Round 2`; `Respond to specific arguments by name, never restate round 1, and change position whenever an argument convinces you.`

stdout, exit 0: one `PROMPT: <name> | <absolute path>` line per file. Exit 1: `<workdir>` missing or a reference section not found, one line naming it. Exit 2: an unknown stage or a missing argument, the usage.

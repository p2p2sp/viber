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

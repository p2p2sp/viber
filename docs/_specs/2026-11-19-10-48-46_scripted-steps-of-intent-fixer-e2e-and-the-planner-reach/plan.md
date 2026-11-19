---
source: /Users/dario/Projects/viber/docs/_specs/2026-11-19-10-48-46_scripted-steps-of-intent-fixer-e2e-and-the-planner-reach/plan.md
planned: /Users/dario/.claude-p2p2/plans/cosmic-nibbling-hammock.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Scripted steps of intent, fixer, e2e and the planner reach

## Goal

The mechanical steps that intent, fixer, e2e and the planner still apply from prose move into scripts that answer in directive lines: the impact-mapper prompt, the threshold re-ask, the run branch answers, the working tree record, the wait for the application, the scenario ledger and its report, the issue or pull request argument check, the summary path, the `Attachment:` lines and the skip sentences. Each skill then reads fewer words and a wrong step stops depending on the model.

## Problem

Each of these steps is prose the model re-reads and applies by hand on every run: it writes the impact-mapper prompt from a template, compares the task count against an accepted count, maps every branch answer to its follow-up command, diffs `git status` output, polls with `curl` in a loop, reads `## Automation` states and builds every e2e-writer prompt, decides whether an argument is shaped like an issue or pull request reference (worded three different ways across five skills), builds a timestamped path and absolute `Attachment:` paths, and translates `REASON=` codes into sentences copied word for word into three skills. That costs tokens against the user's Claude Code usage limits and gives the model a chance to get each step wrong.

## Current behaviour

`reach.sh` prints only `candidates:` and `hits:`; the planner writes the impact-mapper prompt from a template in its `SKILL.md`. `plan-index.sh` prints `threshold:` past 30 tasks and the planner compares it with the count the user accepted. `plan-path.sh --start` and `--branch` print `option:` lines whose follow-up action per answer the intent, fixer and planner fragments spell out; after a fix the planner compares the re-run's values with the recorded frontmatter itself. The fixer records the tree with `git status` and compares it at its handoff gate by hand. The e2e skill probes and polls with `curl` itself, reads the handoff's `## Automation` states itself, writes each e2e-writer prompt and its report in prose. Intent, fixer, prototype, pr-feedback and pr-feedback-reply classify their argument in prose. Intent gets a stamp from `date` to name its summary file and writes `Attachment:` lines itself, as does the fixer. `issue-templates.sh` and `qa-comment.sh` print `STATUS=skip` and `REASON=` only, and each consumer maps the reason to a sentence.

### Must not change

- The argument grammar and the output of `issue-facts.sh` and `pr-threads.sh`.
- The input lines `viber:impact-mapper` and `viber:e2e-writer` receive, and their agent files.
- The answers `plan-path.sh --start` and `--branch` give today (their `next:` values and the `settled:`, `show:`, `work:`, `branch:`, `checking:` and `note:` lines under each) and its exit codes; the only new answers are `next: kept` of `--branch` and the base check a `--start --settled nothing --entry <key>` call gets for that entry, where today it re-asks the entry question.
- The `qa.e2e.md` format: the e2e skill never writes into it.
- The `STATUS=` and `REASON=` lines of `issue-templates.sh` and `qa-comment.sh`, in their order.
- The stdout of `plan-index.sh` without `--accepted`.

## Roadmap

Part 6 of 7 - Intent, fixer, e2e and the rest

1. Directive convention and the implementor task loop (built)
2. Implementor close (built)
3. Code auditor (built)
4. Memory and rules (built)
5. Planner validation and review (built)
6. Intent, fixer, e2e and the rest (this plan)
7. Git, GitHub and the rest
   - `factory.sh answer`, `approve`, `reject` with `MISMATCH` falling back to keys; `verdict-nudge.sh` reads the `VERDICT:` values from the agent file; `commit.sh` runs its own self-check and prints the result line, `commit-selfcheck.sh` removed; `commit-context.sh` gives the ready footer and `RUN:`.
   - `pr-reply.sh --list`/`--all` under one confirmation, never retrying; `build_report.mjs --prompts` writes prompt files under `.temp/`; `issue-create.sh --template`; `pr-facts.sh` `TITLE=`, `TITLE_TEMPLATE=`, `FOOTER=`, `BODY_FILE=`, `SAY=`, `ASK` with `RERUN=`; `bootstrap.sh` `ASK`/`RUN`; `shell-guard.sh` returns the corrected command; `SAY=` for the `STATUS=skip` of `pr-reply.sh`.
   - Every part: the directive format of part 1, a pure refactor, a word cap on the skill it touches.

## Behaviour

### S1 - The reach step [CHANGED - was: the planner wrote the impact-mapper prompt from a template]

Given a plan file path and the targets of a change
When the planner runs `reach.sh --plan` with them
Then it dispatches `viber:impact-mapper` with exactly the lines `reach.sh` printed below its `NEXT: dispatch` line

### S2 - A plan the user kept past 30 tasks [CHANGED - was: the planner compared the counts itself]

Given the user kept a plan estimated at 34 tasks
When the written plan holds 33 tasks and the planner runs `plan-index.sh` with `--accepted "34"`
Then no `threshold:` line is printed and no question is asked; at 36 tasks the line is printed and the question asked again

### S3 - A run branch answer [CHANGED - was: each fragment mapped every answer to its follow-up]

Given `plan-path.sh --start` answered `next: ask-base`
When the user picks `switch`
Then the model runs that option's `run:` command and, on success, settles that option's `settle:` value

### S4 - A plan fixed after its branch was recorded [CHANGED - was: the planner compared values itself]

Given a plan whose frontmatter holds the `work:` and `branch:` keys the branch step wrote
When a fix changes the plan title but not the branch decision and the planner re-runs `plan-path.sh --branch`
Then the script answers `next: kept` and nothing is written or asked

### S5 - The fixer handoff gate [CHANGED - was: `git status` compared by hand]

Given the fixer recorded the tree with `tree-record.sh --save` and then wrote its reproduction test and a temporary instrumentation edit it forgot to revert
When it runs `tree-record.sh --check` with the test path
Then the script answers `STOP:` naming the instrumented file, and the fixer stops naming it

### S6 - Starting the application for e2e [CHANGED - was: `curl` probe and poll loop in prose]

Given the application is down
When the e2e skill runs `app-wait.sh` with 0 seconds, launches the application in the background and runs `app-wait.sh` with 120 seconds
Then it moves on at the first HTTP answer, or gets an `ASK:` with the log tail after 120 seconds

### S7 - Generating and reporting the e2e tests [CHANGED - was: states read, prompts and report written in prose]

Given a handoff with one `file`, one `blocked` and one pending scenario
When the e2e skill runs `qa-ledger.sh` `list`, then `next` after each scenario, then `report`
Then it dispatches the blocked and the pending scenario with the printed blocks, and reports an ASCII table of every scenario with its state

### S8 - An issue-shaped argument [CHANGED - was: classified in prose]

Given issue handling is on and the argument is `#42`
When intent runs `arg-kind.sh issue "#42"`
Then it answers `NEXT: issue | ref: #42` and intent fetches that issue; for `#42 is broken` (`--more`) it answers `NEXT: text`

### S9 - A skipped issue save [CHANGED - was: the reason mapped to a sentence by each skill]

Given no issue form template exists
When the fixer runs `issue-templates.sh` before its save question
Then the output carries `SAY=` and the fixer states that sentence and asks nothing

### S10 - Handing the summary to the planner [CHANGED - was: a `date` stamp and a path built by hand]

Given a confirmed intent summary outside plan mode
When intent runs `summary-path.sh`
Then it writes the summary to the printed path and invokes the planner with it

### S11 - A findings file named in the arguments [CHANGED - was: `Attachment:` lines written by hand]

Given intent is started with the path of a `findings.md` under `.temp/viber/code-auditor/` and a path under `src/`
When it runs `attach-lines.sh` with both paths
Then exactly one `Attachment:` line, for the findings file, reaches the summary

### Edge cases

- `reach.sh` outside a git repository -> the block without its `candidates:` line, no file written, exit 0.
- `tree-record.sh --check` before any `--save` -> `error:` line, exit 2.
- A recorded path changed further before `--check` -> not reported: the record leaves it untouched.
- `app-wait.sh` getting a 404 or 401 -> `NEXT: test`.
- `app-wait.sh` timing out at 540 seconds -> the `ASK:` offers `wait -> 540`.
- `qa-ledger.sh next --after` the last scenario, or every scenario `file` -> `NEXT: commit`.
- `arg-kind.sh issue "owner/repo#4"` -> `NEXT: text`, as `issue-facts.sh` rejects that shape.
- [CHANGED - was: `pr-threads.sh` printed its `ERROR` line] `arg-kind.sh pr` on a first word that is no pull request reference -> `STOP: usage`, and the skill says its usage line.
- `attach-lines.sh` on a path outside `.temp/` or one that does not exist -> no line for it.
- `plan-path.sh --branch` on a plan whose recorded keys differ from every answer -> `next: write` or `next: ask` as before.

## Glossary

- Directive - a script's instruction to the model about what to do next and exactly what to send, never a value for the model to interpret.
- Ledger - the list of a handoff's automatable scenarios with each one's state: `file`, `blocked` or `pending`.

## Acceptance criteria

1. `reach.sh --plan <plan> <target>...` prints the dispatch block of C1 and the planner's reach step sends the lines below its `NEXT: dispatch` line as the impact-mapper prompt, `planner/SKILL.md` holding no prompt template.
2. `plan-index.sh --accepted <n>` prints `threshold:` only past both 30 tasks and `<n>` (C2); the planner passes `--accepted` once the user kept a plan and asks the threshold question again on any `threshold:` line, comparing no count itself; `planner/SKILL.md` ends below 1800 words.
3. Every `option:` line of `plan-path.sh --start` carries `run:` and `settle:` (C3), and the intent and fixer `branching-start` fragments act on an answer by running its `run:` command and settling its `settle:` value, holding no per-answer follow-up rule.
4. Every `option:` line of `plan-path.sh --branch` carries `run:` and `settle:`, and `--branch` answers `next: kept` (C4); the planner `branching` and `branching-fix` fragments act on both, the model still writing the frontmatter keys, and `branching-fix` holds no value comparison of its own.
5. `tree-record.sh` (C5) records and checks the working tree, and the fixer's Record bullet and handoff gate run it.
6. `app-wait.sh` (C6) probes and waits, and the e2e step 4 runs it around a launch that stays the model's background Bash call.
7. `qa-ledger.sh list` and `next` (C7) give the e2e step 5 its scenario list and each e2e-writer dispatch block with its full payload, sent as printed.
8. `qa-ledger.sh report` (C8) prints, drawn in awk, the ASCII table of every scenario, and the e2e step 7 shows it after its sentences, then one line per scenario skipped this pass with its reason; `e2e/SKILL.md` ends below 1213 words.
9. `arg-kind.sh` (C9) classifies one first word as an issue or pull request reference by exactly the shapes `issue-facts.sh` and `pr-threads.sh` accept.
10. The intent `issues-input` fragments, the fixer `issues-report.true.md`, the prototype `issues-input.true.md`, `pr-feedback/SKILL.md` and `pr-feedback-reply/SKILL.md` run `arg-kind.sh` and act on its directive, holding no shape rule; intent's start text ends below 968 words, `prototype/SKILL.md` below 821, `pr-feedback/SKILL.md` below 667 and `pr-feedback-reply/SKILL.md` below 433.
11. `summary-path.sh` (C10) gives intent's hand-off its summary file path, the hand-off running no `date`.
12. `attach-lines.sh` (C11) turns the `.temp/` paths intent and fixer receive into `Attachment:` lines, both skills running it; `fixer/SKILL.md` ends below 1191 words.
13. `issue-templates.sh` and `qa-comment.sh` print a `SAY=` line after each `REASON=` (C12, C13), and the fixer `issues-save`, intent `issues-done`, `issue-create` and implementor `qa` texts state that line, holding no reason to sentence mapping; `issue-create/SKILL.md` ends below 195 words.
14. Unit tests cap the words of `fixer`, `e2e`, `prototype`, `pr-feedback`, `pr-feedback-reply` and `issue-create` `SKILL.md`, intent's start text and `planner/SKILL.md`, each cap below its count before this plan.

## Scope

### File map

- modify - viber/skills/planner/scripts/reach.sh - `--plan` and the impact-mapper dispatch block; its header documents them
- modify - tests/viber/reach.test.ts - the block cases
- modify - viber/skills/planner/SKILL.md - the reach step sends the block; the threshold re-ask through `--accepted`
- modify - tests/viber/impact-mapper-prose.unit.test.ts - the reach step prose it pins
- modify - viber/scripts/plan-index.sh - `--accepted`; its header documents it
- modify - tests/viber/plan-index.test.ts - the `--accepted` cases
- modify - tests/viber/plan-review-prose.unit.test.ts - the threshold sentence it pins
- modify - viber/scripts/run-branch.sh - `run:` and `settle:` fields on every option line, `next: kept`
- modify - viber/scripts/plan-path.sh - the header of both modes, the re-run command built from its own arguments
- modify - tests/viber/plan-path.test.ts - the option lines and `next: kept` cases
- modify - viber/skills/intent/fragments/branching-start.allowed.md, viber/skills/intent/fragments/branching-start.required.md, viber/skills/fixer/fragments/branching-start.allowed.md, viber/skills/fixer/fragments/branching-start.required.md - act on `run:` and `settle:`
- modify - viber/skills/planner/fragments/branching.allowed.md, viber/skills/planner/fragments/branching.required.md, viber/skills/planner/fragments/branching-fix.allowed.md, viber/skills/planner/fragments/branching-fix.required.md - act on `run:`, `settle:` and `next: kept`
- add - viber/skills/fixer/scripts/tree-record.sh - the working tree record and check
- add - tests/viber/tree-record.test.ts - its cases
- modify - viber/skills/fixer/SKILL.md - Record and handoff gate run `tree-record.sh`; `Attachment:` lines through `attach-lines.sh`
- modify - tests/viber/fixer-prose.unit.test.ts - the Record and handoff prose it pins
- modify - viber/docs/files.md - the record file under `.temp/viber/fixer/`
- add - viber/skills/e2e/scripts/app-wait.sh - probe and wait for the application
- add - tests/viber/app-wait.test.ts - its cases
- add - viber/skills/e2e/scripts/qa-ledger.sh - the ledger, the dispatch blocks and the report table
- add - tests/viber/qa-ledger.test.ts - its cases
- add - tests/viber/e2e-steps-prose.unit.test.ts - the step 4, 5 and 7 prose of `e2e/SKILL.md`
- add - tests/viber/branching-prose.unit.test.ts - the option handling prose of the eight branching fragments
- modify - viber/skills/e2e/SKILL.md - steps 4, 5 and 7 run the two scripts
- add - viber/scripts/arg-kind.sh - the issue or pull request reference classifier
- add - tests/viber/arg-kind.test.ts - its cases
- add - viber/skills/intent/scripts/summary-path.sh - the summary file path
- add - tests/viber/summary-path.test.ts - its cases
- modify - viber/skills/intent/parts/done.md - writes the summary to the printed path
- modify - viber/skills/intent/SKILL.md - `allowed-tools`; `Attachment:` lines through `attach-lines.sh`
- modify - tests/viber/intent-prose.unit.test.ts - the prose it pins, the start text cap
- add - viber/scripts/attach-lines.sh - the `Attachment:` lines of `.temp/` paths
- add - tests/viber/attach-lines.test.ts - its cases
- modify - viber/skills/intent/fragments/issues-input.true.md, viber/skills/intent/fragments/issues-input.false.md, viber/skills/fixer/fragments/issues-report.true.md, viber/skills/prototype/fragments/issues-input.true.md - run `arg-kind.sh`
- modify - viber/skills/prototype/SKILL.md, viber/skills/pr-feedback/SKILL.md, viber/skills/pr-feedback-reply/SKILL.md - run `arg-kind.sh` (the pull request skills) and allow it
- modify - viber/scripts/issue-templates.sh, viber/scripts/qa-comment.sh - the `SAY=` line
- modify - tests/viber/issue-templates.test.ts, tests/viber/qa-comment.test.ts - the exact skip outputs
- modify - viber/skills/fixer/fragments/issues-save.true.md, viber/skills/intent/fragments/issues-done.true.md, viber/skills/issue-create/SKILL.md, viber/skills/implementor/fragments/qa.true.md - state `SAY=`
- add - tests/viber/skill-words.unit.test.ts - the caps of the six skills with none
- add - tests/viber/say-prose.unit.test.ts - the `SAY=` prose of the three `issue-templates.sh` consumers
- modify - tests/viber/close-part-prose.unit.test.ts - the `SAY=` bullets of `qa.true.md`
- modify - tests/viber/planner-words.unit.test.ts - the lower planner cap

### Out of scope

- Part 7 - Git, GitHub and the rest: `factory.sh answer`, `approve`, `reject`; `verdict-nudge.sh` reading the `VERDICT:` values from the agent file; `commit.sh` self-check and `commit-selfcheck.sh` removed; `commit-context.sh` footer and `RUN:`; `pr-reply.sh --list`/`--all`; `build_report.mjs --prompts`; `issue-create.sh --template`; the `pr-facts.sh` keys; `bootstrap.sh` `ASK`/`RUN`; `shell-guard.sh` returning the corrected command; `SAY=` for `pr-reply.sh`.
- `viber/skills/pr-create/SKILL.md`: it keeps reporting the `REASON=` of `qa-comment.sh`, which stays; its prose is part 7's.
- The `dispatch:` lines of `plan-index.sh` and `viber/skills/planner/scripts/review-round.sh`, which already carries the planner reviewer payload and keeps dropping every non-`dispatch:` line of `plan-index.sh`, `threshold:` included.
- The intent Explore prompt, the repair coder of `implementor/parts/close.md` and the arbiter close cases of `implementor/SKILL.md`.
- The issue and pull request reference parsing of `issue-facts.sh`, `post-comment.sh`, `qa-comment.sh`, `pr-threads.sh` and `pr-reply.sh`: each keeps its own.
- `viber/skills/fixer/fragments/issues-report.false.md` and `viber/skills/prototype/fragments/issues-input.false.md`: with issue handling off the argument's shape changes nothing they do.
- The `attachments:` frontmatter rule of `planner/SKILL.md`, which turns `Attachment:` lines into entries.
- `viber/agents/impact-mapper.md`, `viber/agents/e2e-writer.md`, `viber/agents/qa-writer.md`, `viber/references/qa-format.md`: their inputs and formats are unchanged.
- `viber/skills/setup/assets/help.html`, `viber/.claude-plugin/plugin.json`, the `README.md` files and `viber/docs/configuration.md`: they name the skills and their roles, unchanged.
- `tests/viber/replay/plan-review/`: a by-hand replay kit no test reads.
- `tests/viber/nudge-prose.unit.test.ts`, `tests/viber/e2e-prose.unit.test.ts`, `tests/viber/test-pyramid-prose.unit.test.ts`, `tests/viber/switch-text.test.ts` and `tests/viber/rule-budget.unit.test.ts`: the text they pin is untouched, and the planner read set only shrinks.
- `tests/portability.unit.test.ts`: its sweep reaches the new scripts and calls by itself.
- Every `CLAUDE.md` node and the section files `viber/scripts/CLAUDE.run-scripts.md` and `viber/scripts/CLAUDE.github.md` naming these scripts: the build's memory step updates them.
- The `.claude/rules/` files citing these skills (`shell-preload-contract.md`, `viber/switch-fragments.md`): their examples stay true; a stale one is the build's rules step's.

## Solution requirements

- Pure refactor: every skill reaches the same outcome as before. A pull request skill whose first word is no reference stops on its existing "No pull request -> say the usage" rule; the e2e report shows every scenario in one table (Answered).
- Each script header documents the options and output lines this plan adds, per `.claude/rules/shell-script-header.md`.
- `<plugin root>` in a printed command is the script's invoked path cut before its own `/scripts/` segment (`plan-path.sh`) or three directories above a skill script, as `task-step.sh` and `review-round.sh` derive it, never a `pwd` result: it keeps the `${CLAUDE_PLUGIN_ROOT}` form the `allowed-tools` prefixes match on Windows.
- Prose of every `SKILL.md`, part and fragment this plan edits follows the `## Body` rules of `viber/skills/skill-designer/SKILL.md`: imperative, one rule per line, no history, no rationale paragraph, and a script's output replaces the prose that described it, never restating its header.
- Every script works on Windows (Git Bash) and macOS: bash 3.2 safe (`${arr[@]+"${arr[@]}"}`), a value reaches awk through `ENVIRON`, no apostrophe inside a single-quoted awk block, no heredoc, no GNU `timeout`, `while read` fed by process substitution.
- Every new script opens on the header and `Contract:` block of `.claude/rules/shell-script-header.md`, ships mode 100755 (`git update-index --add --chmod=+x`), prints on misuse one `error:` line with an empty stdout and exit 2, and is proven by its own `tests/viber/<basename>.test.ts` spawning it in a throwaway directory through `tests/harness/`.
- A skill calling a new script names it in `allowed-tools` spelled as the call (`${CLAUDE_PLUGIN_ROOT}` or `${CLAUDE_SKILL_DIR}`), except `fixer`, which allows bare `Bash`.
- `planner/SKILL.md` sits at its 1800 word cap and inside the 46609 byte planner read set of `rule-budget.unit.test.ts`: no task grows it.

## Tasks

<!-- TASK -->
### T1 - Print the impact-mapper dispatch block from reach.sh
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: none
- Files: viber/skills/planner/scripts/reach.sh, tests/viber/reach.test.ts, viber/skills/planner/SKILL.md, tests/viber/impact-mapper-prose.unit.test.ts
- Delivers: `reach.sh --plan` printing the dispatch block of C1, and a planner reach step that runs it and sends the printed lines.
- Verification: node --test tests/viber/reach.test.ts tests/viber/impact-mapper-prose.unit.test.ts tests/viber/planner-words.unit.test.ts tests/portability.unit.test.ts -> every test passes
- DoD: inside a repository `reach.sh --plan "<plan>" <targets>` prints `candidates:`, `hits:`, then the C1 block with every target in argument order; outside a git repository it prints the block without a `candidates:` line, writes no file and exits 0; a missing or empty `--plan`, no target or a target with an empty path prints one `error:` line, an empty stdout, exit 2; the reach step of `planner/SKILL.md` runs `reach.sh --plan "<absolute path of the plan file>"` and dispatches `viber:impact-mapper` with the lines below the `NEXT: dispatch` line as printed, holding no prompt template and no outside-a-repository fallback, and `impact-mapper-prose.unit.test.ts` pins that wording in place of the template and exit 2 sentences
<!-- /TASK -->

<!-- TASK -->
### T2 - Re-ask the threshold question only past the accepted count
- TDD: required
- Covers: AC2
- Uses: C2
- Depends-on: T1
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/skills/planner/SKILL.md, tests/viber/plan-review-prose.unit.test.ts
- Delivers: `plan-index.sh --accepted <n>` deciding the `threshold:` line, and a planner that passes it and compares no count.
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/plan-review-prose.unit.test.ts tests/viber/planner-words.unit.test.ts tests/viber/rule-budget.unit.test.ts -> every test passes; wc -w viber/skills/planner/SKILL.md -> below 1800
- DoD: a 33 task plan with `--accepted "34"` prints no `threshold:` line and a 36 task plan with it prints `threshold: 36 tasks, past 30`; a 31 task plan without `--accepted` prints the line as today; `--accepted` with a value that is not digits, with no value, or beside `--split`, `--extra`, `--dispatch`, `--slice` or `--final-review` exits 2 with nothing on stdout, and `--accepted` beside `--input` is accepted; step 2 of `planner/SKILL.md` adds `--accepted "<accepted count>"` once the user kept a plan and asks the step 1 question again on every `threshold:` line, a keep recording that line's count as the accepted one, with no count comparison of its own, and `plan-review-prose.unit.test.ts` pins that sentence in place of the comparison one; `planner/SKILL.md` ends below 1800 words
<!-- /TASK -->

<!-- TASK -->
### T3 - Carry run and settle fields on the run branch start options
- TDD: required
- Covers: AC3
- Uses: C3
- Depends-on: none
- Files: viber/scripts/run-branch.sh, viber/scripts/plan-path.sh, tests/viber/plan-path.test.ts, viber/skills/intent/fragments/branching-start.allowed.md, viber/skills/intent/fragments/branching-start.required.md, viber/skills/fixer/fragments/branching-start.allowed.md, viber/skills/fixer/fragments/branching-start.required.md, tests/viber/branching-prose.unit.test.ts
- Delivers: `plan-path.sh --start` option lines carrying `run:` and `settle:`, and the four `branching-start` fragments acting on them.
- Verification: node --test tests/viber/plan-path.test.ts tests/viber/branching-prose.unit.test.ts tests/portability.unit.test.ts -> every test passes
- DoD: every `ask-entry` and `ask-base` option line of `--start` has the C3 shape with the `run:` and `settle:` values C3 gives each answer; the `run:` re-run of an entry key repeats the flags and issue URL of the call with `--entry "<key>"` added, under `--fixer` too, and the `--checkout` command names the option's base, both opening on the `<plugin root>` the solution requirements define; after a `--settled "nothing"` call answered `ask-entry`, with or without an `error:` line, the printed entry re-run, run, settles that entry or asks its base, as the `plan-path.sh` header rules then state, and every other line of `--start` stays as today; the four fragments act on an answer by running its `run:` command when it is not `-` and settling its `settle:` value (`abort` stopping), keeping their `--checkout` exit 5 handling and their `--settled` re-run, with no per-answer follow-up rule left, and `branching-prose.unit.test.ts` pins in each of the four the `run:` and `settle:` handling, one phrase of the kept `--checkout` exit 5 handling and of the `--settled` re-run, and the absence of the `--entry <key>` re-run and `switch` follow-up sentences
<!-- /TASK -->

<!-- TASK -->
### T4 - Answer kept and carry run and settle fields on the plan branch options
- TDD: required
- Covers: AC4
- Uses: C4
- Depends-on: T2, T3
- Files: viber/scripts/run-branch.sh, viber/scripts/plan-path.sh, tests/viber/plan-path.test.ts, viber/skills/planner/fragments/branching.allowed.md, viber/skills/planner/fragments/branching.required.md, viber/skills/planner/fragments/branching-fix.allowed.md, viber/skills/planner/fragments/branching-fix.required.md, tests/viber/branching-prose.unit.test.ts
- Delivers: `plan-path.sh --branch` option lines carrying `run:` and `settle:`, its `next: kept` answer, and the planner fragments acting on both.
- Verification: node --test tests/viber/plan-path.test.ts tests/viber/branching-prose.unit.test.ts tests/viber/plan-review-prose.unit.test.ts tests/portability.unit.test.ts -> every test passes
- DoD: every `ask` and `ask-entry` option line of `--branch` has the C4 shape with the values C4 gives each answer, the `ask-entry` re-run repeating the plan path, `--work` and `--name` of the call with `--entry "<key>"` added; a plan whose frontmatter holds a `branch:` key and whose decision writes the same `work:` and `branch:` values, or offers them as an `ask` option, gets `next: kept` with the recorded `work:` and `branch:` lines; a plan with no `branch:` key, or recorded values matching no answer, gets today's answer; the `branching` fragments act on `settle: write` by writing the option's work and branch into the frontmatter keys, on `settle: stop` by ending the planner as today, on a `run:` command by running it and acting on its report, and on `next: kept` by leaving the keys as they stand and showing nothing; the `branching-fix` fragments re-run the last `--branch` command after a fix that changes the title, issue reference or a `Repro:` line and act on it as the branch step does, with no comparison rule of their own, still opening on "After a `NEXT: fix` fix"; `branching-prose.unit.test.ts` pins in each `branching` fragment the `settle: write`, `settle: stop`, `run:` and `next: kept` handling, and in each `branching-fix` fragment the `next: kept` handling and the absence of the "only when its values differ" and "only when its `option:` lines differ" rules
<!-- /TASK -->

<!-- TASK -->
### T5 - Record and check the fixer working tree with a script
- TDD: required
- Covers: AC5
- Uses: C5
- Depends-on: none
- Files: viber/skills/fixer/scripts/tree-record.sh, tests/viber/tree-record.test.ts, viber/skills/fixer/SKILL.md, tests/viber/fixer-prose.unit.test.ts, viber/docs/files.md
- Delivers: `tree-record.sh --save` and `--check` per C5, the fixer's Record bullet and handoff gate running them, and the record file listed among the host writes.
- Verification: node --test tests/viber/tree-record.test.ts tests/viber/fixer-prose.unit.test.ts tests/portability.unit.test.ts -> every test passes; git ls-files -s viber/skills/fixer/scripts/tree-record.sh -> mode 100755; grep -c "tree-record" viber/docs/files.md viber/skills/fixer/scripts/tree-record.sh -> both counts at least 1
- DoD: `--save` in a repository with a modified, a staged and an untracked file writes the record file with those three paths, ignored files left out, and prints `NEXT: trace` and one `recorded:` line each; `--check "<test path>"` after only that test was added prints `NEXT: handoff`, and after another file changed prints the `STOP:` line and one `path:` line for it, a recorded path changed further never listed; `--check` before any `--save`, an unknown mode or an extra argument prints one `error:` line, an empty stdout, exit 2; the fixer's `- **Record**` bullet runs `"${CLAUDE_SKILL_DIR}/scripts/tree-record.sh" --save` before the first edit, its `recorded:` paths being the record the `- **Instrument**` bullet keeps out, and the `## Handoff` gate runs `"${CLAUDE_SKILL_DIR}/scripts/tree-record.sh" --check "<reproduction test path>"`, stops naming each `path:` on `STOP:` and invokes `viber:planner` on `NEXT: handoff`, with `fixer-prose.unit.test.ts` pinning both calls in place of the `git status` phrases; `viber/docs/files.md` names the record file under `.temp/viber/fixer/`
<!-- /TASK -->

<!-- TASK -->
### T6 - Wait for the e2e application with a script
- TDD: required
- Covers: AC6
- Uses: C6
- Depends-on: none
- Files: viber/skills/e2e/scripts/app-wait.sh, tests/viber/app-wait.test.ts, viber/skills/e2e/SKILL.md, tests/viber/e2e-steps-prose.unit.test.ts
- Delivers: `app-wait.sh` per C6 and an e2e step 4 that runs it around the model's own launch.
- Verification: node --test tests/viber/app-wait.test.ts tests/viber/e2e-steps-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts tests/portability.unit.test.ts -> every test passes; git ls-files -s viber/skills/e2e/scripts/app-wait.sh -> mode 100755
- DoD: against a stub `curl` on `PATH` answering `200`, `404` or `401`, the script prints `NEXT: test` with that code; answering `000` with 0 seconds it prints `NEXT: launch` and the log path; answering `000` past the given seconds it prints the `ASK:` line with the doubled wait capped at 540 and the last 10 lines of the launch log as `log:` lines, none when the log is missing; no `curl` on `PATH`, seconds that are not digits or past 540, or an argument count other than two prints one `error:` line, an empty stdout, exit 2; step 4 of `e2e/SKILL.md` runs `app-wait.sh "<base-url>" "0"`, on `NEXT: launch` runs the launch command as one background Bash call writing to the printed log path and then `app-wait.sh "<base-url>" "120"` with a Bash timeout of 600000 milliseconds, on `ASK:` asks wait or abort quoting the `log:` lines and re-runs with the wait value, and keeps the rule that the launch command, config and ports are never edited, while its bundled-script line covers its `${CLAUDE_SKILL_DIR}/scripts/` calls too and `allowed-tools` lists `Bash(${CLAUDE_SKILL_DIR}/scripts/app-wait.sh:*)`; `e2e-steps-prose.unit.test.ts` pins the two `app-wait.sh` calls, the 600000 timeout, the `ASK:` handling, the never-edit rule, the bundled-script line naming `${CLAUDE_SKILL_DIR}/scripts/`, the `allowed-tools` entry and the absence of the `curl` probe sentence
<!-- /TASK -->

<!-- TASK -->
### T7 - Give the e2e loop its scenario list and dispatch blocks
- TDD: required
- Covers: AC7
- Uses: C7
- Depends-on: T6
- Files: viber/skills/e2e/scripts/qa-ledger.sh, tests/viber/qa-ledger.test.ts, viber/skills/e2e/SKILL.md, tests/viber/e2e-steps-prose.unit.test.ts
- Delivers: `qa-ledger.sh list` and `next` per C7, and an e2e step 5 creating its tasks from `list` and dispatching each block `next` prints.
- Verification: node --test tests/viber/qa-ledger.test.ts tests/viber/e2e-steps-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts tests/portability.unit.test.ts -> every test passes; git ls-files -s viber/skills/e2e/scripts/qa-ledger.sh -> mode 100755
- DoD: on a handoff with UI and API scenarios, a `## Not automatable` entry and an `## Automation` section holding a `file` and a `blocked` line, `list` prints one `id:` line per automatable scenario in file order with its state and title, none for the not automatable one, then the `counts:` line; `next` prints the C7 block for the first blocked or pending scenario, the one after `--after` when given, and `NEXT: commit` when none is left; a missing handoff, an unknown mode or option, a missing `--spec-dir`, `--base-url` or `--accounts`, a missing option value or an `--after` naming no listed scenario prints one `error:` line, an empty stdout, exit 2; step 5 of `e2e/SKILL.md` runs `list` for its task list, the `file` ones completed at creation, then `next` with the spec directory, base URL and accounts value, `--after` the scenario just handled, and dispatches `viber:e2e-writer` with the lines below `NEXT: dispatch` as printed, resending the same block on its one retry, with no state reading rule and no labelled line list of its own; `allowed-tools` lists `Bash(${CLAUDE_SKILL_DIR}/scripts/qa-ledger.sh:*)`; `e2e-steps-prose.unit.test.ts` pins the `list` and `next` calls, the as-printed dispatch, the `allowed-tools` entry and the absence of the `## Automation` state reading sentence and the labelled line list
<!-- /TASK -->

<!-- TASK -->
### T8 - Report the e2e pass as an ASCII table
- TDD: required
- Covers: AC8
- Uses: C7, C8
- Depends-on: T7
- Files: viber/skills/e2e/scripts/qa-ledger.sh, tests/viber/qa-ledger.test.ts, viber/skills/e2e/SKILL.md, tests/viber/e2e-steps-prose.unit.test.ts
- Delivers: `qa-ledger.sh report` per C8 and an e2e step 7 showing its table.
- Verification: node --test tests/viber/qa-ledger.test.ts tests/viber/e2e-steps-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts -> every test passes; wc -w viber/skills/e2e/SKILL.md -> below 1213
- DoD: `report` prints the C8 table, drawn by one awk program, with one row per listed scenario in file order, columns as wide as their widest cell, a blocked reason past 60 characters cut and ending in `...`, then the `counts:` line; step 7 of `e2e/SKILL.md` keeps its at most five sentences, then shows the `report` table in a code block, then one `skipped - <reason>` line per scenario the user skipped this pass, holding no per scenario line rule of its own, and `e2e-steps-prose.unit.test.ts` pins the `report` call, the code block, the `skipped - <reason>` line and the absence of the `file <path>` and `blocked - <reason>` line rule; `e2e/SKILL.md` ends below 1213 words
<!-- /TASK -->

<!-- TASK -->
### T9 - Classify an issue or pull request argument with a script
- TDD: required
- Covers: AC9
- Uses: C9
- Depends-on: none
- Files: viber/scripts/arg-kind.sh, tests/viber/arg-kind.test.ts
- Delivers: `arg-kind.sh` per C9.
- Verification: node --test tests/viber/arg-kind.test.ts tests/portability.unit.test.ts -> every test passes; git ls-files -s viber/scripts/arg-kind.sh -> mode 100755
- DoD: `issue` answers `NEXT: issue` with the word as `ref:` for `42`, `#42`, an issues URL and an issues URL with a `#...` or `?...` suffix, and `NEXT: text` for each shape `issue-facts.test.ts` rejects, `owner/repo#4`, an empty word, a pull URL and any word with `--more`; `pr` answers `NEXT: pr` for `7`, `#7` and a pull URL with or without a suffix, and `STOP: usage` for each shape `pr-threads.test.ts` rejects, an empty word and an issues URL; an unknown kind, no word, `--more` under `pr` or any further argument prints one `error:` line, an empty stdout, exit 2
<!-- /TASK -->

<!-- TASK -->
### T10 - Name the intent summary file with a script
- TDD: required
- Covers: AC11
- Uses: C10
- Depends-on: none
- Files: viber/skills/intent/scripts/summary-path.sh, tests/viber/summary-path.test.ts, viber/skills/intent/parts/done.md, viber/skills/intent/SKILL.md, tests/viber/intent-prose.unit.test.ts
- Delivers: `summary-path.sh` per C10 and an intent hand-off writing the summary to its path.
- Verification: node --test tests/viber/summary-path.test.ts tests/viber/intent-prose.unit.test.ts tests/portability.unit.test.ts -> every test passes; git ls-files -s viber/skills/intent/scripts/summary-path.sh -> mode 100755
- DoD: in a repository the script prints the C10 line with an absolute forward slash path under `.temp/viber/intent/`, a stamp of the shape `YYYY-MM-DD-HH-MM-SS`, and creates that directory without writing the file; run from a subdirectory it names the repository root, and outside a repository the cwd; any argument prints one `error:` line, an empty stdout, exit 2; the outside plan mode bullet of `parts/done.md` runs `summary-path.sh`, writes the content to its `path:` and invokes `viber:planner` with that absolute path as its only argument; `intent/SKILL.md` allows `Bash(${CLAUDE_SKILL_DIR}/scripts/summary-path.sh:*)`, keeping `Bash(date:*)` for the issue save of `viber/references/issue-save.md`; `intent-prose.unit.test.ts` pins the script call in place of the stamp and path pattern, and both `allowed-tools` entries
<!-- /TASK -->

<!-- TASK -->
### T11 - Write the Attachment lines with a script
- TDD: required
- Covers: AC12
- Uses: C11
- Depends-on: T5, T10
- Files: viber/scripts/attach-lines.sh, tests/viber/attach-lines.test.ts, viber/skills/intent/SKILL.md, viber/skills/fixer/SKILL.md, tests/viber/intent-prose.unit.test.ts, tests/viber/fixer-prose.unit.test.ts
- Delivers: `attach-lines.sh` per C11, and intent and fixer running it for the `.temp/` paths their input names.
- Verification: node --test tests/viber/attach-lines.test.ts tests/viber/intent-prose.unit.test.ts tests/viber/fixer-prose.unit.test.ts tests/portability.unit.test.ts -> every test passes; git ls-files -s viber/scripts/attach-lines.sh -> mode 100755; wc -w viber/skills/fixer/SKILL.md -> below 1191
- DoD: the script prints one `Attachment:` line per existing file or directory under the repository's `.temp/`, absolute with forward slashes, in argument order, a repeat once, a relative path resolved from the cwd, and nothing for a path outside `.temp/` or one that does not exist; no argument or outside a git repository prints one `error:` line, an empty stdout, exit 2; `intent/SKILL.md` runs `attach-lines.sh` with every path the arguments name and carries its lines unless the conversation already does, allowing `Bash(${CLAUDE_PLUGIN_ROOT}/scripts/attach-lines.sh:*)`; the `- **Attachments**` bullet of `fixer/SKILL.md` takes its lines from `attach-lines.sh` run on the paths the input names, and both skills make no call when the input names no path and write no `Attachment:` line on an exit 2; `intent-prose.unit.test.ts` and `fixer-prose.unit.test.ts` pin each skill's `attach-lines.sh` call, its no-path and exit 2 rule, and in intent the `allowed-tools` entry, in place of the path rule it replaces; `fixer/SKILL.md` ends below 1191 words
<!-- /TASK -->

<!-- TASK -->
### T12 - Classify the argument at runtime in five skills
- TDD: none
- Covers: AC10
- Uses: C9
- Depends-on: T9, T11
- Files: viber/skills/intent/SKILL.md, viber/skills/intent/fragments/issues-input.true.md, viber/skills/intent/fragments/issues-input.false.md, viber/skills/fixer/fragments/issues-report.true.md, viber/skills/prototype/SKILL.md, viber/skills/prototype/fragments/issues-input.true.md, viber/skills/pr-feedback/SKILL.md, viber/skills/pr-feedback-reply/SKILL.md, tests/viber/intent-prose.unit.test.ts
- Delivers: the issue and pull request argument check of five skills made by `arg-kind.sh`.
- Verification: node --test tests/viber/intent-prose.unit.test.ts tests/portability.unit.test.ts -> every test passes; grep -c "arg-kind.sh" viber/scripts/arg-kind.sh viber/skills/intent/fragments/issues-input.true.md viber/skills/intent/fragments/issues-input.false.md viber/skills/fixer/fragments/issues-report.true.md viber/skills/prototype/fragments/issues-input.true.md viber/skills/pr-feedback/SKILL.md viber/skills/pr-feedback-reply/SKILL.md -> every count at least 1; grep -nE "token that is a number|or the pull request URL\)" viber/skills/intent/fragments/issues-input.true.md viber/skills/intent/fragments/issues-input.false.md viber/skills/fixer/fragments/issues-report.true.md viber/skills/prototype/fragments/issues-input.true.md viber/skills/pr-feedback/SKILL.md viber/skills/pr-feedback-reply/SKILL.md -> no line; wc -w viber/skills/intent/SKILL.md viber/skills/intent/fragments/issues-input.false.md viber/skills/prototype/SKILL.md viber/skills/pr-feedback/SKILL.md viber/skills/pr-feedback-reply/SKILL.md -> intent pair below 968 together, the others below 821, 667 and 433
- DoD: the intent and prototype `issues-input.true.md` and the fixer `issues-report.true.md` run `"${CLAUDE_PLUGIN_ROOT}/scripts/arg-kind.sh" issue "<first word>"`, adding `--more` when other words follow, run `issue-facts.sh` with the `ref:` on `NEXT: issue` and treat the argument as their plain input on `NEXT: text`, their exit handling of `issue-facts.sh` kept, with no shape rule left; `issues-input.false.md` runs the same call and says in one line that issue handling is off on `NEXT: issue`, keeping the phrase "write no issue body and no issue comment"; `pr-feedback/SKILL.md` and `pr-feedback-reply/SKILL.md` run `arg-kind.sh pr "<first word>"`, pass the `ref:` of `NEXT: pr` to `pr-threads.sh` and say their usage line on `STOP: usage`, with the `(<N>, #<N> or the pull request URL)` shape list gone and `pr-feedback` keeping its `--reply` rule ahead of the call; `intent-prose.unit.test.ts` pins the `arg-kind.sh` call of both intent `issues-input` fragments; `intent`, `prototype`, `pr-feedback` and `pr-feedback-reply` allow `Bash(${CLAUDE_PLUGIN_ROOT}/scripts/arg-kind.sh:*)`; intent's start text (`SKILL.md` plus `issues-input.false.md`) ends below 968 words, `prototype/SKILL.md` below 821 (its cut made by rewording per the skill-designer Body rules, never by dropping a rule), `pr-feedback/SKILL.md` below 667 and `pr-feedback-reply/SKILL.md` below 433
<!-- /TASK -->

<!-- TASK -->
### T13 - Say why an issue cannot be saved from issue-templates.sh
- TDD: required
- Covers: AC13
- Uses: C12
- Depends-on: none
- Files: viber/scripts/issue-templates.sh, tests/viber/issue-templates.test.ts, viber/skills/fixer/fragments/issues-save.true.md, viber/skills/intent/fragments/issues-done.true.md, viber/skills/issue-create/SKILL.md, tests/viber/say-prose.unit.test.ts
- Delivers: the `SAY=` line of `issue-templates.sh` and three consumers stating it.
- Verification: node --test tests/viber/issue-templates.test.ts tests/viber/say-prose.unit.test.ts -> every test passes; wc -w viber/skills/issue-create/SKILL.md -> below 195
- DoD: each `STATUS=skip` output of `issue-templates.sh` is exactly `STATUS=skip`, its `REASON=` line and the C12 `SAY=` line of that reason; the fixer `issues-save.true.md`, the no issue bullet of intent `issues-done.true.md` and `issue-create/SKILL.md` state the `SAY=` line in one line in the conversation's language, holding no reason list, and `say-prose.unit.test.ts` pins in each of the three the `SAY=` sentence and the absence of the `REASON=no-templates` list; `issue-create/SKILL.md` ends below 195 words
<!-- /TASK -->

<!-- TASK -->
### T14 - Say why a QA comment was skipped from qa-comment.sh
- TDD: required
- Covers: AC13
- Uses: C13
- Depends-on: none
- Files: viber/scripts/qa-comment.sh, tests/viber/qa-comment.test.ts, viber/skills/implementor/fragments/qa.true.md, tests/viber/close-part-prose.unit.test.ts
- Delivers: the `SAY=` line of `qa-comment.sh` and the implementor `qa` fragment stating it.
- Verification: node --test tests/viber/qa-comment.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/implementor-words.unit.test.ts -> every test passes
- DoD: each `STATUS=skip` output of `qa-comment.sh` is exactly `STATUS=skip`, its `REASON=` line and the C13 `SAY=` line of that reason; `qa.true.md` carries the `SAY=` line to the final summary on `REASON=no-gh` or `REASON=no-repo` and nothing on `REASON=no-pr` or `REASON=exists`, its opening sentence unchanged, and `close-part-prose.unit.test.ts` pins both `SAY=` bullets
<!-- /TASK -->

<!-- TASK -->
### T15 - Cap the words of every skill this plan touched
- TDD: none
- Covers: AC14
- Uses: none
- Depends-on: T2, T8, T12, T13
- Files: tests/viber/skill-words.unit.test.ts, tests/viber/intent-prose.unit.test.ts, tests/viber/planner-words.unit.test.ts
- Delivers: unit tests capping the eight word counts, each below its count before this plan.
- Verification: node --test tests/viber/skill-words.unit.test.ts tests/viber/intent-prose.unit.test.ts tests/viber/planner-words.unit.test.ts -> every test passes
- DoD: `skill-words.unit.test.ts` counts words by whitespace split and caps `fixer`, `e2e`, `prototype`, `pr-feedback`, `pr-feedback-reply` and `issue-create` `SKILL.md` each at its count when the test is written, asserting each cap below 1191, 1213, 821, 667, 433 and 195; `intent-prose.unit.test.ts` caps the start text at its count when the test is written, asserted below 968; `planner-words.unit.test.ts` caps `planner/SKILL.md` at its count when the test is written, asserted below 1800
<!-- /TASK -->

## Contracts

### C1 - reach.sh dispatch block

File: viber/skills/planner/scripts/reach.sh

```
reach.sh --plan <plan path> <target> [<target>]...
inside a repository:
  candidates: <absolute path of the candidates file, forward slashes>
  hits: <n> lines in <m> files
  NEXT: dispatch | agent: viber:impact-mapper
  plan: <plan path as given>
  candidates: <the same absolute path>
  targets:
  <each target as given, one per line, in argument order>
outside a git repository (no file written, exit 0):
  NEXT: dispatch | agent: viber:impact-mapper
  plan: <plan path as given>
  targets:
  <each target as given, one per line, in argument order>
prompt of the dispatch: every line below the NEXT: line, as printed
exit 2, one error: line, empty stdout: --plan missing or empty, no target, a target with an empty path
```

### C2 - plan-index.sh accepted count

File: viber/scripts/plan-index.sh

```
plan-index.sh <plan> [--input <summary file>] [--accepted <n>]
<n>: digits only
threshold: <count> tasks, past 30    printed only when count > 30 and, with --accepted, count > <n>
exit 2: --accepted with no value or a value that is not digits, or beside --split, --extra, --dispatch, --slice or --final-review
```

### C3 - start option line

File: viber/scripts/run-branch.sh, viber/scripts/plan-path.sh

```
option: <answer> | <branch or -> | run: <command or -> | settle: <value or -> | <effect>
ask-entry:
  <entry key>  run: "<plugin root>/scripts/plan-path.sh" --start <the flags of this call> --entry "<key>"[ "<issue URL>"]   settle: -
  no-branch    run: -   settle: no-branch
  abort        run: -   settle: abort
ask-base:
  switch       run: "<plugin root>/scripts/plan-path.sh" --checkout "<base>"   settle: <the checking: entry key>
  stay         run: -   settle: <the checking: entry key>
  current      run: -   settle: current
  abort        run: -   settle: abort
<plugin root>: the absolute directory above the scripts directory holding plan-path.sh, forward slashes
<the flags of this call>: --fixer, --pr, --roadmap and --settled "<value>" as the call gave them, --entry left out
--settled nothing with --entry <key>: rule 6 for that entry, under rule 1 and rule 2 alike (today both re-ask the entry question)
```

### C4 - plan branch option line and kept

File: viber/scripts/run-branch.sh, viber/scripts/plan-path.sh

```
option: <answer> | <work key or -> | <branch, none or -> | run: <command or -> | settle: <write, stop or -> | <effect>
ask:
  continue, create, stay, no-branch   run: -   settle: write
  stop                                run: -   settle: stop
ask-entry:
  <entry key>   run: "<plugin root>/scripts/plan-path.sh" --branch "<plan>" [--work "<value>"] [--name "<value>"] --entry "<key>"   settle: -
next: kept
work: <the recorded work: value, - when the key is absent>
branch: <the recorded branch: value>
  answered in place of next: write or next: ask when the plan frontmatter holds a branch: key and
  the write decision carries the same work and branch, or one ask option carries them
```

### C5 - tree-record.sh

File: viber/skills/fixer/scripts/tree-record.sh

```
tree-record.sh --save
  writes <repository root>/.temp/viber/fixer/tree-record: one repo-relative path per line,
  every path git status --porcelain -z -uall reports staged, unstaged or untracked (ignored ones and
  every path under .temp/ left out, an untracked directory listed file by file), a rename as its new path
  NEXT: trace
  recorded: <repo-relative path>      one per recorded path
tree-record.sh --check [<reproduction test path>]
  paths the same git status reports now, under the same rules, that are neither recorded nor the given path (a leading ./ dropped once):
  none -> NEXT: handoff
  some -> STOP: changed since the record - revert before the handoff
          path: <repo-relative path>  one per such path
exit 2, one error: line, empty stdout: no mode or an unknown one, --save with an argument,
  --check with more than one argument or with no record file, outside a git repository
```

### C6 - app-wait.sh

File: viber/skills/e2e/scripts/app-wait.sh

```
app-wait.sh <base-url> <seconds>
<seconds>: 0 to 540; 0 probes once, otherwise every 2 s until an answer or <seconds> pass
probe: curl -s -o /dev/null -w "%{http_code}" --max-time 5 "<base-url>"; any code but 000 answers
answer:                     NEXT: test | code: <http code>
no answer, <seconds> 0:     NEXT: launch | log: <root>/.temp/viber/e2e/launch.log
                            the directory created; <root>: the repository root, the cwd outside a repository,
                            absolute, forward slashes, a Windows drive as C:/
no answer past <seconds>:   ASK: no answer after <seconds> s | wait -> <2 x seconds, at most 540> | abort -> abort
                            log: <line>    the last 10 lines of that log, none when it is missing or empty
exit 2, one error: line, empty stdout: an argument count other than two, <seconds> not digits or past 540,
  curl not on PATH ("error: curl not found - install curl, which macOS and Git for Windows ship")
```

### C7 - qa-ledger.sh list and next

File: viber/skills/e2e/scripts/qa-ledger.sh

```
qa-ledger.sh <handoff> list
  id: QA-<nn> | file | <title>
  id: QA-<nn> | blocked | <title>
  id: QA-<nn> | pending | <title>
    one per "### QA-<nn> <title>" heading under ## UI scenarios and ## API scenarios, in file order;
    none for an ID named under ## Not automatable; state from its ## Automation line, pending without one
  counts: <f> file, <b> blocked, <p> pending
qa-ledger.sh <handoff> next --spec-dir <dir> --base-url <url> --accounts <value> [--after QA-<nn>]
  the first listed ID, after the --after one when given, whose state is blocked or pending:
  NEXT: dispatch | id: QA-<nn> | agent: viber:e2e-writer
  handoff: <absolute handoff path, forward slashes>
  id: QA-<nn>
  spec-dir: <dir as given>
  base-url: <url as given>
  accounts: <value as given>
  refs: <plugin root, three directories above the script>/references
  none left: NEXT: commit
  prompt of the dispatch: the lines below the NEXT: line, as printed
exit 2, one error: line, empty stdout: a missing handoff, an unknown mode or option, a missing --spec-dir,
  --base-url or --accounts, a missing option value, an --after naming no listed ID
```

### C8 - qa-ledger.sh report

File: viber/skills/e2e/scripts/qa-ledger.sh

```
qa-ledger.sh <handoff> report
+---------+---------+---------------------------+
| ID      | State   | Detail                    |
+---------+---------+---------------------------+
| QA-<nn> | file    | <repo-relative spec path> |
| QA-<nn> | blocked | <reason>                  |
| QA-<nn> | pending | -                         |
+---------+---------+---------------------------+
counts: <f> file, <b> blocked, <p> pending
one row per listed ID in list order; each column as wide as its widest cell plus one space each side,
cells left-aligned; a reason past 60 characters cut to 57 and ending in ...
```

### C9 - arg-kind.sh

File: viber/scripts/arg-kind.sh

```
arg-kind.sh issue <first word> [--more]
  NEXT: issue | ref: <first word as given>    <N>, #<N> or https://<host>/<owner>/<repo>/issues/<N>
                                               with an optional #... or ?... suffix, and no --more
  NEXT: text                                   anything else, an empty word included
arg-kind.sh pr <first word>
  NEXT: pr | ref: <first word as given>       <N>, #<N> or https://<host>/<owner>/<repo>/pull/<N>
                                               with an optional #... or ?... suffix
  STOP: usage                                  anything else, an empty word included
accepted shapes: exactly those issue-facts.sh (issue) and pr-threads.sh (pr) accept, a URL behind one leading # included
exit 2, one error: line, empty stdout: an unknown kind, no word, --more under pr, any further argument
```

### C10 - summary-path.sh

File: viber/skills/intent/scripts/summary-path.sh

```
summary-path.sh
  NEXT: write | path: <root>/.temp/viber/intent/summary-<YYYY-MM-DD-HH-MM-SS>.md
  <root>: the repository root, the cwd outside a repository; absolute, forward slashes, a Windows drive as C:/
  creates the directory, writes no file
exit 2, one error: line, empty stdout: any argument
```

### C11 - attach-lines.sh

File: viber/scripts/attach-lines.sh

```
attach-lines.sh <path> [<path>]...
  Attachment: <absolute path, forward slashes, a Windows drive as C:/>
    one per argument naming an existing file or directory under <repository root>/.temp/,
    in argument order, a repeat printed once; a relative path resolves against the cwd
  nothing for any other argument
exit 2, one error: line, empty stdout: no argument, outside a git repository
```

### C12 - SAY line of an issue-templates.sh skip

File: viber/scripts/issue-templates.sh

```
STATUS=skip
REASON=<reason>
SAY=<sentence>
  no-templates  SAY=no issue form template in .github/ISSUE_TEMPLATE
  no-gh         SAY=the GitHub command line tool gh is not installed
  no-repo       SAY=no GitHub repository is reachable from here
```

### C13 - SAY line of a qa-comment.sh skip

File: viber/scripts/qa-comment.sh

```
STATUS=skip
REASON=<reason>
SAY=<sentence>
  no-repo       SAY=not inside a git repository
  no-gh         SAY=the GitHub command line tool gh is not installed
  no-pr         SAY=no issue and no open pull request to post the QA document on
  exists        SAY=the QA document of this run is already posted
```

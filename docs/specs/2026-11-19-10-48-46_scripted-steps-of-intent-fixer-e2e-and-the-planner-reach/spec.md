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

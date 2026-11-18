---
source: C:/Projects/viber/docs/_specs/2026-11-18-16-31-27_scripted-close-of-the-implementor/plan.md
planned: C:/Users/dario/.claude-p2p2/plans/floofy-humming-hummingbird.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Scripted close of the implementor

## Goal

The implementor's close (the run clock and the token report, the leftovers of `closeout`, the repair commits, the final-review slices, the task profile, the test-runner's change set and suite wait, the extension steps and kept QA documents) moves from prose a model reads and applies by hand into scripts that print the answer. The skill, its close part and the agents it dispatches keep only the rule to run the script and act on its output, so a build spends fewer tokens and depends less on a model applying long rules correctly.

## Problem

`implementor/parts/close.md`, `closeout`, `test-runner` and `final-reviewer` hold rule tables a model re-reads and applies at every close: the leftovers classification of `closeout` (about 20 rules), the routing of each repair file to its task, the slicing of the final review, the git commands that select the change, the background run and its wait, the profile of step 3, the splitting of `build.extensions`. Every read costs the user's usage limits and every hand-applied rule is a chance to commit a file under the wrong task, mislabel a leftover or cut a slice wrong.

## Current behaviour

`run-clock.sh` prints the start mark as a preload and the elapsed time at the close; `run-tokens.sh` prints the token report. `closeout` runs `plan-index.sh`, classifies every `skipped:`, `dirty:` and `orphan:` path itself, greps the build notes, calls `commit-task.sh --outside` and writes the leftovers section. The close splits every repair coder's `FILES:` between per-task fix-number commits and one `--repair` commit. The final-review fragment cuts the slices and composes each dispatch; `final-reviewer` finds its slice's commits and files with git itself. Step 3 derives each task's tier, review and subject from the index columns. `test-runner` composes the git commands that select the change and the background run and wait. The extensions fragment splits the `build.extensions:` line and skips closed names; `qa-writer` checks whether QA documents already exist.

### Must not change

- The text of every line `outcome.md` holds today for the same build: the summary, the leftovers section (one `<path>: <reason> - committed <sha>` or `<path>: <reason> - left uncommitted` line per path, each reason worded as today, the heading in the summary's language) and the closing `Drift:` line.
- Every `elapsed:`, `started:`, `tokens:` and `rounds:` line `run-clock.sh` and `run-tokens.sh` print today, for the same input.
- Every commit the close makes today, its subject, its files and its `status.md` entry: a repair file a task's `Files` lists lands in that task's fix-number commit, any other in the `--repair` commit.
- The tier, review tier and task-list subject step 3 gives each task, and every labelled line a `final-reviewer` slice dispatch carries today (the dispatch adds `scope:`).
- Which integration tests `test-runner` selects, and that the suite runs exactly once.
- The order, the members and the skipping of the extension steps, and that an existing `qa.md` or `qa.e2e.md` is never overwritten and is committed as today.
- `plan-index.sh`'s index lines, `--extra` and `--dispatch`; `commit-task.sh`'s other forms; `task-step.sh`'s directives.

## Roadmap

Part 2 of 7 - Implementor close

1. Directive convention and the implementor task loop (built)
2. Implementor close (this plan)
3. Code auditor
   - `critic` and `scout` get Write and an `out:` path; `synthesize.sh` points at `MERGE?` pairs and the model decides; scripts in POSIX sh and awk; the hunter pool stays with the model.
   - `map-signals.sh`, `hunt-return.sh`, `frame.sh`, `keep-units.sh`, the trailing closing-tag strip in scripts.
4. Memory and rules
   - Untracked `CLAUDE.md` nodes visible only to `memory-map.sh --reconcile`; `memory-map.sh --targets` and `shape:` lines in the auditor brief, the auditor still judging the title sentences.
   - A rule matching nothing is `GONE` without an auditor, its removal still confirmed by the user; `rules-map.sh` `misplaced:`, `--brief`, `--confirm`.
5. Planner validation and review
   - Every mechanical reviewer check moves into `plan-index.sh`, the input-dependent ones (`Attachment:`, `Root cause`, `Repro:`) through `--input <summary file>` and staying with the reviewer when the input is text; every error as a `FIX:` or `SPLIT:` directive, all errors in one run; the missing unnumbered-scenario check added.
   - Reviewers get Write and `out:`; `review-round.sh` aggregates verdicts (`DENIED` over `FAIL` over `PASS`), retries a member without a verdict, composes the round 2+ prompts and answers `NEXT: fix`, `NEXT: redispatch <members>` or `NEXT: exit-plan`; every round after a fix reviews the whole set, `plan-gate.sh` unchanged.
6. Intent, fixer, e2e and the rest
   - Full payload on the `dispatch:` lines; `reach.sh` prints the impact-mapper prompt; `run:` and `settle:` fields on the branch options; `--branch` answers `next: kept`, the model editing the frontmatter.
   - `tree-record.sh --save`/`--check` in `fixer`; `app-wait.sh` only waits, the launch staying with the model; `qa-ledger.sh` with an awk ASCII table; the issue or PR argument classifier called at runtime; `summary-path.sh`, `attach-lines.sh`, `threshold:` only past the accepted count, `SAY=` for `STATUS=skip`.
7. Git, GitHub and the rest
   - `factory.sh answer`, `approve`, `reject` with `MISMATCH` falling back to keys; `verdict-nudge.sh` reads the `VERDICT:` values from the agent file; `commit.sh` runs its own self-check and prints the result line, `commit-selfcheck.sh` removed; `commit-context.sh` gives the ready footer and `RUN:`.
   - `pr-reply.sh --list`/`--all` under one confirmation, never retrying; `build_report.mjs --prompts` writes prompt files under `.temp/`; `issue-create.sh --template`; `pr-facts.sh` `TITLE=`, `TITLE_TEMPLATE=`, `FOOTER=`, `BODY_FILE=`, `SAY=`, `ASK` with `RERUN=`; `bootstrap.sh` `ASK`/`RUN`; `shell-guard.sh` returns the corrected command.
   - Every part: the directive format of part 1, a pure refactor, a word cap on the skill it touches.

## Behaviour

### S1 - One script gives the clock and the token report [CHANGED - was: `run-clock.sh` and `run-tokens.sh`, two calls]

Given a build that started under the mark `started: 1750000000`
When the close runs `run-summary.sh "1750000000" "<dir>"`
Then it prints the `elapsed:` line `run-clock.sh` printed, then every line `run-tokens.sh` printed for that run directory

### S2 - A repair commit routes its files itself [CHANGED - was: the model split the files between fix-number calls and one `--repair` call]

Given a repair round 2 whose coder changed `src/a.ts` (listed by T3) and `lib/x.ts` (listed by no task)
When the close runs `commit-task.sh --repair "<plan>" "2" "src/a.ts" "lib/x.ts"`
Then `src/a.ts` lands in the commit `T3(2) - <title of T3>` and `lib/x.ts` in `fix(viber): post-test repair (round 2)`

### S3 - The leftovers section is written by the script [CHANGED - was: `closeout` classified every path and wrote the section]

Given a run where T4 was skipped with `src/b.ts` dirty, and `lib/y.ts` changed and named by no build note
When `closeout` has written `outcome.md` with the summary and its heading line, and runs `commit-task.sh --leftovers "<run>/plan.md" --drift "none"`
Then `outcome.md` ends on `src/b.ts: unfinished work of skipped task T4 - left uncommitted`, `lib/y.ts: named by no build note: a tool output or a change outside the build - committed <sha>` and `Drift: none`, and the script prints `left: 1`

### S4 - The index carries each task's profile [CHANGED - was: step 3 derived tier, review and subject from the index columns]

Given a plan whose T2 is `TDD: none` over one file and not hard, and `tiers.min: haiku`
When the orchestrator runs `plan-index.sh "<plan>" --split`
Then T2's `profile:` line carries `haiku?` with its mechanical and its other tiers, and every other open task a line with its tier, review and subject

### S5 - The final review is dispatched from printed blocks [CHANGED - was: the model cut the slices and composed each dispatch, and `final-reviewer` found its commits itself]

Given a finished build of 13 tasks
When the close runs `plan-index.sh "<plan>" --final-review`
Then it prints two `NEXT: final-review` blocks, slices T1-T7 and T8-T13, each with today's labelled lines and a `scope:` line whose `--slice` call prints that slice's commits and files

### S6 - The close's switches are read from the index [CHANGED - was: the model split `build.extensions:` and `qa-writer` checked for existing documents]

Given `build.extensions: lint + docs, audit` with `extension:docs` already closed, and a resumed run holding `qa.md`
When the orchestrator reads the index
Then it ends on a `NEXT: extension | step: 1 | name: lint` block and a `NEXT: extension | step: 2 | name: audit` block, each with its dispatch lines, and a `NEXT: qa-kept` block whose `RUN:` line commits `qa.md` through `--qa`, so the close dispatches no `qa-writer`

### S7 - The test runner selects and waits through scripts [CHANGED - was: `test-runner` composed the git commands, the background run and the wait loop]

Given a run whose plan landed in commit `abc123`
When `test-runner` runs `run-changes.sh "<dir>"`, writes its test command to a command file, then runs `run-suite.sh run` in the background and `run-suite.sh wait`
Then it receives `base: abc123` and one `changed:` line per changed or untracked path, and later the suite's `exit=<code>` line with the log path, or `NEXT: wait` while the suite still runs

### S8 - The close's instructions are capped in words [NEW]

Given the built `implementor/SKILL.md`, `parts/close.md`, `closeout` and `test-runner`
When the unit tier runs
Then a test fails as soon as any of them grows past its cap, each cap below that file's word count before this plan

### Edge cases

- `run-summary.sh` with no argument -> `started: <epoch>`, or `started: unknown` when the clock cannot be read.
- `run-summary.sh` with the mark alone -> the `elapsed:` line alone, as `run-clock.sh` with one argument; an unusable mark -> `elapsed: unknown`.
- `run-summary.sh` with an unusable run directory -> the `elapsed:` line, then the refusal `run-tokens.sh` gave it, and the close writes `tokens: unavailable` as today.
- A repair file several tasks list -> the fix-number commit of the highest-numbered of them, a skipped one included.
- A repair call whose every file has no change -> nothing committed, the close going to the arbiter as today; a group with no change beside groups with one -> that group skipped.
- A commit failing in the middle of a `--repair` call -> the groups before it stay committed and printed.
- An `orphan:` path a summary `left uncommitted: <path> | <why>` line names -> `<path>: <why> - left uncommitted`; the same path also on a `dirty:` line -> the `dirty:` reason wins.
- A run with no leftover -> the heading line is dropped, `outcome.md` holds the summary and the `Drift:` line, `left: none`.
- `plan-index.sh` failing inside `--leftovers` -> one line `leftover check not performed: <its error: line>`, nothing committed, `closeout` going on to the archive.
- The leftovers commit refused -> every path of it `left uncommitted`, reason the commit's `error:` line, `closeout` going on to the archive.
- A closeout run again after a blocked one -> every leftover an earlier `--leftovers` committed reappears as `<path>: <reason> - committed <sha>`, unless the path is a leftover again, whose new line wins.
- The `--leftovers` call refused to `closeout` -> `VERDICT: DENIED`, with `outcome.md` holding the summary and its heading line, uncommitted.
- `tiers.min: sonnet` -> a `haiku?` line prints its mechanical tiers clamped to `sonnet`, and its mechanical alternative still carries no waiver.
- A done or skipped task -> no `profile:` line.
- `closed:` naming `final-review`, or no task done -> `--final-review` prints `NEXT: skip`.
- `build.extensions: none`, or every name of the steps closed -> no `NEXT: extension` block.
- No commit added `<dir>/plan.md` -> `run-changes.sh` prints `base: none` and nothing else, and `test-runner` with no `suite:` line runs every layer but end-to-end, as today.
- The `NEXT: extension` and `NEXT: qa-kept` blocks of the step 2 index -> carried to step 6, never acted on before it.
- QA documents in the run directory with `build.qa` off -> no `NEXT: qa-kept` block, nothing committed, as today.
- `run-suite.sh wait` reaching its time limit before the `exit=` line -> `NEXT: wait`, the agent waits again, never runs the suite again.

## Glossary

- Profile - the tier, review tier and task-list subject step 3 gives a task, printed by the index; not a dispatch.
- Leftover - a changed path the build left outside every task commit, accounted for in `outcome.md` with one reason.
- Slice - up to 8 consecutive tasks of the plan that one `final-reviewer` reviews together.

## Acceptance criteria

1. `run-summary.sh` with no argument prints the start mark, and with a mark and a run directory prints the `elapsed:` line and then the token report, every line and exit equal to what `run-clock.sh` and `run-tokens.sh` give today for the same input; both old scripts are removed and no shipped file calls them.
2. `commit-task.sh --repair` commits each named file in the fix-number commit of the highest-numbered task listing it and every other file in the post-test repair commit, in one call, reporting when nothing changed; the close makes that one call per repair round.
3. `commit-task.sh --leftovers` accounts for every leftover with today's reason wording, commits the unexplained ones, writes the leftovers section and the `Drift:` line into `outcome.md` and prints the count left uncommitted, carrying the leftovers an earlier closeout committed.
4. `closeout` holds only the drift filter, writing `outcome.md`, the `--leftovers` call and the archive call.
5. `plan-index.sh --split` prints one `profile:` line per open task, and step 3 of `implementor` takes each task's tier, review and subject from it, deciding by itself only `haiku?`, `waive?` and a floor the host's instructions declare.
6. `plan-index.sh --slice` prints a slice's commits and files, writing nothing.
7. `plan-index.sh --final-review` prints the final-review slice dispatches, the final-review fragment sends them as printed, and `final-reviewer` takes its slice from the `--slice` call of its dispatch.
8. The index prints one dispatch block per extension left to run, step by step, and the extensions fragment sends those blocks.
9. The index prints the commit of existing QA documents, the QA fragment runs it without dispatching `qa-writer`, and `qa-writer` has no `KEPT` verdict.
10. `run-changes.sh` prints the run's base commit and changed paths, and `test-runner` selects the integration tests from that output.
11. `run-suite.sh` runs the test command of a command file into its log and waits for its exit line, and `test-runner` runs the suite through it, once.
12. A unit test caps the words of `implementor/SKILL.md` below the cap of part 1, and of `parts/close.md`, `closeout` and `test-runner` each below its word count before this plan.
13. Every new script output that tells the model what to do next is a directive block of part 1 (`NEXT:` with its labelled body lines, or `RUN:`): the final-review slices, the extension dispatches, the kept QA commit and the wait of `run-suite.sh`; every other new line is a `<key>: <value>` report line.

## Scope

### File map

- add - viber/scripts/run-summary.sh - the start mark, the elapsed time and the token report of a run
- delete - viber/scripts/run-clock.sh - merged into `run-summary.sh`
- delete - viber/scripts/run-tokens.sh - merged into `run-summary.sh`
- add - tests/viber/run-summary.test.ts - integration tests of `run-summary.sh`, the cases of the two old tests
- delete - tests/viber/run-clock.test.ts, tests/viber/run-tokens.test.ts - moved into `run-summary.test.ts`
- modify - viber/scripts/commit-task.sh - the routing `--repair` form and the `--leftovers` form
- modify - tests/viber/commit-task.test.ts - their cases
- modify - viber/scripts/plan-index.sh - the `profile:` index lines, the `NEXT: extension` and `NEXT: qa-kept` index blocks, `--slice` and `--final-review`
- modify - tests/viber/plan-index.test.ts - their cases
- add - viber/scripts/run-changes.sh - the change set of a run for `test-runner`
- add - tests/viber/run-changes.test.ts - its integration tests
- add - viber/scripts/run-suite.sh - the background suite run and its wait for `test-runner`
- add - tests/viber/run-suite.test.ts - its integration tests
- modify - viber/scripts/task-step.sh - its header names the mark of `run-summary.sh`
- modify - viber/skills/implementor/SKILL.md - the `run-summary.sh` preload and `allowed-tools`, step 3 read from the `profile:` lines, the no-change and refusal sentences of `--repair`, the step 2 bullet carrying the close blocks
- modify - viber/skills/implementor/parts/close.md - the one `run-summary.sh` call of step 7, the one `--repair` call of step 5
- modify - viber/skills/implementor/fragments/final-review.true.md - the slice dispatches from `--final-review`
- modify - viber/skills/implementor/fragments/extensions.on.md - the dispatches from the `NEXT: extension` blocks
- modify - viber/skills/implementor/fragments/qa.true.md - the `NEXT: qa-kept` commit
- modify - tests/viber/final-review-prose.unit.test.ts - the `--final-review` call of the fragment and the `scope:` line of `final-reviewer`
- modify - viber/agents/closeout.md - the drift filter, `outcome.md`, the `--leftovers` call and the archive
- modify - viber/agents/final-reviewer.md - its slice from the `scope:` line
- modify - viber/agents/qa-writer.md - no `KEPT` verdict
- modify - viber/agents/test-runner.md - selection from `run-changes.sh`, the run through `run-suite.sh`
- modify - .claude/rules/shell-preload-contract.md - names `run-summary.sh` among the preload scripts
- modify - tests/viber/close-part-prose.unit.test.ts - the `run-summary.sh` call and entry, the repair sentence
- modify - tests/viber/repair-prose.unit.test.ts - the step 5 no-change sentence
- modify - tests/viber/red-evidence-prose.unit.test.ts - the waiver phrase leaving step 3
- modify - tests/viber/resume-prose.unit.test.ts - the `closeout` index phrases leaving the agent
- modify - tests/viber/implementor-words.unit.test.ts - the four word caps

### Out of scope

- Parts 3 to 7 of the roadmap: code auditor; memory and rules; planner validation and review; intent, fixer, e2e and the rest; git, GitHub and the rest.
- The close's hand-composed dispatches: the final-review fix coder and its recheck, the repair coder, every arbiter case of the close and the memory, rules and QA writer dispatches keep their text; the extension dispatch lines keep their text, printed now by the index.
- The `CLAUDE.md` nodes naming `run-clock.sh`, `run-tokens.sh`, the `closeout` leftovers, the `--repair` form or the scripts list (`viber/CLAUDE.md`, `viber/scripts/CLAUDE.md`, `viber/scripts/CLAUDE.run-scripts.md`, `viber/agents/CLAUDE.md`, `viber/agents/CLAUDE.task-flow.md`, `viber/skills/CLAUDE.md`, `tests/viber/CLAUDE.md`, `docs/specs/CLAUDE.md`): the build's memory step updates every one.
- `viber/README.md`, `viber/docs/files.md`, `viber/skills/setup/assets/help.html`, the two `viber-flow-*.svg` and `docs/viber-functions.html`: they describe what `closeout`, `test-runner` and `outcome.md` deliver, which stays as it is.
- `tests/viber/replay/plan-review/`: archived plans no test reads, kept as recorded.
- `tests/viber/code-auditor.unit.test.ts`: its `FORBIDDEN` list holds retired code-auditor tokens only, and the replay plans still name the old scripts.
- `.claude/rules/shell-script-exec-bit.md`, `.claude/rules/tests-running.md`, `.claude/rules/viber/switch-fragments.md`, `.claude/rules/agent-frontmatter.md`, `.claude/rules/viber/agent-review-color.md`, `.claude/rules/shell-loop-substitution.md` and `.claude/rules/shell-script-header.md`: their examples and the files they cite stay valid.
- `.claude/rules/shell-awk-quoting.md`, `.claude/rules/shell-path-strip.md`, `.claude/rules/shell-empty-array-expansion.md` and `.claude/rules/viber/literal-pathspecs.md`: the `plan-index.sh` and `commit-task.sh` line numbers they cite shift as those files grow; the build's rules step keeps them current.
- The `baseline-run` and `baseline-close` fragments, `tests/viber/kill-guard.test.ts`, `tests/viber/shell-guard.test.ts`, `tests/viber/guard-prose.unit.test.ts`, `tests/viber/failure-trail-prose.unit.test.ts`, `tests/viber/lessons-prose.unit.test.ts`, `tests/viber/test-pyramid-prose.unit.test.ts`, `tests/viber/skill-part.test.ts` and `tests/portability.unit.test.ts`: the text they pin stays.
- The archived runs under `docs/specs/`.

## Solution requirements

- Pure refactor: every rule listed under `Must not change` keeps its exact semantics, and each script's output is proven line by line against what the model or the old scripts produced for the same input.
- A new output telling the model what to do next is a directive block of part 1 (the format `task-step.sh`'s header defines); a fact the model only reads is a `<key>: <value>` report line.
- No argument the model composes for a script carries an apostrophe; a script takes only ids, verdict words, counts and paths. The test command reaches `run-suite.sh` as a file `test-runner` writes, never as an argument.
- Every script works under Git Bash on Windows and on macOS, keeps mode 100755 in the index and uses no heredoc.
- Each script's test is `tests/viber/<script>.test.ts`, run by its own task's `Verification` as one named file, as this repository runs its script tests (they spawn the script, so no unit seam exists); the word caps are a `*.unit.test.ts`.
- Three points today's prose leaves open are settled: a slice's commits are the ones since the plan landed; the slices are cut balanced, the larger first, as the planner review set is; a failed leftover check is the fixed line `leftover check not performed: <error>`.

## Tasks

<!-- TASK -->
### T1 - Merge the clock and the token report into run-summary.sh
- TDD: none
- Covers: AC1
- Uses: C1
- Depends-on: none
- Files: viber/scripts/run-summary.sh, viber/scripts/run-clock.sh, viber/scripts/run-tokens.sh, tests/viber/run-summary.test.ts, tests/viber/run-clock.test.ts, tests/viber/run-tokens.test.ts, viber/scripts/task-step.sh, viber/skills/implementor/SKILL.md, viber/skills/implementor/parts/close.md, .claude/rules/shell-preload-contract.md, tests/viber/close-part-prose.unit.test.ts
- Delivers: `run-summary.sh` per C1, carrying both old scripts' behaviour, its header and usage line naming `run-summary.sh` only, staged at mode 100755; every case of `run-clock.test.ts` and `run-tokens.test.ts` moved into `run-summary.test.ts` with the same expected lines and exits, the run-tokens cases called with the mark before the run directory, except the cases rewritten to the arities of C1: three run-tokens cases (no argument now gives `started:`, two arguments are the valid form and more than two exit 2, an unusable directory prints `elapsed:` before exiting 2) and the run-clock case of an ignored further argument (two arguments now give the token report, three exit 2); every run-tokens case comparing the whole stdout drops the leading `elapsed:` line before comparing the token lines; the `implementor` preload, `allowed-tools`, step 7 call and summary sentences, the `task-step.sh` header and the preload rule naming `run-summary.sh`; both old scripts and tests deleted.
- Verification: node --test tests/viber/run-summary.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/implementor-words.unit.test.ts tests/portability.unit.test.ts && git grep -n --untracked -e "run-clock" -e "run-tokens" -- ":!docs/specs/" ":!docs/_specs/" ":!docs/archive/" ":!tests/viber/replay/" ":!**/CLAUDE*.md" -> every test passes and the grep prints nothing
- DoD: `run-summary.sh` with no argument or with the mark alone prints what `run-clock.sh` printed for the same arguments, exit 0, each moved clock case unchanged; with a mark and a run directory it prints the `elapsed:` line and then exactly the lines and exit `run-tokens.sh` gave for that directory, each moved token case unchanged; `implementor/SKILL.md` preloads `run-summary.sh` and lists it in `allowed-tools` in place of both old scripts; step 7 of `parts/close.md` makes one `run-summary.sh "<started>" "<dir>"` call whose `elapsed:` line and token lines feed the summary as the two calls did, its non-zero exit writing `tokens: unavailable` as today; `run-clock.sh`, `run-tokens.sh` and their tests no longer exist, and no file outside the archived runs, the retired plugin, the replay plans and the `CLAUDE.md` nodes names them
<!-- /TASK -->

<!-- TASK -->
### T2 - Route the repair files to their tasks inside commit-task.sh --repair
- TDD: required
- Covers: AC2
- Uses: C2
- Depends-on: T1
- Files: viber/scripts/commit-task.sh, tests/viber/commit-task.test.ts, viber/skills/implementor/parts/close.md, viber/skills/implementor/SKILL.md, tests/viber/close-part-prose.unit.test.ts, tests/viber/repair-prose.unit.test.ts
- Delivers: the `--repair` form of C2 routing every named file itself; step 5 of `parts/close.md` making one `--repair` call per round with every `FILES:` path, and its no-change bullet and the `Commit outside a task` sentence of `implementor/SKILL.md` naming that call's exit 4.
- Verification: node --test tests/viber/commit-task.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/implementor-words.unit.test.ts -> every test passes
- DoD: a `--repair` file a task's `Files` lists lands in that task's commit `<id>(<round>) - <title>`, the highest-numbered task when several list it (a skipped one included), one commit per task in task order, the first commit of the call carrying the round's trail; every other file lands in one commit `fix(viber): post-test repair (round <round>)`; a group with no change is skipped and the call exits 4 only when every group had none; a commit failing mid-call exits 5 with the groups before it committed and their lines printed, then one `uncommitted:` line per path of the failed group and of every later group, and the same call run again commits what is left; step 5 of `parts/close.md` names one `--repair` call with every `FILES:` path, and its no-change bullet and `implementor/SKILL.md`'s exit 4 sentence name that call alone; `implementor/SKILL.md` no longer says a non-zero `--repair` exit committed nothing, and after a second refusal of `--repair` writes one `left uncommitted:` line per `uncommitted:` line of that second call, or per path of the call when it printed none, every other form keeping one line per path of the call, as `repair-prose.unit.test.ts` reads from it, the rewritten sentences adding no words, so the skill stays within `IMPLEMENTOR_WORD_CAP`
<!-- /TASK -->

<!-- TASK -->
### T3 - Write the leftovers section through commit-task.sh --leftovers
- TDD: required
- Covers: AC3, AC13
- Uses: C3
- Depends-on: T2
- Files: viber/scripts/commit-task.sh, tests/viber/commit-task.test.ts
- Delivers: the `--leftovers` form of C3.
- Verification: node --test tests/viber/commit-task.test.ts -> every test passes
- DoD: each `skipped:` task's `Repro:` path, each `dirty:` path and each `orphan:` path gets the reason C3 gives it, left uncommitted or committed as C3 says, a `dirty:` reason winning over a summary marker; the unexplained paths land in one commit with today's `--outside` subject and footer and one `Leftover:` line each in its body, a refused path or a refused commit leaving its paths uncommitted with the reason C3 names; `outcome.md` keeps the text above its heading line, then the heading and one line per leftover, or no heading when none, then `Drift: <n>` or `Drift: none` from `--drift`; a run whose earlier `--leftovers` call committed paths lists each of them again as `<path>: <reason> - committed <sha>`, a path that is a leftover again listed once by its new line; a failing `plan-index.sh` gives the one `leftover check not performed:` line and commits nothing; stdout carries `committed: <sha>` when a commit landed, then `left: <n>` or `left: none`, and a missing `outcome.md` or a bad `--drift` exits 2
<!-- /TASK -->

<!-- TASK -->
### T4 - Reduce closeout to the drift filter and outcome.md
- TDD: none
- Covers: AC4
- Uses: C3
- Depends-on: T3
- Files: viber/agents/closeout.md, viber/skills/implementor/parts/close.md, tests/viber/resume-prose.unit.test.ts, tests/viber/repair-prose.unit.test.ts
- Delivers: `closeout` keeping its filter and recording rules, writing `outcome.md` as the summary verbatim plus a heading line in the summary's language, making the one `--leftovers` call of C3 with its `DRIFT:` value, taking `LEFT:` from its `left:` line, then archiving; its own leftovers rules, `plan-index.sh` call and `--outside` call gone; the prose tests pinning the moved phrases dropped, the `LEFT:` and output-line checks kept.
- Verification: node --test tests/viber/resume-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/roadmap-prose.unit.test.ts && grep -n -e "--leftovers" viber/agents/closeout.md viber/scripts/commit-task.sh && ! grep -n -e "plan-index.sh" -e "--outside" viber/agents/closeout.md -> every test passes, the first grep finds the form in both files and the last finds nothing
- DoD: `closeout.md` makes exactly one Bash call before the archive, `commit-task.sh --leftovers "<run>/plan.md" --drift "<n>|none"`, and names no `plan-index.sh` and no `--outside` call; it writes `outcome.md` as the `summary:` text verbatim followed by one heading line in the summary's language, reading an existing `outcome.md` first only so the write may replace it; its `LEFT:` output line is the `left:` value of that call, `repair-prose.unit.test.ts` pinning that source in place of the counted `outcome.md` lines, a non-zero exit of it ends the run on `VERDICT: BLOCKED` with its `error:` line and a refusal of it on `VERDICT: DENIED`, either before any archive call and with `outcome.md` left holding the summary and its heading; the closing sentence of `parts/close.md` reads, on the screen form, that the summary above records a problem whether or not an `outcome.md` exists, as `repair-prose.unit.test.ts` reads from it; `resume-prose.unit.test.ts` no longer pins the `orphan:` and `dirty:` phrases of `closeout`
<!-- /TASK -->

<!-- TASK -->
### T5 - Print each open task's profile in the split index
- TDD: required
- Covers: AC5, AC13
- Uses: C4
- Depends-on: T2
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/skills/implementor/SKILL.md, tests/viber/red-evidence-prose.unit.test.ts
- Delivers: the `profile:` lines of C4 under `--split`, documented in the script header; step 3 of `implementor/SKILL.md` taking each task's tier, review and subject from its line, confirming `haiku?` and `waive?` and applying a floor the host's instructions declare, its task-list entries unchanged.
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/red-evidence-prose.unit.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/implementor-words.unit.test.ts -> every test passes
- DoD: a `hard` task prints `opus` and a review tier of `opus`; a `TDD: none` task over at most two files and not hard prints `haiku?` with its mechanical and other tiers, the mechanical review raised to `sonnet`; a `sonnet` task neither `TDD: required` nor feeding 3 or more tasks prints `waive?`, every other task its review tier, raised to `opus` on a task feeding 3 or more; every printed tier is clamped into `tiers.min` to `tiers.max` after the waiver is decided, a `haiku?` line under `tiers.min: sonnet` printing its mechanical tiers as `sonnet` with no waiver; a done or skipped task prints no line, and the subject reads `<id> - <title>` with `[TDD]` after the id on a `TDD: required` task; step 3 of `implementor/SKILL.md` takes tier, review and subject from the `profile:` line, waives a review only on a `waive?` line whose `verify:` runs the project's build or its tests, and names no tier rule of the index columns, as `red-evidence-prose.unit.test.ts` reads from `SKILL.md`
<!-- /TASK -->

<!-- TASK -->
### T6 - Print a final-review slice's commits and files with plan-index.sh --slice
- TDD: required
- Covers: AC6, AC13
- Uses: C5
- Depends-on: T5
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: the `--slice` mode of C5.
- Verification: node --test tests/viber/plan-index.test.ts -> every test passes
- DoD: `--slice` prints one `commit:` line per commit since the commit that added the plan whose subject is `<id> - <title>` or `<id>(<n>) - <title>` of a slice task, oldest first; it prints one `file:` line per path those commits changed or removed, minus every path a commit of a lower-numbered task outside the slice also changed; a slice with no matching commit prints nothing and the call writes no file; an id the plan does not hold, or `--slice` beside another mode, exits 2
<!-- /TASK -->

<!-- TASK -->
### T7 - Dispatch the final review from plan-index.sh --final-review
- TDD: required
- Covers: AC7, AC13
- Uses: C5, C6
- Depends-on: T6
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/skills/implementor/fragments/final-review.true.md, viber/agents/final-reviewer.md, tests/viber/final-review-prose.unit.test.ts
- Delivers: the `--final-review` mode of C6; the final-review fragment running it and sending each block as printed, its own slicing and slice dispatch template gone, the fix coder and recheck text unchanged; `final-reviewer` taking its slice's commits and files from its `scope:` line, its own search for them gone, its recheck path unchanged.
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/final-review-prose.unit.test.ts tests/viber/failure-trail-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/lessons-prose.unit.test.ts tests/viber/skill-part.test.ts -> every test passes
- DoD: `--final-review` prints one `NEXT: final-review` block per slice of consecutive tasks in index order, skipped ones included, cut as the planner review slices are (`plan-index.sh`'s `review: set` cut), each carrying the `run:`, `tasks:`, `report:`, `refs:`, `memory:` and `scope:` lines of C6 and the `model:` field clamped into the tiers range; it prints `NEXT: skip` when `status.md` closes `final-review` or no task is done, and `--final-review` beside `--slice`, `--split`, `--extra` or `--dispatch` exits 2; the fragment runs `--final-review`, dispatches its blocks as printed in one message, skips the step on `NEXT: skip` or an `abort`, completing its `Final review` entry as today, and holds no slicing rule, as `final-review-prose.unit.test.ts` reads from it; `final-reviewer.md` reads a `scope:` input line, runs it, reviews the commits and files it prints and holds no rule finding them by subject, as the same test reads from it
<!-- /TASK -->

<!-- TASK -->
### T8 - Print the extension dispatches left to run in the index
- TDD: required
- Covers: AC8, AC13
- Uses: C7
- Depends-on: T7
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/skills/implementor/fragments/extensions.on.md, viber/skills/implementor/SKILL.md, tests/viber/close-part-prose.unit.test.ts
- Delivers: the `NEXT: extension` blocks of C7 under `--split`, documented in the script header; the extensions fragment sending those blocks step by step, its own splitting, skipping of closed names and dispatch template gone, its return handling unchanged; a step 2 bullet of `implementor/SKILL.md` carrying the blocks to step 6.
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/skill-part.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/implementor-words.unit.test.ts && grep -n "NEXT: extension" viber/scripts/plan-index.sh viber/skills/implementor/fragments/extensions.on.md viber/skills/implementor/SKILL.md -> every test passes and the grep finds the block in all three files
- DoD: step 2 of `implementor/SKILL.md` carries every `NEXT: extension` block of the index to step 6 and acts on none before it, as `close-part-prose.unit.test.ts` reads from it; the index prints, after its `orphan:` lines and before any `NEXT: qa-kept` block, one `NEXT: extension` block per name of `build.extensions:` with its `step:` number in listed order and the four dispatch lines of C7; a name `closed:` holds as `extension:<name>` prints no block and a step whose every name is closed takes no number; `build.extensions: none` prints no block; the extensions fragment dispatches the blocks of one step in one message, the next step only once the current one is handled, completes its `Run extensions` entry at once when the index printed no block, and no longer splits the config line
<!-- /TASK -->

<!-- TASK -->
### T9 - Commit kept QA documents from the index without dispatching qa-writer
- TDD: required
- Covers: AC9, AC13
- Uses: C8
- Depends-on: T8
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/skills/implementor/fragments/qa.true.md, viber/agents/qa-writer.md, viber/skills/implementor/SKILL.md, tests/viber/close-part-prose.unit.test.ts
- Delivers: the `NEXT: qa-kept` block of C8 under `--split`, documented in the script header; the QA fragment running its `RUN:` line and dispatching no `qa-writer` on it; `qa-writer` with no `KEPT` verdict and no existing-file rule; the step 2 bullet of `implementor/SKILL.md` carrying that block to step 6 too.
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/skill-part.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/implementor-words.unit.test.ts && grep -n "NEXT: qa-kept" viber/scripts/plan-index.sh viber/skills/implementor/fragments/qa.true.md viber/skills/implementor/SKILL.md && ! grep -n "KEPT" viber/agents/qa-writer.md viber/skills/implementor/fragments/qa.true.md -> every test passes, the first grep finds the block in all three files and the last finds nothing
- DoD: step 2 of `implementor/SKILL.md` carries the `NEXT: qa-kept` block to step 6 and runs its `RUN:` line no earlier, as `close-part-prose.unit.test.ts` reads from it; the index prints, last, a `NEXT: qa-kept` block whose `RUN:` line is the `--qa` call of C8 over each of `qa.md` and `qa.e2e.md` present in the run directory, and no block when neither exists, `closed:` names `qa` or `build.qa` does not read `true`; the QA fragment answers that block by running its `RUN:` line with no `qa-writer` dispatch, the `qa.md` posting rule applying to it as to a written one; neither `qa-writer.md` nor the QA fragment names a `KEPT` verdict
<!-- /TASK -->

<!-- TASK -->
### T10 - Print the run's change set with run-changes.sh
- TDD: required
- Covers: AC10, AC13
- Uses: C9
- Depends-on: none
- Files: viber/scripts/run-changes.sh, tests/viber/run-changes.test.ts
- Delivers: `run-changes.sh` per C9, staged at mode 100755.
- Verification: node --test tests/viber/run-changes.test.ts -> every test passes
- DoD: with a run directory it prints `base: <sha>` of the oldest commit adding its `plan.md`, then one `changed:` line per path `git diff --name-only <sha>` lists and then per untracked path, each once; with no argument the base is `HEAD`; a run directory whose `plan.md` no commit added prints `base: none` alone; called from a subdirectory of the repository it prints the same lines as from its root; outside a repository, or with more than one argument, it exits 2
<!-- /TASK -->

<!-- TASK -->
### T11 - Run the suite into its log and wait for it with run-suite.sh
- TDD: required
- Covers: AC11, AC13
- Uses: C10
- Depends-on: none
- Files: viber/scripts/run-suite.sh, tests/viber/run-suite.test.ts
- Delivers: `run-suite.sh` per C10, staged at mode 100755.
- Verification: node --test tests/viber/run-suite.test.ts -> every test passes
- DoD: `run` creates the log directory, deletes an earlier log, runs the command file from the repository root with its stdout and stderr into the log C10 names, and ends the log on `exit=<code>` of the command; `wait` prints `log: <path>` and the `exit=` line once a log at least as new as the command file holds it, a command finishing within the second its file was written included, never reading an earlier run's log left at the same path; `wait` reaching its time limit first prints `log: <path>` and `NEXT: wait`; a missing mode, report path or command file exits 2
<!-- /TASK -->

<!-- TASK -->
### T12 - Drive the test runner's selection and run through the scripts
- TDD: none
- Covers: AC10, AC11
- Uses: C9, C10
- Depends-on: T10, T11
- Files: viber/agents/test-runner.md
- Delivers: `test-runner` taking the change of Selecting step 1 from `run-changes.sh` (every layer but end-to-end on `base: none` with no `suite:` line, as today), writing its test command to the command file of C10, running it with one background `run-suite.sh run` call and repeating `run-suite.sh wait` until it prints the `exit=` line, then reading the result from the log path it printed; its git commands, log directory handling and wait loop gone; its step 2 sentence, the stop block and every verdict unchanged.
- Verification: node --test tests/viber/test-pyramid-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts && grep -n -e "run-changes.sh" -e "run-suite.sh" viber/agents/test-runner.md viber/scripts/run-changes.sh viber/scripts/run-suite.sh -> every test passes and each script name is found in the agent and in its own file
- DoD: `test-runner.md` calls `"${CLAUDE_PLUGIN_ROOT}/scripts/run-changes.sh"` with its `run:` directory, or with none, and names no `git diff` or `git log` command; it writes the test command to `.temp/viber/test-runner/<report file name without .md>.cmd` and runs it once through `"${CLAUDE_PLUGIN_ROOT}/scripts/run-suite.sh" run "<report path>" "<that file>"` with `run_in_background`; it makes each `"${CLAUDE_PLUGIN_ROOT}/scripts/run-suite.sh" wait "<report path>"` call in the foreground at Bash timeout 600000 and on `NEXT: wait` waits again, never running the suite again; it reads the suite output and the `exit=` line from the log path `wait` printed, and names no `until grep` loop and no `mkdir` of the log directory
<!-- /TASK -->

<!-- TASK -->
### T13 - Cap the words of the implementor, its close part, closeout and test-runner
- TDD: none
- Covers: AC12
- Uses: none
- Depends-on: T4, T9, T12
- Files: tests/viber/implementor-words.unit.test.ts
- Delivers: word caps over `implementor/SKILL.md`, `parts/close.md`, `closeout.md` and `test-runner.md`, each at its count after this plan and each below its count before it.
- Verification: node --test tests/viber/implementor-words.unit.test.ts && wc -w viber/skills/implementor/SKILL.md viber/skills/implementor/parts/close.md viber/agents/closeout.md viber/agents/test-runner.md -> every test passes and each count is at most its cap
- DoD: `IMPLEMENTOR_WORD_CAP` sits below 2867, the cap of part 1; `close.md` is capped below 1325, `closeout.md` below 1431 and `test-runner.md` below 1257, each before-count a named constant its test compares the cap against; the counter stays the whitespace split
<!-- /TASK -->

## Contracts

### C1 - run-summary.sh

File: viber/scripts/run-summary.sh

```
run-summary.sh
  stdout: started: <epoch> | started: unknown              exit 0
run-summary.sh <started>
  stdout: elapsed: <n>h <nn>m <nn>s | <n>m <nn>s | <n>s | elapsed: unknown   (as run-clock.sh with one argument)
  exit 0
run-summary.sh <started> <run-dir>
  stdout: the elapsed: line above, then every line run-tokens.sh printed for <run-dir>, unchanged:
            tokens: <role> <model> in <n> out <n> cache-read <n> cache-write <n>   ...
            tokens: agents only - the main session and the closeout agent are not counted
            | tokens: unavailable - <reason>
            then the planning rows, then rounds: plan review <n> | rounds: plan review unavailable - <reason>
  env: CLAUDE_CONFIG_DIR as run-tokens.sh read it
  exit 0 once <run-dir> is usable; 2 with run-tokens.sh's error: line on stderr for an unusable <run-dir>
    (the elapsed: line already printed), and for more than two arguments
```

### C2 - commit-task.sh --repair

File: viber/scripts/commit-task.sh

```
commit-task.sh --repair <plan-file> <round> <file> [<file>...]
  a file some task's Files lists -> the fix-number commit of the highest-numbered such task, a skipped one included,
    subject "<id>(<round>) - <title>", footer "Refs: <plan> task <id> fix <round>"; one commit per task, task order
  every other file -> one commit "fix(viber): post-test repair (round <round>)", footer "Refs: <plan> post-test fix <round>", last
  a group with no change -> skipped
  the round's trail (work/tests-<round>.md, work/repair-<round>-coder.md) rides in the first commit of the call
stdout: per commit "committed: <sha>", "subject: <line>"; then "progress: unchanged"
        on exit 5 also one "uncommitted: <path>" per named path of the failed group and of every group after it
        (the round's trail is no named path and gets no line)
exit: 4 no group had a change, nothing committed; 5 a commit failed, earlier groups committed and printed; 2 bad arguments
the same call run again skips the groups already committed (no change) and commits the rest
```

### C3 - commit-task.sh --leftovers

File: viber/scripts/commit-task.sh

```
commit-task.sh --leftovers <plan-file> --drift <n>|none
reads: <run-dir>/outcome.md - the summary verbatim, its last non-empty line the leftovers heading
       its "left uncommitted: <path> | <why>" lines; plan-index.sh <plan> (skipped:, dirty:, orphan:);
       <run-dir>/tasks/<id>.md "- Repro:" of each skipped id; <run-dir>/work/T*-{coder,extra,extra-review}.md;
       the bodies of commits since the commit that added the plan with the --outside subject
reasons (one per path, each path once):
  Repro: path of skipped <id>          -> "reproduction test of skipped task <id>"                   left uncommitted
  dirty: path, <id> skipped            -> "unfinished work of skipped task <id>"                     left uncommitted
  dirty: path, <id> not skipped        -> "unfinished work of task <id>"                             left uncommitted
  orphan: path a summary line names    -> "<why>"   (only while no dirty: line names it)           left uncommitted
  orphan: path in a note of skipped <id> -> "written by skipped task <id> outside its Files"         left uncommitted
  orphan: path in a note of <id>       -> "written by <id>, changed after its commit or outside its Files"   committed
  orphan: path in no note              -> "named by no build note: a tool output or a change outside the build"   committed
  (the note link: the lowest-numbered task whose T<id>-coder|extra|extra-review.md names the path)
commit of the committed paths: subject "chore(viber): commit changes made outside the plan",
  body one "Leftover: <path> | <reason>" line per path, footer "Refs: <plan> outside the plan"
  a path refused (.temp) or unstageable -> left uncommitted, reason the warning text
  the commit failing -> every path of it left uncommitted, reason its error: line
carried: each "Leftover: <path> | <reason>" of an earlier such commit -> "<path>: <reason> - committed <sha>",
  first in the section; a carried path that is a leftover again is listed once, by its new line
plan-index.sh failing -> the one line "leftover check not performed: <its error: line>", nothing committed
writers of outcome.md: closeout writes the summary and the heading line; this form alone writes everything after them
outcome.md rewritten: the text above the heading line; the heading and one line per leftover
  "<path>: <reason> - committed <sha>" | "<path>: <reason> - left uncommitted" (no heading when none);
  then "Drift: <n>" | "Drift: none"
stdout: "committed: <sha>" when a commit landed; then "left: <n>" | "left: none" (lines ending "left uncommitted")
exit: 0 once the arguments are usable; 2 bad arguments, a bad --drift or no outcome.md
```

### C4 - profile line of the split index

File: viber/scripts/plan-index.sh

```
right after the verify: lines and before any dirty: line, one per task neither done nor skipped, in task order:
profile: <id> | tier: <tier> | review: <tier> | subject: <subject>
profile: <id> | tier: <tier> | review: waive? <tier> | subject: <subject>
profile: <id> | haiku? | mechanical: <tier> review <tier> | else: <tier> review <tier>|waive? <tier> | subject: <subject>
rules, before the clamp: hard yes -> opus; TDD none, at most 2 Files, not hard -> haiku? (mechanical haiku, else sonnet); else sonnet
review: the tier, raised to sonnet from haiku and to opus on a task whose feeds entry counts 3 or more
waive?: a sonnet task, TDD none, no feeds entry of 3 or more - waived when its verify: line runs the
  project build or its tests, else <tier>
clamp: every printed tier into tiers.min..tiers.max (haiku < sonnet < opus < fable), after the waiver is
  decided; a "haiku?" line keeps both alternatives whatever the clamp makes of them
subject: "<id> - <title>" | "<id> [TDD] - <title>"; the task-list subject appends " (<tier>)" when waived,
  else " (<tier>, review <review tier>)"
```

### C5 - plan-index.sh --slice

File: viber/scripts/plan-index.sh

```
plan-index.sh <plan-file> --slice <id>[,<id>]...
commit: <id> | <sha> | <subject>    one per commit since the commit that added the plan whose subject is
                                    "<id> - <title>" or "<id>(<n>) - <title>" of a slice task, oldest first
file: <path>                        one per path those commits changed or removed, minus every path a commit of
                                    a lower-numbered task outside the slice also changed, in byte order
nothing when no commit matches; validated as the plain index of a landed plan, writing no file;
exit 2 for an id the plan does not hold or beside --split, --extra, --dispatch, --final-review
```

### C6 - plan-index.sh --final-review

File: viber/scripts/plan-index.sh

```
plan-index.sh <plan-file> --final-review
NEXT: skip                                   status.md closes final-review, or no task is done
or one block per slice (ceil(n / 8) runs of consecutive tasks, index order, skipped included, sizes differing by at most one, the larger first):
NEXT: final-review | slice: <k> | model: <sonnet clamped into tiers.min..tiers.max>
run: <dir>
tasks: <id>, <id>, ...
report: <dir>/work/final-review-<k>.md
refs: <plugin root>/references
memory: <build.memory value>
scope: "<plugin root>/scripts/plan-index.sh" "<plan>" --slice "<id>,<id>,..."
```

### C7 - extension blocks of the split index

File: viber/scripts/plan-index.sh

```
after the orphan: lines, one block per name of the config build.extensions: line (steps split on ", ",
names of a step on " + "), in listed order:
NEXT: extension | step: <k> | name: <name>
run: <dir>
spec: <dir>/spec.md
notes: <dir>/work/
out: .temp/viber/extension-<name>/
a name closed: holds as extension:<name> prints no block; <k> counts the steps that keep a name, from 1;
build.extensions: none prints no block
```

### C8 - kept QA block of the split index

File: viber/scripts/plan-index.sh

```
last in the index, when build.qa reads true, <dir>/qa.md or <dir>/qa.e2e.md exists and closed: does not name qa:
NEXT: qa-kept
RUN: "<plugin root>/scripts/commit-task.sh" --qa "<plan>" "<repo-relative path>" ["<repo-relative path>"]
     qa.md first, then qa.e2e.md, each only when present
```

### C9 - run-changes.sh

File: viber/scripts/run-changes.sh

```
run-changes.sh [<run-dir>]
base: <sha> | HEAD | none     the oldest commit of git log --diff-filter=A -- <run-dir>/plan.md; HEAD with no argument;
                              none when no commit added it (nothing else printed)
changed: <path>               each path of git diff --name-only <base>, then of git ls-files --others --exclude-standard, each once
cwd: any directory of the repository (moves to its root); exit 0; 2 outside a repository or more than one argument
```

### C10 - run-suite.sh

File: viber/scripts/run-suite.sh

```
run-suite.sh run <report path> <command file>
  <command file>: .temp/viber/test-runner/<report file name without .md>.cmd, the test command test-runner wrote
  log: <repository root>/.temp/viber/test-runner/<report file name without .md>.log; creates its directory,
  deletes an old log, runs "bash <command file>" from the repository root with stdout and stderr into the log,
  appends "exit=<code>"
  stdout: log: <path>; exit 0
run-suite.sh wait <report path>
  waits until a log at least as new as its command file holds a line "exit=<code>", at most RUN_SUITE_WAIT
  seconds (default 590); a log older than the command file is an earlier run's and is never read; an equal
  timestamp counts as current
  stdout: log: <path> then exit=<code>
      or: log: <path> then NEXT: wait        when the time ran out first
  cwd: any directory of the repository; exit 0; 2 a missing mode, report path or command file
```

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

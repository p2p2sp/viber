---
source: C:/Projects/viber/docs/_specs/2026-11-18-12-49-22_scripted-task-loop-of-the-implementor-answering-in-directive/plan.md
planned: C:/Users/dario/.claude-p2p2/plans/goofy-soaring-lecun.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Scripted task loop of the implementor, answering in directive lines

## Goal

The implementor's task loop (what follows each coder, reviewer, red check, commit and arbiter return) and the assembly of every coder and reviewer dispatch move from prose the model re-reads on each return into scripts that answer with a directive: the next action and the exact lines to send. The skill keeps only the rule to run the script and follow its answer, so a build spends fewer tokens per return and no longer depends on the model applying a long decision table correctly.

## Problem

`viber/skills/implementor/SKILL.md` step 4 holds a decision table of about 40 lines (attempt counting, tier climbing, review waivers, `DECIDE:` routing, the limit, the repair pass, arbiter recording) plus the dispatch templates, and the `red-check` fragment adds its own table. The orchestrator re-reads it on every return of every task and composes each dispatch by hand, including the transitive `decision:` lines. Every read costs the user's usage limits, and every hand-applied rule is a chance to dispatch the wrong tier, miss a `decision:` line or count an attempt wrong.

## Current behaviour

The skill runs `plan-index.sh --split` once, then for every return reads the verdict lines, applies the rules of step 4 and the red-check fragment from memory, composes the next dispatch from the labelled-line template (deriving `deferred`, `prior`, `decision`, `run-lessons`, `baseline`, `report` round and `previous` itself) and runs `commit-task.sh` calls whose arguments it builds. `red-check.sh` prints one `red-check:` line which the fragment maps to an action.

### Must not change

- A task gets at most 5 attempts in a session; a resumed session starts every count over; each next attempt climbs one tier clamped into `tiers.max`, the review tier rising with it, a waived review staying waived.
- A coder failure is a `VERDICT: FAIL`, a `PASS` whose `DOD:` is short, or a `PASS` of a `TDD: required` task with no `RED:` line or `RED: 0 failing`.
- The `WAIT:` hold, the `DECIDE:` route to the arbiter on attempts 1 to 4 with the stalled coder resumed in the same attempt, the limit holding the task and its transitive dependents, the repair pass of at most 2 attempts at `tiers.max`, and the `cap` arbiter after it.
- Every labelled line a coder or reviewer dispatch carries today, with the same values, the close's fix coder and repair coder included.
- A task commit carries `--with` for every `EXTRA:` path and `--defer` for every `DEFERRED:` line of the attempt it commits.
- `red-check.sh`'s `red-check:` line, its exit codes and its isolation behaviour.
- `plan-index.sh`'s index output, `--split` and `--extra`.

## Roadmap

Part 1 of 7 - Directive convention and the implementor task loop

1. Directive convention and the implementor task loop (this plan)
2. Implementor close
   - `run-summary.sh` replaces `run-clock.sh` and `run-tokens.sh`, both removed.
   - `commit-task.sh --leftovers` writes the leftovers section; `closeout` keeps only the drift filter and `outcome.md`; `commit-task.sh --repair` routes files to tasks itself.
   - `plan-index.sh --final-review` and `--slice`; the `--split` profile prints each task's tier and subject, and `haiku?` only for `TDD: none`, at most 2 files and no `hard`, the model confirming.
   - `run-changes.sh` and `run-suite.sh` (the run in the background plus the wait) for `test-runner`; the extensions steps and `qa: kept` from scripts.
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

### S1 - A coder return answers with the next dispatch [CHANGED - was: the model applied the attempt table and composed the dispatch]

The orchestrator runs one script call per return and sends what it prints.

Given a task on attempt 2 at `sonnet` whose coder returned `VERDICT: FAIL` with a `REASON:` line
When the orchestrator runs the step script with that coder verdict
Then it receives `NEXT: coder | attempt: 3 | model: opus | review: opus | add: reason` followed by every coder dispatch line of the task, and appends only the `reason:` line copied from the return

### S2 - A passing coder of a TDD task gets its red check from the same call [CHANGED - was: a separate fragment told the model to run `red-check.sh` and map its line]

Given `build.red-check` on and a `TDD: required` task whose coder returned `PASS` with a full `DOD:` and `RED: 2 failing`
When the orchestrator runs the step script with that coder verdict
Then the script runs the red check itself and answers with the review dispatch carrying `red:` and `red-check:` lines, or with the next coder attempt when the tests passed without the change

### S3 - A stalled coder goes to the arbiter and comes back resumed [CHANGED - was: the model built the arbiter dispatch, the record calls and the resume message]

Given a coder `FAIL` on attempt 2 that wrote `DECIDE: a | b` to its options file
When the orchestrator reports that failure, dispatches the arbiter it is told to, then reports the ruling
Then the first answer is the arbiter dispatch with `case: decide` and `options: a | b`, and the second the record calls followed by the resume message carrying every `decision:` line, the new ruling among them

### S4 - The fifth failure holds the task and its dependents [CHANGED - was: the model walked the dependency graph]

Given a task on attempt 5 whose reviewer returned `FAIL`, and two tasks depending on it, one directly and one through the other
When the orchestrator reports that review
Then it receives `NEXT: hold | dependents: T2,T3`

### S5 - A dispatch is printed whole from the plan [NEW]

Given a task depending on T1, which depends on T2, and `status.md` recording a decision on T2 and a deferred path for the task
When the plan index is asked for that task's coder dispatch
Then it prints the task's coder lines with `prior:` naming T1's notes only, a `decision:` line for T2 and the deferred path

### S6 - The red check names its own next step [CHANGED - was: one `red-check:` line only]

Given any finished red check
When `red-check.sh` prints its `red-check:` line
Then a `NEXT:` line follows it naming the review for `FAIL-AS-EXPECTED` and `UNRUNNABLE`, and a coder failure with its reason for `PASSED-WITHOUT-CHANGE`

### S7 - The implementor carries no decision table [CHANGED - was: step 4 held the attempt rules, the red-check fragment and the dispatch templates]

Given a build in step 4
When a task's agent returns
Then the orchestrator's instructions name only the step script call and how to act on each directive, the format of which the script's own header defines

### Edge cases

- A state file written under another `started:` mark -> discarded, the task starting at attempt 1 as a resumed session does today.
- A `start` call for a task whose state already holds the current mark -> the state kept, the current attempt's dispatch printed again.
- A session whose clock reads `unknown` -> its `start` of each task begins at attempt 1, and the task's later returns in that session keep counting from there.
- `tiers.max` already reached -> the next attempt stays at that tier.
- A `haiku` task climbing -> its review tier never below `sonnet`.
- A red check that timed out -> the review dispatched with the check read as unrunnable on a timeout, as today.
- A `decide` ruling naming no listed option -> the coder's first option recorded and the coder resumed under it.
- A refused arbiter accepted by the user -> the ruling recorded in today's fixed words with the case's first option, then that option carried out.
- A task with no dependents reaching the limit -> `dependents: none`.
- `run-failures.sh --lessons` printing `lessons: none` or exiting non-zero -> no `run-lessons:` line.
- A `--rule` record call exiting non-zero -> named in the final summary, no further ruling recorded and nothing retried, the ruling still carried out; a `--decide` or `--skip` call exiting non-zero after a ruling -> named in the final summary, nothing asked, the next block acted on.

## Glossary

- Directive - a script's answer telling the orchestrator what to do next and exactly what to send; it is an instruction to act, not a value to interpret.
- Step - where a task stands in the session: its attempt, its tiers, its review round and its last failure, as the step script remembers them between returns; it is no record of the run.
- Event - what just returned for a task (a coder, a reviewer, a commit, an arbiter ruling), the one thing the orchestrator reports.

## Acceptance criteria

1. The plan index prints, for any task, the labelled-line block of its coder or reviewer dispatch, every line holding the value step 4 derives today, `decision:` lines covering transitive dependencies and `run-lessons:` holding the list computed at today's moments.
2. `red-check.sh` ends every result on a `NEXT:` line naming the step that result leads to.
3. The step script answers every coder, reviewer and commit return of a task with one directive block carrying the next dispatch, its attempt number and tiers, and the commit call with its `--with` and `--defer` arguments, applying the attempt count, the tier climb, the review waiver and the limit with the transitive dependents exactly as step 4 does today.
4. On a coder `PASS` of a `TDD: required` task with `build.red-check` on, the step script runs the red check itself and answers with the step its result leads to.
5. The step script routes a `DECIDE:` failure to the arbiter, prints the record calls and the next directive for any arbiter ruling (the refused-arbiter fixed words and the `--first-of` fallback included) and the resume message, and drives the repair pass, the `cap` arbiter and the `skip` chain.
6. The directive format (`NEXT:`, `RUN:`, `ASK:`, `STOP:`, their fields and the labelled lines under them) is defined in the header of `task-step.sh`; the skill states only how to act on each directive.
7. `implementor/SKILL.md` step 4 holds no decision table and no dispatch template: it runs the step script and follows its directives; the `red-check` fragment no longer exists, and a unit test caps the word count of `SKILL.md` below today's 3626 words.

## Scope

### File map

- add - viber/scripts/task-step.sh - the per-task step machine: its state, the directive answer to every return, the record calls of arbiter rulings, the repair pass and the skip chain; its header defines the directive format
- add - tests/viber/task-step.test.ts - integration tests of `task-step.sh`
- modify - viber/scripts/plan-index.sh - the `--dispatch` mode
- modify - tests/viber/plan-index.test.ts - its `--dispatch` cases
- modify - viber/scripts/red-check.sh - the `NEXT:` line after each result
- modify - tests/viber/red-check.test.ts - the `NEXT:` line per result
- modify - viber/docs/files.md - the step state file among the host writes under `.temp/viber/<task id>/`, and the session lessons file `.temp/viber/lessons`
- modify - viber/skills/implementor/SKILL.md - step 4 driven by the scripts, its `allowed-tools`, the arbiter section reduced to the ruling call
- delete - viber/skills/implementor/fragments/red-check.true.md - its rules now live in `task-step.sh`
- modify - viber/skills/implementor/fragments/baseline-run.fast.md, viber/skills/implementor/fragments/baseline-run.full.md - drop the dispatch line `--dispatch` now prints
- modify - viber/skills/implementor/parts/close.md, viber/skills/implementor/fragments/final-review.true.md - the repair coder and the final-review fix coder take their `run-lessons:` list from their own `run-failures.sh --lessons` call
- modify - tests/viber/red-evidence-prose.unit.test.ts, tests/viber/ruling-prose.unit.test.ts, tests/viber/extras-prose.unit.test.ts, tests/viber/previous-review-prose.unit.test.ts, tests/viber/repair-prose.unit.test.ts, tests/viber/lessons-prose.unit.test.ts, tests/viber/close-part-prose.unit.test.ts - drop every assertion whose text leaves the skill, which `tests/viber/task-step.test.ts`, `tests/viber/plan-index.test.ts` and `tests/viber/red-check.test.ts` prove from the scripts' output, and hold the skill to its new calls
- add - tests/viber/implementor-words.unit.test.ts - the word cap of `implementor/SKILL.md`

### Out of scope

- Parts 2 to 7 of the roadmap; `parts/close.md` and the close fragments keep their own arbiter dispatches, recording rulings through the call this plan adds.
- The `WAIT:` hold: when to hold, whether a path was already waited on and when to release stay with the model, which re-dispatches through `retry coder` or reports an ordinary `FAIL`; so does the choice of what to dispatch first.
- Step 3's task profile (tier and review waiver), which `start` receives as flags.
- The `CLAUDE.md` nodes naming `red-check.true.md`, `red-check.sh`'s caller and the scripts list (`viber/CLAUDE.md`, `viber/scripts/CLAUDE.md`, `viber/scripts/CLAUDE.run-scripts.md`, `tests/viber/CLAUDE.md`): the build's memory step updates every one, and carries the directive format of `task-step.sh`'s header into `viber/scripts/CLAUDE.md`; `viber/skills/CLAUDE.md`'s lessons-call timing and repair coder line go the same way.
- `.claude/rules/shell-script-header.md`, which names `plan-index.sh` as a header example that stays valid; the rules step keeps it current.
- `.claude/rules/viber/switch-fragments.md`, `.claude/rules/shell-preload-contract.md`, `.claude/rules/shell-awk-quoting.md` and `.claude/rules/shell-path-strip.md`: the `baseline-run` call they cite stays, the runtime script list is examples, and the `plan-index.sh` line numbers two of them cite shift with T1; the build's rules step keeps them current.
- `viber/references/plan-rules-script.md`: `red-check.sh` still runs the `Verification` text as written.
- `tests/viber/replay/plan-review/`: archived plans no test reads.
- `tests/portability.unit.test.ts`, `tests/viber/switch-text.test.ts` and `tests/viber/root-cause-prose.unit.test.ts`: they sweep every script and fragment generically or pin text this plan keeps.

## Solution requirements

- Pure refactor: every rule listed under `Must not change` keeps its exact semantics. An inconsistency found while planning is asked as its own question.
- No argument the model composes for a script carries an apostrophe. The one fixed word holding one, `the coder's first option` of a refused `decide` arbiter, keeps its text as a named exception: it reaches `commit-task.sh` only double-quoted inside a `RUN:` line the script prints, proven by `tests/viber/task-step.test.ts` from that output.
- Every script works under Git Bash on Windows and on macOS, keeps mode 100755 when invoked bare and uses no heredoc.
- The step script takes no free text through its arguments: only ids, verdict words, counts, paths, `<id>:<path>` pairs and option words. A returned `REASON:` or a commit error reaches the next dispatch through the `add:` field as a line the model copies from the return it holds, and the repair pass's one-line problem as the one line the model writes, exactly as today.
- Each script's test is `tests/viber/<script>.test.ts`, run in its task's `Verification`; the word cap is a `*.unit.test.ts`.

## Tasks

<!-- TASK -->
### T1 - Print a task's coder and reviewer dispatch lines from the plan
- TDD: required
- Covers: AC1
- Uses: C2, C3
- Depends-on: none
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: the `--dispatch` mode of `plan-index.sh`, printing the labelled lines of C3.
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/extras-prose.unit.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: the coder form prints the fixed coder lines of C3 in its order, `baseline:` only when `build.baseline-tests` resolves to `fast` or `full`; `deferred:` joins every `deferred:` entry of `status.md` naming the id, and `prior:` names the notes of the task's own `deps` only; one `decision:` line per `status.md` decision line whose id is the task or one it depends on, directly or through another, in file order; `refs:` and `scope:` name the plugin root in the spelling the script was invoked with, as C3 states, and `run-lessons:` carries the list line of `.temp/viber/lessons` when that file holds one, absent otherwise; the reviewer form prints the reviewer lines of C3, with no `prior:` or `decide-file:` line; an id the plan does not hold, a form other than `coder` or `reviewer`, or `--dispatch` combined with `--split` or `--extra` exits 2
<!-- /TASK -->

<!-- TASK -->
### T2 - End each red check result on its next-step directive
- TDD: required
- Covers: AC2
- Uses: C4
- Depends-on: none
- Files: viber/scripts/red-check.sh, tests/viber/red-check.test.ts
- Delivers: the `NEXT:` line of C4 after every `red-check:` line `red-check.sh` prints.
- Verification: node --test tests/viber/red-check.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: a `FAIL-AS-EXPECTED` result is followed by `NEXT: review`; a `PASSED-WITHOUT-CHANGE <files>` result is followed by `NEXT: coder-failure | reason: tests pass without the change: <files>`; every `UNRUNNABLE` result is followed by `NEXT: review`; the exit code and the `red-check:` line stay as they are, and the script's header names both stdout lines
<!-- /TASK -->

<!-- TASK -->
### T3 - Answer a coder return with the next dispatch
- TDD: required
- Covers: AC3
- Uses: C1, C2, C3
- Depends-on: T1
- Files: viber/scripts/task-step.sh, tests/viber/task-step.test.ts
- Delivers: `task-step.sh` with its state and the `start`, `coder` and `retry coder` events.
- Verification: node --test tests/viber/task-step.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: `start` answers `NEXT: coder | attempt: 1` with the tiers it was given, the coder lines `plan-index.sh --dispatch` prints, the session lessons file of C2 written first when the current `started` mark has none and always under the mark `unknown`, plus `resume: <paths>` when `--resume` came, every `RUN:` line and path naming the plugin root in the spelling the script was invoked with and the script recorded in the index as mode 100755, a state written under another `started` mark being discarded first and one under the current mark kept, its current attempt's coder block printed again, except under the mark `unknown`, where `start` always discards it and later events keep what it wrote; a coder failure on attempts 1 to 4 (a `FAIL`, a `PASS` with a short `--dod`, a `PASS` of a `TDD: required` task without `--red` or with `--red 0`) answers `NEXT: coder` at the next attempt, one tier up clamped into `tiers.max`, the review tier rising with it, never below `sonnet` and staying `waived` when waived; the failure's reason reaches that block as C2 states: `add: reason` after a `FAIL`, `reason: DOD: <m>/<n>` after a short `DOD`, `reason: no red evidence` after missing red evidence; a coder `PASS` that is no failure answers `NEXT: review` at the next round with the reviewer lines, plus `red: <the --red-log path>` whenever the coder's last return named one, when the review is not waived or any coder of the task reported `--with` (a waived review then running at the current attempt's tier, raised to `sonnet` from `haiku`), else `NEXT: commit` whose `RUN:` line carries every `--with` path and `--defer` entry reported for the attempt; a coder failure on attempt 5 answers `NEXT: hold` naming every task depending on it directly or through another, `none` when there is none; `coder DENIED` answers `ASK: retry -> retry coder --denied | skip -> skip | abort`, and `retry coder` prints the current attempt's coder block again, with `add: reason` under `--denied`, counting no attempt
<!-- /TASK -->

<!-- TASK -->
### T4 - Answer reviewer and commit returns
- TDD: required
- Covers: AC3
- Uses: C1, C2, C3
- Depends-on: T3
- Files: viber/scripts/task-step.sh, tests/viber/task-step.test.ts
- Delivers: the `reviewer`, `retry reviewer`, `accept`, `commit` and `landed` events.
- Verification: node --test tests/viber/task-step.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: `reviewer PASS` answers `NEXT: commit` whose `RUN:` line also carries every `--with` path the reviewers reported; `reviewer FAIL --report <path>` on attempts 1 to 4 answers the next attempt's `NEXT: coder` with `report: <path>`, the `REVIEW` path the reviewer returned, and every later reviewer block of the task carries the path of its last failed review as `previous:`, while every `reviewer FAIL`, at any attempt, recomputes the session's lessons file C2 names before answering; `reviewer FAIL` on attempt 5 answers `NEXT: hold` as a coder failure does; `reviewer DENIED` answers `ASK: retry -> retry reviewer | accept -> accept | abort`, `retry reviewer` printing the same round's reviewer block again and `accept` the task commit with `--unreviewed`; `commit 0` answers `NEXT: done`, and `commit 4` answers `ASK: retry | skip -> skip | abort`, opening on `already committed -> landed <sha>` with `--landed`, after which `landed <sha>` answers the commit with `--landed "<sha>"` in place of its `--with` paths; any other commit exit answers the next attempt's coder block with `add: reason` on attempts 1 to 4 and `NEXT: hold` on attempt 5
<!-- /TASK -->

<!-- TASK -->
### T5 - Run the red check inside a passing coder's step
- TDD: required
- Covers: AC4
- Uses: C1, C2, C3, C4
- Depends-on: T2, T4
- Files: viber/scripts/task-step.sh, tests/viber/task-step.test.ts
- Delivers: the red check of a coder `PASS` of a `TDD: required` task when `build.red-check` reads `true`, and the `--red-timeout` flag.
- Verification: node --test tests/viber/task-step.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: a coder `PASS` of a `TDD: required` task with full `DOD` and red evidence answers with the check's `red-check:` result and leaves its `red-check.log` under `.temp/viber/<id>/` when `build.red-check` reads `true`, and with no `red-check:` line or field and no such log when it does not; a `NEXT: review` answer of the check prints the reviewer block carrying `red: <the --red-log path>` and the check's `red-check:` line once, its directive line carrying the result as the field `red-check: <result word>`; a `NEXT: coder-failure` answer is handled as a coder failure with the check's reason as `reason:`, its directive line carrying `red-check: PASSED-WITHOUT-CHANGE` and its body no `red-check:` line; a non-zero exit of the check, a missing `NEXT:` line or `--red-timeout` answers the reviewer block with `red-check: UNRUNNABLE exit <n>`, `red-check: UNRUNNABLE no NEXT: line` or `red-check: UNRUNNABLE timeout` and the field `red-check: UNRUNNABLE`
<!-- /TASK -->

<!-- TASK -->
### T6 - Route a stalled coder to the arbiter and record every ruling
- TDD: required
- Covers: AC5
- Uses: C1, C2, C3
- Depends-on: T5
- Files: viber/scripts/task-step.sh, tests/viber/task-step.test.ts
- Delivers: the `--decide` route of a coder failure, the `ruled` event for every subject and case but `cap`, and the `resume-failed` event.
- Verification: node --test tests/viber/task-step.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: a coder failure with `--decide` on attempts 1 to 4 answers `NEXT: arbiter` with `case: decide`, `options:` the `DECIDE:` options of `<dir>/work/<id>-options.md`, `task:`, `report: <dir>/work/<id>-coder.md`, `ruling: <dir>/work/ruling-<id>.md` and `add: reason` when the failure returned a `REASON:`, else the ready `reason:` line C2 gives that failure (`reason: DOD: <m>/<n>`, `reason: no red evidence` or the red check's reason), and on attempt 5 the limit instead; `ruled --case decide` answers the `RUN:` line `commit-task.sh --rule ... --from <ruling file>`, then `commit-task.sh --decide ... --from <ruling file>`, or `--first-of <options file>` when the ruling's `RULING` names no listed option, then `NEXT: resume`, carrying the field `mismatch` in that case, with one `decision:` line per decision of the task and its transitive dependencies, the one just ruled among them as read from the ruling file or the first option, written with the `auto: ` prefix `commit-task.sh` records it under, and the line `Continue the task under these decisions, then return your output lines again.`; `ruled --refused` answers the fixed-words `--rule` call with the case's first option (`accept`, `skip`, `continue`, `leave uncommitted`, or `the coder's first option` on `decide`), then on `decide` the `--first-of` call and `NEXT: resume`, and on `baseline`, `tests`, `final-review` or `commit` `NEXT: carry-out: <first option>`; `ruled` on `baseline`, `tests`, `final-review` or `commit` answers the `--rule ... --from` call, then `NEXT: carry-out: <option>` with the ruled option, or with the first option of `--options` and the field `mismatch` when the ruling names none of them; a resumed coder's second `DECIDE:` answers `NEXT: arbiter` again in the same attempt, and `resume-failed`, or a resumed coder's failure without `--decide`, answers the next attempt with every `decision:` line
<!-- /TASK -->

<!-- TASK -->
### T7 - Drive the repair pass and the skip chain
- TDD: required
- Covers: AC5
- Uses: C1, C2, C3
- Depends-on: T6
- Files: viber/scripts/task-step.sh, tests/viber/task-step.test.ts
- Delivers: the `repair` and `skip` events, the repair pass's outcomes and `ruled --case cap`.
- Verification: node --test tests/viber/task-step.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: `repair` on a held task answers `NEXT: coder | repair: 1 | model: <tiers.max> | review: <tiers.max>` with the coder lines and `add: repair`, carrying the last failure as `add: reason` when it returned a `REASON:` or was a refused commit, as the ready `reason:` line C2 gives it when it returned none, and as `report:` naming the last review report with no reason after a review failure; a first failed repair attempt (a coder failure, a review failure or a commit exit other than 0 and 4) answers `NEXT: coder | repair: 2` carrying that failure the same way; in the repair pass every coder `PASS` goes to review, never waived, its reviewer block carrying `add: repair` too, and a `DECIDE:` costs an attempt with no arbiter; a second failed repair attempt answers `NEXT: arbiter` with `case: cap`, `report:` lines for the coder notes and the last review report when one exists, `options: accept | skip` after a review failure, `options: skip` otherwise, and that failure as its reason the same way; `ruled --case cap` opens on the `RUN:` line `commit-task.sh --rule ... --from <ruling file>`, or under `--refused` on the fixed-words `--rule` call with `accept` after a review failure and `skip` otherwise, then (with the field `mismatch` and the first option when the ruling names none) naming `accept` answers the task commit with `--unreviewed`, naming `skip` the skip chain, and a later commit exit other than 0 and 4 answers the `cap` arbiter again with `options: skip` and `add: reason`; `skip` answers one `RUN: commit-task.sh --skip` block for the task, then one per task depending on it, directly or through another, in task order
<!-- /TASK -->

<!-- TASK -->
### T8 - Document the directive format and the step state
- TDD: none
- Covers: AC6
- Uses: C1, C2
- Depends-on: T7
- Files: viber/scripts/task-step.sh, viber/docs/files.md
- Delivers: the header of `task-step.sh` defining C1 and C2, and the step state file named in the host writes.
- Verification: grep -n -e "NEXT: carry-out" -e "add: reason" viber/scripts/task-step.sh -> header lines and code lines for each; grep -n "STOP:" viber/scripts/task-step.sh -> a header line; grep -n -e "/state" -e "viber/lessons" viber/docs/files.md viber/scripts/task-step.sh -> both rows of the doc and both paths the script writes
- DoD: the header of `task-step.sh` states the four directives, the field grammar, the `add:` field and the body lines of C1; the header states every event, flag and verb of C2 with its exit codes; the `.temp/viber/<task id>/` row of `viber/docs/files.md` names the `state` file the script writes, and a row of its own names the session lessons file `.temp/viber/lessons`
<!-- /TASK -->

<!-- TASK -->
### T9 - Drive the implementor's task loop from task-step
- TDD: required
- Covers: AC7
- Uses: C1, C2
- Depends-on: T8
- Files: viber/skills/implementor/SKILL.md, viber/skills/implementor/fragments/red-check.true.md, tests/viber/red-evidence-prose.unit.test.ts, tests/viber/extras-prose.unit.test.ts, tests/viber/previous-review-prose.unit.test.ts, tests/viber/repair-prose.unit.test.ts, tests/viber/close-part-prose.unit.test.ts, tests/viber/ruling-prose.unit.test.ts, tests/viber/resume-prose.unit.test.ts, tests/viber/lessons-prose.unit.test.ts
- Delivers: step 4 of `implementor/SKILL.md` running `task-step.sh` on every task return and following its directive, with the attempt rules, the red-check fragment and the repair pass rules removed.
- Verification: node --test tests/viber/red-evidence-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/previous-review-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/ruling-prose.unit.test.ts tests/viber/lessons-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts tests/viber/resume-prose.unit.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: the skill's `allowed-tools` grants `task-step.sh` and no longer `red-check.sh`, and step 4 names the `start` call before a task's first dispatch, with `--resume "<paths>"` when the user answered `continue` to its `dirty:` line (the step 2 bullet naming that call instead of adding a `resume:` line), one `task-step.sh` call per return and the 600000 Bash timeout of a coder `PASS` of a `TDD: required` task; step 4 maps a return to the C2 flags (`DOD:` to `--dod`, `RED:` to `--red` and `--red-log`, `DECIDE:` to `--decide`, `EXTRA:` to `--with`, `DEFERRED:` to `--defer`, `REVIEW` to `--report`), the exit of a commit `RUN:` line to `commit <exit>` (`--landed` when its error names it), a coder `PASS` call cut off by its timeout to the same call with `--red-timeout`, and a refused `SendMessage` to `resume-failed`, a `DEFERRED: <path> -> none` line taking no `--defer` and going to the final summary as a deferred path without an owner; step 4 tells the model to act on each directive of C1, to keep a returned `WAIT:` hold itself and re-dispatch through `retry coder`, and states no attempt, tier, limit or red-check rule of its own, while counting the `red-check:` field and the `attempt:` field of each directive for the `red-check:` and `attempts:` summary lines of `parts/close.md`; the repair pass keeps only when the `repair` call is made, once no agent is in flight and no task is ready, before step 5, one held task at a time in the order held; `fragments/red-check.true.md` and its `switch-text.sh` call are gone; the prose tests hold the skill to these calls and rules
<!-- /TASK -->

<!-- TASK -->
### T10 - Record rulings and keep the task list through task-step
- TDD: required
- Covers: AC7
- Uses: C1, C2
- Depends-on: T9
- Files: viber/skills/implementor/SKILL.md, tests/viber/ruling-prose.unit.test.ts, tests/viber/repair-prose.unit.test.ts
- Delivers: the arbiter section of `implementor/SKILL.md` reduced to the dispatch shape and the `ruled` call, and the task-list entries tied to the directives.
- Verification: node --test tests/viber/ruling-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/red-evidence-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/close-part-prose.unit.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: the arbiter section keeps the dispatch shape the close's cases use and replaces every record rule with the `ruled` call, with `--options` and `--refused` as each case needs, and the `## Answers` section's `skip` answer runs the `skip` event and its `retry` answer of a coder after a `DENIED` runs `retry coder --denied`; a `--rule` `RUN:` line exiting non-zero is named in the final summary, no further ruling is recorded and nothing retried, the ruling still carried out, and a `--decide` or `--skip` line exiting non-zero after a ruling is named there and the next block acted on; a `NEXT: coder` past attempt 1 rewrites the task's subject with the tiers its fields name, the message running a task's commit `RUN:` line carries its `TaskUpdate` to completed as today, a commit `ASK:` and a `NEXT: coder` after a refused commit set it back to in progress, and each skip chain `RUN:` line carries its task's completion; a `NEXT: coder` opening a repair pass creates the `R<n> - repair <id> (<tier>, review <tier>)` entry, completed with that task's `NEXT: done` or its `cap` ruling; the prose tests hold the skill to these rules
<!-- /TASK -->

<!-- TASK -->
### T11 - Take dispatch lines from the plan and cap the implementor's words
- TDD: required
- Covers: AC1, AC7
- Uses: C1, C3
- Depends-on: T10
- Files: viber/skills/implementor/SKILL.md, viber/skills/implementor/fragments/baseline-run.fast.md, viber/skills/implementor/fragments/baseline-run.full.md, viber/skills/implementor/parts/close.md, viber/skills/implementor/fragments/final-review.true.md, tests/viber/lessons-prose.unit.test.ts, tests/viber/extras-prose.unit.test.ts, tests/viber/previous-review-prose.unit.test.ts, tests/viber/red-evidence-prose.unit.test.ts, tests/viber/ruling-prose.unit.test.ts, tests/viber/implementor-words.unit.test.ts
- Delivers: the coder and reviewer dispatch sections of step 4 reduced to the lines `task-step.sh` prints, the baseline fragments without their dispatch line, the close's own lessons call, and the word cap test.
- Verification: node --test tests/viber/implementor-words.unit.test.ts tests/viber/lessons-prose.unit.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/previous-review-prose.unit.test.ts tests/viber/red-evidence-prose.unit.test.ts tests/viber/ruling-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/final-review-prose.unit.test.ts tests/viber/roadmap-prose.unit.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: step 4 holds no labelled-line dispatch template and no `run-lessons` bookkeeping, stating that a dispatch sends the lines a directive prints plus the `add:` lines it names, and step 2's `deferred:` and `decision:` bullets name those printed lines instead of step 4's template; both `baseline-run` fragments end before their `baseline:` dispatch line; the repair coder of `parts/close.md` and the fix coder of `fragments/final-review.true.md` each carry the `run-lessons:` list of a `run-failures.sh --lessons` call made right before their dispatch, omitted on `lessons: none`; the prose tests hold the skill and both close files to these lines; `implementor-words.unit.test.ts` fails when `SKILL.md` exceeds `IMPLEMENTOR_WORD_CAP`, a constant set to the count after this task and below 3626
<!-- /TASK -->

## Contracts

### C1 - Directive output

File: viber/scripts/task-step.sh

```
An answer is one or more blocks, acted on in order, one block per message.
A block opens on a directive line:
  NEXT: <verb>[ | <field>]...             an action
  RUN: <one literal Bash line>            run exactly as written
  ASK: <answer> -> <event> | <answer> -> <event>[ | ...]
                                          one AskUserQuestion offering those answers; the chosen
                                          one's task-step.sh event is reported next; an answer with
                                          no "-> <event>" is "retry" of a refused commit (rerun the
                                          last RUN: line, then report its exit) or "abort" (step 7)
  STOP: <one sentence>                    report it and stop
A field is "<name>: <value>" or a bare "<name>".
Every following line up to the next directive line is a body line, "<label>: <value>",
sent verbatim in the prompt or message the verb names.
The field "add: <label>[, <label>]" names a body line the model appends, copied from the
return it holds:
  reason -> "reason: <the returned REASON>", or the commit's error after a refused commit
  repair -> "repair: <one line: the problem this pass fixes>"
```

### C2 - task-step.sh call

File: viber/scripts/task-step.sh

```
task-step.sh <plan> <subject> <started> <event> [<flag>...]
  <subject>  a task id; for "ruled", also baseline | tests | final-review | commit
  <started>  the run-clock.sh mark of this session
  state      .temp/viber/<task id>/state under the repository root (git rev-parse --show-toplevel),
             discarded when written under another <started>; "ruled" on baseline, tests,
             final-review or commit writes no state; the state is written only once the
             answer is complete; a "start" under a <started> of "unknown" discards any earlier
             state of the task and rewrites the lessons file, and later events of the session
             keep what that "start" wrote
  config     tiers.max and build.red-check read from config.sh's default block
  cwd        any directory inside the repository

events:
  start --tier <tier> --review <tier>|waived [--resume <path>[,<path>]...]
        (--resume takes the dirty: line's paths as printed; a path holding a comma is not supported)
  coder PASS|FAIL|DENIED [--dod <m>/<n>] [--red <n>|missing] [--red-log <path>] [--decide]
                         [--with <path>[,<path>]...] [--defer <id>:<path>[,<id>:<path>]...]
                         [--red-timeout]
  reviewer PASS|FAIL|DENIED [--report <path>] [--with <path>[,<path>]...]
  (an omitted --dod is no short DOD; --red-log, --report: the paths the return named)
  retry coder [--denied] | retry reviewer
  accept
  commit <exit code> [--landed]
  landed <sha>
  ruled --case decide|cap|baseline|tests|final-review|commit [--options "<a> | <b>"] [--refused]
  resume-failed
  repair
  skip

verbs:
  NEXT: coder | attempt: <n> | model: <tier> | review: <tier>|waived [| red-check: <result word>] [| add: ...]
        + coder lines (C3), resume: <paths> when start got --resume, report: <path> after a review
          failure, a ready reason line, decision: lines after a ruling
  NEXT: coder | repair: <n> | model: <tier> | review: <tier> | add: repair[, reason]
        + the same body lines
  NEXT: review | round: <r> | model: <tier> [| red-check: <result word>] [| add: repair]
        + reviewer lines (C3), report: <dir>/work/review-<id>-<r>.md, previous: <path> once a
          review of the task failed, red: <path>, red-check: <line>
  NEXT: commit                    then RUN: "<plugin root>/scripts/commit-task.sh" "<plan>" "<id>" [flags]
                                  (every RUN: line names a script under <plugin root> as C3 defines it)
  NEXT: done
  NEXT: hold | dependents: <ids>|none [| red-check: <result word>]
  NEXT: arbiter [| add: reason]   + case:, options:, task:, report:, ruling:, a ready reason line
  NEXT: resume                    + decision: lines, then the closing sentence
  NEXT: carry-out: <option>[ | mismatch]

ready reason lines, for a failure that returned no REASON:
  reason: DOD: <m>/<n>                                  a PASS with a short --dod
  reason: no red evidence                               a TDD: required PASS without --red or with --red 0
  reason: tests pass without the change: <files>        the red check's PASSED-WITHOUT-CHANGE

lessons: task-step.sh writes the session lessons file .temp/viber/lessons (first line
  "started: <started>", second the list, or nothing) from run-failures.sh --lessons "<dir>"
  before the session's first coder block and again on every "reviewer FAIL" event, through a
  temporary file renamed into place; a "lessons: none"
  answer or a non-zero exit of that call writes no list. plan-index.sh --dispatch prints its
  run-lessons: line from that file (C3).

#!/usr/bin/env bash, set -euo pipefail.
exit: 0 with an answer; 2 with "error: ..." on stderr for bad arguments, a plan plan-index.sh
refuses or an id the plan does not hold.
```

### C3 - Dispatch lines

File: viber/scripts/plan-index.sh

```
plan-index.sh <plan-file> --dispatch <task-id> coder|reviewer

coder, in this order, a line omitted when its value is empty:
  task: <dir>/tasks/<id>.md
  notes: <dir>/work/<id>-coder.md
  out: .temp/viber/<id>/
  refs: <plugin root>/references
  extras: <dir>/work/<id>-extra.md
  decide-file: <dir>/work/<id>-options.md
  baseline: <dir>/work/tests-baseline.md
  deferred: <path>, <path>
  prior: <dir>/work/<dep-id>-coder.md, ...
  decision: <task-id>: <text>
  run-lessons: <Name> x<n>[, <Name> x<n>]...   the second line of <repository root>/.temp/viber/lessons
                                              (C2), the run-failures list without its "lessons: "
                                              prefix, when that line is not empty

reviewer, in this order, a line omitted when its value is empty:
  task:, notes:, out:, refs:, baseline:, deferred:, decision:   as for the coder
  extras: <dir>/work/<id>-extra-review.md
  scope: "<plugin root>/scripts/plan-index.sh" "<plan>" --extra "<id>"

<dir> is the plan's directory as the plan path was given.
baseline: is printed only when build.baseline-tests, read from config.sh's default block, is fast or full.
<plugin root> is the invoked script path with its trailing "/scripts/<name>.sh" cut off as text,
never resolved (no cd, no pwd -P).
```

### C4 - Red check directive

File: viber/scripts/red-check.sh

```
red-check: FAIL-AS-EXPECTED <log>
NEXT: review

red-check: PASSED-WITHOUT-CHANGE <files>
NEXT: coder-failure | reason: tests pass without the change: <files>

red-check: UNRUNNABLE <reason>
NEXT: review
```

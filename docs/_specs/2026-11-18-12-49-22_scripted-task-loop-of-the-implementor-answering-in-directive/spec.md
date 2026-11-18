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

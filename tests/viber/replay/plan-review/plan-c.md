---
source: C:/Projects/viber/docs/_specs/2026-11-16-15-25-07_sharper-plans-and-fewer-wasted-build-attempts/plan.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Sharper plans and fewer wasted build attempts

## Goal

Plans should pass their review in fewer rounds and builds should waste fewer coder attempts. `plan-index.sh` rejects two mechanical plan mistakes, coders learn the test rules earlier tasks of the same run broke, a reviewer flags a whole class of a test-rule breach at once, a coder stalled on a contradiction gets the arbiter's ruling and continues, and the archive records the numbers that show whether it worked.

## Problem

A measurement over 5 plans and 35 blocking plan-review findings shows every plan failing its first review round. Four findings were an integration test written without any build or listing step in `Verification`, three were a `git grep` that can never see the files its own task creates. In one build (geodis.pricelister) later coders broke the same test rules (`Act`, `Single`) that earlier tasks had already been failed for, because each coder starts fresh and the failure trail is written only at the close. A reviewer fixing one duplicate test pointed at another duplicate as the one to keep, costing a second round. A coder returning `DECIDE:` on its first attempt is never sent to the arbiter: a fresh coder one tier up re-reads everything and usually hits the same contradiction. Nothing in the archive records review rounds, attempts or rulings counted, so none of this can be followed across machines.

## Current behaviour

- `viber/scripts/plan-index.sh` checks task fields but nothing about integration test files or `git grep`.
- `viber/scripts/run-failures.sh` writes `failures.md` at the close only; no coder hears of earlier review failures of the run.
- `viber/agents/task-reviewer.md` raises a blocking `test-strategy.md` rule "naming the rule", in no fixed spelling, one test at a time.
- `viber/skills/implementor/SKILL.md` sends a `DECIDE:` to the arbiter only from attempt 2 on and always runs a fresh coder after the ruling.
- The final summary (`outcome.md`) holds tasks committed, task review rounds, the test verdict, the rulings and token lines; no plan review rounds, no attempts per task, no ruling count.

### Must not change

- The `- Blocking [<cause>] <path>:<line> - <what is wrong>` item line and its four causes, and the `failures.md` trail and its `failures:` line.
- `hooks/scripts/plan-gate.sh` and the rule that every review-set member passes after the last plan write.
- The repair pass: a `DECIDE:` there is never sent to the arbiter, and a failed repair pass goes to `case: cap`.
- The 5-attempt limit, the tier climb per attempt, and attempt 5 holding the task without an arbiter.

## Behaviour

### S1 - plan-index rejects two Verification mistakes [NEW]

Given a task writing a file under an integration test directory whose `Verification` names neither that file nor its project directory, or a task whose `Verification` runs `git grep` without `--untracked` over a file the task creates
When `plan-index.sh` validates the plan
Then it rejects the plan with one error naming the task, the path and the fix.

### S2 - Coders hear the run's broken test rules [NEW]

Given task reviews of this run already failed on test-strategy `Act` twice and `Single` once
When the next coder is dispatched
Then its dispatch carries `run-lessons: Act x2, Single x1` and it checks its tests against those rules before returning PASS; reviewers get no such line.

### S3 - A reviewer flags the whole class [CHANGED - was: one test per finding]

Given a task whose tests break test-strategy `Single` in two places
When the reviewer fails it
Then one finding names every test of the task breaking `Single`, and a test the fix keeps breaks none of the rules raised.

### S4 - A stalled coder continues after the ruling [CHANGED - was: arbiter from attempt 2 on, then a fresh coder]

Given a coder returning `DECIDE:` on any attempt from 1 to 4, having finished every clause the dispute does not touch
When the arbiter rules
Then the ruling is recorded as today and the same coder is resumed with the `decision:` line, in the same attempt and at the same tier.

### S5 - The archive records the build's effort [NEW]

Given a finished build
When the close writes its summary
Then it carries the plan review rounds, the attempts of every task needing more than one, and the number of rulings, and `outcome.md` keeps them.

### Edge cases

- No failed task review yet, or none naming a test-strategy rule -> `lessons: none` and no `run-lessons` line on the dispatch.
- A finding repeated verbatim across review rounds of one task -> counted once.
- A `SendMessage` refused or the resumed coder failing -> the next attempt, a fresh coder with every `decision:` line, as today.
- A resumed coder returning `DECIDE:` again -> the arbiter again, then the same coder resumed again, within the same attempt.
- No transcript of the plan's review on this machine, or a run landed before this change -> `rounds: plan review unavailable - <reason>`.
- A review dispatched again in one round (a retry after a refused call or a missing verdict) -> counted as a round of its own; the count is an upper bound.
- A build resumed in a new session -> attempts count from that session only, as the 5-attempt limit does; earlier sessions' attempts are not in the line.
- A `Verification` naming the integration test only inside a `grep`, `git grep` or `rg` command -> rejected, since no build or listing step reads it.
- A path with `integration` in a segment that is not a test directory (`third-party-integrations.md`) -> not checked.
- `git grep --untracked` or plain `grep` over a new file -> accepted.

## Glossary

- Run lessons - the test-strategy rules this run's task reviews already raised, with how often; what a later coder checks first. Not the failure trail, which is written once at the close.
- Resume - the same coder continuing its task with everything it already read and did, after a ruling; not a new attempt.

## Acceptance criteria

1. `plan-index.sh` rejects a task writing a file under an integration test directory whose `Verification` has no build or listing step for it - no command other than a `grep`, `git grep` or `rg` naming the file or a directory of it at or below that test directory - and a task whose `Verification` runs `git grep` without `--untracked` over a file the task creates.
2. Every coder dispatched after a failed task review that named test-strategy rules, the final-review fix coder and the repair coder included, carries a `run-lessons:` line with those rules and their counts, printed by `run-failures.sh --lessons`; reviewers carry none.
3. `task-reviewer` names a test-strategy rule as test-strategy `` `<Name>` ``, lists in one finding every test the task wrote or changed that breaks that rule, and never keeps a test that breaks a rule it raised.
4. A `DECIDE:` on attempts 1 to 4 goes to the arbiter at once and the same coder is resumed with the ruling in the same attempt; the coder finishes every clause the dispute does not touch before returning `DECIDE:`.
5. The final summary, and so `outcome.md`, carries the plan review rounds, the attempts of every task needing more than one, and the number of rulings.

## Scope

### File map

- modify - viber/scripts/plan-index.sh - the two new Verification checks
- modify - tests/viber/plan-index.test.ts - cases for both checks
- modify - viber/references/plan-rules.md - the `(script)` halves naming both checks
- modify - tests/viber/test-pyramid-prose.unit.test.ts - the plan-rules size cap and the reviewer's new pins
- modify - tests/viber/rule-budget.unit.test.ts - the read-set caps the change outgrows
- modify - viber/scripts/run-failures.sh - the `--lessons` mode
- modify - tests/viber/run-failures.test.ts - cases for `--lessons`
- modify - viber/agents/task-reviewer.md - rule spelling and whole-class findings
- modify - viber/agents/task-coder.md - `run-lessons`, finishing undisputed work, resume
- modify - viber/skills/implementor/SKILL.md - lessons call and line, arbiter on every attempt, resume
- add - tests/viber/lessons-prose.unit.test.ts - pins of the lessons hand-off
- modify - tests/viber/ruling-prose.unit.test.ts - pins of the resume flow
- modify - viber/agents/arbiter.md - an option is work the continuing coder or a later attempt does
- modify - viber/scripts/plan-path.sh - the landed copy keeping the plan-mode path
- modify - tests/viber/plan-path.test.ts - cases for that key
- modify - viber/scripts/run-tokens.sh - the plan review rounds line
- modify - tests/viber/run-tokens.test.ts - cases for the rounds line
- modify - viber/skills/implementor/parts/close.md - attempts and rulings lines
- modify - tests/viber/close-part-prose.unit.test.ts - pins of those lines
- modify - viber/README.md, viber/skills/setup/assets/help.html - whole-class review findings, run lessons, the effort lines of the summary and the arbiter flow, for users

### Out of scope

- Partial plan review rounds and any change to `hooks/scripts/plan-gate.sh`.
- Splitting the planner into subagents and a separate test reviewer.
- A coder starting the arbiter itself in the background (a separate experiment first).
- `final-reviewer.md` rule spelling and the repair pass's `DECIDE:` handling.
- `CLAUDE.md` nodes naming the changed behaviour: the build's memory close updates them.

## Solution requirements

- Every script works on Windows (Git Bash) and macOS, no heredoc, no bash-only syntax in a `#!/bin/sh` script.
- A read-set or file byte cap is raised only by the task whose text outgrows it, to the new size.
- `implementor` opens no file: the lessons and rounds reach it only as script stdout.
- A run landed before this change has no record of its plan-mode path; its rounds line reads unavailable, never an error.

## Tasks

<!-- TASK -->
### T1 - Reject an unnamed integration test in Verification
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: none
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/references/plan-rules.md, tests/viber/test-pyramid-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts
- Delivers: the integration test check of `plan-index.sh`, its `(script)` rule in `plan-rules.md`, and the caps raised to the new sizes
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts -> every case passes
- DoD: a task listing `backend/A.IntegrationTests/StoreTests.cs` with a `Verification` naming neither that path nor a directory prefix of it ending at or below `backend/A.IntegrationTests` makes `plan-index.sh` exit 4 with the C1 integration error naming that path; the same task with `dotnet build backend/A.IntegrationTests/A.IntegrationTests.csproj` in its `Verification` exits 0, while one naming that path only in `grep -c Store backend/A.IntegrationTests/StoreTests.cs src/Store.cs` exits 4, a `grep`, `git grep` or `rg` command never counting as naming it, commands being split at `;`, `,`, `&&`, `||` and `|`; a path whose directory segment is `integration` (`tests/integration/store.test.ts`) or matches `integration[-_.]?tests?` case-insensitively, or whose file name holds `.integration.` (`src/store.integration.test.ts`), is checked the same way, while a file name alone matching the segment pattern (`docs/third-party-integrations.md`, `viber/references/integration-tests.md`) is not checked; the check runs only on a plain validate call with no `status.md` beside the plan, and is skipped under `--split` and `--extra`; `plan-rules.md` carries the rule tagged `(script)` under its `Layered` name, placed after the `(review)` half so the readers of the first `- Layered:` line still read the review rule
<!-- /TASK -->

<!-- TASK -->
### T2 - Reject git grep blind to a new file
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: T1
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/references/plan-rules.md, tests/viber/test-pyramid-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts
- Delivers: the `git grep` check of `plan-index.sh`, its `(script)` rule in `plan-rules.md`, and the caps raised to the new sizes
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts -> every case passes
- DoD: a task whose `Verification` runs `git grep -c readRuns -- tools/new.ts`, naming `tools/new.ts`, a `Files` path absent from the tree, exits 4 with the C1 git grep error naming that path; the same command with `--untracked` exits 0, and so does `grep -c readRuns tools/new.ts`; the same command over a path the tree already holds exits 0, and a `git grep` naming no path of the task's `Files` is not checked; the check runs only on a plain validate call with no `status.md` beside the plan, and is skipped under `--split` and `--extra`; `plan-rules.md` carries the rule tagged `(script)` under its `Provable` name, placed after the `(review)` half so the readers of the first `- Provable:` line still read the review rule
<!-- /TASK -->

<!-- TASK -->
### T3 - Print the run lessons from failed reviews
- TDD: required
- Covers: AC2
- Uses: C2
- Depends-on: none
- Files: viber/scripts/run-failures.sh, tests/viber/run-failures.test.ts
- Delivers: the `--lessons <run-dir>` mode of `run-failures.sh` printing the C2 line and writing nothing
- Verification: node --test tests/viber/run-failures.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: a run whose `work/` holds two failed reviews naming test-strategy `` `Act` `` and one naming `` `Single` `` prints `lessons: Act x2, Single x1`; an item copied verbatim from round 1 into round 2 of the same task counts once; a run with no review report, or none naming a rule, prints `lessons: none`; the mode writes no file and exits 0, and a missing run directory exits 2 with one `error:` line
<!-- /TASK -->

<!-- TASK -->
### T4 - Name the rule and flag its whole class in task review
- TDD: required
- Covers: AC2, AC3
- Uses: C2
- Depends-on: T2, T3
- Files: viber/agents/task-reviewer.md, tests/viber/test-pyramid-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts, viber/README.md, viber/skills/setup/assets/help.html
- Delivers: `task-reviewer` spelling a blocking test-strategy rule as test-strategy `` `<Name>` `` and listing every test of the task breaking it in one finding, and the guides saying so in both languages
- Verification: node --test tests/viber/test-pyramid-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/failure-trail-prose.unit.test.ts tests/viber/previous-review-prose.unit.test.ts tests/viber/help.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/red-evidence-prose.unit.test.ts tests/viber/ui-tells.unit.test.ts -> every case passes
- DoD: the `Tested` bullet names a breached `test-strategy.md` rule as test-strategy followed by its label in backticks; it lists in one finding every test the task wrote or changed that breaks the same rule; a test its fix tells the coder to keep breaks none of the rules the report raises; `README.md` and both languages of `help.html` say a test-rule finding covers every test of the task breaking that rule; the task-reviewer read set stays within its cap, raised to the new size
<!-- /TASK -->

<!-- TASK -->
### T5 - Keep the plan-mode path in the landed plan
- TDD: required
- Covers: AC5
- Uses: C5
- Depends-on: none
- Files: viber/scripts/plan-path.sh, tests/viber/plan-path.test.ts
- Delivers: `plan-path.sh --land` writing the C5 `planned:` line into the landed copy's frontmatter beside the rewritten `source:` line
- Verification: node --test tests/viber/plan-path.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: landing a plan-mode file `C:/plans/p.md` whose frontmatter names `source: C:/plans/p.md` leaves the copy's `source:` pointing at the copy, as today, and adds `planned: C:/plans/p.md` right after it, the value being the `--land` source argument resolved to an absolute path the way the copy's own `source:` is resolved (the mixed `C:/` form where `cygpath` exists); a plan whose frontmatter already holds a `planned:` line keeps that line unchanged on a later landing; a frontmatter with no `source:` line gets no `planned:` line either, and a plan without frontmatter is left as it is
<!-- /TASK -->

<!-- TASK -->
### T6 - Count the plan review rounds in the token report
- TDD: required
- Covers: AC5
- Uses: C4
- Depends-on: none
- Files: viber/scripts/run-tokens.sh, tests/viber/run-tokens.test.ts
- Delivers: `run-tokens.sh` printing the C4 rounds line after its token lines, read from the `planned:` line of the run's `plan.md`
- Verification: node --test tests/viber/run-tokens.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: a run whose `plan.md` names `planned: C:/plans/p.md`, with three transcripts of an agent type ending in `:planner-review` and one ending in `:planner-graph-review` whose first line names that path, the backslash form included, prints `rounds: plan review 4`, a review transcript last written before the day of the run key counting too, and every such transcript counting once, a retried dispatch included; transcripts of other agent types or naming another path do not count; a `plan.md` with no `planned:` line prints `rounds: plan review unavailable - no planned line in plan.md`; no matching transcript prints `rounds: plan review unavailable - no review transcript names the plan`; each `tokens: unavailable - <reason>` line, for every one of its three reasons, is followed by the rounds line, `rounds: plan review unavailable - no projects directory` when the projects directory is missing; the token lines stay byte for byte as today
<!-- /TASK -->

<!-- TASK -->
### T7 - Record attempts and rulings in the final summary
- TDD: required
- Covers: AC5
- Uses: C4
- Depends-on: T4, T6
- Files: viber/skills/implementor/parts/close.md, tests/viber/close-part-prose.unit.test.ts, viber/README.md, viber/skills/setup/assets/help.html
- Delivers: the final summary carrying the C4 attempts and arbiter lines outside its 7 lines, in both forms, and the guides naming the three effort lines in both languages
- Verification: node --test tests/viber/close-part-prose.unit.test.ts tests/viber/roadmap-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/help.unit.test.ts -> every case passes
- DoD: right after the token lines, in both forms and outside the 7 lines, `close.md` prints the C4 `attempts:` line listing every task needing more than one attempt this session with its count, `attempts: none` otherwise; it then prints the C4 `arbiter:` line counting the index `ruling:` lines plus every ruling this session recorded that is not already one; both lines reach `closeout`'s `summary:` and so `outcome.md`; `README.md` and both languages of `help.html` name the `rounds:`, `attempts:` and `arbiter:` lines of the summary
<!-- /TASK -->

<!-- TASK -->
### T8 - Hand the run lessons to every later coder
- TDD: required
- Covers: AC2
- Uses: C2
- Depends-on: T7
- Files: viber/skills/implementor/SKILL.md, viber/skills/implementor/fragments/final-review.true.md, viber/skills/implementor/parts/close.md, viber/agents/task-coder.md, tests/viber/lessons-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts, viber/README.md, viber/skills/setup/assets/help.html
- Delivers: `implementor` calling `run-failures.sh --lessons` before its first coder dispatch and after each failed task review and passing `run-lessons:` to every coder dispatch, the final-review fix and step 5 repair coders included, `task-coder` checking those rules first, and the guides saying so in both languages
- Verification: node --test tests/viber/lessons-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/ruling-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/red-evidence-prose.unit.test.ts tests/viber/previous-review-prose.unit.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/resume-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/final-review-prose.unit.test.ts tests/viber/ui-tells.unit.test.ts tests/viber/help.unit.test.ts tests/portability.unit.test.ts -> every case passes; grep -c -- "--lessons" viber/scripts/run-failures.sh viber/skills/implementor/SKILL.md -> both counts above 0
- DoD: `implementor` runs `run-failures.sh --lessons "<dir>"` once before its first coder dispatch of the session and again after every reviewer `VERDICT: FAIL` of a task, keeping the last `lessons:` line; every coder dispatch with a task file carries `run-lessons:` with that list unless the line reads `lessons: none`, and so do the final-review fix coder's dispatch in `final-review.true.md` and the step 5 repair coder's dispatch in `parts/close.md`; no reviewer dispatch carries it; `task-coder.md` checks every test it wrote or changed against the `run-lessons` rules before returning PASS; `README.md` and both languages of `help.html` say later coders get the rules earlier reviews of the run raised; the task-coder read set stays within its cap, raised to the new size
<!-- /TASK -->

<!-- TASK -->
### T9 - Resume the stalled coder with the arbiter's ruling
- TDD: required
- Covers: AC4
- Uses: C3
- Depends-on: T8
- Files: viber/skills/implementor/SKILL.md, viber/agents/task-coder.md, viber/agents/arbiter.md, tests/viber/ruling-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts, viber/README.md, viber/skills/setup/assets/help.html
- Delivers: the arbiter called on a `DECIDE:` of attempts 1 to 4, the same coder resumed with the C3 message in the same attempt, the coder finishing undisputed work before `DECIDE:`, and the guides saying so in both languages
- Verification: node --test tests/viber/ruling-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/viber/help.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/red-evidence-prose.unit.test.ts tests/viber/previous-review-prose.unit.test.ts tests/viber/close-part-prose.unit.test.ts tests/viber/resume-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/final-review-prose.unit.test.ts tests/viber/ui-tells.unit.test.ts tests/viber/lessons-prose.unit.test.ts -> every case passes
- DoD: the `Coder failure on attempt 1 to 4` bullet sends any `DECIDE:` to the arbiter, records the ruling and decision as today, then sends that coder the C3 message, the attempt count and tier unchanged; a refused `SendMessage` or a failure of the resumed coder leads to the next attempt with every `decision:` line, and a second `DECIDE:` of the resumed coder goes to the arbiter again; `task-coder.md` finishes every `DoD` clause the dispute does not touch before returning `DECIDE:`, and on a C3 message applies the `decision:` line and returns its output lines again; `arbiter.md` states an option is work the continuing coder or a later attempt does; `README.md` and both languages of `help.html` describe the arbiter ruling on the first `DECIDE:` and the same coder continuing
<!-- /TASK -->

## Contracts

### C1 - plan-index Verification errors

File: viber/scripts/plan-index.sh

```
error: task <id>: Files writes <path> under an integration test directory, which no Verification command names - list or type-check that file or its test project there (Layered)
error: task <id>: Verification runs git grep without --untracked over <path>, which this task creates and git grep never reads - add --untracked or use grep (Provable)
```

### C2 - Run lessons

File: viber/scripts/run-failures.sh, viber/agents/task-reviewer.md, viber/skills/implementor/SKILL.md, viber/agents/task-coder.md

```
Reviewer spelling inside a Blocking item's first line:  test-strategy `<Name>`
  <Name> is a rule label of test-strategy.md (Single, Act, Earned ...)

run-failures.sh --lessons <run-dir>
  reads  : <run-dir>/work/review-*.md, the first line of every Blocking item
  stdout : lessons: <Name> x<n>[, <Name> x<n>...]   sorted by count descending, then name
           lessons: none
  writes : nothing
  exit   : 0; 2 on unusable argv or a missing run directory, one error: line on stderr

Coder dispatch line:  run-lessons: <Name> x<n>[, <Name> x<n>...]
```

### C3 - Coder resume message

File: viber/skills/implementor/SKILL.md, viber/agents/task-coder.md

```
decision: <task-id>: <text>
...one line per index decision: line and per --decide this build recorded, for this task and the tasks it depends on
Continue the task under these decisions, then return your output lines again.
```

### C4 - Effort lines of the final summary

File: viber/scripts/run-tokens.sh, viber/skills/implementor/parts/close.md

```
rounds: plan review <n>
rounds: plan review unavailable - <reason>
  <reason>: no projects directory | no planned line in plan.md | no review transcript names the plan
attempts: <id> <n>[, <id> <n>...]
attempts: none
arbiter: <n>
```

### C5 - Landed plan's planned line

File: viber/scripts/plan-path.sh

```
---
source: <absolute path of the landed copy, forward slashes>
planned: <absolute path of the plan-mode file it was landed from, forward slashes>
...the rest of the frontmatter unchanged
---
```

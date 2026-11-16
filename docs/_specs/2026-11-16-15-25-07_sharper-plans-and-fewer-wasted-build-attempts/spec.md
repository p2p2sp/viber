To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Sharper plans and fewer wasted build attempts

## Goal

Plans should pass their review in fewer rounds and builds should waste fewer coder attempts. The planner sees the code its change reaches, `plan-index.sh` rejects two mechanical plan mistakes, coders learn the test rules earlier tasks of the same run broke, a reviewer flags a whole class of a test-rule breach at once, a coder stalled on a contradiction gets the arbiter's ruling and continues, and the archive records the numbers that show whether it worked.

## Problem

A measurement over 5 plans and 35 blocking plan-review findings (`attachments/blocking.txt`) shows every plan failing its first review round. About a third of the findings are code reach the planner never saw: a test counting the solution's projects, a test double implementing an interface that gains a member, a project file listing linked sources, the callers of a constructor gaining a parameter. Four findings were an integration test written without any build or listing step in `Verification`, three were a `git grep` that can never see the files its own task creates. In one build (geodis.pricelister) later coders broke the same test rules (`Act`, `Single`) that earlier tasks had already been failed for, because each coder starts fresh and the failure trail is written only at the close. A reviewer fixing one duplicate test pointed at another duplicate as the one to keep, costing a second round. A coder returning `DECIDE:` on its first attempt is never sent to the arbiter: a fresh coder one tier up re-reads everything and usually hits the same contradiction. Nothing in the archive records review rounds, attempts or rulings counted, so none of this can be followed across machines.

## Current behaviour

- `viber/skills/planner/SKILL.md` skips the reach map when the change only adds files, and `viber/agents/impact-mapper.md` searches imports, calls, tests, mocks, fixtures, strings and documents of the files and symbols a change modifies, moves or deletes.
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

### S1 - Reach mapped for a change that adds files [CHANGED - was: no map when nothing existing changes]

Given a plan adding a new project to a solution whose test counts the solution's projects
When the planner maps the reach
Then `impact-mapper` returns the solution file and the counting test, and both land in a task's `Files`.

### S2 - Reach includes implementers and constructor callers [CHANGED - was: imports, calls, tests, mocks, fixtures, strings, documents only]

Given a plan adding a member to an interface or a parameter to a constructor
When `impact-mapper` maps that symbol
Then every class implementing or deriving from it, test doubles included, and every place constructing it come back as `REF:` lines.

### S3 - plan-index rejects two Verification mistakes [NEW]

Given a task writing a file under an integration test directory whose `Verification` names neither that file nor its project directory, or a task whose `Verification` runs `git grep` without `--untracked` over a file the task creates
When `plan-index.sh` validates the plan
Then it rejects the plan with one error naming the task, the path and the fix.

### S4 - Coders hear the run's broken test rules [NEW]

Given task reviews of this run already failed on test-strategy `Act` twice and `Single` once
When the next coder is dispatched
Then its dispatch carries `run-lessons: Act x2, Single x1` and it checks its tests against those rules before returning PASS; reviewers get no such line.

### S5 - A reviewer flags the whole class [CHANGED - was: one test per finding]

Given a task whose tests break test-strategy `Single` in two places
When the reviewer fails it
Then one finding names every test of the task breaking `Single`, and a test the fix keeps breaks none of the rules raised.

### S6 - A stalled coder continues after the ruling [CHANGED - was: arbiter from attempt 2 on, then a fresh coder]

Given a coder returning `DECIDE:` on any attempt from 1 to 4, having finished every clause the dispute does not touch
When the arbiter rules
Then the ruling is recorded as today and the same coder is resumed with the `decision:` line, in the same attempt and at the same tier.

### S7 - The archive records the build's effort [NEW]

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

1. The planner maps the reach also of a change that only adds files, and `impact-mapper` returns implementers and subclasses of a changed type, the places constructing it, and the existing files that enumerate, count or link the set a new file joins.
2. `plan-index.sh` rejects a task writing a file under an integration test directory whose `Verification` has no build or listing step for it - no command other than a `grep`, `git grep` or `rg` naming the file or a directory of it at or below that test directory - and a task whose `Verification` runs `git grep` without `--untracked` over a file the task creates.
3. Every coder dispatched after a failed task review that named test-strategy rules, the final-review fix coder and the repair coder included, carries a `run-lessons:` line with those rules and their counts, printed by `run-failures.sh --lessons`; reviewers carry none.
4. `task-reviewer` names a test-strategy rule as test-strategy `` `<Name>` ``, lists in one finding every test the task wrote or changed that breaks that rule, and never keeps a test that breaks a rule it raised.
5. A `DECIDE:` on attempts 1 to 4 goes to the arbiter at once and the same coder is resumed with the ruling in the same attempt; the coder finishes every clause the dispute does not touch before returning `DECIDE:`.
6. The final summary, and so `outcome.md`, carries the plan review rounds, the attempts of every task needing more than one, and the number of rulings.

## Scope

### File map

- modify - viber/scripts/plan-index.sh - the two new Verification checks
- modify - tests/viber/plan-index.test.ts - cases for both checks
- modify - viber/references/plan-rules.md - the `(script)` halves naming both checks
- modify - tests/viber/test-pyramid-prose.unit.test.ts - the plan-rules size cap and the reviewer's new pins
- modify - tests/viber/rule-budget.unit.test.ts - the read-set caps the change outgrows
- modify - viber/agents/impact-mapper.md - new-file targets, implementations, constructors, collections
- modify - viber/skills/planner/SKILL.md - the reach step also for added files
- add - tests/viber/impact-mapper-prose.unit.test.ts - pins of the reach contract
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
- modify - viber/README.md, viber/skills/setup/assets/help.html - the reach map, whole-class review findings, run lessons, the effort lines of the summary and the arbiter flow, for users

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

## Attachments
docs/_specs/2026-11-16-15-25-07_sharper-plans-and-fewer-wasted-build-attempts/attachments/blocking.txt

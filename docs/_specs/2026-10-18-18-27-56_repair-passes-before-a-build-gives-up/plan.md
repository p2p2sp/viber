---
source: /Users/dario/Projects/p2p2.claude/docs/_specs/2026-10-18-18-27-56_repair-passes-before-a-build-gives-up/plan.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Repair passes before a build gives up

## Goal

When a coding agent leaves a problem behind, the build tries to repair it with a repair pass at the end, before the final review, instead of only writing it into `outcome.md`. When the repair does not help either, the close still says in one sentence whether `outcome.md` records a problem, so the user knows if the file needs reading.

## Problem

In real builds (the Skryba project), coders left code without its own test and named no task to prove it, and no other task claimed the path. The build listed those paths in the summary and moved on, and the user had to ask for a follow-up task by hand. In the latest run the implementor improvised a task file (`work/T19.md`) for this, breaking its own rule that it writes no file, with no script support. A task past its 5 attempts is ruled `skip` (with every dependent) or `accept` (unreviewed) at once, with no further try that sees the finished build. The archived close prints only counts and the `outcome.md` path, so the user cannot tell from the screen whether anything was left open.

## Current behaviour

- A path a coder defers to no task goes to the earliest unfinished task claiming it; a path no task claims is named in the final summary and nothing proves it.
- A coder failure, review failure or refused commit on attempt 5 dispatches the arbiter at once: skip drops the task and every task depending on it, accept commits it unreviewed.
- The archived close prints the task count, the test verdict and the time, then the `outcome.md` path, then, with a next roadmap part, the command starting it. The screen form prints the final summary.
- `closeout` tells the build whether it archived and how far the specification drifted, but not how many files it left uncommitted.

### Must not change

- The final test run's repair rounds and the final review's single fix round, and every arbiter case but the attempt limit.
- A path deferred to a named task, and a path deferred to no task that some unfinished task claims, are handled as today.
- `implementor` opens no file and writes no file.
- A resumed session starts every task's attempts over, a held task included: the hold is not recorded.
- An archived build still shows its short close with the next roadmap part's command; on the screen form that command stays the last line.

## Behaviour

### S1 - A deferred path no task claims gets a repair pass [CHANGED - was: named in the final summary]

Given task T4 defers `scripts/build.sh` to no task and no unfinished task claims that path
When every plan task is settled
Then the build runs a repair pass of T4 that proves the path with its own test, reviews it and commits it, and the path is not named in the summary

### S2 - A task past its attempts is repaired before the arbiter rules [CHANGED - was: the arbiter ruled at once]

Given task T3 fails its 5th attempt and T6 depends on it
When the failure returns
Then T3 and T6 wait while the other tasks go on; once nothing else can run, a repair pass of T3 runs at the highest allowed tier with the reports of its attempts; on success T3 is committed and T6 runs normally; after 2 failed repair attempts the arbiter rules accept or skip as before

### S3 - The close says whether outcome records a problem [NEW]

Given a build ends
When the close is printed, archived or on screen
Then one sentence, in the conversation's language, says either that all is clear or that `outcome.md` records a problem, naming each kind found, including files `closeout` itself left uncommitted

### Edge cases

- A repair pass coder defers a path to no task -> no second repair: the path is named in the summary as a deferred path without an owner.
- An owed-path repair pass fails both attempts -> the path is named in the summary as a deferred path without an owner, and every file that pass changed is named left uncommitted with the failed repair as its reason, so nothing broken is committed.
- A repair pass of a committed task whose work was already complete, so its commit has nothing to commit -> the repair counts as done.
- A held task's repair commit commits nothing -> the same question as any task commit that committed nothing.
- A repair pass commit refused for any other reason -> it costs one of the 2 attempts.
- A session resumed before a repair pass ran -> the owed path is still listed and gets its repair pass; a path already repaired is not repaired again.
- Both kinds of repair are due -> held tasks first, then owed paths, in index order, one repair pass at a time.
- `closeout` leaves a file uncommitted -> the sentence names uncommitted files even when the build's own summary named none.
- Only `OWNER:` lines or drift markers in `outcome.md` -> the sentence says all is clear.
- A roadmap with a next part -> the sentence comes before the next-part line.

## Glossary

- Repair pass - one extra run of a plan task's coder, after every other plan task is settled and before the final review, aimed at one problem that task left; not a new plan task and not the final test run's repair dispatch.
- Owed path - a path a task deferred to no task that no unfinished task claims: the task owes its proof.
- Held task - a task past its 5 attempts, waiting with its dependents for its repair pass; not skipped.

## Acceptance criteria

1. A path a task defers to no task, with no unfinished task claiming it, is recorded as owed by that task in the run's state, survives a resumed session, and once every plan task is settled that task gets a repair pass proving it; a repaired path is no longer listed as owed and never reaches the final summary.
2. A task failing attempt 5 waits with every task depending on it while the rest of the plan goes on; its repair pass runs at the highest allowed tier with the notes and review reports of its attempts; a passing repair commits the task and releases its dependents; only a failed repair pass hands the task to the arbiter.
3. A repair pass is the task's own coder, told which problem to fix, always reviewed against the task's done conditions, at most 2 attempts, shown as its own task-list entry, committed under the task, run one at a time; a path a repair pass defers to no task is named in the summary, never repaired again.
4. The archived close and the screen form both carry one sentence in the conversation's language: all clear, or `outcome.md` records a problem naming each kind among skipped task, commit without review, tests accepted while failing, final review fix accepted over a failed recheck, file left uncommitted, deferred path without an owner.
5. `closeout` reports how many files it left uncommitted, so the sentence counts them.
6. `viber/README.md`, `viber/docs/configuration.md` and `help.html` (English and Polish) describe the repair pass and the closing sentence.

## Scope

### File map

- modify - viber/scripts/commit-task.sh - records owed paths and repaired tasks in `status.md`
- modify - viber/scripts/plan-index.sh - lists the owed paths not yet repaired
- modify - tests/viber/commit-task.test.ts - proves the owed and repaired records and re-committing a done task with extras
- modify - tests/viber/plan-index.test.ts - proves the owed listing
- modify - viber/agents/task-coder.md - the repair line and how a repair pass works
- modify - viber/agents/task-reviewer.md - gating a repair pass
- add - tests/viber/repair-prose.unit.test.ts - pins the repair pass and closing sentence prose
- modify - viber/skills/implementor/SKILL.md - owed paths, held tasks, the repair pass, the closing sentence
- modify - viber/agents/arbiter.md - the attempt limit reached only after a failed repair pass
- modify - viber/agents/closeout.md - the leftover count line
- modify - viber/skills/implementor/fragments/cleanup.true.md - the archived close it points to
- modify - viber/README.md - "When it decides for you" and the close description
- modify - viber/docs/configuration.md - the `build.cleanup` detail
- modify - viber/skills/setup/assets/help.html - the build card's stall bullet, the `skill-implementor` Start entry, `ts-task-fails`, the summary paragraph
- modify - viber/skills/setup/assets/viber-flow-en.svg - the attempts lines of the `task-coder` and `task-reviewer` nodes
- modify - viber/skills/setup/assets/viber-flow-pl.svg - the same lines in Polish
- modify - docs/viber-functions.html - the build list's deferral line and the Arbiter list's attempts line

### Out of scope

- `viber/docs/files.md`: it describes `outcome.md` and the progress file without their lines, which stays true.
- Coder notes reporting gaps under `PASS`, `OWNER:` lines, the final test run, the final review, a commit refused twice.
- Removing an entry from a `status.md` line: records stay append-only.

## Solution requirements

- Every file in English; no em or en dash anywhere; no heredoc.
- The two scripts keep working on Windows (Git Bash) and macOS, `tests/portability.unit.test.ts` passing.
- `tests/viber/extras-prose.unit.test.ts`, `ruling-prose.unit.test.ts` and `roadmap-prose.unit.test.ts` keep passing.
- Token budget: the repair pass text in `SKILL.md` stays one short section; no new agent and no file read by `implementor`.

## Tasks

<!-- TASK -->
### T1 - Record owed paths and repaired tasks
- TDD: required
- Covers: AC1
- Uses: C2
- Depends-on: none
- Files: viber/scripts/commit-task.sh, viber/scripts/plan-index.sh, tests/viber/commit-task.test.ts, tests/viber/plan-index.test.ts
- Delivers: the `--owe` flag of the task commit and the `--repaired` form of `commit-task.sh`, writing the `owed:` and `repaired:` lines of `status.md`, and `plan-index.sh` printing the `owed:` line without entries of repaired tasks, both headers documenting them
- Verification: node --test tests/viber/commit-task.test.ts tests/viber/plan-index.test.ts -> every test passes
- DoD: a task commit with `--owe "<path>"` records `<id>:<path>` on the `owed:` line of `status.md` in the same commit, asserted by `commit-task.test.ts`; `--repaired "<plan>" "<id>"` adds the id to the `repaired:` line, makes no commit, exits 0, exits 3 on an unknown id and 2 on a task not done, asserted by `commit-task.test.ts`; committing a done task again stages a new unclaimed path from its `work/<id>-extra.md`, asserted by `commit-task.test.ts`; `plan-index.sh` prints `owed:` with every entry whose id is not on `repaired:` and no `owed:` line when none is left, asserted by `plan-index.test.ts`; both script headers name the new forms and lines, asserted by the same two tests
<!-- /TASK -->

<!-- TASK -->
### T2 - Teach task-coder and task-reviewer the repair pass
- TDD: required
- Covers: AC3
- Uses: C1
- Depends-on: none
- Files: viber/agents/task-coder.md, viber/agents/task-reviewer.md, tests/viber/repair-prose.unit.test.ts
- Delivers: a `repair` input bullet in both agents: for the coder, the task's earlier work is already in the tree and possibly committed, the line names the one problem to fix, it first reads its notes file and every review report of the task in the same `work/` directory, and `deferred` paths on a repair pass are the task's own, each proven by its own test, which it runs besides `Verification`; the coder's `FILES:` output line also due on a repair pass; for the reviewer, the gate covers the problem the line names and the task's `DoD` as a whole, the committed part proven by running `Verification`, not by the diff alone, and the test a repair pass added for a `deferred` path run as well
- Verification: node --test tests/viber/repair-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts -> every test passes
- DoD: `task-coder.md` carries one `## Input` bullet opening ``- A `repair` line`` naming the work already in the tree, the problem the line names, the notes file and `review-<id>-*.md` reports beside it read first, and the new test of a `deferred` path run besides `Verification`, asserted by `repair-prose.unit.test.ts`; `task-coder.md`'s existing `deferred` bullet is extended in its own sentence to a repair pass's own paths, with no second `deferred` bullet, asserted by the same test; `task-coder.md`'s `FILES:` output line is extended in place to a repair pass, asserted by the same test; `task-reviewer.md` carries one `## Input` bullet opening ``- A `repair` line`` that gates the named problem and the whole `DoD` through `Verification` and runs the test a repair pass added for a `deferred` path, asserted by the same test; both agents keep their `VERDICT:` output lines unchanged, asserted by the same test
<!-- /TASK -->

<!-- TASK -->
### T3 - Repair owed paths before the final review
- TDD: required
- Covers: AC1, AC3
- Uses: C1, C2, C3
- Depends-on: T1, T2
- Files: viber/skills/implementor/SKILL.md, tests/viber/repair-prose.unit.test.ts
- Delivers: in `implementor`, a path deferred to no task with no unfinished claimant recorded through `--owe` on the task's commit, the index `owed:` line carried from step 2, and one short repair pass section in step 4 for owed paths, distinct by name from step 5's repair dispatch
- Verification: node --test tests/viber/repair-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/ruling-prose.unit.test.ts tests/viber/roadmap-prose.unit.test.ts -> every test passes
- DoD: step 4's commit bullet records a `-> none` path no unfinished task claims through `--owe`, the sentence "a path no task claims is named in the final summary" is gone, and step 2 carries the index `owed:` line to the repair passes, asserted by `repair-prose.unit.test.ts`; the repair pass section starts passes only when nothing is in flight and nothing is ready, runs them one at a time in index order, and states that a repair pass is a coder dispatch of the task, never step 5's repair dispatch, asserted by the same test; the section gives an owed-path pass the tier of the task's last attempt and its review tier raised to `sonnet`, never waived, and the task's ordinary dispatch lines plus `repair:` and `deferred:`, asserted by the same test; the section allows at most 2 attempts, a coder failure (a `DECIDE:` line included, never sent to the arbiter), a review failure and a refused commit other than exit 4 each costing one, and opens the C3 task-list entry, asserted by the same test; an owed-path pass commits through the task commit form, its exit 4 after a reviewer `PASS` counting as done, and calls `--repaired` once it succeeds, a `--repaired` call exiting non-zero named in the final summary with no question, asserted by the same test; an owed-path pass failing both attempts names its paths in the summary as deferred paths without an owner and one `left uncommitted: <path> | repair pass of <id> failed` line per path on the union of both attempts' `FILES:` and `EXTRA:` lines, and a path any repair pass defers to no task goes to the summary as a deferred path without an owner, asserted by the same test
<!-- /TASK -->

<!-- TASK -->
### T4 - Hold a task past its attempts for a repair pass
- TDD: required
- Covers: AC2, AC3
- Uses: C1, C3
- Depends-on: T3
- Files: viber/skills/implementor/SKILL.md, viber/agents/arbiter.md, tests/viber/repair-prose.unit.test.ts
- Delivers: a task failing attempt 5 held with its dependents instead of going to the arbiter, its repair pass run first among due passes at `tiers.max`, and the arbiter's attempt-limit case reached only after a failed repair pass
- Verification: node --test tests/viber/repair-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/ruling-prose.unit.test.ts tests/viber/roadmap-prose.unit.test.ts -> every test passes
- DoD: the attempt-5 failure bullet of step 4 holds the task and every task depending on it, without the arbiter, asserted by `repair-prose.unit.test.ts`; the repair pass section runs held tasks before owed paths, a held task's pass at `tiers.max` for coder and reviewer, with the task's ordinary dispatch lines plus `repair:` and the last failure's `reason:`, the coder reading every review report of the task itself, asserted by the same test; a passing held task is committed through its own task commit, its exit 4 handled as step 4's commit exit 4, and its dependents dispatch as ordinary tasks, asserted by the same test; after 2 failed repair attempts the arbiter gets `case: cap` with the same options as before, `report:` lines for the task's coder notes and its last `REVIEW` path, and `reason:` the repair's last failure, asserted by the same test; `arbiter.md`'s `cap` line names the failed repair pass, asserted by the same test
<!-- /TASK -->

<!-- TASK -->
### T5 - Close every build on one problem sentence
- TDD: required
- Covers: AC4, AC5
- Uses: C4, C5
- Depends-on: T4
- Files: viber/agents/closeout.md, viber/skills/implementor/SKILL.md, viber/skills/implementor/fragments/cleanup.true.md, tests/viber/repair-prose.unit.test.ts
- Delivers: `closeout` returning its leftover count on an archived run; `implementor` step 7 placing the closing sentence in both close forms as C5 orders it; `cleanup.true.md` pointing to the close of step 7 without a line count
- Verification: node --test tests/viber/repair-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/ruling-prose.unit.test.ts tests/viber/roadmap-prose.unit.test.ts -> every test passes
- DoD: `closeout.md` `## Output` adds the C4 line after `PATH:` on `VERDICT: ARCHIVED` and its line count matches the lines it lists, asserted by `repair-prose.unit.test.ts`; the ARCHIVED close bullet of `SKILL.md` prints the sentence after the `Summary:` line and before the next-part line, asserted by the same test and `roadmap-prose.unit.test.ts`; the screen form prints the sentence after the rulings and before its next-part line, which stays last, asserted by the same test; `SKILL.md` names each of the six problem kinds of C5, counts `closeout`'s `LEFT:` line toward files left uncommitted, and states that `OWNER:` lines and drift are no problem, asserted by the same test; `cleanup.true.md` names no "two-line" close, asserted by the same test
<!-- /TASK -->

<!-- TASK -->
### T6 - Document repair passes and the closing sentence
- TDD: none
- Covers: AC6
- Uses: C5
- Depends-on: T5
- Files: viber/README.md, viber/docs/configuration.md, viber/skills/setup/assets/help.html, viber/skills/setup/assets/viber-flow-en.svg, viber/skills/setup/assets/viber-flow-pl.svg, docs/viber-functions.html
- Delivers: user docs, flow diagrams and the functions page in English and Polish saying that a task past its 5 attempts and a deferred path no task claims get a repair pass before the final review, that the arbiter rules on a stalled task only after it, and that the close carries one sentence saying whether `outcome.md` records a problem
- Verification: node --test tests/viber/help.unit.test.ts -> every test passes; grep -c "repair pass" viber/README.md viber/docs/configuration.md viber/skills/setup/assets/help.html viber/skills/setup/assets/viber-flow-en.svg docs/viber-functions.html viber/skills/implementor/SKILL.md -> every count at least 1; grep -c "naprawa zadania" viber/skills/setup/assets/help.html viber/skills/setup/assets/viber-flow-pl.svg -> every count at least 1; grep -c "records a problem" viber/README.md viber/docs/configuration.md viber/skills/setup/assets/help.html viber/skills/implementor/SKILL.md -> every count at least 1
- DoD: `viber/README.md` `### When it decides for you` says a task past its 5 attempts gets a "repair pass" before the arbiter rules and a deferred path no task claims gets one too, and its close description names the sentence saying whether `outcome.md` "records a problem"; `docs/configuration.md`'s `## Model tiers` says a held task's "repair pass" runs at `tiers.max`, and its `build.cleanup` detail names the sentence saying whether `outcome.md` "records a problem"; `help.html` states the repair pass in the build card's stall bullet, the `skill-implementor` Start entry and `ts-task-fails`, and the sentence in the summary paragraph, each in an English span and a Polish one ("naprawa zadania"); `help.unit.test.ts` passes; the `task-coder` and `task-reviewer` nodes of `viber-flow-en.svg` each say a "repair pass" comes after the 5 attempts and before the arbiter, and `viber-flow-pl.svg` says the same with "naprawa zadania", every line fitting the node width as the line it replaces; `docs/viber-functions.html` says in its build list that code left untested with no later task gets a "repair pass", and in its Arbiter list that a task past 5 attempts reaches the arbiter after its "repair pass"
<!-- /TASK -->

## Contracts

### C1 - The repair dispatch line

File: viber/agents/task-coder.md, viber/agents/task-reviewer.md

`repair: <one line: the problem this pass fixes>`, added to the task's ordinary coder and reviewer dispatch lines. Its presence marks a repair pass.

### C2 - Owed and repaired records

File: viber/scripts/commit-task.sh, viber/scripts/plan-index.sh

- Task commit flag: `commit-task.sh "<plan>" "<id>" --owe "<path>" ["<path>"...]`, combinable with `--defer` and `--unreviewed`.
- Status-only form: `commit-task.sh --repaired "<plan>" "<id>"`; stdout `repaired: <id>`, `progress: unchanged`; exit 0, 2 when the task is not done, 3 when no such task.
- `status.md` lines: `owed: <id>:<path> [...]` and `repaired: <id> [...]`, both `none` when empty.
- `plan-index.sh` default output, after `deferred:`: `owed: <id>:<path> [...]`, only the entries whose id is not on `repaired:`, the line left out when none remains.

### C3 - The repair task-list entry

File: none

`R<n> - repair <id> (<tier>, review <review tier>)`, `<n>` counting from 1 in the session.

### C4 - The closeout leftover count

File: viber/agents/closeout.md

On `VERDICT: ARCHIVED`, a fourth line after `PATH:`: `LEFT: <n>` (the leftover lines of `outcome.md` ending `left uncommitted`) or `LEFT: none`.

### C5 - The closing sentence

File: viber/skills/implementor/SKILL.md

One sentence in the conversation's language. Archived close: after the `Summary:` line, before the next-part line. Screen form: after the rulings, before the next-part line, which stays last. The pull request question still comes once everything is printed. All clear: no problem kind found. Otherwise: `outcome.md` records a problem (on the screen form with no `outcome.md`: the summary above records a problem), naming each kind found:

- skipped task
- commit without review
- tests accepted while failing
- final review fix accepted over a failed recheck
- file left uncommitted (a `left uncommitted:` line, or `LEFT:` above none)
- deferred path without an owner

`OWNER:` lines and drift markers are no problem kind.

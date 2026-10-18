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

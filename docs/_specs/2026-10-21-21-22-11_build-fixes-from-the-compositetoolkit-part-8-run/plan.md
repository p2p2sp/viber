---
source: /Users/dario/Projects/viber/docs/_specs/2026-10-21-21-22-11_build-fixes-from-the-compositetoolkit-part-8-run/plan.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Build fixes from the CompositeToolkit part 8 run

## Goal

Close the gaps one large build of viber 0.88.2 exposed: a scratch file nobody in the build could delete and that the close finally committed, a planner barred from updating an end-to-end spec its change breaks, a red check that refuses every task changing a workspace package, final-review steps editing `CLAUDE.md` nodes the memory step owns, a coder guard that lets file edits through interpreters, and a retry that asks for a reason the reviewer never gives.

## Problem

In the "CompositeToolkit part 8" build (34 tasks, workteam.one) a coder left `zz-debug.test.tsx` in the tree. The coder has no `rm` and `git rm` refuses an untracked file, the orchestrator writes no file, yet the arbiter ruled "the orchestrator removes it"; the final review failed on it again, and the closeout committed it (commit 878f2688). The plan skipped `frontend/e2e/incidents.spec.ts`, which T13's new roles broke, because the End-to-end rule forbids any end-to-end spec in a task while the Owned rule demands every test asserting a changed behaviour. `red-check.sh` returned UNRUNNABLE for T1-T6 because a linked `node_modules` held a workspace link into the changed package. A final reviewer reported stale `CLAUDE.md` text with `memory: true` and the fix coder edited three `CLAUDE.md` files outside the node budget. Two coders edited files with Python through `Bash`. After a review failure the orchestrator had to invent a `reason:` line. Each of these costs a retry, a false failure or a wrong commit on every build that meets it.

## Current behaviour

A coder may leave any file in the tree; only `.temp/` is ignored. Nothing in the build can delete an untracked file, and the closeout commits every changed path no task claims and no summary line marks as left uncommitted. A coder's `DECIDE:` options and the arbiter's ruling are not bound to what any actor can carry out. The End-to-end rule keeps every end-to-end spec out of tasks unless the user asked for one. `red-check.sh` links each configured directory (`node_modules`) whole into its worktree and refuses the task when a link inside it reaches a changed workspace package. The final reviewer reports every notes line about something left stale, `CLAUDE.md` ones included, and the fix coder fixes every finding it gets. `shell-guard.sh` refuses `sed -i`, `perl -pi`, redirects and `tee` onto tree paths, but not code run through an interpreter. The implementor's next attempt always carries `reason:`.

### Must not change

- Every existing `commit-task.sh` form, its output lines and exit codes.
- The coder's existing output lines and how the implementor maps them (`FILES:`, `EXTRA:`, `DEFERRED:`, `DECIDE:`, `WAIT:`, `RED:`, `DOD:`, `FIXED:`).
- `shell-guard.sh` verdicts for rules R1-R4 and its silence for every caller other than the three guarded agents.
- `red-check.sh` verdict lines other than the workspace one, and that it never changes a tracked file or the index of the main tree.
- Writing or running a new end-to-end test still needs the user's own request.

## Behaviour

### S1 - A coder's scratch file is dropped [NEW]

A coder that had to leave a debug test in the tree, where the test runner picks it up, names it on its return; the build deletes it before the review.

Given a coder created an untracked scratch file no task claims
When it returns with that path on its `SCRATCH:` line
Then the implementor deletes it through `commit-task.sh --drop`, the reviewer never sees it, and no commit carries it

### S2 - A path the build must keep is never dropped [NEW]

Given a coder names on `SCRATCH:` a path some task lists in `Files`, an extras file lists, git tracks or git ignores
When the implementor calls `--drop` with it
Then the file stays, the script prints why, and the final summary carries it as left uncommitted, so the closeout never commits it

### S3 - A stalled task gets only options the build can carry out [CHANGED - was: the coder and the arbiter could choose "delete it by hand" or "the orchestrator removes it"]

Given a coder stalls and returns `DECIDE:`
When the arbiter rules on its options
Then every option is something a later coder attempt or a recorded ruling carries out, and the arbiter never chooses an option no actor can perform while another one is listed

### S4 - A plan updates the end-to-end spec its change breaks [CHANGED - was: no task could list an end-to-end spec]

Given a task changes a component whose role, accessible name, text or test id an existing end-to-end spec uses
When the plan is written and reviewed
Then that spec is in the task's `Files`, proven by the test tool's type-check or listing step plus a grep of the new selector on both sides, never run, and a plan leaving it out fails review

### S5 - Memory owns the CLAUDE.md nodes in the final review [CHANGED - was: a reviewer could report and the fix coder could edit them]

Given `build.memory` is `true`
When the final review and its fix round run
Then no finding about a `CLAUDE.md`, from the diff or from a notes line, enters a report, and the fix coder edits no `CLAUDE.md`

### S6 - Red check runs a task changing a workspace package [CHANGED - was: UNRUNNABLE "workspace link reaches the change"]

Given a task changes a workspace package that a linked `node_modules` links to
When `red-check.sh` builds its worktree
Then that link points into the worktree's own copy, the red run loads HEAD's code, and the verdict is FAIL-AS-EXPECTED or PASSED-WITHOUT-CHANGE as the tests decide

### S7 - Interpreter edits are refused for the coder [NEW]

Given a task coder runs inline interpreter code or a script under `.temp/` through an interpreter
When the Bash call reaches `shell-guard.sh`
Then it is refused with a `viber guard:` reason telling it to change files through Edit or Write, while test runners and project scripts still run

### S8 - A retry after a failed review carries the report alone [CHANGED - was: a `reason:` line the reviewer never returns]

Given a reviewer returned `VERDICT: FAIL` and its `REVIEW:` path
When the implementor dispatches the next attempt, a repair pass's second attempt included
Then the coder gets `report:` with that path and no `reason:` line

### Edge cases

- `--drop` with a path that does not exist, a directory, or a path inside the run directory -> kept with its reason, the other paths still processed.
- `--drop` with no path or a missing plan -> exit 2, nothing deleted.
- A coder's scratch path under `.temp/` -> never on `SCRATCH:`, since git ignores it.
- A `perl -pi -e` call -> refused as today under R4, not under the new rule.
- `python -m pytest`, `node --test`, `node scripts/x.js`, `python3 tools/gen.py`, `ruby -Itest test/x_test.rb`, `perl -Ilib t/a.t` -> allowed: a letter taking an attached argument (an include path, a module) is never read as inline code.
- `bash .temp/x.sh` or `sh .temp/x.sh` -> refused like an interpreter running a `.temp/` script.
- A plan `Verification` written as inline interpreter code -> a plan finding, since the coder's guard refuses it.
- A workspace package the task adds (absent at HEAD) -> its entry still points into the worktree, where the task's own files are placed.
- A red run killed right after a link is made -> the cleanup or the next run's recovery removes every link before the worktree goes, the main tree's `node_modules` untouched.

## Glossary

- scratch file - a file a coder created only to investigate or debug, never part of the task's deliverable; it is not the task's work and is never committed.
- drop - deleting a scratch file through the build's own script after checking that nothing in the plan owns it.

## Acceptance criteria

1. A coder reports scratch files left in the tree on a `SCRATCH:` line, and the implementor passes them to `commit-task.sh --drop`, which deletes a path only when it is an untracked, unignored file outside the run directory that no task's `Files` and no extras file lists, and keeps every other path with its reason.
2. The closeout never commits a path a coder reported as scratch: it is dropped, or it reaches the final summary as a `left uncommitted:` line.
3. The coder keeps scratch output under its `out` directory, and only a scratch file that must sit in the tree goes on `SCRATCH:`.
4. Every `DECIDE:` option is executable by the build, and the arbiter knows what each actor of the build can and cannot do.
5. An existing end-to-end spec whose selector a task changes belongs in that task's `Files`, proven by a type-check or listing step plus a grep on both sides and never run, and the planner reviewers search the end-to-end specs for the selectors of every component a task changes.
6. With `memory: true` the final reviewer reports nothing living in a `CLAUDE.md`, also through a notes line, and the final-review fix coder edits no `CLAUDE.md`.
7. `red-check.sh` runs a task changing a workspace package linked from a linked directory, instead of returning UNRUNNABLE.
8. `shell-guard.sh` refuses for the task coder inline interpreter code and a `.temp/` script run through an interpreter, and the coder is told to make large rewrites through `Write` of the whole file.
9. After a review failure the next coder attempt, and a repair pass's second attempt, carry `report:` and no `reason:` line.

## Scope

### File map

- modify - viber/scripts/commit-task.sh - the `--drop` form: checks and deletes scratch paths
- modify - tests/viber/commit-task.test.ts - `--drop` cases
- modify - viber/agents/task-coder.md - `SCRATCH:` line, scratch under `out`, executable `DECIDE:` options, the `memory` input, the interpreter rule
- modify - viber/skills/implementor/SKILL.md - `SCRATCH:` handling, no `reason:` after a review failure
- modify - viber/agents/task-reviewer.md - a scratch leftover's fix is the coder's `SCRATCH:` line
- modify - tests/viber/extras-prose.unit.test.ts - pins the scratch prose
- modify - viber/agents/arbiter.md - what each actor can do
- modify - tests/viber/ruling-prose.unit.test.ts - pins the executable options prose
- modify - viber/agents/final-reviewer.md - the memory exclusion covers notes lines
- modify - viber/skills/implementor/fragments/final-review.true.md - the fix coder gets `memory:`
- add - tests/viber/final-review-prose.unit.test.ts - pins the memory prose
- modify - tests/viber/repair-prose.unit.test.ts - pins the review-failure retry lines
- modify - viber/hooks/scripts/shell-guard.sh - rule R5, interpreter code
- modify - tests/viber/shell-guard.test.ts - R5 cases, the two `perl -e` cases moved to refused
- modify - viber/hooks/hooks.json - its description names the R5 refusal
- modify - tests/viber/guard-prose.unit.test.ts - pins the coder's interpreter line and the plan rule
- modify - viber/references/plan-rules.md - End-to-end, Layers, TDD, Provable and Owned carve the existing spec in; Provable bars inline interpreter code
- modify - viber/references/test-strategy.md - its end-to-end rule lets a coder update a listed existing spec
- modify - viber/skills/planner/SKILL.md - the end-to-end sentence names the exception
- modify - viber/agents/planner-review.md - Grounded searches end-to-end specs
- modify - viber/agents/planner-task-review.md - Grounded searches end-to-end specs
- add - tests/viber/e2e-prose.unit.test.ts - pins the end-to-end prose
- modify - viber/scripts/red-check.sh - per-entry links, workspace entries relinked into the worktree
- modify - tests/viber/red-check.test.ts - link and workspace cases

### Out of scope

- Diagnosis point 7 (parallel coders on one tree) and point 8 (an OS-dependent `source:` path).
- Deleting `zz-debug.test.tsx` from workteam.one.
- Interpreter code fed through `bash -c`, `sh -c` or standard input (`python -`, `node < file`) stays unguarded.
- The `CLAUDE.md` nodes describing these files (`viber/CLAUDE.md`, `viber/agents/CLAUDE.md`, `viber/scripts/CLAUDE.md`, `viber/hooks/CLAUDE.md`, `viber/references/CLAUDE.md`, `viber/skills/CLAUDE.md`, `tests/viber/CLAUDE.md`) are brought up to date at the build's close.
- `viber/agents/closeout.md` keeps its text: its `left uncommitted:` marker already keeps a kept scratch path uncommitted.
- `viber/agents/plain-plan-review.md` keeps its Grounded check: a plain plan follows no `plan-rules.md`.
- `viber/agents/planner-spec-review.md` and `planner-graph-review.md` keep their text.
- These user documents keep their text, still true at the level they describe: `viber/README.md` and `viber/PRODUCT.md` (end-to-end tests written on request, the arbiter's cases), `viber/docs/configuration.md`, `viber/skills/setup/templates/viber.yml`, `viber/scripts/config.sh` header and `viber/skills/setup/assets/help.html` (red-check links as directories linked into the worktree, no end-to-end test unless asked, the arbiter choosing a coder's proposal), `viber/docs/files.md` (`.temp/viber/` scratch), `docs/viber-functions.html`.
- `.claude/rules/review-findings.md` quoting an older task-coder phrase: unrelated, left as it is.

## Solution requirements

- Every script works on Windows (Git Bash) and macOS; no heredoc; bash 3.2 compatible.
- `shell-guard.sh` stays on bash builtins before any external command, with no new whole-string pass, inside its 10 s timeout on a 20 KB command.
- On Windows, building the per-entry links of one directory does not cost one process spawn per entry.
- Every agent and skill file still lints `FAIL=0` with `viber/skills/skill-designer/scripts/lint_skill.sh`.
- English only; documents state what holds now.
## Tasks

<!-- TASK -->
### T1 - Drop a scratch file nobody in the plan owns
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: none
- Files: viber/scripts/commit-task.sh, tests/viber/commit-task.test.ts
- Delivers: the `--drop` form of `commit-task.sh`, documented in its header and usage line.
- Verification: node --test tests/viber/commit-task.test.ts -> all pass
- DoD: `--drop` deletes an untracked, unignored file outside the run directory that no task's `Files` and no `work/*-extra.md` or `work/*-extra-review.md` file lists, prints its `dropped:` line and exits 0, leaving the index and `status.md` unchanged; `--drop` keeps a tracked file, a path a task's `Files` lists, a path an extras file lists, an ignored path, a path inside the run directory, a directory and a missing path, each with its `warning: kept` line and reason, while the other paths of the same call are still dropped; `--drop` with no path or a missing plan exits 2 and deletes nothing, and the usage line lists the `--drop` form
<!-- /TASK -->

<!-- TASK -->
### T2 - Report scratch files and drop them before the review
- TDD: required
- Covers: AC1, AC2, AC3
- Uses: C1, C2
- Depends-on: T1
- Files: viber/agents/task-coder.md, viber/skills/implementor/SKILL.md, viber/agents/task-reviewer.md, tests/viber/extras-prose.unit.test.ts
- Delivers: the coder's scratch discipline and `SCRATCH:` line, the implementor's `--drop` call on it, and the reviewer's fix wording for a scratch leftover.
- Verification: node --test tests/viber/extras-prose.unit.test.ts -> all pass; bash viber/skills/skill-designer/scripts/lint_skill.sh viber/agents/task-coder.md -> exit 0; bash viber/skills/skill-designer/scripts/lint_skill.sh viber/skills/implementor/SKILL.md -> exit 0
- DoD: `task-coder.md` keeps scratch output under its `out` directory and returns a scratch file that must sit in the tree on a `SCRATCH:` line on every verdict, never on `FILES:` or `EXTRA:`; `implementor/SKILL.md` answers a `task-coder` return carrying `SCRATCH:`, in any step, with one `commit-task.sh --drop` call naming every path before any other dispatch or commit for that return, and turns each `warning: kept` line into a `left uncommitted: <path> | <reason>` line of the final summary; `task-reviewer.md` names the coder's `SCRATCH:` line as the fix of a scratch leftover, never `rm`
<!-- /TASK -->

<!-- TASK -->
### T3 - Bind stall options to what the build can do
- TDD: required
- Covers: AC4
- Uses: C2
- Depends-on: T2
- Files: viber/agents/task-coder.md, viber/agents/arbiter.md, tests/viber/ruling-prose.unit.test.ts
- Delivers: executable `DECIDE:` options and an arbiter that knows each actor's limits.
- Verification: node --test tests/viber/ruling-prose.unit.test.ts -> all pass; bash viber/skills/skill-designer/scripts/lint_skill.sh viber/agents/arbiter.md -> exit 0
- DoD: `task-coder.md` requires every `DECIDE:` option to be work a later coder attempt does or a ruling the build records, never a step by hand or by the orchestrator; `arbiter.md` states that the orchestrator writes and deletes no file and runs only viber's scripts, that a coder changes files through Edit and Write, removes a tracked file through `git rm` and an untracked scratch file only through its `SCRATCH:` line, and that nobody acts by hand during a build; `arbiter.md` never rules an option no actor can carry out while another option is listed
<!-- /TASK -->

<!-- TASK -->
### T4 - Keep CLAUDE.md out of the final review when memory owns it
- TDD: required
- Covers: AC6
- Uses: C3
- Depends-on: T3
- Files: viber/agents/final-reviewer.md, viber/skills/implementor/fragments/final-review.true.md, viber/agents/task-coder.md, tests/viber/final-review-prose.unit.test.ts
- Delivers: a final reviewer and a fix coder that leave every `CLAUDE.md` to the memory step when `memory` is `true`.
- Verification: node --test tests/viber/final-review-prose.unit.test.ts -> all pass; bash viber/skills/skill-designer/scripts/lint_skill.sh viber/agents/final-reviewer.md -> exit 0
- DoD: `final-reviewer.md` reports no notes line about something living in a `CLAUDE.md` when `memory` is `true`, its notes-line rule and its `CLAUDE.md` exclusion agreeing; `final-review.true.md` gives the fix coder dispatch a `memory:` line carrying the config block's `build.memory` value; `task-coder.md` declares the `memory` input and, on a `review` dispatch with `memory` `true`, edits no `CLAUDE.md`
<!-- /TASK -->

<!-- TASK -->
### T5 - Allow an existing end-to-end spec into the task that breaks it
- TDD: required
- Covers: AC5
- Uses: none
- Depends-on: none
- Files: viber/references/plan-rules.md, viber/references/test-strategy.md, viber/skills/planner/SKILL.md, viber/agents/planner-review.md, viber/agents/planner-task-review.md, tests/viber/e2e-prose.unit.test.ts
- Delivers: plan rules, the test strategy and reviewers that keep an existing end-to-end spec in step with the components a task changes.
- Verification: node --test tests/viber/e2e-prose.unit.test.ts -> all pass; bash viber/skills/skill-designer/scripts/lint_skill.sh viber/skills/planner/SKILL.md -> exit 0
- DoD: `plan-rules.md`'s End-to-end rule puts an existing end-to-end spec whose selector a task changes in that task's `Files`, proven inside its `Verification` by the test tool's type-check or listing step plus a grep of the new selector on both sides, never run and needing no criterion; `plan-rules.md`'s Layers, TDD and Provable rules exempt that spec update from red evidence and from a unit or component test while the rest of the task keeps its `TDD`, and its Owned rule names an end-to-end spec among the existing tests asserting a changed behaviour; `test-strategy.md`'s end-to-end rule lets a coder update such a listed spec without the user's request, a reviewer raising no finding for it; `planner/SKILL.md`'s end-to-end sentence names that exception; `planner-review.md` and `planner-task-review.md` carry the same Grounded sentence, searching the end-to-end specs for the roles, accessible names, texts and test ids of every component a task changes, an unlisted spec using one being Blocking
<!-- /TASK -->

<!-- TASK -->
### T6 - Refuse interpreter edits for the coder
- TDD: required
- Covers: AC8
- Uses: C4
- Depends-on: T4, T5
- Files: viber/hooks/scripts/shell-guard.sh, tests/viber/shell-guard.test.ts, viber/hooks/hooks.json, viber/agents/task-coder.md, tests/viber/guard-prose.unit.test.ts, viber/references/plan-rules.md
- Delivers: rule R5 of `shell-guard.sh` with its documentation, the coder's matching one-line rule, and a plan rule keeping inline interpreter code out of `Verification`.
- Verification: node --test tests/viber/shell-guard.test.ts tests/viber/guard-prose.unit.test.ts -> all pass
- DoD: for `viber:task-coder`, `python`, `python2` or `python3` with `-c` (alone or ending a cluster of flag letters such as `-Bc`), `node` with `-e`, `--eval`, `-p`, `--print` or a cluster of flag letters holding `e` or `p`, `ruby` with a cluster of flag letters holding `e`, and `perl` with a cluster of flag letters holding `e` or `E` are refused with the R5 reason, a cluster ending at the first letter that takes an attached argument (`-I`, `-r`, `-C` and `-x` for ruby, `-I`, `-M`, `-m` and `-x` for perl, `-r` for node), and `perl -pi` staying R4; one of those interpreters, `bash` or `sh` running a script whose path opens `.temp/` or `./.temp/` is refused with the R5 reason; `python -m pytest`, `python3 tools/gen.py`, `node --test`, `node scripts/x.js`, `ruby -Itest test/x_test.rb`, `ruby -rdebug x.rb`, `perl -Ilib t/a.t` and `perl -MTest::More t/a.t` pass, and the reviewers and every other caller stay unaffected; the `hooks.json` description and the script header name the R5 refusal; `task-coder.md` carries one line barring inline or scratch interpreter code, worded as the R5 reason, and sending a large rewrite through `Write` of the whole file; `plan-rules.md`'s Provable rule makes a `Verification` running inline interpreter code a finding
<!-- /TASK -->

<!-- TASK -->
### T7 - Run the red check on a changed workspace package
- TDD: required
- Hard: link creation and removal must stay signal-safe across symlinks and junctions on two platforms, and the forced worktree removal must never reach the main tree
- Covers: AC7
- Uses: none
- Depends-on: none
- Files: viber/scripts/red-check.sh, tests/viber/red-check.test.ts
- Delivers: a worktree whose linked directories hold one link per entry, workspace entries pointing into the worktree.
- Verification: node --test tests/viber/red-check.test.ts -> all pass
- DoD: a configured linked directory becomes a real directory in the worktree holding one link per entry of the main tree's directory, dot entries included, an `@scope` directory holding one link per entry of its own; an entry resolving into the repository outside every linked directory links to the same relative path inside the worktree, so a task whose change sits in a workspace package gets FAIL-AS-EXPECTED when its tests fail on HEAD; a link that cannot be made prints `red-check: UNRUNNABLE link failed: <entry path>`; after a run, a TERM right after a link is made included, no link and no registered worktree remain, the temporary directory is gone and the main tree's linked directory and its entries are untouched; a stale worktree of a killed run is reclaimed whether its owner file lists a whole directory or single entries
<!-- /TASK -->

<!-- TASK -->
### T8 - Retry a failed review on its report alone
- TDD: required
- Covers: AC9
- Uses: none
- Depends-on: T6
- Files: viber/skills/implementor/SKILL.md, tests/viber/repair-prose.unit.test.ts
- Delivers: retry lines that carry `report:` and no `reason:` after a review failure.
- Verification: node --test tests/viber/repair-prose.unit.test.ts -> all pass
- DoD: the implementor's next-attempt line carries `reason:` after a coder failure or a refused commit, and after a review failure only the returned `REVIEW` path as `report:`; a task held at attempt 5 by a review failure waits for the repair pass with its last `REVIEW` path, and the repair pass's first dispatch then carries that path as `report:` and no `reason:`; the repair pass's second attempt after a review failure carries the `REVIEW` path as `report:` and no `reason:`
<!-- /TASK -->

## Contracts

### C1 - commit-task.sh --drop

File: viber/scripts/commit-task.sh

```
commit-task.sh --drop <plan-file> <path> [<path>...]
stdout: dropped: <path>                     one line per deleted path
stderr: warning: kept <path> - <reason>     one line per kept path
  reasons: tracked | claimed by task <ids> | listed by extras of task <ids>
           | ignored by git | inside the run directory | not a file | not found
exit: 0 once the arguments are valid; 2 on no path or a missing plan, nothing deleted
writes: deletes the dropped files only; never the index, a commit or status.md
```

### C2 - task-coder SCRATCH line

File: viber/agents/task-coder.md

```
SCRATCH: <repo-relative path>, <repo-relative path>
  on any verdict; only files the coder created to investigate, left outside .temp/;
  omitted when none; never a path on FILES: or EXTRA:
```

### C3 - task-coder memory input

File: viber/agents/task-coder.md

```
memory: <true|false>    on a review dispatch only; false when the line is missing
```

### C4 - shell-guard R5 refusal

File: viber/hooks/scripts/shell-guard.sh

```
viber guard: Bash never runs inline or scratch interpreter code - change a file with Edit or Write, and run tests and project scripts by their own command.
```

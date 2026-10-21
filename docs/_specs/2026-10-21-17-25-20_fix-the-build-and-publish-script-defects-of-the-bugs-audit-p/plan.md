---
source: C:/Projects/viber/docs/_specs/2026-10-21-17-25-20_fix-the-build-and-publish-script-defects-of-the-bugs-audit-p/plan.md
attachments:
  findings.md: C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/findings.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Fix the build and publish script defects of the bugs audit (part 1 of 3)

## Goal

Fix the 14 verified audit defects in viber's run, build and GitHub wrapper scripts, plus the reported defect where a `Verification` command wrapped in Markdown backticks makes red-check always fail. Each fix ships with a regression test built from its reproduction, so the defect cannot silently return.

## Problem

A viber build relies on these scripts to commit the right files, validate and split the plan, check red evidence and publish to GitHub. Today each one misreads a valid input. The forced worktree remove can delete the main tree's `node_modules` on Windows. A task commit can sweep another task's half-done file. A resumed run is refused by its own index. A tag named like a branch breaks run-branch creation. The QA document can land on a stranger's fork pull request. A backticked `Verification` makes every TDD task's red-check `UNRUNNABLE` (exit 127). Left alone, these cost lost files, wrong commits and failed builds that look like environment errors.

## Current behaviour

- `red-check.sh` makes a junction first and records it for cleanup only afterwards. An interrupt in between leaves a live junction under `git worktree remove --force`.
- `commit-task.sh` folds backslashes only in absolute paths. It strips only CR and `./` from extras lines. It stages the reviewer's extras paths even when another unfinished task has declared the same path in its own extras file.
- `plan-index.sh` behaves as follows:
  - Its `verify:` and `recheck:` values keep Markdown backticks around the command.
  - Plain mode applies the post-freeze rules to a landed run plan.
  - A fence closes on any bare run of three of its character, whatever the opening length.
  - The extras reader folds no backslash.
- `plan-path.sh`'s guidance strip shares the length-blind fence close. `run-branch.sh` creates the branch and counts `behind:` from the bare base name, which a same-named tag wins.
- `archive-run.sh` strips one trailing slash only, so `<run>//` yields an empty key.
- `config.sh` reads `branching.mode` with two grammars: the default block and `--branching`.
- `pr-create.sh` pushes to `.` and `pr-facts.sh` compares against the local target when the branch tracks a local branch.
- `qa-comment.sh` takes the first open pull request whose head name matches, a fork's included.
- `issue-templates.sh` keeps YAML comments as values and drops comment-broken and multi-line flow lists.
- `check-playwright.sh` misses a tracked nested `package.json` whose path git quotes.

### Must not change

- Every behaviour `tests/viber/<script>.test.ts` already pins for the scripts in the file map.
- `commit-task.sh`'s existing ownership warnings (`refused`, `took`) for `Files:` claimants and the `.temp/` refusal.
- A forward-slash path, a single trailing slash, `./` and absolute-inside-repository spellings keep resolving as today.
- The planner's validation of a fresh plan (no `status.md` beside it) keeps every rule.

## Roadmap

Part 1 of 3 - Build and publish scripts

1. Build and publish scripts (`viber/scripts/`, `task-reviewer.md`) (this plan)
2. Hooks, setup and the commit skill: findings 8, 9, 10 and U18-1, U18-2, U9-2, U9-3, U10-1, U13-1, U13-2, U13-3, U16-1
   - Each finding gets a regression test built from its reproduction.
   - `shell-guard.sh` tokenizes the command in one awk pass reading stdin.
   - `bootstrap.sh` ends a group by the same rule as `config.sh`.
3. Remaining skills, release and devtools: findings 3, 5 and U22-2, U14-1, U14-2, U15-1, U15-2, U15-3, U20-1, U20-2, U19-1, U19-2, U19-3
   - Each finding gets a regression test built from its reproduction.
   - `release.sh` builds its manifest list from `marketplace.json`.
   - `query` in `signoz.mjs` has no default `--since`.
   - Unknown: whether the devtools plugin cache is keyed by its version, resolved by reading the Claude Code plugin documentation at the start of part 3's plan.

## Behaviour

### S1 - An interrupt while a link is made leaves the main tree intact [CHANGED - was: the main tree's linked directory emptied]

Given a red-check run on Windows linking `node_modules` into its worktree
When INT, TERM or HUP arrives after the junction exists but before the loop records it
Then cleanup removes the junction before the forced worktree remove, and the main tree's `node_modules` keeps its files

### S2 - A backticked Verification runs as a plain command [CHANGED - was: bash command substitution, exit 127]

Given a task whose `Verification` reads `` `<command>` -> all pass ``
When red-check runs the task
Then the command runs once as written, and the result is `FAIL-AS-EXPECTED` or `PASSED-WITHOUT-CHANGE`, never `UNRUNNABLE`

### S3 - A mangled Verification command is named as such [NEW]

Given a `Verification` whose shell substitution runs a word that is not the command's first word
When the control run exits 127 with `<word>: command not found`
Then red-check prints the mangled-command reason instead of the generic control failure

### S4 - A resumed run keeps working on its landed plan [CHANGED - was: plain index call refused with exit 4]

Given a run landed by an earlier viber, its `status.md` beside `plan.md`, a task breaking a rule added after plans were frozen
When red-check or closeout calls `plan-index.sh` in plain mode
Then the index prints as under `--split` validation, exit 0

### S5 - Extras paths agree on one spelling [CHANGED - was: backslash or padded spelling bypassed the ownership check]

Given an extras line written `src\b.ts` or `lib/x.ts ` (trailing space)
When the task commit and `plan-index.sh --extra` read it
Then both read `src/b.ts` or `lib/x.ts`, and an owned path is refused while an unowned one is staged

### S6 - A path another open task declared stays out of this task's commit [CHANGED - was: committed with this task]

Given the reviewer's extras file of T1 lists `lib/shared.ts`, which the extras file of the unfinished T2 also lists
When T1 is committed
Then `lib/shared.ts` is not staged and `warning: refused lib/shared.ts - claimed by task T2` is printed

### Edge cases

- A value opening and closing with a backtick that also holds inner backticks -> only the first and last backtick removed; a command not opening with a backtick -> kept as written.
- A four-backtick fence holding a bare three-backtick line -> stays open until a bare four-or-longer backtick line.
- `docs/_specs/<key>///` -> archived as `docs/_specs/<key>`; a path whose key comes out empty or `.` -> refused with exit 2 before anything moves.
- `branch.<b>.remote` set to `.` -> treated as unset (`origin`) by both `pr-create.sh` and `pr-facts.sh`.
- A quoted `"mode"` key or a `mode` nested under `work:` -> the block and `--branching` print the same mode.

## Glossary

- Landed run plan - a `plan.md` with `status.md` in the same directory: the plan of a run, frozen at landing. A plan being validated before landing has no `status.md`.
- Extras file - `<run>/work/<id>-extra.md` (the coder's) or `<id>-extra-review.md` (the reviewer's): paths a task changed outside its `Files`.

## Root cause

Each script reads an input more narrowly than its documented contract. Path spelling is folded or trimmed in one reader but not its twin. A base is resolved by its bare name, not as `refs/heads/`. A fence close ignores the opening length. A `.` remote is not treated as "no remote", and YAML is parsed line by line. `red-check.sh` records a link only after creating it, and `verifycmd` passes Markdown backticks through to `bash -c`.

## Acceptance criteria

1. On Windows, a TERM sent to red-check right after the junction is created leaves the main tree's linked directory with its files.
2. The `verify:` and `recheck:` values of `plan-index.sh` carry a `Verification` command with one pair of wrapping backticks removed and inner backticks kept.
3. red-check on a plan whose `Verification` is backtick-wrapped reports `FAIL-AS-EXPECTED`, not `UNRUNNABLE`.
4. red-check reports the mangled-command reason when the control run exits 127 on a `command not found` word that is not the command's first word.
5. `plan-rules.md` makes a backtick-wrapped `Verification` command a review finding.
6. Plain `plan-index.sh` on a plan with `status.md` beside it applies the `--split` exemptions; with no `status.md` it applies every rule.
7. A four-backtick fence holding a three-backtick line no longer ends early in `plan-index.sh` (validate, split, `spec.md`) or in `plan-path.sh`'s guidance strip.
8. `plan-index.sh --extra` reads a backslashed extras line in its forward-slash form.
9. `commit-task.sh` reads a backslashed relative `--with` or extras path in its forward-slash form, so ownership refusal applies.
10. `commit-task.sh` trims surrounding whitespace from each extras line before staging.
11. `commit-task.sh` refuses a `--with` or extras path that an extras file of another task not yet done lists.
12. A tag sharing the base branch's name neither breaks run-branch creation nor skews `behind:`.
13. `archive-run.sh` strips every trailing slash and refuses an empty or `.` key with exit 2.
14. `config.sh` prints the same `branching.mode` in its default block and in `--branching`.
15. `pr-create.sh` pushes to `origin` when `branch.<b>.remote` is `.`.
16. `pr-facts.sh` compares against `origin/<target>` when the head branch's remote is `.`.
17. `qa-comment.sh` ignores cross-repository pull requests when looking up the branch pull request.
18. `issue-templates.sh` strips YAML comments, skips comment lines inside a block list and reads a multi-line flow list.
19. `check-playwright.sh` finds `@playwright/test` in a tracked nested `package.json` whose path git quotes.

## Scope

### File map

- modify - viber/scripts/red-check.sh - link bookkeeping before the link is made; the mangled-command reason
- modify - viber/scripts/plan-index.sh - `verify:`/`recheck:` value; landed-plan exemptions; fence length; extras backslash fold
- modify - viber/scripts/plan-path.sh - guidance-strip fence length
- modify - viber/scripts/run-branch.sh - base resolved as `refs/heads/<base>`
- modify - viber/scripts/commit-task.sh - path folding, extras trim, ownership by other tasks' extras files
- modify - viber/scripts/archive-run.sh - trailing slashes, empty key refusal
- modify - viber/scripts/config.sh - one reader for `branching.mode`
- modify - viber/scripts/pr-create.sh - `.` remote fallback
- modify - viber/scripts/pr-facts.sh - `.` remote fallback in the target ref
- modify - viber/scripts/qa-comment.sh - same-repository pull request lookup
- modify - viber/scripts/issue-templates.sh - YAML comments and multi-line flow lists
- modify - viber/scripts/check-playwright.sh - unquoted tracked paths
- modify - viber/references/plan-rules.md - backtick-wrapped `Verification` as a finding
- modify - tests/viber/red-check.test.ts, tests/viber/plan-index.test.ts, tests/viber/plan-path.test.ts, tests/viber/commit-task.test.ts, tests/viber/archive-run.test.ts, tests/viber/config.test.ts, tests/viber/pr-create.test.ts, tests/viber/pr-facts.test.ts, tests/viber/qa-comment.test.ts, tests/viber/issue-templates.test.ts, tests/viber/check-playwright.test.ts - regression tests

### Out of scope

- Part 2: hooks, setup and the commit skill (findings 8, 9, 10, U18-1, U18-2, U9-2, U9-3, U10-1, U13-1, U13-2, U13-3, U16-1).
- Part 3: remaining skills, release and devtools (findings 3, 5, U22-2, U14-1, U14-2, U15-1, U15-2, U15-3, U20-1, U20-2, U19-1, U19-2, U19-3).
- `viber/agents/task-reviewer.md`: it keeps appending to its extras file unchanged.
- `pr-facts.sh`'s own pull request lookup by head name: it keeps its current lookup.
- `skill-part.sh`'s fence handling: it keeps its exact block shape.
- The plugin version in `plugin.json`: written only by `release.sh` at release.
- `viber/scripts/CLAUDE.md`: its extras-file contract (line cleaning, refusal by another open task's extras file) and its read-after bullet (skipped for a landed plan in plain mode) are updated by the build's memory close, which owns every `CLAUDE.md` while `build.memory` is on; no task edits it.
- `.claude/rules/shell-path-strip.md`: its line pointers into `plan-index.sh` and `archive-run.sh` are refreshed by the build's rules close; the single `./` strip it states keeps holding.
- Any refactor a fix does not need.

## Solution requirements

- Every changed script works on Windows (Git Bash) and macOS; bash 3.2 safe; no heredoc; `#!/bin/sh` wrappers stay POSIX.
- A run landed under viber 0.87.x keeps working when resumed.
- Each regression test fails before its fix and passes after it; the Windows-only interrupt test is skipped elsewhere.

## Tasks

<!-- TASK -->
### T1 - Strip wrapping backticks from the verify command value
- TDD: required
- Covers: AC2
- Uses: C4
- Depends-on: none
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: `verify:` and `recheck:` lines carrying the bare command when the plan wraps it in backticks.
- Verification: node --test tests/viber/plan-index.test.ts -> all pass
- DoD: a `Verification` of `` `cmd a` -> all pass `` yields `verify: T1 | cmd a`; the `recheck:` line of a done task owning an extra path carries the same unwrapped command; a wrapped value holding inner backticks loses only its first and last backtick; a command opening without a backtick but holding a backtick pair is printed unchanged; the header documents the unwrapped value
<!-- /TASK -->

<!-- TASK -->
### T2 - Apply the frozen-plan exemptions to a landed run plan
- TDD: required
- Covers: AC6
- Uses: C5
- Depends-on: T1
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: plain-mode validation of a plan with `status.md` beside it under the same exemptions as `--split`.
- Verification: node --test tests/viber/plan-index.test.ts -> all pass
- DoD: a fixture plan whose task `T2` has a `Verification` reading a file task `T1` lists with no dependency, `status.md` beside it, exits 0 in plain mode; the same plan with no `status.md` exits 4 naming the read-after rule; the header states which plain calls get the exemptions
<!-- /TASK -->

<!-- TASK -->
### T3 - Close a plan-index fence only on one at least as long
- TDD: required
- Covers: AC7
- Uses: none
- Depends-on: T2
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: fence handling in both `fstep()` copies and the `spec.md` cut that closes only on a bare fence of the same character at least as long as the opening one.
- Verification: node --test tests/viber/plan-index.test.ts -> all pass
- DoD: a `## Current behaviour` holding a four-backtick block with a bare three-backtick line inside keeps `## Must not change` in `tasks/T1.md` after `--split`; a contract block after a four-backtick contract shape is found by its task `Uses`; `spec.md` keeps the headings following such a block
<!-- /TASK -->

<!-- TASK -->
### T4 - Fold backslashes in the plan-index extras reader
- TDD: required
- Covers: AC8
- Uses: none
- Depends-on: T3
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: `--extra` reading a relative extras line with backslashes in its forward-slash form.
- Verification: node --test tests/viber/plan-index.test.ts -> all pass
- DoD: an extras line `src\b.ts` prints `extra: src/b.ts`; an extras line `src\b.ts` naming a file a task not yet done lists is left out of `extra:`
<!-- /TASK -->

<!-- TASK -->
### T5 - Close a guidance-strip fence only on one at least as long
- TDD: required
- Covers: AC7
- Uses: none
- Depends-on: none
- Files: viber/scripts/plan-path.sh, tests/viber/plan-path.test.ts
- Delivers: `plan-path.sh`'s guidance strip keeping a four-backtick fence open past an inner three-backtick line.
- Verification: node --test tests/viber/plan-path.test.ts -> all pass
- DoD: a landed plan whose four-backtick block holds an inner bare three-backtick line and an HTML comment after it keeps that comment inside the block; an HTML comment after the block's real closing line is stripped
<!-- /TASK -->

<!-- TASK -->
### T6 - Resolve the run-branch base as a branch, never a tag
- TDD: required
- Covers: AC12
- Uses: none
- Depends-on: T5
- Files: viber/scripts/run-branch.sh, tests/viber/plan-path.test.ts
- Delivers: run-branch creation and the `behind:` count resolved from `refs/heads/<base>`.
- Verification: node --test tests/viber/plan-path.test.ts -> all pass
- DoD: with a tag named `main` on an older commit, `plan-path.sh --land` prints `branch: feature/demo (created)` with the branch at `refs/heads/main`; with `main` level with `origin/main` and a tag `main` behind it, `--branch` prints `behind: 0`
<!-- /TASK -->

<!-- TASK -->
### T7 - Record a red-check link before it is made
- TDD: required
- Hard: signal timing - the test must open a deterministic window between junction creation and bookkeeping on Windows
- Covers: AC1
- Uses: none
- Depends-on: none
- Files: viber/scripts/red-check.sh, tests/viber/red-check.test.ts
- Delivers: cleanup that always sees a link made before an interrupt.
- Verification: node --test tests/viber/red-check.test.ts -> all pass
- DoD: on Windows, a `cmd` stand-in on PATH that creates the junction and then sleeps, with TERM sent once the junction exists, leaves the main tree's gitignored `node_modules/precious.txt` in place and red-check exits 130; the test is skipped off Windows; a link that fails still yields `red-check: UNRUNNABLE link failed: <rel>`
<!-- /TASK -->

<!-- TASK -->
### T8 - Run backticked Verification and name a mangled command
- TDD: required
- Covers: AC3, AC4
- Uses: C1, C4
- Depends-on: T1, T7
- Files: viber/scripts/red-check.sh, tests/viber/red-check.test.ts
- Delivers: red-check sealing a backtick-wrapped `Verification` normally and naming shell substitution as the cause of a 127 control run.
- Verification: node --test tests/viber/red-check.test.ts -> all pass
- DoD: a plan whose `Verification` is `` `<test command>` -> all pass `` yields `red-check: FAIL-AS-EXPECTED <log>`; a control run exiting 127 whose log names a `command not found` word that is not the first word of the command yields the C1 line; a control run exiting 127 on the command's own first word keeps `UNRUNNABLE control run failed (exit 127): <log>`; the header lists the new reason
<!-- /TASK -->

<!-- TASK -->
### T9 - Make a backtick-wrapped Verification a plan review finding
- TDD: none
- Covers: AC5
- Uses: none
- Depends-on: none
- Files: viber/references/plan-rules.md
- Delivers: the `Provable` rule extended to require the bare command form the task template shows.
- Verification: grep -n "wrapped in backticks" viber/references/plan-rules.md && grep -n "Verification: <command>" viber/skills/planner/templates/tasks.md -> one line each
- DoD: the `Provable` rule sentence of `plan-rules.md` says a `Verification` command wrapped in backticks is a finding; the rule is extended in its own sentence, not a new bullet
<!-- /TASK -->

<!-- TASK -->
### T10 - Fold backslashes in commit-task named paths
- TDD: required
- Covers: AC9
- Uses: C2
- Depends-on: none
- Files: viber/scripts/commit-task.sh, tests/viber/commit-task.test.ts
- Delivers: `named_path()` folding `\` to `/` before the `./` strip, so `--with` and extras paths share one spelling.
- Verification: node --test tests/viber/commit-task.test.ts -> all pass
- DoD: `T1-extra.md` holding `src\b.ts`, owned by open fixture task `T2`, prints `warning: refused src/b.ts - claimed by task T2` and the `T1` commit lacks `src/b.ts`; `--with src\b.ts` gets the same refusal; an unowned `lib\c.ts` extras line is staged as `lib/c.ts`
<!-- /TASK -->

<!-- TASK -->
### T11 - Trim whitespace from extras lines in the task commit
- TDD: required
- Covers: AC10
- Uses: none
- Depends-on: T10
- Files: viber/scripts/commit-task.sh, tests/viber/commit-task.test.ts
- Delivers: extras lines read with surrounding whitespace trimmed, as `plan-index.sh` reads them.
- Verification: node --test tests/viber/commit-task.test.ts -> all pass
- DoD: `T1-extra.md` holding `lib/x.ts ` (trailing space) stages `lib/x.ts` into the fixture `T1` commit; a line with leading spaces is staged the same way
<!-- /TASK -->

<!-- TASK -->
### T12 - Refuse an extras path another open task declared
- TDD: required
- Covers: AC11
- Uses: C2
- Depends-on: T11
- Files: viber/scripts/commit-task.sh, tests/viber/commit-task.test.ts
- Delivers: the ownership check refusing a `--with` or extras path that `work/<id>-extra.md` or `work/<id>-extra-review.md` of another task not yet done lists.
- Verification: node --test tests/viber/commit-task.test.ts -> all pass
- DoD: fixture `T1-extra-review.md` listing `lib/shared.ts` while `T2-extra.md` lists it and fixture task `T2` is not done prints `warning: refused lib/shared.ts - claimed by task T2` and the `T1` commit lacks it; `--with lib/shared.ts` under the same state gets the same refusal; with `T2` done the path is staged with the existing `warning: took lib/shared.ts - claimed by committed task T2` line; a path no other extras file lists is staged as before
<!-- /TASK -->

<!-- TASK -->
### T13 - Archive a run path given with several trailing slashes
- TDD: required
- Covers: AC13
- Uses: C3
- Depends-on: none
- Files: viber/scripts/archive-run.sh, tests/viber/archive-run.test.ts
- Delivers: the run directory argument stripped of every trailing slash, and an empty or `.` key refused.
- Verification: node --test tests/viber/archive-run.test.ts -> all pass
- DoD: `docs/_specs/<key>//` prints `ARCHIVED: docs/specs/<key> (1 files)` with only `spec.md` in the commit; an argument whose key comes out empty or `.` exits 2 with the C3 line and moves nothing; the header documents the refusal
<!-- /TASK -->

<!-- TASK -->
### T14 - Read branching.mode with one grammar
- TDD: required
- Covers: AC14
- Uses: none
- Depends-on: none
- Files: viber/scripts/config.sh, tests/viber/config.test.ts
- Delivers: the default block's `branching.mode` taken from the same reading as the `--branching` report.
- Verification: node --test tests/viber/config.test.ts -> all pass
- DoD: a quoted `"mode": required` prints `branching.mode: required` in the block and `mode: required` in `--branching`; a `mode: required` nested under `work:` prints `off` in both
<!-- /TASK -->

<!-- TASK -->
### T15 - Push to origin when the branch tracks a local branch
- TDD: required
- Covers: AC15
- Uses: none
- Depends-on: none
- Files: viber/scripts/pr-create.sh, tests/viber/pr-create.test.ts
- Delivers: `.` in `branch.<b>.remote` treated as no remote, falling back to `origin`.
- Verification: node --test tests/viber/pr-create.test.ts -> all pass
- DoD: a branch created with `--track main` prints `PUSHED=origin/feat` and origin holds `feat`; afterwards `branch.feat.remote` reads `origin` and `branch.feat.merge` reads `refs/heads/feat`; the header `remote:` line names the `.` case
<!-- /TASK -->

<!-- TASK -->
### T16 - Compare against the remote target when the head remote is a dot
- TDD: required
- Covers: AC16
- Uses: none
- Depends-on: none
- Files: viber/scripts/pr-facts.sh, tests/viber/pr-facts.test.ts
- Delivers: `resolve_tref`'s second tier treating `.` as no remote.
- Verification: node --test tests/viber/pr-facts.test.ts -> all pass
- DoD: with local `main` carrying an unpushed commit and `feat` tracking `main`, `--target main` prints `STATUS=ready` against `origin/main`
<!-- /TASK -->

<!-- TASK -->
### T17 - Skip fork pull requests in the QA comment target
- TDD: required
- Covers: AC17
- Uses: none
- Depends-on: none
- Files: viber/scripts/qa-comment.sh, tests/viber/qa-comment.test.ts
- Delivers: the branch pull request looked up among same-repository pull requests only.
- Verification: node --test tests/viber/qa-comment.test.ts -> all pass
- DoD: with only a fork pull request whose head is the current branch name, the script prints `STATUS=skip` and `REASON=no-pr` and posts nothing; with a same-repository pull request beside it, the comment goes to the same-repository one
<!-- /TASK -->

<!-- TASK -->
### T18 - Read issue forms with comments and multi-line flow lists
- TDD: required
- Covers: AC18
- Uses: none
- Depends-on: none
- Files: viber/scripts/issue-templates.sh, tests/viber/issue-templates.test.ts
- Delivers: issue form values free of YAML comments and lists read across comment lines and multi-line flow syntax.
- Verification: node --test tests/viber/issue-templates.test.ts -> all pass
- DoD: `type: Bug # x` and `labels: ["bug", "triage"] # y` print `TYPE=Bug` and `LABELS=bug, triage`; a block list with a full-line comment before its items prints `LABELS=bug, triage`; a flow list opened with `[` and closed on a later line prints `LABELS=bug, triage`; a quoted `"[Bug]: "` title keeps its brackets and colon
<!-- /TASK -->

<!-- TASK -->
### T19 - Find Playwright in a nested package.json with a quoted path
- TDD: required
- Covers: AC19
- Uses: none
- Depends-on: none
- Files: viber/scripts/check-playwright.sh, tests/viber/check-playwright.test.ts
- Delivers: tracked `package.json` paths listed unquoted.
- Verification: node --test tests/viber/check-playwright.test.ts -> all pass
- DoD: a tracked `apps/źródło/package.json` declaring `@playwright/test` prints `@playwright/test: found`; an untracked nested `package.json` is still not read
<!-- /TASK -->

## Contracts

### C1 - red-check mangled-command line

File: viber/scripts/red-check.sh

`red-check: UNRUNNABLE verify command mangled by shell substitution: <log path, repo-relative>`, printed instead of `red-check: UNRUNNABLE control run failed (exit 127): <log>` when the control run exits 127 and its log section holds `<word>: command not found` for a word other than the first word of the verify command.

### C2 - Extras ownership refusal

File: viber/scripts/commit-task.sh

`warning: refused <repo-relative path> - claimed by task <id>`, on stderr, the path left unstaged and the commit going on.

### C3 - archive-run empty key refusal

File: viber/scripts/archive-run.sh

Exit 2, stderr `error: refused <dir as typed> - no run key`, nothing moved.

### C4 - verify command value

File: viber/scripts/plan-index.sh

The command field of `verify: <id> | <command>` and `recheck: <id> | <command>`: the task `Verification` text cut at its first ` -> `, trimmed, then, when the whole value opens and closes with a backtick, that first and last backtick removed and the rest trimmed again; every backtick inside is kept.

### C5 - Landed run plan

File: none

A plan file whose own directory holds `status.md`.

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

## Attachments
docs/_specs/2026-10-21-17-25-20_fix-the-build-and-publish-script-defects-of-the-bugs-audit-p/attachments/findings.md

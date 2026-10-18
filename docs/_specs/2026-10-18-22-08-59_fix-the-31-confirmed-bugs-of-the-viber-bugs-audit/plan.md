---
source: /Users/dario/Projects/p2p2.claude/docs/_specs/2026-10-18-22-08-59_fix-the-31-confirmed-bugs-of-the-viber-bugs-audit/plan.md
attachments:
  findings.md: /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/findings.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Fix the 31 confirmed bugs of the viber bugs audit

## Goal

Fix every bug the code-auditor bugs run over `viber/` confirmed, each one pinned by a regression test that replays the finding's own reproduction. The audit's `findings.md` (attachment) lists them: ten full entries and twenty-one further findings, every one verified by an independent critic.

## Problem

viber's hooks, run scripts, commit skill, setup, GitHub wrappers, map scripts and skill tools give wrong results on real inputs: the plan gate denies a reviewed plan, commits take files nobody named or drop staged exec bits, `status.md` gets corrupted by a Windows path, guard hooks time out and fail open, a draft round deletes the only copy of an attachment, and several scripts report success after a failure. Left alone, builds stall, commits carry the wrong files, and Windows and macOS users hit the failures first.

## Current behaviour

Each finding in `attachments/findings.md` states the input, the command and the wrong observed result; the report path at the end of each further-findings line holds the full reproduction. In short: the plan gate reads `api-request-blob` transcript lines as real events; `commit-task.sh` and `commit.sh` compare or pass paths in a form that misses ownership or reads them as globs; several scripts hand shell values to awk through `-v`; two hooks unescape JSON in the inherited UTF-8 locale; `plan-index.sh` and `plan-path.sh` read structure that a code fence, a whitespace-only line, a case-only name difference or a backticked `;` breaks; `bootstrap.sh` disagrees with `config.sh` on group headers; the GitHub wrappers ignore a failed `gh` call or disagree on when a thread is answered.

### Must not change

- Every behaviour an existing test under `tests/` asserts keeps passing, except an assertion a task's own `Files` lists because that task changes exactly that behaviour.
- Every touched script keeps running on macOS (`/bin/bash` 3.2, BSD awk) and Windows Git Bash: no heredoc, no GNU-only tool, awk values through `ENVIRON`.
- Exit codes and stdout lines a script header documents keep their meaning, except the ones a `## Contracts` block below changes.

## Behaviour

### S1 - The plan gate allows a reviewed plan [CHANGED - was: denied it when a transcript held an `api-request-blob` line]

Given a planner episode whose reviewer returned `VERDICT: PASS` on the current plan version, and a transcript holding an `api-request-blob` line replaying that message
When `ExitPlanMode` is called
Then the gate allows it, exactly as it does without the blob line.

### S2 - Commits take exactly the named or owned files [CHANGED - was: absolute paths skipped ownership, bracketed paths globbed, `#N` widened a selection]

Given a commit call naming a path written absolute, a path with `[id]`, or an existing path containing `#12`
When `commit-task.sh` or `commit.sh` runs
Then the commit holds exactly the files the task owns or the user named, and an open task's file is refused with its warning.

### S3 - Staged exec bits survive every commit path [CHANGED - was: dropped by `commit.sh`, `archive-run.sh` and the audit overlay]

Given a file whose index mode was set to `100755` with `git update-index --chmod=+x`
When `commit.sh`, `archive-run.sh` or `diff-overlay.sh` handles it
Then the commit or checkout carries `100755` and no mode change is left staged.

### S4 - Values keep their bytes through awk [CHANGED - was: `\n`, `\t`, `\b` in a path rewritten]

Given a `--defer`/`--owe` path or a directory name holding a backslash
When `commit-task.sh` writes `status.md` or `memory-map.sh` checks a node
Then the value is written and compared byte for byte.

### S5 - Guard hooks answer within their timeout [CHANGED - was: an 11.5 KB command or an 17.8 KB message ran past 10 s and printed nothing]

Given the reproduction payloads of the findings, under a UTF-8 locale on bash 3.2
When `kill-guard.sh` or `verdict-nudge.sh` runs
Then it prints its deny or block line in under 10 s. The slowdown shows only on bash 3.2 (macOS `/bin/bash`): on bash 5 (Linux CI) the regression test passes before the fix too, so it is RED only on macOS or the manual macOS CI leg.

### S6 - Plan parsing respects fences, spans and blank-looking lines [CHANGED - was: fenced `## ` lines, backticked `;`, whitespace-only map lines and case-only duplicates broke the parse]

Given a plan carrying one of those shapes
When `plan-index.sh` validates and splits it or `plan-path.sh` lands it
Then contract blocks, `spec.md`, DoD clauses and attachments come out whole, and a case-only duplicate attachment name is refused with exit 7.

### S7 - A draft round keeps an attachment it cannot recopy [CHANGED - was: deleted the run's only copy]

Given a landed draft whose attachment source under `.temp/` is gone
When the next `--into` round lands with the same map
Then the run keeps its former copy of that attachment, and one warning names the missing source.

### S8 - Setup and config agree [CHANGED - was: a commented group header, a reopened group or a tracked local file made setup diverge from `config.sh`]

Given `.claude/viber.yml` with `build: # comment`, a second `build:` block, or a tracked `.claude/viber.local.yml`
When `bootstrap.sh` runs, once or again
Then `config.sh` reads every user value and every restored default, and `.gitignore` gains its entry at most once.

### S9 - Builds never resume a settled task and report leftovers by real path [CHANGED - was: a skipped task could be re-dispatched and committed; a comma in a path split it]

Given a run with a skipped task holding dirty files, or a changed file named `notes/q3, draft.md`
When the build resumes or closes
Then the skipped task is neither asked about nor committable, and the orphan path reaches the closeout whole.

### S10 - Wrappers and tools report failure as failure [CHANGED - was: success on a failed `gh`, a skipped follow-up reply, a project reference gh cannot resolve, a blank report, a false lint FAIL, a false worktree failure, a false no-change arbiter]

Given each finding's reproduction input
When the script runs
Then it either does the work or refuses what it must refuse (denies a `>&file` write, counts a quoted tracked path as tracked, refuses an extension under an inline-valued key, fails a task commit whose own file cannot be staged, posts the follow-up reply, resolves the project, renders the report, lints the CRLF file, reports the worktree ready, routes a no-change repair round straight to the tests arbiter) or reports the failure with its documented error line and exit code.

### Edge cases

- A glob-shaped commit selector (`src/*.ts`) -> no longer resolves to the files it matches; it is read as a literal path.
- A `--with` path outside the repository -> still rejected by git, unchanged.
- `src/foo #42` as a commit selector -> still resolves to `src/foo` with `Refs: #42`.
- A rerun of the same viber reply on a thread whose newest reply is that reply -> still skipped.
- A `--project` value that is a plain title (`Roadmap`) -> passed to gh unchanged.
- A map entry whose source is missing and that has no former copy -> one warning, nothing landed, as today.
- A real value on a group header (`build: true`) -> still left alone by the merge.
- A `git worktree add` that really failed (no `.git` in the target) -> still `WORKTREE_FAILED`.

## Glossary

- Project reference - how a GitHub issue form names a project: by its owner and number, not by the title people see.
- Settled task - a task the build has finished with, done or dropped; it is never worked on again.

## Root cause

Each defect is a producer and a consumer reading one value two ways: a path form (absolute, glob, `#N`, comma-joined), an escape layer (awk `-v`, JSON in a UTF-8 locale, HTML script context), a structural grammar (fences, backtick spans, whitespace lines, commented or reopened groups, case-insensitive names), or a status (a `gh` exit code, a hook's exit code, a transcript record type, a staged index mode). The fixes already made for one copy (`GIT_LITERAL_PATHSPECS`, `ENVIRON`, `LC_ALL=C`, `commit_named`, `sync_tree_modes`, `-z`) never reached the others.

## Acceptance criteria

1. `plan-gate.sh` allows `ExitPlanMode` after a PASS on the current plan version when the transcript holds `api-request-blob` lines (finding 2 of `findings.md`).
2. `commit-task.sh` refuses an open task's file given as an absolute `--with` path or extras line, with the same warning as its relative spelling (finding 3).
3. `commit-task.sh` writes a backslashed `--defer`/`--owe` entry into `status.md` byte for byte on one line (finding 4).
4. `kill-guard.sh` prints its deny for the 11.5 KB reproduction command and `verdict-nudge.sh` its block line for the 17.8 KB message, each in under 10 s under a UTF-8 locale (finding 5).
5. `commit-task.sh` exits 5 with `status.md` restored when `git add` fails on a tracked path of the task (finding 8).
6. A `--into` draft round keeps the former `attachments/<name>` whose source is gone and prints one warning (finding 9).
7. `commit.sh 'app/[id]/page.tsx'` commits only that file (finding 1).
8. `pr-reply.sh` posts a reply on a thread whose newest comment is a reviewer's follow-up after a viber reply, and still skips a thread whose newest reply carries the marker (finding 6).
9. `commit.sh` commits a mode staged with `update-index --chmod=+x` under `core.fileMode=true` (finding 7).
10. `commit.sh 'bugs/#12.md'` commits only `bugs/#12.md` and writes no `Refs:` footer (finding 10).
11. `plan-index.sh --split` keeps a contract block whose fenced shape holds `## ` lines whole, and cuts `spec.md` at the real `## Tasks` heading, not a fenced one (further finding U2-1/U2-2).
12. `plan-path.sh --land` copies every attachment-map entry after a whitespace-only map line (U3-2).
13. `archive-run.sh` keeps a `100755` file at `100755` under `core.fileMode=false` and leaves the tree clean (U4-1).
14. `bootstrap.sh` migrates flat switches and restores defaults under a group header carrying a trailing comment (U8-1).
15. `bootstrap.sh` keeps a child the user declared in a second block of the same group (U8-2).
16. `pr-facts.sh` prints `ERROR pr-facts.sh:` and exits 1 when `gh pr list` fails (U10-2).
17. `worktree.sh add` prints `WORKTREE_READY` when only a post-checkout hook failed (U14-2).
18. `build_report.mjs` output parses back to its input JSON with no live `<!--` or `<script` in the embedded data, for text holding both (U18-1).
19. `issue-create.sh` passes the project title to `gh issue create --project` for an `<owner>/<number>` value, and exits 1 with an `ERROR` line before creating when the reference cannot be resolved (U11-1).
20. `plan-path.sh --land` refuses two attachment names that differ only by case with exit 7 (U3-3).
21. `extension.sh --add` answers `STATUS=stale` and leaves the file untouched under an inline-valued `extensions:` (U6-1).
22. `shell-guard.sh` denies `>&file` and `N>&file` writes to a relative working-tree path, and still allows `>&2`, `>&-` and `2>&1` (U7-3).
23. A resumed build neither asks about nor dispatches a skipped task's `dirty:` files, and `commit-task.sh` refuses a task commit for a skipped task (U9-1).
24. A step 5 repair round whose every repair commit exits 4 goes to the tests arbiter with no commit retry, no `commit` arbiter and no `left uncommitted:` line (U9-2).
25. A changed path holding a comma reaches the closeout as one whole `orphan:` path (U9-3).
26. `rules-map.sh` counts tracked paths holding `"` or `\` as tracked and matching (U13-1).
27. `memory-map.sh` reports no `orphan:` for a node whose directory name holds a backslash and other tracked files (U13-2).
28. `diff-overlay.sh` gives the checkout's index the staged mode of each overlaid path (U14-1).
29. `plan-index.sh` cuts a DoD line only on a `;` outside backtick spans, in the task file and in the clause count (U15-2).
30. `lint_skill.sh` lints a CRLF `SKILL.md` exactly as its LF copy (U18-2).
31. `bootstrap.sh` appends `.claude/viber.local.yml` to `.gitignore` at most once when that file is tracked (U8-3).
32. `plan-index.sh --extra` matches an extras path written absolute against the plan's `Files:` entries exactly as its repo-relative spelling (finding 3's second site).

## Scope

### File map

- modify - viber/hooks/scripts/kill-guard.sh - Bash kill guard; sets the C locale before unescaping
- modify - viber/hooks/scripts/verdict-nudge.sh - SubagentStop nudge; sets the C locale before unescaping
- modify - viber/hooks/scripts/plan-gate.sh - plan gate; ignores `api-request-blob` records in every transcript scan
- modify - viber/hooks/scripts/plan-hints.sh - planner hints; shares the gate's episode scan, ignores the same records
- modify - viber/hooks/scripts/shell-guard.sh - shell guard tokenizer; reads `>&word` as a redirect
- modify - viber/scripts/commit-task.sh - task commits; path folding, awk values, staging failures, settled-task refusal
- modify - viber/scripts/plan-index.sh - plan validator and splitter; fences, DoD backtick spans, one `orphan:` line per path
- modify - viber/scripts/plan-path.sh - plan landing; attachment replacement, map grammar, case-insensitive uniqueness
- modify - viber/scripts/archive-run.sh - run archive commit through a temporary index
- modify - viber/scripts/pr-reply.sh - reply wrapper; newest-reply skip rule
- modify - viber/scripts/pr-facts.sh - pull request facts; failed `gh pr list` reported
- modify - viber/scripts/issue-create.sh - issue creation; project reference resolved to its title
- modify - viber/skills/setup/scripts/bootstrap.sh - setup merge; group header grammar, reopened groups, gitignore check
- modify - viber/skills/extension/scripts/extension.sh - extension registration; inline-valued key refused
- modify - viber/skills/commit/scripts/commit.sh - commit skill; literal pathspecs, staged modes
- modify - viber/skills/commit/scripts/commit-context.sh - commit skill context; literal pathspecs
- modify - viber/skills/commit/scripts/commit-args.sh - selector parsing; existing path wins over `#N`
- modify - viber/skills/rules/scripts/rules-map.sh - rules map; NUL-separated tracked list
- modify - viber/skills/memory/scripts/memory-map.sh - memory map; awk values through `ENVIRON`
- modify - viber/skills/code-auditor/scripts/diff-overlay.sh - audit overlay; index modes carried
- modify - viber/skills/code-auditor/scripts/worktree.sh - audit worktrees; success judged by the end state
- modify - viber/skills/idea-validator/scripts/build_report.mjs - report builder; every `<` in embedded JSON escaped
- modify - viber/skills/skill-designer/scripts/lint_skill.sh - skill linter; CRLF first line
- modify - viber/skills/implementor/SKILL.md - implementor; settled tasks skipped on resume, commit-outside rule exception, per-line `orphan:`
- modify - viber/agents/closeout.md - closeout; reads one `orphan:` line per path
- modify - tests/viber/kill-guard.test.ts, verdict-nudge.test.ts, plan-gate.test.ts, plan-hints.test.ts, shell-guard.test.ts, commit-task.test.ts, plan-index.test.ts, plan-path.test.ts, archive-run.test.ts, pr-reply.test.ts, pr-facts.test.ts, issue-create.test.ts, bootstrap.test.ts, extension.test.ts, commit.test.ts, commit-context.test.ts, commit-args.test.ts, rules-map.test.ts, memory-map.test.ts, diff-overlay.test.ts, worktree.test.ts, build_report.test.ts, repair-prose.unit.test.ts - each script's regression cases
- add - tests/viber/lint_skill.test.ts - lint_skill.sh regression suite (it has none)
- add - tests/viber/resume-prose.unit.test.ts - implementor and closeout resume and leftover wording

### Out of scope

- Finding U15-1 (refuted: an in-segment bracket is an intended glob in `Files:`).
- Units U16 and U17 (not investigated), except `extension.sh` for its confirmed U6-1.
- `issue-templates.sh` and `viber/references/issue-save.md`: they keep passing the form's value verbatim; the resolution lives in `issue-create.sh`.
- `pr-threads.sh`: its latest-comment rule is the one both scripts follow.
- Refactoring unrelated to a finding; user docs and `help.html` (no user-facing feature changes).

## Solution requirements

- macOS `/bin/bash` 3.2 with BSD awk and Windows Git Bash; `#!/bin/sh` scripts stay POSIX.
- No heredoc; awk values through `ENVIRON`; `${a[@]+"${a[@]}"}` for possibly-empty arrays.
- No test reaches the network: every `gh` is a `withStub`; every write lands in a temp dir.
- `CLAUDE.md` nodes are written by the build's close only.

## Tasks

<!-- TASK -->
### T1 - Answer the kill and verdict hooks within their timeout
- TDD: required
- Covers: AC4
- Uses: none
- Depends-on: none
- Files: viber/hooks/scripts/kill-guard.sh, viber/hooks/scripts/verdict-nudge.sh, tests/viber/kill-guard.test.ts, tests/viber/verdict-nudge.test.ts
- Delivers: both hooks unescape their JSON input in the C locale, as `shell-guard.sh` does, so the reproduction payloads finish inside the 10 s hook timeout
- Verification: node --test tests/viber/kill-guard.test.ts tests/viber/verdict-nudge.test.ts -> all cases pass
- DoD: `kill-guard.sh` run under `LANG=en_US.UTF-8` on the 11.5 KB `viber:test-runner` payload of `pkill -f vite` plus a `node -e` script of 160 `\"`-escaped lines prints its deny line within a 10 s spawn timeout; `verdict-nudge.sh` run under `LANG=en_US.UTF-8` on a 17.8 KB final message with no VERDICT line prints its block line within a 10 s spawn timeout
<!-- /TASK -->

<!-- TASK -->
### T2 - Ignore transcript blob records in the plan gate
- TDD: required
- Covers: AC1
- Uses: none
- Depends-on: none
- Files: viber/hooks/scripts/plan-gate.sh, viber/hooks/scripts/plan-hints.sh, tests/viber/plan-gate.test.ts, tests/viber/plan-hints.test.ts
- Delivers: every transcript scan of the plan gate and the planner hints skips records whose type is `api-request-blob`
- Verification: node --test tests/viber/plan-gate.test.ts tests/viber/plan-hints.test.ts -> all cases pass
- DoD: a planner episode with one `api-request-blob` line replaying `[Edit, Agent]` after the reviewer's async launch, then a PASS for that dispatch, makes `plan-gate.sh` allow; a blob line counted nowhere as a dispatch leaves the PASS paired with the real Agent call's id; `plan-hints.sh` on a transcript holding blob lines prints what it prints for the same transcript without them
<!-- /TASK -->

<!-- TASK -->
### T3 - Refuse a duplicating redirect into a working-tree file
- TDD: required
- Covers: AC22
- Uses: none
- Depends-on: none
- Files: viber/hooks/scripts/shell-guard.sh, tests/viber/shell-guard.test.ts
- Delivers: the shell guard reads `>&word` and `N>&word` with a non-descriptor word as a file redirect whose target it checks
- Verification: node --test tests/viber/shell-guard.test.ts -> all cases pass
- DoD: `echo hi >&out.txt`, `echo hi >& out.txt` and `echo hi 1>&out.txt` from `viber:task-coder` are denied; `>&2`, `>&-`, `npm test > /dev/null 2>&1` and `>&.temp/x` stay allowed
<!-- /TASK -->

<!-- TASK -->
### T4 - Check ownership of absolute task commit paths
- TDD: required
- Covers: AC2
- Uses: none
- Depends-on: none
- Files: viber/scripts/commit-task.sh, tests/viber/commit-task.test.ts
- Delivers: every `--with`, extras-file, `--defer` and `--owe` path is folded to its repo-relative form before the ownership check, the `.temp` refusal and staging
- Verification: node --test tests/viber/commit-task.test.ts -> all cases pass
- DoD: an extras line `$PWD/src/b.ts` for a file of the open fixture task `T2` gives `warning: refused src/b.ts - claimed by task T2` and leaves `src/b.ts` out of fixture task `T1`'s commit; `--with "$PWD/src/b.ts"` gives the same refusal; an absolute path under `.temp/` is refused like its relative form; a path outside the repository still fails in git
<!-- /TASK -->

<!-- TASK -->
### T5 - Write status entries byte for byte
- TDD: required
- Covers: AC3
- Uses: none
- Depends-on: T4
- Files: viber/scripts/commit-task.sh, tests/viber/commit-task.test.ts
- Delivers: every awk call of `commit-task.sh` that receives a shell value reads it through `ENVIRON`
- Verification: node --test tests/viber/commit-task.test.ts -> all cases pass
- DoD: `--defer 'T2:src\new\b.ts' --owe 'src\lib\table.ts'` commits a `status.md` holding `deferred: T2:src\new\b.ts` and `owed: T1:src\lib\table.ts`, each on one line, with no stray line; a task id or `Files:` entry holding a backslash is matched by its claimant check
<!-- /TASK -->

<!-- TASK -->
### T6 - Fail a task commit whose own tracked file cannot be staged
- TDD: required
- Covers: AC5
- Uses: none
- Depends-on: T5
- Files: viber/scripts/commit-task.sh, tests/viber/commit-task.test.ts
- Delivers: a `git add` failure on a path git knows (in the index or HEAD) ends the call with exit 5 and `status.md` restored; the `could not stage` warning stays for unknown or ignored-untracked paths
- Verification: node --test tests/viber/commit-task.test.ts -> all cases pass
- DoD: with a `git` shim holding `.git/index.lock` during the first two `git add` calls, a commit of fixture task `T1` (`Files: src/a.ts, src/c.ts`, both modified) exits 5, records no `done: T1` and makes no commit; a `Files:` path git does not know still gets `warning: could not stage <path>` and the commit goes ahead
<!-- /TASK -->

<!-- TASK -->
### T7 - Never resume or commit a skipped task
- TDD: required
- Covers: AC23
- Uses: C2
- Depends-on: T6
- Files: viber/scripts/commit-task.sh, tests/viber/commit-task.test.ts, viber/skills/implementor/SKILL.md, tests/viber/resume-prose.unit.test.ts
- Delivers: `commit-task.sh` refuses a task commit for a task on the `skipped:` line; the implementor's `dirty:` rule asks only about a task not on the index's `skipped:` line
- Verification: node --test tests/viber/commit-task.test.ts tests/viber/resume-prose.unit.test.ts -> all cases pass
- DoD: a task commit of fixture task `T2` after `--skip T2` exits 2 with the C2 error line, `status.md` unchanged and no commit; the fix-number form `commit-task.sh <plan> T2 1 <file>` for that skipped task still commits as today; the `dirty:` bullet of `viber/skills/implementor/SKILL.md` states that a task on the `skipped:` line gets no question and no dispatch, its files left for the closeout
<!-- /TASK -->

<!-- TASK -->
### T8 - Route a no-change repair round straight to the tests arbiter
- TDD: required
- Covers: AC24
- Uses: none
- Depends-on: T7
- Files: viber/skills/implementor/SKILL.md, tests/viber/repair-prose.unit.test.ts
- Delivers: the implementor's "Commit outside a task" rule excepts a step 5 repair commit exiting 4, which the step 5 no-change rule of `parts/close.md` handles alone
- Verification: node --test tests/viber/repair-prose.unit.test.ts -> all cases pass
- DoD: the "Commit outside a task" sentence of `viber/skills/implementor/SKILL.md` names exit 4 of the fix-number repair form and `--repair` as handled by step 5, with no retry, no `commit` arbiter and no `left uncommitted:` line; the step 5 rule of `viber/skills/implementor/parts/close.md` ("every repair commit call of the round exiting 4") stays as written
<!-- /TASK -->

<!-- TASK -->
### T9 - Read plan headings outside code fences only
- TDD: required
- Covers: AC11
- Uses: none
- Depends-on: none
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: the contract-block parser, the `spec.md` cut and the validator's heading rules treat a heading line inside a ``` or ~~~ fence as body text
- Verification: node --test tests/viber/plan-index.test.ts -> all cases pass
- DoD: a contract `C1` whose fenced shape holds `# Report`, `## Findings` and `## Coverage notes` reaches `tasks/T1.md` whole with its closing fence; a second contract after such a fence is recognized and the plan validates; a fenced example opening `## Tasks` above the real heading leaves `spec.md` holding Acceptance criteria and Scope and every task file's `## Covered criteria` filled
<!-- /TASK -->

<!-- TASK -->
### T10 - Cut DoD clauses outside backtick spans only
- TDD: required
- Covers: AC29
- Uses: none
- Depends-on: T9
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: the DoD split of the task file and the clause-count limit both cut on a `;` outside backtick spans only
- Verification: node --test tests/viber/plan-index.test.ts -> all cases pass
- DoD: a DoD of two clauses, one quoting `color: var(--accent); font-weight: 600;` in backticks, yields `DoD.1` and `DoD.2` in the task file with the quoted declaration whole; that DoD counts as two clauses against the limit
<!-- /TASK -->

<!-- TASK -->
### T11 - Report each orphan path on its own line
- TDD: required
- Covers: AC25
- Uses: C1
- Depends-on: T8, T10
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/agents/closeout.md, viber/skills/implementor/SKILL.md, tests/viber/resume-prose.unit.test.ts
- Delivers: `plan-index.sh` prints one `orphan:` line per path, and the closeout and the implementor read those lines that way
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/resume-prose.unit.test.ts -> all cases pass
- DoD: an untracked `notes/q3, draft.md` beside `notes/b.md` gives the two lines `orphan: notes/b.md` and `orphan: notes/q3, draft.md`; `viber/agents/closeout.md` reads one path per `orphan:` line and keeps `dirty:` paths comma-separated; the `orphan:` bullet of `viber/skills/implementor/SKILL.md` gathers every `orphan:` line into its one question
<!-- /TASK -->

<!-- TASK -->
### T12 - Keep an attachment copy whose source is gone
- TDD: required
- Covers: AC6
- Uses: none
- Depends-on: none
- Files: viber/scripts/plan-path.sh, tests/viber/plan-path.test.ts
- Delivers: landing builds the new attachment set beside the run, carries over the former `attachments/<name>` for an entry whose source is missing or fails to copy, and swaps only then
- Verification: node --test tests/viber/plan-path.test.ts -> all cases pass
- DoD: round 1 lands `login.html` from `.temp/`, `.temp` is removed, round 2 with `into:` and the same map exits 0, keeps `attachments/login.html` with its round 1 content and prints one `warning: attachment not found, not landed:` line; an entry the new map drops is removed; a missing source with no former copy lands nothing and warns once
<!-- /TASK -->

<!-- TASK -->
### T13 - Read the attachments map with one grammar
- TDD: required
- Covers: AC12
- Uses: none
- Depends-on: T12
- Files: viber/scripts/plan-path.sh, tests/viber/plan-path.test.ts
- Delivers: validation and landing read the same attachment entries, whatever whitespace-only lines the map holds
- Verification: node --test tests/viber/plan-path.test.ts -> all cases pass
- DoD: a map `a.html`, a line of two spaces, `b.html` lands both files with exit 0; the same map repeating `b.html` after that line still exits 7 with `duplicate name b.html`
<!-- /TASK -->

<!-- TASK -->
### T14 - Refuse attachment names that differ only by case
- TDD: required
- Covers: AC20
- Uses: none
- Depends-on: T13
- Files: viber/scripts/plan-path.sh, tests/viber/plan-path.test.ts
- Delivers: the attachment uniqueness check compares names case-insensitively
- Verification: node --test tests/viber/plan-path.test.ts -> all cases pass
- DoD: a map holding `Notes.md` and `notes.md` exits 7 with `error: unusable attachments: duplicate name notes.md` and lands nothing; names differing in more than case still land
<!-- /TASK -->

<!-- TASK -->
### T15 - Archive a run with its index modes
- TDD: required
- Covers: AC13
- Uses: none
- Depends-on: none
- Files: viber/scripts/archive-run.sh, tests/viber/archive-run.test.ts
- Delivers: the archive commit goes through a temporary index built from HEAD and the real index's entries for the archived paths, as `commit_named()` in `commit-task.sh` does
- Verification: node --test tests/viber/archive-run.test.ts -> all cases pass
- DoD: under `core.fileMode=false`, a run holding `attachments/run.sh` staged `100755` over a 0644 disk file archives with `100755` in the commit and an empty `git status --short`; a path staged beside the run before the call stays staged; spec.md is still recorded as a rename
<!-- /TASK -->

<!-- TASK -->
### T16 - Treat a commented group header as a group
- TDD: required
- Covers: AC14
- Uses: none
- Depends-on: none
- Files: viber/skills/setup/scripts/bootstrap.sh, tests/viber/bootstrap.test.ts
- Delivers: the setup merge accepts a trailing comment on a group header wherever it decides a group carries children
- Verification: node --test tests/viber/bootstrap.test.ts -> all cases pass
- DoD: `qa: true` / `build: # switches` / `  memory: true` migrates so `config.sh` prints `build.qa: true` and `build.final-review`, `build.rules`, `build.cleanup` true; `build: true` is still left alone
<!-- /TASK -->

<!-- TASK -->
### T17 - Keep a child declared in a reopened group
- TDD: required
- Covers: AC15
- Uses: none
- Depends-on: T16
- Files: viber/skills/setup/scripts/bootstrap.sh, tests/viber/bootstrap.test.ts
- Delivers: the setup merge reads the children of every block of a group, not only the first
- Verification: node --test tests/viber/bootstrap.test.ts -> all cases pass
- DoD: a `viber.yml` whose `  qa: true` sits in a second `build:` block keeps `config.sh` printing `build.qa: true` after `bootstrap.sh`, and no `qa:` line is inserted into the first block
<!-- /TASK -->

<!-- TASK -->
### T18 - Add the local config ignore line once
- TDD: required
- Covers: AC31
- Uses: none
- Depends-on: T17
- Files: viber/skills/setup/scripts/bootstrap.sh, tests/viber/bootstrap.test.ts
- Delivers: the `.gitignore` check asks whether a rule ignores `.claude/viber.local.yml` regardless of whether the file is tracked
- Verification: node --test tests/viber/bootstrap.test.ts -> all cases pass
- DoD: with `.claude/viber.local.yml` committed, three `bootstrap.sh` runs leave exactly one `.claude/viber.local.yml` line in `.gitignore`
<!-- /TASK -->

<!-- TASK -->
### T19 - Refuse to register an extension under an inline-valued key
- TDD: required
- Covers: AC21
- Uses: none
- Depends-on: none
- Files: viber/skills/extension/scripts/extension.sh, tests/viber/extension.test.ts
- Delivers: `extension.sh --add` reports an `extensions:` key carrying an inline value as stale and writes nothing
- Verification: node --test tests/viber/extension.test.ts -> all cases pass
- DoD: `build:` / `  extensions: {}` makes `--add doc-writer` print `STATUS=stale` with the file byte-identical; a bare `extensions:` still gives `added`, then `present`
<!-- /TASK -->

<!-- TASK -->
### T20 - Post a reply to a reviewer follow-up
- TDD: required
- Covers: AC8
- Uses: none
- Depends-on: none
- Files: viber/scripts/pr-reply.sh, tests/viber/pr-reply.test.ts
- Delivers: `pr-reply.sh` skips only when the newest reply to the thread's first comment carries the reply marker, the rule `pr-threads.sh` lists threads by
- Verification: node --test tests/viber/pr-reply.test.ts -> all cases pass
- DoD: a stubbed thread 101 (reviewer), 102 (viber reply with marker 101), 103 (reviewer follow-up) makes `pr-reply.sh 42 101 <file>` post once and print `POSTED`; a thread whose newest reply carries the marker still gives `STATUS=skip REASON=exists` with no POST
<!-- /TASK -->

<!-- TASK -->
### T21 - Report a failed pull request lookup
- TDD: required
- Covers: AC16
- Uses: none
- Depends-on: none
- Files: viber/scripts/pr-facts.sh, tests/viber/pr-facts.test.ts
- Delivers: `pr-facts.sh` checks the exit status of `gh pr list` and reports a failure instead of a ready block
- Verification: node --test tests/viber/pr-facts.test.ts -> all cases pass
- DoD: a stubbed `gh pr list` exiting 1 makes `pr-facts.sh` print `ERROR pr-facts.sh: gh pr list failed` on stderr, nothing on stdout, and exit 1; a stubbed open pull request still gives `STATUS=stop` / `REASON=pr-exists`
<!-- /TASK -->

<!-- TASK -->
### T22 - Resolve a project reference to its title
- TDD: required
- Covers: AC19
- Uses: C3
- Depends-on: none
- Files: viber/scripts/issue-create.sh, tests/viber/issue-create.test.ts
- Delivers: `issue-create.sh` turns each `--project <owner>/<number>` into the project's title before `gh issue create`, and passes any other value unchanged
- Verification: node --test tests/viber/issue-create.test.ts -> all cases pass
- DoD: with a stubbed `gh project view 44 --owner octo-org` answering the title `Roadmap`, `--project octo-org/44` reaches `gh issue create` as `--project Roadmap`; a stubbed lookup failure prints the C3 error line, exits 1 and calls no `gh issue create`; `--project Roadmap` reaches gh unchanged
<!-- /TASK -->

<!-- TASK -->
### T23 - Read commit selectors as literal paths
- TDD: required
- Covers: AC7
- Uses: none
- Depends-on: none
- Files: viber/skills/commit/scripts/commit.sh, viber/skills/commit/scripts/commit-context.sh, tests/viber/commit.test.ts, tests/viber/commit-context.test.ts
- Delivers: the commit skill's scripts pass every selected path to git as a literal pathspec
- Verification: node --test tests/viber/commit.test.ts tests/viber/commit-context.test.ts -> all cases pass
- DoD: with `app/[id]/page.tsx` and `app/i/page.tsx` both changed, `commit.sh "fix: id page" 'app/[id]/page.tsx'` commits one file and leaves `app/i/page.tsx` modified; `commit-context.sh 'app/[id]/page.tsx'` lists only `app/[id]/page.tsx` in its status; `commit.sh "x" 'src/*.ts'` with no file literally named `src/*.ts` selects no file
<!-- /TASK -->

<!-- TASK -->
### T24 - Commit an exec bit staged by update-index
- TDD: required
- Covers: AC9
- Uses: none
- Depends-on: T23
- Files: viber/skills/commit/scripts/commit.sh, tests/viber/commit.test.ts
- Delivers: before staging, `commit.sh` gives the working tree the index mode of every path whose staged mode differs from HEAD, as `sync_tree_modes` in `commit-task.sh` does
- Verification: node --test tests/viber/commit.test.ts -> all cases pass
- DoD: under `core.fileMode=true`, `run.sh` committed 0644 then `git update-index --chmod=+x run.sh` makes `commit.sh "chore: exec" run.sh` commit `run.sh` at `100755`, in paths mode and in mode `all`; the `core.fileMode=false` case still commits the mode change
<!-- /TASK -->

<!-- TASK -->
### T25 - Let an existing path win over an issue reference
- TDD: required
- Covers: AC10
- Uses: none
- Depends-on: T24
- Files: viber/skills/commit/scripts/commit-args.sh, tests/viber/commit-args.test.ts, tests/viber/commit.test.ts
- Delivers: the selector parser takes the whole argument, or a whitespace token, as a path when it exists, before cutting `#N` references, and a cut removes only the `#N` itself
- Verification: node --test tests/viber/commit-args.test.ts tests/viber/commit.test.ts -> all cases pass
- DoD: an existing `bugs/#12.md` resolves to mode `paths` with path `bugs/#12.md` and no reference; with `bugs/#12.md` and `bugs/other.md` both changed, `commit.sh "docs: bug 12" 'bugs/#12.md'` commits one file, leaves `bugs/other.md` modified and writes no `Refs:` footer; `src/foo #42` still resolves to `src/foo` with reference 42; `(#42,#7)` still resolves to references 42 and 7
<!-- /TASK -->

<!-- TASK -->
### T26 - Read the tracked list without quoting
- TDD: required
- Covers: AC26
- Uses: none
- Depends-on: none
- Files: viber/skills/rules/scripts/rules-map.sh, tests/viber/rules-map.test.ts
- Delivers: `rules-map.sh` reads `git ls-files` NUL-separated, so tracked paths compare equal to raw ones
- Verification: node --test tests/viber/rules-map.test.ts -> all cases pass
- DoD: in a clean repository with a committed rule `.claude/rules/a"b.md` and files `lib/q"x.ts`, `lib/back\slash.ts` matched by `lib/*.ts`, the map prints no `dirty:` line, `lib.md ... matches 2`, no `dead: .claude/rules/lib.md`; `--reset '.claude/rules/a"b.md'` exits 0
<!-- /TASK -->

<!-- TASK -->
### T27 - Pass memory map values to awk through the environment
- TDD: required
- Covers: AC27
- Uses: none
- Depends-on: none
- Files: viber/skills/memory/scripts/memory-map.sh, tests/viber/memory-map.test.ts
- Delivers: every awk call of `memory-map.sh` that receives a shell value reads it through `ENVIRON`
- Verification: node --test tests/viber/memory-map.test.ts -> all cases pass
- DoD: a node `we\tird/CLAUDE.md` beside four tracked files in `we\tird/` gets no `orphan:` line, like the same layout under `plain/`
<!-- /TASK -->

<!-- TASK -->
### T28 - Carry staged index modes into the audit overlay
- TDD: required
- Covers: AC28
- Uses: none
- Depends-on: none
- Files: viber/skills/code-auditor/scripts/diff-overlay.sh, tests/viber/diff-overlay.test.ts
- Delivers: the overlay sets the checkout's index mode of each overlaid path to the source index's mode
- Verification: node --test tests/viber/diff-overlay.test.ts -> all cases pass
- DoD: a source repository with `core.fileMode=false` and a file staged `100644 -> 100755` gives the overlaid checkout `100755` for it in `git ls-files -s`; a staged `100755 -> 100644` gives `100644`
<!-- /TASK -->

<!-- TASK -->
### T29 - Judge a worktree add by the worktree it made
- TDD: required
- Covers: AC17
- Uses: none
- Depends-on: none
- Files: viber/skills/code-auditor/scripts/worktree.sh, tests/viber/worktree.test.ts
- Delivers: `worktree.sh add` treats a non-zero `git worktree add` as failed only when no worktree exists at the target
- Verification: node --test tests/viber/worktree.test.ts -> all cases pass
- DoD: a repository whose post-checkout hook exits 1 gets `WORKTREE_READY <path>` and exit 0 from `worktree.sh add`, the target inside a work tree; a target git cannot create still gets `WORKTREE_FAILED`
<!-- /TASK -->

<!-- TASK -->
### T30 - Escape every angle bracket of the embedded report data
- TDD: required
- Covers: AC18
- Uses: none
- Depends-on: none
- Files: viber/skills/idea-validator/scripts/build_report.mjs, tests/viber/build_report.test.ts
- Delivers: the report builder writes the embedded JSON with every `<` escaped as `<`
- Verification: node --test tests/viber/build_report.test.ts -> all cases pass
- DoD: a valid report whose first fact text is `Users paste <!-- comment markers and a <script src=x> embed snippet` builds with `OK`, its `report-data` element holds no `<` character, and `JSON.parse` of that element's text equals the input
<!-- /TASK -->

<!-- TASK -->
### T31 - Lint a CRLF skill file like its LF copy
- TDD: required
- Covers: AC30
- Uses: none
- Depends-on: none
- Files: viber/skills/skill-designer/scripts/lint_skill.sh, tests/viber/lint_skill.test.ts
- Delivers: the linter strips a carriage return from the first line before checking the frontmatter opener
- Verification: node --test tests/viber/lint_skill.test.ts -> all cases pass
- DoD: a valid `SKILL.md` with LF endings prints `FAIL=0 WARN=0` and exits 0; its CRLF copy prints the same and exits 0; a file with no frontmatter still prints `no YAML frontmatter` and exits 1
<!-- /TASK -->

<!-- TASK -->
### T32 - Match absolute extras paths in the reviewer scope
- TDD: required
- Covers: AC32
- Uses: none
- Depends-on: T11
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: `plan-index.sh --extra` folds each extras path to its repo-relative form before comparing it with the plan's `Files:` entries
- Verification: node --test tests/viber/plan-index.test.ts -> all cases pass
- DoD: an extras file of fixture task `T1` listing `$PWD/src/b.ts`, a file fixture task `T2` claims, makes `--extra T1` report it exactly as it reports the line `src/b.ts`; a path outside the repository is reported as written
<!-- /TASK -->

## Contracts

### C1 - plan-index orphan line

File: viber/scripts/plan-index.sh

```
orphan: <one repo-relative path>
```

One line per orphan path, in git order, after every `dirty:` line; no line when there is none. `dirty: <id> | <path>,<path>` keeps its comma-joined form.

### C2 - commit-task settled task refusal

File: viber/scripts/commit-task.sh

Refused form: the task commit `commit-task.sh <plan> <id>` (with or without `--with`, `--defer`, `--owe`), for an id on `status.md`'s `skipped:` line. Every other form (the fix-number form `<plan> <id> <round> <file>...`, `--landed`, `--repair`, `--outside` and the rest) is unchanged.

```
stderr: error: task '<id>' is skipped - it cannot be committed
exit 2, status.md untouched, no commit
```

### C3 - issue-create project reference

File: viber/scripts/issue-create.sh

```
--project <owner>/<number>   resolved by: gh project view <number> --owner <owner> --format json --jq .title
--project <anything else>    passed to gh verbatim
lookup failure -> stderr: ERROR issue-create.sh: project <owner>/<number> not found ; exit 1 ; no gh issue create
```

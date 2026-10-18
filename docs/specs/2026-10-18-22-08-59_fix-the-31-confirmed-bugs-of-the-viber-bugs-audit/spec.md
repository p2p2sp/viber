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

## Attachments
docs/_specs/2026-10-18-22-08-59_fix-the-31-confirmed-bugs-of-the-viber-bugs-audit/attachments/findings.md

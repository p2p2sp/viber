# Findings - 20261018-194700 (bugs, viber)
bugs · viber · 18 units mapped · 16 hunts · 31 confirmed findings · 2 units not investigated.

## 1. commit.sh reads a bracketed path as a glob and commits a sibling file with it
SEVERITY: 8.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/skills/commit/scripts/commit.sh:L69-L108
CLASS: past-fix-variant: bracketed path read as a wildmatch pathspec (GIT_LITERAL_PATHSPECS fix reached commit-task.sh only)

Severity adopted from the critic (filed 6.0).

Root cause: git reads `[...]`, `*` and `?` in a pathspec as wildmatch, which is why commit-task.sh exports `GIT_LITERAL_PATHSPECS=1`. commit.sh, which promises to commit "ONLY those paths", passes every selected path to `git ls-files`, `git add -u`, `git diff --cached`, `git rm --cached` and `git ls-files -s` with no literal mode, so `app/[id]/page.tsx` also matches `app/i/page.tsx` and the sibling lands in the commit. commit-args.sh already uses `--literal-pathspecs` for `ls-tree`, so literal reading is the intent.

Reproduction: commit `app/[id]/page.tsx` and `app/i/page.tsx`, change both, run `commit.sh "fix: id page" 'app/[id]/page.tsx'`: `2 files changed`, both files in HEAD, `git status --short` empty. With `GIT_LITERAL_PATHSPECS=1` the same call commits only the named file.

Fix sketch: export `GIT_LITERAL_PATHSPECS=1` in commit.sh (and commit-context.sh for its status and diff) after the selector resolves, as commit-task.sh does. Mode `all` uses no pathspec. A selector meant as a glob (`src/*.ts`) would stop resolving.

## 2. Plan gate reads api-request-blob replay lines as events and denies a reviewed plan
SEVERITY: 7.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/hooks/scripts/plan-gate.sh:L104-L110
CLASS: contract-mismatch: transcript record type api-request-blob read as a fresh Write/Edit and dispatch

Severity adopted from the critic (filed 6.5).

Root cause: Claude Code writes `{"type":"api-request-blob",...}` lines that replay a whole earlier assistant message on one line. A message that edits the plan and dispatches the reviewer gets a blob after both real lines, so the plan-write grep (L104-L109) moves `plan_write_line` past the real dispatch and the pair awk finds no dispatch: the gate denies "review the plan" although the reviewer returned PASS on that version. When a blob counts as a dispatch, L218 binds the dispatch id to the blob's first tool_use (an Edit or Read), so the PASS is never paired and the gate denies "let the review finish".

Reproduction: a planner episode fixture (Edit of the plan, Agent `viber:planner-review` dispatch, task-notification with `VERDICT: PASS`) allows; the same fixture with one `api-request-blob` line replaying `[Edit, Agent]` after async_launched denies with `Next step: review the plan ...`. Two real transcripts on this machine show the live gate making the same wrong deny, and the critic replayed both.

Fix sketch: skip `api-request-blob` lines in every transcript scan (plan-write grep, pair awk, planner Skill awk) in both plan-gate.sh and plan-hints.sh (change-together pair); add a plan-gate.test.ts fixture with a blob line; keep the id-binding and verdict regexes unchanged.

## 3. An absolute --with or extras path skips the ownership check and commits an open task's file
SEVERITY: 7.0
CONFIDENCE: medium
VERDICT: VERIFIED
LOCATION: viber/scripts/commit-task.sh:L1356-L1395
CLASS: past-fix-variant: path form mismatch (absolute vs repo-relative) in the --with/extras ownership check

Severity adopted from the critic (filed 8.0).

Root cause: a `--with` path and every line of `work/<id>-extra.md` / `-extra-review.md` only get `${x#./}` (L1220, L1362), and `claimants()` (L762-L781) compares that string as is against repo-relative `Files:` entries. An absolute spelling matches no claimant, counts as unowned and is committed with no warning; git accepts absolute pathspecs inside the work tree. The plan argument got `cwd_relative()` in 8d15b228, the ownership paths never did.

Reproduction: T1 (`Files: src/a.ts`), T2 (`Files: src/b.ts`) not done, both modified. `commit-task.sh docs/_specs/run/plan.md T1 --with "$PWD/src/b.ts"` (or that absolute path in `work/T1-extra.md`): exit 0, no warning, T1's commit carries `src/b.ts`. The relative spelling gets `warning: refused src/b.ts - claimed by task T2`.

Fix sketch: run each `--with`, extras, `--defer` and `--owe` path through `cwd_relative` before the ownership check, the `.temp` refusal and staging; leave paths outside the repository unchanged so git still rejects them. `plan-index.sh --extra` (`fset`) needs the same folding.

## 4. mark_status passes entries through awk -v, so a backslashed --defer/--owe path corrupts status.md
SEVERITY: 6.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/scripts/commit-task.sh:L669-L705
CLASS: past-fix-variant: shell value handed to awk via -v (escape processing) instead of ENVIRON

Severity adopted from the critic (filed 6.5).

Root cause: `mark_status`, the one writer of every `status.md` key, runs `awk -v name="$name" -v want="$want"` (L674). awk processes escapes in `-v` values, so a Windows-style path becomes a broken key line plus a stray line. The repo rule `.claude/rules/shell-awk-environ.md` bans `-v` for shell values and `plan-index.sh` already moved to ENVIRON for this.

Reproduction: `commit-task.sh docs/_specs/run/plan.md T1 --defer 'T2:src\new\b.ts' --owe 'src\lib\table.ts'` commits `deferred: T2:src`, a stray `ew^H.ts`, and `owed: T1:srclib<TAB>able.ts`, exit 0. `plan-index.sh` then reads the deferral as `T2:src`.

Fix sketch: pass `name`, `want` and `ntask` through ENVIRON as `status_ids` does; do the same at the other `-v want=` sites (`claimants()` L763, task parser L1258). The same class sits in memory-map.sh (further finding U13-2).

## 5. kill-guard.sh and verdict-nudge.sh run past their 10 s hook timeout on large escaped input
SEVERITY: 6.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/hooks/scripts/kill-guard.sh:L41-L73
CLASS: past-fix-variant: superlinear JSON unescape in a UTF-8 locale on bash 3.2 (the LC_ALL=C fix reached shell-guard.sh only)

Severity adopted from the critic (filed 7.0). Also at: viber/hooks/scripts/verdict-nudge.sh:L28-L58 (U7-2, verified, severity 6).

Root cause: both hooks JSON-unescape their input with chained `${var//pat/rep}` substitutions, which on macOS `/bin/bash` 3.2 in a UTF-8 locale cost far more than linear in input size. shell-guard.sh got `LC_ALL=C` for this exact trap (recorded in viber/hooks/CLAUDE.md); kill-guard.sh and verdict-nudge.sh set only `set -u`. When the harness cancels the hook at 10 s nothing is printed: kill-guard fails open on a `pkill` it should refuse, verdict-nudge drops its nudge and stalls every large agent stop.

Reproduction: an 11.5 KB `viber:test-runner` payload (`pkill -f vite` plus a `node -e` script full of `\"`) under `LANG=en_US.UTF-8 perl -e 'alarm 10; exec @ARGV' /bin/bash viber/hooks/scripts/kill-guard.sh`: killed at 10.0 s, no deny; under `LC_ALL=C` the deny prints in about 1.6-1.9 s. A 17.8 KB final message with no VERDICT line does the same to verdict-nudge.sh (block line in 1.2 s under `LC_ALL=C`).

Fix sketch: set `LC_ALL=C` after `set -u` in both scripts, as shell-guard.sh does. For linear cost, replace the chained substitutions with one pass (or one sed/awk call after the cheap `agent_type` check), keeping the builtin-only early exit for non-viber callers and the `\\` placeholder order.

## 6. Reviewer follow-up after a viber reply is listed for answering, but pr-reply.sh always skips it
SEVERITY: 6.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/scripts/pr-reply.sh:L96-L102
CLASS: contract-mismatch: pr-threads.sh and pr-reply.sh disagree on when a thread is already answered

Severity adopted from the critic (filed 5.0).

Root cause: `pr-threads.sh` (L162) counts a thread as answered only when its latest comment opens with the `<!-- viber:pr-feedback <id> -->` marker, so a reviewer's follow-up after a viber reply relists the thread (its test calls this "the reviewer answered back"). `pr-reply.sh` (L96-L102) skips when any reply to the thread's first comment carries the marker, so the second-round reply always gets `STATUS=skip REASON=exists`. The follow-up becomes a plan task and gets built, but its reply can never be posted.

Reproduction: a gh stub thread 101 (alice), 102 (viber reply, marker 101), 103 (alice "still wrong"). `pr-threads.sh 42` prints `SKIPPED=0` and `THREAD=1 | 101 | ...`; `pr-reply.sh 42 101 reply2.md` prints `STATUS=skip` / `REASON=exists`, exit 0, and the gh log holds no `-X POST`.

Fix sketch: give both scripts one rule, most simply `pr-reply.sh` skipping only when the newest reply to `<id>` carries the marker. A rerun of the same reply must still skip, and both test stubs change together.

## 7. commit.sh drops an exec bit staged with update-index under core.fileMode=true and un-stages it
SEVERITY: 6.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/skills/commit/scripts/commit.sh:L67-L89
CLASS: past-fix-variant: staged exec bit re-read from a 0644 tree by `git add -u` (sync_tree_modes fix b36c0b0c reached commit-task.sh only)

Severity adopted from the critic (filed 5.5).

Root cause: under `core.fileMode=true` (the macOS and Linux default), `git add -u -- <path>` (L72) and `git add -A` (L110) read the mode back from the 0644 file on disk, resetting a mode staged with `git update-index --chmod=+x`. commit.sh's own comment (L67-L68) promises such a change is committed, and `.claude/rules/shell-script-exec-bit.md` tells people to use exactly that command. b36c0b0c fixed this with `sync_tree_modes` in commit-task.sh only; the commit test covers only `core.fileMode=false`.

Reproduction: `core.fileMode true`, commit `run.sh` at 0644, `git update-index --chmod=+x run.sh`, run `commit.sh "chore: exec" run.sh`: `Nothing to commit.`, exit 0, and `git ls-files -s run.sh` back at 100644. With a content change too, the commit lands at 100644. Under `core.fileMode=false` the mode change commits.

Fix sketch: port (or share) `sync_tree_modes` before `git add -u` in paths mode and `git add -A` in mode `all`; leave a mode change made only in the tree untouched and keep the `core.fileMode=false` path working.

## 8. A transient index.lock drops a task's own file from its commit, yet the task is marked done with exit 0
SEVERITY: 6.0
CONFIDENCE: medium
VERDICT: VERIFIED
LOCATION: viber/scripts/commit-task.sh:L396-L499
CLASS: race-state: staging failure from a concurrent index lock reported as an unknown path, and the commit goes ahead

Severity adopted from the critic (filed 6.0).

Root cause: when the batch `git add -u` fails, `stage_paths` falls back to `stage_path_each`; `stage_path` returns 1 on any `git add` failure and `stage_named` reports the path with `could not stage`, the warning meant for paths git does not know. The task form then marks `done` and commits the rest. A lock failure on a tracked file is a staging failure, which the header contract assigns exit 5 with status.md restored. Coders and reviewers in flight take the index lock briefly with `git status`/`git diff`.

Reproduction: T1 with `Files: src/a.ts, src/c.ts`, both modified, and a `git` shim holding `.git/index.lock` for the first two `git add` calls: `warning: could not stage src/a.ts`, rc=0, commit holds only `src/c.ts` and status.md, `done: T1` recorded, `src/a.ts` left ` M`.

Fix sketch: when `git add` fails on a path git knows (index or HEAD), abort with exit 5 before status.md is written, or retry briefly on `index.lock`; keep the `could not stage` warning for unknown or ignored-untracked paths only.

## 9. A draft round deletes the run's only copy of an attachment whose .temp/ source is gone
SEVERITY: 6.0
CONFIDENCE: medium
VERDICT: VERIFIED
LOCATION: viber/scripts/plan-path.sh:L476-L500
CLASS: race-state: multi-step replace deletes the former copy before the new copy is known to exist

Severity adopted from the critic (filed 6.5).

Root cause: `land_attachments` runs `rm -rf <run>/attachments` before copying, and treats a missing source as a warning. A draft round carries the former `attachments:` map over unchanged, and its values point into gitignored `.temp/`. Once `.temp/` is cleared (or the work moves machines), the next `--into` round deletes the run's copy, which the function's own comment says exists to survive exactly that, and nothing replaces it.

Reproduction: land r1.md with `attachments: login.html: <.temp path>`; `rm -rf .temp`; land r2.md with `into: <key>` and the same map: exit 0, `state: draft`, `warning: attachment not found, not landed`, and `docs/_specs/<key>/attachments` is gone while plan.md still maps `login.html`. An uncommitted draft cannot recover it.

Fix sketch: build the new set in a staging directory; for an entry whose source is missing or fails to copy, carry over the former `attachments/<name>`; swap only after that. Entries the new map drops must still be removed, and a missing source with no former copy still gives one warning.

## 10. Issue-reference stripping eats a path's `/#N.` and widens the selection to its directory
SEVERITY: 6.0
CONFIDENCE: medium
VERDICT: VERIFIED
LOCATION: viber/skills/commit/scripts/commit-args.sh:L91-L119
CLASS: wrong-result: `#N` cut from inside an existing path, boundary characters included, so the selector resolves to the parent directory

Severity adopted from the critic (filed 5.0).

Root cause: `extract_issue_refs` cuts every `hash_re` match out of the raw arguments before any path check, and `strip_issue_refs` removes the whole match including the boundary characters. An existing `bugs/#12.md` becomes `bugs md`, the whole-string path check fails, the list split keeps the existing directory `bugs`, and the whole directory is committed with a bogus `Refs: #12` footer. The header promises an existing path wins over the keyword.

Reproduction: commit `bugs/#12.md` and `bugs/other.md`, change both. `commit-context.sh 'bugs/#12.md'` prints `## Selector: paths - run commit.sh with 2nd arg "bugs"`, and `commit.sh "docs: bug 12" 'bugs/#12.md'` commits both files.

Fix sketch: check the whole raw string (and each token) as an existing path before extracting references; when cutting a reference, remove only `#N` and keep the boundary characters. `src/foo #42` and `(#42,#7)` must keep resolving as their tests expect.

## Further findings (21)
5.0 · viber/scripts/plan-index.sh:L1112-L1125 · contract-mismatch: contract block parser not fence-aware, shape truncated mid-fence · plan-index.sh heading scans are not fence-aware: contract blocks and spec.md are cut at a fenced "## " line (also L1038-L1040, U2-2) · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U2-1.md
5.0 · viber/scripts/plan-path.sh:L373-L394 · contract-mismatch: validator reads the source, lander reads the guidance-stripped copy, and the two map grammars disagree · A whitespace-only line in the attachments map is validated past but ends the map at landing, silently dropping entries · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U3-2.md
5.0 · viber/scripts/archive-run.sh:L284-L296 · past-fix-variant: partial-commit pathspec re-reads mode from the tree, exec bit dropped and left staged · archive-run.sh drops an archived file's exec bit under core.fileMode=false and leaves the mode change staged · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U4-1.md
5.0 · viber/skills/setup/scripts/bootstrap.sh:L177-L201 · contract-mismatch: group header grammar differs between bootstrap merge and config.sh · bootstrap merge treats a group header with a trailing comment as a valued key, so flat switches stay flat and stop counting · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U8-1.md
5.0 · viber/skills/setup/scripts/bootstrap.sh:L177-L196 · contract-mismatch: reopened group children read by config.sh but not by the merge · bootstrap merge overrides a child declared in a second block of the same group · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U8-2.md
5.0 · viber/scripts/pr-facts.sh:L271-L278 · silent-failure: ignored gh exit status turns a failed pr-exists check into ready · pr-facts.sh reports STATUS=ready when `gh pr list` fails, hiding an existing pull request · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U10-2.md
5.0 · viber/skills/code-auditor/scripts/worktree.sh:L91-L96 · contract-mismatch: `git worktree add` exit status, which carries the post-checkout hook's status, read as "no worktree was created" · worktree.sh add reports WORKTREE_FAILED when only the host's post-checkout hook failed · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U14-2.md
5.0 · viber/skills/idea-validator/scripts/build_report.mjs:L217-L224 · wrong-result: incomplete script-context escaping of embedded JSON (only `</` escaped, `<!--` and `<script` left live) · build_report.mjs reports OK while the HTML report renders blank: an unclosed `<!--` in any text swallows the renderer script · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U18-1.md
5.0 · viber/scripts/issue-templates.sh:L131-L216 · contract-mismatch: issue form projects value format passed to a gh flag expecting a project title · Issue form `projects:` (OWNER/NUMBER) is forwarded to `gh issue create --project`, which takes a project title · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U11-1.md
4.0 · viber/scripts/plan-path.sh:L445-L449 · wrong-result: case-sensitive uniqueness check over a case-insensitive file system · Attachment names unique only by case overwrite each other on macOS and Windows, with no warning · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U3-3.md
4.0 · viber/skills/extension/scripts/extension.sh:L101-L141 · contract-mismatch: extension map writer and config.sh reader disagree on an inline-valued `extensions:` key · extension.sh --add reports `added` for an entry config.sh never reads under an inline-valued `extensions:` · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U6-1.md
4.0 · viber/hooks/scripts/shell-guard.sh:L259-L276 · wrong-result: `>&word` redirect tokenized as `>` plus a background `&`, so its file target becomes a command word · shell-guard.sh lets `>&file` write a working-tree file from viber:task-coder (R4 missed) · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U7-3.md
4.0 · viber/agents/closeout.md:L46-L61 · contract-mismatch: comma-joined path list in plan-index.sh `orphan:` and `dirty:` collides with a comma inside a path · closeout splits `orphan:` on commas, so a changed path containing a comma is never committed and outcome.md names paths that do not exist · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U9-3.md
4.0 · viber/skills/rules/scripts/rules-map.sh:L234-L234 · past-fix-variant: git path list read without -z, C-quoted paths compared against raw find output · rules-map.sh reads git ls-files C-quoted: a committed rule reads untracked, a live rule reads dead · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U13-1.md
4.0 · viber/skills/memory/scripts/memory-map.sh:L218-L234 · past-fix-variant: shell value handed to awk via -v (escape processing) instead of ENVIRON · memory-map.sh hands paths to awk via -v: a node under a backslash directory reads orphan · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U13-2.md
4.0 · viber/skills/code-auditor/scripts/diff-overlay.sh:L76-L106 · contract-mismatch: overlay carries working-tree bytes but not staged index modes, so replays reading `git ls-files -s` see HEAD's exec bit · diff-overlay drops staged exec-bit changes, so index-reading replays see HEAD's mode · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U14-1.md
4.0 · viber/scripts/plan-index.sh:L1011-L1022 · wrong-result: DoD clause split ignores backtick spans, a quoted ";" becomes a clause boundary · DoD cut on every ";" splits a backtick-quoted code span into bogus clauses in the task file · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U15-2.md
4.0 · viber/skills/skill-designer/scripts/lint_skill.sh:L38-L44 · wrong-result: CRLF first line compared to a bare `---`, so a valid frontmatter reads as missing · lint_skill.sh FAILs every CRLF SKILL.md as "no YAML frontmatter" and skips all frontmatter checks · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U18-2.md
4.0 · viber/skills/implementor/SKILL.md:L73-L75 · contract-mismatch: plan-index.sh prints `dirty:` for skipped tasks, implementor reads every `dirty:` as an interrupted todo task · Resumed build asks to continue or restart a task that was already skipped · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U9-1.md
4.0 · viber/skills/implementor/parts/close.md:L15-L25 · contract-mismatch: exit 4 of a step 5 repair commit handled by both the generic "commit outside a task" rule and the step 5 no-change rule · A repair commit that changed nothing triggers two contradicting rules: a commit-refusal arbiter plus false "left uncommitted" lines, and the tests arbiter · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U9-2.md
3.0 · viber/skills/setup/scripts/bootstrap.sh:L351-L366 · race-state: non-idempotent side effect on rerun (gitignore entry duplicated) · bootstrap appends .claude/viber.local.yml to .gitignore again on every run when that file is tracked · /Users/dario/Projects/p2p2.claude/.temp/viber/code-auditor/20261018-194700/reports/U8-3.md

## Coverage notes
- Units not investigated: U16, U17
- Hunts with no finding: none
- Hunts with no report: none

# Findings - 20261021-161143 (bugs, repo)
bugs · repo · 22 units mapped · 22 hunts · 39 confirmed findings · 0 units not investigated.

## 1. A signal during link creation lets the forced worktree remove delete the main tree's node_modules on Windows
SEVERITY: 7.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/scripts/red-check.sh:L347-L355
CLASS: race-state: link recorded for cleanup only after it is made, so an interrupt in between leaves a live junction under git worktree remove --force

Severity adopted from the critic (7; filed 7.0).

Root cause: the link loop creates the junction (`cmd /c mklink /J`) and only then runs `links+=("$wt/$rel")`. An INT/TERM/HUP arriving while the link is being made reaches `cleanup()` with `links` still empty, so `git worktree remove --force` runs with a live junction; Git for Windows follows it and deletes the main tree's `node_modules` (or any `red-check.links` directory). The header promises the forced remove never reaches the main tree through a link.

Reproduction: Windows Git Bash fixture shaped like `tests/viber/red-check.test.ts`, gitignored `node_modules/precious.txt` in the main tree, a `cmd` shim that sleeps 4 s after `mklink` to widen the window, `kill -TERM` once "Junction created" is logged. red-check exits 130 and `node_modules` is empty; with `links+=` moved before the `mklink` the file survives.

Fix sketch: append `"$wt/$rel"` to `links` before the link is made, next to the owner-file write; `unlink_dir` on a missing path already succeeds. Keep the `link failed` UNRUNNABLE check.

## 2. A backslashed relative --with or extras path skips the ownership check and commits an open task's file
SEVERITY: 6.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/scripts/commit-task.sh:L270-L297
CLASS: past-fix-variant: path spelling mismatch (relative backslash form) bypasses --with/extras ownership refusal

Severity adopted from the critic (6; filed 6.0).

Root cause: `named_path()` strips `./` and calls `cwd_relative()`, which folds backslashes only for an absolute path and returns a relative one unchanged. `src\b.ts` therefore never matches the plan's `Files: src/b.ts`, is "claimed by no task", and Git for Windows stages the real `src/b.ts`. Variant of d6d08f7b and 8d15b228, which fixed only the absolute spelling.

Reproduction: two-task plan (T1 owns `src/a.ts`, T2 owns `src/b.ts`), T2's work in progress in `src/b.ts`, `T1-extra.md` holding `src\b.ts`; `commit-task.sh plan.md T1` exits 0 with no refusal and the T1 commit lists `src/b.ts`. The forward-slash spelling prints `warning: refused src/b.ts - claimed by task T2`.

Fix sketch: fold `\` to `/` in `named_path` before the `./` strip and `cwd_relative`, and the same in plan-index.sh's extras reader so the reviewer's scope agrees. Limit the fold to Git Bash if literal-backslash names on POSIX matter.

## 3. query ignores an explicit --since when the payload file carries start/end
SEVERITY: 6.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: devtools/skills/signoz/scripts/signoz.mjs:L101-L101
CLASS: contract-mismatch: parseArgs default for --since makes an explicit --since indistinguishable from no flag, so the file's stale range wins

Severity adopted from the critic (6; filed 5.0).

Root cause: `since` carries `default: "1h"` in `TIME` (L210), so `opts.since` is always set, and `prepareQueryPayload` overrides the file's range only on `--start`/`--end` or a missing `p.start` (L101). SKILL.md says `start`/`end` are filled from the flags, and references/logs-query.md prescribes `query FILE --since 1h` while its own template body carries `start`/`end`, so a body copied from the doc silently queries a stale window.

Reproduction: local mock HTTP server recording the POST body; a query file with `start:1790600000000,end:1790603600000`; `run(['query', file, '--since', '2d'])` sends `end-start = 3600000` with `start = 2026-09-28T12:53:20.000Z` instead of a two-day window ending now.

Fix sketch: drop the `since` default for `query` (or detect it with `parseArgs({tokens:true})`) and add `opts.since` to the override condition; `timeRange` already falls back to `1h`. Change the unit test that passes `{ since: "1h" }` to stand in for the default to `{}`.

## 4. A path reverted after review stays in the reviewer's extras file and sweeps another task's change into the task commit
SEVERITY: 6.0
CONFIDENCE: medium
VERDICT: VERIFIED
LOCATION: viber/agents/task-reviewer.md:L22-L22
CLASS: past-fix-variant: reverted extra path kept in the append-only reviewer extras file that commit-task.sh stages as --with

Severity adopted from the critic (6; filed 6.0).

Root cause: 80d8396b made `task-coder` remove reverted paths from its extras file, but `task-reviewer.md` L22 only ever appends to `<id>-extra-review.md`, and `commit-task.sh` (L1342-L1352) stages every line of it. After a reviewer flags an extra edit and the next attempt reverts it, the stale entry remains; a parallel coder that then edits the now-clean file has its half-done change committed with this task, with no `took` or `refused` warning.

Reproduction: T1 round-1 reviewer lists `lib/shared.ts`; T1 attempt 2 reverts it; T2 edits `lib/shared.ts`; `commit-task.sh` for T1 with no `--with` commits `lib/shared.ts` holding `T2 half-done change`. With the reviewer file empty the path stays out.

Fix sketch: give the reviewer the coder's rule (drop listed paths that no longer differ from HEAD), or have `commit-task.sh` skip an extras path with no change since the attempt started or listed by another not-done task. Keep the ownership warnings.

## 5. release.sh never bumps the devtools plugin's version, so devtools users never receive a release
SEVERITY: 6.0
CONFIDENCE: medium
VERDICT: VERIFIED
LOCATION: .github/scripts/release.sh:L26-L56
CLASS: contract-mismatch: marketplace lists two plugins but the release bumps only viber's manifest version

Severity adopted from the critic (6; filed 6.5).

Root cause: `.claude-plugin/marketplace.json` publishes `viber` and `devtools`, and `.claude/rules/plugin-manifests.md` says every `*/.claude-plugin/plugin.json` version is written only by `release.sh`. But `release.sh` bumps a hard-coded `manifests=(viber/.claude-plugin/plugin.json)`, so `devtools/.claude-plugin/plugin.json` stays at `0.1.0`. The plugin cache is keyed by that version (`cache/p2p2/devtools/0.1.0`), so installed devtools likely never updates.

Reproduction: `repro.sh` builds a temp repository with viber 1.2.3, devtools 0.1.0, tag `1.2.3`, a bare origin and a stub `gh`, commits one devtools-only fix and runs `release.sh patch`: it prints `viber=1.2.4 devtools=0.1.0`. With devtools added to `manifests=` it prints `devtools=1.2.4`.

Fix sketch: build `manifests` from the marketplace (`jq -r '.plugins[].source'` plus `/.claude-plugin/plugin.json`), or bump a plugin only when its directory changed since the last tag. The fixture in `tests/github/release.test.ts` must then write every listed manifest.

## 6. An extras line with surrounding whitespace is gated by the reviewer but left out of the task commit, which still exits 0
SEVERITY: 5.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/scripts/commit-task.sh:L1346-L1351
CLASS: contract-mismatch: extras-file line cleaning differs between plan-index.sh --extra and commit-task.sh

Severity adopted from the critic (5; filed 4.5).

Root cause: plan-index.sh (L402-L405) trims leading and trailing whitespace from each extras line; commit-task.sh (L1347-L1349) strips only CR and `./`. For `lib/x.ts ` the reviewer is shown `extra: lib/x.ts`, while the commit asks git for the padded name, prints only `warning: could not stage lib/x.ts `, and records the task done.

Reproduction: one-task plan, tracked `lib/x.ts` modified, `printf 'lib/x.ts \n' > work/T1-extra.md`; `plan-index.sh --extra T1` prints `extra: lib/x.ts`; `commit-task.sh` exits 0, HEAD lacks `lib/x.ts`, status.md reads `done: T1`.

Fix sketch: trim whitespace in commit-task's extras loop (or `named_path`) exactly as plan-index.sh does, before the `./` cut; document in the header and the scripts/CLAUDE.md extras contract that both readers trim.

## 7. Plain index call on a landed plan applies the frozen-plan rules, breaking red-check and closeout on a resumed run
SEVERITY: 5.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/scripts/plan-index.sh:L390-L393
CLASS: contract-mismatch: validate-only rules applied to a landed run plan by its post-landing callers

Severity adopted from the critic (5; filed 5.5).

Root cause: the rules added after plans were frozen (read-after and others) are skipped only under `--split` and `--extra`, as the header says a resumed run must still validate. `red-check.sh` L125 and closeout's Leftovers step (closeout.md L46) call plain mode on the same landed plan, so a run landed on 0.87.x and resumed on 0.88.x is refused there.

Reproduction: run plan where T2's Verification reads `src/login.sh` listed by T1 with no Depends-on (accepted by `c7bf60fe^`): `--split` exit 0, `--extra T2` exit 0, plain exit 4, `red-check.sh <plan> T2` exit 2. Effects: red-check falls to UNRUNNABLE on every TDD task, and closeout commits no leftovers.

Fix sketch: let read-only callers of a landed run get the `--split` validation without decomposing (apply the frozen exemptions when `status.md` sits beside the plan, or add a `--landed` flag for red-check.sh and closeout). The planner's call on a fresh plan keeps every rule.

## 8. The plain-plan file limit counts a "../" path outside the root and misses a bold-wrapped path
SEVERITY: 5.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/hooks/scripts/plan-gate.sh:L229-L275
CLASS: wrong-result: file-limit token normalization disagrees with its documented counting rules

Severity adopted from the critic (5; filed 4.0).

Root cause: the token awk skips an outside-root path only when it is absolute or `~` (L262), so `../sibling-repo/src/a.ts` counts; and `*` is missing from the `lead`/`trail` punctuation sets (L237-L238), so `**src/a.ts**` fails the extension test, is not found on disk and counts zero. hooks/CLAUDE.md says an outside-root path counts nothing and surrounding punctuation is stripped.

Reproduction: plain plan mode with plain-plan-review on and a bound PASS. 8 backticked files plus `../sibling-repo/src/a.ts` is denied ("names 9 repository files"); 9 lines `- **src/fN.ts**: change` are allowed.

Fix sketch: strip `*` as surrounding punctuation and skip any token holding a `..` segment after the relative fold. Keep the root/token length equality and no apostrophe inside the awk block.

## 9. bootstrap.sh restores defaults over the user's switches after an indented non-key line in a group
SEVERITY: 5.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/skills/setup/scripts/bootstrap.sh:L183-L200
CLASS: contract-mismatch: group extent narrower than config.sh, restored default shadows the user's value

Severity adopted from the critic (5; filed 5.5).

Root cause: `merge_config`'s child scan ends a group at the first indented line that is not a key, comment or blank (L196-L197); config.sh keeps the group open until the next column-0 line. Below a list item or wrapped continuation, bootstrap sees every child as missing and inserts template defaults above the user's lines, and config.sh's first-assignment-wins reads the defaults. The report still says "(your own values kept)".

Reproduction: `.claude/viber.yml` with `build:` holding `red-check-tests:` / `    - spec/` / `qa: true` / `red-check: false`; after `bootstrap.sh`, `config.sh` prints `build.qa: false` and `build.red-check: true`. A wrapped `red-check-tests` value flips `final-review`, `qa` and `red-check` the same way.

Fix sketch: end the group only at a column-0 non-comment, non-blank line (config.sh's rule) and advance past indented non-key lines so a restored child never lands between a key and its continuation. Add a bootstrap.test.ts case with a list item inside `build:`.

## 10. shell-guard.sh tokenizer is quadratic and runs past the 10 s hook timeout on a 40-60 KB command
SEVERITY: 5.0
CONFIDENCE: high
VERDICT: VERIFIED
LOCATION: viber/hooks/scripts/shell-guard.sh:L138-L291
CLASS: past-fix-variant: hook exceeding its timeout on long input (per-character ${cmd:i:1} is O(length))

Severity adopted from the critic (5; filed 5.5).

Root cause: the tokenizer reads one byte at a time with `c="${cmd:i:1}"`, and each offset expansion is O(length), so the scan is O(n^2). 1a8dcf15 fixed this class in kill-guard.sh and verdict-nudge.sh with one awk pass; shell-guard.sh kept the bash loop. Past the timeout the hook fails open, so `git stash`, `rm` or a file write from a task-coder goes through unguarded.

Reproduction: task-coder PreToolUse JSON with a `node -e "x=1; ..."` body of about 60 KB followed by `git stash`; `timeout 10 bash viber/hooks/scripts/shell-guard.sh < sg.json` gives status 124 and no deny. Git Bash timings: 20 KB 2.9 s, 40 KB 9.9 s, 60 KB 21.9 s.

Fix sketch: tokenize and classify in a single awk pass fed on stdin (not ENVIRON, given the Linux 128 KB cap), or walk the string by trimming consumed prefixes. Keep the builtins-only early return and every rule shell-guard.test.ts pins.

## Further findings (29)
5.0 · viber/scripts/issue-templates.sh:L136-L207 · wrong-result: line-based issue form parser ignores YAML comment and multi-line flow syntax · issue-templates.sh reads YAML comments and multi-line flow lists as values or drops the list · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U12-2.md
5.0 · viber/skills/commit/scripts/commit-args.sh:L170-L176 · contract-mismatch: root-relative path printed by commit-context.sh re-read cwd-relative by commit.sh · Root-relative Selector path re-resolved cwd-first commits a different set from a subdirectory · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U13-1.md
5.0 · viber/skills/code-auditor/scripts/diff-overlay.sh:L89-L135 · wrong-result: deleted path removed from disk but kept in the checkout index · Overlay leaves staged deletions and renames in the checkout's index, so index-reading replays fail · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U14-1.md
5.0 · viber/skills/rules/scripts/rules-map.sh:L129-L146 · wrong-result: frontmatter paths parser ignores YAML comment and multi-line flow syntax · rules-map reads a YAML comment as part of a glob and drops a multi-line flow sequence · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U15-1.md
5.0 · viber/skills/rules/scripts/rules-map.sh:L135-L145 · wrong-result: quotes stripped before the flow-sequence test, so a quoted bracket glob loses its [ · rules-map reads a quoted scalar glob opening on [ as a flow sequence · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U15-2.md
5.0 · viber/skills/memory/scripts/memory-map.sh:L427 · silent-failure: tracked path handed to wc as an option, wc fails and the empty result reads as no candidates · memory-map loses every candidate when a tracked path starts with a dash · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U15-3.md
5.0 · viber/hooks/scripts/plan-gate.sh:L296-L300 · contract-mismatch: task-marker grammar differs between the plan gate's task count and plan-index.sh's · Plan gate counts task blocks with a narrower marker regex than plan-index.sh, so the planner and the gate pick different reviewers · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U18-1.md
5.0 · viber/skills/pro-designer/scripts/check_contrast.ts:L251-L253 · past-fix-variant: entry-point check compares the unresolved argv path to the realpath module URL, so the CLI silently never runs · check_contrast.ts run through a symlinked or junctioned path prints nothing and exits 0 · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U20-1.md
5.0 · viber/scripts/plan-index.sh:L488-L498 · past-fix-variant: markdown fence closed by a shorter fence than the one that opened it · A three-backtick line closes a four-backtick fence, misreading every heading after it · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U2-2.md
5.0 · viber/scripts/qa-comment.sh:L140-L145 · wrong-result: branch pull request looked up by head branch name only, so a cross-repository (fork) pull request with the same head name is taken as the run's pull request · qa-comment.sh posts the QA document on a fork's pull request that shares the current branch name · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U12-1.md
5.0 · viber/skills/commit/scripts/commit-context.sh:L59-L59 · contract-mismatch: Selector text handed to a double-quoted shell argument expands $ in file names · A "$" in a selected path is expanded by the double-quoted commit.sh call SKILL.md prescribes · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U13-2.md
4.0 · viber/scripts/run-branch.sh:L314-L351 · wrong-result: base branch resolved by bare name, so a same-named tag wins over refs/heads · A tag named like the entry base breaks run-branch creation and skews behind: · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U4-1.md
4.0 · viber/scripts/config.sh:L422-L510 · contract-mismatch: block branching.mode and --branching mode read by different grammars of one script · branching.mode parsed two ways: block and --branching disagree on one file · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U7-1.md
4.0 · viber/hooks/scripts/kill-guard.sh:L56-L77 · past-fix-variant: value into awk through an env var hits the Linux 128 KB per-string cap · kill-guard.sh lets pkill through on Linux once the command passes 128 KB · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U9-3.md
4.0 · viber/hooks/scripts/session-start.sh:L86-L97 · contract-mismatch: schema key grammar narrower than bootstrap.sh and config.sh · session-start reads `schema : 4` as schema 0 and nags for a setup that never clears it · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U10-1.md
4.0 · viber/scripts/pr-create.sh:L81-L96 · silent-failure: push to the local repository "." reported as a published branch · pr-create.sh pushes a branch tracking a local branch to "." and reports it pushed · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U11-1.md
4.0 · viber/scripts/pr-facts.sh:L257-L263 · past-fix-variant: local target ref used instead of the remote one (1d1476b5) via a "." head remote · pr-facts.sh falls back to the local target when the head branch's remote is "." · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U11-2.md
4.0 · viber/skills/commit/scripts/commit-args.sh:L151-L156 · silent-failure: case-insensitive existence check vs case-sensitive git pathspec · A case-differing path counts as existing but commits nothing, reported as "Nothing to commit." · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U13-3.md
4.0 · viber/skills/code-auditor/scripts/diff-overlay.sh:L89-L107 · wrong-result: directory case-only rename lands under the old spelling · Case-only rename of a directory keeps the old spelling in the overlaid checkout · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U14-2.md
4.0 · viber/skills/extension/scripts/extension.sh:L170-L180 · silent-failure: success reported after the config write failed · extension.sh --add prints STATUS=added when the write of viber.yml fails · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U16-1.md
4.0 · viber/scripts/check-playwright.sh:L64-L72 · wrong-result: git-quoted ls-files path never matches the package.json filter · check-playwright.sh misses a tracked nested package.json whose path git quotes · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U16-2.md
4.0 · viber/skills/skill-designer/scripts/lint_skill.sh:L50-L77 · past-fix-variant: carriage return kept in the frontmatter body after the CRLF opener fix · CRLF SKILL.md description counted one char longer per line, false 1024-limit FAIL · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U19-1.md
4.0 · viber/skills/skill-designer/scripts/lint_skill.sh:L66-L71 · wrong-result: YAML block scalar truncated at its first blank line · A blank line inside a folded description ends the description early, so later lines skip every check · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U19-2.md
4.0 · viber/skills/skill-designer/scripts/lint_skill.sh:L56-L62 · wrong-result: YAML plain scalar not trimmed before the name check · Trailing whitespace after the frontmatter name gives a false charset FAIL · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U19-3.md
4.0 · .github/scripts/release.sh:L79-L97 · wrong-result: git log --pretty=format: leaves the last record unterminated, so while read skips it · Release notes drop the oldest commit of every release; a one-commit release reads "No notable changes" · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U22-2.md
4.0 · viber/scripts/archive-run.sh:L108-L110 · wrong-result: trailing-slash normalization strips only one slash, so the run key is empty · A doubled trailing slash archives the run with all its scaffolding and an empty key · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U5-1.md
4.0 · viber/hooks/scripts/shell-guard.sh:L294-L301 · wrong-result: drive-letter absolute path classified as a relative working-tree path · shell-guard.sh refuses a redirect or tee onto a Windows absolute path as a working-tree write · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U9-2.md
3.0 · viber/skills/pro-designer/scripts/check_contrast.ts:L194-L201 · contract-mismatch: malformed --json record exits 1 with a TypeError instead of exit 2 · check_contrast.ts --json crashes with exit 1 (the AA-failure code) on a null record or a non-array file · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U20-2.md
3.0 · viber/hooks/scripts/plan-gate.sh:L189-L193 · contract-mismatch: gate dispatch text versus planner-review's draft input · Plan gate's re-dispatch instruction for a planner draft omits `scope: spec` · C:/Projects/viber/.temp/viber/code-auditor/20261021-161143/reports/U18-2.md

## Coverage notes
- Units not investigated: none
- Hunts with no finding: none
- Hunts with no report: none

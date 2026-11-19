---
source: C:/Projects/viber/docs/_specs/2026-11-19-13-53-38_fixes-of-the-scripted-steps-audit/plan.md
planned: C:/Users/dariu/.claude-p2p2/plans/velvety-rolling-babbage.md
attachments:
  audit-fixes.md: C:/Projects/viber/.temp/audit/audit-fixes.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Fixes of the scripted-steps audit

## Goal

Repair the 16 defects and the 3 code-side design flaws a bugs and design audit of `e2c5d216..HEAD` verified in viber's new directive scripts, plus the 3 further test failures a Windows run of the whole suite showed, and make every push run the whole suite on Windows so this class of defect stops shipping unseen.

## Problem

The scripted-steps runs moved deterministic work into about 13 000 lines of shell. Verified defects followed. On Windows Git Bash several scripts print the plugin root as `/c/...` or from `pwd`, so the scripts' own tests fail there (`frame.test.ts` 22 of 53, `review-round.test.ts` 11 of 40 and others). Paths holding a space break `memory-map.sh --targets` and `rules-map.sh --confirm`. On bash 5.2, `shell-guard.sh` prints a refusal that is not valid JSON. Several prose and script pairs disagree. Push CI runs only on ubuntu, so none of this showed. Users on Windows, and repositories with spaces in their paths, hit these defects today. The full list, each with its reproduction, is `attachments/audit-fixes.md`.

## Current behaviour

- Ten scripts derive the plugin root of the commands and paths they print in five different ways (cut before `/scripts/`, `dirname` four times, `pwd -W`, `pwd` with `cygpath -m`, bare `pwd`). On Windows the result differs by script.
- `shell-guard.sh` derives a "Run instead" command from refused chains, `||`, `cd` and `export` chains included. Its JSON escape of a backslash breaks under bash 5.2.
- `verdict-nudge.sh` recognises a verdict line in markdown form but rejects its value.
- `memory-map.sh --targets`, `rules-map.sh --confirm` and `--brief` cut paths at the first space, or compare scopes spelled differently.
- `frame.sh` accepts an absolute area directory only as `C:/...`. `synthesize.sh` reads `Scope: ./diff` as the diff scope and offers a wave that `keep-units.sh --wave` never dispatches for units with no hunter report. `strip-tag.sh` drops every carriage return.
- `attach-lines.sh` under dash on Windows drops every attachment. `tree-record.sh --check` matches only a repo-relative path. `app-wait.sh` counts only its sleeps. `task-step.sh --with` keeps the space after a comma. A refused close-case arbiter carries out a fallback fixed in `task-step.sh`, whatever `--options` were passed.
- `planner/SKILL.md` says `start --fresh` after the fix of an `override`, which the script and its test answer as a fresh round 1.
- CI runs both tiers on ubuntu at every push and pull request, and on macOS and Windows only on `workflow_dispatch`.

### Must not change

- Every directive line, key and exit code a script prints today, other than the path spelling and the defects named in the acceptance criteria.
- Every preload script exits 0 in every data condition.
- `shell-guard.sh` and `verdict-nudge.sh` fail open, and every refusal keeps its `viber guard:` opening.
- Every script stays POSIX where it is `#!/bin/sh`, runs on Windows Git Bash and macOS, and uses no heredoc.

## Behaviour

### S1 - Plugin root printed in the caller's spelling [CHANGED - was: derived per script, `pwd` in several]

A script that prints a command or a path inside the plugin spells the plugin root from its own invoked path.

Given a viber script invoked as `C:\...\viber\skills\planner\scripts\review-round.sh` or `C:/.../review-round.sh`
When it prints `refs:` or a `RUN:` line
Then the plugin root reads `C:/.../viber`, and invoked as `/c/.../review-round.sh` it reads `/c/.../viber`

### S2 - A refused chain the split would change gets no suggestion [CHANGED - was: every chain split into separate calls]

Given `viber:task-coder` runs `test -f a.txt || echo missing`, `cd packages/api && npm test` or `export NODE_ENV=test && npm test`
When `shell-guard.sh` refuses it under R1
Then the reason ends on the R1 sentence alone, with no "Run instead" suffix

### S3 - The variant wave hunts units whose hunter left no report [CHANGED - was: `NEXT: none`]

Given a code-auditor run where unit U2 was hunted, retried and left `no-report: U2` in the ledger
When the user picks the variant wave and `keep-units.sh <ws> --wave` runs
Then it prints a hunter block for U2

### Edge cases

- A refused command part holding a backslash, on bash 5.2 or 3.2 -> the deny output parses as JSON and the suggested command keeps every backslash.
- The last verdict line written `**VERDICT:** PASS`, `VERDICT:PASS` or `` `VERDICT: PASS` `` -> passes the nudge as `VERDICT: PASS` does.
- A memory node or candidate directory named `My Docs`, a rule file named `my rule.md` -> kept, briefed and confirmed under its full path.
- `rules-map.sh --brief` given `./src/` or `.` -> `scope: src` and `scope: .`, the slugs `--confirm` reads.
- An area directory given as `/c/...`, `C:\...` or `c:/...` under the repository root -> framed root-relative as `C:/...` is today.
- A root-level directory named `diff` audited -> its uninvestigated units counted.
- A file with CRLF lines ending on a leaked closing tag -> only that last line removed, every carriage return before it kept.
- `attach-lines.sh` run by dash on Windows -> the same `Attachment:` lines bash prints.
- `tree-record.sh --check` given the test as `/c/...`, `C:/...`, `C:\...` or relative to a subdirectory -> `NEXT: handoff` as for the repo-relative form.
- Probes timing out against an unanswering host -> `app-wait.sh <url> <seconds>` prints its `ASK:` line once `<seconds>` of wall time have passed, give or take one probe's timeout.
- `--with "a, b"` -> both paths staged, as `--with "a,b"`.
- `ruled --case <case> --options "<first> | ..." --refused` -> carries out `<first>`.

## Glossary

- Plugin root - the directory holding `scripts/`, `skills/` and `agents/` of the installed plugin, spelled as `${CLAUDE_PLUGIN_ROOT}` expands, which the `allowed-tools` prefixes match.

## Acceptance criteria

1. Invoked by a `C:\...` or `C:/...` path, every viber script that prints a plugin path (`frame.sh`, `keep-units.sh`, `hunt-return.sh`, `review-round.sh`, `run-branch.sh` through `plan-path.sh`, `bootstrap.sh`, `commit-context.sh`, `qa-ledger.sh`, `memory-map.sh`, `rules-map.sh`, `pr-facts.sh`, `pr-reply.sh`, `plan-index.sh`, `task-step.sh`) prints it as `C:/...`. Invoked by a `/c/...` path it prints `/c/...`. Each derives it through one shared helper.
2. A refused command holding a backslash gets deny output that parses as JSON under bash 5.2, with every backslash of the suggested command kept.
3. An R1 refusal of a chain holding `||`, or whose part before the last opens with `cd`, `pushd`, `export`, `source`, `.` or a `NAME=value` word, carries no "Run instead" suffix.
4. `verdict-nudge.sh` applies one pattern to recognise a verdict line and to read its value, so `**VERDICT:** PASS`, `VERDICT:PASS` and `` `VERDICT: PASS` `` pass as `VERDICT: PASS` does.
5. `memory-map.sh --targets` prints, keeps and briefs a node or candidate whose path holds a space under its full path.
6. `rules-map.sh --confirm` prints the `rule:` and `misplaced:` lines of a kept rule whose path holds a space.
7. `rules-map.sh --brief` prints `scope:` with a leading `./` and a trailing `/` removed, so the auditor's slug equals the one `--confirm` reads.
8. `frame.sh` frames an existing area directory given as `/c/...`, `C:\...` or `c:/...` under the repository root.
9. `synthesize.sh` treats only `Scope: diff` as the diff scope.
10. `keep-units.sh --wave` dispatches a hunter for each unit whose hunt left a `no-report:` line.
11. `strip-tag.sh` keeps every carriage return of the lines before the removed closing tag.
12. `attach-lines.sh` prints the same `Attachment:` lines under dash on Windows as under bash.
13. `planner/SKILL.md` tells the planner to run plain `start` after the fix of an `override`, and the archived spec of run `2026-11-19-08-51-17` no longer contradicts it.
14. `tree-record.sh --check` accepts the reproduction test as an absolute (`/c/`, `C:/`, `C:\`) or cwd-relative path.
15. `app-wait.sh` bounds its wait by wall time.
16. `task-step.sh` trims the blanks around each comma-separated path of `--with`, `--defer` and `--resume`.
17. `task-step.sh ruled ... --refused` carries out the first option of the `--options` it is given, falling back to the case's fixed option only when none is given.
18. The run header parser of the code-auditor scripts lives in one file that `map-signals.sh`, `keep-units.sh` and `hunt-return.sh` source.
19. CI runs both test tiers on `ubuntu-latest` and `windows-latest` at every push and pull request, with macOS still on `workflow_dispatch` only.
20. `verdict-nudge.sh` invoked by a path with `\` separators finds the agent file beside it, as with `/` separators.
21. `pr-reply.sh --all` checks for `gh` before the repository, as `--list` does.
22. `tests/viber/skill-part.test.ts` expects the plugin root in the spelling `skill-part.sh` derives from the skill directory it is given, so it passes on Windows.
23. `synthesize.sh` takes the same run id from a workspace path written with `\` separators as with `/` separators.

## Scope

### File map

- add - viber/scripts/plugin-root.sh - the plugin root of an invoked script path (C1)
- add - tests/viber/plugin-root.test.ts - proves C1
- modify - viber/skills/code-auditor/scripts/frame.sh - plugin root through C1; absolute area forms
- modify - viber/skills/code-auditor/scripts/keep-units.sh - plugin root through C1; wave over no-report units; header through C2
- modify - viber/skills/code-auditor/scripts/hunt-return.sh - plugin root through C1; header through C2
- modify - viber/skills/code-auditor/scripts/map-signals.sh - header through C2
- add - viber/skills/code-auditor/scripts/run-header.sh - the run.md header reader (C2)
- modify - viber/skills/code-auditor/scripts/synthesize.sh - diff scope test; run id of a backslash workspace path; re-hunted units counted (C3)
- modify - viber/skills/code-auditor/scripts/strip-tag.sh - CR-preserving last-line removal
- modify - viber/skills/planner/scripts/review-round.sh - `refs:` through C1
- modify - viber/scripts/run-branch.sh - the plugin root of its printed commands through C1
- modify - viber/skills/setup/scripts/bootstrap.sh - printed commands through C1
- modify - viber/skills/commit/scripts/commit-context.sh - plugin root through C1
- modify - viber/skills/e2e/scripts/qa-ledger.sh - plugin root through C1
- modify - viber/skills/memory/scripts/memory-map.sh - plugin root through C1; paths with spaces
- modify - viber/skills/rules/scripts/rules-map.sh - plugin root through C1; kept paths with spaces; brief scope normalised
- modify - viber/agents/rules-auditor.md - `scope: .` named as the repository root
- modify - viber/agents/hunter.md - `R-U<n>` among the hunt ids (C3)
- modify - viber/scripts/plan-index.sh, viber/scripts/task-step.sh, viber/scripts/pr-facts.sh, viber/scripts/pr-reply.sh - plugin root through C1
- modify - viber/scripts/task-step.sh - `--with`/`--defer`/`--resume` trimming; refused fallback from `--options`
- modify - viber/hooks/scripts/shell-guard.sh - JSON escape; chain suggestion limits; header rationale
- modify - viber/hooks/scripts/verdict-nudge.sh - one verdict pattern; agent file under a backslash path
- modify - viber/scripts/attach-lines.sh - directory form under dash
- modify - viber/skills/fixer/scripts/tree-record.sh - `--check` path normalisation
- modify - viber/skills/e2e/scripts/app-wait.sh - wall-time bound
- modify - viber/skills/planner/SKILL.md - plain `start` after an override's fix
- modify - tests/viber/plan-review-prose.unit.test.ts - pins the override exception
- modify - docs/specs/2026-11-19-08-51-17_scripted-plan-validation-and-review-rounds/spec.md - the contradicting sentence
- modify - .github/workflows/ci.yml - Windows on every push
- modify - tests/viber/skill-part.test.ts - the expected root spelling on Windows
- modify - tests/viber/frame.test.ts, keep-units.test.ts, hunt-return.test.ts, synthesize.test.ts, strip-tag.test.ts, review-round.test.ts, plan-path.test.ts, bootstrap.test.ts, commit-context.test.ts, qa-ledger.test.ts, memory-map.test.ts, rules-map.test.ts, pr-facts.test.ts, pr-reply.test.ts, plan-index.test.ts, task-step.test.ts, shell-guard.test.ts, verdict-nudge.test.ts, attach-lines.test.ts, tree-record.test.ts, app-wait.test.ts - the cases proving each criterion

### Out of scope

- The `CLAUDE.md` nodes (`build.memory` is on, so no task edits one). The build's memory close updates them:
  - `viber/scripts/CLAUDE.md`: the plugin-root contract sentence names `plugin-root.sh` (C1); the "`NEXT:`, `RUN:`, `ASK:` and `STOP:` lines belong to the bash scripts" sentence names `arg-kind.sh` (`#!/bin/sh`) too.
  - `viber/references/CLAUDE.md`: a Change together entry pairing `node-doctrine.md`'s `## Template` with the heading list of `memory-map.sh`; line 17's SHAPE remark (the auditor now copies `shape:` lines and judges only the title).
  - `viber/skills/CLAUDE.code-auditor.md`: `run-header.sh` (C2) and `synthesize.sh`'s own header parse as a Change together pair.
  - `viber/hooks/CLAUDE.md:26`: the chains that get no "Run instead" (T9) and the verdict pattern (T10).
  - `tests/CLAUDE.md:39`: CI runs ubuntu and Windows on every push (T25).
- Line anchors in `.claude/rules/` files (`shell-loop-substitution.md`, `shell-awk-quoting.md`, `shell-path-strip.md`, `shell-empty-array-expansion.md`, `viber/literal-pathspecs.md`) may shift by the source lines this plan adds; the build's rules close checks them.
- `synthesize.sh`'s own awk parse of the run header: it is awk inside a larger awk program, so C2 does not replace it.
- `skill-part.sh` and `switch-text.sh` keep deriving the plugin root from the skill directory argument they are given, never from their own invoked path (AC22 relies on it).
- `factory.sh`, `handoff-path.sh`, `summary-path.sh`, `app-wait.sh` and `worktree.sh` path handling: each resolves a working directory or a repository root, never the plugin root of a printed command.
- New features, `docs/archive/superdev/`, macOS support of `factory`.

## Solution requirements

- Windows Git Bash and macOS (bash 3.2) for every script; `#!/bin/sh` scripts stay POSIX; no heredoc.
- Preloads (`bootstrap.sh`, `memory-map.sh`, `rules-map.sh`, `commit-context.sh`) exit 0 in every data condition.
- The code-auditor still needs only git and a POSIX shell.

## Tasks

<!-- TASK -->
### T1 - Add the shared plugin root helper
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: none
- Files: viber/scripts/plugin-root.sh, tests/viber/plugin-root.test.ts
- Delivers: the sourced POSIX library of C1, opening on a `#!/bin/sh` line and a header ending in a `Contract:` block, and its test, which sources it from a throwaway script under each invoked spelling.
- Verification: node --test tests/viber/plugin-root.test.ts tests/portability.unit.test.ts -> every case passes
- DoD: `plugin_root_of 'C:\p\viber\scripts\x.sh' 1` prints `C:/p/viber` and `plugin_root_of 'C:/p/viber/skills/code-auditor/scripts/x.sh' 3` prints `C:/p/viber`; `plugin_root_of '/c/p/viber/scripts/x.sh' 1` prints `/c/p/viber`, `plugin_root_of '/home/u/skills/viber/scripts/x.sh' 1` prints `/home/u/skills/viber` and `plugin_root_of '/home/u/scripts/viber/skills/rules/scripts/x.sh' 3` prints `/home/u/scripts/viber`; `plugin_root_of 'skills/memory/scripts/x.sh' 3` prints `.`, `plugin_root_of 'x.sh' 1` prints `./..` and `plugin_root_of 'x.sh' 3` prints `./../../..`; the library sources under `sh`, `dash` where present, and bash with `set -u`, leaving the caller's options as they were
<!-- /TASK -->

<!-- TASK -->
### T2 - Print the code-auditor paths from the invoked path
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: T1
- Files: viber/skills/code-auditor/scripts/frame.sh, viber/skills/code-auditor/scripts/keep-units.sh, viber/skills/code-auditor/scripts/hunt-return.sh, tests/viber/frame.test.ts, tests/viber/keep-units.test.ts, tests/viber/hunt-return.test.ts
- Delivers: the three scripts take the skill directory and plugin root from C1, so every printed and run.md path (`RUN:`, `Lens file:`, `Schema:`, `Test rules:`, `Worktree script:`, `Overlay script:`) is spelled from the invoked path.
- Verification: node --test tests/viber/frame.test.ts tests/viber/keep-units.test.ts tests/viber/hunt-return.test.ts -> every case passes
- DoD: `frame.sh` invoked by a `C:\` path prints its `RUN:` line and writes run.md with `C:/` skill paths; invoked by a `/c/` path it prints `/c/` skill paths; `keep-units.sh` and `hunt-return.sh` print their `Worktree script:`, `Overlay script:` and `Test rules:` lines in the invoked spelling
<!-- /TASK -->

<!-- TASK -->
### T3 - Print refs from the invoked path in review rounds
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: T1
- Files: viber/skills/planner/scripts/review-round.sh, tests/viber/review-round.test.ts
- Delivers: `review-round.sh` spells `refs:` and every printed plugin path through C1.
- Verification: node --test tests/viber/review-round.test.ts -> every case passes
- DoD: invoked by a `C:\` path, every `NEXT: review` block's `refs:` reads `refs: C:/<plugin root>/references`; invoked by a `/c/` path it reads `refs: /c/<plugin root>/references`
<!-- /TASK -->

<!-- TASK -->
### T4 - Print the branch and setup commands from the invoked path
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: T1
- Files: viber/scripts/run-branch.sh, viber/skills/setup/scripts/bootstrap.sh, tests/viber/plan-path.test.ts, tests/viber/bootstrap.test.ts
- Delivers: `decide_root` of `run-branch.sh` and the `RUN:` lines of `bootstrap.sh` take the plugin root from C1, never from `pwd`.
- Verification: node --test tests/viber/plan-path.test.ts tests/viber/bootstrap.test.ts -> every case passes
- DoD: `plan-path.sh --start` invoked by a `/c/` path prints every `run:` command under `/c/.../scripts/plan-path.sh`, and by a `C:\` path under `C:/.../scripts/plan-path.sh`; `bootstrap.sh` invoked by a `/c/` path prints its `merge-settings.sh` and `open-page.sh` `RUN:` lines under `/c/...`, and by a `C:\` path under `C:/...`
<!-- /TASK -->

<!-- TASK -->
### T5 - Print the commit and e2e paths from the invoked path
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: T1
- Files: viber/skills/commit/scripts/commit-context.sh, viber/skills/e2e/scripts/qa-ledger.sh, tests/viber/commit-context.test.ts, tests/viber/qa-ledger.test.ts
- Delivers: both scripts take the plugin root of their printed lines from C1.
- Verification: node --test tests/viber/commit-context.test.ts tests/viber/qa-ledger.test.ts -> every case passes
- DoD: `commit-context.sh` invoked by a `C:\` path prints its `RUN:` line under `C:/...`, and by a `/c/` path under `/c/...`; `qa-ledger.sh` invoked by a `C:\` path prints its plugin paths under `C:/...`, and by a `/c/` path under `/c/...`
<!-- /TASK -->

<!-- TASK -->
### T6 - Print the memory and rules refs from the invoked path
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: T1
- Files: viber/skills/memory/scripts/memory-map.sh, viber/skills/rules/scripts/rules-map.sh, tests/viber/memory-map.test.ts, tests/viber/rules-map.test.ts
- Delivers: `memory-map.sh` (`--reconcile`, `--targets`) and `rules-map.sh` (`--brief`, `--confirm`) take the plugin root of their dispatch blocks from C1, never from `pwd`.
- Verification: node --test tests/viber/memory-map.test.ts tests/viber/rules-map.test.ts -> every case passes
- DoD: `memory-map.sh --targets review --id X --keep <node>` invoked by a `C:\` path prints its plugin paths under `C:/...`, and by a `/c/` path under `/c/...`; `memory-map.sh --reconcile` invoked the same two ways prints its plugin paths in the same two spellings; `rules-map.sh --brief` invoked the same two ways prints its plugin paths in the same two spellings; `rules-map.sh --confirm` invoked the same two ways prints its writer block's plugin paths in the same two spellings
<!-- /TASK -->

<!-- TASK -->
### T7 - Move the remaining run and GitHub scripts onto the helper
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: T2, T3, T4, T5, T6
- Files: viber/scripts/plan-index.sh, viber/scripts/task-step.sh, viber/scripts/pr-facts.sh, viber/scripts/pr-reply.sh, tests/viber/pr-facts.test.ts, tests/viber/pr-reply.test.ts, tests/viber/plan-index.test.ts, tests/viber/task-step.test.ts
- Delivers: the four scripts derive their printed plugin root through C1, so none of the fourteen scripts of AC1 derives it any other way; the test helpers that copy these scripts into a throwaway plugin copy `plugin-root.sh` beside them.
- Verification: node --test tests/viber/pr-facts.test.ts tests/viber/pr-reply.test.ts tests/viber/plan-index.test.ts tests/viber/task-step.test.ts -> every case passes; git grep -L "plugin-root.sh" -- viber/skills/code-auditor/scripts/frame.sh viber/skills/code-auditor/scripts/keep-units.sh viber/skills/code-auditor/scripts/hunt-return.sh viber/skills/planner/scripts/review-round.sh viber/scripts/run-branch.sh viber/skills/setup/scripts/bootstrap.sh viber/skills/commit/scripts/commit-context.sh viber/skills/e2e/scripts/qa-ledger.sh viber/skills/memory/scripts/memory-map.sh viber/skills/rules/scripts/rules-map.sh viber/scripts/plan-index.sh viber/scripts/task-step.sh viber/scripts/pr-facts.sh viber/scripts/pr-reply.sh -> no file listed; git grep -n -E "plugin_root=.*(pwd|dirname)" -- . ":(exclude)docs/_specs" ":(exclude)docs/specs" ":(exclude)*CLAUDE*.md" -> no match
- DoD: `pr-facts.sh` invoked by a `C:\` path prints `RERUN=` under `C:/...`, and by a `/c/` path under `/c/...`; `pr-reply.sh --list` invoked by a `C:\` path prints `RUN=` under `C:/...`, and by a `/c/` path under `/c/...`; `plan-index.sh --dispatch` invoked by a `C:\`, a `C:/` and a `/c/` path prints `refs:` under `C:/...`, `C:/...` and `/c/...`; `task-step.sh` invoked the same three ways prints its `RUN:` commands under the same three spellings
<!-- /TASK -->

<!-- TASK -->
### T8 - Keep backslashes in the guard's suggested command
- TDD: required
- Covers: AC2
- Uses: none
- Depends-on: none
- Files: viber/hooks/scripts/shell-guard.sh, tests/viber/shell-guard.test.ts
- Delivers: the JSON escape of `chain_suffix` and `redirect_suffix` doubles each backslash literally on every bash version.
- Verification: node --test tests/viber/shell-guard.test.ts -> every case passes
- DoD: `grep -n "a\.b" src/x.ts && ls` from `viber:task-coder` gives output that parses as JSON whose reason holds `` `grep -n "a\.b" src/x.ts` ``; `echo a\ b && ls` keeps `a\ b`; `grep -rn "foo\|bar" src > hits.txt` gives a parseable R4 reason ending on the `.temp/hits.txt` form with `\|` kept; each case holds with `patsub_replacement` on under bash 5.2
<!-- /TASK -->

<!-- TASK -->
### T9 - Suggest no split of a chain the split would change
- TDD: required
- Covers: AC3
- Uses: none
- Depends-on: T8
- Files: viber/hooks/scripts/shell-guard.sh, tests/viber/shell-guard.test.ts
- Delivers: an R1 refusal carries no "Run instead" suffix for a chain holding `||` or in which any part before the last opens with `cd`, `pushd`, `export`, `source`, `.` or a `NAME=value` word; the header's R1 rationale and its `Contract:` stdout list of the no-suffix conditions name these chains.
- Verification: node --test tests/viber/shell-guard.test.ts -> every case passes; grep -n "pushd" viber/hooks/scripts/shell-guard.sh -> a line in the `Contract:` block and a line in the code
- DoD: `test -f a.txt || echo missing`, `a && b || c; d`, `cd packages/api && npm test`, `cd x && make && make test`, `make && cd x && make test`, `pushd x && ls`, `export NODE_ENV=test && npm test`, `source env.sh && make`, `. env.sh && make` and `FOO=1 && make` are refused with the R1 reason alone; `git status && git diff`, `a; b`, `make build && make test` and `npm test && cd x` keep their "Run instead" suffix
<!-- /TASK -->

<!-- TASK -->
### T10 - Read the verdict value with the line's own pattern
- TDD: required
- Covers: AC4
- Uses: none
- Depends-on: none
- Files: viber/hooks/scripts/verdict-nudge.sh, tests/viber/verdict-nudge.test.ts
- Delivers: one pattern finds the verdict line and reads its value, skipping blanks, `` ` ``, `*` and `-` before the label and blanks, `` ` `` and `*` between the colon and the value; the header's `Contract:` describes the value that way.
- Verification: node --test tests/viber/verdict-nudge.test.ts -> every case passes
- DoD: an agent whose file names `VERDICT: PASS` passes when its last verdict line is `**VERDICT:** PASS`, `VERDICT:PASS`, `` `VERDICT: PASS` `` or `**VERDICT: PASS**`; `**VERDICT:** MAYBE` is blocked with the reason listing the file's values; a message with no verdict line is blocked as today
<!-- /TASK -->

<!-- TASK -->
### T11 - Keep memory paths holding a space whole
- TDD: required
- Covers: AC5
- Uses: none
- Depends-on: T6
- Files: viber/skills/memory/scripts/memory-map.sh, tests/viber/memory-map.test.ts
- Delivers: `--targets` reads node and candidate paths whole, never cut at a space, in its target lines, its `--keep` check and its brief blocks.
- Verification: node --test tests/viber/memory-map.test.ts -> every case passes
- DoD: a candidate directory `My Docs` holding three files prints `target: create My Docs/CLAUDE.md ...` under `--targets extend`; `--targets extend --id X --keep "My Docs/CLAUDE.md"` exits 0 with a writer block naming `My Docs/CLAUDE.md`; with `My Docs/CLAUDE.md` committed, `--targets review --id X --keep "My Docs/CLAUDE.md"` exits 0 with an auditor block whose `target:` and `scope:` name the full path; `--keep "My"` exits 2
<!-- /TASK -->

<!-- TASK -->
### T12 - Confirm a kept rule whose path holds a space
- TDD: required
- Covers: AC6
- Uses: none
- Depends-on: T6
- Files: viber/skills/rules/scripts/rules-map.sh, tests/viber/rules-map.test.ts
- Delivers: `--confirm` matches each map line against each kept path as a whole-path prefix, never a line cut at its first space.
- Verification: node --test tests/viber/rules-map.test.ts -> every case passes
- DoD: with tracked `.claude/rules/my rule.md` (`paths: src/**`) and a `STALE:` finding in its audit file, `--confirm <id> ".claude/rules/my rule.md"` prints its `confirm: ... misplaced src` line and its writer `map:` block holds the `rule: .claude/rules/my rule.md ...` line; a kept rule named `my.md` does not pick up the lines of `my rule.md`
<!-- /TASK -->

<!-- TASK -->
### T13 - Brief the rules auditor with the scope the confirm reads
- TDD: required
- Covers: AC7
- Uses: none
- Depends-on: T12
- Files: viber/skills/rules/scripts/rules-map.sh, viber/agents/rules-auditor.md, tests/viber/rules-map.test.ts
- Delivers: `--brief` prints `scope:` with one leading `./` and the trailing `/` removed, an empty result printed as `.`, and its header documents `scope: .` as the repository root; `rules-auditor.md`'s Input names `scope: .` as the repository root, within its word cap.
- Verification: node --test tests/viber/rules-map.test.ts tests/viber/memory-rules-words.unit.test.ts -> every case passes; grep -n "scope: \." viber/agents/rules-auditor.md viber/skills/rules/scripts/rules-map.sh -> a line in the agent's Input and a line in the script's header
- DoD: `--brief <id> "./src/"` prints `scope: src`; `--brief <id> "."` and `--brief <id> "./"` print `scope: .`; a `MISS:` finding written to `new--src-audit.md` after a `./src/` brief counts `miss 1` in `--confirm <id> "./src/"`
<!-- /TASK -->

<!-- TASK -->
### T14 - Frame an area given in any Windows absolute form
- TDD: required
- Covers: AC8
- Uses: none
- Depends-on: T2
- Files: viber/skills/code-auditor/scripts/frame.sh, tests/viber/frame.test.ts
- Delivers: an absolute area token is read with `\` as `/`, a `/c/` form and the drive letter's case folded to the root's own form before the under-root check.
- Verification: node --test tests/viber/frame.test.ts -> every case passes
- DoD: on Windows, a `src` directory given as `<root in /c/ form>/src`, `<root in C:\ form>\src` or `<root with a lower-case drive>/src` frames with `Scope: src`; a directory outside the root keeps today's `area directory not found` stop; a POSIX absolute path under the root still frames on every OS
<!-- /TASK -->

<!-- TASK -->
### T15 - Count a directory named diff as a directory scope
- TDD: required
- Covers: AC9
- Uses: none
- Depends-on: none
- Files: viber/skills/code-auditor/scripts/synthesize.sh, tests/viber/synthesize.test.ts
- Delivers: `synthesize.sh` treats `Scope: diff` alone as the diff scope.
- Verification: node --test tests/viber/synthesize.test.ts -> every case passes
- DoD: a workspace with `Scope: ./diff`, units U1 and U2 and only U1 hunted prints `not investigated 1` and lists U2 under `Units not investigated`; `Scope: diff` keeps today's diff-scope counts
<!-- /TASK -->

<!-- TASK -->
### T16 - Hunt the no-report units in the variant wave
- TDD: required
- Covers: AC10
- Uses: C3
- Depends-on: T2, T15
- Files: viber/skills/code-auditor/scripts/keep-units.sh, viber/skills/code-auditor/scripts/hunt-return.sh, viber/skills/code-auditor/scripts/synthesize.sh, viber/agents/hunter.md, tests/viber/keep-units.test.ts, tests/viber/hunt-return.test.ts, tests/viber/synthesize.test.ts
- Delivers: `--wave` gives each unit whose wave 1 hunt left a `no-report:` line a wave 2 hunt under the C3 re-hunt id, those hunts printed ahead of the never-hunted units and counted against the wave's budget; `hunt-return.sh` handles that hunt as any wave 2 hunt, with its own retry; `synthesize.sh` counts the unit investigated once the re-hunt left a report and ranks an `R-U<n>` finding right after the `U<n>` findings of the same unit, its header ranking comment saying so; `hunter.md` lists `R-U<n>` among the hunt ids as a unit re-hunt, within its word caps. The cases where `hunt-return.sh` already behaves so are characterization cases.
- Verification: node --test tests/viber/keep-units.test.ts tests/viber/hunt-return.test.ts tests/viber/synthesize.test.ts tests/viber/code-auditor-words.unit.test.ts tests/viber/rule-budget.unit.test.ts -> every case passes; grep -n "R-U" viber/agents/hunter.md viber/skills/code-auditor/scripts/keep-units.sh -> a line in each
- DoD: a ledger holding `hunt: U2 | wave: 1 | unit: U2 ...`, `retried: U2` and `no-report: U2` makes `keep-units.sh <ws> --wave` print a hunter block with `id: R-U2`, ahead of any never-hunted unit's block, and append `hunt: R-U2 | wave: 2 | unit: U2 ...`; with more no-report and never-hunted units than the directory budget of 8, `--wave` prints 8 blocks, the `R-U` ones first; a unit whose hunt left a report gets no such block, and with none left `--wave` still prints `NEXT: none`; `hunt-return.sh <ws> hunter R-U2` with a claim prints a critic block ending on `Variant: yes`, and with no report it prints the retry block for `R-U2` once, then `NEXT: none`; after `R-U2` left a report, `synthesize.sh` no longer lists U2 under `Units not investigated` and ranks its finding right after the `U2` findings
<!-- /TASK -->

<!-- TASK -->
### T17 - Keep carriage returns when stripping a closing tag
- TDD: required
- Covers: AC11
- Uses: none
- Depends-on: none
- Files: viber/skills/code-auditor/scripts/strip-tag.sh, tests/viber/strip-tag.test.ts
- Delivers: the trailing closing-tag line is removed with every byte before it unchanged on every OS, a file with no final newline included.
- Verification: node --test tests/viber/strip-tag.test.ts -> every case passes
- DoD: `a\r\nb\r\n</content>\r\n` becomes `a\r\nb\r\n`; `a\nb\n</content>` (no final newline) becomes `a\nb\n`; a file not ending on the tag stays byte-identical
<!-- /TASK -->

<!-- TASK -->
### T18 - Print attachments under dash on Windows
- TDD: required
- Covers: AC12
- Uses: none
- Depends-on: none
- Files: viber/scripts/attach-lines.sh, tests/viber/attach-lines.test.ts
- Delivers: the absolute directory the script compares with git's root is spelled as git spells it under every shell, dash on Windows included.
- Verification: node --test tests/viber/attach-lines.test.ts -> every case passes
- DoD: run by dash on Windows with an existing `.temp/viber/n.md`, the relative and absolute arguments each print `Attachment: C:/.../.temp/viber/n.md`; run by bash the output is unchanged; on macOS and Linux the output is unchanged
<!-- /TASK -->

<!-- TASK -->
### T19 - Re-review after an override's fix as round 2
- TDD: none
- Covers: AC13
- Uses: none
- Depends-on: none
- Files: viber/skills/planner/SKILL.md, docs/specs/2026-11-19-08-51-17_scripted-plan-validation-and-review-rounds/spec.md, tests/viber/plan-review-prose.unit.test.ts
- Delivers: the `--fresh` sentences of `planner/SKILL.md` except the plan write after an `override`'s `NEXT: fix`, which runs plain `start`; the spec's "fresh round 1" sentence names the same exception; the prose test pins the exception in place of today's "after any plan write" phrase; `planner/SKILL.md` stays within its word and byte caps.
- Verification: grep -n "override" viber/skills/planner/SKILL.md docs/specs/2026-11-19-08-51-17_scripted-plan-validation-and-review-rounds/spec.md -> the SKILL.md `--fresh` lines name the override exception and the spec line names it; node --test tests/viber/plan-review-prose.unit.test.ts tests/viber/skill-words.unit.test.ts tests/viber/planner-words.unit.test.ts tests/viber/rule-budget.unit.test.ts -> every case passes
- DoD: `planner/SKILL.md` names plain `start` for the plan write after an `override`'s `NEXT: fix` and `--fresh` for every other plan write after `NEXT: exit-plan`; the archived spec's sentence agrees with it
<!-- /TASK -->

<!-- TASK -->
### T20 - Accept any form of the reproduction test path
- TDD: required
- Covers: AC14
- Uses: none
- Depends-on: none
- Files: viber/skills/fixer/scripts/tree-record.sh, tests/viber/tree-record.test.ts
- Delivers: `--check` turns the given path into the repo-relative form before comparing: an absolute path in `/c/`, `C:/` or `C:\` form under the root loses the root, and a relative path gains the cwd's prefix inside the repository.
- Verification: node --test tests/viber/tree-record.test.ts -> every case passes
- DoD: after `--save` and a new `tests/repro.test.ts`, `--check` given that file as `<root>/tests/repro.test.ts` (in the `/c/`, `C:/` and `C:\` forms on Windows, the POSIX form elsewhere), as `repro.test.ts` from `tests/`, as `tests/repro.test.ts` and as `./tests/repro.test.ts` prints `NEXT: handoff`; on Windows a drive letter in the other case (`c:/` against `C:/`) is matched the same; an absolute path outside the root is compared as given, so the test file still counts as changed; a second changed file still prints the `STOP:` line naming it
<!-- /TASK -->

<!-- TASK -->
### T21 - Bound the application wait by wall time
- TDD: required
- Covers: AC15
- Uses: none
- Depends-on: none
- Files: viber/skills/e2e/scripts/app-wait.sh, tests/viber/app-wait.test.ts
- Delivers: the wait ends once `<seconds>` of wall time have passed since the script began, probe time included, the last sleep capped at the time left.
- Verification: node --test tests/viber/app-wait.test.ts -> every case passes
- DoD: with a stub `curl` on PATH that sleeps 2 s and prints `000`, `app-wait.sh <url> 6` prints its `ASK:` line in under 12 s of wall time; a stub answering `200` at once prints `NEXT: test | code: 200`; `<seconds>` 0 keeps today's `NEXT: launch` line
<!-- /TASK -->

<!-- TASK -->
### T22 - Trim the blanks of comma-separated task paths
- TDD: required
- Covers: AC16
- Uses: none
- Depends-on: T7
- Files: viber/scripts/task-step.sh, tests/viber/task-step.test.ts
- Delivers: each comma-separated path of `--with`, `--defer` and `--resume` is taken with the blanks around it trimmed, an empty entry dropped, in every line the script prints from them.
- Verification: node --test tests/viber/task-step.test.ts -> every case passes
- DoD: a coder `PASS --with "src/extra1.ts, src/extra2.ts"` followed by a reviewer `PASS` prints a commit `RUN:` line carrying `--with "src/extra1.ts" "src/extra2.ts"`; `--with "a,b"` prints the same two paths; `--with "a, , b"` prints `a` and `b` only; a `--defer "a, b"` return prints the same `--defer` paths as `--defer "a,b"`; `start --resume "a, b"` prints the same `resume:` line as `start --resume "a,b"`
<!-- /TASK -->

<!-- TASK -->
### T23 - Fall back to the first passed option under a refused arbiter
- TDD: required
- Covers: AC17
- Uses: none
- Depends-on: T22
- Files: viber/scripts/task-step.sh, tests/viber/task-step.test.ts
- Delivers: under `--refused` the carried-out option is the first of `--options`, `case_first` used only when no `--options` came; the header line naming the fallback says so.
- Verification: node --test tests/viber/task-step.test.ts -> every case passes
- DoD: `baseline 100 ruled --case baseline --options "halt | continue" --refused` prints `carry-out: halt` and a `--rule` call recording `halt`; the same call without `--options` prints `carry-out: continue`
<!-- /TASK -->

<!-- TASK -->
### T24 - Share the run header reader of the code auditor
- TDD: none
- Covers: AC18
- Uses: C2
- Depends-on: T16
- Files: viber/skills/code-auditor/scripts/run-header.sh, viber/skills/code-auditor/scripts/map-signals.sh, viber/skills/code-auditor/scripts/keep-units.sh, viber/skills/code-auditor/scripts/hunt-return.sh
- Delivers: the run header reader of C2 in its own sourced file, and the three scripts sourcing it in place of their copies, every output unchanged.
- Verification: node --test tests/viber/map-signals.test.ts tests/viber/keep-units.test.ts tests/viber/hunt-return.test.ts -> every case passes; grep -n -E "^header_value\(\)" viber/skills/code-auditor/scripts/run-header.sh viber/skills/code-auditor/scripts/map-signals.sh viber/skills/code-auditor/scripts/keep-units.sh viber/skills/code-auditor/scripts/hunt-return.sh -> one match, in run-header.sh
- DoD: `run-header.sh` declares `header_value` as C2 gives it; `map-signals.sh`, `keep-units.sh` and `hunt-return.sh` source it and declare no `header_value` of their own
<!-- /TASK -->

<!-- TASK -->
### T25 - Run the whole suite on Windows at every push
- TDD: none
- Covers: AC19
- Uses: none
- Depends-on: none
- Files: .github/workflows/ci.yml
- Delivers: the automatic matrix of the `Tests` job is `ubuntu-latest` and `windows-latest`, the dispatch matrix adds `macos-latest`, and the matrix comment says so.
- Verification: grep -n "fromJSON" .github/workflows/ci.yml -> the dispatch list names ubuntu-latest, macos-latest and windows-latest, and the automatic list names ubuntu-latest and windows-latest
- DoD: the automatic matrix holds `ubuntu-latest` and `windows-latest`; the dispatch matrix holds all three; the comment above it names Windows as part of every push and pull request
<!-- /TASK -->

<!-- TASK -->
### T26 - Find the agent file under a backslash hook path
- TDD: required
- Covers: AC20
- Uses: none
- Depends-on: T10
- Files: viber/hooks/scripts/verdict-nudge.sh, tests/viber/verdict-nudge.test.ts
- Delivers: the hook reads its own directory from its invoked path with `\` and `/` both taken as separators.
- Verification: node --test tests/viber/verdict-nudge.test.ts -> every case passes
- DoD: on Windows (the case skips elsewhere), the hook copied into a throwaway plugin root and invoked by a `C:\` path blocks an agent ending on an unlisted value with the reason listing its agent file's values; on every OS, invoked by a `/` path the same case gives the same reason
<!-- /TASK -->

<!-- TASK -->
### T27 - Check for gh before the repository when posting every reply
- TDD: required
- Covers: AC21
- Uses: none
- Depends-on: T7
- Files: viber/scripts/pr-reply.sh, tests/viber/pr-reply.test.ts
- Delivers: `pr-reply.sh --all` refuses a missing `gh` before it checks for a repository; the header's exit lines say so.
- Verification: node --test tests/viber/pr-reply.test.ts -> every case passes
- DoD: `--all` with no `gh` on PATH, run from a directory outside any repository, exits 1 with one `ERROR pr-reply.sh: gh not found on PATH` line and nothing on stdout; `--all` with a stub `gh` on PATH outside a repository exits 1 with the `not inside a git repository` line
<!-- /TASK -->

<!-- TASK -->
### T28 - Expect the skill-part root in the derived spelling
- TDD: none
- Covers: AC22
- Uses: none
- Depends-on: none
- Files: tests/viber/skill-part.test.ts
- Delivers: the never-run fence cases expect the plugin root as `skill-part.sh` cuts it from the given skill directory, every separator kept as given.
- Verification: node --test tests/viber/skill-part.test.ts -> every case passes
- DoD: the looped "prints unchanged (never run)" cases build their expected root from the planted skill directory the way the script cuts it, and pass on Windows and Linux
<!-- /TASK -->

<!-- TASK -->
### T29 - Take the audit run id from a backslash workspace path
- TDD: required
- Covers: AC23
- Uses: none
- Depends-on: T16
- Files: viber/skills/code-auditor/scripts/synthesize.sh, tests/viber/synthesize.test.ts
- Delivers: `synthesize.sh` takes the run id from a workspace path with `\` or `/` separators, a trailing separator ignored.
- Verification: node --test tests/viber/synthesize.test.ts -> every case passes
- DoD: a workspace given as `C:\...\code-auditor\<run-id>` gets the same run id in `findings.md` as `C:/.../code-auditor/<run-id>`; a trailing `\` or `/` on either form gives the same run id
<!-- /TASK -->

## Contracts

### C1 - plugin_root_of

File: viber/scripts/plugin-root.sh

```
. "$(dirname -- "$0")/plugin-root.sh"                      # from viber/scripts/<name>.sh
. "$(dirname -- "$0")/../../../scripts/plugin-root.sh"     # from viber/skills/<skill>/scripts/<name>.sh

plugin_root_of <invoked path> <levels>
  <levels>: how many directories the plugin root lies above the script's own directory:
            1 for viber/scripts/<name>.sh, 3 for viber/skills/<skill>/scripts/<name>.sh
  stdout: one line, the plugin root:
    every "\" of the path read as "/"
    D = the path without its last "/<file>" ("." when it holds no "/")
    D loses its last <levels> segments, from the end, as text
    each level left over once D runs out of segments adds "/..", from "." ("./.." for one)
    "." when exactly nothing is left
  exit: 0
```

### C2 - header_value

File: viber/skills/code-auditor/scripts/run-header.sh

```
# sourced, never invoked; mode 100644; POSIX sh
. "$(dirname -- "$0")/run-header.sh"
header_value <key>
  reads: "$run_file" (set by the caller)
  stdout: the value of the first "<key>: <value>" line before the first "## " line, a trailing "\r" removed; nothing when absent
  exit: 0
```

### C3 - re-hunt id

File: none

```
R-U<n>    the wave 2 hunt id of unit U<n> whose wave 1 hunt left "no-report: U<n>"
ledger:   hunt: R-U<n> | wave: 2 | unit: U<n> | angle: none
files:    reports/R-U<n>-<k>.md, reports/R-U<n>-<k>.claim.md, verdicts/R-U<n>-<k>.md
ledger:   retried: R-U<n>, no-report: R-U<n>   (kept apart from U<n>'s own lines)
```

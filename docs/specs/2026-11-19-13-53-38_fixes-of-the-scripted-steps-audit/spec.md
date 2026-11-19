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

## Attachments
docs/_specs/2026-11-19-13-53-38_fixes-of-the-scripted-steps-audit/attachments/audit-fixes.md

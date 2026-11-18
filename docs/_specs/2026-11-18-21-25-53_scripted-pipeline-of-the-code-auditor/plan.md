---
source: /Users/dario/Projects/viber/docs/_specs/2026-11-18-21-25-53_scripted-pipeline-of-the-code-auditor/plan.md
planned: /Users/dario/.claude-p2p2/plans/stateful-wibbling-harp.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Scripted pipeline of the code auditor

## Goal

Move the mechanical work of `viber:code-auditor` (framing a run, running the map signals, gating the map, choosing units, handling each hunter and critic return, folding verdicts and ranking findings) from the model into POSIX sh and awk scripts that answer in the directive format of part 1. The model keeps only judgement: the hunter pool, merge decisions and the prose of each finding. It reads less and drifts less.

## Problem

The auditor's model reads `SKILL.md` (1655 words) and `references/synthesis.md` (1489 words) and applies dozens of mechanical rules by hand on every run: argument parsing, stop lines, brief composition, retry counting, score sorting, verdict folding, the cap of ten and the tie-break order. Every rule it applies by hand costs tokens against the user's usage limits, and one wrong application changes a brief, a count or the order of findings. The critic and scout return their results in their final message, which lands in the auditor's context. The hunter and the mapper each spend a read on a trailing closing tag that a script can strip.

## Current behaviour

`SKILL.md` runs five phases from prose. Frame: the model classifies up to two argument tokens, settles the lens and scope (a numbered list or an `AskUserQuestion`), resolves `<root>`, validates the directory, picks the lens file, checks `Worktree: required` against the commit history, interprets `diff-files.sh` and writes `run.md`. Map: `mapper` runs every bash block of `<lens>.signals.md` and the fix-commit `git log` itself, writes `map.md`, reads its tail back and deletes a trailing closing-tag line; the model gates the four headings, stops on `none:` and appends the map to `run.md`. Hunt: the model composes every scout and hunter brief, retries unscored units once, sorts scores into kept units, and runs the rolling pool. Verify: on each hunter return the model looks for `<hunt id>-<digit>.md`, retries once, and dispatches one critic per `.claim.md`; a critic returns its `VERDICT`, `COMMAND`, `OBSERVED` and `SEVERITY` in its final message, retried once without a `VERDICT:` line. Synthesize: the model folds verdicts, groups duplicates, orders by severity, caps at ten and writes `findings.md` by `synthesis.md`, then offers one variant wave and rebuilds the file after it.

### Must not change

- Every stop line, the lens list and its group numbers, the scope question and the `/viber:intent <findings.md>` closing line read as today.
- `run.md`, the hunter report and claim sidecar schemas, and the shape of `findings.md` (title, header line, entries, further findings, coverage notes) keep their exact form.
- Every agent brief carries the same labelled lines as today, except that the critic and scout briefs gain an `Out:` line, the scout's unit lines gain a `Unit:` label, and the mapper's `Signals file:` line becomes `Signals:`.
- `findings.md` gains only one `<!-- finding: <id> -->` marker line per full entry.
- Budgets, the scout model on the security lens, the rolling pool of 16 with critics ahead of hunters and at most 4 hunters on the tests lens, one retry per hunter, scout batch and critic, and one variant wave per run.
- Verdict folding, the cap of ten, the 1-3 band rule and the tie-break order of `synthesis.md`.
- The lens files, their `<lens>.signals.md` files, `diff-files.sh`, `diff-overlay.sh` and `worktree.sh`.

## Roadmap

Part 3 of 7 - Code auditor

1. Directive convention and the implementor task loop (built)
2. Implementor close (built)
3. Code auditor (this plan)
4. Memory and rules
   - Untracked `CLAUDE.md` nodes visible only to `memory-map.sh --reconcile`; `memory-map.sh --targets` and `shape:` lines in the auditor brief, the auditor still judging the title sentences.
   - A rule matching nothing is `GONE` without an auditor, its removal still confirmed by the user; `rules-map.sh` `misplaced:`, `--brief`, `--confirm`.
5. Planner validation and review
   - Every mechanical reviewer check moves into `plan-index.sh`, the input-dependent ones (`Attachment:`, `Root cause`, `Repro:`) through `--input <summary file>` and staying with the reviewer when the input is text; every error as a `FIX:` or `SPLIT:` directive, all errors in one run; the missing unnumbered-scenario check added.
   - Reviewers get Write and `out:`; `review-round.sh` aggregates verdicts (`DENIED` over `FAIL` over `PASS`), retries a member without a verdict, composes the round 2+ prompts and answers `NEXT: fix`, `NEXT: redispatch <members>` or `NEXT: exit-plan`; every round after a fix reviews the whole set, `plan-gate.sh` unchanged.
6. Intent, fixer, e2e and the rest
   - Full payload on the `dispatch:` lines; `reach.sh` prints the impact-mapper prompt; `run:` and `settle:` fields on the branch options; `--branch` answers `next: kept`, the model editing the frontmatter.
   - `tree-record.sh --save`/`--check` in `fixer`; `app-wait.sh` only waits, the launch staying with the model; `qa-ledger.sh` with an awk ASCII table; the issue or PR argument classifier called at runtime; `summary-path.sh`, `attach-lines.sh`, `threshold:` only past the accepted count, `SAY=` for `STATUS=skip`.
7. Git, GitHub and the rest
   - `factory.sh answer`, `approve`, `reject` with `MISMATCH` falling back to keys; `verdict-nudge.sh` reads the `VERDICT:` values from the agent file; `commit.sh` runs its own self-check and prints the result line, `commit-selfcheck.sh` removed; `commit-context.sh` gives the ready footer and `RUN:`.
   - `pr-reply.sh --list`/`--all` under one confirmation, never retrying; `build_report.mjs --prompts` writes prompt files under `.temp/`; `issue-create.sh --template`; `pr-facts.sh` `TITLE=`, `TITLE_TEMPLATE=`, `FOOTER=`, `BODY_FILE=`, `SAY=`, `ASK` with `RERUN=`; `bootstrap.sh` `ASK`/`RUN`; `shell-guard.sh` returns the corrected command.
   - Every part: the directive format of part 1, a pure refactor, a word cap on the skill it touches.

## Behaviour

### S1 - Framing a run [CHANGED - was: the model parsed the tokens, checked the scope and wrote run.md]

The skill runs `frame.sh` with the argument tokens and acts on its one answer: a lens list to show, a scope question, a stop line, or the `RUN:` line of the map signals after the workspace and `run.md` are written.

Given `/viber:code-auditor security src/api` and `src/api` exists under the repository root
When the skill runs `frame.sh` with those two tokens
Then `<ws>/run.md` holds `Lens: security`, the security lens file, `Scope: src/api` and the target root, and stdout is the `RUN:` line of `map-signals.sh` for `<ws>`

Given `/viber:code-auditor quality`
When the skill runs `frame.sh` with that token
Then stdout is `NEXT: ask-lens | numbers: 5,6` and nothing is written

### S2 - Running the map signals [CHANGED - was: the mapper ran every signal block and the fix-commit log itself]

Given a run of the bugs lens on `repo`
When the skill runs `map-signals.sh` on the workspace
Then `<ws>/signals.md` holds the signals file with each bash block replaced by its output, `empty` or its error line, then `## Fix commits`, and stdout is the mapper block carrying `Signals: <ws>/signals.md`

### S3 - Gating the map and choosing the hunts [CHANGED - was: the model gated map.md, composed every scout and hunter brief and sorted the scores]

Given a repository scope whose `map.md` holds 20 units, the budget 16
When the skill runs `keep-units.sh` after the mapper returns
Then a trailing closing tag is stripped from `map.md`, the map is appended to `run.md`, and stdout is three `NEXT: scout` blocks of 8, 8 and 4 unit lines

Given the scouts have written their score files and every unit is scored
When the skill runs `keep-units.sh` again
Then stdout is 16 `NEXT: hunter` blocks, highest score first, equal scores in map order

### S4 - Handling a hunter return [CHANGED - was: the model looked for the reports and composed each critic brief]

Given hunt `U3` wrote `U3-1.md`, `U3-1.claim.md`, `U3-2.md` and `U3-2.claim.md` on a bugs lens run
When the skill runs `hunt-return.sh <ws> hunter U3`
Then both files lose a trailing closing tag and stdout is two `NEXT: critic` blocks, each with its `Claim:`, `Out: <ws>/verdicts/U3-<k>.md` and its own worktree

### S5 - Handling a critic return [CHANGED - was: the critic returned its verdict in its final message]

Given a critic wrote `<ws>/verdicts/U3-1.md` holding no `VERDICT:` line
When the skill runs `hunt-return.sh <ws> critic U3-1`
Then stdout is the same critic brief once more with `-retry` on its worktree; after a second miss stdout is `NEXT: none`

### S6 - Synthesizing the findings [CHANGED - was: the model folded every verdict, grouped duplicates, ranked and wrote findings.md]

Given two surviving findings of different classes in the same file, with 3 lines between their line ranges
When the skill runs `synthesize.sh <ws>`
Then stdout is a `NEXT: merge` block naming that pair with each finding's location, class and observed symptom, and no `findings.md` is written yet

Given every pair is decided
When the skill runs `synthesize.sh <ws> --merge none`
Then `findings.md` holds every entry's tagged lines, the further findings and the coverage notes, and stdout is the summary and closing report lines, a `NEXT: fill` block naming each entry's reports, and the wave question when one applies

### S7 - Ending the run [CHANGED - was: the model offered the wave and ended the run from prose]

Given a run with one confirmed finding on a directory scope with units left uninvestigated
When the skill acts on the output of `synthesize.sh`
Then it fills the entries, shows the summary, asks the variant wave once, runs `keep-units.sh --wave` on yes, and ends its last message on `/viber:intent <findings.md>`

### Edge cases

- A token holding an apostrophe -> the skill passes `--apostrophe` in its place, and `frame.sh` stops with the directory stop line, the skill writing the user's token where the line reads `<token>`.
- Two lens tokens, two scope tokens, a lens beside a group token, or more than two tokens -> `frame.sh` stops with one line naming the argument form.
- A signal block ending with exit 1 and empty stderr, or any failing block in a repository with no commit -> `empty`.
- `map.md` missing a heading on the second try -> `STOP: code-auditor: map unavailable after two attempts`.
- A unit still unscored after the scout retry -> kept after every scored unit, in map order.
- A hunt with only `<id>-0.md` -> `NEXT: none`, the hunt counted under `Hunts with no finding`.
- A file `A-x-y-1.md` beside hunt `A-x` -> never counted as a report of `A-x`.
- A critic verdict file missing after its retry -> the finding is `INCONCLUSIVE` with `critic returned no verdict`.
- A severity below 4.0 -> the 1-3 band: further findings only.
- A merged group -> one entry, every member's location on its `LOCATION:` line joined by `, `, the highest severity, the strongest verdict, named by its first member in hunt order.
- The rebuild after the variant wave -> an entry already filled keeps its paragraphs, so its report is never opened again.

## Glossary

- Directive block - one output block of an auditor script: a directive line (`NEXT:`, `RUN:`, `ASK:` or `STOP:`) and the body lines after it, which the skill sends verbatim.
- Ledger - `<ws>/ledger.md`, the workspace file the scripts append facts to (hunts dispatched, retries spent, merge decisions, the wave), so a later call knows what an earlier one did.
- Merge pair - two surviving findings in the same file, whatever their classes, whose line ranges overlap or have at most 5 lines between them (the later range's start minus the earlier range's end, minus 1, is 5 or less), printed as `merge?:` for the model to decide.
- Fill - the model's one edit per entry of `findings.md`: three paragraphs lifted from the entry's reports.
- Hunt order - `U<n>` by ascending `n`, then `A-<angle slug>` in the lens's angle order, then `V-<n>` by ascending `n`, and within one hunt by ascending `k`.

## Acceptance criteria

1. `frame.sh` answers every argument form with today's lens list numbers, scope question or stop line, and on a framed run writes `<ws>/reports`, `<ws>/worktrees` and `run.md` exactly as Frame step 6 does, then prints the `RUN:` line of `map-signals.sh`.
2. `map-signals.sh` writes `<ws>/signals.md` with every bash block of the lens's signals file replaced by its result and the fix-commit list appended, and prints the mapper block.
3. `keep-units.sh` strips a trailing closing tag from `map.md`, retries the mapper once on a missing heading, stops on a second miss or on `none:`, and appends the map to `run.md` once.
4. Without scouts, `keep-units.sh` prints one hunter block per lens angle on the diff scope and one per unit on a directory or repository within the budget, each brief carrying today's lines.
5. Above the budget, `keep-units.sh` prints scout batches of up to 8 units, retries the unscored units once, and then prints the hunter blocks of the kept units in today's order.
6. `keep-units.sh --wave` prints the variant hunts: one `V-<n>` per confirmed class on the diff scope, one `U<n>` per uninvestigated unit within the budget otherwise, each carrying the `Seed:` lines.
7. `hunt-return.sh <ws> hunter <id>` strips a trailing closing tag from the hunt's files and prints one critic block per claim, or the hunt's retry, or `NEXT: none`.
8. `hunt-return.sh <ws> critic <id>-<k>` strips a trailing closing tag from the verdict file and answers a missing `VERDICT:` line with one retry, then `NEXT: none`.
9. `synthesize.sh` writes `findings.md` from the ledger, the report head lines and the verdict files with today's folding, ordering, cap, further findings and coverage notes, and prints the fill block and the summary line.
10. `synthesize.sh` prints every undecided merge pair before writing, and applies each `--merge` group as one finding.
11. `synthesize.sh` asks the variant wave once when a finding is confirmed and the scope allows it, writes the seeds, rebuilds `findings.md` after the wave keeping the filled entries, and prints the `/viber:intent` closing line when a finding is confirmed.
12. `strip-tag.sh` deletes a trailing bare closing-tag line from each file it is given and leaves every other file byte-identical.
13. `critic` writes its verdict to its `Out:` file and ends on its `VERDICT:` line, `scout` writes its score lines to its `Out:` file, `mapper` reads `Signals:` and runs no signal command, and neither `hunter` nor `mapper` reads back the tail of a file it wrote.
14. `SKILL.md` acts only on the scripts' directives and `synthesis.md` keeps only what an agent or the fill step reads; each of `SKILL.md`, `synthesis.md`, `critic.md`, `scout.md`, `hunter.md` and `mapper.md` stays within a word cap below its count before this plan.

## Scope

### File map

- add - viber/skills/code-auditor/scripts/strip-tag.sh - deletes a trailing bare closing-tag line from the files it is given
- add - viber/skills/code-auditor/scripts/frame.sh - classifies the tokens, settles lens and scope, runs the Frame checks, writes the workspace and `run.md`
- add - viber/skills/code-auditor/scripts/map-signals.sh - runs the lens's signal blocks and the fix-commit log into `signals.md`
- add - viber/skills/code-auditor/scripts/keep-units.sh - gates the map, prints the scout and hunter blocks, the kept units and the variant hunts
- add - viber/skills/code-auditor/scripts/hunt-return.sh - answers each hunter and critic return
- add - viber/skills/code-auditor/scripts/synthesize.sh - folds, groups and ranks the findings and writes `findings.md`
- add - tests/viber/strip-tag.test.ts - the contract of `strip-tag.sh`
- add - tests/viber/frame.test.ts - the contract of `frame.sh`
- add - tests/viber/map-signals.test.ts - the contract of `map-signals.sh`
- add - tests/viber/keep-units.test.ts - the contract of `keep-units.sh`
- add - tests/viber/hunt-return.test.ts - the contract of `hunt-return.sh`
- add - tests/viber/synthesize.test.ts - the contract of `synthesize.sh`
- add - tests/viber/code-auditor-words.unit.test.ts - the six word caps
- modify - viber/skills/code-auditor/SKILL.md - runs the scripts and acts on their directives
- modify - viber/skills/code-auditor/references/synthesis.md - keeps the run file, report, sidecar and verdict file schemas and the fill rules
- modify - viber/agents/critic.md - Write and `Out:`, final message the `VERDICT:` line
- modify - viber/agents/scout.md - Write and `Out:`, `Unit:` input lines
- modify - viber/agents/hunter.md - no tail read
- modify - viber/agents/mapper.md - reads `Signals:`, runs no signal command, no tail read
- modify - .claude/rules/agent-frontmatter.md - its read-only agent example no longer names `scout.md`, which gains Write
- modify - tests/viber/lenses.unit.test.ts - its `SKILL.md` brief assertions leave for the script tests
- modify - tests/viber/code-auditor.unit.test.ts - its lens file assertions on `SKILL.md` leave for `frame.test.ts`

### Out of scope

- Parts 4 to 7 of the roadmap: memory and rules; planner validation and review; intent, fixer, e2e and the rest; git, GitHub and the rest.
- The 6 failing cases of `tests/viber/skill-part.test.ts` on a Windows checkout: a separate `/viber:fixer` run on Windows.
- The hunter pool (16 at once, critics ahead, 4 hunters on the tests lens, background dispatch, ending the turn between returns) stays with the model.
- The lens files, the `<lens>.signals.md` files, `diff-files.sh`, `diff-overlay.sh`, `worktree.sh` and `code-auditor/README.md`: what they say stays true.
- `viber/hooks/scripts/verdict-nudge.sh` and `tests/viber/verdict-nudge.test.ts`: `critic` still ends on a `VERDICT:` line and `scout`, `mapper`, `hunter` stay exempt.
- `viber/README.md`, `viber/docs/files.md`, `viber/skills/setup/assets/help.html` and `docs/viber-functions.html`: the audit a user runs and the files it leaves under `.temp/viber/code-auditor/` read as described.
- `viber/.claude-plugin/plugin.json`: no agent is added or renamed.
- `tests/viber/guard-prose.unit.test.ts`, `tests/viber/rule-budget.unit.test.ts`, `tests/viber/lens-map-signals.test.ts` and `tests/portability.unit.test.ts`: the text they pin stays (the `viber guard:` sentence of the three auditor agents, the `Hunter report schema` and `Claim sidecar schema` sections within the hunter cap, the signal blocks, the new scripts swept as every `.sh`).
- `.claude/rules/shell-preload-contract.md` and `.claude/rules/shell-script-exec-bit.md`: `code-auditor` still calls its scripts through `sh`.
- `tests/orphan-tags.unit.test.ts`: the new test files build every closing tag fixture from escapes, so the sweep stays green unchanged.
- The `CLAUDE.md` nodes naming the auditor's flow (`viber/CLAUDE.md`, `viber/agents/CLAUDE.md`, `viber/hooks/CLAUDE.md`, `viber/references/CLAUDE.md`, `viber/skills/CLAUDE.md`, `viber/skills/CLAUDE.code-auditor.md`, `tests/viber/CLAUDE.md`): the build's memory step updates every one.
- The archived runs under `docs/specs/`.

## Solution requirements

- Pure refactor: every rule under `Must not change` keeps its exact semantics, and each script's output is proven line by line against what the prose produced for the same input.
- An output telling the model what to do next is a directive block of C1; a fact the model only reads is a `<key>: <value>` report line.
- Every script is `#!/bin/sh` POSIX sh with awk, called by the skill as `sh "${CLAUDE_SKILL_DIR}/scripts/<name>.sh" ...`, works under Git Bash on Windows and on macOS, keeps mode 100755 in the index and uses no heredoc. `map-signals.sh` runs each signal block with `bash -c`, as the mapper's Bash tool ran it.
- No script argument carries an apostrophe: a script takes only the user's argument tokens (one holding an apostrophe replaced by `--apostrophe`), ids, the workspace path and merge groups.
- Each script's test is `tests/viber/<script>.test.ts`, run through `forEachShell("posix", ...)` by its own task's `Verification` as one named file; the word caps are a `*.unit.test.ts`.
- Points today's prose leaves open are settled: conflicting or surplus tokens stop the run (answered); a severity below 4.0 is the 1-3 band (answered); a merge pair is the one defined in the Glossary (answered); `Hunts with no finding` lists the hunts whose only report is `<id>-0.md`; the `NOT_A_REPO` stop line reads `code-auditor: the diff scope needs a git repository`.
- The scripts' tests spawn a `#!/bin/sh` SUT, the host's only layer for a shell script: no unit seam exists.
## Tasks

<!-- TASK -->
### T1 - Strip a trailing closing tag with strip-tag.sh
- TDD: required
- Covers: AC12
- Uses: C9
- Depends-on: none
- Files: viber/skills/code-auditor/scripts/strip-tag.sh, tests/viber/strip-tag.test.ts
- Delivers: the script every other auditor script calls to delete the write-call artefact at the end of a file an agent wrote.
- Verification: node --test tests/viber/strip-tag.test.ts tests/portability.unit.test.ts tests/orphan-tags.unit.test.ts -> all pass, and `git ls-files -s viber/skills/code-auditor/scripts/strip-tag.sh` reads 100755
- DoD: a file whose last line is `</content>` or `</parameter>`, with or without a carriage return or surrounding spaces, loses that line and keeps every byte before it; a file with no such last line, or with the tag inside a line, is left byte-identical; a missing path is skipped and the other files are still handled; the script exits 0 in every case above
<!-- /TASK -->

<!-- TASK -->
### T2 - Frame a run with frame.sh
- TDD: required
- Covers: AC1
- Uses: C1, C2
- Depends-on: none
- Files: viber/skills/code-auditor/scripts/frame.sh, tests/viber/frame.test.ts
- Delivers: the Frame phase in one call: the lens list or scope question when one is missing, every stop line of Frame steps 3 to 5, and on a framed run the workspace, `run.md` and the `RUN:` line of `map-signals.sh`.
- Verification: node --test tests/viber/frame.test.ts tests/portability.unit.test.ts -> both pass, and `git ls-files -s viber/skills/code-auditor/scripts/frame.sh` reads 100755
- DoD: no lens prints `NEXT: ask-lens | numbers: 1-6`, a `performance` or `quality` token `numbers: 3,4` or `numbers: 5,6`, each carrying a given scope token as a `scope:` body line, and a lens with no scope prints the `ASK:` scope line with a `lens:` body line, writing nothing; every lens name reads as that lens even beside a directory of that name and `./<name>` as the directory, while two lens tokens, two scope tokens, a lens beside a group token or more than two tokens print the argument stop line of C2; a directory that does not exist, lies outside the root or holds a `..` segment, an absolute one outside the root, an `--apostrophe` token (the directory stop line with `<token>` as its value), and the four diff-scope outcomes of `diff-files.sh` each print their C2 stop line verbatim; a directory or repo scope under a `Worktree: required` lens in a repository with no commit prints its stop line, the design lens framing; a framed run writes `<ws>/reports`, `<ws>/worktrees` and `run.md` with `Lens:`, `Lens file:`, `Scope:`, `Target root:` and on the diff scope `Base:` and `## Changed files`, an absolute directory rewritten root-relative, a leading `./` dropped, and a directory resolving to `diff` or `repo` recorded as `./diff` or `./repo`, then prints the `RUN:` line, which the test checks as text without running `map-signals.sh`; each of the six lens names frames a run whose `Lens file:` is an existing file of `references/lenses/`
<!-- /TASK -->

<!-- TASK -->
### T3 - Run the map signals with map-signals.sh
- TDD: required
- Covers: AC2
- Uses: C1, C3
- Depends-on: none
- Files: viber/skills/code-auditor/scripts/map-signals.sh, tests/viber/map-signals.test.ts
- Delivers: the mapper's signal and fix-history commands run once by a script into `<ws>/signals.md`, then the mapper block to dispatch.
- Verification: node --test tests/viber/map-signals.test.ts tests/portability.unit.test.ts -> both pass, and `git ls-files -s viber/skills/code-auditor/scripts/map-signals.sh` reads 100755
- DoD: each fenced bash block of the signals file is run in the target root with `<scope>` replaced by `.` on the diff and repo scopes and by the directory otherwise, and replaced in `signals.md` by its output; a block ending with exit 1 and empty stderr, or any failing block when the run file reads `Base: none` or the repository has no commit, reads `empty`, any other failure its `error:` line; the prose of the signals file outside the blocks is kept verbatim; `## Fix commits` lists the 12-month fix commits as `<hash> <subject>`, or `none`; stdout is the `NEXT: mapper` block with `Run file:`, `Lens file:`, `Signals:` and `Output:`; a missing workspace or run file exits 2 with one `error:` line and nothing on stdout
<!-- /TASK -->

<!-- TASK -->
### T4 - Gate the map and print the hunters without scouts in keep-units.sh
- TDD: required
- Covers: AC3, AC4
- Uses: C1, C3, C4, C7, C9
- Depends-on: T1, T3
- Files: viber/skills/code-auditor/scripts/keep-units.sh, tests/viber/keep-units.test.ts
- Delivers: the map gate and the hunter blocks of a scope whose units fit the budget, each hunt recorded in the ledger.
- Verification: node --test tests/viber/keep-units.test.ts tests/portability.unit.test.ts tests/orphan-tags.unit.test.ts -> all pass, and `git ls-files -s viber/skills/code-auditor/scripts/keep-units.sh` reads 100755
- DoD: a trailing closing tag of `map.md` is stripped before the gate; a `map.md` missing or lacking one of the four headings prints the mapper block once more with `retry`, and on the second miss the stop line `code-auditor: map unavailable after two attempts`; a `## Units` of `none: <reason>` prints `STOP: code-auditor: nothing to audit for <lens>: <reason>`; a passed gate appends `## Map` and `map.md` verbatim to `run.md` once, however often the script runs; the diff scope prints one hunter block per angle of the lens's `## Hunts`, id `A-<slug>`, and a directory or repo scope with no more units than its budget one per unit, id `U<n>`, each brief carrying today's lines (the `Test rules:` line among them), the worktree and overlay lines only where today's rules add them, after the `hunters-at-once:` line; every printed hunt is a `hunt:` ledger line, and a later call with wave 1 hunts in the ledger prints `NEXT: none`
<!-- /TASK -->

<!-- TASK -->
### T5 - Print the scouts and the kept units in keep-units.sh
- TDD: required
- Covers: AC5
- Uses: C1, C4, C7, C8, C9
- Depends-on: T4
- Files: viber/skills/code-auditor/scripts/keep-units.sh, tests/viber/keep-units.test.ts
- Delivers: the scout batches above the budget, their one retry, and the hunter blocks of the kept units.
- Verification: node --test tests/viber/keep-units.test.ts tests/portability.unit.test.ts tests/orphan-tags.unit.test.ts -> all pass
- DoD: above the budget with no `scouts:` ledger line, stdout is one `NEXT: scout` block per batch of up to 8 units in map order, `model: sonnet` on the security lens only, each with its `Out:` file and `Unit:` lines, and the batches are recorded as one `scouts:` line; on the next call the units with no score line, a missing score file's units included, go once to `retry` batches, recorded as `scouts-retried`, and no call after that prints a scout block; the kept units are the budget's count, highest score first, equal scores in map order, units unscored after the retry after every scored unit in map order, each printed as a hunter block and a `hunt:` ledger line; a score file ending on a closing tag, or holding a line that is not a score line, still yields its score lines
<!-- /TASK -->

<!-- TASK -->
### T6 - Print the variant hunts with keep-units.sh --wave
- TDD: required
- Covers: AC6
- Uses: C1, C4, C6, C7
- Depends-on: T5
- Files: viber/skills/code-auditor/scripts/keep-units.sh, tests/viber/keep-units.test.ts
- Delivers: the hunter blocks of the one variant wave, built from the seeds file.
- Verification: node --test tests/viber/keep-units.test.ts tests/portability.unit.test.ts -> both pass
- DoD: on the diff scope, one `V-<n>` hunt per `Seed:` line of `seeds.md`, `n` from 1, carrying `Angle:` with that seed's slug and that `Seed:` line; on a directory or repo scope, one `U<n>` hunt per unit no hunt took on yet, in kept order, up to the budget, each carrying every `Seed:` line; each printed hunt is a `hunt:` ledger line of wave 2; a second `--wave` call prints `NEXT: none`
<!-- /TASK -->

<!-- TASK -->
### T7 - Answer a hunter return with hunt-return.sh
- TDD: required
- Covers: AC7
- Uses: C1, C4, C5, C6, C7, C9
- Depends-on: T6
- Files: viber/skills/code-auditor/scripts/hunt-return.sh, tests/viber/hunt-return.test.ts
- Delivers: the critic blocks of a returned hunt, or its one retry.
- Verification: node --test tests/viber/hunt-return.test.ts tests/portability.unit.test.ts tests/orphan-tags.unit.test.ts -> all pass, and `git ls-files -s viber/skills/code-auditor/scripts/hunt-return.sh` reads 100755
- DoD: every `<id>-<digit>.md` and `.claim.md` of the hunt loses a trailing closing tag, and a file of a longer id (`A-x-y-1.md` for `A-x`) is neither stripped nor counted; each claim prints one `NEXT: critic` block in ascending `k` with `Claim:`, `Run file:`, `Lens file:` and `Out: <ws>/verdicts/<id>-<k>.md`, plus `Worktree script:` and `Worktree: <ws>/worktrees/critic-<id>-<k>` on a worktree lens, `Overlay script:` on the diff scope, the `Test rules:` line on the tests lens and `Variant: yes` for a wave 2 hunt; a hunt with no report prints once more with `retry` the brief `keep-units.sh` printed for it, line for line for a unit hunt, an angle hunt and a wave 2 hunt (its `Seed:` lines from `seeds.md`), only its worktree suffixed `-retry`, recorded as `retried:`, and on the second miss records `no-report:` and prints `NEXT: none`; a hunt with only `<id>-0.md` prints `NEXT: none`
<!-- /TASK -->

<!-- TASK -->
### T8 - Answer a critic return with hunt-return.sh
- TDD: required
- Covers: AC8
- Uses: C1, C5, C7, C8, C9
- Depends-on: T7
- Files: viber/skills/code-auditor/scripts/hunt-return.sh, tests/viber/hunt-return.test.ts
- Delivers: the critic's one retry when its verdict file holds no verdict.
- Verification: node --test tests/viber/hunt-return.test.ts tests/portability.unit.test.ts tests/orphan-tags.unit.test.ts -> all pass
- DoD: the verdict file loses a trailing closing tag; a `VERDICT:` line holding one of the four verdicts prints `NEXT: none`; a missing file or one with no such line prints the critic's brief once more with `retry` and its worktree suffixed `-retry`, recorded as `critic-retried:`, and on the second miss prints `NEXT: none`
<!-- /TASK -->

<!-- TASK -->
### T9 - Write findings.md with synthesize.sh
- TDD: required
- Covers: AC9
- Uses: C1, C6, C7, C8
- Depends-on: none
- Files: viber/skills/code-auditor/scripts/synthesize.sh, tests/viber/synthesize.test.ts
- Delivers: `findings.md` built mechanically from the run's files, with a fill line where each entry's prose goes, and the fill block and summary line.
- Verification: node --test tests/viber/synthesize.test.ts tests/portability.unit.test.ts -> both pass, and `git ls-files -s viber/skills/code-auditor/scripts/synthesize.sh` reads 100755
- DoD: reading the reports and verdict files as `hunt-return.sh` left them (closing tags already stripped), `REFUTED` drops a finding, `VERIFIED` and `PARTIALLY VERIFIED` adopt the critic's severity and note it in the entry, `INCONCLUSIVE` and a missing verdict lower the confidence one step and keep the filed severity, the former with `STATUS: INCONCLUSIVE - <!-- oracle -->` and the latter with `STATUS: INCONCLUSIVE - critic returned no verdict`; findings are ordered by severity, verdict, confidence and hunt order, the first ten with a severity of 4.0 or more get full entries and every other one, a severity below 4.0 included, a further-findings line; the title line, the header line with `U`, `H`, `K` and `J`, and the three coverage lines hold today's counts, `Hunts with no finding` naming the hunts whose only report is `<id>-0.md`, `J` 0 and `none` on the diff scope; each entry carries its tagged lines, its marker and one fill line; stdout is the `summary:` report line, then the `NEXT: fill` block with one `entry:` line per full entry
<!-- /TASK -->

<!-- TASK -->
### T10 - Point at the merge pairs in synthesize.sh
- TDD: required
- Covers: AC10
- Uses: C1, C6, C7
- Depends-on: T9
- Files: viber/skills/code-auditor/scripts/synthesize.sh, tests/viber/synthesize.test.ts
- Delivers: the undecided merge pairs for the model to judge, and each decided group applied as one finding.
- Verification: node --test tests/viber/synthesize.test.ts -> passes
- DoD: two surviving findings in one file, of the same or different classes, whose ranges overlap or have at most 5 lines between them print one `merge?:` line with a `finding:` line for each, and nothing is written; 6 lines between the ranges, other files and an unparsable `LOCATION` print no pair; each `--merge` group becomes one finding taking the title and `CLASS` of its first member in hunt order and its name, every member's location joined on one `LOCATION:` line, the highest severity, the strongest verdict and the highest confidence, taking one slot against the cap and listing every member's report on its `entry:` line; a call with `--merge` groups records every printed pair it does not merge as `apart:`, `--merge none` records every printed pair so, and a later call prints only pairs not decided yet; a `--merge` id naming no finding exits 2 with one `error:` line and writes nothing
<!-- /TASK -->

<!-- TASK -->
### T11 - Offer the variant wave and rebuild after it in synthesize.sh
- TDD: required
- Covers: AC11
- Uses: C1, C6, C7
- Depends-on: T10
- Files: viber/skills/code-auditor/scripts/synthesize.sh, tests/viber/synthesize.test.ts
- Delivers: the one wave question with its seeds, the rebuild of `findings.md` over both waves, and the closing line.
- Verification: node --test tests/viber/synthesize.test.ts -> passes
- DoD: with a confirmed finding and no wave offered yet, on the diff scope or with a unit not investigated, the script writes one `Seed:` line per distinct confirmed `CLASS` value to `seeds.md`, records `wave-offered` and prints the `ASK:` wave line, and never again once offered; a rebuild after the wave ranks every finding of both waves, and an entry whose marker already holds paragraphs in `findings.md` keeps them and its filled `STATUS:` line and gets no `entry:` line; with a confirmed finding stdout carries the `last-line: /viber:intent <ws>/findings.md` report line right after `summary:`, and none without one
<!-- /TASK -->

<!-- TASK -->
### T12 - Point the four auditor agents at the scripts' files
- TDD: none
- Covers: AC13
- Uses: C3, C4, C5, C8
- Depends-on: T8
- Files: viber/agents/critic.md, viber/agents/scout.md, viber/agents/hunter.md, viber/agents/mapper.md, .claude/rules/agent-frontmatter.md
- Delivers: `critic` and `scout` writing their results to their `Out:` file, `mapper` reading the signal results file, `hunter` and `mapper` without the tail read.
- Verification: grep -n "Out:" viber/agents/critic.md viber/agents/scout.md viber/skills/code-auditor/scripts/hunt-return.sh viber/skills/code-auditor/scripts/keep-units.sh; grep -n "Signals:" viber/agents/mapper.md viber/skills/code-auditor/scripts/map-signals.sh; node --test tests/viber/lenses.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts -> every grep finds its line on both sides and the three test files pass
- DoD: `critic.md` carries `tools: Read, Write, Grep, Glob, Bash`, an `Out:` input, writes the four lines of C8 there and nothing else outside its worktree, and ends its final message on its `VERDICT:` line alone; `scout.md` carries `tools: Read, Write, Grep, Glob`, takes `Unit:` lines and an `Out:` input, writes its score lines there and ends on `scores written: <path>`; `mapper.md` takes `Signals: <path>` in place of the signals file, runs no signal block, no `git log` and no `git rev-parse`, and keeps its four headings; neither `hunter.md` nor `mapper.md` reads back the tail of a file it wrote; `critic.md`, `scout.md`, `hunter.md` and `mapper.md` each end below their word count before this plan (613, 308, 877 and 882 words, counted by whitespace split); `.claude/rules/agent-frontmatter.md` cites `viber/agents/planner-review.md` alone as its read-only example
<!-- /TASK -->

<!-- TASK -->
### T13 - Drive the auditor skill from the scripts and cap its words
- TDD: none
- Covers: AC14
- Uses: C1, C2, C3, C4, C5, C6, C8
- Depends-on: T2, T11, T12
- Files: viber/skills/code-auditor/SKILL.md, viber/skills/code-auditor/references/synthesis.md, tests/viber/lenses.unit.test.ts, tests/viber/code-auditor.unit.test.ts, tests/viber/code-auditor-words.unit.test.ts
- Delivers: the skill running `frame.sh`, `map-signals.sh`, `keep-units.sh`, `hunt-return.sh` and `synthesize.sh` and acting on each verb, `synthesis.md` reduced to what agents and the fill step read, and the six word caps.
- Verification: grep -n "scripts/frame.sh\|scripts/map-signals.sh\|scripts/keep-units.sh\|scripts/hunt-return.sh\|scripts/synthesize.sh\|^## " viber/skills/code-auditor/SKILL.md viber/skills/code-auditor/references/synthesis.md viber/skills/code-auditor/scripts/frame.sh viber/skills/code-auditor/scripts/synthesize.sh; node --test tests/viber/code-auditor-words.unit.test.ts tests/viber/lenses.unit.test.ts tests/viber/code-auditor.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/portability.unit.test.ts -> `SKILL.md` names all five scripts, the scripts name the next script they print, `synthesis.md` lists the kept headings, and all test files pass
- DoD: `SKILL.md` keeps the argument line, the lens list with its group numbers and the pool rules, names `viber:mapper`, `viber:scout`, `viber:hunter` and `viber:critic` written out, calls each script as one literal `sh "${CLAUDE_SKILL_DIR}/scripts/<name>.sh"` line, passes `--apostrophe` in place of a token holding an apostrophe and writes that token where the stop line reads `<token>`, runs `hunt-return.sh <ws> hunter <id>` on each hunter return and `hunt-return.sh <ws> critic <id>-<k>` on each critic return, runs `synthesize.sh` only once no hunter or critic is running or queued, states how to act on each verb of C1 and that a script's exit 2 is reported with its `error:` line and ends the run, composing no brief and reading no lens file or verdict file, and a report only once, at fill; `SKILL.md` settles the end of the run: the scope `ASK:` answer reruns `frame.sh` with the lens and that scope (a path asked in prose for a directory), the wave `ASK:` answer `wave` runs `keep-units.sh <ws> --wave` and `end` makes no call, the `summary:` line is shown once the entries are filled, and the run's last message, after any wave, ends on the `last-line:` value; `synthesis.md` keeps `## Run file`, `## Hunter report schema`, `## Claim sidecar schema`, the critic verdict file and its verdict meanings, and the fill rules (three paragraphs from the reports in place of the fill line, only the confirmed sub-claims of a `PARTIALLY VERIFIED` entry, the missing oracle named in place of the `<!-- oracle -->` mark of an `INCONCLUSIVE` one, the clearest reproduction of a merged group, each report opened once); `lenses.unit.test.ts` keeps its `hunter.md` and `critic.md` assertions without the two `SKILL.md` brief lines, and `code-auditor.unit.test.ts` keeps its agent registration and stale token checks without its two lens file checks; `code-auditor-words.unit.test.ts` holds each of `SKILL.md`, `synthesis.md`, `critic.md`, `scout.md`, `hunter.md` and `mapper.md` within a cap below its count before this plan (1655, 1489, 613, 308, 877 and 882 words), counted by whitespace split
<!-- /TASK -->

## Contracts

### C1 - Auditor directive block

File: none

```
<key>: <value>                    report lines, only before the first directive line
NEXT: <verb>[ | <field>]...       directive line; its body of "<Label>: <value>" lines runs to the next directive line
RUN: <one literal Bash line>      directive line, no body
ASK: <answer> -> <token> | <answer> -> <token>[ | ...]
                                  directive line, one AskUserQuestion; its body lines carry the values the next call needs
STOP: <one line>                  directive line, no body; the run ends

verbs:
  mapper | scout | hunter | critic   one Agent call, subagent_type viber:<verb>, prompt = the body lines verbatim
  ask-lens                           the numbered lens list (fields: numbers: 1-6 | 3,4 | 5,6)
  merge                              merge pairs to decide, answered by synthesize.sh --merge
  fill                               entries to fill (field: findings: <path>)
  none                               nothing to dispatch
fields:
  id: <hunt id | <hunt id>-<k> | S<b>[-retry]>   the dispatch description names it
  retry                                          the second and last attempt
  model: sonnet                                  pass that model (scout on the security lens only)
  background                                     dispatch in the background (hunter, critic)
```

### C2 - frame.sh

File: viber/skills/code-auditor/scripts/frame.sh

```
sh frame.sh [<token>]...             tokens as given in $ARGUMENTS, each read on its own; --apostrophe stands for a token holding an apostrophe
cwd: the session's directory; <root> = git rev-parse --show-toplevel there, else cwd
stdout, exactly one of:
  NEXT: ask-lens | numbers: 1-6|3,4|5,6
  scope: <the scope token as given>            (body, only when one was given)
  ASK: changes -> diff | directory -> directory | whole repository -> repo
  lens: <lens>                                 (body; the token directory stands for a path asked in prose)
  STOP: <one of the stop lines below>
  RUN: sh "<skill dir>/scripts/map-signals.sh" "<ws>"
stop lines:
  code-auditor: give at most one lens and one scope: [<lens>] [diff | diff:<sha> | <directory> | repo]
  code-auditor: area directory not found under <root>: <value> (lenses: bugs, security, web-performance, runtime-performance, tests, design)
                                               (<value> is the literal text <token> for --apostrophe)
  code-auditor: <lens> verifies on a clean checkout and <root> holds no git commit: commit first, or pick the design lens
  code-auditor: diff base not found: <sha>
  code-auditor: the diff scope needs a git repository
  code-auditor: nothing changed against <base>
  code-auditor: <lens> verifies on a clean checkout and this repository has no commit yet: commit first, or pick the design lens
writes, on RUN only: <ws>/reports/, <ws>/worktrees/, <ws>/run.md
  <ws> = <root>/.temp/viber/code-auditor/<date +%Y%m%d-%H%M%S>
exit: 0
```

### C3 - map-signals.sh and signals.md

File: viber/skills/code-auditor/scripts/map-signals.sh

```
sh map-signals.sh <ws>
reads <ws>/run.md (Lens file:, Scope:, Target root:, Base:) and the signals file: the lens file path ending in .signals.md
writes <ws>/signals.md: the signals file verbatim, each fenced bash block (fence lines included)
  replaced by a fenced text block holding one of:
    <stdout lines>
    empty
    <stdout lines, if any>, then: error: exit <code>: <first stderr line>
  then:
  ## Fix commits
  <hash> <subject>    one per line, git log --no-merges -i -E --grep='fix|bug|regress|revert' --since='12 months ago' --format='%h %s'
  | none
stdout:
  NEXT: mapper
  Run file: <ws>/run.md
  Lens file: <lens file>
  Signals: <ws>/signals.md
  Output: <ws>/map.md
exit: 0; 2 with one "error:" line on stderr and nothing on stdout when <ws>/run.md is missing
```

### C4 - keep-units.sh

File: viber/skills/code-auditor/scripts/keep-units.sh

```
sh keep-units.sh <ws> [--wave]
reads <ws>/run.md, <ws>/map.md, <ws>/scores/*.md, <ws>/seeds.md (--wave), <ws>/ledger.md, the lens file ## Hunts (### <slug> lines)
budget: one hunt per angle on diff; 8 for a directory; 16 for repo
stdout, the first that applies:
  map gate:  NEXT: mapper | retry + the four C3 body lines
             STOP: code-auditor: map unavailable after two attempts
             STOP: code-auditor: nothing to audit for <lens>: <reason>
  scouts:    NEXT: scout | id: S<b>[-retry][ | model: sonnet]
             Run file: <ws>/run.md
             Lens file: <lens file>
             Out: <ws>/scores/S<b>[-retry].md
             Unit: <unit line verbatim>            (1 to 8)
  hunters:   hunters-at-once: 4 | 16               (4 on the tests lens)
             NEXT: hunter | id: <hunt id> | background
             Run file: <ws>/run.md
             Lens file: <lens file>
             Schema: <skill dir>/references/synthesis.md
             Test rules: <plugin root>/references/test-strategy.md
             Hunt: <hunt id>
             Unit: <unit line verbatim> | Angle: <slug>
             Seed: <angle slug>: <class>           (wave 2 only, per seed)
             Reports: <ws>/reports/<hunt id>
             Worktree script: <skill dir>/scripts/worktree.sh      (Worktree: required lenses)
             Worktree: <ws>/worktrees/<hunt id>                    (Worktree: required lenses)
             Overlay script: <skill dir>/scripts/diff-overlay.sh   (Worktree: required lenses, diff scope)
  nothing:   NEXT: none
exit: 0; 2 with one "error:" line on stderr and nothing on stdout when <ws>/run.md is missing
```

### C5 - hunt-return.sh

File: viber/skills/code-auditor/scripts/hunt-return.sh

```
sh hunt-return.sh <ws> hunter <hunt id>
sh hunt-return.sh <ws> critic <hunt id>-<k>
stdout:
  NEXT: critic | id: <hunt id>-<k> | background[ | retry]
  Claim: <ws>/reports/<hunt id>-<k>.claim.md
  Run file: <ws>/run.md
  Lens file: <lens file>
  Out: <ws>/verdicts/<hunt id>-<k>.md
  Worktree script: <skill dir>/scripts/worktree.sh                       (Worktree: required lenses)
  Worktree: <ws>/worktrees/critic-<hunt id>-<k>[-retry]                  (Worktree: required lenses)
  Overlay script: <skill dir>/scripts/diff-overlay.sh                    (Worktree: required lenses, diff scope)
  Test rules: <plugin root>/references/test-strategy.md                  (tests lens)
  Variant: yes                                                           (wave 2 hunts)
  | NEXT: hunter | id: <hunt id> | background | retry + the hunt's C4 brief, Worktree: suffixed -retry
  | NEXT: none
exit: 0; 2 with one "error:" line on stderr and nothing on stdout on a bad form or a hunt absent from the ledger
```

### C6 - synthesize.sh

File: viber/skills/code-auditor/scripts/synthesize.sh

```
sh synthesize.sh <ws> [--merge <id>,<id>[,<id>]...]... | [--merge none]
reads <ws>/run.md, <ws>/ledger.md, the first five lines of each <ws>/reports/<id>-<k>.md, <ws>/verdicts/*.md, the lens file ## Hunts
stdout, undecided pairs first:
  NEXT: merge
  merge?: <id> <id>
  finding: <id> | <LOCATION> | <CLASS> | <OBSERVED or none>
  ...
or, every pair decided (writes <ws>/findings.md first):
  summary: units <U> | hunts <H> | confirmed <K> | not investigated <J>
  last-line: /viber:intent <ws>/findings.md                  (K >= 1)
  NEXT: fill | findings: <ws>/findings.md
  entry: <n> | reports: <path>[, <path>] | verdict: <VERDICT> | observed: <OBSERVED or none>
  ASK: run the variant wave -> wave | end the run -> end     (writes <ws>/seeds.md: one "Seed: <CLASS line value>" per distinct confirmed CLASS)
findings.md: today's shape; an INCONCLUSIVE critic verdict's status line reads STATUS: INCONCLUSIVE - <!-- oracle -->;
  each full entry, after its tagged lines:
  <!-- finding: <id> -->
  Severity adopted from the critic: <N.N> (filed <N.N>)       (VERIFIED and PARTIALLY VERIFIED)
  <!-- fill -->
rebuild: an entry already filled keeps its paragraphs and its filled STATUS: line
exit: 0; 2 with one "error:" line on stderr and nothing on stdout when <ws>/run.md or the ledger is missing, or a --merge id names no finding
```

### C7 - Ledger

File: none

```
<ws>/ledger.md, one fact per line, appended, never rewritten:
  hunt: <hunt id> | wave: 1|2 | unit: U<n>|none | angle: <slug>|none
  mapper-retried
  map-appended
  scouts: S<b>[,S<b>]...
  scouts-retried
  retried: <hunt id>
  no-report: <hunt id>
  critic-retried: <hunt id>-<k>
  merge: <id>,<id>[,<id>]...
  apart: <id> <id>
  wave-offered
```

### C8 - Critic verdict and scout score files

File: none

```
<ws>/verdicts/<hunt id>-<k>.md
  VERDICT: VERIFIED | REFUTED | PARTIALLY VERIFIED | INCONCLUSIVE
  COMMAND: <the exact command or check performed>
  OBSERVED: <what was seen>
  SEVERITY: <0-10>
<ws>/scores/S<b>[-retry].md
  {"unit":"U<n>","score":<1-5>,"reason":"<at most 15 words>"}    one line per unit
```

### C9 - strip-tag.sh

File: viber/skills/code-auditor/scripts/strip-tag.sh

```
sh strip-tag.sh <file>...
a last line that is a bare closing tag (</name>, optional spaces, optional carriage return) is deleted; every other byte stays
a missing path is skipped
stdout: nothing; exit: 0
```

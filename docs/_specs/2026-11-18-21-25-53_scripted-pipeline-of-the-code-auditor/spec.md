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

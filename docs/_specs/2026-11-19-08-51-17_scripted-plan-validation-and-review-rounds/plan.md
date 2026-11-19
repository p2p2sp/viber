---
source: /Users/dario/Projects/viber/docs/_specs/2026-11-19-08-51-17_scripted-plan-validation-and-review-rounds/plan.md
planned: /Users/dario/.claude-p2p2/plans/piped-launching-tower.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Scripted plan validation and review rounds

## Goal

The planner's mechanical plan checks and the bookkeeping of its review rounds move from prose the model and its reviewers apply by hand into `plan-index.sh` and a new `review-round.sh`, both answering in directive lines. The planner and its reviewers then read fewer words on every plan, and a wrong count or a wrong round prompt stops depending on the model.

## Problem

Today the plan reviewers apply mechanical checks by hand on every review round (an input `Attachment:` line missing from the attachments map, a `## Root cause` section the input does or does not ask for, a missing `Repro:` line, a `modify` path that does not exist), and they say an unnumbered scenario is checked by `plan-index.sh`, which checks no such thing. `plan-index.sh` prints its defects as `error:` lines and hides some of them until others are fixed, so a plan can take several fix and re-run cycles. The planner composes every review prompt, aggregates the verdicts of a review set and retries a silent reviewer from a long step 3 it re-reads on every round. All of this costs tokens against the user's usage limits and gives the model chances to send a wrong prompt or a wrong verdict.

## Current behaviour

`plan-index.sh` prints each plan defect as one `error:` line on stderr, exits 3 or 4 with nothing on stdout, and skips its dependency-graph, read-after and contract file checks whenever an earlier check failed. The planner's step 3 dispatches the `dispatch:` lines of `plan-index.sh`, writes each reviewer's labelled input itself, adds every previous finding and fix from round 2 on, retries a reviewer that returned no verdict once, handles a second missing verdict as DENIED and aggregates the verdicts of a review set by hand. The four planner reviewers check the input-dependent rules and the existence of `modify` paths themselves.

### Must not change

- `hooks/scripts/plan-gate.sh` and the `VERDICT:` line each reviewer ends its reply on: the gate still reads that line from the transcript.
- The stdout of every `plan-index.sh` mode, its `review:`, `dispatch:` and `threshold:` lines and its exit codes.
- The planner reviewers stay read-only (`tools: Read, Grep, Glob`) and keep their `VERDICT:` and `FINDINGS:` output.
- `outside-plan-review` keeps its input, checks and output.

## Roadmap

Part 5 of 7 - Planner validation and review

1. Directive convention and the implementor task loop (built)
2. Implementor close (built)
3. Code auditor (built)
4. Memory and rules (built)
5. Planner validation and review (this plan)
6. Intent, fixer, e2e and the rest
   - Full payload on the `dispatch:` lines; `reach.sh` prints the impact-mapper prompt; `run:` and `settle:` fields on the branch options; `--branch` answers `next: kept`, the model editing the frontmatter.
   - `tree-record.sh --save`/`--check` in `fixer`; `app-wait.sh` only waits, the launch staying with the model; `qa-ledger.sh` with an awk ASCII table; the issue or PR argument classifier called at runtime; `summary-path.sh`, `attach-lines.sh`, `threshold:` only past the accepted count, `SAY=` for `STATUS=skip`.
7. Git, GitHub and the rest
   - `factory.sh answer`, `approve`, `reject` with `MISMATCH` falling back to keys; `verdict-nudge.sh` reads the `VERDICT:` values from the agent file; `commit.sh` runs its own self-check and prints the result line, `commit-selfcheck.sh` removed; `commit-context.sh` gives the ready footer and `RUN:`.
   - `pr-reply.sh --list`/`--all` under one confirmation, never retrying; `build_report.mjs --prompts` writes prompt files under `.temp/`; `issue-create.sh --template`; `pr-facts.sh` `TITLE=`, `TITLE_TEMPLATE=`, `FOOTER=`, `BODY_FILE=`, `SAY=`, `ASK` with `RERUN=`; `bootstrap.sh` `ASK`/`RUN`; `shell-guard.sh` returns the corrected command.
   - Every part: the directive format of part 1, a pure refactor, a word cap on the skill it touches.

## Behaviour

### S1 - A plan with defects [CHANGED - was: `error:` lines, some hidden until others were fixed]

The planner validates a plan carrying several defects at once and sees all of them in one run, each as a line telling it what to fix.

Given a plan with a duplicate file across two parallel tasks, a task past its `Files` cap and a criterion no task covers
When the planner runs `plan-index.sh` on it
Then one run prints a `FIX:` line for the shared file and the uncovered criterion and a `SPLIT:` line for the oversized task, and the planner splits that task inside the same plan before any reviewer is dispatched

### S2 - A plan checked against its intent summary [NEW]

The planner validates a plan against the summary file it was built from, and the checks that depend on that input are made by the script, not by a reviewer.

Given a summary file carrying an `Attachment:` line and a `Root cause:` line
When the planner runs `plan-index.sh` with `--input` naming that file on a plan with no attachments entry for that path and no `## Root cause` section
Then the run prints one `FIX:` line for each of the two defects

### S3 - A scenario or file map entry gone wrong [NEW]

Given a full plan whose second scenario heading reads `### Login works` and whose file map says `modify` for a path the repository does not hold
When the planner runs `plan-index.sh` on it
Then the run prints one `FIX:` line for the scenario heading and one for the file map path

### S4 - A review round [CHANGED - was: the planner composed, retried and aggregated by hand]

The planner runs `review-round.sh` and dispatches exactly the blocks it prints, then reports the verdict word of each reply and follows the one directive it gets back.

Given a plan of 20 tasks and a review round where the graph reviewer returns no verdict and every other member returns PASS
When the planner reports those verdicts
Then the script answers a redispatch of the graph reviewer alone, and on its PASS answers that the plan may leave plan mode

### S5 - A failed round and the next one [CHANGED - was: the planner composed the round 2 prompts]

Given a round where one member returned FAIL
When the planner fixes the plan, re-runs `plan-index.sh` and starts the next round
Then every member of the set is dispatched again in round 2, each block asking the planner to add every member's previous findings and its fixes

### S6 - Fewer words read per plan [CHANGED - was: longer planner and reviewer prompts]

Given the planner skill and the five plan reviewer agents
When a plan is written and reviewed
Then each of those files the model reads is shorter than before this plan, held under its word cap, and the planner's scripted rules reference states the checks the script now makes

### Edge cases

- [CHANGED - was: DENIED] A member returns no verdict twice in the same round -> it counts as FAIL with the reason "no verdict", and the round answers a fix.
- A round answered `NEXT: exit-plan` whose PASS a Minor finding overrides (a behaviour today's code has that the input never asked to change) -> the planner reports it, the round answers a fix for that member, and the next round dispatches the whole set with the previous findings.
- A plan written again after `NEXT: exit-plan` or after a user's answer -> a fresh round 1 with no previous findings.
- One member returns DENIED and another FAIL -> the round asks the user to add the permission or stop: DENIED outranks FAIL.
- A malformed task heading -> one `FIX:` line for that heading, never follow-on lines about the block's missing id or fields.
- A plan with no task blocks, or task blocks under no `## Tasks` heading -> that defect ends the run after the per-line defects, since no task check has a task to read.
- An argument error or a plan file that does not exist -> one `error:` line as today: there is nothing in the plan to fix.
- `--input` naming a file that does not exist -> `error:` line, exit 2.
- A plan with a `delete` entry validated after its build landed (`--split`) -> no file map check, since the file is gone by design.

## Glossary

- Directive - a line telling the model what to do next and exactly what to send, opening on its verb (`FIX:`, `SPLIT:`, `NEXT:`, `ASK:`, `STOP:`); an instruction to act, not a value to interpret.
- Review round - one dispatch of every reviewer a plan needs, ending when each of them holds a verdict.
- Member - one reviewer of a review round, numbered in the order the round printed it.

## Acceptance criteria

1. Every plan defect `plan-index.sh` reports is one stderr line opening on `FIX: ` followed by today's message, or on `SPLIT: ` for a task past its `Files` or `DoD` cap; the exit codes stay 3 and 4 with nothing on stdout; an argument error and a missing plan file keep their `error:` line; `commit-task.sh --leftovers` writes the first such line into its `leftover check not performed:` line.
2. One `plan-index.sh` run reports every defect the plan carries: the dependency-graph, read-after and contract file checks run whatever an earlier check found, and a malformed task or contract heading reports that heading alone, never follow-on defects of its block.
3. `plan-index.sh <plan> --input <summary file>` adds three checks: an `Attachment: <path>` line of the file whose path no attachments entry holds; a `## Root cause` section missing while the file carries a `Root cause:` line or an `Attachment:` path under `.temp/viber/code-auditor/`, or present while it carries neither; a `Repro: <path>` line of the file whose path no task's `Repro:` line holds. Each is a `FIX:` line.
4. A `### ` heading under `## Behaviour` other than `### Edge cases` and `### S<k> - <title>`, `<k>` counting the scenarios from 1 in order, is a `FIX:` line.
5. On a fresh plan, a file map line `- modify - <path>` or `- delete - <path>` naming a path the tree does not hold is a `FIX:` line.
6. `review-round.sh` prints the dispatch block of every member of a round, takes the verdict word of each reply, redispatches once a member that returned none, counts a second none as FAIL, ranks DENIED over FAIL over PASS, and answers `NEXT: fix`, `NEXT: redispatch` or `NEXT: exit-plan` (an `ASK:` on DENIED); every round after a fix dispatches the whole set, and from round 2 on each block asks for the previous findings and fixes; a PASS a Minor finding overrides turns into a fix, and a plan written after `NEXT: exit-plan` or a user's answer restarts at round 1.
7. `planner/SKILL.md` runs `plan-index.sh` with `--input` when its input is a summary file, acts on `FIX:` and `SPLIT:` lines, and in its review gate runs `review-round.sh` and follows its directives, holding no aggregation, retry or round prompt rule of its own; it stays within a word cap below its 2100 words.
8. `planner-review`, `planner-spec-review`, `planner-graph-review` and `planner-task-review` leave the input checks of criterion 3 (on an input given as a summary file) and the path check of criterion 5 to `plan-index.sh`, stay read-only, and each stays within a word cap below its count before this plan (1056, 797, 618 and 735 words).
9. `outside-plan-review` keeps its behaviour and stays within a word cap below its 490 words.
10. `plan-rules-script.md` states the scripted rules of criteria 3, 4 and 5 with their `FIX:` messages, and quotes every message it holds in its `FIX:` form.

## Scope

### File map

- modify - viber/scripts/plan-index.sh - defect lines as `FIX:`/`SPLIT:` directives, every defect in one run, the scenario, file map and `--input` checks; its header documents them
- modify - tests/viber/plan-index.test.ts - the cases of every `plan-index.sh` change
- modify - viber/scripts/commit-task.sh - `--leftovers` reads the first defect line by its new prefixes
- modify - tests/viber/commit-task.test.ts - the `--leftovers` refusal case
- add - viber/skills/planner/scripts/review-round.sh - the review round machine: dispatch blocks, verdict aggregation, retry, round state; its header defines its events and directives
- add - tests/viber/review-round.test.ts - its cases, spawning the script in a throwaway repository
- modify - viber/docs/files.md - the round state file under `.temp/viber/planner/`
- modify - viber/skills/planner/SKILL.md - acts on the directives of both scripts
- modify - viber/agents/planner-review.md, viber/agents/planner-spec-review.md, viber/agents/planner-graph-review.md, viber/agents/planner-task-review.md - the scripted checks dropped, shorter prose
- modify - viber/agents/outside-plan-review.md - shorter prose, same behaviour
- modify - viber/references/plan-rules.md - `Root cause` and `Reproduced` name the summary file case `plan-index.sh` decides
- modify - viber/references/plan-rules-script.md - the `FIX:` messages and the new scripted rules
- add - tests/viber/planner-words.unit.test.ts - the six word caps
- modify - tests/viber/plan-review-prose.unit.test.ts, tests/viber/test-pyramid-prose.unit.test.ts, tests/viber/e2e-prose.unit.test.ts, tests/viber/nudge-prose.unit.test.ts, tests/viber/impact-mapper-prose.unit.test.ts, tests/viber/root-cause-prose.unit.test.ts - the prose they pin

### Out of scope

- Part 6 - Intent, fixer, e2e and the rest: full payload on the `dispatch:` lines; `reach.sh` printing the impact-mapper prompt; `run:` and `settle:` fields on the branch options; `--branch` answering `next: kept`; `tree-record.sh` in `fixer`; `app-wait.sh`; `qa-ledger.sh`; the issue or PR argument classifier; `summary-path.sh`, `attach-lines.sh`, `threshold:` only past the accepted count, `SAY=` for `STATUS=skip`.
- Part 7 - Git, GitHub and the rest: `factory.sh answer`, `approve`, `reject`; `verdict-nudge.sh` reading the `VERDICT:` values from the agent file; `commit.sh` self-check and `commit-selfcheck.sh` removed; `commit-context.sh` footer and `RUN:`; `pr-reply.sh --list`/`--all`; `build_report.mjs --prompts`; `issue-create.sh --template`; the `pr-facts.sh` keys; `bootstrap.sh` `ASK`/`RUN`; `shell-guard.sh` returning the corrected command.
- `hooks/scripts/plan-gate.sh`, `plan-hints.sh`, `hooks.json` and `tests/viber/plan-gate.test.ts`, `plan-hints.test.ts`: the reviewer names and their `VERDICT:` reply line are unchanged, so the gate keeps its pairing and deny texts.
- `viber/scripts/run-summary.sh` and `tests/viber/run-summary.test.ts`: they count reviewer dispatches by agent name, unchanged.
- The other callers of `plan-index.sh` (`implementor/SKILL.md`, `task-step.sh`, `red-check.sh`, `archive-run.sh`, `plan-path.sh`, `final-reviewer.md`, the `final-review.true.md`, `adr.true.md` and `branching.*.md` fragments, `planner/references/adr-tasks.md`) and their tests (`task-step.test.ts`, `red-check.test.ts`, `archive-run.test.ts`, `plan-path.test.ts`): they use its stdout and exit codes, unchanged; `task-step.sh` and `red-check.sh` wrap its stderr whole under their own `error:` line.
- The prose tests on other `plan-index.sh` modes (`extras-prose`, `final-review-prose`, `lessons-prose`, `red-evidence-prose`, `resume-prose`, `repair-prose`): the text they pin is untouched.
- `tests/viber/guard-prose.unit.test.ts`: it pins the interpreter wording of the `Provable` rules of `plan-rules-script.md` and `plan-rules.md`, which T1, T10 and T11 keep.
- `rule-budget.unit.test.ts`: its caps stay; the tasks growing a file it measures run it.
- `viber/.claude-plugin/plugin.json`, `help.html`, the two flow SVGs, the root `README.md`, `viber/README.md`, `viber/docs/configuration.md`, `docs/viber-functions.html`: they name the reviewers and the gate, whose names and roles are unchanged.
- `tests/viber/replay/plan-review/`: a by-hand replay kit of recorded plans and findings, which no test reads; it keeps the messages as recorded, and a recorded plan may now fail the scenario or file map check, so the claim of `tests/viber/CLAUDE.md` that each passes `plan-index.sh` is the memory step's to correct.
- `viber/skills/planner/references/adr-tasks.md`: it copies "the input block of the review dispatch", which the blocks of `review-round.sh` still carry (an `input:` line naming the summary file, or the text the model adds on `add: input`).
- `tests/viber/root-cause-prose.unit.test.ts` other than the one test T10 renames: the templates' `## Root cause` and its single `(review)` bullet stay.
- Every `CLAUDE.md` node and the section files `viber/scripts/CLAUDE.run-scripts.md` and `viber/scripts/CLAUDE.close-scripts.md` (the latter describing the `leftover check not performed:` line) naming `plan-index.sh`, the planner, its reviewers or `commit-task.sh --leftovers`: the build's memory step updates them.
- The `.claude/rules/` files citing a `plan-index.sh` line number or the planner reviewers (`shell-awk-quoting.md`, `shell-path-strip.md`, `shell-script-header.md`, `shell-preload-contract.md`, `agent-frontmatter.md`, `review-findings.md`, `viber/agent-review-color.md`): the reviewers keep their tools, color and severity levels; a line number the edits move is corrected by the build's rules step.
- `tests/portability.unit.test.ts`: its sweep reaches the new script by itself.

## Solution requirements

- Pure refactor of the planner's outcome: the same plan passes or fails review as before; only where a check runs and how a defect is printed change.
- Every script works on Windows (Git Bash) and macOS: bash 3.2 safe (`${arr[@]+"${arr[@]}"}`), a value reaches awk through `ENVIRON`, no apostrophe inside a single-quoted awk block, no heredoc.
- `review-round.sh` opens on the header and `Contract:` block of the host's script rule, ships mode 100755 (`git update-index --add --chmod=+x`), takes no free text in its arguments and exits 2 with an empty stdout on misuse: one `error:` line, followed by the stderr lines of `plan-index.sh` when it refused the plan.
- A shell script is proven by its own `tests/viber/<script>.test.ts`, which spawns it in a throwaway directory: the host's only test layer for a shell script, run by naming that one file. The word caps are a `*.unit.test.ts`.
- The files of a task that grows a file `rule-budget.unit.test.ts` measures keep it green: the planner read set holds 46236 of its 46609 bytes before this plan, so the new scripted rules land in `plan-rules-script.md` only after `planner/SKILL.md` has shrunk.

## Tasks

<!-- TASK -->
### T1 - Print plan defects as FIX and SPLIT directive lines
- TDD: required
- Covers: AC1
- Uses: C1
- Depends-on: none
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts, viber/scripts/commit-task.sh, tests/viber/commit-task.test.ts, viber/references/plan-rules-script.md, tests/viber/plan-review-prose.unit.test.ts, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: `plan-index.sh` printing each plan defect as a C1 line, its header saying so; `commit-task.sh --leftovers` carrying the first such line; `plan-rules-script.md` quoting every message in its `FIX:` form
- Verification: node --test tests/viber/plan-index.test.ts tests/viber/commit-task.test.ts tests/viber/plan-review-prose.unit.test.ts tests/viber/test-pyramid-prose.unit.test.ts -> every case passes
- DoD: every plan defect of the validate, `--split`, `--extra`, `--dispatch`, `--slice` and `--final-review` modes prints as a `FIX:` line, exit 3 or 4 and empty stdout unchanged; a task past its `Files` or `DoD` cap prints a `SPLIT:` line instead; an argument error and a missing plan file still print their `error:` line with exit 2; `commit-task.sh --leftovers` on a plan `plan-index.sh` refuses writes `leftover check not performed: ` followed by the first `FIX:`, `SPLIT:` or `error:` line; `plan-rules-script.md` quotes each message it holds with the `FIX:` prefix and no `error:` prefix
<!-- /TASK -->

<!-- TASK -->
### T2 - Report every plan defect in one run
- TDD: required
- Covers: AC2
- Uses: C1
- Depends-on: T1
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: the validator running its dependency-graph, read-after and contract file checks whatever an earlier check found, and skipping the follow-on checks of a block whose heading is malformed
- Verification: node --test tests/viber/plan-index.test.ts -> every case passes
- DoD: a plan with a malformed `Files` entry in one task and two parallel tasks sharing a file prints both `FIX:` lines in one run; a plan with an uncovered criterion and a consumer ordered beside its contract writer prints both `FIX:` lines in one run; a plan with a redundant `Depends-on` entry and a read-after defect prints both in one run; a malformed task heading prints only its heading line for that block; a malformed contract heading prints only its heading line for that block; a plan with an unfilled template slot and no task blocks prints the slot's `FIX:` line, then the no-task-blocks `FIX:` line, exit 3, and one with an unfilled slot and task blocks under no `## Tasks` heading prints the slot's line, then the missing heading's `FIX:` line, exit 4
<!-- /TASK -->

<!-- TASK -->
### T3 - Reject an unnumbered scenario heading
- TDD: required
- Covers: AC4
- Uses: C1, C3
- Depends-on: T2
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: the Scenarios check of C3 on a plan carrying `## Behaviour`, documented in the header
- Verification: node --test tests/viber/plan-index.test.ts -> every case passes
- DoD: a `### ` heading under `## Behaviour` that is neither `### Edge cases` nor `### S<k> - <title>` prints the Scenarios `FIX:` line of C3; a scenario numbered out of order (`### S1`, then `### S3`) prints it for the second heading; `### S1 - ...`, `### S2 - ...` and `### Edge cases` print nothing; a `### ` heading inside a fenced block under `## Behaviour` prints nothing; a plan with no `## Behaviour` section prints nothing for this check
<!-- /TASK -->

<!-- TASK -->
### T4 - Reject a file map path the tree does not hold
- TDD: required
- Covers: AC5
- Uses: C1, C3
- Depends-on: T3
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: the File map check of C3 on a fresh plan, documented in the header
- Verification: node --test tests/viber/plan-index.test.ts -> every case passes
- DoD: a `- modify - <path> - ...` line whose path the tree does not hold prints the File map `FIX:` line of C3; a `- delete - <path> - ...` line likewise; an `add` line, and a `modify` line whose path the tree holds, print nothing; a file map line listing several comma-separated paths is checked path by path; a plan validated under `--split`, or with a `status.md` beside it, prints nothing for this check (it joins the fresh-plan-only checks)
<!-- /TASK -->

<!-- TASK -->
### T5 - Check a plan against its intent summary file
- TDD: required
- Covers: AC3
- Uses: C1, C3
- Depends-on: T4
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: the `--input <summary file>` option of the validate mode and its three checks of C3, documented in the header
- Verification: node --test tests/viber/plan-index.test.ts -> every case passes
- DoD: an `Attachment: <path>` line of the input whose path no `attachments:` entry holds prints the input Attachments `FIX:` line; an input carrying a `Root cause:` line, or an `Attachment:` path under `.temp/viber/code-auditor/`, on a plan with no `## Root cause` section prints the missing Root cause line, and an input with neither on a plan holding the section prints the extra Root cause line; a `Repro: <path>` line of the input whose path no task's `Repro:` holds prints the input Reproduced line; `--input` naming a missing file exits 2 with one `error:` line; a plan validated without `--input` runs none of the three checks; `--input` beside `--split`, `--extra`, `--dispatch`, `--slice` or `--final-review` exits 2 with one `error: --input cannot be combined with ...` line
<!-- /TASK -->

<!-- TASK -->
### T6 - Print the dispatch blocks of a review round
- TDD: required
- Covers: AC6
- Uses: C2
- Depends-on: T5
- Files: viber/skills/planner/scripts/review-round.sh, tests/viber/review-round.test.ts, viber/docs/files.md
- Delivers: `review-round.sh` with its `start` event per C2, mode 100755, its header defining every event and directive of C2; `docs/files.md` naming its state file. Its test plans are lite plans with no `## Behaviour` section and only `add` file map lines, so they pass `plan-index.sh` before and after T1 to T5.
- Verification: node --test tests/viber/review-round.test.ts -> every case passes
- DoD: `start` on a plan of 12 tasks or fewer prints one `planner-review` block, and on a larger plan one block per `dispatch:` line of `plan-index.sh`, each carrying the body lines and `add:` fields C2 gives its agent; `start --input <summary file>` puts that path on the `input:` line and drops `add: input`; `start` with no state, a state of another plan or `--fresh` prints round 1 with no `add: previous`; `start` without `--fresh` on a round with no `returned` yet exits 2 with one `error:` line naming `--fresh`; `start` on a plan `plan-index.sh` refuses exits 2 with an empty stdout and its `error:` line followed by the refusal lines, the test comparing them with the stderr `plan-index.sh` itself prints for the same plan, never with a fixed prefix; an unknown event exits 2 with one `error:` line and an empty stdout
<!-- /TASK -->

<!-- TASK -->
### T7 - Rank the verdicts of a review round
- TDD: required
- Covers: AC6
- Uses: C2
- Depends-on: T6
- Files: viber/skills/planner/scripts/review-round.sh, tests/viber/review-round.test.ts
- Delivers: the `returned` event of C2
- Verification: node --test tests/viber/review-round.test.ts -> every case passes
- DoD: `returned` with an awaited member reported `none`, or not named, for the first time in the round prints `NEXT: redispatch` naming it, then its block again, and a second `none` of that member counts as FAIL named on `no-verdict:`; on a set round where `returned` gives member 2 `none` and the others PASS, a following `returned 2=PASS` naming member 2 alone prints `NEXT: exit-plan`, every member already holding a verdict keeping it; `returned` once every member holds a verdict prints `ASK:` when any is DENIED, else `NEXT: fix` naming the FAIL members when any failed, else `NEXT: exit-plan`; a verdict word outside `PASS`, `FAIL`, `DENIED` and `none`, a member number the round does not hold, and `returned` before any `start` or with no member awaiting a verdict each exit 2 with one `error:` line and an empty stdout
<!-- /TASK -->

<!-- TASK -->
### T8 - Move a review round on to its next step
- TDD: required
- Covers: AC6
- Uses: C2
- Depends-on: T7
- Files: viber/skills/planner/scripts/review-round.sh, tests/viber/review-round.test.ts
- Delivers: the `retry-denied`, `override` and `stop` events of C2 and `start` after a round's answer
- Verification: node --test tests/viber/review-round.test.ts -> every case passes
- DoD: `retry-denied` after `ASK:` prints `NEXT: redispatch` and the blocks of the DENIED members, and `stop` prints the `STOP:` line; `override <k>[,<k>]` after `NEXT: exit-plan` prints `NEXT: fix` naming those members; `start` after `NEXT: fix`, whether `returned` or `override` printed it, prints every member at the next round number with `add: previous`; `start` without `--fresh` after `NEXT: exit-plan`, `ASK:` or an open `NEXT: redispatch` exits 2 with one `error:` line naming `--fresh`, and `start --fresh` there prints round 1; `override` after any answer but `NEXT: exit-plan` exits 2 with one `error:` line and an empty stdout
<!-- /TASK -->

<!-- TASK -->
### T9 - Drive the planner from the directives of both scripts
- TDD: required
- Covers: AC7
- Uses: C1, C2
- Depends-on: T8
- Files: viber/skills/planner/SKILL.md, viber/skills/planner/fragments/branching-fix.allowed.md, viber/skills/planner/fragments/branching-fix.required.md, tests/viber/planner-words.unit.test.ts, tests/viber/plan-review-prose.unit.test.ts, tests/viber/nudge-prose.unit.test.ts, tests/viber/impact-mapper-prose.unit.test.ts, tests/viber/e2e-prose.unit.test.ts, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: `planner/SKILL.md` running `plan-index.sh` with `--input` on a summary file input and acting on its `FIX:` and `SPLIT:` lines, and a review gate that runs `review-round.sh` and follows each directive of C2; `allowed-tools` naming `${CLAUDE_SKILL_DIR}/scripts/review-round.sh`; the two `branching-fix` fragments opening on a fix after `NEXT: fix`
- Verification: node --test tests/viber/planner-words.unit.test.ts tests/viber/plan-review-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts tests/viber/impact-mapper-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts -> every case passes
- DoD: every `plan-index.sh` run of steps 2, 3 and 4 carries `--input "<summary file>"` when the input is a summary file, and step 2 names the `review-round.sh` state write under `.temp/viber/planner/` as expected in plan mode beside the `reach.sh` one, and fixes every `FIX:` line and splits every task a `SPLIT:` line names before re-running it; step 3 runs `review-round.sh` `start` (with `--input` on a summary file input, `--fresh` after a user's answer and after any plan write following `NEXT: exit-plan`), dispatches its blocks in one message adding each `add:` field, reports each reply's verdict word through `returned` and acts on `NEXT: fix`, `NEXT: redispatch`, `NEXT: exit-plan`, `ASK:` and `STOP:`; a Minor finding of a PASS showing a behaviour today's code has that the input never asked to change is reported through `override <k>`, and step 4's re-review after a later write runs `start --fresh`; step 3 holds no verdict ranking, no retry count and no round 2 prompt rule of its own, and keeps its sentence forbidding a `SendMessage` to an earlier reviewer; both `branching-fix` fragments open on "After a `NEXT: fix` fix"; `allowed-tools` names `review-round.sh`, `SKILL.md` stays within a cap of 1800 words, asserted below its 2100 words, and the planner read set stays within its `rule-budget.unit.test.ts` cap
<!-- /TASK -->

<!-- TASK -->
### T10 - Leave the scripted checks out of the plan reviewers
- TDD: required
- Covers: AC8, AC9
- Uses: C3
- Depends-on: T9
- Files: viber/agents/planner-review.md, viber/agents/planner-spec-review.md, viber/agents/planner-graph-review.md, viber/agents/planner-task-review.md, viber/agents/outside-plan-review.md, viber/references/plan-rules.md, tests/viber/planner-words.unit.test.ts, tests/viber/plan-review-prose.unit.test.ts, tests/viber/e2e-prose.unit.test.ts, tests/viber/test-pyramid-prose.unit.test.ts, tests/viber/root-cause-prose.unit.test.ts
- Delivers: the four planner reviewers leaving the input checks (on a summary file input) and the `modify`/`delete` path check to `plan-index.sh`, every reviewer and `outside-plan-review` shortened under its cap, `plan-rules.md`'s `Root cause` and `Reproduced` naming the summary file case `plan-index.sh --input` decides, and the root cause prose test named for the review half it still pins
- Verification: node --test tests/viber/planner-words.unit.test.ts tests/viber/plan-review-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/test-pyramid-prose.unit.test.ts tests/viber/root-cause-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts -> every case passes
- DoD: the Faithful check of `planner-review` and `planner-spec-review` gates the `Attachment:` line only on an input given as text, and the Grounded check of `planner-review` and `planner-task-review` leaves a `modify` or `delete` path the tree lacks to `plan-index.sh`; `plan-rules.md`'s `Root cause` and `Reproduced` rules each say `plan-index.sh --input` decides the case of an input given as a summary file, each staying one `(review)` bullet, and no test name of `root-cause-prose.unit.test.ts` says no script checks the section; every reviewer keeps `tools: Read, Grep, Glob` and its `VERDICT:`/`FINDINGS:` output; `planner-review.md`, `planner-spec-review.md`, `planner-graph-review.md` and `planner-task-review.md` stay within caps of 1000, 760, 600 and 700 words, and `outside-plan-review.md` within 470 words, each cap asserted below 1056, 797, 618, 735 and 490; the planner and planner-review read sets both stay within their `rule-budget.unit.test.ts` caps
<!-- /TASK -->

<!-- TASK -->
### T11 - State the new scripted rules in plan-rules-script
- TDD: none
- Covers: AC10
- Uses: C3
- Depends-on: T10
- Files: viber/references/plan-rules-script.md, tests/viber/plan-review-prose.unit.test.ts
- Delivers: in the `## Spec` section of `plan-rules-script.md`, a Scenarios rule, a File map rule and an Input rule (the Root cause and Reproduced input checks), and the input `Attachment:` check added to the Attachments rule, each tagged `(script)` and quoting its `FIX:` message from C3; the `## Spec` rule name list `plan-review-prose.unit.test.ts` pins
- Verification: node --test tests/viber/plan-review-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts && grep -c -F "(Scenarios)" viber/scripts/plan-index.sh viber/references/plan-rules-script.md && grep -c -F "(File map)" viber/scripts/plan-index.sh viber/references/plan-rules-script.md && grep -c -F "input: Attachment" viber/scripts/plan-index.sh viber/references/plan-rules-script.md && grep -c -F "(Root cause)" viber/scripts/plan-index.sh viber/references/plan-rules-script.md && grep -c -F "input: Repro" viber/scripts/plan-index.sh viber/references/plan-rules-script.md -> every case passes and each of the five greps prints a count of at least 1 for both files
- DoD: the `## Spec` section of `plan-rules-script.md` holds a Scenarios rule and a File map rule, each quoting its C3 `FIX:` message; the Attachments rule names the input `Attachment:` check with its C3 message; an Input rule in `## Spec` names the Root cause and Reproduced input checks with their three C3 messages; every rule of the file still ends in `(script)`; the planner read set stays within its `rule-budget.unit.test.ts` cap
<!-- /TASK -->

## Contracts

### C1 - plan-index.sh defect lines

File: viber/scripts/plan-index.sh

```
stderr, one line per plan defect, exit 3 (no task blocks) or 4 (any other), stdout empty:
  FIX: <today's message after its "error: " prefix, unchanged>
  SPLIT: task <id>: <n> Files, past the <max> a TDD: <tdd> task may hold - split it, one behaviour per task
  SPLIT: task <id>: <n> DoD clauses, past the <max> a TDD: <tdd> task may hold - split it, one behaviour per task; clauses are cut at each semicolon outside backticks, so a semicolon inside a list cuts a clause
argument error or missing plan or input file, exit 2:
  error: <message>
```

### C2 - review-round.sh events and directives

File: viber/skills/planner/scripts/review-round.sh

```
review-round.sh <plan> start [--input <summary file>] [--fresh]
review-round.sh <plan> returned <k>=<PASS|FAIL|DENIED|none> [<k>=<word>]...
review-round.sh <plan> retry-denied
review-round.sh <plan> override <k>[,<k>]
review-round.sh <plan> stop

state: <repository root>/.temp/viber/planner/review-round, for one plan path: the round
number, its members, each member's verdict and none count, the last answer printed
start: runs <plugin root>/scripts/plan-index.sh "<plan>"; its refusal -> exit 2,
  "error: plan-index.sh refused the plan" then its stderr lines
  round 1, no add: previous     --fresh, no state, or a state of another plan path
  round r+1, add: previous      the last answer was NEXT: fix
  exit 2, "error: round <r> is not closed on NEXT: fix - run start --fresh"   any other state

block, one per member in dispatch: line order, members numbered from 1:
  NEXT: review | member: <k> | agent: viber:<name> | round: <r>[ | add: input][ | add: answered][ | add: previous]
  plan: <plan>
  refs: <plugin root>/references
  memory: <config.sh build.memory value>   planner-review, planner-graph-review, planner-task-review
  input: <summary file>                    planner-review, planner-spec-review, with --input
  tasks: T<a>-T<b>                         planner-task-review, its dispatch: slice
add: input     planner-review, planner-spec-review, without --input: append "input:" and the
               confirmed summary or fixer diagnosis verbatim
add: answered  planner-review, planner-spec-review: append one "Answered: <decision> -> <option>"
               per user answer, none when none
add: previous  round 2 on: append a "previous findings:" line, then every member's previous findings verbatim and one
               "fix: <line>" per fix applied

prompt of a dispatch: the block's lines below its NEXT: line, then the add: texts; the NEXT:
line itself is never sent
returned (an awaited member - one of the last dispatch still without a verdict - not named
counts as none; a member already holding a verdict keeps it):
  NEXT: redispatch | members: <k>[,<k>]   then those blocks again, same round: a member at its
                                          first none of the round
  (a second none of a member counts as FAIL, "no verdict")
  once every member holds a verdict, the first that applies:
  ASK: permission added -> retry-denied | stop -> stop     any DENIED
  NEXT: fix | members: <k>[,<k>][ | no-verdict: <k>[,<k>]] any FAIL
  NEXT: exit-plan                                          every member PASS
retry-denied: NEXT: redispatch | members: <the DENIED ones>, then their blocks
override <k>[,<k>]: only after NEXT: exit-plan: those members count as FAIL -> NEXT: fix | members: <k>[,<k>]
stop: STOP: the plan stays unreviewed - no hand-off
misuse (unknown event, other verdict word, unknown member, returned before start or with no
  member awaiting a verdict, override after another answer): exit 2, one "error: <message>" line, stdout empty
```

### C3 - plan-index.sh scenario, file map and input checks

File: viber/scripts/plan-index.sh

```
FIX: line <n>: scenario heading "<heading>" must be "### S<k> - <title>", the <k>th scenario in order - number it (Scenarios)
FIX: file map: <modify|delete> <path>, which the tree does not hold - correct the path or list it as add (File map)
FIX: input: Attachment <path> has no entry in the attachments map - add one (Attachments)
FIX: input gives a root cause but the plan has no "## Root cause" section - add it (Root cause)
FIX: the plan carries a "## Root cause" section its input gives no cause for - drop it (Root cause)
FIX: input: Repro <path> is on no task Repro: line - put it on the fixing task (Reproduced)

plan-index.sh <plan> --input <summary file>   validate mode only; the file is read as text, its
lines "Attachment: <path>", "Root cause: ..." and "Repro: <path>" at line start
```

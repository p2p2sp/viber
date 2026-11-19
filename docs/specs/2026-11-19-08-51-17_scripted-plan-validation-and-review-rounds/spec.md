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
- A plan written again after `NEXT: exit-plan` (except the fix of an `override`, which runs plain `start`) or after a user's answer -> a fresh round 1 with no previous findings.
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

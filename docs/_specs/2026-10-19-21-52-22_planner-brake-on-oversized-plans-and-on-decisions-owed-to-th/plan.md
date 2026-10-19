---
source: /Users/dario/Projects/p2p2.claude/docs/_specs/2026-10-19-21-52-22_planner-brake-on-oversized-plans-and-on-decisions-owed-to-th/plan.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Planner brake on oversized plans and on decisions owed to the user

## Goal

The planner stops and asks the user when its plan grows past 30 tasks, offering a split that the intent interview carries out from the planner's own proposal. It also asks the user every decision its exploration reveals that belongs to the user, instead of settling it alone, and the plan reviewer blocks a plan that settles behaviour nobody decided.

## Problem

`viber:intent` sizes the scope by eye against its 30-task threshold, and `viber:planner` is barred from sizing, so a scope estimated at 20 tasks silently becomes a 50-task plan. The planner's exploration also finds facts that change behaviour, scope, criteria or constraints and decides them itself, so the user is never interviewed on them. The cost: plans too big for one build, and behaviour the user never chose.

## Current behaviour

The planner never sizes the scope and has no task ceiling: it writes whatever count its tasks reach. It asks the user only when a review finding needs a decision only the user can make. The plan reviewer blocks a criterion, boundary or constraint added beyond the interview, but not behaviour settled in scenarios or edge cases. A plan built from an interview summary carries no root cause, since the plan rules require one only for a `viber:fixer` diagnosis or code-auditor findings.

### Must not change

- `intent`'s own 30-task split threshold, its split flow for a scope it sizes itself, and its fast path.
- The plan gate: `ExitPlanMode` only after a PASS from a review dispatched after the last plan write, every round a new dispatch, never a `SendMessage` to an earlier reviewer.
- `planner-review`'s input labels (`refs:`, `memory:`, `input:`, `scope: spec`).

## Behaviour

### S1 - Plan expected past the threshold [NEW]

Given a confirmed interview or diagnosis whose file map the planner expects to need more than 30 tasks
When the planner finishes its file map
Then it asks the user, before writing any task, whether to split the change into parts or keep one plan of that size

### S2 - User chooses to split [NEW]

Given the threshold question
When the user chooses to split
Then the interview starts again on its own, showing the planner's proposed parts for the user to accept or correct, interviews the parts, and hands the first one back to the planner, keeping the run's issue, attachments and branch as already settled, never re-settling the branch and never saving an issue

### S3 - Written plan past the threshold [NEW]

Given a written plan holding more than 30 tasks, and more than any count the user already accepted
When the planner validates it
Then it asks the same question before the review

### S4 - User keeps one plan [NEW]

Given the threshold question
When the user keeps one plan
Then the planner goes on, and asks again only when the exact count grows past the count the user accepted

### S5 - Exploration reveals a decision owed to the user [NEW]

Given a file map whose exploration shows a choice of behaviour, scope, an acceptance criterion or a constraint the input leaves open
When the plan stays one plan
Then the planner asks each such decision on its own, three options with its recommendation first, the next one only after the previous answer, and the reviewer counts every answer the user gave the planner, a review finding's included, as part of the input

### S6 - Reviewer finds behaviour nobody decided [CHANGED - was: only criteria, boundaries and constraints added beyond the input were blocked]

Given a plan with a scenario or an edge case whose outcome neither the input nor the user's answers settle, nor follows from them
When the reviewer checks the plan
Then it blocks the plan

### S7 - Split of a fixer diagnosis [NEW]

Given a `viber:fixer` diagnosis the user chooses to split
When the interview proposes the parts
Then the fix of the defect lands in the first part, whose plan alone carries the root cause and the reproduction test; later parts carry neither

### Edge cases

- Over the threshold and decisions owed to the user at once -> the threshold question first; on split, the interview asks those decisions in the parts they belong to; on one plan, the planner asks them.
- A roadmap part past the threshold -> the same question; on split, that part's entry in the roadmap is replaced by the proposed parts in its place, every other entry unchanged, and the first new part takes over the replaced entry's issue.
- A draft round -> only the file map check runs: a draft writes no task.
- A purely implementation choice (a file, a helper, a structure) -> the planner decides it and asks nothing.

## Glossary

- Threshold check - the planner's comparison of its task count against 30 and against the count the user accepted; it is not sizing, which stays the interview's.
- Split proposal - the planner's suggested cut into parts, built from its file map, that the interview starts its split from.
- Decision owed to the user - a choice of observable behaviour, scope, an acceptance criterion or a constraint the input leaves open; never an implementation choice.

## Acceptance criteria

1. The planner checks the 30-task threshold twice: after the file map, on its estimate, before writing any task; and on the written plan, on the task row count of `plan-index.sh` output.
2. Over the threshold the planner asks through one `AskUserQuestion`: split, or keep one plan of N tasks. On split it invokes `viber:intent` with the confirmed input verbatim and a split proposal (parts, the files of each, estimated task count), and `intent` starts `split.md` from that proposal.
3. After "keep one plan", a later check asks again only when the exact count exceeds the count the user accepted; the check applies the same to a `viber:fixer` input and to a roadmap part, whose split replaces that part's roadmap entry with the proposed parts.
4. The planner asks each decision owed to the user that its exploration reveals right after the file map, one `AskUserQuestion` per decision, 3 options with the recommendation first, each only after the previous answer, after the threshold question; on split those decisions travel to `intent`, which asks them. Every answer the user gives the planner, a review finding's included, reaches `planner-review` as an `Answered:` line. Implementation choices stay with the planner.
5. `planner-review`'s Faithful rule, extended in its own sentence, makes a scenario or edge case whose outcome neither the input nor an `Answered:` line settles, nor follows from them, a Blocking finding.
6. `README.md` and `help.html` (`en` and `pl`) describe the threshold question and the questions on decisions owed to the user.
7. A split `viber:fixer` diagnosis keeps the fix in the first part, whose summary alone carries a `Root cause:` and a `Repro:` line, and `plan-rules.md`'s Root cause rule accepts an input carrying a `Root cause:` line.
8. `intent` invoked with a split proposal keeps the input's `Issue:`, `Attachment:`, `Work:` and `Branch:` lines unchanged, skips the branch start step and saves no issue or sub-issue.

## Scope

### File map

- modify - viber/skills/planner/SKILL.md - the threshold check, the split hand-off to `intent`, the questions on decisions owed to the user, the `Answered:` lines of the review dispatch
- modify - viber/skills/intent/SKILL.md - an input carrying a split proposal: its lines kept, the start step and issue saves skipped, sizing taken from the proposal; a diagnosis's lines carried into the first part's summary
- modify - viber/skills/intent/references/split.md - proposing a received split as drafted, its open decisions asked in their parts, a roadmap part's entry replaced, a fixer fix kept in the first part
- modify - viber/agents/planner-review.md - the `Answered:` lines of `input:` and the extended Faithful rule
- modify - viber/references/plan-rules.md - the Root cause rule accepting an input carrying a `Root cause:` line
- modify - viber/skills/planner/templates/spec-full.md - the `## Root cause` template comment naming that input
- modify - viber/skills/planner/templates/spec-lite.md - the same comment
- modify - viber/README.md - the threshold question and the planner's questions
- modify - viber/skills/setup/assets/help.html - the `planner` card, the `intent` card and the split line of the run overview, `en` and `pl`

### Out of scope

- A reach scan in `intent`, a new agent, an `Estimate:` line, changes to `intent`'s fast path and its 30-task threshold.
- `viber/docs/configuration.md` and `viber/docs/files.md`: no key and no host write changes, and neither describes the planner's flow (decided with the user).
- `viber/skills/intent/fragments/branching-start.*.md`, `branching-handoff.*.md`, `issues-input.true.md`, `issues-done.true.md`: unchanged; the `intent/SKILL.md` sentence for a split proposal input sets them aside for that input.
- `hooks/scripts/plan-gate.sh`: the `Answered:` lines live inside `input:`, so no dispatch label changes.
- `viber/agents/memory-writer.md`: it reads the plan's `## Root cause` as today.
- `tests/viber/root-cause-prose.unit.test.ts`: unchanged; the extended Root cause bullet and template comments keep every phrase it pins.
- `viber/agents/plain-plan-review.md`: plain plan mode has no planner.
- The `CLAUDE.md` nodes (`viber/skills/CLAUDE.md` hand-off lines): `build.memory` is on, the close updates them.

## Solution requirements

- skill-designer doctrine for every skill and agent edit; a new requirement that varies an existing rule extends that rule's own sentence.
- Least tokens: no new reference file, every addition in the step that uses it.
- No em dash and no en dash anywhere.
- Every plugin script keeps working on Windows (Git Bash) and macOS: no script changes, and `tests/portability.unit.test.ts` stays green.

## Tasks

<!-- TASK -->
### T1 - Stop the planner at 30 tasks and offer a split
- TDD: none
- Covers: AC1, AC2, AC3
- Uses: C1
- Depends-on: none
- Files: viber/skills/planner/SKILL.md
- Delivers: the input sentence limiting "Never size the scope yourself" to sizing, not the threshold check; step 1 closing on the threshold check of the file map estimate with its split or keep question and, on split, the `viber:intent` invocation carrying the input verbatim and a C1 block; step 2 re-running the check on the task rows of `plan-index.sh` output against the accepted count
- Verification: `grep -n "tasks:" viber/scripts/plan-index.sh viber/skills/planner/SKILL.md` -> a line in each file; `grep -n "Split proposal:\|more than 30 tasks" viber/skills/planner/SKILL.md` -> both phrases present; `node --test tests/viber/nudge-prose.unit.test.ts tests/portability.unit.test.ts` -> pass
- DoD: step 1 compares the file map estimate with more than 30 tasks before any task is written and asks split or keep one plan through one `AskUserQuestion`; on split it invokes `viber:intent` with the input verbatim and a `Split proposal:` block ordering a `viber:fixer` fix first, and writes no plan; on keep it records the accepted count; step 2 counts the rows under the `tasks:` header of `plan-index.sh` output and asks again only above 30 and above the accepted count, never on a draft; the sentence "never a `SendMessage` to an earlier reviewer" stays verbatim
<!-- /TASK -->

<!-- TASK -->
### T2 - Make the planner ask decisions owed to the user
- TDD: none
- Covers: AC4
- Uses: C1, C2
- Depends-on: T1
- Files: viber/skills/planner/SKILL.md
- Delivers: step 1 asking, after the threshold question and only on one plan, each decision owed to the user its exploration reveals, with implementation choices excluded; on split those decisions travelling as the C1 block's `Open decisions:`; step 3's `input:` carrying a C2 line after the summary for every answer the user gave the planner, a FAIL finding's included
- Verification: `grep -n "Answered:\|Open decisions:" viber/skills/planner/SKILL.md` -> both labels present; `grep -n "VERDICT: FAIL" viber/skills/planner/SKILL.md viber/agents/planner-review.md` -> lines in both files; `node --test tests/viber/nudge-prose.unit.test.ts` -> pass
- DoD: step 1 asks each decision owed to the user through its own `AskUserQuestion`, 3 options, recommendation first, one at a time, after the threshold question; a split puts those decisions under `Open decisions:` and asks none of them; an implementation choice is never asked; step 3 passes each answer from step 1 and from a `VERDICT: FAIL` finding as an `Answered:` line inside `input:`
<!-- /TASK -->

<!-- TASK -->
### T3 - Let intent start a split from the planner's proposal
- TDD: none
- Covers: AC2, AC3, AC4, AC7, AC8
- Uses: C1, C3
- Depends-on: none
- Files: viber/skills/intent/SKILL.md, viber/skills/intent/references/split.md
- Delivers: `intent/SKILL.md` setting aside, for an input carrying a C1 block, the branch start step and every issue save while keeping its `Issue:`, `Attachment:`, `Work:` and `Branch:` lines for the hand-off, and sending it to `split.md` with no sizing of its own; `split.md` proposing that split as drafted, asking each open decision in its part, replacing a roadmap part's entry with the proposed parts, and keeping a `viber:fixer` fix in the first part, whose summary alone carries the C3 lines
- Verification: `grep -n "Split proposal:" viber/skills/intent/SKILL.md viber/skills/intent/references/split.md` -> a line in each file; `grep -n "Reproduction test" viber/skills/fixer/SKILL.md` and `grep -n "Repro:" viber/skills/intent/references/split.md` -> a line each; `node --test tests/portability.unit.test.ts` -> pass
- DoD: an input carrying a `Split proposal:` block runs no branch start step and none of the `issues-done` steps (no save, no comment, no "what next" question), and hands off its `Issue:`, `Attachment:`, `Work:` and `Branch:` lines and its run branch line unchanged; it goes to `split.md` without `intent` estimating the scope, never to the fast path; `split.md` shows that proposal for `Accept` or `Correct` instead of drafting one; each `Open decisions:` entry is asked in the interview of its part; a proposal for a roadmap part replaces that part's entry in place, other entries and their `(built)` markers unchanged, the replaced entry's `Issue:` line moving to the first new part; the part-1 summary of that split carries the whole rewritten roadmap and no `Roadmap:` line, so the planner fills `## Roadmap` from the summary; a split `viber:fixer` diagnosis keeps the fix in part 1, whose summary alone carries one `Root cause:` and one `Repro:` line
<!-- /TASK -->

<!-- TASK -->
### T4 - Make planner-review block behaviour nobody decided
- TDD: none
- Covers: AC4, AC5
- Uses: C2
- Depends-on: T2
- Files: viber/agents/planner-review.md
- Delivers: the `## Input` description of `input:` naming the C2 lines that may follow the summary; the Faithful sentence extended in place to count an `Answered:` line as input and to a scenario or edge case whose outcome neither the input nor an `Answered:` line settles, nor follows from them
- Verification: `grep -n "Answered:" viber/agents/planner-review.md viber/skills/planner/SKILL.md` -> lines in both files, two in `planner-review.md` (under `## Input` and in the Faithful bullet)
- DoD: `## Input` states that `input:` may end with `Answered: <decision> -> <chosen option>` lines; Faithful stays one bullet and treats what an `Answered:` line settles as part of the input; Faithful makes a scenario or edge case whose outcome neither the input nor an `Answered:` line settles, nor follows from them, a Blocking finding
<!-- /TASK -->

<!-- TASK -->
### T5 - Keep the root cause of a split fixer diagnosis
- TDD: none
- Covers: AC7
- Uses: C3
- Depends-on: none
- Files: viber/references/plan-rules.md, viber/skills/planner/templates/spec-full.md, viber/skills/planner/templates/spec-lite.md
- Delivers: the Root cause rule of `plan-rules.md` and the `## Root cause` comment of both templates extended in their own sentences to an input carrying a `Root cause:` line
- Verification: `grep -n "a \`Root cause:\` line" viber/references/plan-rules.md viber/skills/planner/templates/spec-full.md viber/skills/planner/templates/spec-lite.md` -> a line in each file; `node --test tests/viber/root-cause-prose.unit.test.ts` -> pass
- DoD: the Root cause rule stays one bullet and requires `## Root cause` for an input carrying a `Root cause:` line, stating the cause that line names; the spec-full comment names that input beside the `viber:fixer` diagnosis and code-auditor findings; the spec-lite comment names it the same way
<!-- /TASK -->

<!-- TASK -->
### T6 - Describe the planner's questions in the user docs
- TDD: none
- Covers: AC6
- Uses: none
- Depends-on: T2, T3
- Files: viber/README.md, viber/skills/setup/assets/help.html
- Delivers: `README.md`'s split paragraph under `## How a run works`, the split line of `help.html`'s run overview, its `planner` card (including the sentence on steering it only by approving or rejecting the plan) and its `intent` card, in `en` and `pl`, stating that a plan grown past 30 tasks makes the planner ask whether to split through the interview or keep one plan, and that it asks every decision its exploration finds that the interview left open
- Verification: `grep -c "grows past 30 tasks" viber/README.md viber/skills/setup/assets/help.html` -> at least 1 and 2; `grep -c "przekroczy 30 zadań" viber/skills/setup/assets/help.html` -> at least 2; `grep -n "more than 30 tasks" viber/skills/planner/SKILL.md` -> a line; `grep -n "Split proposal:" viber/skills/intent/SKILL.md` -> a line; `node --test tests/viber/help.unit.test.ts` -> pass
- DoD: `README.md` states, with the phrase "grows past 30 tasks", the threshold question and the planner's questions on open decisions; the `planner` card and the run overview split line of `help.html` state the same in `lang="en"`, each with "grows past 30 tasks"; both state it in `lang="pl"`, each with "przekroczy 30 zadań"; the `intent` card says, in both languages, that the interview can resume from the planner's split proposal
<!-- /TASK -->

## Contracts

### C1 - Split proposal block

File: none

```
Split proposal:
<n>. <part> - owns: <what it delivers>; consumes: <what earlier parts produce, or nothing>; files: <repo-relative paths>; tasks: <estimated count>
Open decisions:
- <decision owed to the user, one per line>
```

`Open decisions:` and its lines are left out when there are none. A `viber:fixer` input puts the fix in part 1.

### C2 - Answered line

File: none

```
Answered: <decision> -> <chosen option>
```

One line per answered decision, after the summary inside `input:`.

### C3 - Diagnosis lines of a split fixer input

File: none

```
Root cause: <file + symbol, the diverging step, actual vs expected at that step>
Repro: <repo-relative path of the reproduction test>
```

Carried only by the summary of part 1.

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

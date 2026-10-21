To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Review set for large plans and a file limit for plain plan mode

## Goal

A planner plan past 12 tasks is reviewed by a set of narrower reviewers working in parallel, each holding only its own rules and its own part of the plan, so defects inside tasks and wrong dependencies stop slipping through. A deterministic check catches a task reading a file another task makes without depending on it. A plain plan-mode plan past 8 files is stopped and pointed to the planner.

## Problem

One `planner-review` at medium effort holds every rule of `plan-rules.md` and every per-task and per-edge check of up to 30 tasks in one context. On large plans it drifts: defects inside planned tasks and wrong dependencies pass the gate and surface only during the build. Plain plan mode has no size limit, so a change that needs tasks, dependencies and a planner review goes through a format-free plan instead.

## Current behaviour

Every planner plan, whatever its size, is reviewed by one `planner-review` agent at medium effort, and the plan gate lets plan mode end on its one PASS dispatched after the last plan write. `plan-index.sh` checks dependencies through contract blocks and shared files only: a task whose verification reads a file another task creates passes the script when no contract ties them. A plain plan-mode plan of any size is gated only by `plain-plan-review`, when `planning.plain-plan-review` is on.

### Must not change

- A planner plan of 12 tasks or fewer, and a draft, passes the plan gate on one `planner-review` PASS dispatched after the last plan write, as today.
- `plain-plan-review` and its checks; a plain plan naming 8 repository files or fewer is gated as today.
- The planner's 30-task threshold question and its split.
- Every plan gate refusal opens with `Next step:`, and every parse miss or unreadable input lets the exit through, except an unreadable plan under a planner signal, which keeps the planner's reviewer.

## Behaviour

### S1 - Large plan reviewed by a set [CHANGED - was: one reviewer for every plan]

Given a written planner plan of more than 12 tasks
When the planner reaches its review gate
Then it dispatches at once a spec reviewer, a graph reviewer and one task reviewer per slice of at most 8 consecutive tasks, and the round passes only when every one of them passes

### S2 - One member of the set fails [NEW]

Given a review round where one member returns FAIL
When the planner fixes the plan
Then the next round dispatches the whole set again, each member receiving every member's previous findings and the fixes

### S3 - Leaving plan mode on a large plan [CHANGED - was: one planner-review PASS let any plan through]

Given a planner plan of more than 12 tasks
When plan mode is about to end
Then the gate lets it end only on a PASS from the spec reviewer, the graph reviewer and task reviewers covering every task, each dispatched after the last plan write, and otherwise names what is still missing

### S4 - A task reads a file an earlier task makes without depending on it [CHANGED - was: only the reviewer could catch it]

Given a plan whose task verification or done clause names a file an earlier task lists, with no dependency path between the two
When the planner validates the plan
Then validation fails naming both tasks and the file

### S5 - Plain plan past the file limit [NEW]

Given a plain plan-mode plan naming more than 8 distinct repository files, with `planning.plain-plan-review` on
When plan mode is about to end
Then the gate refuses, naming the count and the limit, and points to narrowing the plan or to `/viber:intent`, even after a review PASS

### S6 - Each reviewer of the set holds only its own rules [NEW]

Given a review set dispatched on a plan past 12 tasks
When a member reads the plan rules
Then it reads only the sections of its role and only its part of the plan, and every planner reviewer, the single one included, runs at high effort

### S7 - The user reads how plans are reviewed [CHANGED - was: one reviewer described, no plain plan limit]

Given the usage guide and the help page, in English and Polish
When the user reads how a plan is reviewed
Then they find that a plan past 12 tasks goes to the review set and that a plain plan-mode plan may name at most 8 repository files

### Edge cases

- A plan of exactly 12 tasks -> one `planner-review`, as today.
- A plan of 13 tasks -> two slices, T1-T7 and T8-T13.
- A plan file the gate cannot read under a planner signal -> one `planner-review`, as today.
- A `planner-review` PASS on a plan past 12 tasks -> refused, naming the missing members.
- Task reviewers whose passed slices leave a task uncovered -> refused, naming the uncovered tasks.
- One member returns DENIED -> refused with the permission next step.
- The plan file modified after any deciding verdict -> refused with the re-review next step.
- A file named by a later task than the one reading it -> no validation failure.
- A path matching only part of a listed path (`a.ts` inside `src/a.ts`) -> no validation failure.
- A plain plan naming exactly 8 files -> goes on to the review check.
- A plain plan naming the same file twice, once absolute and once relative -> counted once.
- A URL, or a token that is neither an existing repository file nor path-shaped -> not counted.
- An absolute or `~` path outside the repository root, the plan's own path included -> not counted.
- A path under the repository's `.temp/`, absolute or relative -> not counted: it is an input the plan reads, not a file it changes.
- A path under the repository root written in the Git Bash form (`/c/...`) -> folded to its relative form like the drive form.
- `planning.plain-plan-review` off -> no count, the plain plan passes untouched.

## Glossary

- Review set - the reviewers a planner plan past 12 tasks goes through together: one spec reviewer, one graph reviewer and the task reviewers.
- Slice - a run of at most 8 consecutive tasks one task reviewer gates.
- Spec reviewer - the reviewer of the specification half and of how the tasks cover it, across the whole plan.
- Graph reviewer - the reviewer of dependencies and ordering across all tasks, reading the task half alone.
- Task reviewer - the reviewer of the tasks of one slice, each against the codebase.
- Plain plan file limit - at most 8 distinct repository files a plain plan-mode plan may name.

## Acceptance criteria

1. `plan-index.sh` rejects a task whose Verification or DoD names a file a lower-numbered task's Files lists, with no dependency path to that task.
2. A plan of more than 12 tasks is reviewed by the review set: one graph reviewer (the task half of the plan, the graph rules), task reviewers (spec, contracts and a slice of at most 8 tasks, the per-task rules) and one spec reviewer. A plan of 12 tasks or fewer, and a draft, is reviewed by one reviewer.
3. Each reviewer of the set reads only its role's sections of a sectioned `plan-rules.md`.
4. The plan gate lets ExitPlanMode through on a plan past 12 tasks only on a PASS from every reviewer of the set, each dispatched after the last plan write. Every round after a FAIL dispatches the whole set.
5. Every planner reviewer carries `effort: high`.
6. A plain plan-mode plan naming more than 8 distinct repository file paths is refused by `plan-gate.sh` when `planning.plain-plan-review` is on, with no override, its message pointing to narrowing the plan or to `/viber:intent`.
7. `README.md` and `help.html` (`en` and `pl`) describe the review set and the plain plan file limit.

## Scope

### File map

- modify - viber/scripts/plan-index.sh - the read-after dependency check and its header line
- modify - tests/viber/plan-index.test.ts - the read-after check cases
- modify - viber/references/plan-rules.md - rules grouped into role sections, the read-after rule, the plan-wide coverage clauses in their own rule
- add - viber/agents/planner-spec-review.md - the spec reviewer of the set
- add - viber/agents/planner-graph-review.md - the graph reviewer of the set
- add - viber/agents/planner-task-review.md - the task reviewer of one slice
- modify - viber/agents/planner-review.md - `effort: high`
- modify - viber/.claude-plugin/plugin.json - the three agents in `agents[]`
- modify - viber/skills/planner/SKILL.md - the review gate dispatching the set past 12 tasks and merging its verdicts
- modify - viber/hooks/scripts/plan-gate.sh - the set rule on the planner path, the file limit on the plain path
- modify - tests/viber/plan-gate.test.ts - the set and limit cases
- modify - viber/hooks/hooks.json - the description of the set rule and the limit
- modify - viber/hooks/content/plan-hints.md - the file limit in the plain plan-mode hints
- modify - tests/viber/plan-hints.test.ts - the limit hint asserted
- modify - viber/skills/setup/assets/help.html - agent lines, planner card, plan gate section, the `planning.plain-plan-review` key, the plan-mode question, `en` and `pl`
- modify - viber/README.md - the review set in the planning paragraph, the plain plan file limit
- modify - viber/docs/configuration.md - the file limit in the `planning.plain-plan-review` row
- modify - viber/skills/setup/templates/viber.yml - the file limit in the `plain-plan-review` comment

### Out of scope

- `viber/agents/plain-plan-review.md`: unchanged, agent and effort (decided with the user).
- The planner's 30-task threshold and `intent`'s split.
- The `CLAUDE.md` nodes (`viber/CLAUDE.md`, `viber/agents/CLAUDE.md`, `viber/hooks/CLAUDE.md`, `viber/references/CLAUDE.md`, `viber/skills/CLAUDE.md`): `build.memory` is on, the close updates them.
- `viber/docs/files.md`: no host write changes.
- `tests/viber/root-cause-prose.unit.test.ts`: unchanged; the Root cause bullet keeps its wording and stays the only one.
- A new switch for the file limit: the limit rides on `planning.plain-plan-review` (decided with the user).
- `docs/viber-functions.html`: a non-shipped record under `docs/`, never read by the plugin.
- `viber/skills/setup/assets/viber-flow-en.svg` and `viber-flow-pl.svg`: they keep showing `planner-review` as the plan's reviewer, still true for every plan up to 12 tasks; the figures stay a run overview, not the review set's detail.

## Solution requirements

- Every script keeps working on Windows (Git Bash) and macOS, and the plan gate still lets plan mode end on every parse miss, within its 10 s hook timeout.
- skill-designer doctrine for every agent and skill edit; the three new agents keep `planner-review`'s tools paragraph, Calibration, re-review sentence and Output verbatim.
- Least tokens: each reviewer of the set reads only its own sections of `plan-rules.md` and its own part of the plan.
- No em dash and no en dash anywhere.

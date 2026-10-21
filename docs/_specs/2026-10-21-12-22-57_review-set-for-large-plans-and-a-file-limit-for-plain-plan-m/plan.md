---
source: C:/Projects/viber/docs/_specs/2026-10-21-12-22-57_review-set-for-large-plans-and-a-file-limit-for-plain-plan-m/plan.md
---

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

## Tasks

<!-- TASK -->
### T1 - Reject a task reading a file an earlier task lists without depending on it
- TDD: required
- Covers: AC1
- Uses: none
- Depends-on: none
- Files: viber/scripts/plan-index.sh, tests/viber/plan-index.test.ts
- Delivers: validation that fails a plan whose task Verification or DoD names, as a whole path token, a file a lower-numbered task's Files lists while no dependency path joins the two
- Verification: node --test --test-name-pattern "read-after" tests/viber/plan-index.test.ts -> every selected test passes, at least five run
- DoD: a plan whose task Verification or DoD names a path a lower-numbered task's Files lists, with no dependency path to that task, exits 4 with `task <reader> reads <path>, listed by <writer>, but has no dependency path to <writer> - add <writer> to its Depends-on` on stderr; the same plan with the reader depending on that task directly or transitively exits 0; a path listed only by a higher-numbered task raises nothing; a token that matches only part of a listed path (`a.ts` inside `src/a.ts`, `src/a.ts` inside `src/a.tsx`) raises nothing while a path closed by a sentence period or wrapped in backticks still counts; under `--split` the check does not run; the header's exit-4 list names the case, and every new test's name carries "read-after"
<!-- /TASK -->

<!-- TASK -->
### T2 - Group the plan rules into role sections
- TDD: none
- Covers: AC1, AC3
- Uses: C1
- Depends-on: T1
- Files: viber/references/plan-rules.md
- Delivers: `plan-rules.md` cut into the four role sections of C1, carrying the read-after rule and the plan-wide coverage clauses in their own rule
- Verification: grep -n "^## \|Read after\|^- Sequenced\|^- Tied" viber/references/plan-rules.md && grep -n "reads .*listed by" viber/scripts/plan-index.sh && node --test tests/viber/root-cause-prose.unit.test.ts -> the headings `## Spec`, `## Graph`, `## Task`, `## Contracts` print in that order with no other `## ` heading, the `Read after`, `Sequenced` and `Tied` bullets print, the script line prints, every test passes
- DoD: `plan-rules.md` carries exactly the `##` headings `## Spec`, `## Graph`, `## Task` and `## Contracts`, in that order; every rule sits under the section C1 assigns it; a `Read after` bullet tagged `(script)` under `## Graph` states the check `plan-index.sh` makes; a `Sequenced` bullet tagged `(review)` under `## Graph` carries the plan-wide clauses C1 moves out of Size, Owned, Layered and End-to-end, which keep only their per-task clauses; a `Tied` bullet tagged `(review)` under `## Spec` carries the clauses C1 gives it, and `Covered` keeps exactly the clauses C1 names; the opening paragraph names which sections each reviewer of the review set reads; no rule but Covered, Size, Owned, Layered and End-to-end changes its wording, and those lose only the clauses C1 moves
<!-- /TASK -->

<!-- TASK -->
### T3 - Add the three reviewers of the review set
- TDD: none
- Covers: AC2, AC3, AC5
- Uses: C1, C2
- Depends-on: T2
- Files: viber/agents/planner-spec-review.md, viber/agents/planner-graph-review.md, viber/agents/planner-task-review.md, viber/agents/planner-review.md, viber/.claude-plugin/plugin.json, viber/skills/setup/assets/help.html
- Delivers: the spec, graph and task reviewer agents per C2, each reading only its sections of `plan-rules.md` and its part of the plan, registered and listed on the help page, and `planner-review` raised to high effort
- Verification: node --test tests/viber/help.unit.test.ts && grep -c "planner-spec-review\|planner-graph-review\|planner-task-review" viber/.claude-plugin/plugin.json && grep -n "^## Graph" viber/references/plan-rules.md && grep -n "## Graph" viber/agents/planner-graph-review.md && grep -n "^effort: high" viber/agents/planner-review.md viber/agents/planner-spec-review.md viber/agents/planner-graph-review.md viber/agents/planner-task-review.md -> every test passes, the count is 3, `## Graph` prints from the rules file and from the agent, four `effort: high` lines print
- DoD: each new agent's frontmatter carries, in order, `name`, a `description` ending `Invoked only by the planner skill, never directly.`, `tools: Read, Grep, Glob`, `model: opus`, `effort: high`, `color: yellow`; `planner-review.md` carries `effort: high`; each new agent takes exactly the input lines C2 gives its role and reads `plan-rules.md` only within the sections C2 names, through `Grep` for the `## ` line numbers then a ranged `Read`; each new agent reads the part of the plan and gates the checks C2 gives its role, and returns the C2 output; each new agent carries `planner-review.md`'s tools paragraph, Calibration, re-review sentence and Output verbatim; `plugin.json` `agents[]` lists the three right after `planner-review.md`; `help.html` carries a line `id="agent-<name>"` for each, with one `lang="en"` and one `lang="pl"` span
<!-- /TASK -->

<!-- TASK -->
### T4 - Dispatch the review set past 12 tasks
- TDD: none
- Covers: AC2, AC4
- Uses: C2
- Depends-on: T3
- Files: viber/skills/planner/SKILL.md
- Delivers: the planner's review gate dispatching `planner-review` alone up to 12 tasks and on a draft, and the whole review set past 12, merged into one verdict per round
- Verification: grep -n "planner-spec-review\|planner-graph-review\|planner-task-review\|more than 12" viber/skills/planner/SKILL.md && grep -n "^name: planner-task-review" viber/agents/planner-task-review.md && node --test tests/viber/nudge-prose.unit.test.ts -> the three agent names and the threshold print from the skill, the name line prints from the agent, every test passes
- DoD: step 3 dispatches `planner-review` alone when the `tasks:` rows of the `plan-index.sh` output number 12 or fewer and on a draft; past 12 it dispatches every member of the review set in one message, each with the input lines C2 gives its role and the slices C2 defines; the round's verdict is DENIED when any member returns DENIED, and after the permission is granted only the denied members are dispatched again in the same round, else FAIL when any returns FAIL, showing every member's findings, else PASS; every round after a FAIL dispatches the whole set anew, each member receiving every member's previous findings and one line per fix; a member replying without a `VERDICT:` line gets one more dispatch alone, a second miss handled as DENIED; step 4 reads a PASS as the PASS of every member the round required
<!-- /TASK -->

<!-- TASK -->
### T5 - Gate a plan past 12 tasks on the whole review set
- TDD: required
- Covers: AC4
- Uses: C3
- Depends-on: none
- Files: viber/hooks/scripts/plan-gate.sh, tests/viber/plan-gate.test.ts, viber/hooks/hooks.json
- Delivers: the plan gate requiring, on a planner plan past 12 tasks, the PASS of every member of the review set per C3, with every other plan gated as today
- Verification: node --test tests/viber/plan-gate.test.ts -> every test passes, the "review set" cases among them
- DoD: a planner plan of 12 task blocks or fewer, or one the gate cannot read, is gated on `planner-review` alone as today, a set member's PASS never counting for it; on a plan past 12 task blocks a `planner-review` PASS alone is refused with a `Next step: review the plan` reason naming every member still missing a PASS; when every member's latest verdict is PASS and the passed slices cover every task, ExitPlanMode is allowed, while a FAIL from any member is refused naming that member and a DENIED from any member is refused with the permission next step; two task-review dispatches sent in one message pair each with its own verdict whichever arrives first, and passed slices leaving a task uncovered are refused naming the uncovered tasks; a plan file modified more than 2 s after the earliest deciding verdict is refused with the re-review next step; `hooks.json`'s description states the set rule, asserted by `plan-gate.test.ts`, and every new test's name carries "review set"
<!-- /TASK -->

<!-- TASK -->
### T6 - Refuse a plain plan naming more than 8 repository files
- TDD: required
- Covers: AC6
- Uses: C4
- Depends-on: T5
- Files: viber/hooks/scripts/plan-gate.sh, tests/viber/plan-gate.test.ts, viber/hooks/hooks.json, viber/hooks/content/plan-hints.md, tests/viber/plan-hints.test.ts
- Delivers: the plain plan file limit of C4 on the plain path of the plan gate, and the limit named in the plain plan-mode hints
- Verification: node --test tests/viber/plan-gate.test.ts && node --test tests/viber/plan-hints.test.ts -> every test passes, the "file limit" cases among them
- DoD: with `planning.plain-plan-review` on, a plain plan naming more than 8 distinct repository files per C4 is refused with C4's reason, a `plain-plan-review` PASS on that version included; a plain plan naming exactly 8 goes on to the review check as today; the count folds an absolute path under the repository root, drive form or `/c/` form, to its relative form, strips a `:<line>` suffix and surrounding punctuation, counts a repeat once and skips a URL, a token neither an existing repository file nor path-shaped, an absolute or `~` path outside the repository root and a path under `.temp/`; with the switch off, and on the planner path, nothing is counted; `plan-hints.md`'s existing "Plan review" bullet gains the 8 repository files limit and that the gate refuses a plan past it, in wording holding neither "viber" nor "skip", so the hint keeps exactly five bullets and the case "the hint carries exactly the five rules" passes unchanged, while a new `plan-hints.test.ts` case asserts the limit sentence; `hooks.json`'s description states the limit, asserted by `plan-gate.test.ts`, and every new test's name carries "file limit"
<!-- /TASK -->

<!-- TASK -->
### T7 - Describe the review set and the plain plan file limit
- TDD: none
- Covers: AC7
- Uses: C2, C3, C4
- Depends-on: T4, T6
- Files: viber/README.md, viber/skills/setup/assets/help.html, viber/docs/configuration.md, viber/skills/setup/templates/viber.yml
- Delivers: the user docs stating that a plan past 12 tasks goes to the review set and that a plain plan may name at most 8 repository files
- Verification: grep -n "12 tasks\|8 repository files" viber/README.md && grep -n "more than 12" viber/skills/planner/SKILL.md && grep -c "planner-graph-review" viber/skills/setup/assets/help.html && grep -n "8 repository files" viber/docs/configuration.md viber/skills/setup/assets/help.html viber/skills/setup/templates/viber.yml && grep -n "past the 8" viber/hooks/scripts/plan-gate.sh && grep -n "^name: planner-graph-review" viber/agents/planner-graph-review.md && node --test tests/viber/help.unit.test.ts -> each grep prints at least one line, README printing both phrases, the help count is at least 3, every test passes
- DoD: `README.md`'s planning paragraph states that a plan past 12 tasks is reviewed by the spec, graph and task reviewers at once and plan mode ends only when all pass; `README.md` states that a plain plan-mode plan may name at most 8 repository files, past which plan mode points to `/viber:intent`; `help.html`'s planner card, its run overview sentences naming `planner-review` and its plan gate section state the same as the planning paragraph, `en` and `pl`; `help.html`'s `planning.plain-plan-review` key and its plan-mode question name the 8 repository files limit and `/viber:intent`, `en` and `pl`; `docs/configuration.md`'s `planning.plain-plan-review` row and the `plain-plan-review` comment of `skills/setup/templates/viber.yml` name the 8 repository files limit
<!-- /TASK -->

## Contracts

### C1 - Plan rule sections

File: viber/references/plan-rules.md

Headings, in order: `## Spec`, `## Graph`, `## Task`, `## Contracts`.

- `## Spec`: Split right, Reach, Lean, Root cause, Tied.
- `## Graph`: Ids, Depends, Minimal, Ordered, Read after, Disjoint, Leaf, Shared harness, Widened, Sequenced, Covers.
- `## Task`: Layers, Size, Title, Paths, Owned, Exclusive (script), Exclusive (review), Hard (script), Hard (review), Uses, Supplied, Delivers, Provable, Consistent, TDD, Reproduced (script), Reproduced (review), Self-proven, Layered, End-to-end, Memory-owned, Covered.
- `## Contracts`: Blocks, Block body (script), Block body (review), Glossary, Named, Writer, Homed, Seen, Consumed after.

Read after: a task whose `Verification` or `DoD` names a file a lower-numbered task's `Files` lists depends on that task, directly or through another. (script)

Sequenced: the plan-wide clauses moved out of four `## Task` rules, each kept in its own wording: from Size, the run's core lands in the earliest tasks as its smallest slice and a plan cut by layer where a behaviour slice was available is a finding; from Owned, a shape two tasks need is written by the first one that cannot deliver without it, in a task of its own ahead of them when that task carries behaviour too; from Layered, consumers reach an `Exclusive: true` adapter task through a port or contract an earlier task writes; from End-to-end, a write-only end-to-end task depends only on the tasks whose routes, selectors or endpoints it reads. Size, Owned, Layered and End-to-end keep only their per-task clauses. (review)

Tied: each acceptance criterion and each `### Edge cases` entry is tied to at least one task's done clause, a criterion several tasks cover proven by the union of their done clauses; an edge case is limited to behaviour the change introduces or changes, untouched behaviour belonging under `### Must not change`; a condition no single task delivers, like the suite staying green, is not an acceptance criterion but the build's own close. (review)

Covered keeps: each task really delivers what the criteria its `Covers` names require, each covered criterion tied to one of its done clauses; a done clause proving nothing in `Covers`, `Delivers` or an edge case is a finding.

Readers: `planner` and `planner-review` read the whole file; `planner-spec-review` reads `## Spec` and `## Contracts`; `planner-graph-review` reads `## Graph`; `planner-task-review` reads `## Task`.

### C2 - Review set

File: viber/agents/planner-spec-review.md, viber/agents/planner-graph-review.md, viber/agents/planner-task-review.md

Threshold: more than 12 task blocks. Slices: `ceil(n / 8)` runs of consecutive tasks, sizes differing by at most one, the larger first (13 -> T1-T7, T8-T13; 30 -> T1-T8, T9-T16, T17-T23, T24-T30).

| Agent | Input lines | Reads of the plan | Rules | Checks of `planner-review` it carries |
|---|---|---|---|---|
| `planner-spec-review` | plan path, `refs:`, `input:` (summary plus `Answered:` lines) | the whole plan | `## Spec`, `## Contracts` | Complete, Faithful, the big spec shape |
| `planner-graph-review` | plan path, `refs:` | from `## Tasks` to the end | `## Graph` | Wired, Decomposed |
| `planner-task-review` | plan path, `refs:`, `memory:`, `tasks: T<a>-T<b>` | everything above `## Tasks`, the task blocks of its range, the whole `## Contracts` appendix | `## Task` | Complete, Buildable, Grounded, Sliced right, each for its own tasks |

Every member keeps `planner-review`'s sentence to explore the codebase broadly before judging, scoped to its own part of the plan: the files its tasks touch and their callers, for the graph reviewer the consumers, harnesses and existing files its checks need. Every member also takes, on a re-review, every member's previous findings and one line per fix. Output, as `planner-review`: `VERDICT: PASS` or `VERDICT: FAIL`, then `FINDINGS:` grouped Blocking then Minor; a refused tool call: `VERDICT: DENIED`, then `REASON: <refused tool name>: <the exact refused command, or the path for a file tool>`.

### C3 - Review set gate

File: viber/hooks/scripts/plan-gate.sh

- Task count: the plan file's lines that are `<!-- TASK -->` alone (surrounding whitespace and a CR allowed). 12 or fewer, or an unreadable plan: `planner-review` alone, as today.
- Past 12, among dispatches after the last plan write, every open dispatch is tracked at once, each paired with the verdict line carrying its own `toolu_` id whatever order the verdicts arrive in (a dispatch without an id pairs with the first verdict after it), and the latest completed pair decides per member:
  - `planner-spec-review`: PASS.
  - `planner-graph-review`: PASS.
  - every task `T<k>`, `1 <= k <= n`: the latest completed `planner-task-review` pair whose prompt line `tasks: T<a>-T<b>` holds `a <= k <= b` is PASS; a dispatch without that line covers nothing.
- Dispatch text the refusals give (the set's `dispatch_with`): `planner-spec-review` with the plan path, `refs:` and `input:`; `planner-graph-review` with the plan path and `refs:`; `planner-task-review` with the plan path, `refs:`, `memory:` and `tasks: T<a>-T<b>`, one per slice of at most 8 consecutive tasks.
- Refusals, in this order: a member still missing a dispatch or a verdict -> `Next step: review the plan.` naming each missing member and the uncovered task range; a DENIED -> the permission next step naming the member; a FAIL -> `Next step: fix the findings.` naming the member; the plan file's mtime later than the earliest deciding verdict's timestamp plus 2 s -> `Next step: re-review.`

### C4 - Plain plan file limit

File: viber/hooks/scripts/plan-gate.sh

- Applies on the plain path only once `planning.plain-plan-review: true` is read, before the review check.
- Repository root: `git rev-parse --show-toplevel` in the session cwd, else the cwd.
- Tokens: the plan file split on whitespace and on `](`, so a markdown link `[x](src/a.ts)` yields `src/a.ts`; each stripped of surrounding backticks, quotes, brackets, parentheses and angle brackets, of trailing `.`, `,`, `;`, `:`, and of a `:<n>` or `:<n>-<m>` suffix; backslashes read as `/`; a token holding `://` skipped; a token under the repository root, in the drive form (`C:/...`) or the Git Bash form (`/c/...`), the drive letter compared case-insensitively, folded to its relative form; any other token opening with `/`, `~` or a drive letter skipped; a leading `./` stripped once; a token opening with `.temp/` skipped.
- Counted: a distinct remaining token naming an existing file under the repository root, or holding a `/` and ending in `.` plus 1 to 10 letters or digits.
- More than 8 -> refused: `Next step: narrow the plan or switch to the planner. <plan> names <n> repository files, past the 8 a plain plan-mode plan may name - narrow it to at most 8, or leave plan mode and run /viber:intent for a planned build. (This is the plan review gate (planning.plain-plan-review in .claude/viber.yml), not an error.)`
- An unreadable plan file counts nothing.

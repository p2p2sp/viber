---
source: /Users/dario/Projects/p2p2.claude/docs/_specs/2026-10-18-10-46-11_bug-fixes-always-reach-the-build-close-root-causes-reach-mem/plan.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Bug fixes always reach the build close, root causes reach memory, rules-writer stops rewriting rules

## Goal

Every fix of a confirmed defect, from `viber:fixer`, from a code audit or from pull request review threads, is built through a plan so the build close records what it taught. The root cause of a fixed defect reaches `memory-writer` as the most valuable fact of the run. `rules-writer` stops churning existing rule files during ordinary builds.

## Problem

- `code-auditor` ends on `/viber:intent <findings.md>` and `pr-feedback` invokes `intent` with its `review.md`; a small fix then takes the intent fast path, which writes no plan and no run directory, so neither `memory-writer` nor `rules-writer` runs.
- Even on the full road, `memory-writer` reads only `spec.md` and the coder notes. A `spec-lite` plan carries goal, criteria and file map, so the root cause a `viber:fixer` diagnosis proved never reaches it: the trap a defect revealed weighs no more than any feature fact.
- In ordinary builds `rules-writer` compacts and rewrites existing rule files whenever a file or the directory is over its cap (workteam.one `4fdfb10d`, timeharmony `3404ca13d2` and `0c5ab37870`, each attributed to `rules-writer` by the run's `outcome.md`), and lines it adds to an existing rule do not count toward the two-per-run cap.

## Current behaviour

- `viber/skills/intent/fragments/fast-path.true.md` excludes only a returning draft, a `roadmap.md` and a run on its own branch.
- `spec-lite.md` and `spec-full.md` have no place for a root cause; `viber/agents/memory-writer.md` drops the facts a reader needs least when over budget, with no fact protected.
- `viber/agents/rules-writer.md` `## Budget` applies "Compact, Split, write over" under both input shapes; `viber/references/rule-admission.md` caps "new conventions" at two per run without saying whether a line added to an existing rule counts.

### Must not change

- `fixer` keeps handing its diagnosis straight to `viber:planner`.
- The fast path keeps serving every other small change exactly as today.
- `rules-writer` under the map shape (the `/viber:rules` review) keeps its compact, split and move steps.
- `memory-writer` is dispatched only when `build.memory` is on.

## Behaviour

### S1 - An audit or review fix never takes the fast path [CHANGED - was: a small one took it]

Given a code audit finished with a confirmed finding, or `pr-feedback` handed its review threads on
When `/viber:intent` receives that `findings.md` or `review.md` and the fix is small
Then the interview proposes a spec shape and ends in `viber:planner`, never in a design built in the session

### S2 - A fix plan names its root cause [NEW]

Given the planner receives a `viber:fixer` diagnosis, or an intent summary carrying a code-auditor `findings.md`
When it writes the plan
Then the specification carries `## Root cause`, one line per cause; a plan from `pr-feedback` or an ordinary feature carries none

### S3 - The close remembers the root cause first [NEW]

Given a finished build whose `spec.md` carries `## Root cause` and `build.memory` is on
When `memory-writer` runs
Then each cause becomes a trap under `## Traps` of the node over its file, written before any other fact and never left out to stay within budget

### S4 - An ordinary build no longer rewrites rules [CHANGED - was: compacted and split over a cap]

Given a build close where a rule file or the rules directory is over its cap
When `rules-writer` runs under the spec shape
Then it adds only what passes the admission gate, changes an existing line only where the build contradicted it, compacts and splits nothing, reports each file over a cap on `OVER:`, and the build summary points to `/viber:rules`

### S5 - The user docs describe the three behaviours [CHANGED - was: silent on them]

Given a user reading the viber guide or the configuration reference
When they look up the fast path, the memory close or the rules close
Then they read that audit and review fixes never take the fast path, that a fix's root cause is remembered first, and that a build never compacts rules but points to `/viber:rules`

### Edge cases

- A root cause whose file lies under no node below the root -> it returns as a `SUGGEST:` line, the root staying the user's.
- A line `rules-writer` adds to an existing rule -> it passes the admission gate and counts as one of the two conventions of the run.
- The rules directory at its cap during a build -> a convention passing the gate is still written, never by replacing or merging away an existing rule, and the directory is reported on `OVER:`.
- `build.memory: false` -> no `memory-writer` dispatch; the root cause stays only in the archived specification (and, for a `viber:fixer` plan, in the reproduction test header).

## Glossary

- Root cause - the proven reason a defect happened: where the code diverges from what it should do, and the trap a later change must not fall into again. Not the fix itself.

## Acceptance criteria

1. `intent` never takes the fast path when its input carries a code-auditor `findings.md` or a pr-feedback `review.md`.
2. A plan built from a `viber:fixer` diagnosis or from code-auditor findings carries `## Root cause`; a plan from pr-feedback or an ordinary feature drops it.
3. `memory-writer` records each root cause as a trap under `## Traps` of the node over its file, first, and never drops it under budget; with `build.memory: false` it is not dispatched.
4. Under the build's spec shape, `rules-writer` counts every line added to an existing rule toward the two-per-run cap, changes an existing line only where the build contradicted it, never records what a rule used to say, never compacts or splits over a cap but reports `OVER:`, and the build summary then points to `/viber:rules`.
5. `viber/README.md` describes the fast-path exclusion; `viber/docs/configuration.md` and `help.html` (English and Polish) describe the fast-path exclusion, the root cause in memory and the build-time rules behaviour.

## Scope

### File map

- modify - viber/skills/intent/fragments/fast-path.true.md - fast-path eligibility
- modify - viber/skills/planner/templates/spec-lite.md - spec-lite shape, gains the optional root cause section
- modify - viber/skills/planner/templates/spec-full.md - spec-full shape, gains the optional root cause section
- modify - viber/references/plan-rules.md - the review rule gating the root cause section
- modify - viber/agents/memory-writer.md - root cause traps recorded first and protected from the budget cut
- modify - viber/agents/rules-writer.md - spec-shape editing and budget behaviour
- modify - viber/references/rule-admission.md - per-run cap counts lines added to existing rules
- modify - viber/skills/implementor/fragments/rules.true.md - the `/viber:rules` pointer after `OVER:` lines
- modify - viber/README.md - fast path section
- modify - viber/docs/configuration.md - `planning.fast-path`, `build.memory`, `build.rules` details
- modify - viber/skills/setup/assets/help.html - fast path, close parts and agent lines, both languages
- add - tests/viber/fast-path-prose.unit.test.ts - pins the fast-path exclusion
- add - tests/viber/root-cause-prose.unit.test.ts - pins the root cause section and its use by memory-writer
- add - tests/viber/rules-close-prose.unit.test.ts - pins rules-writer's spec-shape behaviour and the pointer

### Out of scope

- A ban on task-coder editing `.claude/rules/` (no evidence it is a source).
- A per-run fact cap for `memory-writer`.
- The `/viber:rules` review and shrinking rule directories already over the cap.
- `fixer`'s diagnosis and hand-off, and every other reader of `spec.md` (`closeout`, `qa-writer`, `final-reviewer`), which read the new section as ordinary specification text.
- The `CLAUDE.md` nodes, which the build close updates.

## Solution requirements

- Text added to agents, references and templates is kept to the fewest words that carry the rule: every reader loads it on every run.
- No em or en dash in any file.
- Any script works on Windows Git Bash and macOS; no heredoc.

## Tasks

<!-- TASK -->
### T1 - Keep audit and review fixes off the fast path
- TDD: required
- Covers: AC1
- Uses: none
- Depends-on: none
- Files: viber/skills/intent/fragments/fast-path.true.md, tests/viber/fast-path-prose.unit.test.ts
- Delivers: a fast-path exclusion for an input whose `Attachment:` line names a `findings.md` under `.temp/viber/code-auditor/` or a `review.md` under `.temp/viber/pr-feedback/`, sending such input down the full road
- Verification: node --test tests/viber/fast-path-prose.unit.test.ts -> every test passes
- DoD: the existing "Never for a returning draft or a `roadmap.md`" sentence of `fast-path.true.md` is extended in place to name an input whose `Attachment:` line points to a `findings.md` under `.temp/viber/code-auditor/` or a `review.md` under `.temp/viber/pr-feedback/`, with no new bullet beside it, asserted by `fast-path-prose.unit.test.ts`; the existing exclusions (returning draft, `roadmap.md`, branching) still stand, asserted by the same test
<!-- /TASK -->

<!-- TASK -->
### T2 - Add the root cause section to fix plans
- TDD: required
- Covers: AC2
- Uses: C1
- Depends-on: none
- Files: viber/skills/planner/templates/spec-lite.md, viber/skills/planner/templates/spec-full.md, viber/references/plan-rules.md, tests/viber/root-cause-prose.unit.test.ts
- Delivers: an optional `## Root cause` section in both spec templates, kept only for a `viber:fixer` diagnosis or code-auditor findings and dropped otherwise, and a `(review)` rule in `plan-rules.md` that gates it
- Verification: node --test tests/viber/root-cause-prose.unit.test.ts -> every test passes
- DoD: `spec-lite.md` and `spec-full.md` each carry `## Root cause` above `## Acceptance criteria`, its comment naming `viber:fixer`, `.temp/viber/code-auditor/` and the drop otherwise, asserted by `root-cause-prose.unit.test.ts`; both templates keep the four anchor lines `## Goal`, `## Acceptance criteria`, `### File map`, `### Out of scope`, asserted by the same test; `plan-rules.md` carries one `Root cause` bullet tagged `(review)` requiring the section for those two inputs and its absence for any other, asserted by the same test
<!-- /TASK -->

<!-- TASK -->
### T3 - Record root causes first in project memory
- TDD: required
- Covers: AC3
- Uses: C1
- Depends-on: T2
- Files: viber/agents/memory-writer.md, tests/viber/root-cause-prose.unit.test.ts
- Delivers: `memory-writer` turning each line of the spec's `## Root cause` into a trap under `## Traps` of the node over its file, written first, never on a `DROPPED:` line, and a `SUGGEST:` line when only the root covers that file
- Verification: node --test tests/viber/root-cause-prose.unit.test.ts -> every test passes
- DoD: `memory-writer.md` names `## Root cause`, `## Traps` and the rule that such a trap is written first and never left out to stay within budget, asserted by `root-cause-prose.unit.test.ts`; `memory-writer.md` sends a root cause over a file no node below the root covers to a `SUGGEST:` line, asserted by the same test; `memory-writer` stays dispatched only from `viber/skills/implementor/fragments/memory.true.md` with no `memory.false.md` beside it, asserted by the same test
<!-- /TASK -->

<!-- TASK -->
### T4 - Stop rules-writer rewriting rules during a build
- TDD: required
- Covers: AC4
- Uses: none
- Depends-on: none
- Files: viber/agents/rules-writer.md, viber/references/rule-admission.md, viber/skills/implementor/fragments/rules.true.md, tests/viber/rules-close-prose.unit.test.ts
- Delivers: under the spec shape, `rules-writer` changes an existing line only where the build contradicted it, never compacts, splits or moves over a cap and reports `OVER:` instead, the compact and split order applying under the map shape only; `rule-admission.md`'s calibration counting a line added to an existing rule as one of the two conventions; the implementor's rules fragment closing its `OVER:` lines with one line pointing to `/viber:rules`
- Verification: node --test tests/viber/rules-close-prose.unit.test.ts -> every test passes
- DoD: `rules-writer.md` `## Budget` scopes the compact and split order to the map shape and states that the spec shape never compacts, splits or moves, asserted by `rules-close-prose.unit.test.ts`; `rules-writer.md` scopes "a stronger example replaces the weaker one" and "the directory at its cap takes a new rule only by merging it into an existing one or replacing one" to the map shape, the spec shape at its cap writing what passes the gate and reporting `OVER:`, asserted by the same test; `rules-writer.md` limits a spec-shape change to an existing line to where the build contradicted it and keeps "never what it used to say", asserted by the same test; `rule-admission.md` `## Calibration` counts a line added to an existing rule toward the two per run, asserted by the same test; `rules.true.md` names `/viber:rules` on the line after its `OVER:` repeat, asserted by the same test
<!-- /TASK -->

<!-- TASK -->
### T5 - Document the fix path, root cause memory and build-time rules
- TDD: none
- Covers: AC5
- Uses: none
- Depends-on: T1, T3, T4
- Files: viber/README.md, viber/docs/configuration.md, viber/skills/setup/assets/help.html
- Delivers: user docs in English and Polish describing that audit and review fixes never take the fast path, that a fix's root cause is recorded in memory first, and that a build never compacts rules and points to `/viber:rules` when they are over budget
- Verification: node --test tests/viber/help.unit.test.ts -> every test passes; grep -c ".temp/viber/pr-feedback/" viber/skills/intent/fragments/fast-path.true.md -> at least 1, and grep -c "never takes the fast path" viber/README.md viber/docs/configuration.md viber/skills/setup/assets/help.html -> every count at least 1, and grep -c "nigdy nie idzie szybką ścieżką" viber/skills/setup/assets/help.html -> at least 1; grep -c "## Root cause" viber/agents/memory-writer.md -> at least 1, and grep -c "as the first trap" viber/docs/configuration.md viber/skills/setup/assets/help.html -> every count at least 1, and grep -c "jako pierwszą pułapkę" viber/skills/setup/assets/help.html -> at least 1; grep -c "/viber:rules" viber/skills/implementor/fragments/rules.true.md -> at least 1, and grep -c "never compacts" viber/docs/configuration.md viber/skills/setup/assets/help.html -> every count at least 1, and grep -c "nigdy nie kompresuje" viber/skills/setup/assets/help.html -> at least 1
- DoD: `viber/README.md` `### Fast path` and `docs/configuration.md`'s `planning.fast-path` detail say a fix of code-audit findings or pull request review threads "never takes the fast path"; `docs/configuration.md` extends its `build.memory` detail with the root cause recorded "as the first trap" and adds a `build.rules` detail saying a build "never compacts" rules and points to `/viber:rules` over budget; `help.html` states the fast-path exclusion in the intent card's fast path item and the `key-planning-fast-path` entry ("never takes the fast path" / "nigdy nie idzie szybką ścieżką"), the root cause in the `build.memory` close part and the `memory-writer` agent line ("as the first trap" / "jako pierwszą pułapkę"), and the build-time rules behaviour in the `build.rules` close part and the `rules-writer` agent line ("never compacts" / "nigdy nie kompresuje"), each in an English and a Polish span; `help.unit.test.ts` passes
<!-- /TASK -->

## Contracts

### C1 - Root cause section

File: viber/skills/planner/templates/spec-lite.md, viber/skills/planner/templates/spec-full.md

```
## Root cause

- <file> - <symbol>: <what diverges, actual vs expected> - trap: <what a later change must not do>
```

Heading exactly `## Root cause`, placed above `## Acceptance criteria`; one bullet per proven cause; the section is absent from any plan not built from a `viber:fixer` diagnosis or code-auditor findings.

---
source: /Users/dario/Projects/viber/docs/_specs/2026-11-15-10-32-10_four-diagnosis-and-enforcement-practices-taken-from-pstack-i/plan.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Four diagnosis and enforcement practices taken from pstack into viber

## Goal

Give viber four working practices that pstack (github.com/cursor/plugins, `pstack/`) carries and viber lacks: sharper bug diagnosis in `fixer` and in a retrying `task-coder`, a proposal for an enforcing check instead of a prose rule in `/viber:rules`, a pinned behaviour for a refactor task, and a repository-wide proof for a mechanical change spread over many files.

## Problem

`fixer` traces to a divergence but has no test for whether the state reaching it is legitimate, no brake on retrying hypotheses built on one premise, no look at history when something used to work, no search for the same defect elsewhere and no way to read a runtime value that reading the code cannot give. `task-coder` retries a failing check up to five rounds with no brake on a shared premise. `/viber:rules` turns a convention a lint rule, a type or a test could enforce into prose that nothing fails on. A plan has no rule that pins behaviour before a refactor, and none that proves a mechanical change reached every place. The cost: symptom fixes, repeated failed rounds, rules agents skip, and refactors and renames that silently miss callers.

## Current behaviour

`fixer` traces line by line to the first divergence, writes a RED reproduction test, edits nothing else, writes a diagnosis (root cause, symptom link, test, fix direction, blast radius, done condition, spec shape, attachments), asks one question when several fix approaches are defensible, and hands to the planner. The session manifest allows no code edit before plan approval except `fixer`'s reproduction test. `task-coder` re-runs a red `Verification` up to five rounds. `rules-auditor` admits a candidate through the three criteria of `rule-admission.md` as a `MISS:` line or drops it silently, and returns one `AUDIT:` line. `plan-rules.md` marks a task changing no runtime behaviour `TDD: none` with no word on pinning behaviour, and a `Verification` stays scoped to the task's own `Files`.

### Must not change

- Every sentence an existing `tests/viber/*-prose.unit.test.ts` pins stays word for word, except the cap lines this plan names.
- The `AUDIT:` line shapes of `rules-auditor` and the findings-file vocabulary `rules-writer` reads.
- The verdict `rules-auditor` gives an existing rule line it audits.
- The `RED:` and `red-check:` contract and `hooks/scripts/shell-guard.sh` rules R1 to R5.
- A `fixer` handoff still leaves no change of its own in the tree but the RED reproduction test, and never touches a path that was already changed before it started.
- The `task-coder` and `planner` read sets of `tests/viber/rule-budget.unit.test.ts` stay within their present caps.

## Behaviour

### S1 - fixer tests a premise before a third hypothesis [NEW]

Two hypotheses about the cause, both resting on one assumption, were refuted by the same observation.

Run on: the session model (Opus 5.5 or Fable 5.2)

Given `fixer` has two refuted hypotheses sharing one premise, refuted by the same check
When it forms the next hypothesis
Then it first writes the premise in one sentence and checks it directly, and only then traces on

### S2 - fixer places the fix by the legitimacy of the state [NEW]

Run on: the session model (Opus 5.5 or Fable 5.2)

Given `fixer` reached the first divergence
When the state arriving there is one the system may legitimately be in
Then the root cause is the code that breaks on that state
When the state should never exist
Then it traces back to where the state was produced, and never names a guard at the symptom as the fix direction

### S3 - fixer finds the change that broke a behaviour that used to work [NEW]

Run on: the session model (Opus 5.5 or Fable 5.2)

Given a report saying the behaviour used to work
When `fixer` traces
Then the diagnosis names the commit that introduced the divergence, found through `git log -L` over the diverging symbol, or `git bisect` on a clean tree, reset afterwards

### S4 - fixer instruments when reading cannot give the value [NEW]

Run on: the session model (Opus 5.5 or Fable 5.2)

Given a divergence whose actual value depends on timing, the environment or persisted state
When reading the code cannot state that value
Then `fixer` adds temporary logging to production code, runs it, reads the value and reverts the logging
And it hands off only when `git status` shows no path changed since it started but the reproduction test

### S5 - fixer lists the same defect elsewhere and lets the user pick [NEW]

Run on: the session model (Opus 5.5 or Fable 5.2)

Given the confirmed root cause is a pattern other places repeat
When `fixer` writes the diagnosis
Then it carries a `Same defect elsewhere` field naming each place by file and symbol
And before the handoff the user picks which of those places enter the plan, each place marked picked or not picked

### S6 - task-coder tests a premise before a third fix [NEW]

Run on: Sonnet 5.5 and Opus 5.5 (the `tiers` range a coder dispatch climbs)

Given a retry dispatch carrying `reason`, and a red round of this attempt failing on the same check the `reason` names after a fix resting on the same premise
When the coder plans the next fix
Then it writes that premise as one line of its notes and checks it directly first

### S7 - rules proposes a check instead of a rule [NEW]

Run on: Opus 5.5 (the `rules-auditor` frontmatter model)

Given a new candidate convention passing the three criteria that a lint rule, a type or a test could fail on, with no such check yet
When `rules-auditor` weighs it, in any of its three directions
Then it writes no `MISS:` line but returns an `ENFORCE:` line after its `AUDIT:` line, naming the check
And `/viber:rules` reports each `ENFORCE:` line verbatim, and no rule and no code is written for it

### S8 - a refactor task is pinned [NEW]

Run on: the session model for `planner`, the `planner-review` frontmatter model for the gate

Given a plan task that restructures code while keeping every behaviour a caller observes
When the planner writes it and the reviewer gates it
Then it is `TDD: none`, its `Verification` runs the existing tests pinning that behaviour, and where none pins it, its first done clause writes a characterization test that runs green before the structure moves

### S9 - a mechanical change over many files is proven repository-wide [NEW]

Run on: the session model for `planner`, the `planner-review` frontmatter model for the gate

Given a plan applying one mechanical change across more than five files
When the planner writes the `Verification` of the last task carrying the change, which depends on every other task carrying it
Then it greps every tracked file outside the run and archive directories, and outside the `CLAUDE.md` nodes when `build.memory` is on, for the old form and counts proof only when nothing is found

### S10 - the guides describe the new fixer and rules behaviour [NEW]

Run on: no model; a documentation check with no evaluation run

Given a user opens the help page or `docs/viber-functions.html`
When they read the `fixer` and `rules` entries
Then they learn that `fixer` lists the same defect elsewhere for them to pick, and that `/viber:rules` proposes a check instead of a rule a check could enforce

### Edge cases

- A refuted hypothesis with no premise shared with another -> no premise check; tracing goes on.
- A root cause no other place repeats -> `Same defect elsewhere` reads `none` and the handoff question carries no place choice.
- The user picks no place -> every place is marked not picked and the plan covers the reported defect alone.
- A path already changed before `fixer` started -> it is left as it is and does not block the handoff.
- A path `fixer` changed that is not the reproduction test still changed at the gate -> the handoff stops and names it.
- A candidate that a check already in the repository enforces -> fails criterion 3 and is dropped silently, as today; only a check that does not exist yet earns an `ENFORCE:` line.
- An `ENFORCE:` line from the trail direction -> the `failures.md` entries it rests on stay, so a later run proposes the check again until it exists.
- `ENFORCE:` lines count toward neither the two new conventions per run nor the auditor's two `MISS:` lines, since they write no rule.
- Only one fix approach is defensible while `Same defect elsewhere` lists places -> the place choice is a question of its own.
- More places than one question can show as options -> the question offers all of them or none, and takes the places a free answer names.
- A tree with uncommitted changes -> `git bisect` is not used; `git log -L` alone.
- Only `ENFORCE:` lines and zero counters -> the run reports them and dispatches no writer.
- A refactor that also changes a behaviour -> no pin rule; the task follows the ordinary `TDD: required` rules.
- A mechanical change spread over several tasks -> only the last of them, depending on every other, carries the repository-wide grep.
- `build.memory` on -> the grep skips the `CLAUDE.md` nodes, which keep the old form until the close updates them.
- The value `fixer` needs lives in a file already changed before it started -> no instrumentation there; it goes on by reading, or asks for the existing bypass authorization.
- A `task-coder` dispatch without a `reason` line -> no premise brake.

## Glossary

- Premise - the one assumption every failed hypothesis or fix rested on.
- Characterization test - a test capturing the behaviour the code has today, written before its structure moves.
- Enforcing check - a lint rule, a type or a test that fails on a violation, as opposed to prose an agent may skip.

## Acceptance criteria

1. `fixer` writes down and directly checks the premise shared by two hypotheses refuted by the same check before forming a third.
2. `fixer` decides whether the state reaching the divergence is legitimate and places the fix direction by that decision, never on a guard at the symptom.
3. `fixer` finds the change that broke a behaviour the report says used to work, through `git log -L` or `git bisect`.
4. `fixer` may add temporary instrumentation to production code only when reading the code cannot give the actual value, the session manifest allowing it, and hands off only when `git status` shows no path changed since it started but the reproduction test.
5. The `fixer` diagnosis carries a `Same defect elsewhere` field, and the user picks which of its places enter the plan before the handoff.
6. On a retry of a task, `task-coder` writes the premise its failed earlier attempt and a red round of its own share on the same check into its notes and checks it directly before the next fix.
7. `rules-auditor` returns an `ENFORCE:` proposal naming the check for a new candidate a lint rule, a type or a test could enforce, with no rule and no code written for it, and `/viber:rules` reports that line; `rule-admission.md` states the exception.
8. `plan-rules.md` makes a behaviour-preserving restructuring task `TDD: none`, pinned by its existing tests or by a characterization test it writes first.
9. `plan-rules.md` proves a mechanical change across more than five files with a grep for the old form, on the last task carrying it, over every tracked file outside the run and archive directories and, with `build.memory` on, outside the `CLAUDE.md` nodes.
10. The help page (both languages) and `docs/viber-functions.html` describe the `fixer` place choice and the `rules` check proposal.

## Scope

### File map

- modify - viber/skills/fixer/SKILL.md - the tracing heuristics, the instrumentation exception and its handoff check, the `Same defect elsewhere` field and its question
- modify - viber/hooks/content/manifest.md - the plan-approval rule's exception names `fixer`'s temporary instrumentation
- add - tests/viber/fixer-prose.unit.test.ts - pins of the new `fixer` and manifest prose
- modify - viber/agents/task-coder.md - the premise brake in `## Prove it green`
- modify - tests/viber/repair-prose.unit.test.ts - pin of the coder premise brake
- modify - viber/references/rule-admission.md - criterion 3 and the silent drop name the enforcing-check exception
- modify - viber/agents/rules-auditor.md - the `ENFORCE:` line in every direction and in `## Output`
- modify - viber/skills/rules/SKILL.md - step 5 reports every `ENFORCE:` line verbatim, step 6 never sends one to the writer
- modify - tests/viber/rules-trail-prose.unit.test.ts - pins of the admission exception, the auditor line and the skill report
- modify - viber/references/plan-rules.md - the pin clause of `TDD` and the repository-wide grep of `Provable`
- modify - tests/viber/test-pyramid-prose.unit.test.ts - pins of the two plan rules and the `plan-rules.md` byte cap
- modify - tests/viber/rule-budget.unit.test.ts - the `planner-review` read-set cap
- modify - viber/skills/setup/assets/help.html - the `fixer` and `rules` cards, both languages
- modify - docs/viber-functions.html - the `fixer` and `rules` feature lists
- modify - viber/skills/setup/assets/viber-flow-en.svg - the plan gate line naming the code allowed before a plan
- modify - viber/skills/setup/assets/viber-flow-pl.svg - the same line in Polish

### Out of scope

- Empirical forks in `intent`, the audit of existing rules for enforcement, `scripts/plan-index.sh` and any new `TDD` value, `red-check.sh` and `shell-guard.sh`.
- Small edits to `test-strategy.md` and the `runtime-performance` lens; the multi-model panels and every other pstack skill.
- `README.md` and `viber/README.md`: their one-line `fixer` and `rules` summaries stay true.
- `rules-writer.md`: it reads the findings file, which `ENFORCE:` lines never enter.
- Every `CLAUDE.md` node: the build's memory step owns them.

## Solution requirements

- Every edited skill and agent file lints clean (`FAIL=0 WARN=0`) under `viber/skills/skill-designer/scripts/lint_skill.sh` and follows the `viber:skill-designer` doctrine: imperative, one rule per line, a rule extended in its own sentence where it already exists.
- Tokens are a design constraint: added text is as short as the rule allows, and text needed only at one step sits at that step, never in an opening read on every run; the two byte caps this plan raises grow by 800 bytes each, the room the three plan-rule sentences need.
- English only, present state only, no em or en dash, no heredoc.

## Tasks

<!-- TASK -->
### T1 - Add the premise, legitimacy and history checks to fixer tracing
- TDD: required
- Covers: AC1, AC2, AC3
- Uses: none
- Depends-on: none
- Files: viber/skills/fixer/SKILL.md, tests/viber/fixer-prose.unit.test.ts
- Delivers: `fixer` tracing rules for a shared premise of refuted hypotheses, the legitimacy of the state at the divergence, and the change that broke a behaviour that used to work, pinned by a new prose test.
- Verification: node --test tests/viber/fixer-prose.unit.test.ts && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/skills/fixer -> the test passes and the lint prints FAIL=0 WARN=0
- DoD: the fixer body requires writing the premise two hypotheses refuted by the same check share in one sentence and checking it directly before a third hypothesis; it places the root cause on the code breaking on a legitimate state and, for a state that should never exist, on the place producing it, naming a guard at the symptom as no fix direction; it requires finding the commit that introduced the divergence when the report says the behaviour used to work, the diagnosis naming that commit, through `git log -L` over the diverging symbol, or `git bisect` only on a tree with no uncommitted change and ending on `git bisect reset`
<!-- /TASK -->

<!-- TASK -->
### T2 - Let fixer instrument production code temporarily
- TDD: required
- Covers: AC4
- Uses: none
- Depends-on: T1
- Files: viber/skills/fixer/SKILL.md, viber/hooks/content/manifest.md, tests/viber/fixer-prose.unit.test.ts
- Delivers: the Law 3 exception for temporary instrumentation when reading the code cannot give the actual value, the matching exception in the session manifest, and the handoff gate stopping while a path `fixer` changed, other than the reproduction test, is still changed.
- Verification: node --test tests/viber/fixer-prose.unit.test.ts && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/skills/fixer -> the tests pass and the lint prints FAIL=0 WARN=0
- DoD: Law 3 allows temporary instrumentation of production code only when reading the code cannot state the actual value (timing, environment, persisted state), each instrumentation edit reverted through `Edit` before the handoff; `fixer` records `git status` before its first edit; the handoff gate runs `git status` again and stops, naming the path, on any path changed since that record other than the reproduction test, leaving every path already changed in the record untouched; a file already changed in the record is never instrumented; the manifest's plan-approval exception names `fixer`'s reproduction test and its temporary instrumentation
<!-- /TASK -->

<!-- TASK -->
### T3 - Add the same-defect-elsewhere field and its place choice to fixer
- TDD: required
- Covers: AC5
- Uses: C1
- Depends-on: T2
- Files: viber/skills/fixer/SKILL.md, tests/viber/fixer-prose.unit.test.ts
- Delivers: a search for the root cause's pattern in other places, the diagnosis field carrying them with their picked mark, and the user's pick of the places entering the plan in the step 5 question.
- Verification: node --test tests/viber/fixer-prose.unit.test.ts && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/skills/fixer -> both pass and the lint prints FAIL=0 WARN=0
- DoD: `fixer` searches for the root cause's pattern beyond the reported place, and the diagnosis carries the C1 field after `Blast radius`, `none` when no other place repeats the pattern; step 5 asks the user which listed places enter the plan, inside the fix-approach `AskUserQuestion` when that one is asked and as its own `AskUserQuestion` otherwise, and writes each place's `picked` or `not picked` mark from the answer; past four places the question offers all of them or none and takes the places a free answer names; no place question is asked when the field reads `none`
<!-- /TASK -->

<!-- TASK -->
### T4 - Add the premise brake to task-coder rounds
- TDD: required
- Covers: AC6
- Uses: none
- Depends-on: none
- Files: viber/agents/task-coder.md, tests/viber/repair-prose.unit.test.ts
- Delivers: a `## Prove it green` rule making the coder on a retry, when a red round fails on the same check its `reason` names after a fix resting on the same premise, write that premise in its notes and check it directly before the next fix.
- Verification: node --test tests/viber/repair-prose.unit.test.ts && node --test tests/viber/red-evidence-prose.unit.test.ts && node --test tests/viber/extras-prose.unit.test.ts && node --test tests/viber/ruling-prose.unit.test.ts && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/agents/task-coder.md -> the tests pass and the lint prints FAIL=0 WARN=0
- DoD: `## Prove it green` requires, on a dispatch carrying `reason`, when a red round fails on the same check the `reason` names after a fix resting on the premise of the failed attempt, writing that premise as one notes line and checking it directly before the next fix; a dispatch without `reason` carries no such brake
<!-- /TASK -->

<!-- TASK -->
### T5 - Propose an enforcing check instead of a rule in /viber:rules
- TDD: required
- Covers: AC7
- Uses: C2
- Depends-on: none
- Files: viber/references/rule-admission.md, viber/agents/rules-auditor.md, viber/skills/rules/SKILL.md, tests/viber/rules-trail-prose.unit.test.ts
- Delivers: the admission exception for a new candidate a check could enforce, the C2 line returned by `rules-auditor` in its verify, propose and trail directions, its verbatim report in step 5 of `/viber:rules`, and step 6 keeping it from the writer.
- Verification: node --test tests/viber/rules-trail-prose.unit.test.ts && node --test tests/viber/rules-close-prose.unit.test.ts && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/skills/rules && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/agents/rules-auditor.md -> the tests pass and both lints print FAIL=0 WARN=0
- DoD: criterion 3 of `rule-admission.md` makes a new candidate that a lint rule, a type or a test could fail on, with no such check yet, no rule but a proposal for that check, and states that an audited existing line keeps its verdict; `## The silent drop` names that proposal as an exception; `rules-auditor` returns one C2 line after its `AUDIT:` line for each such candidate in every direction, writes it into no findings file, adds no `MISS:` line for it and, in the trail direction, writes no `USED:` or `REJECTED:` line for the entries it rests on; step 5 of `rules/SKILL.md` reports every C2 line verbatim after its `AUDIT:` line, saying no rule and no code is written for it; step 6 never dispatches the writer for a C2 line alone; a C2 line counts toward neither the two new conventions of `## Calibration` nor the auditor's two `MISS:` lines, and a trail entry whose gap fails criterion 3 only for want of a check gets the C2 line, never `REJECTED:`
<!-- /TASK -->

<!-- TASK -->
### T6 - Raise the plan-rules byte caps for the two new plan rules
- TDD: none
- Covers: AC8, AC9
- Uses: none
- Depends-on: none
- Files: tests/viber/test-pyramid-prose.unit.test.ts, tests/viber/rule-budget.unit.test.ts
- Delivers: the `plan-rules.md` byte cap and the `planner-review` read-set cap raised by the room the two plan-rule clauses need, and the read-budget header describing the caps as they now stand.
- Verification: grep -c "19800" tests/viber/test-pyramid-prose.unit.test.ts && grep -c "30275" tests/viber/rule-budget.unit.test.ts && node --test --test-name-pattern "plan-rules stays within" tests/viber/test-pyramid-prose.unit.test.ts && node --test --test-name-pattern "planner" tests/viber/rule-budget.unit.test.ts -> both greps print 1 or more and the cap tests pass
- DoD: `test-pyramid-prose.unit.test.ts` holds `plan-rules.md` within 19800 bytes, title and assertion alike; `rule-budget.unit.test.ts` caps the `planner-review` read set at 30275 bytes, every other cap unchanged
<!-- /TASK -->

<!-- TASK -->
### T7 - Pin behaviour in a refactor task
- TDD: required
- Covers: AC8
- Uses: none
- Depends-on: T6
- Files: viber/references/plan-rules.md, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: a clause of the `TDD` rule making a task that restructures code while keeping every observable behaviour `TDD: none`, pinned by its existing tests in `Verification` or by a characterization test its first done clause writes and runs green before the structure moves.
- Verification: node --test --test-name-pattern "plan-rules" tests/viber/test-pyramid-prose.unit.test.ts && node --test --test-name-pattern "planner" tests/viber/rule-budget.unit.test.ts && node --test tests/viber/e2e-prose.unit.test.ts -> the tests pass
- DoD: the `TDD` rule lists a behaviour-preserving restructuring among the `TDD: none` cases, its `Verification` running the existing tests that pin that behaviour and, where none pins it, its first done clause writing a characterization test run green before the structure moves
<!-- /TASK -->

<!-- TASK -->
### T8 - Prove a mechanical change over many files repository-wide
- TDD: required
- Covers: AC9
- Uses: none
- Depends-on: T7
- Files: viber/references/plan-rules.md, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: a sentence of the `Ordered` rule making the last task carrying one mechanical change across more than five files depend on every other task carrying it, and a clause of the `Provable` rule giving that task a grep for the old form over every tracked file outside the run and archive directories, and outside the `CLAUDE.md` nodes with `build.memory` on, finding nothing.
- Verification: node --test --test-name-pattern "plan-rules" tests/viber/test-pyramid-prose.unit.test.ts && node --test --test-name-pattern "planner" tests/viber/rule-budget.unit.test.ts && node --test tests/viber/e2e-prose.unit.test.ts && node --test --test-name-pattern "plan-rules" tests/viber/guard-prose.unit.test.ts -> the tests pass
- DoD: the `Ordered` rule of `## Graph` requires, in its own sentence, that the last task carrying one mechanical change (a rename, a moved path, a changed call) across more than five files depend on every other task carrying it; the `Provable` rule of `## Task` requires the task completing such a change to hold in its `Verification` a grep for the old form over every tracked file outside the run and archive directories under `docs/` that finds nothing, an exception to the scope of the task's own `Files`; with `build.memory` on, that grep also leaves out every `CLAUDE.md`
<!-- /TASK -->

<!-- TASK -->
### T9 - Describe the fixer place choice and the rules check proposal in the user guides
- TDD: none
- Covers: AC10
- Uses: C1, C2
- Depends-on: T3, T5
- Files: viber/skills/setup/assets/help.html, docs/viber-functions.html, viber/skills/setup/assets/viber-flow-en.svg, viber/skills/setup/assets/viber-flow-pl.svg
- Delivers: the `fixer` and `rules` cards of the help page in English and Polish and the two feature lists of `docs/viber-functions.html`, stating the place choice and the check proposal, and the gate line of both flow SVGs with the help page's paragraph on the one code allowed before a plan naming `fixer`'s temporary instrumentation.
- Verification: grep -c "Same defect elsewhere" viber/skills/fixer/SKILL.md viber/skills/setup/assets/help.html docs/viber-functions.html && grep -c "ENFORCE:" viber/agents/rules-auditor.md viber/skills/setup/assets/help.html docs/viber-functions.html && grep -c "temporary instrumentation" viber/hooks/content/manifest.md viber/skills/setup/assets/help.html viber/skills/setup/assets/viber-flow-en.svg && grep -c "instrumentacj" viber/skills/setup/assets/help.html viber/skills/setup/assets/viber-flow-pl.svg && node --test tests/viber/help.unit.test.ts -> every file prints a count of at least 1 and the help test passes
- DoD: the help page's `fixer` card, in both `lang="en"` and `lang="pl"`, names the `Same defect elsewhere` field and says the user picks which of its places enter the plan; its `rules` card, in both languages, says a convention a check could enforce comes back as an `ENFORCE:` proposal and no rule; the `fixer` list of `docs/viber-functions.html` carries one line naming `Same defect elsewhere`, and its `rules` list one line naming `ENFORCE:`; the gate line of both flow SVGs and the help page's paragraph on the one code allowed before a plan, in both languages, name `fixer`'s temporary instrumentation beside its reproduction test (English "temporary instrumentation", Polish "tymczasowa instrumentacja"), and the help page's `fixer` card says the instrumentation is reverted before the handoff
<!-- /TASK -->

## Contracts

### C1 - Same defect elsewhere field

File: viber/skills/fixer/SKILL.md

A bullet of `## The diagnosis`, directly after `Blast radius`:
- **Same defect elsewhere** - each other place repeating the root cause's pattern, one `<repo-relative path> | <symbol> | picked` or `<repo-relative path> | <symbol> | not picked` per place; `none` when no place repeats it. Only a `picked` place enters the plan.

### C2 - ENFORCE line

File: viber/agents/rules-auditor.md

Returned after the `AUDIT:` line, zero or more, never written into a findings file:

ENFORCE: <the convention> -> <the check that would fail on its violation: a lint rule, a type or a test> | <file>:<line> where the code does it right

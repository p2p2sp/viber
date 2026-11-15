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
- The planner, intent and plan-hints references to `fixer` the reach map found: they name the skill or its diagnosis as a whole, whose earlier fields keep their names and order; the planner reads which places enter the plan from the `picked` marks of the diagnosis text alone.
- `rules-writer.md`: it reads the findings file, which `ENFORCE:` lines never enter.
- Every `CLAUDE.md` node: the build's memory step owns them.

## Solution requirements

- Every edited skill and agent file lints clean (`FAIL=0 WARN=0`) under `viber/skills/skill-designer/scripts/lint_skill.sh` and follows the `viber:skill-designer` doctrine: imperative, one rule per line, a rule extended in its own sentence where it already exists.
- Tokens are a design constraint: added text is as short as the rule allows, and text needed only at one step sits at that step, never in an opening read on every run; the two byte caps this plan raises grow by 800 bytes each, the room the three plan-rule sentences need.
- English only, present state only, no em or en dash, no heredoc.

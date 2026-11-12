---
source: C:/Projects/viber/docs/_specs/2026-11-12-12-06-40_test-rules-that-follow-the-test-pyramid/plan.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Test rules that follow the test pyramid

## Goal

viber's instructions make a build prove every decision with a fast unit test, keep integration tests few and out of the task loop, and stop a coder from writing duplicate or trivial tests. The same rules reach the `tests` and `design` lenses of `code-auditor`, so an audit reports the tests a build no longer writes and the code structure that forces them. A build then waits less on slow tests and its fast tier proves the logic.

## Problem

In host projects a viber build inverts the test pyramid: it writes as many integration tests as unit tests or more, and each one runs several times inside its task (the red run, every green round, the reviewer's run) before the final test run. Integration tests take long and consume much of the machine, so a build keeps the user waiting and the developer stops running the slow layer. Coders also write several tests that catch the same regression and tests of names, fields and data shapes that prove nothing. Left alone, builds stay slow, the suites grow without proving more, and logic keeps shipping proven only where nobody runs the proof.

## Current behaviour

- The principle that unit and component tests outnumber integration tests lives only in `viber/PRODUCT.md`, which no agent reads.
- An entry point that calls data access directly counts as an adapter as a whole, so its logic is proven by integration tests. On a host without ports that logic has no other route.
- A task proves each done clause about data access with its own integration test, run red and green inside the task and run again by the task reviewer.
- A decision may be proven by a unit test or by a component test alike.
- The rule against testing accessors, data holders and other trivia is guidance only, and no rule forbids two tests of the same regression within one layer.
- A coder is told to write no test beyond its done clauses, yet the task reviewer does not block one.
- No plan rule asks a done clause of a `TDD: required` task to state a behaviour or a decision.
- The `tests` lens of `code-auditor` reports tests that miss regressions, never tests that cost more than they prove, and the `design` lens reports no decision that the code's structure keeps out of a unit test's reach. A lens holds at most 6 angles and 8000 bytes.

### Must not change

- Every phrase an existing `tests/viber/*-prose.unit.test.ts` case pins in a file this plan modifies keeps its wording.
- The `RED:` and `red-check:` lines and every end-to-end rule keep their text and meaning.
- A reproduction test named on a `Repro:` line is still run in its task, whatever its layer.
- Each lens file keeps its four headings in order and holds no bash block.

## Behaviour

### S1 - A decision beside data access is planned as a unit-tested function [CHANGED - was: the whole entry point counted as the adapter and its logic was proven by integration tests]

A plan that adds or changes a decision inside code reaching a database, queue, broker or network delivers that decision as a function over plain values, proven by a unit test that needs no double. The code around it stays as it is and no port is introduced for it. A plan proving a decision only by a component or integration test is sent back by its reviewer.

Given a host whose endpoint calls its database directly
When a plan adds a validation rule to that endpoint
Then the plan holds a function carrying the rule with a unit test, and no integration test asserts the rule

### S2 - An integration test is written in its task and run once at the end [CHANGED - was: run red, green and by the reviewer inside its task]

A task that creates or changes an adapter writes that adapter's integration test, covering only what the real dependency reveals, one test per adapter behaviour. Nobody runs the test inside the task: the task checks that the test tool lists or type-checks it. The build's final test run runs it once, and a failure there goes through the repair rounds a build already has.

Given a plan with a task changing a repository's query
When the build runs that task
Then no dependency is started during the task, and the query's integration test runs once in the final test run

### S3 - A coder writes one test per regression and none for trivia [CHANGED - was: guidance without a gate, duplicates unruled]

A coder writes a test only for an important path or a decision, one test per regression, and stops once its done clauses are met. The task reviewer sends back a second test of the same regression, a test of a name, a field's presence or a data shape, and a test proving none of the task's done clauses.

Given a task with three done clauses
When its coder adds a fourth test asserting that a field exists
Then the task reviewer fails the task naming that test

### S4 - A done clause about a name or a shape is sent back at planning [NEW]

A plan whose `TDD: required` task carries a done clause about a name, the presence of a field or the shape of data fails its review: the clause belongs in a contract or in a task without tests.

Given a plan with a `TDD: required` task whose done clause reads "the response has a `total` field"
When the plan is reviewed
Then the reviewer reports the clause as a finding

### S5 - An audit reports wasteful tests and the structure behind them [NEW]

A `code-auditor` run through the `tests` lens also reports redundant tests, trivial tests and decisions proven only by an integration test, each confirmed by its own check, the last one without running any integration test. A run through the `design` lens reports a decision written inside code that reaches an external dependency, which no unit test can reach as the code stands.

Given a repository where a discount rule is asserted only by tests against a real database
When the user audits its tests
Then the findings name the rule as proven in the wrong layer

Given the same rule written inside the function that queries the database
When the user audits the design
Then the findings name the rule as a decision to extract

### S6 - The guides describe the same rules [CHANGED - was: the guides name only the final run's scope]

The usage guide, the help page in both languages and the product notes state how a build treats decisions, integration tests and test worth.

Given a user opening the help page in Polish
When they read how a build tests a task
Then they find the unit-first rule and the single run of integration tests

### Edge cases

- A task whose every done clause is proven by an integration test (an adapter holding no decision) -> the task is `TDD: none` and carries no red evidence.
- A `TDD: required` task mixing decision clauses and one integration-proven clause -> its red evidence comes from the unit tests alone.
- A reproduction test of a bug fix that is an integration test -> its task still runs it.
- The final test run fails on an integration test -> the coder repairing that report runs the failing tests.
- An integration test file changes while its adapter file does not -> the final test run still runs that test.
- A host without ports -> the decision is still extracted into a function, and no port is added.
- Variants of one input -> they are rows of one parameterised test, never separate tests.

## Glossary

- Decision - a point where the code chooses: a branch, a rule, a calculation, a validation. Not a query, a mapping to storage or a call to a dependency.
- Adapter - the code that talks to one external dependency and holds no decision. Not an entry point as a whole.
- Wasteful test - a test that costs more than it proves: redundant, trivial or placed in a slower layer than it needs.
- Untestable decision - a decision written inside code that reaches an external dependency, so a test reaches it only through that dependency or a chain of doubles. Not a decision that merely lacks a test.

## Acceptance criteria

1. Every decision is proven by a unit test: `plan-rules.md` makes a done clause whose decision only a component or integration test proves a finding and limits a component test to what the assembled application alone shows, and `integration-tests.md` holds an integration test asserting a decision as `(blocking)`, so plan review and task review both block it.
2. An integration test proves only what the real dependency alone reveals, its done clause names that, and one test covers one adapter behaviour. The rule is structural and names no ratio.
3. An entry point calling data access directly is the adapter for that data access alone: a decision a task adds or changes inside such code is extracted into a function over plain values proven by a unit test, on a host without ports too, the code around it left as it stands.
4. An integration test is written in the task that creates or changes its adapter and never run there: the task's `Verification` lists or type-checks it, its clause needs no red evidence, the task reviewer judges it by reading, and the build's final test run runs once every integration test the change reaches, a changed test file included.
5. `test-strategy.md` holds as `(blocking)` that a test exists only for an important path or a decision and never for a name, the presence of a field or the shape of data, and that one regression gets one test, variants of one input being rows of a parameterised test.
6. A coder stops once its done clauses are met and adds no test beyond them, and `task-reviewer` blocks a test the task added that proves none of its done clauses.
7. A done clause of a `TDD: required` task states a behaviour or a decision a caller observes: a clause on a name, the presence of a field or the shape of data is a plan finding.
8. Doubles stay allowed at input and output boundaries: the plan rules have a decision delivered as a function over plain values so its unit test needs none, and `test-strategy.md` gives the coder an untagged hint to extract the decision before adding a double.
9. `viber/PRODUCT.md`, `viber/README.md` and the help page in English and Polish describe the same rules.
10. The `tests` lens of `code-auditor` hunts wasteful tests by the same rules: one angle `wasteful-tests` covering redundant tests, trivial tests and a decision asserted only by an integration test, each with its own verify step, the last one running the fast tier alone. A lens holds at most 7 angles and 9000 bytes.
11. The `design` lens of `code-auditor` hunts decisions no unit test can reach: one angle `untestable-decisions` for a decision written inside code that reaches a database, queue, broker or network, passed through the lens's gates by the tests that assert it, and the `tests` lens hands that class to it.

## Scope

### File map

- add - tests/viber/test-pyramid-prose.unit.test.ts - pins the prose of the unit-first, written-never-run and test-worth rules
- modify - viber/references/plan-rules.md - the plan rules `Layers`, `Layered`, `Provable`, `TDD`, `Sequenced`
- modify - viber/references/integration-tests.md - what an integration test covers and when it runs
- modify - viber/references/test-strategy.md - what earns a test, the duplicate rule, the double hint
- modify - viber/references/tdd.md - the cycle's exception for an integration-proven clause
- modify - viber/agents/task-coder.md - the stop rule, the integration test it writes and never runs
- modify - viber/agents/task-reviewer.md - reading an integration test, blocking a test beyond the done clauses
- modify - viber/agents/test-runner.md - a changed integration test file is selected for the final run
- modify - viber/skills/code-auditor/references/lenses/tests.md - the `wasteful-tests` angle, its verify steps and severity
- modify - viber/skills/code-auditor/references/lenses/tests.signals.md - two map signals for wasteful tests
- modify - viber/skills/code-auditor/references/lenses/design.md - the `untestable-decisions` angle, its gate and severity
- modify - viber/skills/code-auditor/references/lenses/design.signals.md - one map signal for untestable decisions
- modify - viber/skills/code-auditor/SKILL.md - the `tests` and `design` lines of the lens list
- modify - viber/skills/code-auditor/README.md - the `tests` and `design` sections listing the new angles, the ownership table
- modify - tests/viber/lenses.unit.test.ts - the lens shape caps and the new angles
- modify - viber/PRODUCT.md - the product assumptions on test layers
- modify - viber/README.md - the usage guide's paragraph on how a build tests
- modify - viber/skills/setup/assets/help.html - the same paragraph in English and Polish

### Out of scope

- The tests of this repository as a subject of the new rules: they change only where they pin the text this plan edits.
- Existing tests of a host: the rules bind only a test a task writes or changes.
- The product-file exception of `test-strategy.md` (asserting the text of a file a host declares as its product) keeps its wording.
- No new key in `.claude/viber.yml`, and no end-to-end rule changes.
- `viber/skills/fixer/SKILL.md` keeps its text: a reproduction test is still run where it is written.
- `viber/agents/planner-review.md` and `viber/agents/planner-task-review.md` keep their text: `Sliced right` and the `(review)` gate reach the new rules through `plan-rules.md` and `integration-tests.md`.
- `viber/skills/planner/SKILL.md`, `viber/skills/planner/templates/tasks.md`, `viber/skills/planner/references/adr-tasks.md`, `viber/skills/implementor/SKILL.md`, its `fragments/` and `parts/close.md`, `viber/scripts/plan-index.sh`, `viber/scripts/red-check.sh`, `viber/hooks/scripts/shell-guard.sh`, `viber/hooks/hooks.json` and `viber/.claude-plugin/plugin.json` keep their text: they name the changed files, the `TDD:` values and the agents, none of which is renamed.
- Every `CLAUDE.md` node (`viber/CLAUDE.md`, `viber/agents/CLAUDE.md`, `viber/references/CLAUDE.md`, `viber/skills/CLAUDE.md`, `viber/hooks/CLAUDE.md`, `viber/scripts/CLAUDE.md`, `viber/skills/pro-designer/CLAUDE.md`, `tests/CLAUDE.md`, `tests/viber/CLAUDE.md`): the build's memory step owns them.
- `.claude/rules/review-findings.md`, `.claude/rules/agent-frontmatter.md`, `.claude/rules/viber/contract-line-per-rule.md` and `.claude/rules/viber/agent-review-color.md` keep their text: the sentences they quote stay as they are.
- The existing suites that read the changed files (`e2e-prose`, `guard-prose`, `red-evidence-prose`, `repair-prose`, `extras-prose`, `ruling-prose`, `final-review-prose`, `close-part-prose`, `ui-tells`, `write-report-name`, `verdict-nudge`, `shell-guard`, `kill-guard`, `plan-index`, `red-check`, `code-auditor`, `lens-map-signals`) keep their text and keep passing.
- `viber/docs/configuration.md` and `viber/docs/files.md` keep their text: they describe the red-check seal and the run files, which do not change.
- `docs/viber-functions.html`, the root `README.md` and the two `viber-flow` diagrams keep their text: each statement they make stays true.

## Solution requirements

- Every added sentence is English, holds no em dash and no en dash, and states only what holds now.
- A variant of a rule a file already states extends that rule's own sentence. Only a rule no existing sentence states gets an entry of its own: the duplicate rule of `test-strategy.md`, the written-never-run bullet of `integration-tests.md`, the `wasteful-tests` and `untestable-decisions` angles with the waste procedure, the hand-off bullet of the `tests` lens and the three new map signals.
- Added text stays minimal: every reader loads a reference whole on each dispatch.
- The wording fits the models that read it: the plan rules are read on Opus 5.5 and name what they exclude by example, the files a coder or a task reviewer reads on any tier use closed lists and a check that needs no judgement (the deletion check for a duplicate), and the coder's stop rule carries the measured Sonnet 5.5 scope wording.
- Each agent file the plan edits passes `viber/skills/skill-designer/scripts/lint_skill.sh` with no FAIL.

## Tasks

<!-- TASK -->
### T1 - Prove every decision by a unit test
- TDD: required
- Covers: AC1, AC2, AC3, AC8
- Uses: C1, C2, C3
- Depends-on: none
- Files: viber/references/plan-rules.md, viber/references/integration-tests.md, viber/references/test-strategy.md, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: plan rules, integration-test rules and a test strategy under which a decision is proven by a unit test and delivered as a function over plain values, a component test proves only what the assembled application shows, an integration test proves only what the real dependency reveals, and a new prose suite pinning those sentences.
- Verification: node --test tests/viber/test-pyramid-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/root-cause-prose.unit.test.ts -> every case passes
- DoD: the `Layers` rule of `viber/references/plan-rules.md` and the first bullet of `viber/references/integration-tests.md` count an entry point calling data access as the adapter for that data access alone, as C1 and C2 word it; the `Layered` rule opens with the C1 sentences proving every decision by a unit test and delivering it as a function over plain values, extracted on a host without ports too with the code around it left as it stands, a double at a boundary staying allowed; the `Layered` rule limits a component test to what the assembled application alone shows and makes a done clause whose decision only a component or integration test proves a finding; the `Layered` rule and the third bullet of `viber/references/integration-tests.md` limit an integration test to what the real dependency alone reveals, named by its done clause, one test per adapter behaviour, the bullet tagged `(blocking)` holding one that asserts a decision as a finding; the `Construct whatever can be constructed` rule of `viber/references/test-strategy.md` carries the C3 hint to extract a decision before adding a double and stays untagged
<!-- /TASK -->

<!-- TASK -->
### T2 - Write an integration test in its task and run it once at the end
- TDD: required
- Covers: AC4
- Uses: C4, C5, C6
- Depends-on: T1
- Files: viber/references/plan-rules.md, viber/references/integration-tests.md, viber/references/tdd.md, viber/agents/task-coder.md, viber/agents/task-reviewer.md, viber/agents/test-runner.md, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: rules and agents under which an integration test is written in the task that changes its adapter, never run there, proven in the task by the test tool's listing or type-check step, read by the task reviewer and run once by the final test run, a `Repro:` test and the failing tests of a test-run report staying run.
- Verification: node --test tests/viber/test-pyramid-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/red-evidence-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/agents/task-coder.md && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/agents/task-reviewer.md && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/agents/test-runner.md -> every case passes and each lint ends on FAIL=0
- DoD: the `Layered` rule of `viber/references/plan-rules.md` closes with the C4 sentence writing an integration test in its adapter's task and never running it there, a `Repro:` test excepted, and neither `Layered` nor `Sequenced` names an `Exclusive: true` leaf task of an adapter and its test; the `Provable` rule excepts an integration test from running inside `Verification`, and the `TDD` rule marks a task writing only an adapter holding no decision and its integration test `TDD: none` and frees an integration-proven clause of a `TDD: required` task from red evidence; `viber/references/integration-tests.md` opens `## Time matters` with the C5 bullet and the `## Iron law` and `## Workflow` of `viber/references/tdd.md` except an integration-proven clause from the failing test, worked with no red or green run; `viber/agents/task-coder.md` counts an integration-proven clause as met once its test is written and listed, never runs an integration test it wrote, a `Repro:` test and the failing tests of a test-run report excepted, and keeps the generous timeout for a command that runs one, as C6 words it; the `Proven` and `Tested` checks of `viber/agents/task-reviewer.md` judge a listed integration test by reading, never run it and ask its clause for no red evidence; step 2 of `Selecting the integration tests covering the change` in `viber/agents/test-runner.md` keeps an integration test that is itself among the changed paths
<!-- /TASK -->

<!-- TASK -->
### T3 - Keep tests to one per regression and to observed behaviour
- TDD: required
- Covers: AC5, AC6, AC7
- Uses: C7, C8
- Depends-on: T2
- Files: viber/references/test-strategy.md, viber/references/plan-rules.md, viber/agents/task-coder.md, viber/agents/task-reviewer.md, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: a test strategy that blocks trivial and duplicate tests, a plan rule keeping done clauses to behaviour, a coder that stops at its done clauses and a task reviewer that blocks a test beyond them.
- Verification: node --test tests/viber/test-pyramid-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/red-evidence-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/ruling-prose.unit.test.ts && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/agents/task-coder.md && bash viber/skills/skill-designer/scripts/lint_skill.sh viber/agents/task-reviewer.md -> every case passes and each lint ends on FAIL=0
- DoD: the `Never tested` rule of `viber/references/test-strategy.md` reads as C7 words it, tagged `(blocking)`, a test existing only for an important path or a decision and never for a name, the presence of a field or the shape of data; `viber/references/test-strategy.md` carries right after it the C7 rule `One regression, one test`, tagged `(blocking)`, with variants of one input as rows of a parameterised test and the deletion check for a duplicate; the `TDD` rule of `viber/references/plan-rules.md` closes with the C7 sentence holding a done clause on a name, the presence of a field or the shape of data as a finding on `TDD: required`; the first bullet of `## Implement` in `viber/agents/task-coder.md` carries the C8 stop rule; the `Hits its target` check of `viber/agents/task-reviewer.md` holds a test the task added that proves none of its `DoD` clauses as Blocking
<!-- /TASK -->

<!-- TASK -->
### T4 - Hunt wasteful tests in the tests lens
- TDD: required
- Covers: AC10
- Uses: C9
- Depends-on: none
- Files: viber/skills/code-auditor/references/lenses/tests.md, viber/skills/code-auditor/references/lenses/tests.signals.md, viber/skills/code-auditor/SKILL.md, viber/skills/code-auditor/README.md, tests/viber/lenses.unit.test.ts
- Delivers: a `tests` lens that hunts, verifies and scores wasteful tests, two map signals leading to them, the lens list and the lens guide naming the angle, and a lens shape holding up to 7 angles and 9000 bytes.
- Verification: node --test tests/viber/lenses.unit.test.ts tests/viber/code-auditor.unit.test.ts tests/viber/lens-map-signals.test.ts -> every case passes
- DoD: the lens shape of `tests/viber/lenses.unit.test.ts` accepts a lens of 7 angles and of 9000 bytes and rejects one of 8 angles and one past 9000 bytes; `## Hunts` of `viber/skills/code-auditor/references/lenses/tests.md` carries the C9 angle `wasteful-tests` naming the redundant, trivial and misplaced classes; `## Excluded` reads as C9 words its three bullets, a gap closed at a higher layer staying excluded unless filed as misplaced, and `## Verify` carries the C9 waste procedure, its misplaced step running the fast tier alone and never the integration test, with the oracle sentence naming it; `## Severity` scores a `wasteful-tests` finding by what the tests cost, as C9 words it; `viber/skills/code-auditor/references/lenses/tests.signals.md` carries the two C9 commands with their lead-in lines, each with a single-quoted `<scope>`; `viber/skills/code-auditor/README.md` lists every angle slug of every lens file, `wasteful-tests` among them, its `tests` section naming wasteful tests on its `Audits:` line and the waste procedure on its `Verified by:` line, and the `tests` line of `viber/skills/code-auditor/SKILL.md` names wasteful tests
<!-- /TASK -->

<!-- TASK -->
### T5 - Hunt untestable decisions in the design lens
- TDD: required
- Covers: AC11
- Uses: C10
- Depends-on: T4
- Files: viber/skills/code-auditor/references/lenses/design.md, viber/skills/code-auditor/references/lenses/design.signals.md, viber/skills/code-auditor/references/lenses/tests.md, viber/skills/code-auditor/SKILL.md, viber/skills/code-auditor/README.md, tests/viber/lenses.unit.test.ts
- Delivers: a `design` lens that hunts, gates and scores a decision no unit test can reach, one map signal leading to it, a `tests` lens handing that class over, and the lens list, the lens guide and its ownership table naming the angle.
- Verification: node --test tests/viber/lenses.unit.test.ts tests/viber/code-auditor.unit.test.ts tests/viber/lens-map-signals.test.ts -> every case passes
- DoD: `## Hunts` of `viber/skills/code-auditor/references/lenses/design.md` carries the C10 angle `untestable-decisions` and its first sentence names decisions no unit test can reach; gate 7 of its `## Verify` passes an `untestable-decisions` claim through gates 3 and 4 as C10 words it, and the `3-4` line of its `## Severity` scores it; `## Excluded` of `viber/skills/code-auditor/references/lenses/tests.md` closes with the C10 bullet handing a decision no unit test can reach to the design lens, the file staying within 9000 bytes; `viber/skills/code-auditor/references/lenses/design.signals.md` carries the C10 mock-density command with its lead-in line; `viber/skills/code-auditor/README.md` lists `untestable-decisions` under `design` and its ownership table hands a decision no unit test can reach from `tests` to `design` under that angle, and the `design` line of `viber/skills/code-auditor/SKILL.md` names untestable decisions
<!-- /TASK -->

<!-- TASK -->
### T6 - Describe the test rules in the product notes and the guides
- TDD: none
- Covers: AC9
- Uses: C11
- Depends-on: T3
- Files: viber/PRODUCT.md, viber/README.md, viber/skills/setup/assets/help.html
- Delivers: product notes, a usage guide and a help page in English and Polish stating the unit-first rule, the integration test written in its task and run once, and one test per regression.
- Verification: grep -q "never run there" viber/references/integration-tests.md && grep -q "never run there" viber/PRODUCT.md && grep -q "One regression, one test" viber/references/test-strategy.md && grep -q "one test per regression" viber/PRODUCT.md && grep -q "without running it" viber/README.md && grep -q "without running it" viber/skills/setup/assets/help.html && grep -q "bez uruchamiania" viber/skills/setup/assets/help.html && node --test tests/viber/help.unit.test.ts -> every grep exits 0 and the help suite passes
- DoD: `viber/PRODUCT.md` states that a decision is proven by a unit test, that a component test proves only what the assembled application shows, that an integration test proves only what the real dependency reveals and is written in its adapter's task and never run there, that a build writes one test per regression and none for a name or a data shape, and that a double is allowed at a boundary while a decision is shaped as a function over plain values; `viber/README.md` carries the C11 English paragraph after its paragraph on the `TDD: required` seal; `viber/skills/setup/assets/help.html` carries the C11 paragraph in English and in Polish after its paragraphs on the `TDD: required` seal
<!-- /TASK -->

## Contracts

### C1 - Plan rules: decisions and layers

File: viber/references/plan-rules.md

The `integration` parenthesis of `Layers`:

`integration` (one adapter against its real dependency, started disposably for the test run; an entry point calling data access directly counts as the adapter for that data access alone, never for a decision inside it)

The opening of `Layered`, ahead of the sentence starting "The adapter task stays":

Every decision (a branch, a rule, a calculation, a validation) is proven by a unit test and delivered as a function over plain values wherever the code allows, so that test needs no double; a double at an input or output boundary stays allowed. A decision a task adds or changes inside code reaching a database, queue, broker or network is extracted into such a function, on a host without ports too, the code around it left as it stands. A component test proves only what the assembled application alone shows: routing, wiring across layers, serialisation through the entry point. A done clause whose decision only a component or integration test proves is a finding, and so is a unit or component test needing a real database, queue, broker or network. An integration test proves only what the real dependency alone reveals (a query's result, a mapping, a constraint, a transaction): its done clause names that, and one test covers one adapter behaviour, never one test per case.

### C2 - Integration-test rules: what a test covers

File: viber/references/integration-tests.md

The close of the first bullet of `## What it runs against`:

an entry point that calls data access directly counts as the adapter for that data access alone, never for a decision inside it. (blocking)

The third bullet of `## What it runs against`:

- An integration test proves only what the real dependency alone reveals (a query's result, a mapping, a constraint, a transaction), and the done clause it proves names that. One asserting a decision, or a case a unit or component test proves or could prove, is a finding, and so is a second test of a behaviour another integration test covers: one test per adapter behaviour. (blocking)

### C3 - Test strategy: the double hint

File: viber/references/test-strategy.md

- Construct whatever can be constructed. A double for a value, a record or a single config lookup hides the real shape. A test needing a double to reach a decision points at the code's shape: extract the decision into a function over plain values and test that, before adding the double.

### C4 - Plan rules: written, never run

File: viber/references/plan-rules.md

The close of `Layered`, in place of the sentence starting "The adapter task stays":

An integration test is written in the task that creates or changes its adapter and never run there, a `Repro:` test excepted: that task's `Verification` runs the test tool's own listing or type-check step plus a grep of one identifier on both sides, the test and the adapter declaring it, and the build's final test run runs the test once.

The run sentence of `Provable`, its part after the comma kept as it stands:

The test proving each done clause runs inside the task's `Verification` command, an integration test excepted, which the Layered rule proves without running it,

One more case in the `TDD: none` list of `TDD`, after the `Repro:` case:

writes only an adapter holding no decision and its integration test (Layered);

One more sentence of `TDD`:

On a `TDD: required` task a done clause proven by an integration test needs no red evidence.

The opening of `Sequenced`, its `from Layered` clause absent:

the plan-wide clauses moved out of three `## Task` rules, each kept in its own wording:

### C5 - References: an integration test is never run in its task

File: viber/references/integration-tests.md, viber/references/tdd.md

The first bullet of `## Time matters` in `integration-tests.md`:

- An integration test is written in the task that creates or changes its adapter and never run there, a `Repro:` test excepted: the task's `Verification` lists or type-checks it, the build's final test run runs it once, and the whole layer belongs to continuous integration.

The last sentence of the first paragraph of `## Iron law` in `tdd.md`:

A test never watched failing on an assertion backs no `DoD` clause, a clause the task proves by an integration test excepted: write that test and its code with no red or green run, since `Verification` only lists or type-checks it.

The clause sentence of `## Workflow` in `tdd.md`:

The behaviors are the plan task's numbered `DoD` clauses, one failing test each, an integration-proven clause excepted (Iron law), worked in their numbered order: never start a clause before the one above it is green.

### C6 - Agents: an integration test is never run in its task

File: viber/agents/task-coder.md, viber/agents/task-reviewer.md, viber/agents/test-runner.md

The clause sentence of the `TDD: required` bullet in `task-coder.md`:

Each numbered `DoD` clause is one behaviour, and counts as met on your `DOD:` line only with a test that fails without it; a clause proven by an integration test counts as met once that test is written and `Verification` lists or type-checks it.

One more sentence in the `test-strategy.md` bullet of `task-coder.md`, after the sentence on `integration-tests.md`:

An integration test you write is the one test you never run, a `Repro:` test and the failing tests of a test-run report excepted: `Verification` only lists or type-checks it, and the build's final test run runs it once.

The timeout sentence of `## Prove it green` in `task-coder.md`:

A command that runs an integration test (a `Repro:` test, the failing tests of a test-run report) uses an explicit generous timeout measured in minutes: the default cuts it off and comes back as a false red.

The timeout sentence of `Proven` in `task-reviewer.md`, followed by one more sentence:

A `Verification` or `recheck:` command that runs an integration test uses an explicit generous timeout measured in minutes: the default cuts it off and comes back as a false red. An integration test that `Verification` only lists or type-checks is never run: judge it by reading.

The close of the adapter clause of `Tested` in `task-reviewer.md`:

that proof belongs to the adapter's own integration test, whose clause needs no red evidence.

Step 2 of `Selecting the integration tests covering the change` in `test-runner.md`:

2. Through the layer marker convention, find every test marked integration. Keep each one that is itself among the changed paths, or whose adapter file, or a file that adapter depends on (a migration, a schema, shared data access), is among them.

### C7 - Test worth: what earns a test

File: viber/references/test-strategy.md, viber/references/plan-rules.md

The `Never tested` rule of `test-strategy.md`, whole:

- A test exists only for an important path or a decision in the logic: name the regression in behaviour a caller observes that it would catch; no answer means no test. Never tested: accessors, trivial constructors, data holders without behaviour, 1:1 mappings, framework behaviour, third-party library internals, an assertion true by construction, a name, the presence of a field, the shape of data. A test that fails on a refactor keeping the observed behaviour is a finding. (blocking)

The rule right after it in `test-strategy.md`:

- One regression, one test: two tests failing on exactly the same regressions are one test too many, whatever their layer, and variants of one input belong in the framework's parameterised form, one row each. A test whose deletion leaves every regression still caught is a duplicate. (blocking)

One more sentence closing `TDD` in `plan-rules.md`:

On `TDD: required` each done clause states a behaviour or a decision a caller observes: a clause on a name, the presence of a field or the shape of data is a finding, since it belongs in a `## Contracts` block or a `TDD: none` task.

### C8 - Agents: no test beyond the done clauses

File: viber/agents/task-coder.md, viber/agents/task-reviewer.md

The first bullet of `## Implement` in `task-coder.md`, whole:

- Deliver exactly what `Delivers` and `DoD` describe: no tests, docs, comments or files beyond what they and `Files` name. Once every `DoD` clause is met and `Verification` is green, stop and report: don't add features, tests, files, docs or refactors the task did not ask for, and one you think would help goes into your notes instead of the tree. A pre-existing bug you find outside them goes into your notes, unfixed.

One more sentence in `Hits its target` of `task-reviewer.md`, ahead of "Your report cites clause numbers.":

A test this task added that proves none of its `DoD` clauses is Blocking: the task asked for no test beyond them.

### C9 - Tests lens: the wasteful-tests angle

File: viber/skills/code-auditor/references/lenses/tests.md, viber/skills/code-auditor/references/lenses/tests.signals.md

The close of the first sentence of `tests.md`, after "and tests that are skipped or never run":

; and whether they cost more than they prove.

The seventh angle of `## Hunts`, a level-3 heading `wasteful-tests` followed by this paragraph:

Redundant: two tests failing on exactly the same regressions, or variants of one input outside a parameterised form. Trivial: assertions only on a name, a field's presence, a data shape, an accessor or a constant. Misplaced: a decision only an integration test asserts, though a unit test could reach it.

Three bullets of `## Excluded`, in place of the bullets on trivial getters, on test style and on a gap closed at a higher layer:

- A missing test for a trivial getter, setter, DTO or constant.
- Test style, structure, naming, repeated set-up code and readability.
- A gap already closed by a test at a higher layer, unless filed as misplaced: the mutant is killed there.

The oracle sentence opening `## Verify`:

The oracle is a surviving mutant for a coverage or assertion finding, a reproduced failure for a flakiness finding, the dead-test procedure for a dead-test finding and the waste procedure for a `wasteful-tests` finding.

The procedure after the dead-test procedure:

Waste procedure:
1. Redundant: run the mutants of mutation step 3 with the cited test removed; every mutant it kills is still killed, VERIFIED; one survives, REFUTED.
2. Trivial: apply a change keeping the observed behaviour (a rename, a reorder); the cited test fails and alone kills no behaviour mutant, VERIFIED; else REFUTED.
3. Misplaced: an integration test asserts the decision; mutate it and run the fast tier alone, never the integration test; the mutant survives, VERIFIED; a unit or component test kills it, REFUTED.

One more sentence after the first sentence of `## Severity`:

A `wasteful-tests` finding scores by the tests' cost.

The close of the `4-6` line and one more sentence on the `1-3` line:

; a core decision proven only in the integration layer, or redundant integration tests.

Redundant or trivial tests in the fast tier.

Two signals closing `tests.signals.md`, each a lead-in line and a `bash` block, and the phrase ", wasteful" after "mock-heavy" in its first sentence:

Test declarations per test file; far more tests than the source has branches is a duplication lead:

git -c core.quotePath=false grep -c -E '^[[:space:]]*(it|test)[(]|^[[:space:]]*def test_|^func Test|@Test|\[(Fact|Theory|Test|TestMethod)\]|#\[test\]' -- '<scope>' | sort -t: -k2 -nr | head -30

Integration test files per directory, told by path alone; a directory rich in them is a misplaced-layer lead:

git -c core.quotePath=false ls-files -- '<scope>' | grep -E '(^|/)(tests?|__tests__|specs?|e2e|cypress)/|[._-](test|spec|cy)[.]|(^|/)test_|(Test|Tests|Spec)[.][A-Za-z]+$' | grep -i -E '(^|/)(integration|integ)[^/]*/|[._-](integration|integ|it)[._-]|integration(tests?|spec)?[.]|[.]integrationtests/' | sed 's|/[^/]*$||' | sort | uniq -c | sort -nr | head -30

### C10 - Design lens: the untestable-decisions angle

File: viber/skills/code-auditor/references/lenses/design.md, viber/skills/code-auditor/references/lenses/design.signals.md, viber/skills/code-auditor/references/lenses/tests.md

One more phrase in the first sentence of `design.md`, after "dependencies pointing the wrong way":

, decisions no unit test can reach

The seventh angle of `## Hunts` in `design.md`, a level-3 heading `untestable-decisions` followed by this paragraph:

A decision (a branch, a rule, a calculation, a validation) written inside code that reaches a database, queue, broker or network, so a test reaches it only through the real dependency or a chain of doubles. Name the decision and the function over plain values that would hold it.

One more sentence closing gate 7 of `## Verify` in `design.md`:

An untestable-decisions claim passes 3 by a change to the decision and 4 by its tests: only integration tests assert it, its unit test builds 3 or more doubles, or none asserts it.

One more sentence closing the `3-4` line of `## Severity` in `design.md`:

A decision reachable only through the real dependency or 3 or more doubles.

One more bullet closing `## Excluded` of `tests.md`:

- A decision no unit test can reach as written: the design lens.

One signal closing `design.signals.md`, a lead-in line and a `bash` block:

Mock density per test file; the source a mock-heavy test covers is an untestable-decisions lead:

git -c core.quotePath=false grep -c -E 'jest[.]mock|vi[.]mock|mock[.]patch|@patch[(]|MagicMock|mocker[.]|Mockito|sinon[.]|toHaveBeenCalled|gomock|[.]On[(]|new Mock<|Substitute[.]For|mockk|every [{]|instance_double|allow[(]|createMock[(]|page[.]route|cy[.]intercept' -- '<scope>' | sort -t: -k2 -nr | head -30

### C11 - Guides: the paragraph on test rules

File: viber/README.md, viber/skills/setup/assets/help.html

English, in both files:

Every decision in the code is proven by a unit test, and a build writes one test per regression and none for a name or a data shape. An integration test proves only what the real dependency reveals: its task writes it without running it, and the final run runs it once.

Polish, in `help.html`:

Każdą decyzję w kodzie dowodzi test jednostkowy, a build pisze jeden test na regresję i żadnego dla nazwy czy kształtu danych. Test integracyjny dowodzi tylko tego, co ujawnia prawdziwa zależność: zadanie pisze go bez uruchamiania, a końcowe uruchomienie wykonuje go raz.

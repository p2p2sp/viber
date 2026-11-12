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

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# One source for the test rules, aligned with the testing compendium

## Goal

Every viber role that plans, writes, reviews or audits tests holds the same test rules, read from one place and cited by the same names. The rules follow the user's testing compendium: tests go through the public contract, most proof sits in fast in-memory tests, a use case is proven by a component test on fakes, and integration tests stay few. The change removes the gaps between today's four differently worded statements of the rules, through which tests of implementation details reach host projects.

## Problem

An audit of about 110 tests added by viber task commits in 10 repositories found tests of data shape, member counts, private members through reflection, source text, mocks of the code's own modules and call counts. About 70% were asked for by a `DoD` or `Delivers` clause, about 25% were copied by the coder from a pattern nearby, and the rest came from a task reviewer, a project rule, a contract block or a code-auditor hunter. The rules are stated four times in different words (`plan-rules.md`, `test-strategy.md` with `tdd.md`, the code-auditor lenses, the user documents), and the leaks sit in the differences. viber also forbids implementation tests without offering the compendium's main route, a component test on fakes of ports, so code touching a database or the network leaves an agent with reflection, a source scan, an internal mock or a test on the real database.

## Current behaviour

- `plan-rules.md` defines the layers itself (`Layers`), asks for every decision as a function over plain values proven by a unit test (`Layered`), and bars a done clause about a name, a field or a shape only on `TDD: required`, in the last sentence of the `TDD` rule.
- A component test is only the whole application run from its entry point, proving routing, wiring and serialisation. A stack with no in-process hosting has no component layer.
- A port and a test substitute are planned only where the host already uses ports.
- `test-strategy.md` is one flat list read whole by `task-coder`, `task-reviewer` and `fixer`. The ban on mocking internal collaborators and on asserting call counts stands only in `tdd.md`, read on `TDD: required`.
- `task-coder` adds whatever tests a `DoD` clause names. `task-reviewer` has no rule against a test a clause asked for.
- The code-auditor lenses state their own test rules, and a hunter reads nothing under `references/`.
- `rule-admission.md` admits a project rule that asks for a test the plugin forbids.

### Must not change

- The end-to-end sentences `tests/viber/e2e-prose.unit.test.ts` pins stay word for word: the end-to-end bullet of `test-strategy.md` and the end-to-end sentences of the `Layers`, `TDD`, `Provable`, `Owned` and `End-to-end` rules.
- An integration test is written in the task of its adapter, never run there, listed or type-checked by `Verification` and run once by the final test run.
- Every sentence of `task-coder.md`, `task-reviewer.md`, `tdd.md` and `test-runner.md` that a prose test pins and this plan does not name stays word for word, the `RED:` and `red-check:` contract and the four `Blocking [<cause>]` causes included.
- Every rule of `plan-rules.md` stays on one physical line, tagged `(script)` or `(review)`, inside its `## ` section.
- Each lens file keeps its four headings, its angle slugs and their order, at most 7 angles, no bash block and at most 9000 bytes.
- No `CLAUDE.md` file is edited.
- Every file is in English, states only what holds now and carries no em dash and no en dash.

## Behaviour

### S1 - A done clause asking for a shape test is refused at plan review [CHANGED - was: a finding only on `TDD: required`, from a sentence inside the `TDD` rule]

The planner writes every done clause as an outcome a caller observes. The plan reviewer reads the same test rules and reports the clause under the rule's name.

Given a plan whose `TDD: required` task carries the done clause "the handler class is internal sealed", or whose `TDD: none` task carries "the contract tests pin the members of the status enum"
When the plan reviewer gates the plan
Then it reports a Blocking finding under `Observable` for either clause, and none for a `TDD: none` clause stating that a shape is declared as its contract block gives it

### S2 - A use case's decision is proven by a component test on fakes [CHANGED - was: every decision extracted into a function over plain values and proven by a unit test, a component test proving only routing, wiring and serialisation]

Given a task adding a decision to a use case that reads and writes through ports
When the planner writes its done clauses and the coder proves them
Then the proof is a component test calling the use case through its public entry with the fakes of its ports, and no function is extracted for the decision alone

### S3 - A task touching a dependency with no port brings the port, the fake and the contract test [CHANGED - was: a port and a test substitute only where the host already used ports]

Given a task changing behaviour inside code that calls a database directly
When the planner maps its files
Then the task's `Files` hold a port for the operations the task uses, the one fake of that port, and a contract test the fake passes as a unit test and the adapter passes as its integration test

### S4 - A coder meets a done clause only a forbidden test could prove [NEW]

Given a task file whose done clause asks for "a test asserting the request has exactly 14 properties"
When the coder reaches that clause
Then it writes no such test and ends on `VERDICT: FAIL` with the clause number in `REASON` and the `DECIDE:` line

### S5 - A project rule asks for a forbidden test [NEW]

Given a host rule under `.claude/rules/` asking for tests that read the source as text
When a coder writes tests for a task that rule loads on
Then the coder writes none of that kind and names the rule in its notes, and a later `/viber:rules` run reports the rule line as failing the admission gate

### S6 - A reviewer meets a forbidden test [CHANGED - was: no rule against a test a done clause asked for]

Given a task whose diff adds a test reading a private field through reflection
When the task reviewer gates it
Then the test is a Blocking finding naming `Public`, with the cause `plan` when a done clause asked for it, and the reviewer never asks for such a test

### S7 - The auditor hunts and proves by the same rules [CHANGED - was: the lenses stated their own rules and a hunter read nothing under `references/`]

Given a tests-lens audit of a suite holding a test that mocks a module of the code's own
When a hunter investigates it
Then the finding's `CLASS:` opens with `over-mocking` and names `Boundary`, and any test the hunter writes as proof calls the code through its public contract

### S8 - A harness task makes the rules mechanical [NEW]

Given a plan that creates the test harness or the layer marker convention of a host
When the planner writes the harness task
Then that task also makes a test with no layer marker fail and the fast tests unable to open a network connection, by the test framework's own mechanism

### Edge cases

- A stack with no in-process hosting -> it still has component tests, assembled by hand, and only the whole application run from its entry point is unavailable.
- A decision complex enough to be an entity with its own contract -> it keeps its own function and unit test.
- A call that is the behaviour and leaves no state to observe, such as sending a notification -> a test may verify the call.
- A collaborator too slow for a fast test, such as a password hasher -> a double may stand for it.
- A rule over the whole codebase, such as the direction of dependencies between modules -> one test per rule is allowed.
- A file the host declares as its product, such as a document, a configuration or a prompt -> a test may read its text.
- A test the task leaves otherwise unchanged -> it keeps the layer marker it has.
- An adapter a task creates or changes that has no integration test -> a finding.
- A bug in code that reaches a dependency with no port -> the reproduction test may reach the real dependency, and the fix plan brings the port, the fake and the contract test.
- A suite whose integration tests exceed about a tenth of its tests -> the tests lens treats it as a candidate for misplaced decisions.

## Glossary

- Outside world - whatever leaves the test process or is not deterministic. Not another module of the same code.
- Fast tests - the unit and component tests together, the ones a developer machine runs.
- Port - an interface in the domain's language through which the code reaches one external dependency.
- Authoritative fake - the one working in-memory implementation of a port, kept in the shared test fixtures. Not a mock built inside one test.
- Contract test - a black-box test suite written against a port alone, passed by the fake and by the real adapter. Not a test of a type's shape.
- Read set - the instruction files and file sections one role loads on a dispatch.

## Acceptance criteria

1. `viber/references/test-strategy.md` is the one file defining the test layers and the tests that may be written, as named rules under the sections `## Layers`, `## Proves`, `## Ports` and `## Writing`.
2. The layer rules define unit, component, integration and end-to-end as the compendium does and say where each kind of thing is proven: a use case's decisions by a component test on fakes, and an integration test only once a fast test covers the logic using its adapter.
3. Every external dependency is reached through a port with one authoritative fake and a contract test, always for a new dependency and at the touched seam for code with no port, and an adapter passes that contract as its integration test.
4. The rules on what a test proves and how it is written cover the public contract, state over interactions, the place and order of doubles, source text, what is never tested, the architecture exception, literal expected values, injected time and randomness, and the marker of an unchanged test.
5. `plan-rules.md` points at those rules and defines none of them: a `TDD: required` done clause states an observable outcome, a `TDD: none` clause states what its artefact holds and is proven by `Verification` alone, no clause under either value asks for a forbidden test, a contract block is never the target of a test, a task plans the port, fake and contract test, and a harness task carries the two mechanical checks.
6. The planner and the plan reviewers read the layer, proof and port sections and report a breach under the rule's name.
7. `task-coder` refuses a done clause only a forbidden test could prove and takes no project rule as a precedent for one, `task-reviewer` blocks a forbidden test and never asks for one, `fixer` reads the same rules, and `tdd.md` holds no list of forbidden tests of its own.
8. `rule-admission.md` keeps a way of writing tests that the test rules forbid out of `.claude/rules/`.
9. The code-auditor hunts by the same rules and names them: a hunter's proof test holds them, the tests lens covers doubles for the code's own modules, tests of structure and an oversized integration layer, and the design lens names the missing port.
10. A unit test holds the text each of five roles reads on a dispatch to at most 115% of its size before this change.
11. A replay sample of ten done clauses that must be reported and five that must not is recorded in the repository, free of any customer's names.
12. `PRODUCT.md`, `README.md` and both languages of the help page describe the same test rules.

## Scope

### File map

- modify - viber/references/test-strategy.md - the one definition of the layers and of the tests that may be written, in four sections of named rules
- modify - viber/references/integration-tests.md - what an integration test runs against, now naming the contract test and the missing adapter test
- modify - viber/references/plan-rules.md - the plan's own rules about tests, pointing at the test rules
- modify - viber/references/tdd.md - the red-green-refactor cycle, without its own list of forbidden tests
- modify - viber/references/rule-admission.md - the admission gate, barring forbidden test habits
- modify - viber/skills/planner/SKILL.md - the planner's reading of the test rules
- modify - viber/agents/planner-review.md - the single plan reviewer's reading of the test rules
- modify - viber/agents/planner-task-review.md - the task slice reviewer's reading of the test rules
- modify - viber/agents/task-coder.md - the coder's action on a clause or a project rule asking for a forbidden test
- modify - viber/agents/task-reviewer.md - the reviewer's sections and its finding for a forbidden test
- modify - viber/skills/fixer/SKILL.md - the sections read before the reproduction test
- modify - viber/skills/code-auditor/SKILL.md - the `Test rules:` line of a hunter brief
- modify - viber/agents/hunter.md - the hunter's reading of the test rules and its proof tests
- modify - viber/skills/code-auditor/references/lenses/tests.md - the `over-mocking` and `wasteful-tests` angles
- modify - viber/skills/code-auditor/references/lenses/design.md - the `untestable-decisions` angle
- modify - viber/skills/code-auditor/README.md - the lens descriptions for people
- modify - viber/PRODUCT.md - the product assumptions on tests
- modify - viber/README.md - the usage guide's test rule sentences
- modify - viber/skills/setup/assets/help.html - the help page's test rule paragraphs, `en` and `pl`
- modify - tests/viber/test-pyramid-prose.unit.test.ts - the pins of the test rule prose
- modify - tests/viber/lenses.unit.test.ts - the pins of the lens and auditor prose
- modify - tests/viber/rules-trail-prose.unit.test.ts - the pins of `rule-admission.md`
- add - tests/viber/rule-budget.unit.test.ts - the cap on each role's read set
- add - tests/viber/replay/done-clauses.md - the replay sample of done clauses

### Out of scope

- Cleaning the existing tests of host projects.
- Changing the layer markers existing host tests carry.
- Adding the two mechanical checks to a host that already has its harness.
- The compendium's time budgets and layer proportions, the one tenth signal of the tests lens excepted.
- Running the replay: after the build and before the release, the sample is replayed by hand against the new reviewer and coder instructions, and a miss is fixed as a follow-up change.
- A byte cap on `planner-spec-review`, `planner-graph-review` and `planner-task-review`: the cap test measures the five roles the input names, `planner-review` standing for the plan reviewer.
- `viber/references/CLAUDE.md`, `tests/viber/CLAUDE.md`, `viber/CLAUDE.md` and `viber/skills/CLAUDE.md`: the build close's memory step records the new readers, sections and change-together lists.
- `tests/viber/e2e-prose.unit.test.ts`: every sentence it pins stays word for word.
- `viber/agents/planner-spec-review.md` and `viber/agents/planner-graph-review.md`: they keep reading their own sections of `plan-rules.md`, through which the changed `Block body` and `Shared harness` rules reach them.
- `viber/agents/rules-auditor.md` and `viber/agents/rules-writer.md`: they keep reading `rule-admission.md` whole, through which the new bullet reaches them.
- `viber/agents/test-runner.md`, `viber/agents/final-reviewer.md`, `viber/agents/critic.md`, `viber/agents/mapper.md` and `viber/agents/scout.md`: their steps stay as they are.
- `viber/skills/code-auditor/references/lenses/tests.signals.md` and `design.signals.md`: their commands and lead-in lines stay true.
- `docs/viber-functions.html`: its lines on TDD and on the `over-mocking` angle stay true.
- `viber/docs/configuration.md`, `viber/skills/setup/SKILL.md`, its templates and `viber/references/node-doctrine.md`: the fast command and the layer marker convention keep their meaning.
- The other four lenses: a hunter's proof test on them is bound through `hunter.md` alone.
- End-to-end tests.

## Solution requirements

- The cap on a role's read set is 115% of its size before the change (the user's answer during planning, replacing the 10% of the interview).
- The compendium enters as short rules. Its examples, tables and tool configurations stay out.
- An existing rule is extended inside its own sentence. A new bullet is written only for a rule that is new.
- A section of `test-strategy.md` is read by range: `Grep` for the `## ` lines, then `Read` the section, as the plan reviewers already read `plan-rules.md`.
- The replay sample carries no name, identifier or text of a customer project.
- The rules bind hosts of every kind: a host with no test layer still gets no test framework.

---
source: C:/Projects/viber/docs/_specs/2026-11-13-16-07-20_one-source-for-the-test-rules-aligned-with-the-testing-compe/plan.md
---

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

## Tasks

<!-- TASK -->
### T1 - Split the test rules into sections with layer and port rules
- TDD: required
- Covers: AC1, AC2, AC3
- Uses: C1
- Depends-on: none
- Files: viber/references/test-strategy.md, viber/references/integration-tests.md, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: `test-strategy.md` in the four sections of C1, with the new `## Layers` and `## Ports` rules and today's bullets placed under `## Proves` and `## Writing`, and `integration-tests.md` naming the contract test.
- Verification: node --test tests/viber/test-pyramid-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts -> every test passes, the new section, layer and port cases included
- DoD: `test-strategy.md` holds the headings `## Layers`, `## Proves`, `## Ports` and `## Writing` in that order and no other `## ` heading; `## Layers` holds one bullet each for `Outside`, `Unit`, `Component`, `Integration`, `E2E` and `Proof` stating what C1 gives it, `Component` holding the ban on an in-memory database and the whole application run in the test process as a component test kept to a few per entry point; `Proof` names the unit test for a domain rule, the component test on fakes for a use case's decisions and error paths, the integration test only once a unit or component test covers the logic using its adapter, an own function and unit test only for a decision complex enough to be an entity with its own contract, and the exemption of a `Repro:` reproduction test on code with no port; `## Ports` holds `Ported` as C1 states it, always for a new dependency and at the seam a task touches for code with no port; `integration-tests.md` states that the adapter passes its port's contract test as an integration test and that an adapter a task creates or changes with no integration test is a finding; every bullet `test-strategy.md` held before stays word for word under `## Proves` or `## Writing` as C1 places it, the bullet on real collaborators where C1 places `Boundary`, and the component bullet alone gone into `Component`
<!-- /TASK -->

<!-- TASK -->
### T2 - State what a test may prove and how it is written
- TDD: required
- Covers: AC1, AC4
- Uses: C1
- Depends-on: T1
- Files: viber/references/test-strategy.md, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: the named rules of `## Proves` and `## Writing` as C1 states them, within the sizes C1 sets.
- Verification: node --test tests/viber/test-pyramid-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts -> every test passes, the named rule and size cases included
- DoD: every bullet of the file opens with its C1 name, each C1 name opens exactly one bullet, and the file and its sections stay within the sizes of C1; `Public` bars a private member, reflection, a widened visibility, a method added for a test and a test of an internal class on its own; `State` asks for the result or the state a caller observes and bars a call, a call count and a call order on a collaborator, excepting a call that is the behaviour and leaves no state to observe; `Earned` adds a count of fields, members or entries, a type's visibility or modifiers, an export and a registration to what is never tested, and `Architecture` allows one test per rule over the whole codebase and no test of one type's structure; `Boundary` lets a double stand only for the outside world or for a collaborator too slow for a fast test, never for another module of the code's own, in the order real implementation, fake, stub, mock, and never for a type the project does not own; `Literal` asks for expected values written as literals, `Isolated` names the injected clock, randomness and identifiers, `Marked` keeps the marker of a test the task leaves otherwise unchanged, and the sentence on extracting a decision into a function over plain values is gone
<!-- /TASK -->

<!-- TASK -->
### T3 - Point the plan rules at the test rules
- TDD: required
- Covers: AC5
- Uses: C1, C3
- Depends-on: T2
- Files: viber/references/plan-rules.md, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: the plan rules of C3: `Layers` and `Layered` pointing at the test rules, the new `Observable` rule, and the changed `TDD`, `Owned`, `Shared harness` and `Block body` rules.
- Verification: node --test tests/viber/test-pyramid-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/root-cause-prose.unit.test.ts -> every test passes, the changed plan rule cases included
- DoD: `Layers` names `unit`, `component`, `integration` and `e2e` by pointing at `## Layers` of `test-strategy.md`, defines none of them itself and keeps its sentence on an existing `e2e` spec; `Layered` gives each done clause the layer `Proof` names, makes a clause whose decision only an integration test proves a finding, keeps its sentence on how an integration test's task verifies it, and no longer asks for a function over plain values; `Observable` stands in `## Task` on one line tagged `(review)` and states, as C3 gives it, the observable outcome a `TDD: required` clause names, the artefact a `TDD: none` clause names with `Verification` as its only proof, and the finding for a clause asking for a test `## Proves` rules out; `TDD` no longer holds the sentence on a clause about a name, a field or a shape, nor the `TDD: none` case of a host with no component layer; `Owned` names the port, the fake and the contract test `Ported` asks for in place of the limit to hosts already using ports, and `Block body` bars an instruction on how to test a shape; `Shared harness` no longer denies a component layer to a stack with no in-process hosting, gives the harness task the shared fixtures holding the fakes and the two mechanical checks of C3, and `plan-rules.md` is at most 19000 bytes
<!-- /TASK -->

<!-- TASK -->
### T4 - Cap the rule text each role reads
- TDD: required
- Covers: AC10
- Uses: C4
- Depends-on: T3
- Files: tests/viber/rule-budget.unit.test.ts
- Delivers: the unit test measuring the five read sets of C4 against their caps, with the measuring function proven on synthetic input.
- Verification: node --test tests/viber/rule-budget.unit.test.ts -> every test passes
- DoD: a read set one byte over its cap is reported with the role, its bytes and its cap, and a read set exactly at its cap passes; an entry naming sections counts only the bytes from each `## ` heading to the next `## ` heading or the end of the file; the five read sets of C4 stay within their caps on the tree
<!-- /TASK -->

<!-- TASK -->
### T5 - Have the planner and the plan reviewers read the test rules
- TDD: required
- Covers: AC6
- Uses: C1, C2, C3
- Depends-on: T4
- Files: viber/skills/planner/SKILL.md, viber/agents/planner-review.md, viber/agents/planner-task-review.md, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: the planner and its two reviewers reading the sections C2 gives them and gating the plan rules of C3 against them.
- Verification: node --test tests/viber/test-pyramid-prose.unit.test.ts tests/viber/e2e-prose.unit.test.ts tests/viber/nudge-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/portability.unit.test.ts -> every test passes, the planner and reviewer cases included
- DoD: step 1 of `viber/skills/planner/SKILL.md` reads `## Layers`, `## Proves` and `## Ports` of `test-strategy.md` by range before a task is written; `planner-review.md` and `planner-task-review.md` read the same three sections by range and gate `Observable`, `Layered` and `Owned` against them, reporting a breach under the rule's name; none of the three files states a layer definition or a list of tests never written of its own
<!-- /TASK -->

<!-- TASK -->
### T6 - Have the coder, the reviewer and the fixer hold the test rules
- TDD: required
- Covers: AC7
- Uses: C1, C2
- Depends-on: T5
- Files: viber/agents/task-coder.md, viber/agents/task-reviewer.md, viber/skills/fixer/SKILL.md, viber/references/tdd.md, tests/viber/test-pyramid-prose.unit.test.ts
- Delivers: the coder's refusal of a clause or a project rule asking for a forbidden test, the reviewer's sections and its finding for such a test, the fixer's sections, and `tdd.md` without its own list of forbidden tests.
- Verification: node --test tests/viber/test-pyramid-prose.unit.test.ts tests/viber/red-evidence-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/ruling-prose.unit.test.ts tests/viber/final-review-prose.unit.test.ts tests/viber/failure-trail-prose.unit.test.ts tests/viber/ui-tells.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/portability.unit.test.ts -> every test passes, the coder, reviewer, fixer and cycle cases included
- DoD: `task-coder.md` ends the task on `VERDICT: FAIL` with the clause number and the `DECIDE:` line for a `DoD` clause only a test the test rules forbid could prove, on either `TDD` value; `task-coder.md` takes neither a surrounding test nor a project rule asking for a forbidden test as a precedent, writes no such test and names the project rule in its notes; `task-reviewer.md` reads `## Layers`, `## Proves` and `## Writing` by range, and `## Ports` when the task's `Files` hold a port, its fake or its contract test, raises a test a `(blocking)` rule forbids as Blocking naming the rule, with the cause `plan` when a `DoD` clause asked for it, and never asks for such a test; `viber/skills/fixer/SKILL.md` reads `## Layers`, `## Proves` and `## Writing` by range before writing the reproduction test and writes it in the layer `Proof` gives the diverging behaviour, in place of the unit at the diverging layer, reaching the real dependency only where the diverging code has no port; `tdd.md` keeps horizontal slicing as its only anti-pattern and its Red step names `Public`
<!-- /TASK -->

<!-- TASK -->
### T7 - Have the auditor hunt and prove by the test rules
- TDD: required
- Covers: AC9
- Uses: C1, C2, C5
- Depends-on: T4
- Files: viber/skills/code-auditor/SKILL.md, viber/agents/hunter.md, viber/skills/code-auditor/references/lenses/tests.md, viber/skills/code-auditor/references/lenses/design.md, viber/skills/code-auditor/README.md, tests/viber/lenses.unit.test.ts
- Delivers: the `Test rules:` line reaching every hunter, the hunter reading `## Proves`, and the angles of C5 in both lenses and in the README.
- Verification: node --test tests/viber/lenses.unit.test.ts tests/viber/guard-prose.unit.test.ts tests/viber/rule-budget.unit.test.ts tests/portability.unit.test.ts -> every test passes, the hunter brief, hunter and angle cases included
- DoD: every hunter brief of `viber/skills/code-auditor/SKILL.md` carries the `Test rules:` line of C2; `hunter.md` lists the `Test rules:` input, reads its `## Proves` by range before hunting on the tests lens and before writing a test as proof on any lens, and holds a proof test to that section; `over-mocking` covers a double standing for a module of the code's own and a test asserting only interactions, a finding naming `Boundary` or `State`; `wasteful-tests` keeps Redundant, Trivial and Misplaced, Trivial covering what `Public`, `Source` and `Earned` rule out, Misplaced naming a decision a unit or component test could reach and, as a candidate, a suite whose integration tests exceed about a tenth of its tests; `untestable-decisions` names the port whose fake would let a component test reach the decision in its hunt, its verify gate and its severity line, and the lens no longer names a function over plain values; `viber/skills/code-auditor/README.md` describes the three angles the same way and both lenses and the README name a decision no fast test can reach where they named one no unit test can reach
<!-- /TASK -->

<!-- TASK -->
### T8 - Keep forbidden test habits out of project rules
- TDD: required
- Covers: AC8
- Uses: C1, C2
- Depends-on: T2
- Files: viber/references/rule-admission.md, tests/viber/rules-trail-prose.unit.test.ts
- Delivers: the `## Never a rule` bullet barring a way of writing tests the test rules forbid.
- Verification: node --test tests/viber/rules-trail-prose.unit.test.ts tests/viber/rules-close-prose.unit.test.ts -> every test passes, the new bullet case included
- DoD: `## Never a rule` of `rule-admission.md` holds one bullet barring a way of writing tests that a `(blocking)` rule of `test-strategy.md` forbids; that bullet names `## Proves` and `## Writing` of the `test-strategy.md` beside the file as what to read when a candidate or an audited line speaks of how tests are written
<!-- /TASK -->

<!-- TASK -->
### T9 - Record the replay sample of done clauses
- TDD: none
- Covers: AC11
- Uses: C6
- Depends-on: T2
- Files: tests/viber/replay/done-clauses.md
- Delivers: the replay sample of C6.
- Verification: grep -c "^- bad | " tests/viber/replay/done-clauses.md -> 10, and grep -c "^- good | " tests/viber/replay/done-clauses.md -> 5, and grep -c "^- bad | Earned | " tests/viber/replay/done-clauses.md -> at least 1, and grep -c "^- Earned:" viber/references/test-strategy.md -> 1
- DoD: `tests/viber/replay/done-clauses.md` holds the header lines, the ten `bad` entries and the five `good` entries of C6 in its line format
<!-- /TASK -->

<!-- TASK -->
### T10 - Describe the test rules in the user documents
- TDD: none
- Covers: AC12
- Uses: C1
- Depends-on: T2
- Files: viber/PRODUCT.md, viber/README.md, viber/skills/setup/assets/help.html
- Delivers: the product assumptions, the usage guide and both languages of the help page describing the layers, the proof of a use case, the port with its fake and contract test, and tests through the public contract.
- Verification: node --test tests/viber/help.unit.test.ts -> every test passes, and grep -c "contract test" viber/PRODUCT.md viber/README.md viber/skills/setup/assets/help.html viber/references/test-strategy.md -> at least 1 each, and grep -c "public contract" viber/PRODUCT.md viber/README.md viber/skills/setup/assets/help.html -> at least 1 each
- DoD: `viber/PRODUCT.md` states the four layers as C1 defines them, the component test on fakes as the proof of a use case's decisions, the port with its fake and contract test for every external dependency, tests written through the public contract alone, and no longer asks for every decision as a function over plain values; the test rule sentences of `viber/README.md` say the same in short; the `en` and the `pl` paragraph of `help.html` holding the test rule each say what the README sentences say; `help.unit.test.ts` passes
<!-- /TASK -->

## Contracts

### C1 - Test rule sections and names

File: viber/references/test-strategy.md

```
Each rule is one bullet opening "- <Name>: ". "(blocking)" after a name below marks a rule
whose bullet ends in "(blocking)", which a reviewer raises as Blocking.
The opening paragraph before "## Layers" stays, saying what "(blocking)" means and that the
integration layer has its own rules in integration-tests.md.

## Layers
- Outside: the outside world is whatever leaves the test process or is not deterministic:
  a database (a containerised one too), the network, the file system, the system clock,
  randomness, a sleep or background thread, the environment, a subprocess.
- Unit: the behaviour of one entity (a class, function, aggregate or value object, with its
  own helper types) through its public API. Never the outside world.
- Component: several entities assembled into a component and called through its public entry
  (a module's facade, a command or query handler, a use case), domain objects real, every
  output port replaced by its fake. Never the outside world, never an in-memory database
  dialect or an object-relational mapper's in-memory provider. The whole application run in
  the test process from its own entry point with those fakes is a component test too, kept
  to a few per entry point: routing, input validation, error mapping, serialisation.
- Integration: one adapter against its real dependency, under integration-tests.md.
- E2E: the deployed application driven from outside, written and run only on the user's own
  request.
- Proof (blocking): a domain rule, a value object or an algorithm is proven by a unit test;
  a use case's decisions and error paths by a component test on fakes; only what the real
  dependency alone reveals by an integration test, written once a unit or component test
  covers the logic using that adapter. A decision gets a function and a unit test of its own
  only when it is complex enough to be an entity with its own contract. Unit and component
  tests far outnumber integration tests. A reproduction test on a `Repro:` line is exempt:
  where the diverging code has no port, it may reach the real dependency.

## Proves
- Public (blocking): a test calls the entity or component as a real caller does, through its
  public contract alone: no private member, no reflection, no visibility widened and no
  method added for a test, no test of an internal class on its own.
- State (blocking): today's "Assert on what a caller observes" rule, extended: the state a
  fake holds and a published event count as observed; never a call, a call count or a call
  order on a collaborator, unless the call is the behaviour and leaves no state to observe.
- Source (blocking): today's rule on reading the source as text, the product file exception
  kept.
- Earned (blocking): today's "A test exists only for" rule; its never-tested list also holds
  a count of fields, members or entries, a type's visibility or modifiers, an export and a
  registration.
- Architecture: one test per rule over the whole codebase (the direction of dependencies
  between modules, the fast tests staying off the outside world) is allowed; a test of one
  type's structure is never that.

## Ports
- Ported (blocking): an external dependency is reached through a port in the domain's
  language, with one authoritative fake in the shared test fixtures (in memory, holding its
  own state, test-only controls allowed) and a contract test written against the port alone,
  which the fake passes as a unit test and the adapter passes as its integration test.
  A new dependency gets all three. Code reaching a dependency with no port gets them at the
  seam the task touches, for the operations the task uses only. Behaviour a fake cannot
  hold in memory belongs to the adapter's integration tests.

## Writing
- Framework: today's "Never introduce a test framework" rule.
- Requested (blocking): today's end-to-end rule, word for word after its name.
- Marked (blocking): today's layer marker rule; a test the task leaves otherwise unchanged
  keeps the marker it has.
- Single (blocking): today's "One regression, one test" rule.
- Act (blocking): today's "Every test can fail on a regression, asserts something and
  carries one act" rule.
- Isolated (blocking): today's isolation rule; the clock, randomness and identifiers are
  injected.
- Boundary (blocking): replaces today's "A unit test may keep its real collaborators" bullet,
  which sits here word for word until this rule is written, its sentence on real
  collaborators now said by Component. A double stands only for the outside world, or for a collaborator too
  slow for a fast test (hashing, key derivation, retry backoff, rendering), never for another
  module of the code's own. Order of choice: the real implementation, a fake, a stub, a mock.
  A type the project does not own is never mocked: it is wrapped in a port and the port is
  faked.
- Flat (blocking): today's "No control flow in a test body" rule.
- Literal (blocking): an expected value is written as a literal, never computed by the
  algorithm under test.
- Built: today's "Construct whatever can be constructed" rule, without its sentence on
  extracting a decision into a function over plain values.
The closing paragraph on the three exempt shapes stays.

Sizes (bytes, UTF-8):
whole file <= 6800
"## Proves" <= 2000
"## Layers" + "## Proves" + "## Ports" <= 4000
"## Layers" + "## Proves" + "## Writing" <= 6000
```

### C2 - Reader map

File: none

```
A section is read by range: Grep the file for its "## " lines, then Read the section.

viber/skills/planner/SKILL.md         ## Layers, ## Proves, ## Ports   before a task is written
viber/agents/planner-review.md        ## Layers, ## Proves, ## Ports
viber/agents/planner-task-review.md   ## Layers, ## Proves, ## Ports
viber/agents/task-coder.md            the whole file, as today
viber/agents/task-reviewer.md         ## Layers, ## Proves, ## Writing; ## Ports when the
                                      task's Files hold a port, its fake or its contract test
viber/skills/fixer/SKILL.md           ## Layers, ## Proves, ## Writing
viber/agents/hunter.md                ## Proves, before hunting on the tests lens and before
                                      writing a test as proof on any lens
viber/references/rule-admission.md    ## Proves, ## Writing of the test-strategy.md beside it,
                                      when a candidate or an audited line speaks of how tests
                                      are written

Hunter brief line, written by viber/skills/code-auditor/SKILL.md for every viber:hunter:
Test rules: ${CLAUDE_PLUGIN_ROOT}/references/test-strategy.md
```

### C3 - Plan rules about tests

File: viber/references/plan-rules.md

```
## Task
- Layers: a task's tests are unit, component, integration or e2e as "## Layers" of
  test-strategy.md defines them; the sentence on an existing e2e spec stays word for word.
  (review)
- Layered: each done clause is proven in the layer the Proof rule of test-strategy.md gives
  it; a clause whose decision only an integration test proves is a finding, and so is a unit
  or component test needing the outside world; an integration test's done clause names what
  the real dependency alone reveals, one test per adapter behaviour; the sentence on how the
  adapter's task verifies its integration test stays word for word. (review)
- Observable: on TDD: required each done clause states an outcome a caller observes, and a
  clause only a test that "## Proves" of test-strategy.md rules out could prove (such as a
  member count or a call count) is a finding; on TDD: none a clause states what the artefact
  holds (a shape declared as its block gives it, a document's text), proven by Verification
  alone, and a clause asking for a test that "## Proves" rules out is a finding; a shape the
  change must fix goes to a "## Contracts" block, and no clause under either value asks a
  test for a block's shape. (review)
- TDD: loses its last sentence (a clause on a name, the presence of a field or the shape of
  data) and its sentence on a task whose behaviour only a component test could observe on a
  host with no component layer.
- Owned: "a new port and test substitute for a database, queue, clock or network the
  behaviour touches, only where the host already uses ports for it" becomes the port, its
  fake and its contract test that the Ported rule of test-strategy.md asks for.

## Graph
- Shared harness: "a stack with no such hosting has no component layer" becomes: such a
  stack keeps the component tests assembled by hand and lacks only the whole application run
  from its entry point. The harness task also owns the shared test fixtures holding the
  fakes, and makes a test with no layer marker fail and the fast tests unable to open a
  network connection, each by the test framework's own mechanism.

## Contracts
- Block body (review half): "no instruction on how to build it" becomes "no instruction on
  how to build or test it".

Size: plan-rules.md <= 19000 bytes.
```

### C4 - Read sets and caps

File: tests/viber/rule-budget.unit.test.ts

```
A read set is a list of entries; an entry is a file, or a file with the "## " sections read
from it. Bytes are UTF-8 bytes; a section runs from its "## " line to the next "## " line or
the end of the file (the section helper of tests/harness/markdown.ts).

role            entries                                                            cap (bytes)
planner         viber/skills/planner/SKILL.md                                      43826
                viber/references/plan-rules.md
                viber/skills/planner/templates/spec-full.md
                viber/skills/planner/templates/tasks.md
                viber/references/test-strategy.md [Layers, Proves, Ports]
planner-review  viber/agents/planner-review.md                                     29475
                viber/references/plan-rules.md
                viber/references/test-strategy.md [Layers, Proves, Ports]
task-coder      viber/agents/task-coder.md                                         25975
                viber/references/tdd.md
                viber/references/test-strategy.md
task-reviewer   viber/agents/task-reviewer.md                                      16721
                viber/references/test-strategy.md [Layers, Proves, Writing]
hunter          viber/agents/hunter.md                                             18463
                viber/skills/code-auditor/references/lenses/tests.md
                viber/skills/code-auditor/references/synthesis.md
                  [Hunter report schema, Claim sidecar schema]
                viber/references/test-strategy.md [Proves]

A read set over its cap fails naming the role, its bytes and its cap.
```

### C5 - Lens angles

File: viber/skills/code-auditor/references/lenses/tests.md, viber/skills/code-auditor/references/lenses/design.md

```
tests.md, slugs and order unchanged:
- over-mocking: also a double standing for a module of the code's own (Boundary) and a test
  asserting only interactions (State). A finding names the rule.
- wasteful-tests: Redundant as today. Trivial: a test that Public, Source or Earned of the
  test rules rules out. Misplaced: a decision only an integration test asserts though a unit
  or component test could reach it; a suite whose integration tests, counted through the
  host's layer marker convention, exceed about a tenth of its tests is a candidate as a whole.
- "## Excluded", last line: a decision no fast test can reach as written: the design lens.

design.md:
- intro: "decisions no fast test can reach".
- untestable-decisions: a decision written inside code that reaches a database, queue, broker
  or network with no port between them, so a test reaches it only through the real dependency
  or a chain of doubles. Name the decision and the port whose fake would let a component test
  reach it.
- "## Verify" gate 7 and the "3-4" severity line keep their evidence (only integration tests
  assert it, its fast test builds 3 or more doubles, or none asserts it).
```

### C6 - Replay sample

File: tests/viber/replay/done-clauses.md

```
# Replay sample of done clauses

Each line is one done clause for a replay of the plan reviewer and the coder: a `bad` clause
must be reported under `Observable` naming the test rule after it, a `good` clause must not.
Line format: - <bad|good> | <test rule, or none> | <TDD value> | <clause>

- bad | Earned | required | the key test covers `menuIcons` with its eight keys
- bad | Public | required | every constant of `Scopes` is listed, read by reflection
- bad | Earned | required | the message dictionary has no `loadMore` key
- bad | Earned | required | the module exports exactly the values of C6
- bad | Source | required | a structural guard confirms that `migrate` calls `issueToken`
- bad | State | required | starting an activity calls the save hook exactly once
- bad | State | required | every query passes `keepStale: false` to the query hook
- bad | Earned | none | the contract tests pin the members of `StatusKind` in order
- bad | Public | none | a reflection test proves the handler class is sealed with a private parameterless constructor
- bad | Earned | required | the route is mapped as POST with the `RateLimited` metadata
- good | none | required | an order over the credit limit is rejected with `credit-limit-exceeded`
- good | none | required | a declined payment leaves no order stored
- good | none | required | the list answers its second page with items 21 to 40
- good | none | required | saving a second user with the same email fails on the unique index
- good | none | none | the README names the `--dry-run` flag
```

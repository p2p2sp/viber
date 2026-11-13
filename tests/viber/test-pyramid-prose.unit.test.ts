/*
 * test-pyramid-prose.unit.test.ts - pins the prose that makes a build prove every decision by a
 * unit test.
 *
 * `plan-rules.md` (`Layers`, `Layered`, `Observable`, `TDD`, `Owned`, `Shared harness` and
 * `Block body`) points at the test rules of `test-strategy.md`, gives each done clause the layer
 * its `Proof` rule names and limits an integration test to what the real dependency reveals.
 * `integration-tests.md` holds the same limits as `(blocking)` rules
 * and `test-strategy.md` names each rule of what a test proves and how it is written, within the
 * sizes of its contract. The files read here are shipped prompts, whose text is the behaviour. Nothing is
 * spawned. Each phrase is matched with any run of whitespace between its words, so rewrapping a
 * line breaks no test.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/test-pyramid-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(relative: string): string {
  return fs.readFileSync(path.join(VIBER, relative), "utf8");
}

const PLAN_RULES = read("references/plan-rules.md");
const INTEGRATION = read("references/integration-tests.md");
const STRATEGY = read("references/test-strategy.md");
const TDD = read("references/tdd.md");
const CODER = read("agents/task-coder.md");
const REVIEWER = read("agents/task-reviewer.md");
const TEST_RUNNER = read("agents/test-runner.md");

function phrase(text: string): RegExp {
  const escaped = text.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("\\s+"));
}

function has(haystack: string, text: string): boolean {
  return phrase(text).test(haystack);
}

function rule(name: string): string {
  const line = PLAN_RULES.split(/\r?\n/).find((candidate) => candidate.startsWith(`- ${name}:`));
  return line ?? "";
}

function bullet(file: string, start: string): string {
  const line = file.split(/\r?\n/).find((candidate) => candidate.startsWith(`- ${start}`));
  return line ?? "";
}

function rules(name: string): string {
  return PLAN_RULES.split(/\r?\n/).filter((candidate) => candidate.startsWith(`- ${name}:`)).join("\n");
}

test("plan-rules Layers names unit, component, integration and e2e by pointing at the Layers section of test-strategy", () => {
  assert.ok(has(rule("Layers"), "a task's tests are `unit`, `component`, `integration` or `e2e`, as `## Layers` of `test-strategy.md` defines them;"));
});

test("plan-rules Layers defines none of the four layers itself", () => {
  assert.ok(!has(rule("Layers"), "started disposably for the test run"));
  assert.ok(!has(rule("Layers"), "internal layers real"));
});

test("integration-tests first bullet counts an entry point calling data access as the adapter for that data access alone, still blocking", () => {
  const text = bullet(INTEGRATION, "An integration test covers one adapter");
  assert.ok(has(text, "an entry point that calls data access directly counts as the adapter for that data access alone, never for a decision inside it. (blocking)"));
});

test("plan-rules Layered gives each done clause the layer the Proof rule of test-strategy names", () => {
  assert.ok(rule("Layered").startsWith("- Layered: each done clause is proven in the layer the `Proof` rule of `test-strategy.md` gives it;"));
});

test("plan-rules Layered makes a clause whose decision only an integration test proves a finding, and a unit or component test needing the outside world too", () => {
  assert.ok(has(rule("Layered"), "a clause whose decision only an integration test proves is a finding, and so is a unit or component test needing the outside world."));
});

test("plan-rules Layered limits an integration test's done clause to what the real dependency alone reveals, one test per adapter behaviour", () => {
  assert.ok(has(rule("Layered"), "An integration test's done clause names what the real dependency alone reveals, one test per adapter behaviour."));
});

test("plan-rules Layered no longer asks for a decision delivered as a function over plain values", () => {
  assert.ok(!has(rule("Layered"), "function over plain values"));
});

test("plan-rules Observable stands in the Task section on one line tagged review", () => {
  const line = rule("Observable");
  assert.ok(section(PLAN_RULES, "Task").split("\n").includes(line));
  assert.ok(line.endsWith(" (review)"));
});

test("plan-rules Observable asks a TDD required clause for an outcome a caller observes and makes a clause only a ruled-out test could prove a finding", () => {
  assert.ok(has(rule("Observable"), "on `TDD: required` each done clause states an outcome a caller observes, and a clause only a test that `## Proves` of `test-strategy.md` rules out could prove (such as a member count or a call count) is a finding;"));
});

test("plan-rules Observable asks a TDD none clause for what the artefact holds, proven by Verification alone, and makes a clause asking for a ruled-out test a finding", () => {
  assert.ok(has(rule("Observable"), "on `TDD: none` a clause states what the artefact holds (a shape declared as its block gives it, a document's text), proven by `Verification` alone, and a clause asking for a test that `## Proves` rules out is a finding;"));
});

test("plan-rules Observable sends a shape the change must fix to a Contracts block and lets no clause ask a test for a block's shape", () => {
  assert.ok(has(rule("Observable"), "a shape the change must fix goes to a `## Contracts` block, and no clause under either value asks a test for a block's shape."));
});

test("plan-rules Layered closes with an integration test written in its adapter's task and never run there, a Repro test excepted, and names no Exclusive leaf task", () => {
  const text = rule("Layered");
  assert.ok(has(text, "An integration test is written in the task that creates or changes its adapter and never run there, a `Repro:` test excepted: that task's `Verification` runs the test tool's own listing or type-check step plus a grep of one identifier on both sides, the test and the adapter declaring it, and the build's final test run runs the test once. (review)"));
  assert.ok(!text.includes("The adapter task stays"));
  assert.ok(!text.includes("Exclusive"));
});

test("plan-rules Sequenced moves clauses out of three Task rules and names no Exclusive leaf task of an adapter", () => {
  const text = rule("Sequenced");
  assert.ok(text.startsWith("- Sequenced: the plan-wide clauses moved out of three `## Task` rules, each kept in its own wording:"));
  assert.ok(!text.includes("from Layered"));
  assert.ok(!text.includes("Exclusive"));
});

test("plan-rules Provable excepts an integration test from running inside Verification, keeping the end-to-end exception after it", () => {
  assert.ok(has(rule("Provable"), "The test proving each done clause runs inside the task's `Verification` command, an integration test excepted, which the Layered rule proves without running it, a write-only end-to-end task excepted, whose clauses the End-to-end rule proves without running the test"));
});

test("plan-rules TDD marks a task writing only an adapter holding no decision and its integration test TDD none, after the Repro case", () => {
  assert.ok(has(rule("TDD"), "carries `Repro:` (Reproduced); writes only an adapter holding no decision and its integration test (Layered); writes or runs an end-to-end test (End-to-end);"));
});

test("plan-rules TDD frees a clause proven by an integration test from red evidence", () => {
  assert.ok(has(rule("TDD"), "On a `TDD: required` task a done clause proven by an integration test needs no red evidence."));
});

test("integration-tests Time matters opens with an integration test written in its adapter's task and never run there", () => {
  const lines = INTEGRATION.split(/\r?\n/);
  const heading = lines.indexOf("## Time matters");
  const first = lines.slice(heading + 1).find((candidate) => candidate.startsWith("- ")) ?? "";
  assert.ok(heading >= 0);
  assert.ok(has(first, "- An integration test is written in the task that creates or changes its adapter and never run there, a `Repro:` test excepted: the task's `Verification` lists or type-checks it, the build's final test run runs it once, and the whole layer belongs to continuous integration."));
});

test("tdd Iron law backs a clause the task proves by an integration test with no red or green run", () => {
  assert.ok(has(TDD, "A test never watched failing on an assertion backs no `DoD` clause, a clause the task proves by an integration test excepted: write that test and its code with no red or green run, since `Verification` only lists or type-checks it."));
});

test("tdd Workflow excepts an integration-proven clause from the failing test", () => {
  assert.ok(has(TDD, "The behaviors are the plan task's numbered `DoD` clauses, one failing test each, an integration-proven clause excepted (Iron law), worked in their numbered order: never start a clause before the one above it is green."));
});

test("task-coder counts an integration-proven clause as met once its test is written and listed", () => {
  assert.ok(has(CODER, "Each numbered `DoD` clause is one behaviour, and counts as met on your `DOD:` line only with a test that fails without it; a clause proven by an integration test counts as met once that test is written and `Verification` lists or type-checks it."));
});

test("task-coder never runs an integration test it wrote, a Repro test and the failing tests of a test-run report excepted", () => {
  assert.ok(has(CODER, "An integration test you write is the one test you never run, a `Repro:` test and the failing tests of a test-run report excepted: `Verification` only lists or type-checks it, and the build's final test run runs it once."));
});

test("task-coder keeps the generous timeout for a command that runs an integration test", () => {
  assert.ok(has(CODER, "A command that runs an integration test (a `Repro:` test, the failing tests of a test-run report) uses an explicit generous timeout measured in minutes: the default cuts it off and comes back as a false red."));
  assert.ok(!has(CODER, "A task that writes or runs an integration test uses an explicit generous timeout"));
});

test("task-reviewer Proven runs no integration test Verification only lists and judges it by reading", () => {
  const text = bullet(REVIEWER, "Proven:");
  assert.ok(has(text, "A `Verification` or `recheck:` command that runs an integration test uses an explicit generous timeout measured in minutes: the default cuts it off and comes back as a false red. An integration test that `Verification` only lists or type-checks is never run: judge it by reading."));
});

test("task-reviewer Tested asks an adapter's integration test clause for no red evidence", () => {
  const text = bullet(REVIEWER, "Tested:");
  assert.ok(has(text, "that proof belongs to the adapter's own integration test, whose clause needs no red evidence."));
});

test("test-runner step 2 keeps an integration test that is itself among the changed paths", () => {
  assert.ok(has(TEST_RUNNER, "2. Through the layer marker convention, find every test marked integration. Keep each one that is itself among the changed paths, or whose adapter file, or a file that adapter depends on (a migration, a schema, shared data access), is among them."));
});

test("integration-tests third bullet limits an integration test to what the real dependency alone reveals and holds one asserting a decision as blocking", () => {
  const text = bullet(INTEGRATION, "An integration test proves only what the real dependency alone reveals");
  assert.ok(has(text, "An integration test proves only what the real dependency alone reveals (a query's result, a mapping, a constraint, a transaction), and the done clause it proves names that. One asserting a decision, or a case a unit or component test proves or could prove, is a finding, and so is a second test of a behaviour another integration test covers: one test per adapter behaviour. (blocking)"));
});

test("plan-rules TDD closes on the red evidence sentence of a clause proven by an integration test, holding no sentence on a name, a field or a shape", () => {
  const text = rule("TDD");
  assert.ok(text.trimEnd().endsWith("a done clause proven by an integration test needs no red evidence. (review)"));
});

test("plan-rules TDD holds no TDD none case of a host with no component layer", () => {
  assert.ok(!has(rule("TDD"), "host with no component layer"));
});

test("plan-rules Owned names the port, its fake and its contract test the Ported rule asks for, in place of the limit to hosts already using ports", () => {
  const text = rule("Owned");
  assert.ok(has(text, "the port, its fake and its contract test that the `Ported` rule of `test-strategy.md` asks for,"));
  assert.ok(!has(text, "only where the host already uses ports for it"));
});

test("plan-rules Block body review half bars an instruction on how to build or test a block's shape", () => {
  assert.ok(has(rules("Block body"), "no instruction on how to build or test it. (review)"));
});

test("plan-rules Shared harness keeps the component tests of a stack with no in-process hosting, lacking only the whole application run", () => {
  const text = rule("Shared harness");
  assert.ok(has(text, "a stack with no such hosting keeps the component tests assembled by hand and lacks only the whole application run from its entry point."));
  assert.ok(!has(text, "has no component layer"));
});

test("plan-rules Shared harness gives the harness task the shared fixtures holding the fakes and the two mechanical checks", () => {
  assert.ok(has(rule("Shared harness"), "The harness task also owns the shared test fixtures holding the fakes, and makes a test with no layer marker fail and the fast tests unable to open a network connection, each by the test framework's own mechanism."));
});

test("plan-rules stays within 19000 bytes", () => {
  assert.ok(Buffer.byteLength(PLAN_RULES, "utf8") <= 19000);
});

test("task-coder first Implement bullet stops at the met done clauses and a green Verification, adding no test, file, doc or refactor, a helpful idea going to the notes", () => {
  const text = bullet(CODER, "Deliver exactly what `Delivers` and `DoD` describe");
  assert.ok(has(text, "- Deliver exactly what `Delivers` and `DoD` describe: no tests, docs, comments or files beyond what they and `Files` name. Once every `DoD` clause is met and `Verification` is green, stop and report: don't add features, tests, files, docs or refactors the task did not ask for, and one you think would help goes into your notes instead of the tree. A pre-existing bug you find outside them goes into your notes, unfixed."));
});

test("task-reviewer Hits its target blocks a test the task added that proves none of its DoD clauses, ahead of the clause numbers sentence", () => {
  const text = bullet(REVIEWER, "Hits its target:");
  assert.ok(has(text, "A test this task added that proves none of its `DoD` clauses is Blocking: the task asked for no test beyond them. Your report cites clause numbers."));
});

function section(file: string, heading: string): string {
  const lines = file.split(/\r?\n/);
  const rest = lines.slice(lines.indexOf(`## ${heading}`) + 1);
  const end = rest.findIndex((candidate) => candidate.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

const LAYERS = section(STRATEGY, "Layers");
const PROVES = section(STRATEGY, "Proves");
const PORTS = section(STRATEGY, "Ports");
const WRITING = section(STRATEGY, "Writing");

test("test-strategy holds the headings Layers, Proves, Ports and Writing in that order and no other second-level heading", () => {
  const headings = STRATEGY.split(/\r?\n/).filter((candidate) => candidate.startsWith("## "));
  assert.deepEqual(headings, ["## Layers", "## Proves", "## Ports", "## Writing"]);
});

test("test-strategy Layers holds one bullet each for Outside, Unit, Component, Integration, E2E and Proof, in that order", () => {
  const names = LAYERS.split(/\r?\n/)
    .filter((candidate) => candidate.startsWith("- "))
    .map((candidate) => candidate.slice(2, candidate.indexOf(":")));
  assert.deepEqual(names, ["Outside", "Unit", "Component", "Integration", "E2E", "Proof"]);
});

const LAYER_ROWS: [string, string, string][] = [
  ["Outside", "Outside", "the outside world is whatever leaves the test process or is not deterministic: a database (a containerised one too), the network, the file system, the system clock, randomness, a sleep or background thread, the environment, a subprocess."],
  ["Unit", "Unit", "the behaviour of one entity (a class, function, aggregate or value object, with its own helper types) through its public API. Never the outside world."],
  ["Component's assembled entities", "Component", "several entities assembled into a component and called through its public entry (a module's facade, a command or query handler, a use case), domain objects real, every output port replaced by its fake."],
  ["Component's ban on an in-memory database", "Component", "Never the outside world, never an in-memory database dialect or an object-relational mapper's in-memory provider."],
  ["Component's whole application run", "Component", "The whole application run in the test process from its own entry point with those fakes is a component test too, kept to a few per entry point: routing, input validation, error mapping, serialisation."],
  ["Integration", "Integration", "one adapter against its real dependency, under integration-tests.md."],
  ["E2E", "E2E", "the deployed application driven from outside, written and run only on the user's own request."],
];

for (const [label, name, sentence] of LAYER_ROWS) {
  test(`test-strategy Layers states ${label} as the contract gives it`, () => {
    assert.ok(has(bullet(LAYERS, `${name}:`), sentence));
  });
}

const PROOF_ROWS: [string, string][] = [
  ["a unit test for a domain rule, a value object or an algorithm", "a domain rule, a value object or an algorithm is proven by a unit test;"],
  ["a component test on fakes for a use case's decisions and error paths", "a use case's decisions and error paths by a component test on fakes;"],
  ["an integration test only once a unit or component test covers the logic using its adapter", "only what the real dependency alone reveals by an integration test, written once a unit or component test covers the logic using that adapter."],
  ["an own function and unit test only for a decision complex enough to be an entity", "A decision gets a function and a unit test of its own only when it is complex enough to be an entity with its own contract."],
  ["unit and component tests far outnumbering integration tests", "Unit and component tests far outnumber integration tests."],
  ["the Repro reproduction test exemption", "A reproduction test on a `Repro:` line is exempt: where the diverging code has no port, it may reach the real dependency. (blocking)"],
];

for (const [label, sentence] of PROOF_ROWS) {
  test(`test-strategy Proof names ${label}`, () => {
    assert.ok(has(bullet(LAYERS, "Proof:"), sentence));
  });
}

const PORT_ROWS: [string, string][] = [
  ["a port in the domain's language with one authoritative fake and a contract test the fake passes as a unit test and the adapter as its integration test", "an external dependency is reached through a port in the domain's language, with one authoritative fake in the shared test fixtures (in memory, holding its own state, test-only controls allowed) and a contract test written against the port alone, which the fake passes as a unit test and the adapter passes as its integration test."],
  ["all three for a new dependency", "A new dependency gets all three."],
  ["the touched seam for code with no port, for the operations the task uses only", "Code reaching a dependency with no port gets them at the seam the task touches, for the operations the task uses only."],
  ["what a fake cannot hold in memory belonging to the adapter's integration tests, as a blocking rule", "Behaviour a fake cannot hold in memory belongs to the adapter's integration tests. (blocking)"],
];

for (const [label, sentence] of PORT_ROWS) {
  test(`test-strategy Ports Ported requires ${label}`, () => {
    assert.ok(has(bullet(PORTS, "Ported:"), sentence));
  });
}

const KEPT_ROWS: [string, string, string][] = [
  ["Earned, the important path or decision", "Proves", "- Earned: A test exists only for an important path or a decision in the logic: name the regression in behaviour a caller observes that it would catch; no answer means no test. Never tested: accessors, trivial constructors, data holders without behaviour, 1:1 mappings, framework behaviour, third-party library internals, an assertion true by construction, a name, the presence of a field, the shape of data,"],
  ["Earned, the refactor finding", "Proves", "A test that fails on a refactor keeping the observed behaviour is a finding. (blocking)"],
  ["State, the observed assertion", "Proves", "- State: Assert on what a caller observes: the returned value, the public state,"],
  ["State, the log output and arranged data", "Proves", "Never on log output, and never on data the test did not arrange itself. (blocking)"],
  ["Source, the source-as-text rule", "Proves", "- Source: A test never reads the source of the code under test as text to assert its shape: no regular expression, substring or line match over a source file. The one exception is a file the host declares as its product, whose text is the behaviour. (blocking)"],
  ["Framework", "Writing", "- Framework: Never introduce a test framework the project does not have."],
  ["Requested, the end-to-end rule", "Writing", "- Requested: An end-to-end test - a browser, or the running application driven from outside - is written only by a task whose acceptance criterion states that the user asked for one in their own words, and run only by a task whose acceptance criterion states that the user asked for it to be run. A coder updates, without the user's request, an existing end-to-end spec its task lists in `Files`, and a reviewer raises no finding for it. (blocking)"],
  ["Marked, the layer marker rule", "Writing", "- Marked: Every test written or edited carries its layer's marker in the host's declared layer marker convention, or in the one the plan's harness task designed."],
  ["Single, the one regression rule", "Writing", "- Single: One regression, one test: two tests failing on exactly the same regressions are one test too many, and variants of one input belong in the framework's parameterised form, one row each. A test whose deletion leaves every regression still caught is a duplicate. (blocking)"],
  ["Act, the one act rule", "Writing", "- Act: Every test can fail on a regression, asserts something and carries one act: several actions in one body means several tests. (blocking)"],
  ["Isolated, the isolation rule", "Writing", "- Isolated: no sleep, no fixture or other mutable state shared across tests, no dependence on execution order, no fixed port or other machine-wide resource, no database shared with another task's run."],
  ["Flat, the control flow rule", "Writing", "- Flat: No control flow in a test body - no branch, no loop, no switch. Cases go in the parameterised form. (blocking)"],
  ["Built, the construct rule", "Writing", "- Built: Construct whatever can be constructed. A double for a value, a record or a config lookup hides the real shape."],
];

for (const [label, where, text] of KEPT_ROWS) {
  test(`test-strategy keeps ${label} word for word under ${where}`, () => {
    assert.ok(has(where === "Proves" ? PROVES : WRITING, text));
  });
}

const BULLETS = STRATEGY.split(/\r?\n/).filter((candidate) => candidate.startsWith("- "));

test("test-strategy opens every bullet with its contract name, each name once, in the contract's order", () => {
  const names = BULLETS.map((candidate) => candidate.slice(2, candidate.indexOf(":")));
  assert.deepEqual(names, [
    "Outside", "Unit", "Component", "Integration", "E2E", "Proof",
    "Public", "State", "Source", "Earned", "Architecture",
    "Ported",
    "Framework", "Requested", "Marked", "Single", "Act", "Isolated", "Boundary", "Flat", "Literal", "Built",
  ]);
});

test("test-strategy ends exactly the contract's rules in (blocking) and leaves Outside, Unit, Component, Integration, E2E, Architecture, Framework and Built untagged", () => {
  const tagged = BULLETS.filter((candidate) => candidate.endsWith("(blocking)")).map((candidate) => candidate.slice(2, candidate.indexOf(":")));
  assert.deepEqual(tagged, [
    "Proof", "Public", "State", "Source", "Earned", "Ported",
    "Requested", "Marked", "Single", "Act", "Isolated", "Boundary", "Flat", "Literal",
  ]);
});

function bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function withHeading(heading: string, body: string): string {
  return `## ${heading}\n${body}`;
}

const SIZE_ROWS: [string, number, string][] = [
  ["the whole file", 6800, STRATEGY],
  ["Proves", 2000, withHeading("Proves", PROVES)],
  ["Layers, Proves and Ports together", 4000, [withHeading("Layers", LAYERS), withHeading("Proves", PROVES), withHeading("Ports", PORTS)].join("\n")],
  ["Layers, Proves and Writing together", 6000, [withHeading("Layers", LAYERS), withHeading("Proves", PROVES), withHeading("Writing", WRITING)].join("\n")],
];

for (const [label, limit, text] of SIZE_ROWS) {
  test(`test-strategy keeps ${label} within ${limit} bytes`, () => {
    assert.ok(bytes(text) <= limit);
  });
}

const RULE_ROWS: [string, string, string, string][] = [
  ["Public bars a private member, reflection, a widened visibility, a method added for a test and a test of an internal class on its own", "Proves", "Public:", "a test goes through the public contract alone, as a real caller does: no private member, no reflection, no visibility widened and no method added for a test, no test of an internal class on its own."],
  ["State counts the state a fake holds and a published event as observed", "Proves", "State:", "the state a fake holds, a published event,"],
  ["State bars a call, a call count and a call order on a collaborator, excepting a call that is the behaviour and leaves no state to observe", "Proves", "State:", "Never a call, a call count or a call order on a collaborator, unless the call is the behaviour and leaves no state to observe."],
  ["Earned adds a count of fields, members or entries, a type's visibility or modifiers, an export and a registration to what is never tested", "Proves", "Earned:", "the shape of data, a count of fields, members or entries, a type's visibility or modifiers, an export, a registration."],
  ["Architecture allows one test per rule over the whole codebase and no test of one type's structure", "Proves", "Architecture:", "one test per rule over the whole codebase (the direction of dependencies between modules, the fast tests staying off the outside world) is allowed; a test of one type's structure is never that."],
  ["Marked keeps the marker of a test the task leaves otherwise unchanged", "Writing", "Marked:", "A test the task leaves otherwise unchanged keeps the marker it has."],
  ["Isolated injects the clock, randomness and identifiers", "Writing", "Isolated:", "The clock, randomness and identifiers are injected."],
  ["Boundary lets a double stand only for the outside world or a collaborator too slow for a fast test, never another module of the code's own", "Writing", "Boundary:", "A double stands only for the outside world, or for a collaborator too slow for a fast test (hashing, key derivation, retry backoff, rendering), never for another module of the code's own."],
  ["Boundary orders the choice real implementation, fake, stub, mock", "Writing", "Boundary:", "Order of choice: the real implementation, a fake, a stub, a mock."],
  ["Boundary never mocks a type the project does not own but wraps it in a port and fakes the port", "Writing", "Boundary:", "A type the project does not own is never mocked: it is wrapped in a port and the port is faked."],
  ["Literal asks for expected values written as literals, never computed by the algorithm under test", "Writing", "Literal:", "An expected value is written as a literal, never computed by the algorithm under test."],
];

for (const [label, where, name, sentence] of RULE_ROWS) {
  test(`test-strategy ${label}`, () => {
    assert.ok(has(bullet(where === "Proves" ? PROVES : WRITING, name), sentence));
  });
}

test("test-strategy Built never sends a decision out into a function over plain values", () => {
  assert.ok(!has(STRATEGY, "extract the decision into a function over plain values"));
});

test("test-strategy keeps no bullet of the old component rule outside Layers", () => {
  assert.ok(!has(STRATEGY, "A component test drives the whole application through its own entry point inside the test process"));
});

test("integration-tests holds a blocking rule that an adapter passes its port's contract test as an integration test and one created or changed with none is a finding", () => {
  const text = bullet(INTEGRATION, "An adapter passes the contract test of its port");
  assert.ok(has(text, "An adapter passes the contract test of its port, written against the port alone and shared with its fake, as an integration test; an adapter a task creates or changes with no integration test is a finding. (blocking)"));
});

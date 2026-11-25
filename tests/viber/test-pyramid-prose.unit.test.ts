/*
 * test-pyramid-prose.unit.test.ts - pins the prose that makes a build prove each decision in the
 * layer the test rules give it: a domain rule by a unit test, a use case by a component test on fakes.
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
import { section } from "../harness/markdown.ts";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(relative: string): string {
  return fs.readFileSync(path.join(VIBER, relative), "utf8");
}

const PLAN_RULES = read("references/plan-rules.md");
const SCRIPT_RULES = read("references/plan-rules-script.md");
const INTEGRATION = read("references/integration-tests.md");
const STRATEGY = read("references/test-strategy.md");
const TDD = read("references/tdd.md");
const CODER = read("agents/task-coder.md");
const REVIEWER = read("agents/task-reviewer.md");
const TEST_RUNNER = read("agents/test-runner.md");
const FIXER = read("skills/fixer/SKILL.md");
const WRITER = read("agents/plan-writer.md");
const PLAN_REVIEW = read("agents/planner-review.md");
const TASK_REVIEW = read("agents/planner-task-review.md");

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

function scriptRules(name: string): string {
  return SCRIPT_RULES.split(/\r?\n/).filter((candidate) => candidate.startsWith(`- ${name}:`)).join("\n");
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

test("plan-rules Layered no longer asks for a decision delivered as a function over plain values", () => {
  assert.ok(!has(rule("Layered"), "function over plain values"));
});

test("plan-rules Observable stands in the Task section on one line tagged review", () => {
  const line = rule("Observable");
  assert.ok(section(PLAN_RULES, "Task").split("\n").includes(line));
  assert.ok(line.endsWith(" (review)"));
});

test("plan-rules Observable asks a TDD required clause for an outcome a caller observes, never a shape, a name or a call, and proves an outcome whose test Earned rules out by reading the code (a done clause is no order for a test)", () => {
  assert.ok(has(rule("Observable"), "on `TDD: required` each done clause states an outcome a caller observes, never a shape, a name or a call (a member count, a call count); an outcome whose test `Earned` of `test-strategy.md` rules out (a rejected empty input, a default) is proven by reading the code."));
});

test("plan-rules Observable asks a TDD none clause for what the artefact holds, proven by Verification alone", () => {
  assert.ok(has(rule("Observable"), "On `TDD: none` a clause states what the artefact holds (a shape declared as its block gives it, a document's text), proven by `Verification` alone."));
});

test("plan-rules Observable sends a shape the change must fix to a Contracts block", () => {
  assert.ok(has(rule("Observable"), "A shape the change must fix goes to a `## Contracts` block."));
});

test("plan-rules Observable makes a clause asking for a ruled-out test, and such a test listed in Files or run by Verification, a finding over any host convention (a plan can ask for a forbidden test without a done clause naming it)", () => {
  assert.ok(has(rule("Observable"), "A clause asking for a test that `## Proves` rules out, a block's shape included, is a finding under either value, and so is such a test in `Files` or run by `Verification`, whatever the host's `CLAUDE.md`, rules or existing tests ask."));
});

test("plan-rules Provable orders the done clauses main path first through the task's public entry, then one decision each, never one clause a layer for one outcome (a clause per layer buys three tests of one behaviour)", () => {
  assert.ok(has(rule("Provable"), "lists them in the order the coder works them, one red-green cycle each: the behaviour's main path through the task's public entry first, then one decision each, never one clause a layer for one outcome."));
  assert.ok(!has(rule("Provable"), "innermost layer first"));
});

test("plan-rules keeps only the review half of Layered, one line tagged review", () => {
  const reviewLines = rules("Layered").split("\n");
  assert.ok(reviewLines.length === 1 && reviewLines[0].endsWith("(review)"));
});

test("plan-rules-script carries the integration test check as its one Layered rule, tagged script", () => {
  const scriptLines = scriptRules("Layered").split("\n");
  assert.ok(scriptLines.length === 1 && has(scriptLines[0], "`plan-index.sh` rejects one without it, with `FIX: task <id>: Files writes <path> under an integration test directory, which no Verification command names - list or type-check that file or its test project there (Layered)`. (script)"));
});

test("plan-rules keeps only the review half of Provable, one line tagged review", () => {
  const reviewLines = rules("Provable").split("\n");
  assert.ok(reviewLines.length === 1 && reviewLines[0].endsWith("(review)"));
});

test("plan-rules-script carries the git grep, backtick, interpreter and .temp/ checks as its one Provable rule, tagged script", () => {
  const scriptLines = scriptRules("Provable").split("\n");
  assert.ok(scriptLines.length === 1 && has(scriptLines[0], "`plan-index.sh` rejects it, with `FIX: task <id>: Verification runs git grep without --untracked over <path>, which this task creates and git grep never reads - add --untracked or use grep (Provable)`. (script)"));
  assert.ok(has(scriptLines[0], "with `FIX: task <id>: Verification is wrapped in backticks - write the command bare (Provable)`"));
  assert.ok(has(scriptLines[0], "with `FIX: task <id>: Verification runs inline interpreter code \"<token>\" - run a project test or script instead (Provable)`"));
  assert.ok(has(scriptLines[0], "or `FIX: task <id>: Verification runs <path> under .temp/ - run a project test or script instead (Provable)`."));
});

test("plan-rules holds no Ids rule", () => {
  assert.equal(rules("Ids"), "");
});

test("plan-rules keeps Blocks as one review line with no id order", () => {
  const line = rules("Blocks");
  assert.ok(line.endsWith("(review)") && !line.includes("\n"));
  assert.ok(!line.includes("`C1`, `C2`"));
});

test("plan-rules keeps Title as one review line asking for one short imperative summary, with no word on a type prefix", () => {
  const line = rules("Title");
  assert.ok(line.endsWith("(review)") && !line.includes("\n"));
  assert.ok(has(line, "so the title is one short imperative summary of what the task delivers."));
  assert.ok(!line.includes("type prefix"));
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

test("tdd Workflow gives each done clause one cycle, never one failing test, and excepts an integration-proven clause", () => {
  assert.ok(has(TDD, "The behaviors are the plan task's numbered `DoD` clauses, one cycle each, an integration-proven clause excepted (Iron law), worked in their numbered order: never start a clause before the one above it is green."));
});

test("tdd Verify red keeps a test green on its first run only if it alone fails once the behavior is reverted, and deletes it otherwise (a forced red for behavior an earlier test proves is a duplicate)", () => {
  assert.ok(has(TDD, "Passes immediately? The code already holds the behavior: keep the test only if it alone fails once that behavior is reverted (Iron law), else delete it."));
  assert.ok(!has(TDD, "Sharpen the assertion"));
});

test("task-coder counts a clause as met by a test that fails without it, an integration-proven one once its test is written and listed, one whose test the rules forbid by its code alone", () => {
  assert.ok(has(CODER, "Each numbered `DoD` clause counts as met on your `DOD:` line only with a test that fails without it; one proven by an integration test, once that test is written and `Verification` lists or type-checks it; one whose test `test-strategy.md` forbids, by its code alone."));
});

test("task-reviewer blocks a TDD required clause with no test unless the test rules forbid that test", () => {
  assert.ok(has(bullet(REVIEWER, "Hits its target:"), "A clause with no such test is Blocking on `TDD: required`, unless `test-strategy.md` forbids that test."));
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

test("plan-rules TDD lists a behaviour-preserving restructuring as TDD none, pinned by the existing tests in Verification or by a characterization test run green first", () => {
  assert.ok(has(rule("TDD"), "restructures code keeping every observable behaviour (a refactor), its `Verification` running the existing tests that pin that behaviour and, where none pins it, its first done clause writing a characterization test run green before the structure moves;"));
});

test("plan-rules Ordered makes the last task carrying one mechanical change over more than five files depend on every other task carrying it, in its own sentence", () => {
  const sentences = rule("Ordered").split(". ");
  assert.ok(sentences.some((sentence) => has(sentence, "The last task carrying one mechanical change (a rename, a moved path, a changed call) across more than five files depends on every other task carrying it")));
});

test("plan-rules Provable gives the task completing a mechanical change over more than five files a grep for the old form over every tracked file outside the run and archive directories, an exception to its own Files", () => {
  assert.ok(has(rule("Provable"), "The task completing a mechanical change over more than five files holds in its `Verification` a grep for the old form over every tracked file outside the run and archive directories under `docs/` that finds nothing, an exception to the scope of its own `Files`;"));
});

test("plan-rules Provable leaves every CLAUDE.md out of that grep with build.memory on", () => {
  assert.ok(has(rule("Provable"), "with `build.memory` on, that grep leaves out every `CLAUDE.md` too."));
});

test("plan-rules Layered proves a clause through an entry tests already call before a new one, the highest that reaches it, named on the test file's File map line (a test file per clause multiplies harnesses and tests)", () => {
  assert.ok(has(rule("Layered"), "Within its layer a clause is proven through a public entry that tests already call before a new one, the highest that reaches it, and each test file's `### File map` line names the entry its tests call; a new entry for behaviour an existing or higher one reaches is a finding."));
});

test("plan-rules keeps a user interface out of the tests: TDD none for one that only renders or styles, a Mockup clause no test proves, the rendering task after the behaviour's", () => {
  assert.ok(has(rule("TDD"), "a 1:1 mapping, a constant table, a user interface that only renders or styles);"));
  assert.ok(has(rule("Mockup"), "no test proves that clause (`Earned`), so its task is `TDD: none`, and a decision behind a state or interaction is a done clause of the task holding it. (review)"));
  assert.ok(has(rule("Size"), "lands in a `TDD: none` task ahead of it and the user interface rendering it in one after it; one behaviour runs through every other layer it needs inside that task. (review)"));
});

test("plan-rules Owned has the task delete an existing test its own tests make a duplicate", () => {
  assert.ok(has(rule("Owned"), "an existing test that fails on exactly the regressions the task's own tests catch, which the task deletes,"));
});

test("test-strategy exempts no snapshot of a user interface from the blocking rules (a rendered snapshot is the test Earned rules out)", () => {
  assert.ok(has(WRITING, "a snapshot assertion of no user interface, and a loop inside a property-based generator"));
});

test("plan-rules stays within 20900 bytes", () => {
  assert.ok(Buffer.byteLength(PLAN_RULES, "utf8") <= 20900);
});

test("task-coder first Implement bullet stops at the met done clauses and a green Verification, adding no test, file, doc or refactor, a helpful idea going to the notes", () => {
  const text = bullet(CODER, "Deliver exactly what `Delivers` and `DoD` describe");
  assert.ok(has(text, "- Deliver exactly what `Delivers` and `DoD` describe: no tests, docs or files beyond what they and `Files` name. Once every `DoD` clause is met and `Verification` is green, stop and report: don't add features, tests, files, docs or refactors the task did not ask for, and one you think would help goes into your notes instead of the tree. A pre-existing bug you find outside them goes into your notes, unfixed."));
});

test("task-reviewer Hits its target blocks a test the task added that proves none of its DoD clauses, ahead of the clause numbers sentence", () => {
  const text = bullet(REVIEWER, "Hits its target:");
  assert.ok(has(text, "A test this task added that proves none of its `DoD` clauses is Blocking: the task asked for no test beyond them. Your report cites clause numbers."));
});

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
  ["E2E", "E2E", "the deployed application driven from outside."],
];

for (const [label, name, sentence] of LAYER_ROWS) {
  test(`test-strategy Layers states ${label} as the contract gives it`, () => {
    assert.ok(has(bullet(LAYERS, `${name}:`), sentence));
  });
}

const PROOF_ROWS: [string, string][] = [
  ["a unit test for a domain rule, a value object or an algorithm", "a domain rule, a value object or an algorithm is proven by a unit test;"],
  ["a component test on fakes for a use case's decisions and error paths", "a use case's decisions and error paths by a component test on fakes;"],
  ["a unit test of the reducer, state machine or function holding a user interface's decision, never a rendering", "a user interface's decision by a unit test of the reducer, state machine or function holding it, never by rendering;"],
  ["an integration test for what the real dependency alone reveals, never logic a fast test could cover", "only what the real dependency alone reveals by an integration test, never logic a unit or component test could cover."],
  ["an own function and unit test only for a decision complex enough to be an entity", "A decision gets a function and a unit test of its own only when it is complex enough to be an entity with its own contract."],
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
  ["Earned, the critical path or decision, the edge case and the untested list", "Proves", "- Earned: A test exists only for a critical path or a decision in the logic: name the bug it would catch; none, or only a deliberate change (a constant, default or name), means no test. Plain code earns one only where it validates, normalises, derives, enforces or has a side effect, an edge case only where it flips a decision's outcome, never as a null, empty or missing input. Never tested: what the compiler, type checker, linter or schema rejects, framework or third-party library behaviour, an assertion true by construction, the shape of data,"],
  ["Earned, the refactor finding", "Proves", "A test that fails on a refactor keeping the observed behaviour is a finding. (blocking)"],
  ["State, the observed assertion", "Proves", "- State: Assert on what a caller observes: the returned value, the public state,"],
  ["State, the log output and arranged data", "Proves", "Never on log output, and never on data the test did not arrange itself. (blocking)"],
  ["Source, the source-as-text rule", "Proves", "- Source: A test never reads the source of the code under test as text to assert its shape: no regular expression, substring or line match over a source file. The one exception is a file the host declares as its product, whose text is the behaviour. (blocking)"],
  ["Framework", "Writing", "- Framework: Never introduce a test framework the project does not have."],
  ["Requested, the end-to-end rule", "Writing", "- Requested: An end-to-end test - a browser, or the running application driven from outside - is written only by a task whose acceptance criterion states that the user asked for one in their own words, and run only by a task whose acceptance criterion states that the user asked for it to be run. A coder updates, without the user's request, an existing end-to-end spec its task lists in `Files`, and a reviewer raises no finding for it. (blocking)"],
  ["Marked, the layer marker rule", "Writing", "- Marked: Every test written or edited carries its layer's marker in the host's declared layer marker convention, or in the one the plan's harness task designed."],
  ["Single, the one regression rule", "Writing", "- Single: One regression, one test: a test whose deletion leaves every regression still caught is a duplicate, and variants of one input belong in the framework's parameterised form, one row each. (blocking)"],
  ["Act, the one act and never repeated arrangement rule", "Writing", "- Act: Every test can fail on a regression, asserts something and carries one act: several actions in one body means several tests. A unit test proves one behaviour, with every assertion its outcome needs; a component or integration test asserts every outcome of its act together. Never repeat one arrangement and act per assertion, in any layer. (blocking)"],
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

const SIZE_ROWS: [string, number, string][] = [
  ["the whole file", 7170, STRATEGY],
  ["Proves", 2000, PROVES],
  ["Layers, Proves and Ports together", 4200, LAYERS + PROVES + PORTS],
  ["Layers, Proves and Writing together", 6370, LAYERS + PROVES + WRITING],
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
  ["Earned adds a count of fields, members or entries, a type's visibility or modifiers, an export, a registration and what a user interface renders to what is never tested", "Proves", "Earned:", "the shape of data, a count of fields, members or entries, a type's visibility or modifiers, an export, a registration, what a user interface renders (markup, element order, static text, styling)."],
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

test("test-strategy Earned never tests a default value, accessors, trivial constructors, data holders without behaviour, 1:1 mappings or a name (the bug gate covers them)", () => {
  const earned = bullet(PROVES, "Earned:");
  for (const gone of ["a default value,", "accessors", "trivial constructors", "data holders without behaviour", "1:1 mappings", "a name, the shape"]) {
    assert.ok(!has(earned, gone));
  }
});

test("test-strategy Built never sends a decision out into a function over plain values", () => {
  assert.ok(!has(STRATEGY, "extract the decision into a function over plain values"));
});

test("test-strategy keeps no bullet of the old component rule outside Layers", () => {
  assert.ok(!has(STRATEGY, "A component test drives the whole application through its own entry point inside the test process"));
});

test("plan-writer reads Layers, Proves and Ports of test-strategy by range before a task is written", () => {
  assert.ok(has(section(WRITER, "Write"), "Before a task is written, read `## Layers`, `## Proves` and `## Ports` of `<refs>/test-strategy.md` by range: `Grep` the file for its `## ` lines, then `Read` each of the three sections."));
});

const REVIEWER_ROWS: [string, string][] = [
  ["planner-review", PLAN_REVIEW],
  ["planner-task-review", TASK_REVIEW],
];

for (const [name, text] of REVIEWER_ROWS) {
  test(`${name} reads Layers, Proves and Ports of test-strategy by range`, () => {
    assert.ok(has(text, "Read `<refs>/test-strategy.md` in the sections `## Layers`, `## Proves` and `## Ports` only: `Grep` it for the `## ` line numbers, then `Read` those sections by range."));
  });

  test(`${name} gates Layered, Observable and Owned against those sections and reports a breach under the rule's name`, () => {
    assert.ok(has(text, "Gate `Layered`, `Observable` and `Owned` against the three sections of `test-strategy.md` you read, a breach reported under the rule's name."));
  });
}

const DEFINITION_ROWS: [string, string][] = [
  ["plan-writer", WRITER],
  ["planner-review", PLAN_REVIEW],
  ["planner-task-review", TASK_REVIEW],
];

for (const [name, text] of DEFINITION_ROWS) {
  test(`${name} states no layer definition and no list of tests never written of its own`, () => {
    assert.ok(!has(text, "started disposably for the test run"));
    assert.ok(!has(text, "every external adapter is replaced by a fake"));
    assert.ok(!has(text, "accessors, trivial constructors"));
  });
}

test("task-coder ends the task on FAIL with the clause number and the DECIDE line for a clause asking for a forbidden test, on either TDD value", () => {
  assert.ok(has(bullet(CODER, "Honour `Contracts` as written"), "and a `DoD` clause you cannot meet within your limits, or that asks for a test a `(blocking)` rule of `test-strategy.md` forbids (on either `TDD` value), end the task on `VERDICT: FAIL` with the clause number in `REASON` and the `DECIDE:` line."));
});

test("task-coder takes neither a surrounding test nor a project rule asking for a forbidden test as a precedent, writes none and names the project rule in its notes", () => {
  assert.ok(has(bullet(CODER, "Before the first test you write or change"), "and neither a surrounding test breaking one nor a project rule asking for a test one forbids is a precedent: write no such test and name that project rule in your notes."));
});

test("task-reviewer reads Layers, Proves and Writing by range, and Ports when the Files hold a port, its fake or its contract test", () => {
  assert.ok(has(bullet(REVIEWER, "Tested:"), "read `<refs>/test-strategy.md` in `## Layers`, `## Proves` and `## Writing` by range (`Grep` it for the `## ` lines, then `Read` those sections), plus `## Ports` when the task's `Files` hold a port, its fake or its contract test,"));
});

test("task-reviewer reads Ports for work reaching an external dependency and integration-tests for work creating or changing an adapter, tests or none (a missing port or adapter test adds no test to trigger the read)", () => {
  assert.ok(has(bullet(REVIEWER, "Tested:"), "Tests or none, work reaching an external dependency reads `## Ports` too, and work creating or changing an adapter `integration-tests.md`, raised the same way."));
});

test("task-coder reads the test rules before its first edit reaching an external dependency and integration-tests on a task creating or changing an adapter (a missing port or adapter test adds no test to trigger the read)", () => {
  assert.ok(has(CODER, "Before the first test you write or change, or your first edit reaching an external dependency, read `<refs>/test-strategy.md`:"));
  assert.ok(has(CODER, "A task writing or running an integration test, creating or changing an adapter, or building the shared harness, also reads `<refs>/integration-tests.md`"));
});

const ADAPTER_READ_ROWS: [string, string, string][] = [
  ["plan-writer", WRITER, "A plan carrying an integration test or creating or changing an adapter also reads"],
  ["planner-review", PLAN_REVIEW, "when the plan carries an integration test or creates or changes an adapter, read `<refs>/integration-tests.md`"],
  ["planner-task-review", TASK_REVIEW, "when the plan carries an integration test or creates or changes an adapter, read `<refs>/integration-tests.md`"],
];

for (const [name, text, sentence] of ADAPTER_READ_ROWS) {
  test(`${name} reads integration-tests for a plan creating or changing an adapter, with or without an integration test`, () => {
    assert.ok(has(text, sentence));
  });
}

test("Lean excepts a function the Proof rule asks for, so a decision complex enough to be an entity is no one-caller finding", () => {
  assert.ok(has(PLAN_RULES, "a seam another rule requires (a port, its fake, a function `Proof` asks for) excepted"));
});

test("task-reviewer raises a forbidden test as Blocking naming the rule, with the cause plan when a DoD clause asked for it, and never asks for such a test", () => {
  assert.ok(has(bullet(REVIEWER, "Tested:"), "raise every rule they tag `(blocking)` as a Blocking finding naming the rule, with the cause `plan` when a `DoD` clause asked for the test, and never ask for such a test."));
});

test("task-reviewer Tested spells a breached test-strategy rule as test-strategy followed by its label in backticks", () => {
  assert.ok(has(bullet(REVIEWER, "Tested:"), "Spell a breached rule of `test-strategy.md` in the first line of its finding as test-strategy `<Name>`, `<Name>` being the label the rule opens with (`Single`, `Act`, `Earned`)."));
});

test("task-reviewer Tested lists in one finding every test the task wrote or changed that breaks the same rule", () => {
  assert.ok(has(bullet(REVIEWER, "Tested:"), "One finding per rule lists every test the task wrote or changed that breaks it, never one finding per test."));
});

test("task-reviewer Tested never has a fix tell the coder to keep a test that breaks a rule the report raises", () => {
  assert.ok(has(bullet(REVIEWER, "Tested:"), "A fix never tells the coder to keep a test that breaks a rule the report raises."));
});

test("README and both languages of help.html say a test-rule finding covers every test of the task breaking that rule", () => {
  const readme = read("README.md");
  const help = read("skills/setup/assets/help.html");
  assert.ok(has(readme, "A review finding on a test rule names the rule and covers every test of the task that breaks it, so one round of fixes clears the whole class."));
  assert.ok(has(help, "A review finding on a test rule names the rule and covers every test of the task that breaks it, so one round of fixes clears the whole class.</p>"));
  assert.ok(has(help, "Uwaga recenzji o regule testów wskazuje regułę i obejmuje każdy test zadania, który ją łamie, więc jedna runda poprawek usuwa całą klasę.</p>"));
});

test("fixer reads Layers, Proves and Writing by range before writing the reproduction test", () => {
  assert.ok(has(bullet(section(FIXER, "The reproduction test"), "Read"), "Read `## Layers`, `## Proves` and `## Writing` of `${CLAUDE_PLUGIN_ROOT}/references/test-strategy.md` by range before writing it (`Grep` the file for its `## ` lines, then `Read` each section): every rule it marks `(blocking)` binds this test, and no later stage may change it."));
});

test("fixer writes the reproduction test in the layer Proof gives the diverging behaviour, reaching the real dependency only where the diverging code has no port", () => {
  const text = section(FIXER, "The reproduction test");
  assert.ok(has(text, "- Write it in the layer `Proof` gives the diverging behaviour, never an end-to-end run of the symptom: it reaches the real dependency only where the diverging code has no port."));
  assert.ok(!has(text, "unit at the diverging layer"));
});

test("tdd keeps horizontal slicing as its only anti-pattern", () => {
  const items = section(TDD, "Anti-patterns").split(/\r?\n/).filter((candidate) => candidate.startsWith("- "));
  assert.equal(items.length, 1);
  assert.ok(items[0].startsWith("- Horizontal slicing - "));
});

test("tdd Red step names the Public rule of test-strategy", () => {
  assert.ok(has(TDD, "Through the `Public` rule of `test-strategy.md`."));
});

test("integration-tests holds a blocking rule that an adapter passes its port's contract test as an integration test and one created or changed with none is a finding", () => {
  const text = bullet(INTEGRATION, "An adapter passes the contract test of its port");
  assert.ok(has(text, "An adapter passes the contract test of its port, written against the port alone and shared with its fake, as an integration test; an adapter a task creates or changes with no integration test is a finding. (blocking)"));
});

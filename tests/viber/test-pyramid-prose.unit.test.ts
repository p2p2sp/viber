/*
 * test-pyramid-prose.unit.test.ts - pins the prose that makes a build prove every decision by a
 * unit test.
 *
 * `plan-rules.md` (`Layers` and `Layered`) counts an entry point calling data access as the
 * adapter for that data access alone, has a decision delivered as a function over plain values,
 * limits a component test to what the assembled application shows and an integration test to what
 * the real dependency reveals. `integration-tests.md` holds the same limits as `(blocking)` rules
 * and `test-strategy.md` gives the coder an untagged hint to extract a decision before adding a
 * double. The files read here are shipped prompts, whose text is the behaviour. Nothing is
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

test("plan-rules Layers counts an entry point calling data access as the adapter for that data access alone, never for a decision inside it", () => {
  assert.ok(has(rule("Layers"), "an entry point calling data access directly counts as the adapter for that data access alone, never for a decision inside it"));
});

test("integration-tests first bullet counts an entry point calling data access as the adapter for that data access alone, still blocking", () => {
  const text = bullet(INTEGRATION, "An integration test covers one adapter");
  assert.ok(has(text, "an entry point that calls data access directly counts as the adapter for that data access alone, never for a decision inside it. (blocking)"));
});

test("plan-rules Layered opens with every decision proven by a unit test and delivered as a function over plain values, a double at a boundary staying allowed", () => {
  const text = rule("Layered");
  assert.ok(text.startsWith("- Layered: Every decision (a branch, a rule, a calculation, a validation) is proven by a unit test and delivered as a function over plain values wherever the code allows"));
  assert.ok(has(text, "so that test needs no double; a double at an input or output boundary stays allowed."));
});

test("plan-rules Layered extracts a decision inside code reaching a database, queue, broker or network on a host without ports too, the surrounding code left as it stands", () => {
  assert.ok(has(rule("Layered"), "A decision a task adds or changes inside code reaching a database, queue, broker or network is extracted into such a function, on a host without ports too, the code around it left as it stands."));
});

test("plan-rules Layered limits a component test to what the assembled application alone shows", () => {
  assert.ok(has(rule("Layered"), "A component test proves only what the assembled application alone shows: routing, wiring across layers, serialisation through the entry point."));
});

test("plan-rules Layered makes a done clause whose decision only a component or integration test proves a finding", () => {
  assert.ok(has(rule("Layered"), "A done clause whose decision only a component or integration test proves is a finding, and so is a unit or component test needing a real database, queue, broker or network."));
});

test("plan-rules Layered limits an integration test to what the real dependency alone reveals, one test per adapter behaviour", () => {
  assert.ok(has(rule("Layered"), "An integration test proves only what the real dependency alone reveals (a query's result, a mapping, a constraint, a transaction): its done clause names that, and one test covers one adapter behaviour, never one test per case."));
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

test("test-strategy Never tested rule limits a test to an important path or a decision, bars a name, the presence of a field and the shape of data, and is blocking", () => {
  const text = bullet(STRATEGY, "A test exists only for an important path or a decision in the logic");
  assert.ok(has(text, "A test exists only for an important path or a decision in the logic: name the regression in behaviour a caller observes that it would catch; no answer means no test. Never tested: accessors, trivial constructors, data holders without behaviour, 1:1 mappings, framework behaviour, third-party library internals, an assertion true by construction, a name, the presence of a field, the shape of data. A test that fails on a refactor keeping the observed behaviour is a finding. (blocking)"));
});

test("test-strategy holds one regression to one test, variants as parameterised rows, a duplicate found by deleting it, right after the Never tested rule", () => {
  const lines = STRATEGY.split(/\r?\n/);
  const never = lines.findIndex((candidate) => candidate.startsWith("- A test exists only for an important path or a decision"));
  const text = bullet(STRATEGY, "One regression, one test:");
  assert.ok(never >= 0);
  assert.ok(lines[never + 1].startsWith("- One regression, one test:"));
  assert.ok(has(text, "- One regression, one test: two tests failing on exactly the same regressions are one test too many, whatever their layer, and variants of one input belong in the framework's parameterised form, one row each. A test whose deletion leaves every regression still caught is a duplicate. (blocking)"));
});

test("plan-rules TDD closes with a done clause on a name, the presence of a field or the shape of data as a finding on a TDD required task", () => {
  const text = rule("TDD");
  assert.ok(text.includes("On `TDD: required` each done clause states a behaviour or a decision a caller observes: a clause on a name, the presence of a field or the shape of data is a finding, since it belongs in a `## Contracts` block or a `TDD: none` task."));
  assert.ok(text.trimEnd().endsWith("or a `TDD: none` task. (review)"));
});

test("task-coder first Implement bullet stops at the met done clauses and a green Verification, adding no test, file, doc or refactor, a helpful idea going to the notes", () => {
  const text = bullet(CODER, "Deliver exactly what `Delivers` and `DoD` describe");
  assert.ok(has(text, "- Deliver exactly what `Delivers` and `DoD` describe: no tests, docs, comments or files beyond what they and `Files` name. Once every `DoD` clause is met and `Verification` is green, stop and report: don't add features, tests, files, docs or refactors the task did not ask for, and one you think would help goes into your notes instead of the tree. A pre-existing bug you find outside them goes into your notes, unfixed."));
});

test("task-reviewer Hits its target blocks a test the task added that proves none of its DoD clauses, ahead of the clause numbers sentence", () => {
  const text = bullet(REVIEWER, "Hits its target:");
  assert.ok(has(text, "A test this task added that proves none of its `DoD` clauses is Blocking: the task asked for no test beyond them. Your report cites clause numbers."));
});

test("test-strategy Construct rule hints to extract a decision before adding a double and stays untagged", () => {
  const text = bullet(STRATEGY, "Construct whatever can be constructed.");
  assert.ok(has(text, "A test needing a double to reach a decision points at the code's shape: extract the decision into a function over plain values and test that, before adding the double."));
  assert.ok(!text.includes("(blocking)"));
});

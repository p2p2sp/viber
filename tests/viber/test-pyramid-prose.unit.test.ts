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

test("plan-rules Layered keeps the adapter task sentence after the new opening", () => {
  assert.ok(has(rule("Layered"), "The adapter task stays `TDD: required`"));
});

test("integration-tests third bullet limits an integration test to what the real dependency alone reveals and holds one asserting a decision as blocking", () => {
  const text = bullet(INTEGRATION, "An integration test proves only what the real dependency alone reveals");
  assert.ok(has(text, "An integration test proves only what the real dependency alone reveals (a query's result, a mapping, a constraint, a transaction), and the done clause it proves names that. One asserting a decision, or a case a unit or component test proves or could prove, is a finding, and so is a second test of a behaviour another integration test covers: one test per adapter behaviour. (blocking)"));
});

test("test-strategy Construct rule hints to extract a decision before adding a double and stays untagged", () => {
  const text = bullet(STRATEGY, "Construct whatever can be constructed.");
  assert.ok(has(text, "A test needing a double to reach a decision points at the code's shape: extract the decision into a function over plain values and test that, before adding the double."));
  assert.ok(!text.includes("(blocking)"));
});

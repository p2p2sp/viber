/*
 * e2e-prose.unit.test.ts - pins the prose that lets an existing end-to-end spec into the task
 * that breaks it.
 *
 * `plan-rules.md` names the exception in its End-to-end rule (the spec joins the task's
 * `Files`, proven by a type-check or listing step plus a grep of the new selector on both
 * sides, never run, no criterion) and in its Layers, TDD, Provable and Owned rules.
 * `test-strategy.md`'s end-to-end rule lets a coder update such a listed spec, `planner/SKILL.md`
 * names the exception, and `planner-review` and `planner-task-review` carry the same Grounded
 * sentence searching the end-to-end specs for the selectors of every component a task changes.
 * The files read here are shipped prompts, whose text is the behaviour. Nothing is spawned. Each
 * phrase is matched with any run of whitespace between its words, so rewrapping a line breaks
 * no test.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/e2e-prose.unit.test.ts
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
const STRATEGY = read("references/test-strategy.md");
const PLANNER = read("skills/planner/SKILL.md");
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

const GROUNDED =
  "Search the end-to-end specs for the roles, accessible names, texts and test ids of every component a task changes: a spec using one that no task lists in `Files` is Blocking.";

test("plan-rules End-to-end puts an existing spec whose selector a task changes in that task's Files, never run and needing no criterion", () => {
  const text = rule("End-to-end");
  assert.ok(has(text, "an existing end-to-end spec whose selector a task changes sits in that task's `Files` and needs no criterion"));
});

test("plan-rules End-to-end proves the spec update by the type-check or listing step plus a grep of the new selector on both sides, inside the task's Verification", () => {
  const text = rule("End-to-end");
  assert.ok(has(text, "proven inside its `Verification` by the test tool's type-check or listing step plus a grep of the new selector on both sides, the spec and the source declaring it, and never run"));
});

test("plan-rules Layers exempts the existing spec update from a unit or component test and from red evidence", () => {
  assert.ok(has(rule("Layers"), "an existing `e2e` spec a task's change breaks is updated inside that task and needs neither a unit or component test nor red evidence"));
});

test("plan-rules TDD keeps the task's TDD while its listed spec update needs no red evidence", () => {
  assert.ok(has(rule("TDD"), "An existing end-to-end spec listed in a task's `Files` leaves that task's `TDD` as it is and needs no red evidence"));
});

test("plan-rules Provable exempts an existing spec update from the test-per-clause run", () => {
  assert.ok(has(rule("Provable"), "an existing end-to-end spec update excepted as well: the End-to-end rule proves it without running it"));
});

test("plan-rules Owned names an end-to-end spec among the existing tests asserting a changed behaviour", () => {
  assert.ok(has(rule("Owned"), "every existing test asserting the behaviour it changes, an end-to-end spec included"));
});

test("test-strategy lets a coder update a listed existing end-to-end spec without the user's request, a reviewer raising no finding", () => {
  assert.ok(has(STRATEGY, "A coder updates, without the user's request, an existing end-to-end spec its task lists in `Files`, and a reviewer raises no finding for it."));
});

test("planner SKILL names the existing-spec exception in its end-to-end sentence", () => {
  assert.ok(has(PLANNER, "an existing end-to-end spec whose selector a task changes is no new test: it joins that task's `Files` per the same rule"));
});

test("planner-review carries the Grounded sentence searching the end-to-end specs for the selectors of every changed component", () => {
  assert.ok(has(PLAN_REVIEW, GROUNDED));
});

test("planner-task-review carries the Grounded sentence searching the end-to-end specs for the selectors of every changed component", () => {
  assert.ok(has(TASK_REVIEW, GROUNDED));
});

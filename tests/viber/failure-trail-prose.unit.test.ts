/*
 * failure-trail-prose.unit.test.ts - pins the prose that makes both reviewers label every
 * Blocking finding of a report with its cause.
 *
 * `task-reviewer` and `final-reviewer` write each finding as one item whose first line is whole
 * on one line: `- Blocking [<cause>] <path>:<line> - <what is wrong>` or, for a Minor finding,
 * `- Minor <path>:<line> - <what is wrong>` with no cause. The cause is one of four words
 * (`convention`, `place`, `plan`, `task`), listed with its meaning in the same wording in both
 * files, and a Blocking item carries exactly one, `task` when none of the other three clearly
 * fits. The files read here are shipped prompts, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/failure-trail-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(rel: string): string {
  return fs.readFileSync(path.join(VIBER, rel), "utf8");
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function output(text: string): string {
  return text.slice(text.indexOf("\n## Output\n"));
}

const TASK_OUTPUT = output(read("agents/task-reviewer.md"));
const FINAL_OUTPUT = output(read("agents/final-reviewer.md"));

const BLOCKING_ITEM = "- Blocking [<cause>] <path>:<line> - <what is wrong>";
const MINOR_ITEM = "- Minor <path>:<line> - <what is wrong>";

const CAUSE_LINES = [
  "- `convention` - the code works but breaks a pattern the project's own code follows in other files",
  "- `place` - the defect comes from a fact about one place the task does not state: a module's invariant, a tool's quirk, a trap",
  "- `plan` - the plan or the task file is wrong or incomplete: a file missing from `Files`, a wrong contract, a missing dependency",
  "- `task` - every other defect: a logic error, a missed `DoD` clause, a missing or weak test",
];

const ONE_CAUSE_RULE = "- A Blocking item carries exactly one cause, `task` when none of the other three clearly fits.";
const MINOR_RULE = "- A Minor item carries no cause.";

function causeLines(section: string): string[] {
  return lines(section).filter((line) => /^- `(convention|place|plan|task)` - /.test(line));
}

test("task-reviewer's Output states the Blocking finding item, its first line whole on one line", () => {
  assert.ok(lines(TASK_OUTPUT).includes(BLOCKING_ITEM));
});

test("task-reviewer's Output states the Minor finding item, its first line whole on one line", () => {
  assert.ok(lines(TASK_OUTPUT).includes(MINOR_ITEM));
});

test("final-reviewer's Output states the Blocking finding item, its first line whole on one line", () => {
  assert.ok(lines(FINAL_OUTPUT).includes(BLOCKING_ITEM));
});

test("final-reviewer's Output states the Minor finding item, its first line whole on one line", () => {
  assert.ok(lines(FINAL_OUTPUT).includes(MINOR_ITEM));
});

test("task-reviewer lists the four reviewer causes with their meanings", () => {
  assert.deepEqual(causeLines(TASK_OUTPUT), CAUSE_LINES);
});

test("final-reviewer lists the four reviewer causes with their meanings in the wording of task-reviewer", () => {
  assert.deepEqual(causeLines(FINAL_OUTPUT), CAUSE_LINES);
});

test("task-reviewer gives a Blocking finding exactly one cause, task when none of the other three clearly fits", () => {
  assert.ok(lines(TASK_OUTPUT).includes(ONE_CAUSE_RULE));
});

test("final-reviewer gives a Blocking finding exactly one cause, task when none of the other three clearly fits", () => {
  assert.ok(lines(FINAL_OUTPUT).includes(ONE_CAUSE_RULE));
});

test("task-reviewer gives a Minor finding no cause", () => {
  assert.ok(lines(TASK_OUTPUT).includes(MINOR_RULE));
});

test("final-reviewer gives a Minor finding no cause", () => {
  assert.ok(lines(FINAL_OUTPUT).includes(MINOR_RULE));
});

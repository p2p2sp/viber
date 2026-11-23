/*
 * red-evidence-prose.unit.test.ts - pins the prose that makes a `TDD: required` task prove
 * its tests were red before its production change.
 *
 * `task-coder` returns a `RED:` line on such a PASS, pointing at the `red.log` of a
 * `Verification` run made before the first production edit, and voids a PASS whose own text
 * admits skipping a required step. `implementor` never waives the review of a `TDD: required`
 * task, hands the `RED:` line to `task-step.sh` as `--red` and `--red-log`, runs the call of
 * such a PASS under a Bash timeout of 600000 (the red check runs inside it, a timeout reported
 * as `--red-timeout`) and counts the `red-check:` field of each directive; the `red-check`
 * fragment is gone and `task-step.sh` holds the result mapping. `task-reviewer` checks the
 * failing tests are the task's own, and the close prints the `red-check:` tally. The files read
 * here are shipped prompts, whose text is the behaviour. Nothing is spawned. Each phrase is
 * matched with any run of whitespace between its words, so rewrapping a line breaks no test.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/red-evidence-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(relative: string): string {
  return fs.readFileSync(path.join(VIBER, relative), "utf8");
}

const SKILL = read("skills/implementor/SKILL.md");
const CODER = read("agents/task-coder.md");
const REVIEWER = read("agents/task-reviewer.md");
const CLOSE = read("skills/implementor/parts/close.md");

function phrase(text: string): RegExp {
  const escaped = text.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("\\s+"));
}

function has(haystack: string, text: string): boolean {
  return phrase(text).test(haystack);
}

function frontmatter(text: string): string {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1] ?? "";
}

test("implementor maps the RED: line to --red and --red-log and judges no red evidence itself (task-step.sh reads a PASS without it as a coder failure)", () => {
  assert.ok(has(SKILL, "`--red <n>|missing` and `--red-log \"<path>\"` for its `RED:` line"));
  assert.ok(!has(SKILL, "no red evidence"));
  assert.ok(!has(SKILL, "`RED: 0 failing`"));
});

test("implementor step 3 takes tier, review and subject from the profile: line and waives a review only on a waive? line whose verify: runs the build or the tests (plan-index.sh never prints waive? for a TDD: required task, whose red-check judges the whole command)", () => {
  assert.ok(has(SKILL, "take its tier, review tier and subject from it"));
  assert.ok(has(SKILL, "`waive?` -> waive the review only when the task's `verify:` line runs the project's build or its tests"));
  assert.ok(has(SKILL, "`haiku?` -> its `mechanical:` tiers"));
  assert.ok(!has(SKILL, "unless the config block's `build.red-check` reads `true`"));
});

test("implementor step 3 names no tier rule of the index columns (plan-index.sh decides them and prints the profile: line)", () => {
  assert.ok(!has(SKILL, "`hard` reads `yes`"));
  assert.ok(!has(SKILL, "a `feeds` entry counting 3 or more"));
  assert.ok(!has(SKILL, "raised to `sonnet` from `haiku`"));
});

test("implementor reports a commit as its bare exit (a plain task commit with no change records the task done, so nothing asks for --landed)", () => {
  assert.ok(has(SKILL, "The `RUN:` line of a commit: `commit <exit>`."));
  assert.ok(!has(SKILL, "already committed"));
});

test("implementor builds no red: line for the reviewer (the review block of task-step.sh carries it)", () => {
  assert.ok(!has(SKILL, "`red: <path>`"));
  assert.ok(!has(SKILL, "red-check: <line>"));
});

test("implementor no longer preloads the red-check fragment, which is gone with its switch-text.sh call", () => {
  assert.ok(!has(SKILL, "build.red-check"));
  assert.ok(!fs.existsSync(path.join(VIBER, "skills/implementor/fragments/red-check.true.md")));
});

test("implementor allowed-tools grants task-step.sh and no longer red-check.sh (task-step.sh runs the check itself)", () => {
  assert.ok(frontmatter(SKILL).includes("Bash(${CLAUDE_PLUGIN_ROOT}/scripts/task-step.sh:*)"));
  assert.ok(!frontmatter(SKILL).includes("red-check.sh"));
});

test("implementor runs the call of a coder PASS of a TDD: required task with Bash timeout 600000, never in the background", () => {
  assert.ok(has(SKILL, "The call of a `PASS` of a `TDD: required` task runs the red check: Bash timeout 600000, never in the background"));
});

test("implementor repeats a call cut off by its timeout with --red-timeout", () => {
  assert.ok(has(SKILL, "cut off by it, run the same call again with `--red-timeout`"));
});

test("implementor counts the red-check field of each directive by result for the final summary", () => {
  assert.ok(has(SKILL, "the `red-check:` field of each directive"));
  assert.ok(has(SKILL, "`FAIL-AS-EXPECTED` sealed, `PASSED-WITHOUT-CHANGE` rejected, `UNRUNNABLE` by task id"));
});

test("task-coder returns RED: <n> failing pointing at its red.log on a TDD: required PASS", () => {
  assert.ok(has(CODER, "on PASS of a `TDD: required` task with a task file: `RED: <n> failing | <out>/red.log`"));
});

test("task-coder on an attempt starting with the production code in the tree takes red from the revert route into a fresh log (a green rerun must not fail the attempt or overwrite earlier evidence)", () => {
  assert.ok(has(CODER, "On a dispatch carrying `reason`, `report`, `resume` or `repair`, where the production code is already in the tree, a new test's red comes from `tdd.md`'s revert route instead"));
  assert.ok(has(CODER, "goes to the next free log of `<out>` (`red-2.log`, `red-3.log`, ...), never over an earlier one"));
});

test("task-coder removes a path it reverted from its extras file", () => {
  assert.ok(has(CODER, "remove from that file every path you reverted to its committed state"));
});

test("task-coder returns RED: missing <symbol> only for an error naming a symbol not yet existing", () => {
  assert.ok(has(CODER, "`RED: missing <symbol> | <out>/red.log` when a compile or import error names a symbol not yet existing, the only such error that counts"));
});

test("task-coder voids a PASS whose own text admits skipping a required step into VERDICT: FAIL", () => {
  assert.ok(has(CODER, "A PASS whose own text admits skipping a step the task requires is void: return `VERDICT: FAIL` with that step in `REASON`"));
});

test("task-coder redirects Verification into red.log after the first test and before the first production edit (every test written up front is the horizontal slicing tdd.md bars)", () => {
  assert.ok(has(CODER, "After writing the first test and before the first production edit, run `Verification` redirected `> <out>/red.log 2>&1`"));
  assert.ok(has(CODER, "read only the failing count from the log"));
});

test("task-reviewer takes a red: input naming the coder's pre-edit log", () => {
  assert.ok(has(REVIEWER, "A `red: <path>` line names the log of the coder's first `Verification` run, before any production edit"));
});

test("task-reviewer takes a red-check: input carrying the check's verdict", () => {
  assert.ok(has(REVIEWER, "A `red-check: <line>` line is the verdict of the run"));
});

test("task-reviewer checks the failing tests are the task's new tests, an unrelated one not counting", () => {
  assert.ok(has(REVIEWER, "check in the log that the failing tests are the task's new tests (an unrelated failing test does not count)"));
});

test("task-reviewer on red-check UNRUNNABLE holds a test that would pass on HEAD as Blocking", () => {
  assert.ok(has(REVIEWER, "on `red-check: UNRUNNABLE`"));
  assert.ok(has(REVIEWER, "a test that would pass on HEAD being Blocking"));
});

test("the close prints the red-check tally right after the 7 lines in both forms", () => {
  assert.ok(has(CLOSE, "Right after the 7 lines, in both forms: `red-check: <n> sealed, <n> rejected, unrunnable: <ids>`"));
});

test("the close prints red-check: off when build.red-check does not read true", () => {
  assert.ok(has(CLOSE, "`red-check: off` when the config block's `build.red-check` does not read `true`"));
});

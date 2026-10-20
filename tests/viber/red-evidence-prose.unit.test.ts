/*
 * red-evidence-prose.unit.test.ts - pins the prose that makes a `TDD: required` task prove
 * its tests were red before its production change.
 *
 * `task-coder` returns a `RED:` line on such a PASS, pointing at the `red.log` of a
 * `Verification` run made before the first production edit, and voids a PASS whose own text
 * admits skipping a required step. `implementor` reads a PASS without red evidence as a coder
 * failure, waives the review of a `TDD: required` task only while `build.red-check` reads
 * `true`, preloads the `red-check` fragment and hands the reviewer the `red:` path. The
 * fragment maps each `red-check.sh` result, `task-reviewer` checks the failing tests are the
 * task's own, and the close prints the `red-check:` tally. The files read here are shipped
 * prompts, whose text is the behaviour. Nothing is spawned. Each phrase is matched with any
 * run of whitespace between its words, so rewrapping a line breaks no test.
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
const FRAGMENT = read("skills/implementor/fragments/red-check.true.md");
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

test("implementor reads a TDD: required PASS with no RED: line or RED: 0 failing as a coder failure, no red evidence", () => {
  assert.ok(has(SKILL, "a `PASS` of a `TDD: required` task with no `RED:` line or `RED: 0 failing`"));
  assert.ok(has(SKILL, "its `REASON:` read as `no red evidence`"));
});

test("implementor step 3 never waives the review of a TDD: required task (red-check judges the whole command, so only a reviewer tells which tests failed)", () => {
  assert.ok(has(SKILL, "nor on a `TDD: required` task."));
  assert.ok(!has(SKILL, "unless the config block's `build.red-check` reads `true`"));
});

test("implementor re-runs an exit-4 commit with --landed in place of its --with paths (commit-task.sh refuses --landed with --with)", () => {
  assert.ok(has(SKILL, "the same call re-runs with `--landed \"<sha>\"` in place of its `--with` paths"));
});

test("the implementor reviewer dispatch carries the red path of the coder's last RED: line", () => {
  assert.ok(has(SKILL, "`red: <path>`: the path on the coder's last `RED:` line"));
});

test("implementor preloads the red-check fragment through switch-text.sh with key build.red-check", () => {
  assert.ok(has(SKILL, '"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.red-check "${CLAUDE_SKILL_DIR}" red-check'));
});

test("implementor allowed-tools lists red-check.sh (a preloaded call it cannot make is refused)", () => {
  assert.ok(frontmatter(SKILL).includes("Bash(${CLAUDE_PLUGIN_ROOT}/scripts/red-check.sh:*)"));
});

test("the red-check fragment calls red-check.sh with the plan and the task id", () => {
  assert.ok(has(FRAGMENT, '"${CLAUDE_PLUGIN_ROOT}/scripts/red-check.sh" "<plan>" "<id>"'));
});

test("the red-check fragment runs the call with Bash timeout 600000, never in the background", () => {
  assert.ok(has(FRAGMENT, "Bash timeout 600000"));
  assert.ok(has(FRAGMENT, "never in the background"));
});

test("the red-check fragment lets FAIL-AS-EXPECTED go on as for the PASS", () => {
  assert.ok(has(FRAGMENT, "`red-check: FAIL-AS-EXPECTED <log>` -> go on"));
});

test("the red-check fragment maps PASSED-WITHOUT-CHANGE to a coder failure, tests pass without the change", () => {
  assert.ok(has(FRAGMENT, "`red-check: PASSED-WITHOUT-CHANGE <files>` -> a coder failure, `REASON: tests pass without the change: <files>`"));
});

test("the red-check fragment sends UNRUNNABLE, a non-zero exit or no line to the reviewer", () => {
  assert.ok(has(FRAGMENT, "`red-check: UNRUNNABLE <reason>`, a non-zero exit or no `red-check:` line -> reviewer dispatch."));
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

test("task-coder redirects Verification into red.log after the tests and before the first production edit", () => {
  assert.ok(has(CODER, "After writing the tests and before the first production edit, run `Verification` redirected `> <out>/red.log 2>&1`"));
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

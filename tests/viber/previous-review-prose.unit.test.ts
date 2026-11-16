/*
 * previous-review-prose.unit.test.ts - pins the prose that starts a re-review from the
 * previous findings (contract C2, the `previous: <dir>/work/review-<id>-<round>.md` line).
 *
 * After a review of a task failed, `implementor` hands the next reviewer of that task the
 * `REVIEW` path the failed one returned, and omits the line before any failure. `task-reviewer`
 * given that line checks each Blocking item of the report against the code before any other
 * check: an item still standing ends the round on `VERDICT: FAIL` with a report holding those
 * items alone and no `## Must Check` run, with every item fixed or the file missing it gates
 * the task in full as on a first round, and a Minor item is never rechecked. The files read
 * here are shipped prompts, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/previous-review-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

const SKILL = fs.readFileSync(path.join(VIBER, "skills/implementor/SKILL.md"), "utf8");
const REVIEWER = fs.readFileSync(path.join(VIBER, "agents/task-reviewer.md"), "utf8");

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function bulletsOpening(text: string, opening: string): string[] {
  return lines(text).filter((line) => line.startsWith(opening));
}

const STEP_4 = SKILL.slice(SKILL.indexOf("## 4. Run the plan"), SKILL.indexOf("## 5 to 7. Close and archive"));
const DISPATCH_LINE = bulletsOpening(STEP_4, "- `previous: ")[0] ?? "";
const INPUT = REVIEWER.slice(REVIEWER.indexOf("\n## Input\n"), REVIEWER.indexOf("\n## Must Check\n"));
const PREVIOUS = bulletsOpening(INPUT, "- A `previous` line")[0] ?? "";

test("the reviewer dispatch of implementor carries one previous line in the C2 shape", () => {
  assert.equal(bulletsOpening(STEP_4, "- `previous: ").length, 1);
  assert.ok(DISPATCH_LINE.startsWith("- `previous: <dir>/work/review-<id>-<round>.md`"));
});

test("the previous line is the REVIEW path the task's last failed review returned in this session", () => {
  assert.ok(DISPATCH_LINE.includes("the `REVIEW` path the task's last failed review returned in this session"));
});

test("the previous line rides every review of the task after one of its reviews failed and is omitted before", () => {
  assert.ok(DISPATCH_LINE.includes("on every review of the task after one of its reviews failed, omitted before"));
});

test("the previous line sits in the reviewer dispatch, after the report line and before the commit step", () => {
  assert.ok(STEP_4.indexOf("- `previous: ") > STEP_4.indexOf("- `report: <dir>/work/review-<id>-<round>.md`"));
  assert.ok(STEP_4.indexOf("- `previous: ") < STEP_4.indexOf("Commit: `"));
});

test("task-reviewer carries exactly one previous input bullet naming the C2 line", () => {
  assert.equal(bulletsOpening(INPUT, "- A `previous` line").length, 1);
  assert.ok(PREVIOUS.includes("`previous: <dir>/work/review-<id>-<round>.md`"));
});

test("the reviewer checks each Blocking item of the previous report against the code before any other check", () => {
  assert.ok(PREVIOUS.includes("before any other check, check each Blocking item of it against the code"));
});

test("an item still standing ends the round on FAIL with a report holding those items alone", () => {
  assert.ok(PREVIOUS.includes("An item still standing ends your round on `VERDICT: FAIL` with a report holding those items alone"));
});

test("the report of a round ended by a standing item copies each first line character for character", () => {
  assert.ok(PREVIOUS.includes("each first line copied character for character"));
});

test("a round ended by a standing item runs no Must Check", () => {
  assert.ok(PREVIOUS.includes("run no `## Must Check`"));
});

test("with every item fixed, or the file missing, the reviewer gates the task in full as on a first round", () => {
  assert.ok(PREVIOUS.includes("With every item fixed, or the file missing, gate the task in full as on a first round"));
});

test("a Minor item of the previous report is never rechecked", () => {
  assert.ok(PREVIOUS.includes("A Minor item is never rechecked"));
});

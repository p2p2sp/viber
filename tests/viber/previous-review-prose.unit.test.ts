/*
 * previous-review-prose.unit.test.ts - pins the prose that starts a re-review from the
 * previous findings (contract C2, the `previous: <dir>/work/review-<id>-<round>.md` line).
 *
 * After a review of a task failed, `task-step.sh` hands the next reviewer of that task the
 * `REVIEW` path the failed one returned (`implementor` reports it as `--report`), and omits the
 * line before any failure. `task-reviewer`
 * given that line checks each Blocking item of the report against the code before any other
 * check: an item still standing ends the round on `VERDICT: FAIL` with a report holding those
 * items alone and no `## Must Check` run, an item a `decision:` line overrules or the code
 * proves wrong is dropped (a wrong finding must not fail every later round), with every item
 * fixed or dropped, or the file missing, it gates the task in full as on a first round, and a
 * Minor item is never rechecked. Each case is its own sub-bullet of the `previous` bullet. The
 * files read here are shipped prompts, whose text is the behaviour. Nothing is spawned.
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
const INPUT = REVIEWER.slice(REVIEWER.indexOf("\n## Input\n"), REVIEWER.indexOf("\n## Must Check\n"));
const PREVIOUS = bulletsOpening(INPUT, "- A `previous` line")[0] ?? "";

/** The sub-bullets right under the `previous` bullet: one case each. */
function casesOfPrevious(): string[] {
  const all = lines(INPUT);
  const cases: string[] = [];
  for (let i = all.indexOf(PREVIOUS) + 1; i > 0 && i < all.length && all[i].startsWith("  - "); i++) cases.push(all[i]);
  return cases;
}

const CASES = casesOfPrevious();

function caseOpening(opening: string): string {
  return CASES.find((line) => line.startsWith(`  - ${opening}`)) ?? "";
}

const STANDING = caseOpening("An item still standing");
const DROPPED = caseOpening("An item a `decision:` line overrules");

test("implementor builds no previous line: task-step.sh prints it from the REVIEW path of the last failed review, handed over as --report", () => {
  assert.equal(bulletsOpening(STEP_4, "- `previous: ").length, 0);
  assert.ok(!STEP_4.includes("`previous:"));
  assert.ok(STEP_4.includes("`--report \"<path>\"` for its `REVIEW` path"));
});

test("task-reviewer carries exactly one previous input bullet naming the C2 line", () => {
  assert.equal(bulletsOpening(INPUT, "- A `previous` line").length, 1);
  assert.ok(PREVIOUS.includes("`previous: <dir>/work/review-<id>-<round>.md`"));
});

test("the reviewer checks each Blocking item of the previous report against the code before any other check", () => {
  assert.ok(PREVIOUS.includes("before any other check, check each Blocking item of it against the code"));
});

test("the previous bullet holds its four cases as four sub-bullets, one case a line", () => {
  assert.equal(CASES.length, 4);
  assert.ok(!PREVIOUS.includes("An item still standing"));
});

test("an item still standing ends the round on FAIL with a report holding those items alone", () => {
  assert.ok(STANDING.includes("An item still standing ends your round on `VERDICT: FAIL` with a report holding those items alone"));
});

test("the report of a round ended by a standing item copies each first line character for character", () => {
  assert.ok(STANDING.includes("each first line copied character for character"));
});

test("a round ended by a standing item runs no Must Check", () => {
  assert.ok(STANDING.includes("run no `## Must Check`"));
});

test("an item a decision line overrules, or one the reviewer proves wrong, is dropped and never standing (a wrong finding must not fail every later round)", () => {
  assert.ok(DROPPED.includes("or one a command you ran or code you read proves wrong, is dropped, never standing"));
});

test("a dropped item is named once as a Minor item of a report written in that round", () => {
  assert.ok(DROPPED.includes("a report you write this round adds one Minor item for it"));
  assert.ok(DROPPED.includes("`earlier finding dropped: <why>`"));
});

test("with every item fixed or dropped, or the file missing, the reviewer gates the task in full as on a first round", () => {
  assert.ok(CASES.includes("  - With every item fixed or dropped, or the file missing, gate the task in full as on a first round."));
});

test("a Minor item of the previous report is never rechecked", () => {
  assert.ok(CASES.includes("  - A Minor item is never rechecked."));
});

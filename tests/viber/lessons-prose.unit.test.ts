/*
 * lessons-prose.unit.test.ts - pins the prose that hands the run's lessons to every later coder
 * (contract C3, the `run-lessons: <Name> x<n>[, <Name> x<n>...]` coder dispatch line).
 *
 * `task-step.sh` writes the lessons file (`run-failures.sh --lessons "<dir>"` before the
 * session's first coder block and after every reviewer `VERDICT: FAIL`) that `plan-index.sh
 * --dispatch` prints as `run-lessons:` on every task coder's lines; `implementor` runs the call
 * itself for the final-review fix coder's dispatch (`final-review.true.md`) and the step 5 repair
 * coder's (`parts/close.md`), left out on `lessons: none`, and on no reviewer dispatch. `task-coder` reads those rules first and checks
 * every test it wrote or changed against them before PASS; the README and both languages of
 * `help.html` say later coders get them. The files read here are shipped prompts and guides,
 * whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/lessons-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function shipped(file: string): string {
  return fs.readFileSync(path.join(VIBER, file), "utf8");
}

const SKILL = shipped("skills/implementor/SKILL.md");
const FINAL_REVIEW = shipped("skills/implementor/fragments/final-review.true.md");
const CLOSE = shipped("skills/implementor/parts/close.md");
const CODER = shipped("agents/task-coder.md");
const README = shipped("README.md");
const HELP = shipped("skills/setup/assets/help.html");

const STEP_4 = SKILL.slice(SKILL.indexOf("## 4. Run the plan"), SKILL.indexOf("## 5 to 7. Close and archive"));
const LESSONS_BULLET = STEP_4.split(/\r?\n/).find((line) => line.startsWith("- `run-lessons:`")) ?? "";
const FIX_ROUND = FINAL_REVIEW.slice(FINAL_REVIEW.indexOf("fix round 1"), FINAL_REVIEW.indexOf("- Fix coder `VERDICT: DENIED`"));
const REVIEWERS_OF_FINAL_REVIEW =
  FINAL_REVIEW.slice(0, FINAL_REVIEW.indexOf("fix round 1")) + FINAL_REVIEW.slice(FINAL_REVIEW.indexOf("- Otherwise dispatch"));
const REPAIR_DISPATCH = CLOSE.slice(CLOSE.indexOf("Repair dispatch:"), CLOSE.indexOf("Repair commit,"));
const CODER_INPUT = CODER.slice(CODER.indexOf("\n## Input\n"), CODER.indexOf("\n## Implement\n"));
const CODER_PROVE = CODER.slice(CODER.indexOf("\n## Prove it green\n"), CODER.indexOf("\n## Leave your notes\n"));

const LINE = "run-lessons: <list of the last lessons: line>";
const GUIDE_SENTENCE_EN = "Later coders of the run get the test rules that earlier reviews of the run raised.";
const GUIDE_SENTENCE_PL = "Kolejni wykonawcy builda dostają reguły testów, które podniosły wcześniejsze recenzje tego builda.";

test("implementor builds no run-lessons line of a task coder: task-step.sh writes the lessons file and plan-index.sh --dispatch prints the line", () => {
  assert.ok(!STEP_4.includes("run-lessons: <Name> x<n>"));
  assert.ok(LESSONS_BULLET.includes("`task-step.sh` writes the same list into every task coder's lines"));
});

test("implementor runs the lessons call for the final-review fix coder and the step 5 repair coder just before their dispatch", () => {
  assert.ok(
    LESSONS_BULLET.includes(
      "for the final-review fix coder and the step 5 repair coder: `\"${CLAUDE_PLUGIN_ROOT}/scripts/run-failures.sh\" --lessons \"<dir>\"` run just before that dispatch",
    ),
  );
});

test("a lessons line reading none leaves the run-lessons line out of the dispatch", () => {
  assert.ok(LESSONS_BULLET.includes("`lessons: none` omitting the line"));
});

test("a reviewer dispatch never carries run-lessons", () => {
  assert.ok(LESSONS_BULLET.includes("a reviewer dispatch never carries it"));
});

test("the final-review fix coder's dispatch carries the run-lessons line", () => {
  assert.ok(FIX_ROUND.includes(LINE));
});

test("the step 5 repair coder's dispatch carries the run-lessons line unless the lessons line reads none", () => {
  assert.ok(REPAIR_DISPATCH.includes(`\`${LINE}\` unless that line reads \`lessons: none\``));
});

test("no final reviewer dispatch carries run-lessons", () => {
  assert.ok(!REVIEWERS_OF_FINAL_REVIEW.includes("run-lessons"));
});

test("task-coder carries one run-lessons input bullet that reads those rules first", () => {
  const bullets = CODER_INPUT.split("\n").filter((line) => line.startsWith("- A `run-lessons` line"));
  assert.equal(bullets.length, 1);
  assert.ok(bullets[0].includes("read those rules first"));
});

test("task-coder checks every test it wrote or changed against the run-lessons rules before returning PASS", () => {
  assert.ok(
    CODER_PROVE.includes(
      "Before returning PASS, re-read every test you wrote or changed against each `(blocking)` rule of `<refs>/test-strategy.md` and each rule of `run-lessons`: a breach is red.",
    ),
  );
});

test("the README says later coders get the rules earlier reviews of the run raised", () => {
  assert.ok(README.includes(GUIDE_SENTENCE_EN));
});

test("the English help page says later coders get the rules earlier reviews of the run raised", () => {
  assert.ok(HELP.includes(`<p lang="en">${GUIDE_SENTENCE_EN}`));
});

test("the Polish help page says later coders get the rules earlier reviews of the run raised", () => {
  assert.ok(HELP.includes(`<p lang="pl">${GUIDE_SENTENCE_PL}`));
});

/*
 * lessons-prose.unit.test.ts - pins the prose that hands the run's lessons to every later coder
 * (contract C3, the `run-lessons: <Name> x<n>[, <Name> x<n>...]` coder dispatch line).
 *
 * `implementor` runs `run-failures.sh --lessons "<dir>"` once before its first coder dispatch of
 * the session and again after every reviewer `VERDICT: FAIL`, keeping the last `lessons:` line,
 * and passes its list as `run-lessons:` on every coder dispatch (a task's, the final-review fix
 * coder's in `final-review.true.md`, the step 5 repair coder's in `parts/close.md`), left out on
 * `lessons: none`, and on no reviewer dispatch. `task-coder` reads those rules first and checks
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
const CODER_DISPATCH = STEP_4.slice(STEP_4.indexOf("Coder dispatch:"), STEP_4.indexOf("Reviewer dispatch:"));
const REVIEWER_DISPATCH = STEP_4.slice(STEP_4.indexOf("Reviewer dispatch:"), STEP_4.indexOf("Commit: `"));
const FIX_ROUND = FINAL_REVIEW.slice(FINAL_REVIEW.indexOf("fix round 1"), FINAL_REVIEW.indexOf("- Fix coder `VERDICT: DENIED`"));
const REVIEWERS_OF_FINAL_REVIEW =
  FINAL_REVIEW.slice(0, FINAL_REVIEW.indexOf("fix round 1")) + FINAL_REVIEW.slice(FINAL_REVIEW.indexOf("- Otherwise dispatch"));
const REPAIR_DISPATCH = CLOSE.slice(CLOSE.indexOf("Repair dispatch:"), CLOSE.indexOf("Repair commit,"));
const CODER_INPUT = CODER.slice(CODER.indexOf("\n## Input\n"), CODER.indexOf("\n## Implement\n"));
const CODER_PROVE = CODER.slice(CODER.indexOf("\n## Prove it green\n"), CODER.indexOf("\n## Leave your notes\n"));

const LINE = "run-lessons: <list of the last lessons: line>";
const GUIDE_SENTENCE_EN = "Later coders of the run get the test rules that earlier reviews of the run raised.";
const GUIDE_SENTENCE_PL = "Kolejni wykonawcy builda dostają reguły testów, które podniosły wcześniejsze recenzje tego builda.";

test("implementor runs the lessons call once before the first coder dispatch of the session", () => {
  assert.ok(
    CODER_DISPATCH.includes(
      "`run-lessons`: `\"${CLAUDE_PLUGIN_ROOT}/scripts/run-failures.sh\" --lessons \"<dir>\"` runs once before the session's first coder dispatch",
    ),
  );
});

test("implementor runs the lessons call again after every reviewer FAIL, keeping the last lessons line", () => {
  assert.ok(CODER_DISPATCH.includes("and again after every reviewer `VERDICT: FAIL` of a task, keeping the last `lessons:` line"));
});

test("the coder dispatch block carries the run-lessons line in the C3 shape", () => {
  assert.ok(CODER_DISPATCH.includes("run-lessons: <Name> x<n>[, <Name> x<n>...]"));
});

test("a lessons line reading none leaves the run-lessons line out of the dispatch", () => {
  assert.ok(CODER_DISPATCH.includes("`lessons: none` omits the line"));
});

test("every coder dispatch carries run-lessons, the final-review fix coder's and the step 5 repair coder's included", () => {
  assert.ok(
    CODER_DISPATCH.includes(
      "Every coder dispatch carries it, the final-review fix coder's and the step 5 repair coder's included; a reviewer dispatch never does.",
    ),
  );
});

test("the final-review fix coder's dispatch carries the run-lessons line", () => {
  assert.ok(FIX_ROUND.includes(LINE));
});

test("the step 5 repair coder's dispatch carries the run-lessons line unless the lessons line reads none", () => {
  assert.ok(REPAIR_DISPATCH.includes(`\`${LINE}\` unless that line reads \`lessons: none\``));
});

test("no task reviewer dispatch carries run-lessons", () => {
  assert.ok(!REVIEWER_DISPATCH.includes("run-lessons"));
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

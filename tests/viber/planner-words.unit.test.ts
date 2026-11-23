/*
 * planner-words.unit.test.ts - caps the words of `planner/SKILL.md` and of the five plan reviewers.
 *
 * The planner reads this file on every plan and again through each review round, so its words
 * count against the user's usage limits: the mechanical plan checks live in `plan-index.sh` and
 * the bookkeeping of a review round in `review-round.sh`, and the file keeps only the rule to run
 * the script and follow its directives. The four planner reviewers and `outside-plan-review` read
 * their whole file on every round, so each is capped too. Growing a file past its cap fails this
 * file until the cap is raised on purpose. The files read here are shipped prompts, whose text is
 * the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/planner-words.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

const SKILL = fs.readFileSync(path.join(VIBER, "skills/planner/SKILL.md"), "utf8");

const PLANNER_WORD_CAP = 1775;

const WORDS_BEFORE_THE_SCRIPTED_ROUNDS = 2100;
const WORDS_BEFORE_THE_SCRIPTED_STEPS = 1800;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

test("SKILL.md stays within PLANNER_WORD_CAP words", () => {
  const count = words(SKILL);
  assert.ok(count <= PLANNER_WORD_CAP, `${count} words, cap ${PLANNER_WORD_CAP}`);
});

test("PLANNER_WORD_CAP sits below the 2100 words the file held before the scripted review rounds (a cap at or above them lets the prose grow back)", () => {
  assert.ok(PLANNER_WORD_CAP < WORDS_BEFORE_THE_SCRIPTED_ROUNDS);
});

test("PLANNER_WORD_CAP sits below the 1800 words the file held before the scripted steps of intent, fixer and e2e (a cap at or above them lets the prose grow back)", () => {
  assert.ok(PLANNER_WORD_CAP < WORDS_BEFORE_THE_SCRIPTED_STEPS);
});

// [agent, cap, words before the scripted plan checks]: each plan reviewer reads its whole file on every review round.
const REVIEWER_WORD_CAPS: [string, number, number][] = [
  ["planner-review", 1033, 1056],
  ["planner-spec-review", 790, 797],
  ["planner-graph-review", 616, 618],
  ["planner-task-review", 733, 735],
  ["outside-plan-review", 470, 490],
];

for (const [name, cap, before] of REVIEWER_WORD_CAPS) {
  test(`${name} stays within ${cap} words`, () => {
    const count = words(fs.readFileSync(path.join(VIBER, `agents/${name}.md`), "utf8"));
    assert.ok(count <= cap, `${count} words, cap ${cap}`);
  });

  test(`the ${name} cap of ${cap} sits below the ${before} words the file held before the scripted plan checks (a cap at or above them lets the prose grow back)`, () => {
    assert.ok(cap < before);
  });
}

test("the word counter counts whitespace-separated words, never lines or characters (a cap that counts the wrong unit proves nothing)", () => {
  assert.equal(words("one  two\nthree\t four\n"), 4);
  assert.equal(words(""), 0);
});

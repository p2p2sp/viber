/*
 * planner-words.unit.test.ts - caps the words of `planner/SKILL.md`.
 *
 * The planner reads this file on every plan and again through each review round, so its words
 * count against the user's usage limits: the mechanical plan checks live in `plan-index.sh` and
 * the bookkeeping of a review round in `review-round.sh`, and the file keeps only the rule to run
 * the script and follow its directives. Growing it past its cap fails this file until the cap is
 * raised on purpose. The file read here is a shipped prompt, whose text is the behaviour.
 * Nothing is spawned.
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

const PLANNER_WORD_CAP = 1800;

const WORDS_BEFORE_THE_SCRIPTED_ROUNDS = 2100;

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

test("the word counter counts whitespace-separated words, never lines or characters (a cap that counts the wrong unit proves nothing)", () => {
  assert.equal(words("one  two\nthree\t four\n"), 4);
  assert.equal(words(""), 0);
});

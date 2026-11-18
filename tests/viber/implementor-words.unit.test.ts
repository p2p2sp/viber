/*
 * implementor-words.unit.test.ts - caps the word count of `implementor/SKILL.md`.
 *
 * The skill is read on every start and re-read through the whole build, so its words count
 * against the user's usage limits: the task loop and the dispatch lines live in
 * `task-step.sh` and `plan-index.sh --dispatch`, and the skill keeps only the rule to run
 * the script and follow its answer. Growing the skill past `IMPLEMENTOR_WORD_CAP` fails
 * this file until the cap is raised on purpose. The file read here is a shipped prompt,
 * whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/implementor-words.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SKILL = fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/skills/implementor/SKILL.md"), "utf8");

const IMPLEMENTOR_WORD_CAP = 2867;
const WORDS_BEFORE_THE_SCRIPTED_LOOP = 3626;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

test("SKILL.md stays within IMPLEMENTOR_WORD_CAP words", () => {
  const count = words(SKILL);
  assert.ok(count <= IMPLEMENTOR_WORD_CAP, `${count} words, cap ${IMPLEMENTOR_WORD_CAP}`);
});

test("IMPLEMENTOR_WORD_CAP sits below the 3626 words of the skill before the scripted task loop", () => {
  assert.ok(IMPLEMENTOR_WORD_CAP < WORDS_BEFORE_THE_SCRIPTED_LOOP);
});

test("the word counter counts whitespace-separated words, never lines or characters (a cap that counts the wrong unit proves nothing)", () => {
  assert.equal(words("one  two\nthree\t four\n"), 4);
  assert.equal(words(""), 0);
});

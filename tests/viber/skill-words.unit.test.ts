/*
 * skill-words.unit.test.ts - caps the words of the `SKILL.md` of `fixer`, `e2e`, `prototype`, `pr-feedback`,
 * `pr-feedback-reply`, `issue-create`, `factory`, `commit`, `pr-create`, `setup` and `idea-validator`.
 *
 * Each skill reads its whole file on every run, so its words count against the user's usage limits: the mechanical
 * steps live in scripts that answer in directive lines, and the file keeps only the rule to run the script and follow
 * it. Each cap is the file's word count after those scripts, counted by whitespace split, and sits below the count the
 * file held before them. Growing a file past its cap fails this file until the cap is raised on purpose. The files
 * read here are shipped prompts, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/skill-words.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SKILLS = path.resolve(import.meta.dirname, "../../viber/skills");

// [skill, cap, words before the scripted steps]
const SKILL_WORD_CAPS: [string, number, number][] = [
  ["fixer", 1180, 1191],
  ["e2e", 1189, 1213],
  ["prototype", 820, 821],
  ["pr-feedback", 664, 667],
  ["pr-feedback-reply", 363, 433],
  ["issue-create", 180, 195],
  ["factory", 777, 789],
  ["commit", 322, 397],
  ["pr-create", 745, 824],
  ["setup", 466, 470],
  ["idea-validator", 1006, 1016],
];

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

for (const [name, cap, before] of SKILL_WORD_CAPS) {
  test(`${name}/SKILL.md stays within ${cap} words`, () => {
    const count = words(fs.readFileSync(path.join(SKILLS, name, "SKILL.md"), "utf8"));
    assert.ok(count <= cap, `${count} words, cap ${cap}`);
  });

  test(`the ${name} cap of ${cap} sits below the ${before} words the file held before the scripted steps (a cap at or above them lets the prose grow back)`, () => {
    assert.ok(cap < before);
  });
}

test("the word counter counts whitespace-separated words, never lines or characters (a cap that counts the wrong unit proves nothing)", () => {
  assert.equal(words("one  two\nthree\t four\n"), 4);
  assert.equal(words(""), 0);
});

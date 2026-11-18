/*
 * implementor-words.unit.test.ts - caps the words of `implementor/SKILL.md`, its close part,
 * `closeout` and `test-runner`.
 *
 * These files are read on every start and re-read through the whole build, so their words
 * count against the user's usage limits: the task loop, the dispatch lines, the run clock,
 * the token report, the leftovers, the repair commits, the final-review slices and the
 * test-runner's change set live in scripts, and the files keep only the rule to run the
 * script and follow its answer. Growing a file past its cap fails this file until the cap
 * is raised on purpose. The files read here are shipped prompts, whose text is the
 * behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/implementor-words.unit.test.ts
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
const CLOSE = read("skills/implementor/parts/close.md");
const CLOSEOUT = read("agents/closeout.md");
const TEST_RUNNER = read("agents/test-runner.md");

const IMPLEMENTOR_WORD_CAP = 2837;
const CLOSE_WORD_CAP = 1312;
const CLOSEOUT_WORD_CAP = 914;
const TEST_RUNNER_WORD_CAP = 1233;

const WORDS_OF_PART_ONE_CAP = 2867;
const WORDS_OF_CLOSE_BEFORE = 1325;
const WORDS_OF_CLOSEOUT_BEFORE = 1431;
const WORDS_OF_TEST_RUNNER_BEFORE = 1257;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

test("SKILL.md stays within IMPLEMENTOR_WORD_CAP words", () => {
  const count = words(SKILL);
  assert.ok(count <= IMPLEMENTOR_WORD_CAP, `${count} words, cap ${IMPLEMENTOR_WORD_CAP}`);
});

test("parts/close.md stays within CLOSE_WORD_CAP words", () => {
  const count = words(CLOSE);
  assert.ok(count <= CLOSE_WORD_CAP, `${count} words, cap ${CLOSE_WORD_CAP}`);
});

test("closeout.md stays within CLOSEOUT_WORD_CAP words", () => {
  const count = words(CLOSEOUT);
  assert.ok(count <= CLOSEOUT_WORD_CAP, `${count} words, cap ${CLOSEOUT_WORD_CAP}`);
});

test("test-runner.md stays within TEST_RUNNER_WORD_CAP words", () => {
  const count = words(TEST_RUNNER);
  assert.ok(count <= TEST_RUNNER_WORD_CAP, `${count} words, cap ${TEST_RUNNER_WORD_CAP}`);
});

test("IMPLEMENTOR_WORD_CAP sits below the 2867 words of the cap of part 1", () => {
  assert.ok(IMPLEMENTOR_WORD_CAP < WORDS_OF_PART_ONE_CAP);
});

test("each close cap sits below the words its file held before this plan (a cap at or above them lets the prose grow back)", () => {
  assert.ok(CLOSE_WORD_CAP < WORDS_OF_CLOSE_BEFORE);
  assert.ok(CLOSEOUT_WORD_CAP < WORDS_OF_CLOSEOUT_BEFORE);
  assert.ok(TEST_RUNNER_WORD_CAP < WORDS_OF_TEST_RUNNER_BEFORE);
});

test("the word counter counts whitespace-separated words, never lines or characters (a cap that counts the wrong unit proves nothing)", () => {
  assert.equal(words("one  two\nthree\t four\n"), 4);
  assert.equal(words(""), 0);
});

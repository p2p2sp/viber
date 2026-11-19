/*
 * memory-rules-words.unit.test.ts - caps the words of `memory/SKILL.md` and `memory-auditor.md`.
 *
 * These files are read on every `/viber:memory` run, so their words count against the user's
 * usage limits: the target list, the auditor briefs and the reconcile of the lists of nodes
 * live in `memory-map.sh`, and the files keep only the rule to run the script and follow its
 * directives. Growing a file past its cap fails this file until the cap is raised on purpose.
 * The files read here are shipped prompts, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/memory-rules-words.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(relative: string): string {
  return fs.readFileSync(path.join(VIBER, relative), "utf8");
}

const MEMORY_SKILL = read("skills/memory/SKILL.md");
const MEMORY_AUDITOR = read("agents/memory-auditor.md");

const MEMORY_SKILL_WORD_CAP = 1900;
const MEMORY_AUDITOR_WORD_CAP = 732;

const WORDS_OF_MEMORY_SKILL_BEFORE = 2053;
const WORDS_OF_MEMORY_AUDITOR_BEFORE = 736;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

test("memory/SKILL.md stays within MEMORY_SKILL_WORD_CAP words", () => {
  const count = words(MEMORY_SKILL);
  assert.ok(count <= MEMORY_SKILL_WORD_CAP, `${count} words, cap ${MEMORY_SKILL_WORD_CAP}`);
});

test("memory-auditor.md stays within MEMORY_AUDITOR_WORD_CAP words", () => {
  const count = words(MEMORY_AUDITOR);
  assert.ok(count <= MEMORY_AUDITOR_WORD_CAP, `${count} words, cap ${MEMORY_AUDITOR_WORD_CAP}`);
});

test("each memory cap sits below the words its file held before this plan (a cap at or above them lets the prose grow back)", () => {
  assert.ok(MEMORY_SKILL_WORD_CAP < WORDS_OF_MEMORY_SKILL_BEFORE);
  assert.ok(MEMORY_AUDITOR_WORD_CAP < WORDS_OF_MEMORY_AUDITOR_BEFORE);
});

test("the word counter counts whitespace-separated words, never lines or characters (a cap that counts the wrong unit proves nothing)", () => {
  assert.equal(words("one  two\nthree\t four\n"), 4);
  assert.equal(words(""), 0);
});

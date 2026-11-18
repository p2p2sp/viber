/*
 * code-auditor-words.unit.test.ts - caps the words of `code-auditor/SKILL.md`, its
 * `references/synthesis.md` and the four auditor agents `critic`, `scout`, `hunter` and
 * `mapper`.
 *
 * These files are read on every audit run, so their words count against the user's usage
 * limits: framing, the map signals, the choice of units, the answer to each return and the
 * folding of verdicts live in scripts, and the files keep only what a model acts on or an
 * agent reads. Growing a file past its cap fails this file until the cap is raised on
 * purpose. The files read here are shipped prompts, whose text is the behaviour. Words are
 * counted by whitespace split, as `wc -w` does. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/code-auditor-words.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

interface Capped {
  file: string;
  cap: number;
  before: number;
}

/** `before` is the word count of the file before the scripted pipeline. */
const CAPPED: Capped[] = [
  { file: "skills/code-auditor/SKILL.md", cap: 900, before: 1655 },
  { file: "skills/code-auditor/references/synthesis.md", cap: 700, before: 1489 },
  { file: "agents/critic.md", cap: 610, before: 613 },
  { file: "agents/scout.md", cap: 306, before: 308 },
  { file: "agents/hunter.md", cap: 854, before: 877 },
  { file: "agents/mapper.md", cap: 758, before: 882 },
];

for (const { file, cap } of CAPPED) {
  test(`${file} stays within ${cap} words`, () => {
    const count = words(fs.readFileSync(path.join(VIBER, file), "utf8"));
    assert.ok(count <= cap, `${count} words, cap ${cap}`);
  });
}

for (const { file, cap, before } of CAPPED) {
  test(`the cap of ${file} sits below the ${before} words it held before this plan (a cap at or above them lets the prose grow back)`, () => {
    assert.ok(cap < before);
  });
}

test("the word counter counts whitespace-separated words, never lines or characters (a cap that counts the wrong unit proves nothing)", () => {
  assert.equal(words("one  two\nthree\t four\n"), 4);
});

test("the word counter counts an empty text as no word", () => {
  assert.equal(words(""), 0);
});

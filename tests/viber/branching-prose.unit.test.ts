/*
 * The four branching-start fragments (intent and fixer, allowed and required) act on an answer of
 * `plan-path.sh --start` by running its `run:` command and settling its `settle:` value, and hold no
 * per-answer follow-up rule: the `--entry <key>` re-run sentence and the `switch` follow-up now live
 * in the option lines (C3). Each fragment keeps its `--checkout` exit 5 handling and its `--settled`
 * re-run. The fragments are read as text, so no script runs.
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SKILLS = path.resolve(import.meta.dirname, "../../viber/skills");

const FRAGMENTS = [
  "intent/fragments/branching-start.allowed.md",
  "intent/fragments/branching-start.required.md",
  "fixer/fragments/branching-start.allowed.md",
  "fixer/fragments/branching-start.required.md",
];

/** Phrases every fragment holds, each with what it pins. */
const PRESENT: [string, string][] = [
  ["run its `run:` command", "the run: handling"],
  ["when it is not `-`", "the run: handling skips a `-`"],
  ["settle its `settle:` value", "the settle: handling"],
  ["`abort` stops here and runs nothing else", "abort stopping"],
  ["A `--checkout` failing with exit 5 -> show its error", "the kept --checkout exit 5 handling"],
  ["run the same `--start", "the --settled re-run"],
  ["once more with", "the --settled re-run"],
  ["--settled <settlement>", "the --settled re-run flag"],
];

/** Sentences no fragment keeps: the per-answer follow-up rules the option lines carry now. */
const ABSENT: [RegExp, string][] = [
  [/An answer to `ask-(entry|base)`/, "a per-question answer rule"],
  [/`--entry <key>` added/, "the --entry <key> re-run sentence"],
  [/`switch` ->/, "the switch follow-up sentence"],
  [/`stay` ->/, "the stay follow-up sentence"],
];

for (const rel of FRAGMENTS) {
  const text = fs.readFileSync(path.join(SKILLS, rel), "utf8");
  for (const [phrase, what] of PRESENT) {
    test(`${rel}: holds ${what} ("${phrase}")`, () => {
      assert.ok(text.includes(phrase), `${rel} lacks: ${phrase}`);
    });
  }
  for (const [pattern, what] of ABSENT) {
    test(`${rel}: holds no ${what}`, () => {
      assert.ok(!pattern.test(text), `${rel} still holds ${what}`);
    });
  }
}

/*
 * branching-prose.unit.test.ts - the planner `branching` and `branching-fix` fragments and the four branching-start fragments.
 *
 * The four branching-start fragments (intent and fixer, allowed and required) act on an answer of
 * `plan-path.sh --start` by running its `run:` command and settling its `settle:` value, and hold no
 * per-answer follow-up rule: the `--entry <key>` re-run sentence and the `switch` follow-up now live
 * in the option lines (C3). Each fragment keeps its `--checkout` exit 5 handling. The `--settled`
 * re-run after an issue save sits in fixer's branching-start fragments and in intent's
 * branching-handoff fragments, which its `done` part prints at the end of the interview. The
 * fragments are read as text, so no script runs.
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
];

/** The fragments holding the `--settled` re-run after an issue save. */
const RERUN_FRAGMENTS = [
  "intent/fragments/branching-handoff.allowed.md",
  "intent/fragments/branching-handoff.required.md",
  "fixer/fragments/branching-start.allowed.md",
  "fixer/fragments/branching-start.required.md",
];

const RERUN_PRESENT: [string, string][] = [
  ["run the same `--start", "the --settled re-run"],
  ["once more with", "the --settled re-run"],
  ["--settled <settlement>", "the --settled re-run flag"],
];

/** The intent start fragments, whose re-run text is read only with the `done` part. */
const INTENT_START = FRAGMENTS.filter((rel) => rel.startsWith("intent/"));

/** Sentences no fragment keeps: the per-answer follow-up rules the option lines carry now. */
const ABSENT: [RegExp, string][] = [
  [/An answer to `ask-(entry|base)`/, "a per-question answer rule"],
  [/`--entry <key>` added/, "the --entry <key> re-run sentence"],
  [/`switch` ->/, "the switch follow-up sentence"],
  [/`stay` ->/, "the stay follow-up sentence"],
];

/*
 * The planner `branching` fragments act on the option lines of `plan-path.sh --branch` by running
 * their `run:` command and settling their `settle:` value, and on `next: kept` by leaving the
 * frontmatter keys alone; the `branching-fix` fragments re-run the last `--branch` command and act
 * on `next: kept` too, with no value comparison of their own (C4).
 */
const PLANNER = path.join(SKILLS, "planner/fragments");

const PLANNER_BRANCHING = ["branching.allowed.md", "branching.required.md"];

const PLANNER_BRANCHING_PRESENT: [string, string][] = [
  ["run its `run:` command when it is not `-`", "the run: handling"],
  ["`settle: write` writes the option's work and branch", "the settle: write handling"],
  ["`settle: stop` ends the planner with no review, no hand-off and nothing landed", "the settle: stop handling"],
  ["`next: kept`: leave the keys as they stand and show nothing", "the next: kept handling"],
];

const PLANNER_FIX = ["branching-fix.allowed.md", "branching-fix.required.md"];

const PLANNER_FIX_ABSENT: [string, string][] = [
  ["only when its values differ", "the values comparison rule"],
  ["only when its `option:` lines differ", "the option lines comparison rule"],
];

for (const file of PLANNER_BRANCHING) {
  const text = fs.readFileSync(path.join(PLANNER, file), "utf8");
  for (const [phrase, what] of PLANNER_BRANCHING_PRESENT) {
    test(`planner/fragments/${file}: holds ${what} ("${phrase}")`, () => {
      assert.ok(text.includes(phrase), `${file} lacks: ${phrase}`);
    });
  }
}

for (const file of PLANNER_FIX) {
  const text = fs.readFileSync(path.join(PLANNER, file), "utf8");
  test(`planner/fragments/${file}: acts on next: kept by leaving the recorded keys and showing nothing`, () => {
    assert.ok(text.includes("`next: kept` leaves the recorded `work:` and `branch:` keys and shows nothing"), `${file} lacks the next: kept handling`);
  });
  for (const [phrase, what] of PLANNER_FIX_ABSENT) {
    test(`planner/fragments/${file}: holds no ${what}`, () => {
      assert.ok(!text.includes(phrase), `${file} still holds ${what}`);
    });
  }
}

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

for (const rel of RERUN_FRAGMENTS) {
  const text = fs.readFileSync(path.join(SKILLS, rel), "utf8");
  for (const [phrase, what] of RERUN_PRESENT) {
    test(`${rel}: holds ${what} ("${phrase}")`, () => {
      assert.ok(text.includes(phrase), `${rel} lacks: ${phrase}`);
    });
  }
}

for (const rel of INTENT_START) {
  test(`${rel}: holds no --settled re-run (it is read at the end of the interview, never from its start)`, () => {
    assert.ok(!fs.readFileSync(path.join(SKILLS, rel), "utf8").includes("--settled"), `${rel} still holds the --settled re-run`);
  });
}

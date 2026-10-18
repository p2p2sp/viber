/*
 * rules-close-prose.unit.test.ts - pins the prose that keeps `rules-writer` from
 * rewriting rule files during an ordinary build.
 *
 * Under the spec shape (a build close) `rules-writer` changes an existing line only
 * where the build contradicted it and never compacts, splits or moves over a cap,
 * reporting `OVER:` instead; the compact and split order and the stronger-example
 * replacement belong to the map shape (the `/viber:rules` review). `rule-admission.md`
 * counts a line added to an existing rule toward the two conventions per run, and the
 * implementor's rules fragment closes its `OVER:` repeat with a line naming
 * `/viber:rules`. The files read here are shipped prompts, whose text is the
 * behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/rules-close-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(rel: string): string {
  return fs.readFileSync(path.join(VIBER, rel), "utf8");
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

const WRITER = read("agents/rules-writer.md");
const BUDGET = WRITER.slice(WRITER.indexOf("## Budget"), WRITER.indexOf("## Output"));
const WRITE = WRITER.slice(WRITER.indexOf("## Write"), WRITER.indexOf("## Budget"));
const ADMISSION = read("references/rule-admission.md");
const CALIBRATION = ADMISSION.slice(ADMISSION.indexOf("## Calibration"), ADMISSION.indexOf("## Never a rule"));
const FRAGMENT = lines(read("skills/implementor/fragments/rules.true.md"));

test("the compact and split order of the Budget is scoped to the map shape", () => {
  assert.ok(lines(BUDGET).includes("- Under the map shape, over a cap, in this order:"));
});

test("the Budget states the spec shape never compacts, splits or moves and reports OVER instead", () => {
  assert.ok(
    lines(BUDGET).includes(
      "- Under the spec shape, never compact, split or move: write what passes the gate over the cap and report it on `OVER:`.",
    ),
  );
});

test("a stronger example replaces the weaker one under the map shape only", () => {
  assert.ok(WRITE.includes("Under the map shape, a stronger example replaces the weaker one, never joins it"));
});

test("no unscoped line says a stronger example replaces the weaker one", () => {
  assert.ok(!lines(WRITER).some((line) => line.startsWith("- An existing rule holds one example per convention. A stronger example")));
});

test("the directory at its cap merges or replaces under the map shape only", () => {
  assert.ok(
    lines(BUDGET).some(
      (line) =>
        line.startsWith("- Under the map shape, the directory at its cap takes a new rule only by merging it into an existing one or replacing one;"),
    ),
  );
});

test("the spec shape at its cap writes what passes the gate and reports OVER", () => {
  assert.ok(
    lines(BUDGET).some(
      (line) =>
        line.includes("under the spec shape, it takes what passes the gate and reports it on `OVER:`"),
    ),
  );
});

test("under the spec shape an existing line changes only where the build contradicted it", () => {
  assert.ok(WRITE.includes("under the spec shape, change an existing line only where the build contradicted it"));
});

test("a corrected rule still says what now holds, never what it used to say", () => {
  assert.ok(WRITE.includes("say plainly in it what now holds, never what it used to say"));
});

test("the admission calibration counts a line added to an existing rule toward the two per run", () => {
  assert.ok(
    CALIBRATION.includes(
      "At most two new conventions per run, a new file and a line added to an existing rule each counting as one.",
    ),
  );
});

test("the rules fragment names /viber:rules on the line after its OVER repeat", () => {
  const repeat = FRAGMENT.findIndex((line) => line.startsWith("Repeat verbatim in the final summary every `OVER:` line"));
  assert.ok(FRAGMENT[repeat + 1].includes("`/viber:rules`"));
});

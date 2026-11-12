/*
 * rules-close-prose.unit.test.ts - pins the prose that keeps `rules-writer` from
 * rewriting rule files during an ordinary build.
 *
 * Under the spec shape (a build close) `rules-writer` adds no convention, changes an
 * existing line only where the build contradicted it and never compacts, splits or
 * moves over a cap, reporting a corrected file left over a cap on `OVER:`; the
 * admission gate, the compact and split order and the stronger-example
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
import { section } from "../harness/markdown.ts";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(rel: string): string {
  return fs.readFileSync(path.join(VIBER, rel), "utf8");
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

const WRITER = read("agents/rules-writer.md");
const BUDGET = section(WRITER, "Budget");
const WRITE = section(WRITER, "Write");
const ADMISSION = read("references/rule-admission.md");
const CALIBRATION = section(ADMISSION, "Calibration");
const FRAGMENT = lines(read("skills/implementor/fragments/rules.true.md"));

test("the compact and split order of the Budget is scoped to the map shape", () => {
  assert.ok(lines(BUDGET).includes("- Under the map shape, over a cap, in this order:"));
});

test("the Budget states the spec shape never compacts, splits or moves and reports a corrected file over a cap on OVER", () => {
  assert.ok(
    lines(BUDGET).includes(
      "- Under the spec shape, never compact, split or move: report a corrected file left over a cap on `OVER:`.",
    ),
  );
});

test("no line of the writer says the spec shape writes what passes the gate", () => {
  assert.ok(!lines(WRITER).some((line) => line.includes("under the spec shape, it takes what passes the gate")));
  assert.ok(!lines(WRITER).some((line) => line.includes("write what passes the gate over the cap")));
});

test("the Write section states the spec shape adds no convention, neither a new file nor a line in an existing rule", () => {
  assert.ok(
    lines(WRITE).includes(
      "- Under the spec shape, add no convention, neither a new file nor a line in an existing rule: only correct or remove.",
    ),
  );
});

test("the admission gate and its example apply to a convention added under the map shape only", () => {
  assert.ok(
    lines(WRITE).some((line) =>
      line.startsWith("- Under the map shape, every convention you add, as a new file or as a line in an existing one, passes the admission gate first"),
    ),
  );
});

test("the Input requires reading rule-admission.md under the map shape only", () => {
  assert.ok(
    lines(WRITER).includes(
      "Under the map shape, read `<refs>/rule-admission.md` before you add anything to a rule: it owns the three criteria a candidate convention has to pass and the list of what never becomes a rule. The spec shape reads no admission file.",
    ),
  );
});

test("the description names correcting rules and keeps its invoked-only ending", () => {
  assert.ok(
    lines(WRITER).includes(
      "description: Corrects or removes the rules a finished build contradicted, and folds the conventions a rules review found into .claude/rules/. Invoked only by the implementor skill and the rules skill, never directly.",
    ),
  );
});

test("the NONE verdict names correcting rules", () => {
  assert.ok(lines(WRITER).includes("- or `VERDICT: NONE` when no rule needed correcting or removing."));
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
        line === "- Under the map shape, the directory at its cap takes a new rule only by merging it into an existing one or replacing one.",
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

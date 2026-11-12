/*
 * rules-trail-prose.unit.test.ts - pins the prose that lets the rule admission gate accept a
 * convention from the failure trail of past runs.
 *
 * `rule-admission.md` criterion 1 has a second way to pass: the same gap in the `failures.md`
 * of at least two different runs, each entry holding against the code as it stands, the
 * candidate carrying a place where the code does it right as its example. `## Calibration`
 * keeps its two-per-run sentence and counts a trail candidate toward it, kept ahead of a
 * candidate proposed from the code. `## The silent drop` names a rejected trail entry as a
 * second exception, reported on a `REJECTED:` line. The file read here is a shipped prompt,
 * whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/rules-trail-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

const ADMISSION = fs.readFileSync(path.join(VIBER, "references/rule-admission.md"), "utf8");

function section(heading: string): string[] {
  const start = ADMISSION.indexOf(`\n## ${heading}\n`);
  const rest = ADMISSION.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  return lines(next === -1 ? rest : rest.slice(0, next));
}

const CRITERION_1 = section("The three criteria").filter((line) => line.startsWith("1. "));
const CALIBRATION = section("Calibration");
const SILENT_DROP = section("The silent drop");

test("criterion 1 stays one paragraph of the criteria list", () => {
  assert.equal(CRITERION_1.length, 1);
});

test("criterion 1 names the same gap in the failures.md of at least two different runs as its second way to pass", () => {
  assert.ok(
    CRITERION_1[0].includes("the same gap stands in the `failures.md` of at least two different runs"),
  );
});

test("criterion 1 requires each trail entry to hold against the code as it stands", () => {
  assert.ok(CRITERION_1[0].includes("each entry holding against the code as it stands"));
});

test("criterion 1 requires a trail candidate to carry a place where the code does it right as its example", () => {
  assert.ok(CRITERION_1[0].includes("a place where the code does it right as its example"));
});

test("criterion 1 keeps its three-files way to pass", () => {
  assert.ok(CRITERION_1[0].startsWith("1. The pattern recurs in at least three different files"));
});

test("the calibration keeps its two-per-run sentence verbatim", () => {
  assert.ok(
    CALIBRATION.some((line) =>
      line.startsWith(
        "At most two new conventions per run, a new file and a line added to an existing rule each counting as one.",
      ),
    ),
  );
});

test("the calibration counts a trail candidate toward the two per run", () => {
  assert.ok(CALIBRATION.some((line) => line.includes("A trail candidate counts toward the two")));
});

test("the calibration keeps a trail candidate ahead of a candidate proposed from the code, the gaps in the most runs first", () => {
  assert.ok(
    CALIBRATION.some((line) =>
      line.includes(
        "kept ahead of a candidate proposed from the code, the gaps standing in the most runs first",
      ),
    ),
  );
});

test("the silent drop keeps its exception for an existing line failing the gate", () => {
  assert.ok(SILENT_DROP.some((line) => line.startsWith("An existing line failing the gate is the exception: it is reported")));
});

test("the silent drop names a rejected trail entry as a second exception in the paragraph of the first", () => {
  assert.ok(
    SILENT_DROP.some(
      (line) =>
        line.startsWith("An existing line failing the gate is the exception") &&
        line.includes("An entry of a trail gap the gate rejects is a second exception"),
    ),
  );
});

test("the silent drop reports a rejected trail entry on a REJECTED line so the writer removes it from its failures.md", () => {
  assert.ok(
    SILENT_DROP.some((line) =>
      line.includes("reported on a `REJECTED:` line so the writer removes it from its `failures.md`"),
    ),
  );
});

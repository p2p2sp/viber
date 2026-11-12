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
 * `rules-auditor.md` carries the third direction that reads the trail: only the `convention`
 * entries of the archived `failures.md` files, a `MISS:` line for a gap in at least two runs
 * (two lines at most), an `IGNORED:` line for an entry an existing rule already covers, a
 * `REJECTED:` line for an entry the gate refuses, and a `USED:` line below each finding.
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

const AUDITOR = fs.readFileSync(path.join(VIBER, "agents/rules-auditor.md"), "utf8");

function auditorSection(heading: string): string[] {
  const start = AUDITOR.indexOf(`\n## ${heading}\n`);
  const rest = AUDITOR.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  return lines(next === -1 ? rest : rest.slice(0, next));
}

const DESCRIPTION = lines(AUDITOR).find((line) => line.startsWith("description: ")) ?? "";
const AUDITOR_INPUT = auditorSection("Input");
const TRAIL = auditorSection("Trail - target reads trail");
const FINDINGS = auditorSection("Findings file");
const AUDITOR_OUTPUT = auditorSection("Output");

function trailBullet(start: string): string {
  return TRAIL.find((line) => line.startsWith(`- ${start}`)) ?? "";
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

test("the auditor description names the trail as its third direction, grouping entries into candidates, corrections and rejections", () => {
  assert.ok(
    DESCRIPTION.includes(
      "groups the `convention` entries of archived failure trails into rule candidates, rule corrections and rejected entries",
    ),
  );
});

test("the auditor description keeps its Invoked-only ending", () => {
  assert.ok(DESCRIPTION.endsWith("Invoked only by the rules skill, never directly."));
});

test("the input block carries the trail dispatch with target trail", () => {
  assert.ok(AUDITOR_INPUT.some((line) => line.startsWith("target: ") && line.includes("| trail")));
});

test("the input block names scope as every trail: path of the map, comma-separated", () => {
  assert.ok(
    AUDITOR_INPUT.some((line) => line.startsWith("scope: ") && line.includes("<every trail: path of the map, comma-separated>")),
  );
});

test("the input prose lets target read the literal trail", () => {
  assert.ok(AUDITOR_INPUT.some((line) => line.includes("reads the literal `none` or `trail`, never anything else")));
});

test("the trail direction reads only the convention entries of the scope files", () => {
  assert.ok(
    trailBullet("Read only the `convention` entries of the `scope` files").includes(
      "skip every other cause unread",
    ),
  );
});

test("the trail direction names the run key as the directory holding the failures.md", () => {
  assert.ok(trailBullet("Read only the `convention` entries").includes("the name of the directory holding its `failures.md`"));
});

test("a MISS line stands only for a gap in at least two different runs", () => {
  assert.ok(trailBullet("Group the remaining entries by gap").includes("A gap standing in at least two different runs"));
});

test("a MISS line needs each entry checked against the code as it stands", () => {
  assert.ok(trailBullet("Group the remaining entries by gap").includes("each entry holding against the code as it stands"));
});

test("a MISS line needs the candidate to pass criteria 2 and 3 of the gate", () => {
  assert.ok(trailBullet("Group the remaining entries by gap").includes("the candidate passing criteria 2 and 3 of the gate"));
});

test("a MISS line names the runs it stands in", () => {
  assert.ok(trailBullet("Group the remaining entries by gap").includes("naming those runs after `| runs `"));
});

test("at most two MISS lines are written, the gaps in the most runs first", () => {
  assert.ok(
    trailBullet("At most two `MISS:` lines").includes("the gaps standing in the most runs first"),
  );
});

test("an entry of a gap left past the two MISS lines gets no line", () => {
  assert.ok(trailBullet("At most two `MISS:` lines").includes("The entries of a gap left past the two get no line"));
});

test("an entry in a file an existing rule's paths cover, for the convention that rule states, yields an IGNORED line, never a MISS", () => {
  assert.ok(
    trailBullet("An entry in a file an existing rule's `paths:` cover").includes(
      "for the convention that rule states, yields an `IGNORED:` line, never a `MISS:`",
    ),
  );
});

test("the IGNORED line carries the correction, the reworded line or the narrower paths globs", () => {
  assert.ok(
    trailBullet("An entry in a file an existing rule's `paths:` cover").includes(
      "the reworded line or the narrower `paths:` globs",
    ),
  );
});

test("a frozen underscore rule is never read nor named on a line", () => {
  assert.ok(
    trailBullet("An entry in a file an existing rule's `paths:` cover").includes(
      "A frozen `_` rule is never read and never named on a line",
    ),
  );
});

test("a USED line stands directly below each MISS or IGNORED line, one per entry it rests on", () => {
  assert.ok(
    trailBullet("Directly below each `MISS:` or `IGNORED:` line").includes("one `USED:` line per entry it rests on"),
  );
});

test("a REJECTED line is written per entry naming no convention, whose code is gone, or whose gap fails criterion 2 or 3, however many runs it stands in", () => {
  assert.ok(
    trailBullet("Write one `REJECTED:` line per entry").includes(
      "that names no convention, whose code is gone, or whose gap fails criterion 2 or 3 of the gate, however many runs it stands in",
    ),
  );
});

test("an entry standing in one run that verification upheld gets no line", () => {
  assert.ok(
    trailBullet("An entry standing in one run").includes("that verification upheld gets no line"),
  );
});

test("the findings file of the trail is named _trail-audit.md under out", () => {
  assert.ok(FINDINGS.some((line) => line.includes("`<out>_trail-audit.md`")));
});

test("the findings vocabulary lists the four trail lines", () => {
  const trailLines = ["MISS: <a convention worth a rule", "USED: <failures.md path> | <the entry line, verbatim>", "IGNORED: <rule path> |", "REJECTED: <failures.md path> |"];
  assert.deepEqual(
    trailLines.filter((start) => FINDINGS.some((line) => line.startsWith(start))),
    trailLines,
  );
});

test("the trail return is the single AUDIT: trail line", () => {
  assert.ok(
    AUDITOR_OUTPUT.some((line) =>
      line.startsWith("AUDIT: trail miss <n> ignored <n> rejected <n> -> <path of the findings file> | none"),
    ),
  );
});

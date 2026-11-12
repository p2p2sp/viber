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
 * `rules-writer.md` folds those findings under the map shape: a `MISS:` as a rule counted
 * toward the two per run, an `IGNORED:` as a correction of the rule it names, and the
 * `failures.md` entry of each applied `USED:` and each `REJECTED:` line removed, an emptied
 * file deleted with `rm`.
 *
 * `rules/SKILL.md` reports the `waiting:` and `trail:` lines with their `convention` and `other`
 * counts, offers the trail as one target on `extend`, `both` and `state: none`, dispatches the
 * auditor for it only over the trails with a convention count above 0, folds its counters into
 * the writer gate (a kept trail with an other count above 0 reaches the writer regardless),
 * passes its `trail:` lines in the writer's `map:` and reports the `failures.md` files the writer
 * changed. The writer removes every non-convention entry of each `trail:` file of its map.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/rules-trail-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { section } from "../harness/markdown.ts";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

const ADMISSION = fs.readFileSync(path.join(VIBER, "references/rule-admission.md"), "utf8");
const AUDITOR = fs.readFileSync(path.join(VIBER, "agents/rules-auditor.md"), "utf8");

const DESCRIPTION = lines(AUDITOR).find((line) => line.startsWith("description: ")) ?? "";
const AUDITOR_INPUT = lines(section(AUDITOR, "Input"));
const TRAIL = lines(section(AUDITOR, "Trail - target reads trail"));
const FINDINGS = lines(section(AUDITOR, "Findings file"));
const AUDITOR_OUTPUT = lines(section(AUDITOR, "Output"));

function trailBullet(start: string): string {
  return TRAIL.find((line) => line.startsWith(`- ${start}`)) ?? "";
}

const CRITERION_1 = lines(section(ADMISSION, "The three criteria")).filter((line) => line.startsWith("1. "));
const CALIBRATION = lines(section(ADMISSION, "Calibration"));
const SILENT_DROP = lines(section(ADMISSION, "The silent drop"));

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

test("the input block names scope as the trail: paths of the map with a convention count above 0, comma-separated", () => {
  assert.ok(
    AUDITOR_INPUT.some(
      (line) =>
        line.startsWith("scope: ") &&
        line.includes("<the trail: paths of the map with a convention count above 0, comma-separated>"),
    ),
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

const WRITER = fs.readFileSync(path.join(VIBER, "agents/rules-writer.md"), "utf8");

const WRITE = lines(section(WRITER, "Write"));
const BUDGET = lines(section(WRITER, "Budget"));
const WRITER_OUTPUT = lines(section(WRITER, "Output"));

function writeBullet(start: string): string {
  return WRITE.find((line) => line.startsWith(`- ${start}`)) ?? "";
}

test("the writer writes a trail MISS line as a rule like any other MISS", () => {
  assert.ok(
    writeBullet("Under the map shape, a `MISS:` line of `_trail-audit.md`").includes(
      "is written as a rule like any other `MISS:`",
    ),
  );
});

test("a trail MISS line counts toward the two per run", () => {
  assert.ok(
    writeBullet("Under the map shape, a `MISS:` line of `_trail-audit.md`").includes("counts toward the two per run"),
  );
});

test("a trail MISS line is kept ahead of a MISS proposed from the code", () => {
  assert.ok(
    writeBullet("Under the map shape, a `MISS:` line of `_trail-audit.md`").includes(
      "kept ahead of a `MISS:` proposed from the code",
    ),
  );
});

test("a trail IGNORED line corrects the rule it names as the line says", () => {
  assert.ok(
    writeBullet("Under the map shape, an `IGNORED:` line of `_trail-audit.md`").includes(
      "corrects the rule it names as the line says",
    ),
  );
});

test("the rule an IGNORED line names is changeable though no rule line of the map names it", () => {
  assert.ok(
    writeBullet("Under the map shape, an `IGNORED:` line of `_trail-audit.md`").includes(
      "that rule changeable though no `rule:` line of the map names it",
    ),
  );
});

test("an IGNORED line never adds a file", () => {
  assert.ok(
    writeBullet("Under the map shape, an `IGNORED:` line of `_trail-audit.md`").includes("never adds a file"),
  );
});

test("the map shape changes only a rule a rule line of the map or an IGNORED line names", () => {
  assert.ok(
    writeBullet("Under the map shape, change, move or remove only an existing rule").includes(
      "a `rule:` line of the map or an `IGNORED:` line of `_trail-audit.md` names",
    ),
  );
});

test("a USED line below an applied MISS or IGNORED line and a REJECTED line each remove that one entry line from the failures.md they name", () => {
  assert.ok(
    writeBullet("Under the map shape, each `USED:` line of `_trail-audit.md`").includes(
      "below a `MISS:` or `IGNORED:` line you applied, and each `REJECTED:` line, removes that one entry line from the `failures.md` it names",
    ),
  );
});

test("removing an entry line changes nothing else in its failures.md", () => {
  assert.ok(
    writeBullet("Under the map shape, each `USED:` line of `_trail-audit.md`").includes(
      "nothing else in that file changing",
    ),
  );
});

test("a USED line below a finding the writer did not apply removes nothing", () => {
  assert.ok(
    writeBullet("Under the map shape, each `USED:` line of `_trail-audit.md`").includes(
      "a `USED:` line below a finding you did not apply removes nothing",
    ),
  );
});

test("a failures.md left with no entry line is deleted with rm", () => {
  assert.ok(
    WRITE.some((line) =>
      line.startsWith("- A `failures.md` left with no entry line (a line starting `- `) is deleted with `rm -- <path>`"),
    ),
  );
});

test("the writer removes every entry line not starting with convention from each failures.md a trail line of its map names", () => {
  assert.ok(
    writeBullet("Under the map shape, remove every entry line not starting `- convention | `").includes(
      "from each `failures.md` a `trail:` line of the map names",
    ),
  );
});

test("a convention entry stays unless an applied USED line or a REJECTED line removes it", () => {
  assert.ok(
    writeBullet("Under the map shape, remove every entry line not starting `- convention | `").includes(
      "A `- convention | ` entry stays unless a `USED:` line you applied or a `REJECTED:` line removes it",
    ),
  );
});

test("the write scope names the failures.md paths of the trail lines of the map", () => {
  assert.ok(
    WRITE.some(
      (line) =>
        line.startsWith("Your whole scope is `.claude/rules/**/*.md`") &&
        line.includes("the `failures.md` paths named by the `trail:` lines of its map"),
    ),
  );
});

test("the FILES line names every failures.md changed or deleted", () => {
  assert.ok(WRITER_OUTPUT.some((line) => line.includes("every `failures.md` changed or deleted")));
});

test("the write scope names the failures.md paths of USED and REJECTED lines under the map shape", () => {
  assert.ok(
    WRITE.some(
      (line) =>
        line.startsWith("Your whole scope is `.claude/rules/**/*.md`") &&
        line.includes("the `failures.md` paths of `USED:` and `REJECTED:` lines under the map shape"),
    ),
  );
});

test("the Bash sentence of the Budget allows rm on an emptied failures.md", () => {
  assert.ok(BUDGET.some((line) => line.includes("`rm -- <one path>`") && line.includes("an emptied `failures.md`")));
});

const SKILL = fs.readFileSync(path.join(VIBER, "skills/rules/SKILL.md"), "utf8");

const SKILL_DESCRIPTION = lines(SKILL).find((line) => line.startsWith("description: ")) ?? "";
const REPORT = lines(section(SKILL, "1. Report the layer"));
const ROUTE = lines(section(SKILL, "2. Route on the state, then the mode"));
const APPROVE = lines(section(SKILL, "4. Approve the targets"));
const AUDIT = lines(section(SKILL, "5. Audit"));
const CONFIRM = lines(section(SKILL, "6. Confirm, then the writer"));
const FINAL_REPORT = lines(section(SKILL, "7. Report"));

function skillLine(block: string[], start: string): string {
  return block.find((line) => line.startsWith(start)) ?? "";
}

test("the skill description names learning from the failure trail", () => {
  assert.ok(SKILL_DESCRIPTION.includes("learns rules from the failure trail of archived runs"));
});

test("step 1 reports the waiting line, the waiting trail entries per cause", () => {
  assert.ok(
    skillLine(REPORT, "- the `waiting:` line").includes("the number of waiting trail entries per cause"),
  );
});

test("step 1 reports each trail line with its convention and other counts", () => {
  assert.ok(skillLine(REPORT, "- each `trail:` line").includes("its `convention` and `other` counts"));
});

test("step 1 names convention entries as the only ones the auditor reads and the other entries as the writer's to remove", () => {
  assert.ok(
    skillLine(REPORT, "- each `trail:` line").includes(
      "The `convention` entries are the only ones the auditor reads; the writer removes every other entry",
    ),
  );
});

test("step 2 adds the trail as one target on extend, on both and on state none when a trail line exists", () => {
  assert.ok(
    ROUTE.some((line) =>
      line.includes(
        "On `extend`, on `both` and on `state: none`, a map with at least one `trail:` line adds one more target to the list: the trail",
      ),
    ),
  );
});

test("step 2 never adds the trail on review or reset", () => {
  assert.ok(ROUTE.some((line) => line.includes("`review` and `reset` never carry it")));
});

test("step 4 shows the trail target as one line carrying the waiting line and its trail paths", () => {
  assert.ok(
    APPROVE.some((line) =>
      line.includes("The trail target is one line: the `waiting:` line and every `trail:` path"),
    ),
  );
});

test("step 5 dispatches one rules-auditor for a kept trail target with target trail", () => {
  assert.ok(
    AUDIT.some(
      (line) =>
        line.includes("A kept trail target gets one `viber:rules-auditor` call") &&
        line.includes("`target: trail`"),
    ),
  );
});

test("step 5 dispatches the trail auditor only when a kept trail line has a convention count above 0", () => {
  assert.ok(
    AUDIT.some((line) =>
      line.includes(
        "A kept trail target gets one `viber:rules-auditor` call only when a kept `trail:` line has a `convention` count above 0",
      ),
    ),
  );
});

test("step 5 passes those trail paths, comma-separated, as the trail scope", () => {
  assert.ok(AUDIT.some((line) => line.includes("`scope` being those `trail:` paths, comma-separated")));
});

test("step 5 passes matches none for the trail target", () => {
  assert.ok(AUDIT.some((line) => line.includes("`matches: none`") && line.includes("trail")));
});

test("step 5 lists the AUDIT trail return line", () => {
  assert.ok(
    AUDIT.some((line) =>
      line.startsWith("AUDIT: trail miss <n> ignored <n> rejected <n> -> <findings file> | none"),
    ),
  );
});

test("step 5 reports the trail AUDIT line verbatim", () => {
  assert.ok(AUDIT.some((line) => line.includes("Report the `AUDIT:` line for each target verbatim")));
});

test("step 6 reads a trail line with three zero counters as five zero counters", () => {
  assert.ok(
    CONFIRM.some((line) =>
      line.includes("a trail line carrying its three zero counters (`miss`, `ignored`, `rejected`)"),
    ),
  );
});

test("step 6 dispatches the writer for a kept trail line with an other count above 0 even with every audit counter at 0", () => {
  assert.ok(
    CONFIRM.some((line) =>
      line.includes(
        "A kept `trail:` line with an `other` count above 0 reaches the writer even with every audit counter at 0",
      ),
    ),
  );
});

test("step 6 stops without a writer on zero counters only when no kept trail line has an other count above 0", () => {
  assert.ok(
    CONFIRM.some((line) =>
      line.includes("With no kept `trail:` line carrying an `other` count above 0, say so in one line, dispatch no writer, and stop"),
    ),
  );
});

test("step 6 passes every trail line of a kept trail target in the writer's map", () => {
  assert.ok(
    skillLine(CONFIRM, "map: ").includes("every trail: line of a kept trail target"),
  );
});

test("step 7 names the failures.md files the writer changed or deleted on the FILES bullet", () => {
  assert.ok(
    skillLine(FINAL_REPORT, "- `FILES:`").includes("every `failures.md` it changed or deleted"),
  );
});

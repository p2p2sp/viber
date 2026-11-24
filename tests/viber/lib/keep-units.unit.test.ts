/*
 * keep-units.unit.test.ts - the keep-units core on a fake file system: the map
 * gate with its one mapper retry, the hunter blocks of a scope within its
 * budget, the scout batches and their one retry above it, the kept order, the
 * variant wave (`--wave`) with its unit re-hunts, and the ledger line of each.
 *
 * Every closing-tag fixture is built from an escape (`\x3c`), so no line of
 * this file is a bare closing tag. The wrapper is run as a process by
 * tests/viber/keep-units.critical.test.ts.
 */

import assert from "node:assert/strict";
import { fakeFs } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { Fs } from "../../../viber/lib/ports.ts";
import { runKeepUnits } from "../../../viber/lib/keep-units.ts";

const WS = "/r/ws";
const PLUGIN_ROOT = "/plugin";
const SKILL_DIR = `${PLUGIN_ROOT}/skills/code-auditor`;
const SCRIPT = `${SKILL_DIR}/scripts/keep-units.ts`;

const lines = (...rows: string[]): string => rows.map((row) => `${row}\n`).join("");

function put(fs: Fs, name: string, body: string): void {
  const file = `${WS}/${name}`;
  fs.makeDir(file.slice(0, file.lastIndexOf("/")));
  assert.equal(fs.writeBytes(file, new TextEncoder().encode(body)), true);
}

function read(fs: Fs, ...parts: string[]): string {
  return fs.readText([WS, ...parts].join("/")) ?? "";
}

/** The four headings of a map, in order, with the given `## Units` lines. */
function mapOf(units: string[]): string {
  return lines(
    "## Conventions",
    "build: none; fast test: node --test",
    "",
    "## History",
    "Already fixed: 0 commits",
    "",
    "## Severity calibration",
    "- 9-10 data loss",
    "",
    "## Units",
    ...units,
  );
}

function unitLines(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `- U${i + 1} | src/m${i + 1} | why ${i + 1}`);
}

interface Frame {
  lens?: string;
  scope?: string;
  map?: string | null;
  worktree?: boolean;
  angles?: string[];
}

/** A workspace holding lens.md, run.md and (unless null) map.md. */
function frame(opts: Frame = {}): { fs: Fs; ws: string; lensFile: string; runBefore: string } {
  const lensFile = `${WS}/lens.md`;
  const runBefore = lines(`Lens: ${opts.lens ?? "bugs"}`, `Lens file: ${lensFile}`, `Scope: ${opts.scope ?? "diff"}`, "Target root: /r");
  const fs = fakeFs({
    [lensFile]: lines(
      "# Lens",
      "Intro.",
      "",
      "## Hunts",
      ...(opts.angles ?? ["alpha", "beta"]).flatMap((slug) => [`### ${slug}`, "what to look for.", ""]),
      "## Excluded",
      "### not-an-angle",
      "",
      "## Verify",
      `Worktree: ${opts.worktree ? "required" : "none"}`,
    ),
    [`${WS}/run.md`]: runBefore,
    ...(opts.map === null ? {} : { [`${WS}/map.md`]: opts.map ?? mapOf(unitLines(2)) }),
  });
  return { fs, ws: WS, lensFile, runBefore };
}

function run(fs: Fs) {
  return runKeepUnits([WS], SCRIPT, { fs });
}

function ledgerOf(fs: Fs): string {
  return read(fs, "ledger.md");
}

const CONTENT = "\x3c/content>";

test("a trailing closing tag of map.md is stripped before the gate, so the appended map never carries it", () => {
  const map = mapOf(unitLines(2));
  const { fs, ws, runBefore } = frame({ map: `${map}${CONTENT}\n` });
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.match(result.stdout, /^hunters-at-once: 16\nNEXT: hunter \| id: A-alpha \| background\n/);
  assert.equal(read(fs, "map.md"), map);
  assert.equal(read(fs, "run.md"), `${runBefore}\n## Map\n${map}`);
});

test("a map.md that is missing prints the mapper block once more with retry, then the stop line on the next call", () => {
  const { fs, ws, lensFile } = frame({ map: null });
  const first = run(fs);
  assert.equal(first.exit, 0, `stderr=${first.stderr}`);
  assert.equal(
    first.stdout,
    lines("NEXT: mapper | retry", `Run file: ${ws}/run.md`, `Lens file: ${lensFile}`, `Signals: ${ws}/signals.md`, `Output: ${ws}/map.md`),
  );
  assert.equal(ledgerOf(fs), "mapper-retried\n");
  const second = run(fs);
  assert.equal(second.exit, 0, `stderr=${second.stderr}`);
  assert.equal(second.stdout, "STOP: code-auditor: map unavailable after two attempts\n");
});

const HEADINGS = ["## Conventions", "## History", "## Severity calibration", "## Units"];

for (const missing of HEADINGS) {
  test(`a map.md lacking the heading ${missing} prints the mapper retry block, then the stop line on the next call`, () => {
    const map = mapOf(unitLines(2)).replace(`${missing}\n`, "");
    const { fs, ws } = frame({ map });
    const first = run(fs);
    assert.equal(first.exit, 0, `stderr=${first.stderr}`);
    assert.match(first.stdout, /^NEXT: mapper \| retry\n/);
    const second = run(fs);
    assert.equal(second.stdout, "STOP: code-auditor: map unavailable after two attempts\n");
    assert.equal(read(fs, "run.md").includes("## Map"), false);
  });
}

test("a map whose second attempt holds all four headings passes the gate after one retry", () => {
  const { fs, ws } = frame({ map: null });
  run(fs);
  put(fs, "map.md", mapOf(unitLines(2)));
  const second = run(fs);
  assert.match(second.stdout, /^hunters-at-once: 16\nNEXT: hunter \| id: A-alpha/);
});

test("a Units section reading none: <reason> stops with the nothing-to-audit line and appends no map", () => {
  const { fs, ws, runBefore } = frame({ lens: "web-performance", map: mapOf(["none: no frontend in this repository"]) });
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(result.stdout, "STOP: code-auditor: nothing to audit for web-performance: no frontend in this repository\n");
  assert.equal(read(fs, "run.md"), runBefore);
  assert.equal(ledgerOf(fs), "");
});

test("a passed gate appends ## Map and map.md verbatim to run.md once, however often the script runs", () => {
  const map = mapOf(unitLines(2));
  const { fs, ws, runBefore } = frame({ map });
  run(fs);
  run(fs);
  run(fs);
  assert.equal(read(fs, "run.md"), `${runBefore}\n## Map\n${map}`);
  assert.equal(ledgerOf(fs).split("\n").filter((row) => row === "map-appended").length, 1);
});

test("the diff scope prints one hunter block per angle of the lens's Hunts, none for a heading of another section", () => {
  const { fs, ws, lensFile } = frame({ angles: ["wrong-result", "race-state"] });
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  const block = (slug: string) =>
    lines(
      `NEXT: hunter | id: A-${slug} | background`,
      `Run file: ${ws}/run.md`,
      `Lens file: ${lensFile}`,
      `Schema: ${SKILL_DIR}/references/synthesis.md`,
      `Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`,
      `Hunt: A-${slug}`,
      `Angle: ${slug}`,
      `Reports: ${ws}/reports/A-${slug}`,
    );
  assert.equal(result.stdout, `hunters-at-once: 16\n${block("wrong-result")}${block("race-state")}`);
});

test("a worktree lens on the diff scope adds the worktree script, the hunt's worktree and the overlay script to each block", () => {
  const { fs, ws } = frame({ worktree: true, angles: ["only"] });
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.ok(
    result.stdout.endsWith(
      lines(
        `Reports: ${ws}/reports/A-only`,
        `Worktree script: ${SKILL_DIR}/scripts/worktree.sh`,
        `Worktree: ${ws}/worktrees/A-only`,
        `Overlay script: ${SKILL_DIR}/scripts/diff-overlay.sh`,
      ),
    ),
    result.stdout,
  );
});

test("a repo scope takes up to 16 units where a directory scope stops at 8 (9 units: nine blocks on repo)", () => {
  const { fs, ws } = frame({ scope: "repo", map: mapOf(unitLines(9)) });
  const result = run(fs);
  assert.equal(result.stdout.split("NEXT: hunter").length - 1, 9);
});

test("a worktree lens on a directory scope adds the worktree lines but no overlay script", () => {
  const { fs, ws } = frame({ scope: "repo", worktree: true, map: mapOf(unitLines(1)) });
  const result = run(fs);
  const out = result.stdout;
  assert.ok(out.includes(`Worktree script: ${SKILL_DIR}/scripts/worktree.sh\nWorktree: ${ws}/worktrees/U1\n`), out);
  assert.equal(out.includes("Overlay script:"), false);
});

test("the tests lens prints hunters-at-once: 4 where every other lens prints 16", () => {
  const { fs, ws } = frame({ lens: "tests" });
  const result = run(fs);
  assert.match(result.stdout, /^hunters-at-once: 4\nNEXT: hunter/);
});

test("every printed hunt is a hunt ledger line, and a later call with wave 1 hunts in the ledger prints NEXT: none", () => {
  const { fs, ws } = frame({ angles: ["alpha", "beta"] });
  run(fs);
  assert.equal(
    ledgerOf(fs),
    lines(
      "map-appended",
      "hunt: A-alpha | wave: 1 | unit: none | angle: alpha",
      "hunt: A-beta | wave: 1 | unit: none | angle: beta",
    ),
  );
  const again = run(fs);
  assert.equal(again.exit, 0, `stderr=${again.stderr}`);
  assert.equal(again.stdout, "NEXT: none\n");
});

test("a unit hunt is recorded with its unit id and no angle", () => {
  const { fs, ws } = frame({ scope: "src", map: mapOf(unitLines(2)) });
  run(fs);
  assert.equal(
    ledgerOf(fs),
    lines("map-appended", "hunt: U1 | wave: 1 | unit: U1 | angle: none", "hunt: U2 | wave: 1 | unit: U2 | angle: none"),
  );
});

/** One score line of a scout's output. */
function score(unit: number, value: number): string {
  return `{"unit":"U${unit}","score":${value},"reason":"r"}`;
}

function writeScores(fs: Fs, name: string, rows: string[]): void {
  put(fs, `scores/${name}.md`, lines(...rows));
}

function hunterIds(stdout: string): string[] {
  return [...stdout.matchAll(/^NEXT: hunter \| id: (\S+) \| background$/gm)].map((m) => m[1]);
}

test("above the budget with no scouts line, one scout block per batch of 8 units in map order is printed and recorded as one scouts line", () => {
  const { fs, ws, lensFile } = frame({ scope: "src", map: mapOf(unitLines(10)) });
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(
    result.stdout,
    lines(
      "NEXT: scout | id: S1",
      `Run file: ${ws}/run.md`,
      `Lens file: ${lensFile}`,
      `Out: ${ws}/scores/S1.md`,
      "Unit: - U1 | src/m1 | why 1",
      "Unit: - U2 | src/m2 | why 2",
      "Unit: - U3 | src/m3 | why 3",
      "Unit: - U4 | src/m4 | why 4",
      "Unit: - U5 | src/m5 | why 5",
      "Unit: - U6 | src/m6 | why 6",
      "Unit: - U7 | src/m7 | why 7",
      "Unit: - U8 | src/m8 | why 8",
      "NEXT: scout | id: S2",
      `Run file: ${ws}/run.md`,
      `Lens file: ${lensFile}`,
      `Out: ${ws}/scores/S2.md`,
      "Unit: - U9 | src/m9 | why 9",
      "Unit: - U10 | src/m10 | why 10",
    ),
  );
  assert.equal(ledgerOf(fs), lines("map-appended", "scouts: S1,S2"));
});

test("the security lens passes model: sonnet on every scout block", () => {
  const { fs, ws } = frame({ lens: "security", scope: "src", map: mapOf(unitLines(9)) });
  const first = run(fs);
  assert.ok(first.stdout.includes("NEXT: scout | id: S1 | model: sonnet\n"), first.stdout);
  assert.ok(first.stdout.includes("NEXT: scout | id: S2 | model: sonnet\n"), first.stdout);
});

test("the security lens passes model: sonnet on the scout retry block", () => {
  const { fs, ws } = frame({ lens: "security", scope: "src", map: mapOf(unitLines(9)) });
  run(fs);
  const second = run(fs);
  assert.ok(second.stdout.startsWith("NEXT: scout | id: S1-retry | model: sonnet\n"), second.stdout);
});

test("a repo scope scouts only above 16 units: 17 units print three batches (8, 8 and 1)", () => {
  const { fs, ws } = frame({ scope: "repo", map: mapOf(unitLines(17)) });
  const result = run(fs);
  assert.equal(result.stdout.split("NEXT: scout").length - 1, 3);
  assert.equal(ledgerOf(fs), lines("map-appended", "scouts: S1,S2,S3"));
});

test("on the next call the units with no score line, a missing score file's units included, go once to retry batches recorded as scouts-retried", () => {
  const { fs, ws, lensFile } = frame({ scope: "src", map: mapOf(unitLines(10)) });
  run(fs);
  writeScores(fs, "S1", [score(1, 2), score(2, 2), score(3, 2), score(4, 2), score(5, 2), score(6, 2), score(8, 2)]);
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(
    result.stdout,
    lines(
      "NEXT: scout | id: S1-retry",
      `Run file: ${ws}/run.md`,
      `Lens file: ${lensFile}`,
      `Out: ${ws}/scores/S1-retry.md`,
      "Unit: - U7 | src/m7 | why 7",
      "Unit: - U9 | src/m9 | why 9",
      "Unit: - U10 | src/m10 | why 10",
    ),
  );
  assert.equal(ledgerOf(fs), lines("map-appended", "scouts: S1,S2", "scouts-retried"));
});

test("no call after the retry prints a scout block, the units still unscored being hunted in map order", () => {
  const { fs, ws } = frame({ scope: "src", map: mapOf(unitLines(10)) });
  run(fs);
  run(fs);
  const third = run(fs);
  assert.equal(third.stdout.includes("NEXT: scout"), false, third.stdout);
  assert.deepEqual(hunterIds(third.stdout), ["U1", "U2", "U3", "U4", "U5", "U6", "U7", "U8"]);
});

test("the kept units are the budget's count, highest score first, equal scores in map order", () => {
  const { fs, ws, lensFile } = frame({ scope: "src", map: mapOf(unitLines(10)) });
  run(fs);
  writeScores(fs, "S1", [score(1, 2), score(2, 5), score(3, 2), score(4, 5), score(5, 1), score(6, 3), score(7, 3), score(8, 4)]);
  writeScores(fs, "S2", [score(9, 1), score(10, 4)]);
  const result = run(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.ok(
    result.stdout.startsWith(
      lines(
        "hunters-at-once: 16",
        "NEXT: hunter | id: U2 | background",
        `Run file: ${ws}/run.md`,
        `Lens file: ${lensFile}`,
        `Schema: ${SKILL_DIR}/references/synthesis.md`,
        `Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`,
        "Hunt: U2",
        "Unit: - U2 | src/m2 | why 2",
        `Reports: ${ws}/reports/U2`,
      ),
    ),
    result.stdout,
  );
  assert.deepEqual(hunterIds(result.stdout), ["U2", "U4", "U8", "U10", "U6", "U7", "U1", "U3"]);
});

test("units still unscored after the retry come after every scored unit, in map order, and each kept unit is a hunt ledger line", () => {
  const { fs, ws } = frame({ scope: "src", map: mapOf(unitLines(10)) });
  run(fs);
  writeScores(fs, "S1", [score(1, 1), score(2, 3), score(3, 3)]);
  writeScores(fs, "S2", [score(9, 5), score(10, 1)]);
  run(fs);
  const result = run(fs);
  assert.deepEqual(hunterIds(result.stdout), ["U9", "U2", "U3", "U1", "U10", "U4", "U5", "U6"]);
  assert.equal(
    ledgerOf(fs),
    lines(
      "map-appended",
      "scouts: S1,S2",
      "scouts-retried",
      "hunt: U9 | wave: 1 | unit: U9 | angle: none",
      "hunt: U2 | wave: 1 | unit: U2 | angle: none",
      "hunt: U3 | wave: 1 | unit: U3 | angle: none",
      "hunt: U1 | wave: 1 | unit: U1 | angle: none",
      "hunt: U10 | wave: 1 | unit: U10 | angle: none",
      "hunt: U4 | wave: 1 | unit: U4 | angle: none",
      "hunt: U5 | wave: 1 | unit: U5 | angle: none",
      "hunt: U6 | wave: 1 | unit: U6 | angle: none",
    ),
  );
});

const NOISY_SCORE_FILES: [string, string[]][] = [
  ["ending on a closing tag", [score(1, 1), score(2, 5), score(3, 4), score(4, 1), score(5, 1), score(6, 1), score(7, 1), score(8, 3), CONTENT]],
  [
    "holding a line that is not a score line",
    [score(1, 1), "```json", score(2, 5), "no score for this unit", score(3, 4), score(4, 1), score(5, 1), score(6, 1), score(7, 1), score(8, 3)],
  ],
];

function runWave(fs: Fs) {
  return runKeepUnits([WS, "--wave"], SCRIPT, { fs });
}

function writeSeeds(fs: Fs, rows: string[]): void {
  put(fs, "seeds.md", lines(...rows));
}

/** The hunter block keep-units.sh prints for a hunt, `unit` and `angle` empty when the hunt has none. */
function hunterBlock(ws: string, lensFile: string, id: string, unit: string, angle: string, seeds: string[]): string {
  return lines(
    `NEXT: hunter | id: ${id} | background`,
    `Run file: ${ws}/run.md`,
    `Lens file: ${lensFile}`,
    `Schema: ${SKILL_DIR}/references/synthesis.md`,
    `Test rules: ${PLUGIN_ROOT}/references/test-strategy.md`,
    `Hunt: ${id}`,
    ...(unit ? [`Unit: ${unit}`] : []),
    ...(angle ? [`Angle: ${angle}`] : []),
    ...seeds,
    `Reports: ${ws}/reports/${id}`,
  );
}

const DIFF_SEEDS = ["Seed: wrong-result: swallows the parse error", "Seed: race-state: counter updated without the lock"];

/** A diff-scope run whose wave 1 hunts are printed, seeds.md written. */
function diffRunWithSeeds() {
  const framed = frame({ angles: ["wrong-result", "race-state"] });
  run(framed.fs);
  writeSeeds(framed.fs, DIFF_SEEDS);
  return framed;
}

/** A directory-scope run of `count` units: every unit scored `score(n)`, the kept wave 1 hunts printed. */
function dirRunAfterWaveOne(count: number, scoreOf: (unit: number) => number) {
  const framed = frame({ scope: "src", map: mapOf(unitLines(count)) });
  run(framed.fs);
  writeScores(framed.fs, "S1", Array.from({ length: count }, (_, i) => score(i + 1, scoreOf(i + 1))));
  run(framed.fs);
  return framed;
}

test("on the diff scope --wave prints one V-<n> hunt per Seed line, n from 1, carrying Angle: with the seed's slug and that Seed line", () => {
  const { fs, ws, lensFile } = diffRunWithSeeds();
  const result = runWave(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(
    result.stdout,
    `hunters-at-once: 16\n${hunterBlock(ws, lensFile, "V-1", "", "wrong-result", [DIFF_SEEDS[0]])}${hunterBlock(ws, lensFile, "V-2", "", "race-state", [DIFF_SEEDS[1]])}`,
  );
});

test("on a directory scope --wave prints one U<n> hunt per unit no hunt took on yet, in kept order, each carrying every Seed line", () => {
  const { fs, ws, lensFile } = dirRunAfterWaveOne(10, (unit) => (unit <= 8 ? 4 : unit === 10 ? 3 : 2));
  writeSeeds(fs, DIFF_SEEDS);
  const result = runWave(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(
    result.stdout,
    `hunters-at-once: 16\n${hunterBlock(ws, lensFile, "U10", "- U10 | src/m10 | why 10", "", DIFF_SEEDS)}${hunterBlock(ws, lensFile, "U9", "- U9 | src/m9 | why 9", "", DIFF_SEEDS)}`,
  );
});

test("a directory scope --wave stops at the budget of 8 hunts, the best unhunted units first", () => {
  const { fs, ws } = dirRunAfterWaveOne(20, () => 3);
  writeSeeds(fs, DIFF_SEEDS);
  const result = runWave(fs);
  assert.deepEqual(hunterIds(result.stdout), ["U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16"]);
});

test("a repo scope --wave stops at the budget of 16 hunts", () => {
  const framed = frame({ scope: "repo", map: mapOf(unitLines(40)) });
  run(framed.fs);
  writeScores(framed.fs, "S1", Array.from({ length: 40 }, (_, i) => score(i + 1, 3)));
  run(framed.fs);
  writeSeeds(framed.fs, DIFF_SEEDS);
  const result = runWave(framed.fs);
  assert.equal(hunterIds(result.stdout).length, 16);
  assert.equal(hunterIds(result.stdout)[0], "U17");
});

test("a diff scope hunt of --wave is a wave 2 hunt ledger line with no unit and its angle", () => {
  const { fs, ws } = diffRunWithSeeds();
  runWave(fs);
  assert.equal(
    ledgerOf(fs),
    lines(
      "map-appended",
      "hunt: A-wrong-result | wave: 1 | unit: none | angle: wrong-result",
      "hunt: A-race-state | wave: 1 | unit: none | angle: race-state",
      "hunt: V-1 | wave: 2 | unit: none | angle: wrong-result",
      "hunt: V-2 | wave: 2 | unit: none | angle: race-state",
    ),
  );
});

test("a unit hunt of --wave is a wave 2 hunt ledger line with its unit and no angle", () => {
  const { fs, ws } = dirRunAfterWaveOne(10, (unit) => (unit <= 8 ? 4 : 2));
  writeSeeds(fs, DIFF_SEEDS);
  runWave(fs);
  const waveRows = ledgerOf(fs).split("\n").filter((row) => row.includes("wave: 2"));
  assert.deepEqual(waveRows, ["hunt: U9 | wave: 2 | unit: U9 | angle: none", "hunt: U10 | wave: 2 | unit: U10 | angle: none"]);
});

test("a second --wave call prints NEXT: none and adds no ledger line", () => {
  const { fs, ws } = diffRunWithSeeds();
  runWave(fs);
  const ledgerAfterFirst = ledgerOf(fs);
  const second = runWave(fs);
  assert.equal(second.exit, 0, `stderr=${second.stderr}`);
  assert.equal(second.stdout, "NEXT: none\n");
  assert.equal(ledgerOf(fs), ledgerAfterFirst);
});

test("--wave on a directory scope whose units were all hunted prints NEXT: none", () => {
  const { fs, ws } = frame({ scope: "src", map: mapOf(unitLines(3)) });
  run(fs);
  writeSeeds(fs, DIFF_SEEDS);
  const result = runWave(fs);
  assert.equal(result.stdout, "NEXT: none\n");
});

/** Leaves a miss in the ledger the way hunt-return.sh does after the retry of a unit hunt. */
function recordNoReport(fs: Fs, units: number[]): void {
  put(fs, "ledger.md", ledgerOf(fs) + lines(...units.flatMap((unit) => [`retried: U${unit}`, `no-report: U${unit}`])));
}

test("a unit whose wave 1 hunt left a no-report line gets a wave 2 hunt R-U<n> printed ahead of the never-hunted units, recorded as a wave 2 hunt line", () => {
  const { fs, ws, lensFile } = dirRunAfterWaveOne(10, (unit) => (unit <= 8 ? 4 : 2));
  writeSeeds(fs, DIFF_SEEDS);
  recordNoReport(fs, [3]);
  const result = runWave(fs);
  assert.equal(result.exit, 0, `stderr=${result.stderr}`);
  assert.equal(
    result.stdout,
    `hunters-at-once: 16\n${hunterBlock(ws, lensFile, "R-U3", "- U3 | src/m3 | why 3", "", DIFF_SEEDS)}${hunterBlock(ws, lensFile, "U9", "- U9 | src/m9 | why 9", "", DIFF_SEEDS)}${hunterBlock(ws, lensFile, "U10", "- U10 | src/m10 | why 10", "", DIFF_SEEDS)}`,
  );
  const waveRows = ledgerOf(fs).split("\n").filter((row) => row.includes("wave: 2"));
  assert.deepEqual(waveRows, [
    "hunt: R-U3 | wave: 2 | unit: U3 | angle: none",
    "hunt: U9 | wave: 2 | unit: U9 | angle: none",
    "hunt: U10 | wave: 2 | unit: U10 | angle: none",
  ]);
});

test("with more no-report and never-hunted units than the budget of 8, --wave prints 8 blocks, the R-U ones first", () => {
  const { fs, ws } = dirRunAfterWaveOne(20, () => 3);
  writeSeeds(fs, DIFF_SEEDS);
  recordNoReport(fs, [2, 5, 7]);
  const result = runWave(fs);
  assert.deepEqual(hunterIds(result.stdout), ["R-U2", "R-U5", "R-U7", "U9", "U10", "U11", "U12", "U13"]);
});

test("no-report units beyond the budget of 8 leave no room for a never-hunted unit", () => {
  const { fs, ws } = dirRunAfterWaveOne(20, () => 3);
  writeSeeds(fs, DIFF_SEEDS);
  recordNoReport(fs, [1, 2, 3, 4, 5, 6, 7, 8]);
  const result = runWave(fs);
  assert.deepEqual(hunterIds(result.stdout), ["R-U1", "R-U2", "R-U3", "R-U4", "R-U5", "R-U6", "R-U7", "R-U8"]);
});

test("a unit whose hunt left a report gets no R-U block, and with every unit hunted --wave still prints NEXT: none", () => {
  const { fs, ws } = frame({ scope: "src", map: mapOf(unitLines(3)) });
  run(fs);
  writeSeeds(fs, DIFF_SEEDS);
  put(fs, "ledger.md", ledgerOf(fs) + lines("retried: U2"));
  const result = runWave(fs);
  assert.equal(result.stdout, "NEXT: none\n");
  assert.ok(!ledgerOf(fs).includes("R-U"));
});

test("a second --wave call after an R-U hunt printed prints NEXT: none and adds no ledger line", () => {
  const { fs, ws } = frame({ scope: "src", map: mapOf(unitLines(3)) });
  run(fs);
  writeSeeds(fs, DIFF_SEEDS);
  recordNoReport(fs, [2]);
  runWave(fs);
  const ledgerAfterFirst = ledgerOf(fs);
  const second = runWave(fs);
  assert.equal(second.stdout, "NEXT: none\n");
  assert.equal(ledgerOf(fs), ledgerAfterFirst);
});

for (const [label, rows] of NOISY_SCORE_FILES) {
  test(`a score file ${label} still yields its score lines`, () => {
    const { fs, ws } = frame({ scope: "src", map: mapOf(unitLines(10)) });
    run(fs);
    writeScores(fs, "S1", rows);
    writeScores(fs, "S2", [score(9, 2), score(10, 1)]);
    const result = run(fs);
    assert.deepEqual(hunterIds(result.stdout), ["U2", "U3", "U8", "U9", "U1", "U4", "U5", "U6"]);
  });
}

test("no workspace, a workspace with no run file and a run file lacking a header line each exit 2 with one error line and nothing on stdout", () => {
  const { fs } = frame();
  assert.deepEqual(runKeepUnits([], SCRIPT, { fs }), { stdout: "", stderr: "error: usage: keep-units.sh <ws>\n", exit: 2 });
  assert.deepEqual(runKeepUnits(["/r/none"], SCRIPT, { fs }), { stdout: "", stderr: "error: run file not found: /r/none/run.md\n", exit: 2 });
  put(fs, "run.md", lines("Lens: bugs", "Lens file: x"));
  assert.deepEqual(run(fs), { stdout: "", stderr: `error: run file has no Scope: line: ${WS}/run.md\n`, exit: 2 });
});

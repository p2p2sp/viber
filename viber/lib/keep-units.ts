/*
 * keep-units.ts - the keep-units core: gates the map of a code-auditor run,
 * scouts a scope whose units exceed its budget and prints the hunter blocks of
 * the kept units, or the hunts of the variant wave. The contract lives in the
 * header of ../skills/code-auditor/scripts/keep-units.ts.
 */

import { answer, fail, hunterBlock, linesOf, openRun, record, sectionLines, seedLines, unitId, unitLines, type Hunt, type HuntResult, type HuntRun } from "./hunt-brief.ts";
import type { Fs } from "./ports.ts";
import { runStripTag } from "./strip-tag.ts";

const NONE = answer(["NEXT: none"]);
const HEADINGS = ["Conventions", "History", "Severity calibration", "Units"];
const BATCH = 8;

/** The map gate: a STOP or a mapper retry answers the call, null once the map stands in run.md. */
function gate(run: HuntRun, fs: Fs): HuntResult | null {
  runStripTag([run.mapFile], { fs });
  const map = fs.kind(run.mapFile) === "file" ? linesOf(fs, run.mapFile) : [];
  if (!HEADINGS.every((heading) => map.some((line) => line.startsWith(`## ${heading}`) && /^[ \t\v\f\r]*$/.test(line.slice(heading.length + 3))))) {
    if (linesOf(fs, run.ledger).includes("mapper-retried")) return answer(["STOP: code-auditor: map unavailable after two attempts"]);
    record(run, "mapper-retried", fs);
    return answer(["NEXT: mapper | retry", `Run file: ${run.runFile}`, `Lens file: ${run.lensFile}`, `Signals: ${run.ws}/signals.md`, `Output: ${run.mapFile}`]);
  }
  const first = sectionLines(fs, run.mapFile, "Units").find((line) => /[^ \t]/.test(line)) ?? "";
  if (first.startsWith("none:")) {
    return answer([`STOP: code-auditor: nothing to audit for ${run.lens}: ${first.slice(5).replace(/^[ \t]+/, "").replace(/[ \t\r]+$/, "")}`]);
  }
  const head = new TextEncoder().encode("\n## Map\n");
  const body = fs.readBytes(run.mapFile) ?? new Uint8Array(0);
  const whole = new Uint8Array(head.length + body.length);
  whole.set(head);
  whole.set(body, head.length);
  fs.appendBytes(run.runFile, whole);
  record(run, "map-appended", fs);
  return null;
}

/** One scout block per batch of up to 8 units, in the order given. */
function scoutBlocks(run: HuntRun, units: string[], suffix: string): string[] {
  return units.flatMap((unit, index) => {
    if (index % BATCH > 0) return [`Unit: ${unit}`];
    const id = `S${index / BATCH + 1}${suffix}`;
    return [`NEXT: scout | id: ${id}${run.lens === "security" ? " | model: sonnet" : ""}`, `Run file: ${run.runFile}`, `Lens file: ${run.lensFile}`, `Out: ${run.ws}/scores/${id}.md`, `Unit: ${unit}`];
  });
}

/** The score of each scored unit, the first one seen, the score files in name order; each first loses a trailing closing tag. */
function scoresOf(run: HuntRun, fs: Fs): Map<string, number> {
  const files = fs
    .listDir(`${run.ws}/scores`)
    .filter((name) => !name.startsWith(".") && name.endsWith(".md"))
    .map((name) => `${run.ws}/scores/${name}`)
    .filter((file) => fs.kind(file) === "file");
  runStripTag(files, { fs });
  const scores = new Map<string, number>();
  for (const line of files.flatMap((file) => linesOf(fs, file))) {
    if (!/^[ \t]*\{/.test(line)) continue;
    const unit = /"unit"[ \t]*:[ \t]*"(U[0-9]+)"/.exec(line)?.[1];
    const score = /"score"[ \t]*:[ \t]*([1-5])[ \t,}]/.exec(line)?.[1];
    if (unit !== undefined && score !== undefined && !scores.has(unit)) scores.set(unit, Number(score));
  }
  return scores;
}

/** The first `limit` units, highest score first, equal scores in the order given, a unit with no score after every scored one. */
function best(units: string[], scores: Map<string, number>, limit: number): string[] {
  const score = (unit: string): number => scores.get(unitId(unit)) ?? 0;
  return [...units].sort((a, b) => score(b) - score(a)).slice(0, limit);
}

/** The stdout, stderr and exit code of one keep-units call, script being the path its entry was started by. Never throws. */
export function runKeepUnits(argv: string[], script: string, ports: { fs: Fs }): HuntResult {
  const { fs } = ports;
  const [workspace = "", flag = ""] = argv;
  if (workspace === "") return fail("usage: keep-units.sh <ws>");
  const run = openRun(workspace, script, fs);
  if (typeof run === "string") return fail(run);
  const variant = flag === "--wave";
  const budget = run.scope === "repo" ? 16 : 8;

  /** The hunter blocks of the hunts, each recorded in the ledger. */
  const dispatch = (hunts: Hunt[]): HuntResult => {
    for (const hunt of hunts) record(run, `hunt: ${hunt.id} | wave: ${variant ? 2 : 1} | unit: ${hunt.unitLine === "" ? "none" : unitId(hunt.unitLine)} | angle: ${hunt.angle || "none"}`, fs);
    return answer([`hunters-at-once: ${run.lens === "tests" ? 4 : 16}`, ...hunts.flatMap((hunt) => hunterBlock(run, hunt, false))]);
  };
  const unitHunts = (units: string[], prefix: string, seeds: string[]): Hunt[] => units.map((unitLine) => ({ id: `${prefix}${unitId(unitLine)}`, unitLine, angle: "", seeds }));

  if (!variant && !linesOf(fs, run.ledger).includes("map-appended")) {
    const stopped = gate(run, fs);
    if (stopped !== null) return stopped;
  }
  const ledger = linesOf(fs, run.ledger);
  const huntsOf = (wave: number): boolean => ledger.some((line) => line.startsWith("hunt: ") && line.slice(6).includes(` | wave: ${wave} |`));

  if (variant) {
    const seeds = seedLines(run, fs);
    if (seeds.length === 0 || huntsOf(2)) return NONE;
    if (run.scope === "diff") {
      return dispatch(seeds.map((seed, index) => ({ id: `V-${index + 1}`, unitLine: "", angle: seed.slice("Seed: ".length).split(": ")[0], seeds: [seed] })));
    }
    const hunted = new Set(ledger.filter((line) => line.startsWith("hunt: ")).map((line) => /unit: (U[0-9]+)/.exec(line)?.[1]));
    const missed = new Set(ledger.map((line) => /^no-report: (U[0-9]+)\r?$/.exec(line)?.[1]));
    const units = unitLines(run, fs);
    const again = units.filter((unit) => missed.has(unitId(unit))).slice(0, budget);
    const kept = best(units.filter((unit) => !hunted.has(unitId(unit))), scoresOf(run, fs), budget - again.length);
    if (again.length + kept.length === 0) return NONE;
    return dispatch([...unitHunts(again, "R-", seeds), ...unitHunts(kept, "", seeds)]);
  }

  if (huntsOf(1)) return NONE;
  if (run.scope === "diff") {
    const angles = sectionLines(fs, run.lensFile, "Hunts")
      .filter((line) => line.startsWith("### "))
      .map((line) => line.slice(4).replace(/^[ \t]+/, "").replace(/[ \t\r]+$/, ""))
      .filter((slug) => slug !== "");
    return angles.length === 0 ? NONE : dispatch(angles.map((angle) => ({ id: `A-${angle}`, unitLine: "", angle, seeds: [] })));
  }
  const units = unitLines(run, fs);
  if (units.length === 0) return NONE;
  if (units.length <= budget) return dispatch(unitHunts(units, "", []));
  if (!ledger.some((line) => line.startsWith("scouts: "))) {
    record(run, `scouts: ${Array.from({ length: Math.ceil(units.length / BATCH) }, (_, batch) => `S${batch + 1}`).join(",")}`, fs);
    return answer(scoutBlocks(run, units, ""));
  }
  const scores = scoresOf(run, fs);
  const unscored = units.filter((unit) => !scores.has(unitId(unit)));
  if (unscored.length > 0 && !ledger.includes("scouts-retried")) {
    record(run, "scouts-retried", fs);
    return answer(scoutBlocks(run, unscored, "-retry"));
  }
  return dispatch(unitHunts(best(units, scores, budget), "", []));
}

/*
 * hunt-brief.ts - what the scripts dispatching the hunts of a code-auditor run
 * share (keep-units, hunt-return): the run as its run.md describes it, the
 * unit and seed lines, the ledger and the hunter block.
 */

import { rootAbove } from "./plugin-root.ts";
import type { Fs } from "./ports.ts";
import { headerValue } from "./run-header.ts";

export interface HuntResult {
  stdout: string;
  stderr: string;
  exit: number;
}

/** worktree: the lens reads `Worktree: required`. */
export interface HuntRun {
  ws: string;
  runFile: string;
  mapFile: string;
  ledger: string;
  lens: string;
  lensFile: string;
  scope: string;
  worktree: boolean;
  skillDir: string;
  pluginRoot: string;
}

/** unitLine, angle: empty when the hunt has none. */
export interface Hunt {
  id: string;
  unitLine: string;
  angle: string;
  seeds: string[];
}

export const fail = (reason: string): HuntResult => ({ stdout: "", stderr: `error: ${reason}\n`, exit: 2 });
export const answer = (lines: string[]): HuntResult => ({ stdout: lines.map((line) => `${line}\n`).join(""), stderr: "", exit: 0 });

/** The lines of a file, a carriage return kept; none for an absent or empty one. */
export function linesOf(fs: Fs, path: string): string[] {
  const text = fs.readText(path);
  return text === null || text === "" ? [] : text.replace(/\n$/, "").split("\n");
}

/** The run of the workspace, script being the path the entry was started by; a string: the reason it is unusable. */
export function openRun(workspace: string, script: string, fs: Fs): HuntRun | string {
  const ws = workspace.replace(/\/$/, "");
  const runFile = `${ws}/run.md`;
  if (fs.kind(runFile) !== "file") return `run file not found: ${runFile}`;
  const text = fs.readText(runFile) ?? "";
  for (const key of ["Lens", "Lens file", "Scope"]) if (headerValue(text, key) === "") return `run file has no ${key}: line: ${runFile}`;
  const lensFile = headerValue(text, "Lens file");
  return {
    ws,
    runFile,
    mapFile: `${ws}/map.md`,
    ledger: `${ws}/ledger.md`,
    lens: headerValue(text, "Lens"),
    lensFile,
    scope: headerValue(text, "Scope"),
    worktree: linesOf(fs, lensFile).some((line) => line.startsWith("Worktree: required")),
    skillDir: rootAbove(script, 1),
    pluginRoot: rootAbove(script, 3),
  };
}

/** Appends one line to the ledger. */
export function record(run: HuntRun, line: string, fs: Fs): void {
  fs.appendBytes(run.ledger, new TextEncoder().encode(`${line}\n`));
}

/** The lines of every `## <title>` section of a file. */
export function sectionLines(fs: Fs, path: string, title: string): string[] {
  let inside = false;
  return linesOf(fs, path).filter((line) => {
    if (!line.startsWith("## ")) return inside;
    inside = line.startsWith(`## ${title}`) && /^[ \t\r]*$/.test(line.slice(title.length + 3));
    return false;
  });
}

/** The unit lines of the map, verbatim, in map order. */
export function unitLines(run: HuntRun, fs: Fs): string[] {
  return sectionLines(fs, run.mapFile, "Units").filter((line) => /^- U[0-9]+ \|/.test(line));
}

/** The `U<n>` of a unit line. */
export const unitId = (line: string): string => line.split(" ")[1];

/** The `Seed:` lines of seeds.md; none without the file. */
export function seedLines(run: HuntRun, fs: Fs): string[] {
  return linesOf(fs, `${run.ws}/seeds.md`)
    .filter((line) => line.startsWith("Seed: "))
    .map((line) => line.replace(/\r$/, ""));
}

/** The worktree lines of a block, name being its directory below worktrees/; none on a lens that needs no worktree. */
export function worktreeLines(run: HuntRun, name: string): string[] {
  if (!run.worktree) return [];
  return [
    `Worktree script: ${run.skillDir}/scripts/worktree.sh`,
    `Worktree: ${run.ws}/worktrees/${name}`,
    ...(run.scope === "diff" ? [`Overlay script: ${run.skillDir}/scripts/diff-overlay.sh`] : []),
  ];
}

export const testRulesLine = (run: HuntRun): string => `Test rules: ${run.pluginRoot}/references/test-strategy.md`;

/** The hunter block of one hunt; on retry its worktree is suffixed -retry. */
export function hunterBlock(run: HuntRun, hunt: Hunt, retry: boolean): string[] {
  return [
    `NEXT: hunter | id: ${hunt.id} | background${retry ? " | retry" : ""}`,
    `Run file: ${run.runFile}`,
    `Lens file: ${run.lensFile}`,
    `Schema: ${run.skillDir}/references/synthesis.md`,
    testRulesLine(run),
    `Hunt: ${hunt.id}`,
    ...(hunt.unitLine === "" ? [] : [`Unit: ${hunt.unitLine}`]),
    ...(hunt.angle === "" ? [] : [`Angle: ${hunt.angle}`]),
    ...hunt.seeds,
    `Reports: ${run.ws}/reports/${hunt.id}`,
    ...worktreeLines(run, retry ? `${hunt.id}-retry` : hunt.id),
  ];
}

/*
 * keep-units-fixture.ts - the helpers keep-units.test.ts and
 * keep-units.critical.test.ts share: what both tiers need to seed a case and
 * run viber/skills/code-auditor/scripts/keep-units.sh. It holds no case of its
 * own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/keep-units.sh");
export const SKILL_DIR = slash(path.resolve(import.meta.dirname, "../../viber/skills/code-auditor"));
export const PLUGIN_ROOT = slash(path.resolve(import.meta.dirname, "../../viber"));

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export function lines(...rows: string[]): string {
  return rows.map((row) => `${row}\n`).join("");
}

/** The four headings of a map, in order, with the given `## Units` lines. */
export function mapOf(units: string[]): string {
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

export function unitLines(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `- U${i + 1} | src/m${i + 1} | why ${i + 1}`);
}

export interface Frame {
  lens?: string;
  scope?: string;
  map?: string | null;
  worktree?: boolean;
  angles?: string[];
}

/** Writes lens.md, run.md and (unless null) map.md under `dir`, returns the workspace. */
export function frame(dir: string, opts: Frame = {}): { ws: string; lensFile: string; runBefore: string } {
  const ws = slash(path.join(dir, "ws"));
  fs.mkdirSync(path.join(ws, "reports"), { recursive: true });
  const lensFile = `${ws}/lens.md`;
  const angles = opts.angles ?? ["alpha", "beta"];
  fs.writeFileSync(
    lensFile,
    lines(
      "# Lens",
      "Intro.",
      "",
      "## Hunts",
      ...angles.flatMap((slug) => [`### ${slug}`, "what to look for.", ""]),
      "## Excluded",
      "### not-an-angle",
      "",
      "## Verify",
      `Worktree: ${opts.worktree ? "required" : "none"}`,
    ),
  );
  const run = lines(
    `Lens: ${opts.lens ?? "bugs"}`,
    `Lens file: ${lensFile}`,
    `Scope: ${opts.scope ?? "diff"}`,
    `Target root: ${slash(dir)}`,
  );
  fs.writeFileSync(path.join(ws, "run.md"), run);
  if (opts.map !== null) fs.writeFileSync(path.join(ws, "map.md"), opts.map ?? mapOf(unitLines(2)));
  return { ws, lensFile, runBefore: run };
}

export async function run(shell: Shell, ws: string): Promise<RunResult> {
  return await runScript(SUT, [ws], { shell, cwd: path.dirname(ws) });
}

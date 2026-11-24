/*
 * hunt-return-fixture.ts - what hunt-return.critical.test.ts uses to seed a case and run
 * viber/skills/code-auditor/scripts/hunt-return.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/hunt-return.sh");
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

export const UNITS = ["- U1 | src/m1 | why 1", "- U2 | src/m2 | why 2"];

export interface Frame {
  lens?: string;
  scope?: string;
  worktree?: boolean;
  ledger?: string[];
  seeds?: string[];
}

/** Writes lens.md, run.md, map.md and ledger.md under `dir`, returns the workspace. */
export function frame(dir: string, opts: Frame = {}): { ws: string; lensFile: string } {
  const ws = slash(path.join(dir, "ws"));
  fs.mkdirSync(path.join(ws, "reports"), { recursive: true });
  const lensFile = `${ws}/lens.md`;
  fs.writeFileSync(
    lensFile,
    lines("# Lens", "", "## Hunts", "### alpha", "what to look for.", "", "## Verify", `Worktree: ${opts.worktree ? "required" : "none"}`),
  );
  fs.writeFileSync(
    path.join(ws, "run.md"),
    lines(`Lens: ${opts.lens ?? "bugs"}`, `Lens file: ${lensFile}`, `Scope: ${opts.scope ?? "diff"}`, `Target root: ${slash(dir)}`),
  );
  fs.writeFileSync(path.join(ws, "map.md"), lines("## Conventions", "none", "", "## Units", ...UNITS));
  fs.writeFileSync(path.join(ws, "ledger.md"), lines(...(opts.ledger ?? [])));
  if (opts.seeds) fs.writeFileSync(path.join(ws, "seeds.md"), lines(...opts.seeds));
  return { ws, lensFile };
}

export async function run(shell: Shell, ws: string, ...rest: string[]): Promise<RunResult> {
  return await runScript(SUT, [ws, ...(rest.length ? rest : ["hunter", "U1"])], { shell, cwd: path.dirname(ws) });
}

export function put(ws: string, name: string, body: string): void {
  fs.writeFileSync(path.join(ws, "reports", name), body);
}

export const U1_LEDGER = ["hunt: U1 | wave: 1 | unit: U1 | angle: none"];

/** The critic block hunt-return.sh prints for the claim `<cid>`, `extra` the lens-dependent lines. */
export function criticBlock(ws: string, lensFile: string, cid: string, extra: string[] = [], tail: string[] = [], retry = false): string {
  return lines(
    `NEXT: critic | id: ${cid} | background${retry ? " | retry" : ""}`,
    `Claim: ${ws}/reports/${cid}.claim.md`,
    `Run file: ${ws}/run.md`,
    `Lens file: ${lensFile}`,
    `Out: ${ws}/verdicts/${cid}.md`,
    ...extra,
    ...tail,
  );
}

/*
 * map-signals-fixture.ts - the helpers map-signals.test.ts and
 * map-signals.critical.test.ts share: what both tiers need to seed a case and
 * run viber/skills/code-auditor/scripts/map-signals.sh. It holds no case of
 * its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/map-signals.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export function lines(rows: string[]): string {
  return rows.map((row) => `${row}\n`).join("");
}

export interface Frame {
  scope?: string;
  base?: string;
}

/** Writes the lens, its signals file and run.md under a workspace in the repo,
 *  returns the workspace path. */
export function frame(repo: GitRepo, signals: string[], opts: Frame = {}): string {
  const ws = slash(path.join(repo.dir, ".temp/viber/code-auditor/run"));
  fs.mkdirSync(path.join(ws, "reports"), { recursive: true });
  fs.writeFileSync(path.join(ws, "lens.md"), "# lens\n");
  fs.writeFileSync(path.join(ws, "lens.signals.md"), lines(signals));
  const run = [
    "Lens: bugs",
    `Lens file: ${ws}/lens.md`,
    `Scope: ${opts.scope ?? "diff"}`,
    `Target root: ${slash(repo.dir)}`,
  ];
  if (opts.base !== undefined) run.push(`Base: ${opts.base}`);
  fs.writeFileSync(path.join(ws, "run.md"), lines(run));
  return ws;
}

/** Runs the script from the workspace, never from the target root, so a block
 *  that lands in the root proves the script moved there. */
export async function run(shell: Shell, repo: GitRepo, ws: string): Promise<RunResult> {
  return await runScript(SUT, [ws], { shell, cwd: ws, env: repo.env });
}

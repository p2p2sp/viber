/*
 * run-suite-fixture.ts - the helpers run-suite.test.ts and
 * run-suite.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/run-suite.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/run-suite.sh");

export const REPORT = "docs/_specs/x/work/T11-report.md";
export const CMD = ".temp/viber/test-runner/T11-report.cmd";
export const LOG = ".temp/viber/test-runner/T11-report.log";

/** Writes `body` as the command file of the report, creating its directory. */
export function writeCommand(dir: string, body: string): void {
  fs.mkdirSync(path.join(dir, path.dirname(CMD)), { recursive: true });
  fs.writeFileSync(path.join(dir, CMD), body);
}

export function run(repo: { dir: string; env: Record<string, string> }, args: string[], cwd = repo.dir, wait = "1") {
  return runScript(SUT, args, { cwd, shell: "bash", env: { ...repo.env, RUN_SUITE_WAIT: wait } });
}

/*
 * run-failures-fixture.ts - the helpers run-failures.test.ts and
 * run-failures.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/run-failures.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
export const SUT = path.resolve(REPO_ROOT, "viber/scripts/run-failures.sh");

export const STATUS = ["# status", "", "progress: 1/1", "done: T1", "skipped: none", ""].join("\n");

/** A run directory holding `status.md` and the named files under `work/`. */
export function seedRun(root: string, work: Record<string, string>, name = "run"): string {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, "work"), { recursive: true });
  fs.writeFileSync(path.join(dir, "status.md"), STATUS);
  for (const [file, body] of Object.entries(work)) fs.writeFileSync(path.join(dir, "work", file), body);
  return dir;
}

export function lines(...parts: string[]): string {
  return parts.join("\n") + "\n";
}

export function run(cwd: string, args: string[]) {
  return runScript(SUT, args, { cwd, shell: "bash" });
}

export function failuresFile(dir: string): string {
  return path.join(dir, "failures.md");
}

export function readFailures(dir: string): string {
  return fs.readFileSync(failuresFile(dir), "utf8");
}

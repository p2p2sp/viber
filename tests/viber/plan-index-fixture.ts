/*
 * plan-index-fixture.ts - the helpers of plan-index.critical.test.ts: what it needs
 * to seed a case and run viber/scripts/plan-index.sh. It holds no case of its own;
 * the plan texts come from plan-body.ts.
 */

import fs from "node:fs";
import path from "node:path";

import { slash } from "../harness/paths.ts";
import { runScript } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";
import { DISPATCH_TASKS, PLAN_DIR, PLAN_REL, planBody, SCOPE_TASKS } from "./plan-body.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/plan-index.sh");

export function run(dir: string, env: Record<string, string>, args: string[]) {
  return runScript(SUT, args, { cwd: dir, env, shell: "bash" });
}

export function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function seed(dir: string, body: string): void {
  write(dir, PLAN_REL, body);
}

/** The run's state file, as --split writes it and commit-task.sh advances it.
 *  Every key is optional here: what the file does not carry is simply not set. */
export function seedStatus(dir: string, entries: Record<string, string>): void {
  write(
    dir,
    `${PLAN_DIR}/status.md`,
    ["# status", "", ...Object.entries(entries).map(([k, v]) => `${k}: ${v}`), ""].join("\n"),
  );
}

export function readRun(dir: string, rel: string): string {
  return fs.readFileSync(path.join(dir, PLAN_DIR, rel), "utf-8");
}

export function taskFiles(dir: string): string[] {
  const tasks = path.join(dir, PLAN_DIR, "tasks");
  return fs.existsSync(tasks) ? fs.readdirSync(tasks).sort() : [];
}

export async function subjects(repo: GitRepo): Promise<string[]> {
  return (await repo.git("log", "--format=%s")).stdout.trim().split("\n").filter(Boolean);
}

export const EXTRA_CODER = `${PLAN_DIR}/work/T3-extra.md`;

/** A run with SCOPE_TASKS, T1 and T4 done, and the coder's extras file for T3 holding `coder`. */
export function seedScope(dir: string, coder: string | null): void {
  seed(dir, planBody(SCOPE_TASKS, 1));
  seedStatus(dir, { progress: "2/4", done: "T1 T4" });
  if (coder !== null) write(dir, EXTRA_CODER, coder);
}

export async function scope(dir: string, id = "T3") {
  return run(dir, {}, [PLAN_REL, "--extra", id]);
}

export const DISPATCH_ROOT = slash(SUT).replace(/\/scripts\/plan-index\.sh$/, "");

export function seedDispatch(dir: string): void {
  seed(dir, planBody(DISPATCH_TASKS, 1));
  write(dir, `${PLAN_DIR}/status.md`, ["# status", "", "progress: 0/4", "done: none", ""].join("\n"));
}

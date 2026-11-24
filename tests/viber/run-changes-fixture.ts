/*
 * run-changes-fixture.ts - what run-changes.critical.test.ts uses to seed a
 * case and run viber/scripts/run-changes.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/run-changes.sh");

export const RUN = "docs/_specs/2026-01-01-00-00-00_demo";
export const PLAN = `${RUN}/plan.md`;

export function run(cwd: string, env: Record<string, string>, args: string[]) {
  return runScript(SUT, args, { cwd, env, shell: "bash" });
}

export function write(dir: string, rel: string, body: string): void {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

export async function commitAll(repo: GitRepo, message: string): Promise<string> {
  await repo.git("add", "-A");
  await repo.git("commit", "-m", message);
  return (await repo.git("rev-parse", "HEAD")).stdout.trim();
}

/** Two tracked files, then the commit adding the run's plan; returns that commit. */
export async function seed(repo: GitRepo): Promise<string> {
  // The repo keeps its git config as an untracked file in its own directory.
  fs.appendFileSync(path.join(repo.dir, ".git/info/exclude"), ".gitconfig-global\n");
  write(repo.dir, "tracked.txt", "one\n");
  write(repo.dir, "other.txt", "one\n");
  await commitAll(repo, "seed");
  write(repo.dir, PLAN, "plan\n");
  return commitAll(repo, "plan");
}

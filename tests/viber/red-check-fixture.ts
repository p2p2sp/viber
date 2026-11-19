/*
 * red-check-fixture.ts - the helpers red-check.test.ts and
 * red-check.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/red-check.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/red-check.sh");

/** The real Windows `cmd.exe`, slash-separated, for a `cmd` stand-in to pass its calls on to. */
export const REAL_CMD = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe").replace(/\\/g, "/");

export const RUN_DIR = "docs/_specs/2026-10-20-10-00-00_red-check";
export const PLAN_REL = `${RUN_DIR}/plan.md`;
export const LOG_REL = ".temp/viber/T1/red-check.log";

export function run(dir: string, env: Record<string, string>, args: string[]) {
  return runScript(SUT, args, { cwd: dir, env, shell: "bash", timeout: 120000 });
}

export function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** A lite plan plan-index.sh validates: T1 owns the production file and its
 *  test, T2 owns another production file a parallel coder is editing. */
export function planBody(verification = "bash tests/check.sh"): string {
  const task = (id: string, files: string, verification: string) => [
    "<!-- TASK -->",
    `### ${id} - task ${id}`,
    "- TDD: required",
    "- Covers: AC1",
    "- Uses: none",
    "- Depends-on: none",
    `- Files: ${files}`,
    "- Delivers: the thing",
    `- Verification: ${verification} -> green`,
    "- DoD: it works",
    "<!-- /TASK -->",
    "",
  ];
  return [
    "# Red check",
    "",
    "## Goal",
    "",
    "The answer is right.",
    "",
    "## Acceptance criteria",
    "",
    "1. The answer is 42.",
    "",
    "## Scope",
    "",
    "### File map",
    "",
    "- edit - src/lib.sh - the answer",
    "",
    "### Out of scope",
    "",
    "- Nothing else.",
    "",
    "## Tasks",
    "",
    ...task("T1", "src/lib.sh, tests/check.sh", verification),
    ...task("T2", "src/other.sh", "bash src/other.sh"),
  ].join("\n");
}

/** Commits the plan, the production files at their HEAD state and an ignore
 *  file for `.temp/` and `node_modules/`, as a host project carries them. */
export async function seed(repo: GitRepo, verification?: string): Promise<void> {
  fs.appendFileSync(path.join(repo.dir, ".git", "info", "exclude"), ".gitconfig-global\n");
  write(repo.dir, PLAN_REL, planBody(verification));
  write(repo.dir, ".gitignore", ".temp/\nnode_modules/\n");
  write(repo.dir, "src/lib.sh", "answer() { echo 0; }\n");
  write(repo.dir, "src/other.sh", "other() { echo ok; }\n");
  await repo.git("add", "-A");
  await repo.git("commit", "-m", "seed");
}

/** The task's production change: the answer becomes 42. */
export function changeProduction(dir: string): void {
  write(dir, "src/lib.sh", "answer() { echo 42; }\n");
}

export async function status(repo: GitRepo): Promise<string> {
  return (await repo.git("status", "--porcelain", "-uall")).stdout;
}

export async function worktrees(repo: GitRepo): Promise<string[]> {
  const out = (await repo.git("worktree", "list", "--porcelain")).stdout;
  return out.split("\n").filter((l) => l.startsWith("worktree "));
}

/*
 * skill-part-fixture.ts - what skill-part.critical.test.ts uses to seed a
 * case and run viber/scripts/skill-part.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/skill-part.sh");

export const FENCE = "```";
export const MEMORY_CALL = '"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.memory "${CLAUDE_SKILL_DIR}" memory';

export function skillDir(repo: GitRepo): string {
  return path.join(repo.dir, "plugin", "skills", "demo");
}

export function writeConfig(repo: GitRepo, body: string): void {
  fs.mkdirSync(path.join(repo.dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, ".claude", "viber.yml"), body);
}

export function writeIn(repo: GitRepo, sub: string, file: string, body: string): void {
  const dir = path.join(skillDir(repo), sub);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
}

export function writePart(repo: GitRepo, name: string, body: string): void {
  writeIn(repo, "parts", `${name}.md`, body);
}

export function writeFragment(repo: GitRepo, file: string, body: string): void {
  writeIn(repo, "fragments", file, body);
}

export async function run(repo: GitRepo, args: string[]): Promise<RunResult> {
  return await runScript(SUT, args, { cwd: repo.dir, env: repo.env, shell: "bash" });
}

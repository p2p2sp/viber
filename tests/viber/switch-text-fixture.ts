/*
 * switch-text-fixture.ts - the helpers switch-text.critical.test.ts uses to
 * seed a case and run viber/scripts/switch-text.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { type Shell } from "../harness/shells.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/switch-text.sh");

/** The skill directory every case hands the script: `<repo>/plugin/skills/demo`,
 *  so the plugin root it derives is `<repo>/plugin`. */
export function skillDir(repo: GitRepo): string {
  return path.join(repo.dir, "plugin", "skills", "demo");
}

export function writeConfig(repo: GitRepo, body: string): void {
  fs.mkdirSync(path.join(repo.dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, ".claude", "viber.yml"), body);
}

export function writeFragment(repo: GitRepo, file: string, body: string): void {
  const dir = path.join(skillDir(repo), "fragments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
}

export async function run(repo: GitRepo, args: string[], cwd: string = repo.dir, shell: Shell = "bash"): Promise<RunResult> {
  return await runScript(SUT, args, { cwd, env: repo.env, shell });
}

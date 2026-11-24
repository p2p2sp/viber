/*
 * tree-record-fixture.ts - what tree-record.critical.test.ts uses to seed a
 * case and run viber/skills/fixer/scripts/tree-record.sh. It holds no case of
 * its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/fixer/scripts/tree-record.sh");
export const STOP = "STOP: changed since the record - revert before the handoff";

export function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function treeRecord(repo: GitRepo, args: string[], cwd: string = repo.dir) {
  return runScript(SUT, args, { cwd, env: repo.env, shell: "bash" });
}

export function recordFile(repo: GitRepo): string {
  return path.join(repo.dir, ".temp/viber/fixer/tree-record");
}

/** A repository holding `mod.txt` and `stg.txt` committed, with the harness config and `ign.log` excluded. */
export async function seed(repo: GitRepo): Promise<void> {
  fs.appendFileSync(path.join(repo.dir, ".git/info/exclude"), ".gitconfig-global\nign.log\n");
  write(repo.dir, "mod.txt", "one\n");
  write(repo.dir, "stg.txt", "one\n");
  await repo.git("add", "mod.txt", "stg.txt");
  await repo.git("commit", "-m", "seed");
}

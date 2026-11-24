/*
 * memory-map-fixture.ts - what memory-map.critical.test.ts uses to seed a case
 * and run viber/skills/memory/scripts/memory-map.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/memory/scripts/memory-map.sh");

export function run(repo: GitRepo, args: string[] = []) {
  return runScript(SUT, args, { cwd: repo.dir, env: repo.env, shell: "bash" });
}

/** stdout split into lines, the trailing empty one dropped. */
export function lines(stdout: string): string[] {
  return stdout.replace(/\n$/, "").split("\n");
}

/** Writes each `path -> content` pair into the repo, creating directories. */
export function write(repo: GitRepo, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(repo.dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
}

/** Writes the files and commits them, so every one of them is tracked. */
export async function commit(repo: GitRepo, files: Record<string, string>): Promise<void> {
  write(repo, files);
  await repo.git("add", "-A");
  await repo.git("commit", "-m", "seed");
}

/** The lines of `out` opening with `prefix`, in the order printed. */
export function pick(out: string[], prefix: string): string[] {
  return out.filter((line) => line.startsWith(prefix));
}

/** A CLAUDE.md body of exactly `chars` bytes, newline included. */
export function node(chars: number): string {
  return `${"x".repeat(chars - 1)}\n`;
}

export const MAP_ID = "2026-11-19-10-00-00";

/** Puts a CLAUDE.md at each path, tracked nowhere: the reconcile call reads the tree alone. */
export function present(repo: GitRepo, ...paths: string[]): void {
  write(repo, Object.fromEntries(paths.map((p) => [p, node(40)])));
}

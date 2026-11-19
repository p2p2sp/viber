/*
 * rules-map-fixture.ts - the helpers rules-map.test.ts and
 * rules-map.critical.test.ts share: what both tiers need to seed a case and
 * run viber/skills/rules/scripts/rules-map.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/rules/scripts/rules-map.sh");

export function run(repo: GitRepo, args: string[] = [], cwd = repo.dir) {
  return runScript(SUT, args, { cwd, env: repo.env, shell: "bash" });
}

/** Writes one file under the repo, creating its directory. */
export function write(repo: GitRepo, relative: string, body: string): void {
  const file = path.join(repo.dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

/** Writes every entry, then commits the lot - the tree a map is taken of. */
export async function seed(repo: GitRepo, files: Record<string, string>): Promise<void> {
  for (const [relative, body] of Object.entries(files)) write(repo, relative, body);
  await repo.git("add", "-A");
  await repo.git("commit", "-m", "seed");
}

/** A rule file with a block-sequence `paths:` key, the shape this repo's own
 *  rules use. */
export function rule(globs: string[], body = "# rule\n"): string {
  return ["---", "paths:", ...globs.map((glob) => `  - "${glob}"`), "---", "", body].join("\n");
}

/** Every stdout line, separators normalized so a Windows path compares. */
export function lines(stdout: string): string[] {
  return slash(stdout).trim().split("\n");
}

/** The lines opening on `<key>: `, that prefix stripped. */
export function section(stdout: string, key: string): string[] {
  return lines(stdout)
    .filter((line) => line.startsWith(key + ": "))
    .map((line) => line.slice(key.length + 2));
}

/** Tracked names git quotes in its newline-separated listing: a `"` and a `\`
 *  cannot be spelled on a Windows filesystem, so the cases skip there. */
export const QUOTED_NAMES = {
  skip: process.platform === "win32" ? "a double quote or backslash cannot be a Windows file name" : false,
};

export async function seedQuotedNames(repo: GitRepo): Promise<void> {
  await seed(repo, {
    'lib/q"x.ts': "q\n",
    "lib/back\\slash.ts": "b\n",
    '.claude/rules/a"b.md': rule(["docs/*.md"]),
    ".claude/rules/lib.md": rule(["lib/*.ts"]),
    "docs/x.md": "x\n",
  });
}

/** Writes one findings file of a run under `.temp/viber/<id>/`, after the seed
 *  so the tree stays what the map is taken of. */
export function findings(repo: GitRepo, id: string, name: string, body: string): void {
  write(repo, `.temp/viber/${id}/${name}`, body);
}

/** A scope with no shared literal first segment, so a root rule holding it is
 *  never named misplaced. */
export const ANY_TS = "**/*.ts";

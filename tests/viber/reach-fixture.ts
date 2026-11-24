/*
 * reach-fixture.ts - what reach.critical.test.ts uses to seed a case and run
 * viber/skills/planner/scripts/reach.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/planner/scripts/reach.sh");
export const PLAN = "/work/plan file.md";

export function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function reach(repo: GitRepo, args: string[], cwd: string = repo.dir) {
  return runScript(SUT, args, { cwd, env: repo.env, shell: "bash" });
}

/** Runs reach.sh --plan PLAN with the targets and returns its stdout lines plus the candidates file it names. */
export async function reachFile(repo: GitRepo, targets: string[], cwd?: string) {
  const result = await reach(repo, ["--plan", PLAN, ...targets], cwd);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const lines = result.stdout.trimEnd().split("\n");
  const named = slash(lines[0]).match(
    /^candidates: (.+\/\.temp\/viber\/planner\/reach-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.md)$/,
  );
  assert.ok(named, `no candidates line in: ${result.stdout}`);
  return { lines, file: named[1], content: fs.readFileSync(named[1], "utf-8") };
}

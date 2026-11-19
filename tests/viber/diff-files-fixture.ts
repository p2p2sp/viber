/*
 * diff-files-fixture.ts - the helpers diff-files.test.ts and
 * diff-files.critical.test.ts share: what both tiers need to seed a case and
 * run viber/skills/code-auditor/scripts/diff-files.sh. It holds no case of its
 * own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/diff-files.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export async function run(shell: Shell, repo: GitRepo, args: string[] = []): Promise<RunResult> {
  return await runScript(SUT, [repo.dir, ...args], { shell, cwd: repo.dir, env: repo.env });
}

export async function git(repo: GitRepo, ...args: string[]): Promise<string> {
  const result = await repo.git(...args);
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

export function write(repo: GitRepo, rel: string, content: string) {
  const file = path.join(repo.dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Writes the files, commits them all, returns the new commit sha. */
export async function commitFiles(repo: GitRepo, files: Record<string, string>, message = "commit"): Promise<string> {
  for (const [rel, content] of Object.entries(files)) write(repo, rel, content);
  await git(repo, "add", "-A");
  await git(repo, "commit", "-m", message);
  return await git(repo, "rev-parse", "HEAD");
}

export function lines(...rows: string[]): string {
  return rows.map((row) => `${row}\n`).join("");
}

export function assertOutput(result: RunResult, expected: string) {
  assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
  assert.equal(result.stdout, expected);
}

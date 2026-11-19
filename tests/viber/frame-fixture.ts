/*
 * frame-fixture.ts - the helpers frame.test.ts and frame.critical.test.ts
 * share: what both tiers need to seed a case and run
 * viber/skills/code-auditor/scripts/frame.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/frame.sh");
export const SKILL_DIR = slash(path.resolve(import.meta.dirname, "../../viber/skills/code-auditor"));
export const LENS_LIST = "(lenses: bugs, security, web-performance, runtime-performance, tests, design)";

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export async function frame(shell: Shell, repo: GitRepo, args: string[], cwd: string = repo.dir): Promise<RunResult> {
  return await runScript(SUT, args, { shell, cwd, env: repo.env });
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
export async function commitFiles(repo: GitRepo, files: Record<string, string>): Promise<string> {
  for (const [rel, content] of Object.entries(files)) write(repo, rel, content);
  await git(repo, "add", "-A");
  await git(repo, "commit", "-m", "commit");
  return await git(repo, "rev-parse", "HEAD");
}

export async function rootOf(repo: GitRepo): Promise<string> {
  return await git(repo, "rev-parse", "--show-toplevel");
}

export function lines(...rows: string[]): string {
  return rows.map((row) => `${row}\n`).join("");
}

export function assertStdout(result: RunResult, expected: string) {
  assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
  assert.equal(result.stdout, expected);
}

export function assertWroteNothing(repo: GitRepo) {
  assert.equal(fs.existsSync(path.join(repo.dir, ".temp")), false, "a run that is not framed writes no workspace");
}

/** Asserts stdout is the RUN line for a workspace under the root and returns that workspace. */
export function workspaceOf(result: RunResult, root: string): string {
  assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
  const match = /^RUN: sh "(.+)\/scripts\/map-signals\.sh" "(.+)"\n$/.exec(slash(result.stdout));
  assert.ok(match, `stdout is no RUN line: ${result.stdout}`);
  assert.equal(match[1], SKILL_DIR);
  assert.match(match[2], new RegExp(`^${slash(root).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\.temp/viber/code-auditor/\\d{8}-\\d{6}$`));
  return match[2];
}

export function runFile(ws: string): string {
  return fs.readFileSync(path.join(ws, "run.md"), "utf-8");
}

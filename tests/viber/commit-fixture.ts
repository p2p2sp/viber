/*
 * commit-fixture.ts - what commit.critical.test.ts uses to seed a case and run
 * viber/skills/commit/scripts/commit.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/commit/scripts/commit.sh");

export async function runCommit(bash: Shell, repo: GitRepo, args: string[]): Promise<RunResult> {
  return await runScript(SUT, args, { shell: bash, cwd: repo.dir, env: repo.env });
}

export async function assertBash(fn: (bash: Shell) => void | Promise<void>) {
  const skips = await forEachShell("bash", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "bash");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export async function commitFile(repo: GitRepo, name: string, content: string) {
  fs.writeFileSync(path.join(repo.dir, name), content);
  const add = await repo.git("add", "-A");
  assert.equal(add.status, 0, `git add should succeed: ${add.stderr}`);
  const commit = await repo.git("commit", "-m", `seed ${name}`);
  assert.equal(commit.status, 0, `git commit should succeed: ${commit.stderr}`);
}

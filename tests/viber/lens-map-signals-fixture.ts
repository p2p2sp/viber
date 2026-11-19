/*
 * lens-map-signals-fixture.ts - the helpers lens-map-signals.test.ts and
 * lens-map-signals.critical.test.ts share: what both tiers need to seed a case
 * and run viber/skills/code-auditor/references/lenses/bugs.signals.md. It
 * holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withTempDir, type GitRepo } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const LENSES = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/references/lenses");
export const DAY_MS = 24 * 3600 * 1000;

export async function assertBash(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("bash", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "bash");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

/** Every ```bash block of a signals file, `<scope>` substituted by `scope` the
 *  way the mapper substitutes it (`.` for the repository-wide scope). */
export function mapSignalCommands(file: string, scope = "."): string[] {
  const text = fs.readFileSync(path.join(LENSES, file), "utf-8");
  return [...text.matchAll(/^```bash\r?\n([\s\S]*?)^```/gm)].map((m) => m[1].trim().replaceAll("<scope>", scope));
}

/** Commits whatever is staged `daysAgo` days in the past (author == committer
 *  date), so the 12-month window is exercised whenever the suite runs. */
export async function commitAt(repo: GitRepo, daysAgo: number, message: string): Promise<void> {
  const date = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  const env = { ...repo.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  const add = await runScript("git", ["add", "-A"], { cwd: repo.dir, env });
  assert.equal(add.status, 0, `git add failed: ${add.stderr}`);
  const commit = await runScript("git", ["commit", "-q", "-m", message], { cwd: repo.dir, env });
  assert.equal(commit.status, 0, `git commit failed: ${commit.stderr}`);
}

export function write(repo: GitRepo, file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(repo.dir, file)), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, file), content);
}

/** A seed of a few source files 500 days old, a fix 400 days old, a non-fix
 *  commit 10 days old and a fix 5 days old, each later commit touching a file
 *  of its own so the files a command lists name the commits it kept. */
export async function buildHistory(repo: GitRepo): Promise<void> {
  write(repo, "README.md", "# sample\n");
  write(repo, "config.json", '{ "retry_count": 3, "base_url": "http://localhost" }\n');
  write(repo, "src/app.js", "try { run(); } catch (e) {}\n");
  write(repo, "src/util.py", "try:\n    load()\nexcept OSError: pass\n");
  write(repo, "scripts/build.sh", "#!/bin/sh\nrm -rf out 2>/dev/null || true\n");
  await commitAt(repo, 500, "chore: seed the tree");

  write(repo, "src/ancient.js", "export const ancient = 1;\n");
  await commitAt(repo, 400, "fix: ancient crash outside the window");

  write(repo, "src/feature.js", "export const feature = 1;\n");
  await commitAt(repo, 10, "feat: add the export feature");

  write(repo, "src/recent.js", "export const recent = 1;\n");
  await commitAt(repo, 5, "fix: recent crash inside the window");
}

export async function runCommand(shell: Shell, repo: GitRepo, command: string): Promise<RunResult> {
  return await withTempDir("p2p2-lens-signal-", (dir) => {
    const script = path.join(dir, "signal.sh");
    fs.writeFileSync(script, `#!/usr/bin/env bash\n${command}\n`);
    return runScript(script, [], { shell, cwd: repo.dir, env: repo.env, input: "" });
  });
}

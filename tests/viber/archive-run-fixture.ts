/*
 * archive-run-fixture.ts - the helpers archive-run.test.ts and
 * archive-run.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/archive-run.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/archive-run.sh");

export const KEY = "2026-09-19-17-30-00_add-login";

/** A specification long enough for git's rename detection to have something to
 *  work with - a one-line file edited by one word falls under the similarity
 *  threshold and would report an add plus a delete for reasons that have
 *  nothing to do with this script. */
export const SPEC_BODY = [
  "# Add Login",
  "",
  "## Goal",
  "",
  "Let people sign in.",
  "",
  "## Acceptance criteria",
  "",
  "1. A wrong password is rejected.",
  "2. A changed role takes effect on the next request.",
  "3. The session survives a reload.",
  "4. A locked account cannot sign in.",
  "",
].join("\n");

export interface RunOpts {
  runs?: string;
  tasks?: string[];
  done?: string;
  skipped?: string;
  /** Extra files, relative to the run directory. */
  extra?: Record<string, string>;
}

/** A finished run directory, exactly as a build leaves one: the plan, the state
 *  file, the decomposition, the trail and the two documents worth keeping. */
export function seedRun(root: string, key: string, opts: RunOpts = {}): string {
  const runs = opts.runs ?? "_specs";
  const tasks = opts.tasks ?? ["T1", "T2"];
  const dir = path.join(root, "docs", runs, key);
  fs.mkdirSync(path.join(dir, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(dir, "work"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "plan.md"),
    [
      "# Add Login",
      "",
      "## Tasks",
      "",
      ...tasks.flatMap((id) => ["<!-- TASK -->", `### ${id} - do ${id}`, `- Files: src/${id}.ts`, "<!-- /TASK -->", ""]),
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(dir, "status.md"),
    [
      "# status",
      "",
      `progress: ${tasks.length}/${tasks.length}`,
      `done: ${opts.done ?? tasks.join(" ")}`,
      `skipped: ${opts.skipped ?? "none"}`,
      "unreviewed: none",
      "deferred: none",
      "closed: memory rules qa",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(dir, "spec.md"), SPEC_BODY);
  fs.writeFileSync(path.join(dir, "qa.md"), "# QA\n\n## QA-01 Sign in\n");
  fs.writeFileSync(path.join(dir, "qa.e2e.md"), "# Handoff\n\n### QA-01 Sign in\n");
  for (const id of tasks) fs.writeFileSync(path.join(dir, "tasks", `${id}.md`), `### ${id}\n`);
  fs.writeFileSync(path.join(dir, "work", "T1-coder.md"), "- narrowed the cache to 5s\n");
  for (const [rel, body] of Object.entries(opts.extra ?? {})) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  return `docs/${runs}/${key}`;
}

export function run(dir: string, args: string[], env: Record<string, string> = {}) {
  return runScript(SUT, args, { cwd: dir, env, shell: "bash" });
}

/** A repo whose run directory is already committed, which is what every real
 *  call sees: `plan-index.sh --split` commits the decomposition. */
export async function withSeededRepo<T>(fn: (repo: GitRepo, runDir: string) => T, opts: RunOpts = {}, key = KEY): Promise<T> {
  return await withGitRepo(async (repo) => {
    const runDir = seedRun(repo.dir, key, opts);
    await repo.git("add", "-A");
    const commit = await repo.git("commit", "-m", "docs(viber): decomposition");
    assert.equal(commit.status, 0, `seed commit failed: ${commit.stderr}`);
    return fn(repo, runDir);
  });
}

/** Every path under a directory, repo-relative and slash-separated. */
export function filesUnder(root: string, rel: string): string[] {
  const base = path.join(root, rel);
  if (!fs.existsSync(base)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(slash(path.relative(base, full)));
    }
  };
  walk(base);
  return out.sort();
}

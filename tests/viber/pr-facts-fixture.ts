/*
 * pr-facts-fixture.ts - the helpers pr-facts.test.ts and
 * pr-facts.critical.test.ts share: what both tiers need to seed a case and run
 * viber/scripts/pr-facts.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/pr-facts.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export const REPO_URL = "https://github.com/acme/widgets";

/** A `gh` stub: `repo view` prints the repository URL then the default branch
 *  (or fails on REPO_FAIL), `pr list` prints PR_LIST. */
export const GH_STUB = `
case "$1 $2" in
  "repo view")
    if [ -n "\${REPO_FAIL:-}" ]; then exit 1; fi
    printf '%s\\n' "${REPO_URL}" "\${DEFAULT_BRANCH:-main}" ;;
  "pr list")
    if [ -n "\${PR_FAIL:-}" ]; then exit 1; fi
    printf '%s' "\${PR_LIST:-}" ;;
  "issue view")
    if [ -n "\${ISSUE_FAIL:-}" ]; then exit 1; fi
    printf '%s\\n' "title of #$3" ;;
esac
exit 0
`;

export interface Scene {
  work: GitRepo;
  remote: GitRepo;
  stubDir: string;
}

export async function commit(repo: GitRepo, files: Record<string, string>, message: string, ...more: string[]) {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo.dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, rel), content);
    await repo.git("add", "--", rel);
  }
  const msgs = [message, ...more].flatMap((m) => ["-m", m]);
  await repo.git("commit", "--allow-empty", ...msgs);
}

/** `main` and `develop` at one commit, `origin` an empty bare repo, HEAD on `main`. */
export async function withScene<T>(fn: (scene: Scene) => Promise<T>): Promise<T> {
  return await withGitRepo(
    (remote) =>
      withGitRepo((work) =>
        withStub("gh", GH_STUB, async (stubDir) => {
          await work.git("remote", "add", "origin", remote.dir);
          await commit(work, { "README.md": "readme\n" }, "init");
          await work.git("branch", "develop");
          return await fn({ work, remote, stubDir });
        }),
      ),
    { bare: true },
  );
}

/** Cuts `name` from HEAD and commits one file on it. */
export async function onBranch(scene: Scene, name: string, files: Record<string, string> = { "work.txt": "work\n" }, message = "work", ...more: string[]) {
  await scene.work.git("checkout", "-b", name);
  await commit(scene.work, files, message, ...more);
}

export async function runFacts(
  shell: Shell,
  scene: Scene,
  args: string[] = [],
  opts: { env?: Record<string, string>; noGh?: boolean } = {},
): Promise<RunResult> {
  const env = { ...scene.work.env, ...(opts.noGh ? { PATH: coreUtilsPath() } : {}), ...opts.env };
  return await runScript(SUT, args, { shell, cwd: scene.work.dir, env, stubDirs: opts.noGh ? [] : [scene.stubDir] });
}

export function lines(result: RunResult): string[] {
  return result.stdout.split("\n").filter((l) => l.length > 0);
}

export function value(result: RunResult, key: string): string | undefined {
  return lines(result)
    .find((l) => l.startsWith(`${key}=`))
    ?.slice(key.length + 1);
}

export async function shortSha(repo: GitRepo, ref: string): Promise<string> {
  return (await repo.git("log", "-1", "--format=%h", ref)).stdout.trim();
}

/** The plugin root RERUN= opens on: the directory above the scripts directory. */
export const PLUGIN_ROOT = slash(path.resolve(import.meta.dirname, "../../viber"));

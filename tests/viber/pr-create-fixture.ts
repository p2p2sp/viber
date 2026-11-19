/*
 * pr-create-fixture.ts - the helpers pr-create.test.ts and
 * pr-create.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/pr-create.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/pr-create.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export const PR_URL = "https://github.com/acme/widgets/pull/17";

/** A `gh` stub logging every call's argv one-arg-per-line (a "===" separator
 *  after each) into `$ARGV_FILE`, answering `pr edit` with EDIT_EXIT,
 *  `repo view` with R_1, `issue view` with I_1, `api graphql` from
 *  LINK_STDOUT/LINK_EXIT and `pr create` from PR_STDOUT/PR_STDERR/PR_EXIT. */
export const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
if [ "$1 $2" = "repo view" ]; then echo R_1; exit 0; fi
if [ "$1 $2" = "issue view" ]; then echo I_1; exit 0; fi
if [ "$1 $2" = "api graphql" ]; then printf '%s' "\${LINK_STDOUT-LB_1}"; exit "\${LINK_EXIT:-0}"; fi
if [ "$2" = edit ]; then exit "\${EDIT_EXIT:-0}"; fi
if [ -n "\${PR_STDERR:-}" ]; then printf '%s' "$PR_STDERR" >&2; fi
printf '%s' "\${PR_STDOUT:-}"
exit "\${PR_EXIT:-0}"
`;

export interface Scene {
  work: GitRepo;
  remote: GitRepo;
  body: string;
  stubDir: string;
  argvFile: string;
}

/** A work repo on branch `feature/x` with one commit and `origin` pointing at
 *  an empty bare repo, plus a fresh gh stub dir. */
export async function withScene<T>(fn: (scene: Scene) => Promise<T>): Promise<T> {
  return await withGitRepo(
    (remote) =>
      withGitRepo((work) =>
        withStub("gh", GH_STUB, async (stubDir) => {
          await work.git("remote", "add", "origin", remote.dir);
          await work.git("commit", "--allow-empty", "-m", "first");
          await work.git("checkout", "-b", "feature/x");
          const body = path.join(work.dir, "body.md");
          fs.writeFileSync(body, "## Summary\n\nLine one.\n");
          const argvFile = path.join(work.dir, "argv.log");
          fs.writeFileSync(argvFile, "");
          return await fn({ work, remote, body, stubDir, argvFile });
        }),
      ),
    { bare: true },
  );
}

export async function runPr(
  shell: Shell,
  scene: Scene,
  args: string[],
  opts: { env?: Record<string, string>; noGh?: boolean } = {},
): Promise<{ result: RunResult; calls: string[][] }> {
  const real = args.map((a) => (a === "<body>" ? scene.body : a));
  const env = { ...scene.work.env, ARGV_FILE: scene.argvFile, ...(opts.noGh ? { PATH: coreUtilsPath() } : {}), ...opts.env };
  const result = await runScript(SUT, real, {
    shell,
    cwd: scene.work.dir,
    env,
    stubDirs: opts.noGh ? [] : [scene.stubDir],
  });
  const calls = fs
    .readFileSync(scene.argvFile, "utf-8")
    .split("===\n")
    .map((block) => block.split("\n").filter((line) => line.length > 0))
    .filter((call) => call.length > 0);
  return { result, calls };
}

export async function remoteHeads(scene: Scene): Promise<string> {
  const heads = await scene.remote.git("for-each-ref", "--format=%(refname)", "refs/heads");
  return heads.stdout.trim();
}

/*
 * issue-templates-fixture.ts - the helpers issue-templates.test.ts and
 * issue-templates.critical.test.ts share: what both tiers need to seed a case
 * and run viber/scripts/issue-templates.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/issue-templates.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

/** A `gh` stub logging its argv one-arg-per-line (a "===" separator after
 *  each call) into `$ARGV_FILE`; its stdout, stderr and exit code come from
 *  env vars, so one body serves every case. */
export const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
if [ -n "\${GH_STDERR:-}" ]; then printf '%s' "$GH_STDERR" >&2; fi
printf '%s' "\${GH_STDOUT:-}"
exit "\${GH_EXIT:-0}"
`;

export function writeTemplates(repoDir: string, files: Record<string, string>): void {
  const dir = path.join(repoDir, ".github", "ISSUE_TEMPLATE");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
}

/** Runs issue-templates.sh in `cwd` (a subdirectory of a git repo, or the
 *  repo root) with a fresh `gh` stub first on PATH. `env` supplies the
 *  stub's GH_STDOUT/GH_STDERR/GH_EXIT and, when set, drops PATH to
 *  coreUtilsPath() so gh's absence can be staged. */
export async function runStubbed(
  shell: Shell,
  cwd: string,
  repoEnv: Record<string, string>,
  args: string[] = [],
  ghEnv: Record<string, string> = {},
  noGh = false,
): Promise<{ result: RunResult; calls: string[][] }> {
  return await withStub("gh", GH_STUB, async (stubDir) => {
    const argvFile = path.join(cwd, "argv.log");
    fs.writeFileSync(argvFile, "");
    const env = { ...repoEnv, ARGV_FILE: argvFile, ...ghEnv };
    const result = await runScript(SUT, args, {
      shell,
      cwd,
      env: noGh ? { ...env, PATH: coreUtilsPath() } : env,
      stubDirs: noGh ? [] : [stubDir],
    });
    const calls = fs
      .readFileSync(argvFile, "utf-8")
      .split("===\n")
      .map((block) => block.split("\n").filter((line) => line.length > 0))
      .filter((call) => call.length > 0);
    return { result, calls };
  });
}

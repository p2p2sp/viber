/*
 * post-comment-fixture.ts - the helpers post-comment.test.ts and
 * post-comment.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/post-comment.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/post-comment.sh");

export const COMMENT_URL = "https://github.com/acme/widgets/issues/42#issuecomment-1234567";

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

/** Runs post-comment.sh with a fresh `gh` stub first on PATH. `args` may use
 *  the token "<file>", replaced by the path of an existing comment file.
 *  Returns the result, every logged gh call and that file's path. */
export async function runStubbed(
  shell: Shell,
  args: string[],
  env: Record<string, string> = {},
): Promise<{ result: RunResult; calls: string[][]; file: string }> {
  return await withTempDir("p2p2-post-comment-", (cwd) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      const file = path.join(cwd, "comment.md");
      fs.writeFileSync(file, "## Summary\n\nLine one.\nLine two.\n");
      const argvFile = path.join(cwd, "argv.log");
      fs.writeFileSync(argvFile, "");
      const real = args.map((a) => (a === "<file>" ? file : a));
      const result = await runScript(SUT, real, { shell, cwd, env: { ARGV_FILE: argvFile, ...env }, stubDirs: [stubDir] });
      const calls = fs
        .readFileSync(argvFile, "utf-8")
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      return { result, calls, file };
    }),
  );
}

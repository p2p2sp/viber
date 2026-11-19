/*
 * issue-create-fixture.ts - the helpers issue-create.test.ts and
 * issue-create.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/issue-create.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/issue-create.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export const ISSUE_URL = "https://github.com/acme/widgets/issues/42";

/** A `gh` stub logging every call's argv one-arg-per-line (a "===" separator
 *  after each) into `$ARGV_FILE`; the `issue create` call answers from
 *  CREATE_STDOUT/CREATE_STDERR/CREATE_EXIT, a `project view` call (the --project
 *  title lookup) from PROJECT_STDOUT/PROJECT_STDERR/PROJECT_EXIT, an `api` call carrying PATCH (the
 *  type step) from API_STDERR/API_EXIT, one carrying POST (the sub-issue
 *  attach) from POST_STDERR/POST_EXIT, and any other `api` call (the issue id
 *  lookup) from LOOKUP_STDOUT/LOOKUP_STDERR/LOOKUP_EXIT - so one stub body
 *  serves every call of one run. */
export const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
if [ "$1" = "issue" ]; then
  if [ -n "\${CREATE_STDERR:-}" ]; then printf '%s' "$CREATE_STDERR" >&2; fi
  printf '%s' "\${CREATE_STDOUT:-}"
  exit "\${CREATE_EXIT:-0}"
elif [ "$1" = "project" ]; then
  if [ -n "\${PROJECT_STDERR:-}" ]; then printf '%s' "$PROJECT_STDERR" >&2; fi
  printf '%s\\n' "\${PROJECT_STDOUT:-}"
  exit "\${PROJECT_EXIT:-0}"
elif [ "$1" = "repo" ]; then
  printf '%s\\n' "https://github.com/acme/widgets"
  exit 0
elif [ "$1" = "api" ]; then
  case " $* " in
    *" PATCH "*)
      if [ -n "\${API_STDERR:-}" ]; then printf '%s' "$API_STDERR" >&2; fi
      exit "\${API_EXIT:-0}" ;;
    *" POST "*)
      if [ -n "\${POST_STDERR:-}" ]; then printf '%s' "$POST_STDERR" >&2; fi
      exit "\${POST_EXIT:-0}" ;;
    *)
      if [ -n "\${LOOKUP_STDERR:-}" ]; then printf '%s' "$LOOKUP_STDERR" >&2; fi
      printf '%s\\n' "\${LOOKUP_STDOUT:-}"
      exit "\${LOOKUP_EXIT:-0}" ;;
  esac
fi
exit 1
`;

/** Runs issue-create.sh with a fresh `gh` stub first on PATH. Returns the
 *  result and every logged gh call, split into per-call argv arrays. */
export async function runStubbed(
  shell: Shell,
  args: string[],
  env: Record<string, string> = {},
  files: Record<string, string> = {},
): Promise<{ result: RunResult; calls: string[][]; body: string; bodyKept: boolean }> {
  return await withTempDir("p2p2-issue-create-", (cwd) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      const body = path.join(cwd, "body.md");
      fs.writeFileSync(body, "## Summary\n\nLine one.\nLine two.\n");
      for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
        fs.writeFileSync(path.join(cwd, rel), content);
      }
      const argvFile = path.join(cwd, "argv.log");
      fs.writeFileSync(argvFile, "");
      const real = args.map((a) => (a === "<body>" ? body : a));
      const result = await runScript(SUT, real, { shell, cwd, env: { ARGV_FILE: argvFile, ...env }, stubDirs: [stubDir] });
      const calls = fs
        .readFileSync(argvFile, "utf-8")
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      return { result, calls, body, bodyKept: fs.existsSync(body) };
    }),
  );
}

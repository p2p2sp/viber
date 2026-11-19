/*
 * issue-facts-fixture.ts - the helpers issue-facts.test.ts and
 * issue-facts.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/issue-facts.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/issue-facts.sh");

export const BLOCK = [
  "NUMBER=42",
  "URL=https://github.com/acme/widgets/issues/42",
  "TITLE=Login button does nothing",
  "STATE=OPEN",
  "AUTHOR=octocat",
  "LABELS=bug, ui",
  "COMMENTS=1",
  "--- body ---",
  "Steps:",
  "1. click login",
  "--- comment 1 by hubot at 2026-09-01T10:00:00Z ---",
  "Same here.",
];

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

/** The block issue-facts.sh prints for BLOCK, its `TYPE=` line placed right
 *  after `LABELS=`. */
export function withType(type: string): string[] {
  const i = BLOCK.indexOf("LABELS=bug, ui") + 1;
  return [...BLOCK.slice(0, i), `TYPE=${type}`, ...BLOCK.slice(i)];
}

/** A `gh` stub logging its argv one-arg-per-line (a "===" separator after
 *  each call) into `$ARGV_FILE`; its stdout, stderr and exit code come from
 *  env vars, so one body serves every case. A `gh api` call (the type
 *  lookup) answers from its own GH_TYPE_* vars instead. */
export const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
if [ "$1" = api ]; then
  if [ -n "\${GH_TYPE_STDERR:-}" ]; then printf '%s' "$GH_TYPE_STDERR" >&2; fi
  printf '%s' "\${GH_TYPE_STDOUT:-}"
  exit "\${GH_TYPE_EXIT:-0}"
fi
if [ -n "\${GH_STDERR:-}" ]; then printf '%s' "$GH_STDERR" >&2; fi
printf '%s' "\${GH_STDOUT:-}"
exit "\${GH_EXIT:-0}"
`;

/** Runs issue-facts.sh with a fresh `gh` stub first on PATH and returns the
 *  result plus every logged gh call. */
export async function runStubbed(shell: Shell, args: string[], env: Record<string, string> = {}): Promise<{ result: RunResult; calls: string[][] }> {
  return await withTempDir("p2p2-issue-facts-", (cwd) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      const argvFile = path.join(cwd, "argv.log");
      fs.writeFileSync(argvFile, "");
      const result = await runScript(SUT, args, { shell, cwd, env: { ARGV_FILE: argvFile, ...env }, stubDirs: [stubDir] });
      const calls = fs
        .readFileSync(argvFile, "utf-8")
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      return { result, calls };
    }),
  );
}

/*
 * artifact-create-fixture.ts - the helpers artifact-create.test.ts and
 * artifact-create.critical.test.ts share: what both tiers need to seed a case
 * and run viber/scripts/artifact-create.sh against a stubbed `gh`. It holds no
 * case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/artifact-create.sh");

export const ISSUE_URL = "https://github.com/acme/widgets/issues/42";

export const UNKNOWN_COMMAND = 'unknown command "artifact" for "gh issue"\n';

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

/** A `gh` stub logging every call's argv one-arg-per-line (a "===" separator
 *  after each) into `$ARGV_FILE`. `issue view` prints LOOKUP_STDOUT; the nth
 *  `issue artifact create` call prints
 *  `resp/<n>.out` of the cwd and exits with the number in `resp/<n>.exit`
 *  (0 when absent). */
export const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
if [ "$2" = "view" ]; then
  printf '%s\\n' "$LOOKUP_STDOUT"
  exit 0
fi
if [ "$2" = "artifact" ]; then
  echo x >> "$COUNT_FILE"
  n=$(wc -l < "$COUNT_FILE" | tr -d ' ')
  [ -f "resp/$n.out" ] && cat "resp/$n.out"
  if [ -f "resp/$n.exit" ]; then exit "$(cat "resp/$n.exit")"; fi
  exit 0
fi
exit 1
`;

/** One `issue artifact create` reply: the stdout gh prints and its exit status. */
export interface Reply {
  out: string;
  exit?: number;
}

/** A result line as non-TTY gh prints it. */
export function resultLine(status: string, number: string, name: string, source: string, reason = ""): string {
  return [status, number, name, source, reason].join("\t") + "\n";
}

export interface Run {
  result: RunResult;
  calls: string[][];
}

/** Runs artifact-create.sh in a fresh cwd holding `files`, with a fresh `gh`
 *  stub first on PATH. Returns the result and every logged gh call as argv. */
export async function runStubbed(
  shell: Shell,
  args: string[],
  opts: { replies?: Reply[]; files?: Record<string, string> } = {},
): Promise<Run> {
  return await withTempDir("p2p2-artifact-create-", (cwd) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      for (const [rel, content] of Object.entries(opts.files ?? {})) {
        fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
        fs.writeFileSync(path.join(cwd, rel), content);
      }
      fs.mkdirSync(path.join(cwd, "resp"));
      (opts.replies ?? []).forEach((reply, i) => {
        fs.writeFileSync(path.join(cwd, "resp", `${i + 1}.out`), reply.out);
        fs.writeFileSync(path.join(cwd, "resp", `${i + 1}.exit`), String(reply.exit ?? 0));
      });
      const argvFile = path.join(cwd, "argv.log");
      const countFile = path.join(cwd, "count.log");
      fs.writeFileSync(argvFile, "");
      fs.writeFileSync(countFile, "");
      const env = { ARGV_FILE: argvFile, COUNT_FILE: countFile, LOOKUP_STDOUT: ISSUE_URL };
      const result = await runScript(SUT, args, { shell, cwd, env, stubDirs: [stubDir] });
      const calls = fs
        .readFileSync(argvFile, "utf-8")
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      return { result, calls };
    }),
  );
}

/** The create calls of a run: every call but the `issue view` lookup. */
export function createCalls(calls: string[][]): string[][] {
  return calls.filter((c) => c[1] === "artifact");
}

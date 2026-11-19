/*
 * commit-args-fixture.ts - the helpers commit-args.test.ts and
 * commit-args.critical.test.ts share: what both tiers need to seed a case and
 * run viber/skills/commit/scripts/commit-args.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/commit/scripts/commit-args.sh");

export function wrapperScript(libPath: string): string {
  return [
    "#!/usr/bin/env bash",
    `source "${libPath}"`,
    "enter_repo_root",
    'resolve_commit_selector "$1"',
    "printf '%s\\n' \"$COMMIT_MODE\"",
    "IFS='|'; printf '%s\\n' \"${COMMIT_PATHS[*]}\"",
    "printf '%s\\n' \"$COMMIT_ISSUE_REFS\"",
  ].join("\n") + "\n";
}

export interface Selector {
  mode: string;
  path: string;
  issueRefs: string;
}

/** Sources commit-args.sh into a fresh bash wrapper, calls
 *  `resolve_commit_selector <raw>` with `cwd` as the working directory
 *  (so relative-path existence checks resolve against it), and returns the
 *  three resulting variables. */
export async function resolve(bash: Shell, cwd: string, raw: string): Promise<Selector> {
  return await withTempDir("p2p2-commit-args-wrapper-", async (wrapperDir) => {
    const wrapper = path.join(wrapperDir, "wrapper.sh");
    fs.writeFileSync(wrapper, wrapperScript(SUT), { mode: 0o755 });
    fs.chmodSync(wrapper, 0o755);
    const result: RunResult = await runScript(wrapper, [raw], { shell: bash, cwd });
    assert.equal(result.status, 0, `wrapper should succeed: ${result.stderr}`);
    const lines = result.stdout.split("\n");
    return { mode: lines[0], path: lines[1], issueRefs: lines[2] };
  });
}

export async function assertBash(fn: (bash: Shell) => void | Promise<void>) {
  const skips = await forEachShell("bash", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "bash");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

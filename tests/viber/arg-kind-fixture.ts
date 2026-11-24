/*
 * arg-kind-fixture.ts - the helpers arg-kind.critical.test.ts uses to seed a
 * case and run viber/scripts/arg-kind.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/arg-kind.sh");

export const ISSUE_URL = "https://github.com/acme/widgets/issues/42";

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export async function run(shell: Shell, args: string[]): Promise<RunResult> {
  return await runScript(SUT, args, { shell });
}

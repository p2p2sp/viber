/*
 * strip-tag-fixture.ts - the helpers strip-tag.critical.test.ts uses to seed a
 * case and run viber/skills/code-auditor/scripts/strip-tag.sh. It holds no case
 * of its own.
 */

import assert from "node:assert/strict";
import path from "node:path";

import { type RunResult } from "../harness/run.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/strip-tag.sh");

export const CONTENT = "\x3c/content>";
export const PARAMETER = "\x3c/parameter>";

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export function assertQuietSuccess(result: RunResult) {
  assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
  assert.equal(result.stdout, "");
}

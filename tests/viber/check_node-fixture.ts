/*
 * check_node-fixture.ts - the helpers check_node.test.ts and
 * check_node.critical.test.ts share: what both tiers need to seed a case and
 * run viber/skills/ui-designer/scripts/check_node.sh. It holds no case of its
 * own.
 */

import assert from "node:assert/strict";
import path from "node:path";

import { type RunResult } from "../harness/run.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/ui-designer/scripts/check_node.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export function assertOneLine(result: RunResult, expected: string) {
  assert.equal(result.status, 0, `check_node.sh must always exit 0 (fail-open): stderr=${result.stderr}`);
  assert.equal(result.stdout, `${expected}\n`);
}

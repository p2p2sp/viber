/*
 * plugin-root-fixture.ts - the helpers plugin-root.test.ts and
 * plugin-root.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/plugin-root.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { withTempDir } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/plugin-root.sh");

export const SOURCE_LINE = '. "$(dirname -- "$0")/plugin-root.sh"';

export async function assertShells(kind: "posix" | "bash", fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell(kind, fn);
  for (const skip of skips) {
    assert.equal(skip.kind, kind);
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export async function runThrowaway(shell: Shell, lines: string[], args: string[]): Promise<RunResult> {
  return await withTempDir("plugin-root-", async (dir) => {
    fs.copyFileSync(SUT, path.join(dir, "plugin-root.sh"));
    const script = path.join(dir, "caller.sh");
    fs.writeFileSync(script, ["#!/bin/sh", ...lines, ""].join("\n"));
    return await runScript(script, args, { shell });
  });
}

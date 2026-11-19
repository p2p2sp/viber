/*
 * attach-lines-fixture.ts - the helpers attach-lines.test.ts and
 * attach-lines.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/attach-lines.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { slash } from "../harness/paths.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/attach-lines.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export function write(repo: GitRepo, rel: string): void {
  const file = path.join(repo.dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "x\n");
}

export function rootOf(repo: GitRepo): string {
  return slash(fs.realpathSync(repo.dir));
}

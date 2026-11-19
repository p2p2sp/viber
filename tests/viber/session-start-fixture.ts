/*
 * session-start-fixture.ts - the helpers session-start.test.ts and
 * session-start.critical.test.ts share: what both tiers need to seed a case
 * and run viber/hooks/scripts/session-start.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/hooks/scripts/session-start.sh");

/** Builds a fake plugin root: `<dir>/hooks/content/manifest.md` with the given
 *  content, returning the plugin-root path to hand the script as
 *  CLAUDE_PLUGIN_ROOT. */
export function fakePluginRoot(dir: string, manifest: string): string {
  const contentDir = path.join(dir, "hooks", "content");
  fs.mkdirSync(contentDir, { recursive: true });
  fs.writeFileSync(path.join(contentDir, "manifest.md"), manifest);
  return dir;
}

/** Copies session-start.sh into a fresh `<dir>/hooks/scripts/` with NO sibling
 *  `hooks/content/manifest.md` - required to actually reproduce "manifest
 *  unreadable": the script also falls back to
 *  `$SCRIPT_DIR/../content/manifest.md`, and $SCRIPT_DIR is the SUT's own real
 *  location, so pointing CLAUDE_PLUGIN_ROOT elsewhere does not neutralise both
 *  lookup paths at once. */
export function isolatedScript(dir: string): string {
  const scriptsDir = path.join(dir, "hooks", "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const dest = path.join(scriptsDir, "session-start.sh");
  fs.copyFileSync(SUT, dest);
  fs.chmodSync(dest, 0o755);
  return dest;
}

/** hooks.json always invokes the script as `bash "session-start.sh"`, never
 *  bare, so the harness invokes it the same way. */
export async function run(script: string, input: string, env: Record<string, string> = {}) {
  const result = await runScript(script, [], { shell: "bash", input, env });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  let json: any;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    throw new Error(`expected parseable JSON stdout, got: ${result.stdout}`);
  }
  return json;
}

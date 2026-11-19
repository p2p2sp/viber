/*
 * extension-fixture.ts - the helpers extension.test.ts and
 * extension.critical.test.ts share: what both tiers need to seed a case and
 * run viber/skills/extension/scripts/extension.sh. It holds no case of its
 * own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/extension/scripts/extension.sh");

export async function run(args: string[], cwd: string, env: Record<string, string>): Promise<RunResult> {
  const result = await runScript(SUT, args, { cwd, env, shell: "bash" });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  return result;
}

export function writeFile(root: string, rel: string, body: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

/** A viber.yml whose `build:` group carries the given extension-map lines, a key after them and a group after that. */
export function config(extensionLines: string[]): string {
  return ["schema: 3", "build:", "  memory: true", ...extensionLines, "  rules: true", "github:", "  issues: false", ""].join("\n");
}

export function readConfig(root: string): string {
  return fs.readFileSync(path.join(root, ".claude", "viber.yml"), "utf8");
}

export function lines(result: RunResult): string[] {
  return result.stdout.split("\n").filter((line) => line !== "");
}

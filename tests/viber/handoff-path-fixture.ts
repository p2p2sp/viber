/*
 * handoff-path-fixture.ts - what handoff-path.critical.test.ts uses to run
 * viber/skills/handoff/scripts/handoff-path.sh and read its four lines. It
 * holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/handoff/scripts/handoff-path.sh");

export const STAMPED = /^(.*)\/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})_\{slug\}\.md$/;

export async function run(args: string[], cwd: string, env: Record<string, string> = {}): Promise<RunResult> {
  return await runScript(SUT, args, { cwd, env, shell: "bash" });
}

export interface Printed {
  file: string;
  exists: string;
  branch: string;
  target: string;
}

/** The four lines, asserted present, in order, and nothing else. */
export function parse(result: RunResult): Printed {
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stderr, "");
  const lines = result.stdout.split("\n");
  assert.equal(lines.length, 5, `expected four lines, got ${JSON.stringify(result.stdout)}`);
  assert.equal(lines[4], "");
  assert.match(lines[0], /^FILE=/);
  assert.match(lines[1], /^EXISTS=(true|false)$/);
  assert.match(lines[2], /^BRANCH=/);
  assert.match(lines[3], /^TARGET=(named|default)$/);
  return {
    file: lines[0].slice("FILE=".length),
    exists: lines[1].slice("EXISTS=".length),
    branch: lines[2].slice("BRANCH=".length),
    target: lines[3].slice("TARGET=".length),
  };
}

/** Two paths naming one directory, however each spells it. */
export function sameFile(a: string, b: string): boolean {
  return fs.realpathSync.native(a) === fs.realpathSync.native(b);
}

/** The directory a stamped FILE sits in, asserted stamped. */
export function stampedDir(file: string): string {
  const match = STAMPED.exec(file);
  assert.ok(match, `not a stamped placeholder path: ${file}`);
  return match[1];
}

/** The printed root, for a FILE the test expects at `<root>/<rel>`. */
export function rootOf(file: string, rel: string): string {
  const suffix = `/${rel}`;
  assert.ok(file.endsWith(suffix), `${file} does not end in ${suffix}`);
  return file.slice(0, -suffix.length);
}

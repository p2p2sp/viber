/*
 * config-fixture.ts - the helpers config.test.ts and config.critical.test.ts
 * share: what both tiers need to seed a case and run viber/scripts/config.sh.
 * It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/config.sh");

/** Every switch off and both directory keys at their default - what a project
 *  with no config file, and every unusable value, resolves to. */
export const OFF = {
  "planning.adr": "false",
  "planning.outside-plan-review": "false",
  "build.baseline-tests": "off",
  "build.final-review": "false",
  "build.memory": "false",
  "build.rules": "false",
  "build.qa": "false",
  "build.cleanup": "false",
  "build.red-check": "false",
  "github.issues": "false",
};

export function run(dir: string, env: Record<string, string> = {}) {
  return runScript(SUT, [], { cwd: dir, env, shell: "bash" });
}

export function writeConfig(root: string, body: string): void {
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "viber.yml"), body);
}

/** The `directories:` group as the template writes it. */
export function group(entries: Record<string, string>): string {
  return ["directories:", ...Object.entries(entries).map(([key, value]) => `  ${key}: ${value}`), ""].join("\n");
}

/** One group holding the given child lines, each indented two blanks. */
export function inGroup(name: string, ...children: string[]): string {
  return [`${name}:`, ...children.map((child) => `  ${child}`), ""].join("\n");
}

/** Every key the script printed, in the fixed order it prints them; a value is
 *  everything after the first colon, since a title pattern holds colons of its own. */
export function config(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of stdout.trim().split("\n").slice(1)) {
    const at = line.indexOf(":");
    if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

/** The ten switches alone, so a case about a switch need not restate the
 *  titles, directory names, tiers and branching mode. */
export function switches(stdout: string): Record<string, string | undefined> {
  const all = config(stdout);
  return Object.fromEntries(Object.keys(OFF).map((key) => [key, all[key]]));
}

/** The two directory keys alone, under their short names. The script prints
 *  them dotted, which is itself asserted below. */
export function dirs(stdout: string): Record<string, string> {
  const all = config(stdout);
  return { runs: all["directories.runs"], specifications: all["directories.specifications"] };
}

export function writeLocal(root: string, body: string): void {
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "viber.local.yml"), body);
}

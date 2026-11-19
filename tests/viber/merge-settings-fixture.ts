/*
 * merge-settings-fixture.ts - the helpers merge-settings.test.ts and
 * merge-settings.critical.test.ts share: what both tiers need to seed a case
 * and run viber/skills/setup/scripts/merge-settings.sh. It holds no case of
 * its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/setup/scripts/merge-settings.sh");
export const TEMPLATE_SETTINGS = path.resolve(import.meta.dirname, "../../viber/skills/setup/templates/settings.json");

/** A small file-local template so a merge assertion can name the exact entries
 *  and counts; the shipped template is used only where the case is about the
 *  shipped template itself (creation, the no-node block, its own shape). */
export const FIXTURE_TEMPLATE = {
  $schema: "https://json.schemastore.org/claude-code-settings.json",
  showClearContextOnPlanAccept: true,
  permissions: {
    defaultMode: "acceptEdits",
    disableAutoMode: "disable",
    allow: ["Read", "Write", "Bash"],
    ask: ["Bash(git push:*)"],
    deny: ["Bash(sudo:*)", "Bash(rm -rf:*)"],
  },
};

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function fixtureTemplate(dir: string): string {
  const file = path.join(dir, "template.json");
  writeJson(file, FIXTURE_TEMPLATE);
  return file;
}

export function targetPath(dir: string): string {
  return path.join(dir, ".claude", "settings.json");
}

export async function run(dir: string, template: string, target?: string): Promise<RunResult> {
  const args = target === undefined ? [template] : [template, target];
  return await runScript(SUT, args, { cwd: dir });
}

export function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

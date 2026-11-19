/*
 * bootstrap-fixture.ts - the helpers bootstrap.test.ts and
 * bootstrap.critical.test.ts share: what both tiers need to seed a case and
 * run viber/skills/setup/scripts/bootstrap.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { slash } from "../harness/paths.ts";
import { runScript } from "../harness/run.ts";
import { withStub } from "../harness/stub.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/setup/scripts/bootstrap.sh");
export const TEMPLATE_GITIGNORE = path.resolve(import.meta.dirname, "../../viber/skills/setup/templates/gitignore.txt");
export const TEMPLATE_CONFIG = path.resolve(import.meta.dirname, "../../viber/skills/setup/templates/viber.yml");

export const LOCAL = ".claude/viber.local.yml";

/** The plugin root as the script prints it: three directories above its own, slash-normalised. */
export const PLUGIN_ROOT = slash(path.resolve(import.meta.dirname, "../../viber"));
export const MERGE_SETTINGS = `"${PLUGIN_ROOT}/skills/setup/scripts/merge-settings.sh"`;
export const SETTINGS_TEMPLATE = `"${PLUGIN_ROOT}/skills/setup/templates/settings.json"`;
export const HELP_RUN = `RUN: "${PLUGIN_ROOT}/scripts/open-page.sh" "${PLUGIN_ROOT}/skills/setup/assets/help.html"`;

export const FLAT_SWITCH =/^(adr|memory|rules|qa|cleanup|red-check|final-review|issues|baseline-tests)[ \t]*:/m;

// A stub gh is always first on PATH, so the gh line never depends on whether
// the machine running the suite has the real one installed.
export function run(dir: string, env: Record<string, string> = {}) {
  return withStub("gh", "exit 0", (stubDir) =>
    runScript(SUT, [], { cwd: dir, env, shell: "bash", stubDirs: [stubDir] }),
  );
}

export function read(file: string): string {
  return fs.readFileSync(file, "utf-8");
}

export function configPath(root: string): string {
  return path.join(root, ".claude", "viber.yml");
}

/** The value of `<group>:`'s child `<child>` in a written config, CR dropped;
 *  undefined when the group does not hold that child. */
export function childValue(text: string, group: string, child: string): string | undefined {
  const body = new RegExp(`^${group}[ \\t]*:[ \\t]*\\r?\\n((?:[ \\t]+\\S.*\\n|#.*\\n)*)`, "m").exec(text);
  const line = new RegExp(`^[ \\t]+${child}[ \\t]*:[ \\t]*(.*?)\\r?$`, "m").exec(body?.[1] ?? "");
  return line?.[1];
}

/** The printed CLAUDE.md lines, slash-normalised. */
export function claudeMdLines(stdout: string): string[] {
  return stdout.split(/\r?\n/).filter((l) => l.startsWith("CLAUDE.md:")).map(slash);
}

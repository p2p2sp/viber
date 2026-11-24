/*
 * switch-text.ts - the switch-text core: selects the skill fragment matching
 * one .claude/viber.yml switch value, resolved by the config core, and expands
 * its two root placeholders. The contract lives in the header of
 * ../scripts/switch-text.ts.
 */

import { runConfig } from "./config/run.ts";
import type { Fs, Git } from "./ports.ts";

/** Every key a call may name; a flat key (`memory`) is an unknown key. */
const KEYS = new Set([
  "planning.adr",
  "planning.outside-plan-review",
  "build.baseline-tests",
  "build.final-review",
  "build.memory",
  "build.rules",
  "build.qa",
  "build.cleanup",
  "build.red-check",
  "github.issues",
  "branching.mode",
  "build.extensions",
]);

/** The skill directory without its last two segments, separator / or \, a trailing separator ignored. */
export function pluginRootOf(skillDir: string): string {
  let root = /[/\\]$/.test(skillDir) ? skillDir.slice(0, -1) : skillDir;
  for (let i = 0; i < 2; i++) {
    const cut = Math.max(root.lastIndexOf("/"), root.lastIndexOf("\\"));
    if (cut >= 0) root = root.slice(0, cut);
  }
  return root;
}

/** The whole stdout of one switch-text call: the fragment, or nothing. Never throws. */
export function runSwitchText(argv: string[], cwd: string, ports: { fs: Fs; git: Git }): string {
  const [key = "", skillDir = "", name = ""] = argv;
  if (!KEYS.has(key) || !/^[a-z0-9-]+$/.test(name) || skillDir === "") return "";

  const block = runConfig([], cwd, ports).split("\n");
  const valueOf = (k: string): string => block.find((line) => line.startsWith(`${k}: `))?.slice(k.length + 2) ?? "";
  // A list of missing names alone never reads off.
  const value =
    key === "build.extensions"
      ? valueOf("build.extensions") === "none" && valueOf("build.extensions-missing") === "none"
        ? "off"
        : "on"
      : valueOf(key);
  if (!/^[a-z]+$/.test(value)) return "";

  const text = ports.fs.readText(`${skillDir.replace(/\/+$/, "")}/fragments/${name}.${value}.md`);
  if (text === null) return "";
  // A function replacement keeps a `$` of the path literal.
  return text
    .replaceAll("${CLAUDE_SKILL_DIR}", () => skillDir)
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", () => pluginRootOf(skillDir));
}

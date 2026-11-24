/*
 * run.ts - the config core entry: finds .claude/viber.yml through the ports
 * and returns the whole stdout of one config call.
 */

import type { Fs, Git } from "../ports.ts";
import { resolveBlock } from "./block.ts";
import { resolveBranching } from "./branching.ts";

/** The whole stdout of one config call, every line ended by "\n". Never throws. */
export function runConfig(argv: string[], cwd: string, ports: { fs: Fs; git: Git }): string {
  let text: string | null = null;
  let hasAgent = (_name: string): boolean => false;
  try {
    const root = ports.git.repoRoot(cwd) ?? cwd;
    text = ports.fs.readText(`${root}/.claude/viber.yml`);
    hasAgent = (name) => ports.fs.exists(`${root}/.claude/agents/${name}.md`);
  } catch {
    text = null;
  }
  const lines = argv[0] === "--branching" ? resolveBranching(text) : resolveBlock(text, hasAgent);
  return lines.map((line) => `${line}\n`).join("");
}

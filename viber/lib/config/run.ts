/*
 * run.ts - the config core entry: finds .claude/viber.yml through the ports
 * and returns the whole stdout of one config call.
 */

import type { Fs, Git } from "../ports.ts";
import { resolveBlock } from "./block.ts";

/** The whole stdout of one config call, every line ended by "\n". Never throws. */
export function runConfig(_argv: string[], cwd: string, ports: { fs: Fs; git: Git }): string {
  let text: string | null = null;
  try {
    const root = ports.git.repoRoot(cwd) ?? cwd;
    text = ports.fs.readText(`${root}/.claude/viber.yml`);
  } catch {
    text = null;
  }
  return resolveBlock(text).map((line) => `${line}\n`).join("");
}

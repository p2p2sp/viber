/*
 * handoff-path.ts - the handoff-path core: names the file the handoff skill
 * writes, says whether it exists, on which branch the conversation stands and
 * whether the first argument word was taken as the path. The contract lives in
 * the header of ../handoff-path.ts.
 */

import type { Clock, Fs, Git } from "./ports.ts";
import { stampOf } from "./stamp.ts";

/** The whole stdout of one handoff-path call: four lines. Never throws. */
export function runHandoffPath(argv: string[], cwd: string, ports: { fs: Fs; git: Git; clock: Clock }): string {
  const here = cwd.replaceAll("\\", "/");
  // Outside a repository the cwd stands for the root.
  const root = (ports.git.repoRoot(here) ?? here).replace(/\/$/, "");
  const at = ports.clock.now();
  const stamp = Number.isNaN(at.getTime()) ? "unknown" : stampOf(at);

  let arg = (argv[0] ?? "").replace(/^[ \t\n\v\f\r]+/, "").replace(/[ \t\n\v\f\r]+$/, "");
  if (arg.length >= 2 && arg.startsWith('"') && arg.endsWith('"')) arg = arg.slice(1, -1);
  arg = arg.replaceAll("\\", "/");
  // Only a word that looks like a path names the target: any other opens the prompt.
  const named = arg.includes("/") || arg.endsWith(".md") || arg === ".";

  let target = `${root}/.temp/viber/handoff`;
  if (named) {
    if (arg.startsWith("/") || /^[A-Za-z]:/.test(arg)) {
      target = arg;
    } else {
      const rel = arg.startsWith("./") ? arg.slice(2) : arg;
      target = rel === "" || rel === "." ? root : `${root}/${rel}`;
    }
  }

  // The file is asked for as written: the system follows a link before a `..` after it.
  const isFile = target.endsWith(".md");
  const file = isFile ? target : `${target.replace(/\/$/, "")}/${stamp}_{slug}.md`;
  const exists = isFile && ports.fs.exists(file);
  return `FILE=${file}\nEXISTS=${exists}\nBRANCH=${ports.git.branch(here) ?? "none"}\nTARGET=${named ? "named" : "default"}\n`;
}

/*
 * map-answer.ts - what the two layer maps share (memory-map, rules-map): the
 * shape of an answer, the refused call, the project root and the file name of
 * a path. merge-settings takes the answer shape and the project root.
 */

import type { Git } from "./ports.ts";

export interface MapAnswer {
  stdout: string;
  stderr: string;
  exit: number;
}

/** A refused call: one error line on stderr, nothing on stdout, exit 2. */
export function fail(reason: string): MapAnswer {
  return { stdout: "", stderr: `error: ${reason}\n`, exit: 2 };
}

/** The lines on stdout, each ended by a line feed. */
export function answer(lines: string[], exit = 0): MapAnswer {
  return { stdout: lines.map((line) => `${line}\n`).join(""), stderr: "", exit };
}

/** The repository root holding cwd, cwd itself outside a repository: forward slashes, no trailing one, so `/` is empty. */
export function projectRoot(cwd: string, git: Pick<Git, "repoRoot">): string {
  const here = cwd.replaceAll("\\", "/");
  return (git.repoRoot(here) ?? here).replace(/\/$/, "");
}

/** The last segment of a path. */
export function baseOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

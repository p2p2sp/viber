/*
 * git.ts - the git command adapter of the Git port: runs `git` and maps its
 * output to the port's values; a failed command is the port's empty answer.
 */

import { execFileSync } from "node:child_process";
import type { Git } from "../ports.ts";

function run(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

export const gitCommand: Git = {
  repoRoot(cwd) {
    const out = run(cwd, ["rev-parse", "--show-toplevel"]);
    const root = out?.trim();
    return root ? root.replaceAll("\\", "/") : null;
  },
  branch(cwd) {
    const name = run(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"])?.trim();
    return name ? name : null;
  },
};

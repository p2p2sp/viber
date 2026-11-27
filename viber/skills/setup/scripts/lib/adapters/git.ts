/*
 * git.ts - the git command adapter of the Git port: runs `git` and maps its
 * output to the port's values; a failed command is the port's empty answer.
 */

import { execFileSync } from "node:child_process";
import type { Git } from "../ports.ts";

export const gitCommand: Git = {
  repoRoot(cwd) {
    try {
      const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      return root ? root.replaceAll("\\", "/") : null;
    } catch {
      return null;
    }
  },
};

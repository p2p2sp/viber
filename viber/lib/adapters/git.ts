/*
 * git.ts - the git command adapter of the Git port: runs `git` and maps its
 * output to the port's values; a failed command is the port's empty answer.
 */

import { execFileSync } from "node:child_process";
import type { Git, TrackedFile } from "../ports.ts";

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
  trackedFiles(root) {
    const out = run(root, ["ls-files", "-s", "-z"]);
    if (!out) return [];
    const files: TrackedFile[] = [];
    for (const entry of out.split("\0")) {
      const tab = entry.indexOf("\t");
      if (tab < 0) continue;
      files.push({ path: entry.slice(tab + 1), mode: entry.slice(0, entry.indexOf(" ")) });
    }
    return files;
  },
};

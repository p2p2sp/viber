/*
 * tree.ts - the adapter of the Tree port: git names the root and the files;
 * outside a repository the cwd is the root and the directory is walked.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { Tree } from "../ports.ts";

function git(cwd: string, args: string[]): string | null {
  try {
    // A large repository lists many paths: the default 1 MB buffer would cut the answer.
    return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return null;
  }
}

export const projectTree: Tree = {
  root(cwd) {
    const top = git(cwd, ["rev-parse", "--show-toplevel"])?.trim();
    return (top ? top : cwd).replaceAll("\\", "/").replace(/\/$/, "");
  },
  files(root) {
    const listed = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
    if (listed !== null) return listed.split("\0").filter((name) => name !== "");
    try {
      return fs
        .readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => `${entry.parentPath}/${entry.name}`.replaceAll("\\", "/").slice(root.length + 1))
        .filter((name) => !name.startsWith(".git/") && !name.includes("node_modules/"));
    } catch {
      return [];
    }
  },
};

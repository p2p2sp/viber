/*
 * tree.ts - the real Tree of a repository: its index and its working tree, read through the ports.
 */

import path from "node:path";
import type { Fs, Git } from "../../viber/lib/ports.ts";
import type { Tree } from "./engine.ts";

export function repoTree(fs: Fs, git: Git, root: string): Tree {
  return {
    files: git.trackedFiles(root),
    read: (p) => fs.readText(path.join(root, p)),
    list: (dir) => fs.listDir(path.join(root, dir)),
  };
}

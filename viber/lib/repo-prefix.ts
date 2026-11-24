/*
 * repo-prefix.ts - where a directory lies below the repository root, as the
 * text git puts before a path of that directory (tree-record for its cwd,
 * diff-files for the directory its paths are relative to).
 */

import type { Fs } from "./ports.ts";

/** A drive letter in lower case, so `C:/r` and `c:/r` name one root. */
function foldDrive(path: string): string {
  return /^[A-Za-z]:/.test(path) ? path[0].toLowerCase() + path.slice(1) : path;
}

/**
 * The path of dir below root, ending on a slash; empty for the root itself and
 * for a directory not below it. dir and root are absolute, forward slashes. The
 * directory is compared with its links resolved first, the way git names the
 * root, then as the text it is.
 */
export function repoPrefix(dir: string, root: string, fs: Pick<Fs, "realPath">): string {
  const top = foldDrive(root.replace(/\/$/, ""));
  for (const candidate of [fs.realPath(dir), dir]) {
    if (candidate === null) continue;
    const here = foldDrive(candidate.replace(/\/$/, ""));
    if (here === top) return "";
    if (here.startsWith(`${top}/`)) return `${here.slice(top.length + 1)}/`;
  }
  return "";
}

/*
 * root-relative.ts - an absolute path as its form below a root (archive-run for
 * its run directory, plan-index for its plan and the lines of an extras file).
 */

import type { Fs } from "./ports.ts";
import { repoPrefix } from "./repo-prefix.ts";

/**
 * The absolute path below root as its relative form, the links above its last
 * name resolved, and those of the whole path when it is a directory; any other
 * path as it is. Both are forward slashes, root with its links resolved; a path
 * whose directory does not exist is read as the text it is.
 */
export function rootRelative(path: string, root: string, fs: Pick<Fs, "kind" | "realPath">): string {
  if (!/^(\/|[A-Za-z]:\/)/.test(path)) return path;
  if (fs.kind(path) === "dir") return repoPrefix(path, root, fs).replace(/\/$/, "") || path;
  const cut = path.lastIndexOf("/") + 1;
  const parent = fs.realPath(path.slice(0, cut)) ?? path.slice(0, cut);
  // Below the root as text: the last name is never followed.
  return repoPrefix(`${parent.replace(/\/$/, "")}/${path.slice(cut)}`, root, { realPath: () => null }).replace(/\/$/, "") || path;
}

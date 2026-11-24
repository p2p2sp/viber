/*
 * ports.ts - the outside world as the Node core sees it: a file system and git.
 * The core imports these types only; an adapter implements each against the
 * real dependency and a fake in tests/harness/fakes.ts implements it in memory,
 * both held to the same contract cases.
 */

export interface Fs {
  /** The file's text as UTF-8; null when the path is absent, a directory or unreadable. */
  readText(path: string): string | null;
  /** True for an existing file or directory. */
  exists(path: string): boolean;
  /** The entry names of a directory, sorted; empty when the path is absent or not a directory. */
  listDir(path: string): string[];
}

/** path: repo-relative, forward slashes. mode: as the index holds it, "100644" or "100755". */
export interface TrackedFile {
  path: string;
  mode: string;
}

export interface Git {
  /** The top level of the work tree holding cwd, forward slashes; null outside a repository. */
  repoRoot(cwd: string): string | null;
  /** Every file in the index of the repository at root, in index order. */
  trackedFiles(root: string): TrackedFile[];
}

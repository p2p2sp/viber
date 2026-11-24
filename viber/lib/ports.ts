/*
 * ports.ts - the outside world as the Node core sees it: a file system, git and
 * a clock. The core imports these types only; an adapter implements each against
 * the real dependency and a fake in tests/harness/fakes.ts implements it in
 * memory, both held to the same contract cases.
 */

export interface Fs {
  /** The file's text as UTF-8; null when the path is absent, a directory or unreadable. */
  readText(path: string): string | null;
  /** The file's bytes, undecoded; null when the path is absent, a directory or unreadable. */
  readBytes(path: string): Uint8Array | null;
  /** True for an existing file or directory. */
  exists(path: string): boolean;
  /** "file" for a regular file, "dir" for a directory, a symlink followed; null for an absent path or any other kind. */
  kind(path: string): "file" | "dir" | null;
  /** The path with every symlink resolved, absolute, forward slashes; null when it does not exist. */
  realPath(path: string): string | null;
  /** The entry names of a directory, sorted; empty when the path is absent or not a directory. */
  listDir(path: string): string[];
  /** Creates the directory and every missing parent; true when it exists afterwards, false when it cannot. */
  makeDir(path: string): boolean;
  /** Replaces the file's content by exactly these bytes, creating it in an existing directory; false when it cannot, the file then left as it was. */
  writeBytes(path: string, bytes: Uint8Array): boolean;
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
  /** The short name of the branch HEAD stands on, a branch with no commit yet included; null on a detached HEAD or outside a repository. */
  branch(cwd: string): string | null;
}

export interface Clock {
  /** The present instant; the core reads its local-time fields. */
  now(): Date;
}

/*
 * ports.ts - the outside world as the merge-settings core sees it: a file
 * system and git. The core imports these types only; an adapter implements
 * each against the real dependency.
 */

export interface Fs {
  /** The file's text as UTF-8; null when the path is absent, a directory or unreadable. */
  readText(path: string): string | null;
  /** The file's bytes, undecoded; null when the path is absent, a directory or unreadable. */
  readBytes(path: string): Uint8Array | null;
  /** "file" for a regular file, "dir" for a directory, a symlink followed; null for an absent path or any other kind. */
  kind(path: string): "file" | "dir" | null;
  /** Creates the directory and every missing parent; true when it exists afterwards, false when it cannot. */
  makeDir(path: string): boolean;
  /** Replaces the file's content by exactly these bytes, creating it in an existing directory; false when it cannot, the file then left as it was. */
  writeBytes(path: string, bytes: Uint8Array): boolean;
  /** Moves the file at from to the path to in one step, a file standing there replaced whole; false when it cannot (from absent or a directory, to a directory or in an absent one), both then left as they were. */
  replace(from: string, to: string): boolean;
  /** Removes the file at the path, a link itself and never what it names; true when no file is left there, an absent path included, false for a directory or a file that cannot be removed. */
  remove(path: string): boolean;
}

export interface Git {
  /** The top level of the work tree holding cwd, forward slashes; null outside a repository. */
  repoRoot(cwd: string): string | null;
}

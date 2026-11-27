/*
 * ports.ts - the outside world as the skill lint core sees it: a file system,
 * read only. The core imports this type only; an adapter implements it against
 * the real dependency.
 */

export interface Fs {
  /** The file's text as UTF-8; null when the path is absent, a directory or unreadable. */
  readText(path: string): string | null;
  /** "file" for a regular file, "dir" for a directory, a symlink followed; null for an absent path or any other kind. */
  kind(path: string): "file" | "dir" | null;
  /** The path with every symlink resolved, absolute, forward slashes; null when it does not exist. */
  realPath(path: string): string | null;
  /** The entry names of a directory, sorted; empty when the path is absent or not a directory. */
  listDir(path: string): string[];
  /** True when this account may run the file as a program: a file carrying an exec bit, and every existing file on a system that keeps no such bit (Windows). False for an absent path. */
  executable(path: string): boolean;
}

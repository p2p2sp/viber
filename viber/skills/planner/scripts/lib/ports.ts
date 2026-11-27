/*
 * ports.ts - the outside world as the plan core sees it: a file system, the
 * project tree and a clock. The core imports these types only; an adapter
 * implements each against the real dependency.
 */

export interface Fs {
  /** The file's text as UTF-8; null when the path is absent, a directory or unreadable. */
  readText(path: string): string | null;
  /** Writes the text, creating the parent directories; false when the write failed. */
  writeText(path: string, text: string): boolean;
  /** The names of the files directly in the directory, sorted; none when it is absent. */
  list(dir: string): string[];
  /** Removes the file or the whole directory; an absent path is done already. */
  remove(path: string): void;
}

export interface Clock {
  /** The present instant; the core reads its local-time fields. */
  now(): Date;
}

export interface Tree {
  /** The top level of the work tree holding cwd, forward slashes; the cwd itself outside a repository. */
  root(cwd: string): string;
  /** Every file under root as a root-relative path with forward slashes: tracked and untracked, ignored ones left out. */
  files(root: string): string[];
}

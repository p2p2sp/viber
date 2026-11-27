/*
 * ports.ts - the outside world as the build core sees it: a file system, git
 * and gh. The core imports these types only; an adapter implements each against
 * the real dependency. The project tree is the planner's Tree port.
 */

export interface Fs {
  /** The file's text as UTF-8; null when the path is absent, a directory or unreadable. */
  readText(path: string): string | null;
  /** Writes the text, creating the parent directories; false when the write failed. */
  writeText(path: string, text: string): boolean;
  /** True for an existing file or directory. */
  exists(path: string): boolean;
  /** Removes the file or the whole directory; an absent path is done already. */
  remove(path: string): void;
  /** Removes the directory only when it holds no entry; a non-empty, absent or non-directory path is left as it is. */
  removeEmptyDir(dir: string): void;
  /** Renames a file or directory, creating the parent of the new place; false when it failed. */
  move(from: string, to: string): boolean;
  /** Takes the lock directory, waiting up to waitMs for a living holder to leave it; a lock whose holder is gone is taken over. False when the wait ran out. */
  lock(dir: string, waitMs: number): boolean;
  /** Leaves the lock directory. */
  unlock(dir: string): void;
}

/** One commit asked of git: made, nothing to commit, or refused with what git and its hooks printed. */
export type Committed = { kind: "done"; sha: string } | { kind: "none" } | { kind: "refused"; output: string };

/** Every path is repo-relative with forward slashes and read literally, never as a glob. */
export interface Git {
  /** The full sha of HEAD; null outside a repository or on a branch with no commit yet. */
  head(root: string): string | null;
  /** True when the index holds a file at or below the path. */
  holds(root: string, path: string): boolean;
  /** The work tree against HEAD at and below the paths as one patch, new and deleted files included. The index stays as it is. */
  diff(root: string, paths: string[]): string;
  /** The files at and below the paths that differ from HEAD, untracked ones included. */
  dirty(root: string, paths: string[]): string[];
  /** The byte size of the file at the path in HEAD; null when HEAD lacks it or holds no file there. */
  sizeAtHead(root: string, path: string): number | null;
  /** Puts the paths back to HEAD in the work tree and leaves the index as it is: a file HEAD holds is restored, a file HEAD lacks is removed. False when a path could not be restored. */
  restore(root: string, paths: string[]): boolean;
  /** `git diff --name-status <base> HEAD`: one `<status>\t<path>` line per file, both paths of a rename, each path unquoted. Null when git cannot read it, as for a base the repository lacks. */
  changes(root: string, base: string): string | null;
  /** One `<short sha> <subject>` line per commit after base, the newest first. Null when git cannot read it, as for a base the repository lacks. */
  log(root: string, base: string): string | null;
  /** Stages the paths and commits them alone, hooks running as on any commit. A path neither on disk nor in the index is left out. */
  commit(root: string, message: string, paths: string[]): Committed;
}

/** What one gh call answered: its exit, 127 when gh could not be started, and what it printed. */
export interface GhDone {
  exit: number;
  out: string;
  err: string;
}

/** The GitHub command line tool. */
export interface Gh {
  /** Runs `gh <args>` in root, its standard input closed. */
  run(root: string, args: string[]): GhDone;
}

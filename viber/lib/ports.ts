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
  /** True when this account may run the file as a program: a file carrying an exec bit, and every existing file on a system that keeps no such bit (Windows). False for an absent path. */
  executable(path: string): boolean;
  /** Creates the directory and every missing parent; true when it exists afterwards, false when it cannot. */
  makeDir(path: string): boolean;
  /** Replaces the file's content by exactly these bytes, creating it in an existing directory; false when it cannot, the file then left as it was. */
  writeBytes(path: string, bytes: Uint8Array): boolean;
  /** Adds the bytes at the end of the file, what it holds left untouched, creating it in an existing directory; false when it cannot. */
  appendBytes(path: string, bytes: Uint8Array): boolean;
  /** Removes the file at the path, a link itself and never what it names; true when no file is left there, an absent path included, false for a directory or a file that cannot be removed. */
  remove(path: string): boolean;
  /** Removes the directory at the path when it holds nothing; false for one holding an entry, a file, a link to a directory and an absent path, each left as it was. */
  removeEmptyDir(path: string): boolean;
}

/** path: repo-relative, forward slashes. mode: as the index holds it, "100644" or "100755". */
export interface TrackedFile {
  path: string;
  mode: string;
}

/** code: the two letters `git status --porcelain` gives the path, "??" for an untracked file. path: repo-relative, forward slashes, as it is, never quoted; the new path of a rename. */
export interface StatusEntry {
  code: string;
  path: string;
}

/** status: the letter `git diff --name-status` gives the path (A, M, D, T, R, C, U). path: repo-relative, forward slashes, as it is, never quoted; the new path of a rename or copy. */
export interface ChangedFile {
  status: string;
  path: string;
}

/** path: repo-relative, forward slashes, as it is, never quoted. line: counted from 1. text: the whole line without its line feed. */
export interface GrepHit {
  path: string;
  line: number;
  text: string;
}

export interface Git {
  /** The top level of the work tree holding cwd, forward slashes; null outside a repository. */
  repoRoot(cwd: string): string | null;
  /** Every file in the index of the repository at root, in index order. */
  trackedFiles(root: string): TrackedFile[];
  /** The short name of the branch HEAD stands on, a branch with no commit yet included; null on a detached HEAD or outside a repository. */
  branch(cwd: string): string | null;
  /** The full sha of the commit a ref names (a sha, a branch, a tag, HEAD, a `~` form); null when it names no commit, a branch with no commit yet included. */
  commit(root: string, ref: string): string | null;
  /** The full name of the ref a symbolic ref points at (`refs/heads/main` for HEAD, a branch with no commit yet included); null for a detached HEAD and for a name that is no symbolic ref. */
  symbolicRef(root: string, name: string): string | null;
  /** The full sha of the best common ancestor of two commits; null when they share none or one names no commit. */
  mergeBase(root: string, a: string, b: string): string | null;
  /** The full sha of the oldest commit in the history of HEAD that added the file at path, read as a literal path (never a glob), repo-relative or absolute; null when none did. */
  firstAdded(root: string, path: string): string | null;
  /** The files that differ between the commit base names and the work tree at the top level root, staged or not, in git order; base null: every tracked file present in the work tree, as added. Empty when base names no commit. */
  changedFiles(root: string, base: string | null): ChangedFile[];
  /** The files below the top level root that git neither tracks nor ignores, an untracked directory file by file, in git order. */
  untrackedFiles(root: string): string[];
  /** One entry per path `git status` reports at the top level root: staged, unstaged or untracked (an untracked directory file by file), an ignored one left out, in git order. */
  status(root: string): StatusEntry[];
  /** The lines holding one of the terms as a fixed string, with word true only as a whole word, in the text files of the work tree at the top level root: tracked or untracked, an ignored and a binary file left out, in git order. Empty with no term and outside a repository. */
  grep(root: string, terms: string[], word: boolean): GrepHit[];
}

export interface Clock {
  /** The present instant; the core reads its local-time fields. */
  now(): Date;
}

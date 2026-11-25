/*
 * ports.ts - the outside world as the Node core sees it: a file system, git
 * (its reads and its writes apart) and a clock. The core imports these types only; an adapter implements each against
 * the real dependency and a fake in tests/harness/fakes.ts implements it in
 * memory, both held to the same contract cases.
 */

export interface Fs {
  /** The file's text as UTF-8; null when the path is absent, a directory or unreadable. */
  readText(path: string): string | null;
  /** The file's bytes, undecoded; null when the path is absent, a directory or unreadable. */
  readBytes(path: string): Uint8Array | null;
  /** The size of a file in bytes, its content never read and a link followed; null for an absent path and for anything but a file. */
  size(path: string): number | null;
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
  /** True when the path itself is a link, whatever it names and whether that exists; false for anything else and for an absent path. */
  isLink(path: string): boolean;
  /** Gives the file its exec bit or takes it, the umask kept, a link followed; false when it cannot (an absent path). Changes nothing on a system that keeps no such bit (Windows). */
  setExecutable(path: string, on: boolean): boolean;
  /** Creates the directory and every missing parent; true when it exists afterwards, false when it cannot. */
  makeDir(path: string): boolean;
  /** Replaces the file's content by exactly these bytes, creating it in an existing directory; false when it cannot, the file then left as it was. */
  writeBytes(path: string, bytes: Uint8Array): boolean;
  /** Adds the bytes at the end of the file, what it holds left untouched, creating it in an existing directory; false when it cannot. */
  appendBytes(path: string, bytes: Uint8Array): boolean;
  /** Moves the file at from to the path to in one step, a file standing there replaced whole; false when it cannot (from absent or a directory, to a directory or in an absent one), both then left as they were. */
  replace(from: string, to: string): boolean;
  /** Moves the file, the directory with all it holds or the link itself at from to the path to; false when it cannot (from absent, something standing at to, the directory of to absent), both then left as they were. */
  move(from: string, to: string): boolean;
  /** Removes the file, the link itself or the directory with everything below it, no link followed; true when nothing is left at the path, an absent one included. */
  removeTree(path: string): boolean;
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

/** What the index holds against HEAD. from: the mode HEAD holds ("000000" for a new file). mode: the mode the index holds ("000000" for a deletion). path: repo-relative, forward slashes, as it is, never quoted. */
export interface StagedFile {
  path: string;
  from: string;
  mode: string;
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
  /** True for a directory of a repository, a bare one and a directory inside `.git` included. */
  isRepository(cwd: string): boolean;
  /** Every file in the index of the repository at root, in index order. */
  trackedFiles(root: string): TrackedFile[];
  /** The short name of the branch HEAD stands on, a branch with no commit yet included; null on a detached HEAD or outside a repository. */
  branch(cwd: string): string | null;
  /** The full sha of the commit a ref names (a sha, a branch, a tag, HEAD, a `~` form); null when it names no commit, a branch with no commit yet included. */
  commit(root: string, ref: string): string | null;
  /** The abbreviated sha of the commit a ref names, as git shortens it; null when it names none. */
  shortCommit(root: string, ref: string): string | null;
  /** True when the index holds the file at path or one below it, read as a literal path, repo-relative or absolute. */
  indexHolds(root: string, path: string): boolean;
  /** The same for the commit HEAD names; false on a branch with no commit yet. */
  headHolds(root: string, path: string): boolean;
  /** The files the index holds otherwise than HEAD, a rename as its deletion and its addition, in git order: all of them (paths null) or those at and below the literal paths. On a branch with no commit yet every indexed file is new. null when git cannot tell. */
  stagedFiles(root: string, paths: string[] | null): StagedFile[] | null;
  /** What git prints for a person, its error text in front, the empty string when it prints nothing: the last ten commits a line each (log), the short status with every untracked file (status), the diff against HEAD, or against nothing on a branch with no commit yet, as totals (stat) or whole (diff). paths null: everything; else what lies at and below the literal paths (log ignores it). */
  report(root: string, kind: "log" | "status" | "stat" | "diff", paths: string[] | null): string;
  /** The full name of the ref a symbolic ref points at (`refs/heads/main` for HEAD, a branch with no commit yet included); null for a detached HEAD and for a name that is no symbolic ref. */
  symbolicRef(root: string, name: string): string | null;
  /** The full sha of the best common ancestor of two commits; null when they share none or one names no commit. */
  mergeBase(root: string, a: string, b: string): string | null;
  /** The full sha of the oldest commit in the history of HEAD that added the file at path, read as a literal path (never a glob), repo-relative or absolute; null when none did. */
  firstAdded(root: string, path: string): string | null;
  /** The files that differ between the commit base names and the work tree at the top level root, staged or not, in git order; base null: every tracked file present in the work tree, as added. Empty when base names no commit. */
  changedFiles(root: string, base: string | null): ChangedFile[];
  /** The files below the top level root that git neither tracks nor ignores, an untracked directory file by file, in git order; with path only those at and below that literal path. */
  untrackedFiles(root: string, path?: string): string[];
  /** The tracked files the ignore rules of the repository at the top level root exclude all the same, in index order; empty outside a repository. */
  trackedIgnored(root: string): string[];
  /** True when those ignore rules exclude the repo-relative path, whether the index holds it or not and whether it exists or not, read as a literal path; false outside a repository. */
  ignored(root: string, path: string): boolean;
  /** One entry per path `git status` reports at the top level root: staged, unstaged or untracked (an untracked directory file by file), an ignored one left out, in git order. */
  status(root: string): StatusEntry[];
  /** The lines holding one of the terms as a fixed string, with word true only as a whole word, in the text files of the work tree at the top level root: tracked or untracked, an ignored and a binary file left out, in git order. Empty with no term and outside a repository. */
  grep(root: string, terms: string[], word: boolean): GrepHit[];
}

/**
 * The git commands that change a repository. A number is git's exit status, 0
 * for done. What git prints goes to the standard error of the process as it
 * comes, hooks and signing run as on any git call, and every path is a literal
 * one, never a glob.
 */
export interface GitWrite {
  /** Stages what changed, deletions included, in the tracked files at and below path, ignore rules or not; nothing new. Not 0 when git tracks nothing there. */
  stageTracked(root: string, path: string): number;
  /** Stages the files at and below the paths. Not 0 when nothing stands at one of them or an ignore rule covers one named itself. */
  stage(root: string, paths: string[]): number;
  /** Stages every change: modified, new (ignored ones left out) and deleted; with path only those at and below it. */
  stageAll(root: string, path: string | null): number;
  /** Commits the index: all of it (paths null), or only the index entries at and below the paths, a path absent from the index as its deletion. The second goes through a private index, so whatever else is staged stays staged, out of the commit. Not 0 when there is nothing to commit or a hook refuses; HEAD and the index are then as they were. quiet: no summary of the commit. */
  commit(root: string, message: string, paths: string[] | null, quiet: boolean): number;
  /** Moves a tracked file or directory to the path to, on disk and in the index, edits not staged kept. Not 0 with nothing moved when git tracks nothing at from. */
  move(root: string, from: string, to: string): number;
  /** Removes the tracked files at and below path from the index and from disk, changed ones included; untracked ones stay. 0 when git tracks nothing there. */
  removeTracked(root: string, path: string): number;
  /** Checks HEAD out detached in a new linked worktree at the absolute path. output: what git printed, for the caller to relay. The exit is a failing post-checkout hook's too, so the worktree may stand all the same. */
  addWorktree(root: string, path: string): GitOutcome;
  /** Removes a linked worktree with the changes and untracked files it holds. Not 0 when none is registered at the path. */
  removeWorktree(root: string, path: string): GitOutcome;
  /** Forgets the linked worktrees whose directory is gone. */
  pruneWorktrees(root: string): void;
}

export interface GitOutcome {
  exit: number;
  output: string;
}

export interface Clock {
  /** The present instant; the core reads its local-time fields. */
  now(): Date;
}

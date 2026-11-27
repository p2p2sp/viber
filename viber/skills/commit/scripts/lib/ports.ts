/*
 * ports.ts - the outside world as the commit core sees it: a file system and
 * git, its reads and its writes apart. The core imports these types only; an
 * adapter implements each against the real dependency.
 */

export interface Fs {
  /** True for an existing file or directory. */
  exists(path: string): boolean;
  /** "file" for a regular file, "dir" for a directory, a symlink followed; null for an absent path or any other kind. */
  kind(path: string): "file" | "dir" | null;
  /** The path with every symlink resolved, absolute, forward slashes; null when it does not exist. */
  realPath(path: string): string | null;
  /** True when this account may run the file as a program: a file carrying an exec bit, and every existing file on a system that keeps no such bit (Windows). False for an absent path. */
  executable(path: string): boolean;
  /** True when the path itself is a link, whatever it names and whether that exists; false for anything else and for an absent path. */
  isLink(path: string): boolean;
  /** Gives the file its exec bit or takes it, the umask kept, a link followed; false when it cannot (an absent path). Changes nothing on a system that keeps no such bit (Windows). */
  setExecutable(path: string, on: boolean): boolean;
}

/** What the index holds against HEAD. from: the mode HEAD holds ("000000" for a new file). mode: the mode the index holds ("000000" for a deletion). path: repo-relative, forward slashes, as it is, never quoted. */
export interface StagedFile {
  path: string;
  from: string;
  mode: string;
}

export interface Git {
  /** The top level of the work tree holding cwd, forward slashes; null outside a repository. */
  repoRoot(cwd: string): string | null;
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
  /** The files below the top level root that git neither tracks nor ignores, an untracked directory file by file, in git order; with path only those at and below that literal path. */
  untrackedFiles(root: string, path?: string): string[];
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
}

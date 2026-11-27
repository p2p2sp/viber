/*
 * ports.ts - the outside world as the handoff-path core sees it: a file
 * system, git and a clock. The core imports these types only; an adapter
 * implements each against the real dependency.
 */

export interface Fs {
  /** True for an existing file or directory. */
  exists(path: string): boolean;
}

export interface Git {
  /** The top level of the work tree holding cwd, forward slashes; null outside a repository. */
  repoRoot(cwd: string): string | null;
  /** The short name of the branch HEAD stands on, a branch with no commit yet included; null on a detached HEAD or outside a repository. */
  branch(cwd: string): string | null;
}

export interface Clock {
  /** The present instant; the core reads its local-time fields. */
  now(): Date;
}

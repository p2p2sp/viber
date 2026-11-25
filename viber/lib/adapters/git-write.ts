/*
 * git-write.ts - the git command adapter of the GitWrite port: runs the git
 * commands that change a repository, their output relayed on standard error as
 * it comes, and answers their exit status.
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import type { GitOutcome, GitWrite } from "../ports.ts";
import { pathChunks } from "./path-chunks.ts";

/** Every pathspec is one exact path: git otherwise reads "*", "?" and "[...]" as a glob, and app/[id]/page.tsx would take app/i/page.tsx with it. An environment entry reaches the hooks too. */
const literal = (): NodeJS.ProcessEnv => ({ ...process.env, GIT_LITERAL_PATHSPECS: "1" });

/** 127 when git could not be started, 1 when a signal ended it. */
const statusOf = (done: SpawnSyncReturns<unknown>): number => done.status ?? (done.error === undefined ? 1 : 127);

function act(root: string, args: string[], env: NodeJS.ProcessEnv = literal(), input?: Uint8Array): number {
  // Standard input stays the caller's: a hook or a signing program may ask on it.
  return statusOf(spawnSync("git", args, { cwd: root, env, input, stdio: [input === undefined ? "inherit" : "pipe", 2, 2] }));
}

/** One call per chunk of the paths, the first failing status ending the row. */
function actOver(root: string, args: string[], paths: string[], env?: NodeJS.ProcessEnv): number {
  for (const chunk of pathChunks(paths)) {
    const exit = act(root, [...args, "--", ...chunk], env);
    if (exit !== 0) return exit;
  }
  return 0;
}

/** Standard output as bytes: an index entry goes back to git with its path undecoded. */
function read(root: string, args: string[]): { exit: number; out: Uint8Array } {
  const done = spawnSync("git", args, { cwd: root, env: literal(), stdio: ["ignore", "pipe", 2], maxBuffer: 1 << 28 });
  return { exit: statusOf(done), out: done.stdout ?? new Uint8Array(0) };
}

/**
 * A temporary index starts from HEAD, takes each named path's entry from the
 * real index (a staged deletion is its absence there) and the commit runs on it
 * with no pathspec; the real index already holds those entries. Not
 * "git commit -- <paths>": that re-reads each path from the work tree and, under
 * core.fileMode=false (every Windows checkout), takes the mode from HEAD, so a
 * staged exec bit was dropped.
 */
function commitNamed(root: string, commit: string[], paths: string[]): number {
  const dir = read(root, ["rev-parse", "--absolute-git-dir"]);
  if (dir.exit !== 0) return dir.exit;
  const index = `${new TextDecoder().decode(dir.out).trim()}/index.viber-commit.${process.pid}`;
  const env = { ...literal(), GIT_INDEX_FILE: index };
  try {
    fs.rmSync(index, { force: true });
    const born = read(root, ["rev-parse", "--quiet", "--verify", "HEAD"]).exit === 0;
    let exit = act(root, ["read-tree", born ? "HEAD" : "--empty"], env);
    if (exit === 0) exit = actOver(root, ["rm", "-r", "-q", "--cached", "--ignore-unmatch"], paths, env);
    for (const chunk of pathChunks(paths)) {
      if (exit !== 0) return exit;
      // --full-name: update-index reads every path as root-relative, whatever the cwd.
      const entries = read(root, ["ls-files", "-s", "-z", "--full-name", "--", ...chunk]);
      exit = entries.exit !== 0 ? entries.exit : act(root, ["update-index", "-z", "--index-info"], env, entries.out);
    }
    return exit !== 0 ? exit : act(root, commit, env);
  } finally {
    fs.rmSync(index, { force: true });
  }
}

/** For the worktree calls, which carry no pathspec: no environment entry of their own, the output handed to the caller. */
function capture(root: string, args: string[]): GitOutcome {
  const done = spawnSync("git", args, { cwd: root, encoding: "utf-8", stdio: ["inherit", "pipe", "pipe"], maxBuffer: 1 << 28 });
  return { exit: statusOf(done), output: `${done.stderr ?? ""}${done.stdout ?? ""}` };
}

export const gitWriteCommand: GitWrite = {
  stageTracked(root, path) {
    return act(root, ["add", "-u", "--", path]);
  },
  stage(root, paths) {
    return actOver(root, ["add"], paths);
  },
  stageAll(root, path) {
    return act(root, path === null ? ["add", "-A"] : ["add", "-A", "--", path]);
  },
  commit(root, message, paths, quiet) {
    const args = ["commit", ...(quiet ? ["-q"] : []), "-m", message];
    return paths === null ? act(root, args) : commitNamed(root, args, paths);
  },
  move(root, from, to) {
    return act(root, ["mv", "--", from, to]);
  },
  removeTracked(root, path) {
    return act(root, ["rm", "-r", "-f", "-q", "--ignore-unmatch", "--", path]);
  },
  addWorktree(root, path) {
    return capture(root, ["worktree", "add", "--detach", path, "HEAD"]);
  },
  removeWorktree(root, path) {
    return capture(root, ["worktree", "remove", "--force", path]);
  },
  pruneWorktrees(root) {
    capture(root, ["worktree", "prune"]);
  },
};

/*
 * tmp.ts - throwaway temp dirs and throwaway git repos for tests that must
 * not touch the developer's real HOME/~/.gitconfig or this repo's working
 * tree.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runScript, type RunResult } from "./run.ts";

/** Creates a `mkdtemp`'d dir under the OS temp root, hands it to `fn`, and
 *  removes it (recursively, ignoring already-gone/read-only files, retrying
 *  on a busy or refilled dir) once `fn` settles, whether it resolves or
 *  throws. The dir is handed over by its real path: the OS temp root can be
 *  an alias (a Windows 8.3 short name such as `RUNNER~1`, the macOS `/var`
 *  symlink), while a script under test prints the path the OS resolves it
 *  to, so an expectation built from the alias would never match. */
export async function withTempDir<T>(prefix: string, fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

export interface GitRepo {
  dir: string;
  env: Record<string, string>;
  git(...args: string[]): Promise<RunResult>;
}

export interface WithGitRepoOpts {
  bare?: boolean;
}

const GIT_CONFIG_NAME = ".gitconfig-global";

/** The isolated identity every repo call runs under, rooted at `dir`. */
function gitEnv(dir: string): Record<string, string> {
  return {
    HOME: dir,
    USERPROFILE: dir,
    GIT_CONFIG_GLOBAL: path.join(dir, GIT_CONFIG_NAME),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "P2P2 Test",
    GIT_AUTHOR_EMAIL: "test@p2p2.invalid",
    GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
    GIT_COMMITTER_NAME: "P2P2 Test",
    GIT_COMMITTER_EMAIL: "test@p2p2.invalid",
    GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
  };
}

// Written as a file rather than through `git config --global` calls: a
// spawned process is the most expensive thing the suite does.
function writeGitConfig(dir: string, env: Record<string, string>): void {
  fs.writeFileSync(
    path.join(dir, GIT_CONFIG_NAME),
    [
      "[user]",
      `\tname = ${env.GIT_AUTHOR_NAME}`,
      `\temail = ${env.GIT_AUTHOR_EMAIL}`,
      "[commit]",
      "\tgpgsign = false",
      "[init]",
      "\tdefaultBranch = main",
      // A commit spawns auto maintenance, detached since git 2.47: it can
      // still be writing into .git while the temp dir is being removed.
      "[maintenance]",
      "\tauto = false",
      "[gc]",
      "\tauto = 0",
      "",
    ].join("\n"),
  );
}

/* One `git init` per process and kind: every later repo is a plain file copy
 * of it, so a test pays no spawn for its repo. Cached as a promise, so
 * concurrent cases share one init; removed when the process exits. */
const templates = new Map<string, Promise<string>>();
const templateRoots: string[] = [];

function templateRepo(bare: boolean): Promise<string> {
  const key = bare ? "bare" : "work";
  let template = templates.get(key);
  if (!template) {
    template = makeTemplate(bare);
    templates.set(key, template);
  }
  return template;
}

async function makeTemplate(bare: boolean): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p2p2-gittpl-"));
  if (templateRoots.length === 0) {
    process.on("exit", () => {
      for (const dir of templateRoots) fs.rmSync(dir, { recursive: true, force: true });
    });
  }
  templateRoots.push(root);
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  const env = gitEnv(root);
  writeGitConfig(root, env);
  const init = await runScript("git", bare ? ["init", "--bare", "."] : ["init", "."], { cwd: repo, env });
  if (init.status !== 0) {
    throw new Error(`withGitRepo: git init failed (status ${init.status}): ${init.stderr}`);
  }
  const hooks = path.join(repo, bare ? "hooks" : ".git/hooks");
  fs.rmSync(hooks, { recursive: true, force: true });
  return repo;
}

/** Creates a throwaway git repo in a temp dir with an isolated identity: a
 *  pinned `HOME`/`USERPROFILE`, `GIT_CONFIG_GLOBAL` pointed at a config file
 *  in that same temp dir, `GIT_CONFIG_NOSYSTEM=1`, and fixed author/committer
 *  name/email/date - so no test call ever reads or writes the developer's
 *  real `~/.gitconfig`. The repo is a copy of a per-process template made by
 *  one real `git init`. */
export async function withGitRepo<T>(
  fn: (repo: GitRepo) => T | Promise<T>,
  opts: WithGitRepoOpts = {},
): Promise<T> {
  const template = await templateRepo(opts.bare ?? false);
  return withTempDir("p2p2-git-", (dir) => {
    const env = gitEnv(dir);
    function git(...args: string[]): Promise<RunResult> {
      return runScript("git", args, { cwd: dir, env });
    }
    fs.cpSync(template, dir, { recursive: true });
    writeGitConfig(dir, env);
    return fn({ dir, env, git });
  });
}

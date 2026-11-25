/*
 * scene.ts - writes SCENE_STATE into one throwaway git repository per test
 * process, for the integration files of the real adapters. The repository and
 * the outside directory are read-only by contract: a case never writes into
 * them, so sharing them costs no isolation. The scratch directory beside them
 * is the one place a contract case writes, each under a directory of its own
 * name. The repository has no commit, so its HEAD stands on an unborn branch; a
 * second repository beside it, read-only by the same contract, holds
 * HISTORY_STATE: three commits, a detached HEAD and a changed work tree. A case
 * that writes through git takes a throwaway repository of WRITE_STATE, copied from
 * a template built once per process.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gitCommand } from "../../viber/lib/adapters/git.ts";
import { gitWriteCommand } from "../../viber/lib/adapters/git-write.ts";
import { nodeFs } from "../../viber/lib/adapters/fs.ts";
import { HISTORY_STATE, SCENE_STATE, WRITE_STATE, type Throwaway, type ThrowawayOpts } from "./ports-contract.ts";

interface Scene {
  root: string;
  outside: string;
  scratch: string;
  history: string;
  linked: boolean;
  execBits: boolean;
}

/** Writes each text below dir and removes each path given as null. */
function apply(dir: string, files: Record<string, string | null>): void {
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) {
      fs.rmSync(`${dir}/${rel}`);
    } else {
      fs.mkdirSync(path.dirname(`${dir}/${rel}`), { recursive: true });
      fs.writeFileSync(`${dir}/${rel}`, text);
    }
  }
}

let scene: Scene | null = null;

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    // stderr is piped so a failing git names its reason in the thrown error.
    stdio: ["ignore", "ignore", "pipe"],
    env: {
      ...process.env,
      HOME: cwd,
      USERPROFILE: cwd,
      // A path of no file: git on Windows dies on the null device (`\\.\nul`).
      GIT_CONFIG_GLOBAL: path.join(path.dirname(cwd), ".gitconfig-global"),
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
}

/** outside: a directory in no repository. scratch: an empty directory in no repository, for the writing contract cases. history: the repository of HISTORY_STATE, on a detached HEAD. linked: false when this account cannot create the directory links of SCENE_STATE. execBits: false when the system runs a file given no exec bit (Windows). */
export function sharedScene(): Scene {
  if (scene) return scene;
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "p2p2-scene-")));
  const root = `${base}/repo`.replaceAll("\\", "/");
  const outside = `${base}/outside`.replaceAll("\\", "/");
  const scratch = `${base}/scratch`.replaceAll("\\", "/");
  const history = `${base}/history`.replaceAll("\\", "/");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.mkdirSync(scratch);
  fs.mkdirSync(history);
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "core.autocrlf", "false"]);
  git(root, ["config", "core.fileMode", "true"]);
  for (const [rel, text] of Object.entries(SCENE_STATE.files)) {
    fs.mkdirSync(path.dirname(`${root}/${rel}`), { recursive: true });
    fs.writeFileSync(`${root}/${rel}`, text);
  }
  const tracked = Object.keys(SCENE_STATE.files).filter((rel) => !SCENE_STATE.untracked.includes(rel));
  git(root, ["add", "--", ...tracked]);
  for (const rel of SCENE_STATE.exec) {
    git(root, ["update-index", "--chmod=+x", "--", rel]);
    fs.chmodSync(`${root}/${rel}`, 0o755);
  }
  // One real attempt, never the platform name: a file given no exec bit is refused where the system keeps such bits.
  let execBits = false;
  try {
    fs.accessSync(`${root}/README.md`, fs.constants.X_OK);
  } catch {
    execBits = true;
  }
  let linked = true;
  for (const [rel, target] of Object.entries(SCENE_STATE.links)) {
    try {
      // A junction on Windows, which needs no privilege; the type means nothing elsewhere.
      fs.symlinkSync(`${root}/${target}`, `${root}/${rel}`, "junction");
    } catch {
      linked = false;
    }
  }
  git(history, ["init", "-q", "-b", "main"]);
  // Written as a file, one spawn saved per key: the adapter under test runs with the developer global config, so the keys its answers depend on are pinned here.
  fs.appendFileSync(`${history}/.git/config`, "[core]\n\tautocrlf = false\n\tfileMode = true\n[diff]\n\trenames = true\n[status]\n\trenames = true\n[user]\n\tname = scene\n\temail = scene@p2p2.invalid\n");
  HISTORY_STATE.commits.forEach((files, index) => {
    apply(history, files);
    git(history, ["add", "-A"]);
    git(history, ["commit", "-q", "-m", `commit ${index + 1}`]);
  });
  git(history, ["checkout", "-q", "--detach"]);
  apply(history, HISTORY_STATE.tree);
  git(history, ["add", "-A", "--", ...HISTORY_STATE.staged]);
  process.once("exit", () => fs.rmSync(base, { recursive: true, force: true, maxRetries: 5 }));
  scene = { root, outside, scratch, history, linked, execBits };
  return scene;
}

let template: string | null = null;

/** One commit of WRITE_STATE, its hooks gone, the keys the cases depend on pinned against the developer's config. */
function throwawayTemplate(base: string): string {
  if (template !== null) return template;
  const root = `${base}/template`;
  fs.mkdirSync(root);
  git(root, ["init", "-q", "-b", "main"]);
  fs.rmSync(`${root}/.git/hooks`, { recursive: true, force: true });
  fs.appendFileSync(
    `${root}/.git/config`,
    "[core]\n\tautocrlf = false\n\texcludesFile = \n[user]\n\tname = scene\n\temail = scene@p2p2.invalid\n[commit]\n\tgpgsign = false\n[gc]\n\tauto = 0\n[maintenance]\n\tauto = false\n",
  );
  apply(root, WRITE_STATE.files);
  git(root, ["add", "-f", "--", ...Object.keys(WRITE_STATE.files).filter((path) => path !== WRITE_STATE.untracked)]);
  git(root, ["commit", "-q", "-m", "seed"]);
  template = root;
  return root;
}

let copies = 0;

/** A fresh copy of the template, below the base directory of the scene. */
export function throwaway(opts: ThrowawayOpts = {}): Throwaway {
  const { scratch, execBits } = sharedScene();
  const base = path.posix.dirname(scratch);
  const root = `${base}/throwaway-${++copies}`;
  fs.cpSync(throwawayTemplate(base), root, { recursive: true });
  const hooks = `${root}/.git/hooks`;
  fs.mkdirSync(hooks);
  // An absolute hooks path: a global one of the developer never runs, and a linked worktree finds it too.
  fs.appendFileSync(`${root}/.git/config`, `[core]\n\tfileMode = ${opts.fileMode ?? execBits}\n\thooksPath = ${hooks}\n`);
  const fails = (name: string): void => fs.writeFileSync(`${hooks}/${name}`, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  if (opts.refuse) fails("pre-commit");
  if (opts.checkout) fails("post-checkout");
  if (opts.detached) git(root, ["checkout", "-q", "--detach"]);
  if (opts.unborn) {
    fs.rmSync(`${root}/.git/refs/heads/main`);
    fs.rmSync(`${root}/.git/index`);
  }
  return {
    fs: nodeFs,
    git: gitCommand,
    write: gitWriteCommand,
    root,
    execBits,
    stageMode: (file, mode) => git(root, ["update-index", mode === "100755" ? "--chmod=+x" : "--chmod=-x", "--", file]),
  };
}

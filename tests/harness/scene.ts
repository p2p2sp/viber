/*
 * scene.ts - writes SCENE_STATE into one throwaway git repository per test
 * process, for the integration files of the real adapters. The repository and
 * the outside directory are read-only by contract: a case never writes into
 * them, so sharing them costs no isolation. The scratch directory beside them
 * is the one place a contract case writes, each under a directory of its own
 * name. The repository has no commit, so its HEAD stands on an unborn branch; a
 * second repository beside it holds one empty commit and a detached HEAD.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SCENE_STATE } from "./ports-contract.ts";

interface Scene {
  root: string;
  outside: string;
  scratch: string;
  detached: string;
  linked: boolean;
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

/** outside: a directory in no repository. scratch: an empty directory in no repository, for the writing contract cases. detached: a repository on a detached HEAD. linked: false when this account cannot create the directory links of SCENE_STATE. */
export function sharedScene(): Scene {
  if (scene) return scene;
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "p2p2-scene-")));
  const root = `${base}/repo`.replaceAll("\\", "/");
  const outside = `${base}/outside`.replaceAll("\\", "/");
  const scratch = `${base}/scratch`.replaceAll("\\", "/");
  const detached = `${base}/detached`.replaceAll("\\", "/");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.mkdirSync(scratch);
  fs.mkdirSync(detached);
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "core.autocrlf", "false"]);
  git(root, ["config", "core.fileMode", "true"]);
  for (const [rel, text] of Object.entries(SCENE_STATE.files)) {
    fs.mkdirSync(path.dirname(`${root}/${rel}`), { recursive: true });
    fs.writeFileSync(`${root}/${rel}`, text);
  }
  const tracked = Object.keys(SCENE_STATE.files).filter((rel) => !SCENE_STATE.untracked.includes(rel));
  git(root, ["add", "--", ...tracked]);
  for (const rel of SCENE_STATE.exec) git(root, ["update-index", "--chmod=+x", "--", rel]);
  let linked = true;
  for (const [rel, target] of Object.entries(SCENE_STATE.links)) {
    try {
      // A junction on Windows, which needs no privilege; the type means nothing elsewhere.
      fs.symlinkSync(`${root}/${target}`, `${root}/${rel}`, "junction");
    } catch {
      linked = false;
    }
  }
  git(detached, ["init", "-q", "-b", "main"]);
  git(detached, ["-c", "user.name=scene", "-c", "user.email=scene@p2p2.invalid", "commit", "-q", "--allow-empty", "-m", "seed"]);
  git(detached, ["checkout", "-q", "--detach"]);
  process.once("exit", () => fs.rmSync(base, { recursive: true, force: true, maxRetries: 5 }));
  scene = { root, outside, scratch, detached, linked };
  return scene;
}

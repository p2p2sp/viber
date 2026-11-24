/*
 * scene.ts - writes SCENE_STATE into one throwaway git repository per test
 * process, for the integration files of the real adapters. Read-only by
 * contract: a case never writes into it, so sharing it costs no isolation.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SCENE_STATE } from "./ports-contract.ts";

let scene: { root: string; outside: string } | null = null;

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

/** outside: a directory in no repository. */
export function sharedScene(): { root: string; outside: string } {
  if (scene) return scene;
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "p2p2-scene-")));
  const root = `${base}/repo`.replaceAll("\\", "/");
  const outside = `${base}/outside`.replaceAll("\\", "/");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
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
  process.once("exit", () => fs.rmSync(base, { recursive: true, force: true, maxRetries: 5 }));
  scene = { root, outside };
  return scene;
}

/*
 * temp-repo.ts - a directory under the OS temp dir for a script that reads the
 * real file system, and a runner of a skill's .ts entry in it. git runs with no
 * global or system config and no excludes file, so the user's excludes never
 * hide a file.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "core.excludesFile",
  GIT_CONFIG_VALUE_0: "/dev/null",
  GIT_DIR: undefined,
  GIT_WORK_TREE: undefined,
  GIT_INDEX_FILE: undefined,
};

/** A fresh directory, its real path; `git` makes it an empty repository. */
export function tempDir(git = false): string {
  const dir = fs.realpathSync(fs.mkdtempSync(`${os.tmpdir()}/viber-test-`));
  if (git) spawnSync("git", ["init", "-q"], { cwd: dir, env: ENV });
  return dir;
}

export const removeDir = (dir: string): void => fs.rmSync(dir, { recursive: true, force: true });

/** Writes each file under dir, creating its parents. */
export function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    fs.mkdirSync(dirname(`${dir}/${path}`), { recursive: true });
    fs.writeFileSync(`${dir}/${path}`, text);
  }
}

/** Runs the repo-relative .ts entry with the args in cwd; its stdout lines, the empty ones left out. */
export function runEntry(entry: string, args: string[], cwd: string): string[] {
  const done = spawnSync(process.execPath, [`${REPO}/${entry}`, ...args], { cwd, env: ENV, encoding: "utf-8" });
  return done.stdout.split("\n").filter((line) => line !== "");
}

/*
 * stub.ts - PATH control for a script under test: a fake `gh`/`node`/whatever
 * binary on its own PATH-prependable dir (`withStub`), so a test never lets a
 * script shell out to the real network-facing tool, and a minimal PATH holding
 * core utilities only (`coreUtilsPath`), so a tool a developer happens to have
 * installed cannot answer a "not found" case. The two compose: pin
 * `opts.env.PATH` to `coreUtilsPath()` and prepend one `withStub` dir through
 * `opts.stubDirs` to put exactly one tool back.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { withTempDir } from "./tmp.ts";

/** Writes an executable `#!/bin/sh` stub named `name` (body appended after
 *  the shebang) into a fresh temp dir, and - on win32, where a shebang alone
 *  would not resolve - a matching `name.cmd` shim that shells out to it via
 *  bash, so the stub is found whichever way the OS resolves an unqualified
 *  command name (a shell under test resolves the extensionless file itself;
 *  a spawn straight from the test goes through `runScript`'s stubDirs
 *  lookup). The dir is meant to be prepended to `PATH` (see
 *  `RunOpts.stubDirs`). Cleaned up once `fn` settles, whether it resolves or throws. */
export function withStub<T>(name: string, body: string, fn: (stubDir: string) => T | Promise<T>): Promise<T> {
  return withTempDir("p2p2-stub-", (dir) => {
    const scriptPath = path.join(dir, name);
    fs.writeFileSync(scriptPath, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    fs.chmodSync(scriptPath, 0o755);
    if (process.platform === "win32") {
      const cmdPath = path.join(dir, `${name}.cmd`);
      fs.writeFileSync(cmdPath, `@echo off\r\nbash "%~dp0${name}" %*\r\n`);
    }
    return fn(dir);
  });
}

let nodeShimDirCache: string | null = null;

/** A directory holding a `node` shim alone, which runs the Node running the
 *  tests: a symlink would not resolve on win32, so the shim is a script (plus a
 *  `.cmd` there). It lives for the process and is removed on exit. */
function nodeShimDir(): string {
  if (nodeShimDirCache !== null) return nodeShimDirCache;
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "p2p2-node-shim-")));
  const target = process.execPath.replaceAll("\\", "/");
  fs.writeFileSync(path.join(dir, "node"), `#!/bin/sh\nexec "${target}" "$@"\n`, { mode: 0o755 });
  fs.chmodSync(path.join(dir, "node"), 0o755);
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(dir, "node.cmd"), `@echo off\r\n"${process.execPath}" %*\r\n`);
  }
  process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  nodeShimDirCache = dir;
  return dir;
}

/** The shell utilities path with the running Node put back: the `node` shim
 *  directory ahead of `shellUtilsPath()`. A script that needs `node` runs under
 *  this one, whatever a developer installed. */
export function coreUtilsPath(): string {
  return [nodeShimDir(), shellUtilsPath()].join(path.delimiter);
}

/** A minimal PATH value: the first directory on the current PATH that
 *  resolves `grep` - `/usr/bin` on a POSIX box, Git-for-Windows' `usr/bin` on
 *  win32 - plus, only when that directory does not also resolve `bash`, the
 *  first directory that does (`/bin` on macOS, where `/usr/bin` ships grep and
 *  `/bin` ships bash; ubuntu and Git-Bash keep both in one directory and get a
 *  single entry). Those directories ship the utilities a shell script under
 *  test needs to run at all (bash for its `#!/usr/bin/env bash` shebang, grep,
 *  head, printf) and nothing a developer installed on top of them, so a host
 *  that happens to carry a real `playwright-cli`, `gh` or `npm` cannot answer -
 *  and flip - a "not found" case. `RunOpts.stubDirs` only PREPENDS to the
 *  inherited PATH, which is why starving it first is the only way to assert
 *  absence.
 *
 *  It is not a coreutils-only guarantee: that same directory ships `git` on a
 *  POSIX box (the CI ubuntu leg included), so a script whose behaviour branches
 *  on `git` must hold either way. check-playwright.sh does - its cwd is a temp
 *  dir, which is no repository, so `git rev-parse --show-toplevel` fails there
 *  whether or not `git` resolves and `root` lands on the cwd through either
 *  branch. */
export function shellUtilsPath(): string {
  const exe = (name: string) => (process.platform === "win32" ? [`${name}.exe`, name] : [name]);
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const resolves = (dir: string, name: string) => exe(name).some((n) => fs.existsSync(path.join(dir, n)));
  const grepDir = dirs.find((dir) => resolves(dir, "grep"));
  if (!grepDir) throw new Error("tests/harness/stub.ts: no directory on PATH resolves grep");
  if (resolves(grepDir, "bash")) return grepDir;
  const bashDir = dirs.find((dir) => resolves(dir, "bash"));
  if (!bashDir) throw new Error("tests/harness/stub.ts: no directory on PATH resolves bash");
  return [grepDir, bashDir].join(path.delimiter);
}

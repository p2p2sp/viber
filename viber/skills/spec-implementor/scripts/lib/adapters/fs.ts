/*
 * fs.ts - the node:fs adapter of the Fs port: a failed read is null, a failed
 * write or move is false.
 */

import fs from "node:fs";
import path from "node:path";
import type { Fs } from "../ports.ts";

// Between two tries for the lock: short against a call that takes a second, long enough not to spin.
const RETRY_MS = 100;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process lives under another account.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export const nodeFs: Fs = {
  readText(file) {
    try {
      return fs.readFileSync(file, "utf-8");
    } catch {
      return null;
    }
  },
  writeText(file, text) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      return true;
    } catch {
      return false;
    }
  },
  exists(file) {
    return fs.existsSync(file);
  },
  remove(file) {
    fs.rmSync(file, { recursive: true, force: true });
  },
  removeEmptyDir(dir) {
    // rmdir fails on any entry, an absent path and a file alike: all three are left as they are.
    try {
      fs.rmdirSync(dir);
    } catch {}
  },
  move(from, to) {
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
      return true;
    } catch {
      return false;
    }
  },
  lock(dir, waitMs) {
    const until = Date.now() + waitMs;
    try {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
    } catch {
      return false;
    }
    for (;;) {
      try {
        fs.mkdirSync(dir);
        fs.writeFileSync(`${dir}/pid`, String(process.pid));
        return true;
      } catch {
        // Held: by a living call, or by one that died before it could leave.
      }
      const holder = Number(nodeFs.readText(`${dir}/pid`) ?? "");
      if (holder > 0 && !alive(holder)) {
        fs.rmSync(dir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > until) return false;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_MS);
    }
  },
  unlock(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
  },
};

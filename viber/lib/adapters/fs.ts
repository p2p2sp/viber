/*
 * fs.ts - the node:fs adapter of the Fs port: maps each failure of the file
 * system to the port's empty answer (null, false, an empty list).
 */

import fs from "node:fs";
import type { Fs } from "../ports.ts";

export const nodeFs: Fs = {
  readText(path) {
    try {
      return fs.readFileSync(path, "utf-8");
    } catch {
      return null;
    }
  },
  readBytes(path) {
    try {
      return fs.readFileSync(path);
    } catch {
      return null;
    }
  },
  size(path) {
    try {
      const stat = fs.statSync(path);
      return stat.isFile() ? stat.size : null;
    } catch {
      return null;
    }
  },
  exists(path) {
    return fs.existsSync(path);
  },
  kind(path) {
    try {
      const stat = fs.statSync(path);
      return stat.isFile() ? "file" : stat.isDirectory() ? "dir" : null;
    } catch {
      return null;
    }
  },
  realPath(path) {
    try {
      return fs.realpathSync.native(path).replaceAll("\\", "/");
    } catch {
      return null;
    }
  },
  listDir(path) {
    try {
      return fs.readdirSync(path).sort();
    } catch {
      return [];
    }
  },
  executable(path) {
    try {
      fs.accessSync(path, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  isLink(path) {
    try {
      return fs.lstatSync(path).isSymbolicLink();
    } catch {
      return false;
    }
  },
  setExecutable(path, on) {
    try {
      // The bits chmod changes with no "who" named: those the umask lets through.
      const bits = 0o111 & ~process.umask();
      const mode = fs.statSync(path).mode & 0o7777;
      fs.chmodSync(path, on ? mode | bits : mode & ~bits);
      return true;
    } catch {
      return false;
    }
  },
  makeDir(path) {
    try {
      fs.mkdirSync(path, { recursive: true });
      return true;
    } catch {
      return false;
    }
  },
  writeBytes(path, bytes) {
    try {
      fs.writeFileSync(path, bytes);
      return true;
    } catch {
      return false;
    }
  },
  appendBytes(path, bytes) {
    try {
      fs.appendFileSync(path, bytes);
      return true;
    } catch {
      return false;
    }
  },
  replace(from, to) {
    try {
      // A rename also moves a directory, so one is told apart first.
      if (fs.lstatSync(from).isDirectory()) return false;
      fs.renameSync(from, to);
      return true;
    } catch {
      return false;
    }
  },
  move(from, to) {
    try {
      // A rename replaces a file, or an empty directory, that stands at the target.
      if (fs.lstatSync(to, { throwIfNoEntry: false }) !== undefined) return false;
      fs.renameSync(from, to);
      return true;
    } catch {
      return false;
    }
  },
  removeTree(path) {
    try {
      fs.rmSync(path, { recursive: true, force: true, maxRetries: 3 });
      return fs.lstatSync(path, { throwIfNoEntry: false }) === undefined;
    } catch {
      return false;
    }
  },
  remove(path) {
    try {
      // force passes an absent path; without recursive a directory is refused.
      fs.rmSync(path, { force: true });
      return true;
    } catch {
      return false;
    }
  },
  removeEmptyDir(path) {
    try {
      // On Windows rmdir takes a junction too, so a link is told apart first.
      if (!fs.lstatSync(path).isDirectory()) return false;
      fs.rmdirSync(path);
      return true;
    } catch {
      return false;
    }
  },
};

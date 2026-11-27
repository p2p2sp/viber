/*
 * fs.ts - the node:fs adapter of the Fs port: maps each failure of the file
 * system to the port's empty answer (null, false).
 */

import fs from "node:fs";
import type { Fs } from "../ports.ts";

export const nodeFs: Fs = {
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
};

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
};

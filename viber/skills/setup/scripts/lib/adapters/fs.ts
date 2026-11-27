/*
 * fs.ts - the node:fs adapter of the Fs port: maps each failure of the file
 * system to the port's empty answer (null, false).
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
  kind(path) {
    try {
      const stat = fs.statSync(path);
      return stat.isFile() ? "file" : stat.isDirectory() ? "dir" : null;
    } catch {
      return null;
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
  remove(path) {
    try {
      // force passes an absent path; without recursive a directory is refused.
      fs.rmSync(path, { force: true });
      return true;
    } catch {
      return false;
    }
  },
};

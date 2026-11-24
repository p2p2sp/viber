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
  exists(path) {
    return fs.existsSync(path);
  },
  listDir(path) {
    try {
      return fs.readdirSync(path).sort();
    } catch {
      return [];
    }
  },
};

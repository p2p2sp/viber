/*
 * fs.ts - the node:fs adapter of the Fs port: a failed read is null, a failed
 * write is false, a failed listing is empty.
 */

import fs from "node:fs";
import path from "node:path";
import type { Fs } from "../ports.ts";

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
  list(dir) {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    } catch {
      return [];
    }
  },
  remove(file) {
    fs.rmSync(file, { recursive: true, force: true });
  },
};

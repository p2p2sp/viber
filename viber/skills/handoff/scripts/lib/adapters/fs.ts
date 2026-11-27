/*
 * fs.ts - the node:fs adapter of the Fs port.
 */

import fs from "node:fs";
import type { Fs } from "../ports.ts";

export const nodeFs: Fs = {
  exists(path) {
    return fs.existsSync(path);
  },
};

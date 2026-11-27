/*
 * gh.ts - the gh command adapter of the Gh port: runs gh, 127 when no gh is
 * on PATH.
 */

import { spawnSync } from "node:child_process";
import type { Gh } from "../ports.ts";

// The comments of a long-lived issue: the default 1 MB buffer would cut the answer.
const MAX_BUFFER = 64 * 1024 * 1024;

export const ghCommand: Gh = {
  run(root, args) {
    const done = spawnSync("gh", args, { cwd: root, env: { ...process.env, GH_PROMPT_DISABLED: "1" }, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: MAX_BUFFER });
    return { exit: (done.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT" ? 127 : (done.status ?? 1), out: done.stdout ?? "", err: done.stderr ?? "" };
  },
};

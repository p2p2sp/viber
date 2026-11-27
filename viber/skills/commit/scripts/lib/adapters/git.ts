/*
 * git.ts - the git command adapter of the Git port: runs `git` and maps its
 * output to the port's values; a failed command is the port's empty answer.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { pathChunks } from "./path-chunks.ts";
import type { Git, StagedFile } from "../ports.ts";

function run(cwd: string, args: string[]): string | null {
  try {
    // The default buffer of 1 MiB would turn a long file list into a failure.
    return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 });
  } catch {
    return null;
  }
}

/** The first line of the output, without its line end; null when the command failed or printed nothing. */
function line(cwd: string, args: string[]): string | null {
  const first = run(cwd, args)?.split("\n")[0].replace(/\r$/, "");
  return first ? first : null;
}

/** HEAD, or the empty tree, whose name depends on the hash of the repository, on a branch with no commit yet. */
function headOrEmpty(root: string): string {
  return line(root, ["rev-parse", "--verify", "--quiet", "HEAD"]) === null ? (line(root, ["hash-object", "-t", "tree", "--stdin"]) ?? "HEAD") : "HEAD";
}

export const gitCommand: Git = {
  shortCommit(root, ref) {
    return line(root, ["rev-parse", "--verify", "--quiet", "--short", `${ref}^{commit}`]);
  },
  indexHolds(root, path) {
    return !!run(root, ["--literal-pathspecs", "ls-files", "-z", "--", path]);
  },
  headHolds(root, path) {
    return !!run(root, ["--literal-pathspecs", "ls-tree", "-r", "-z", "--name-only", "HEAD", "--", path]);
  },
  stagedFiles(root, paths) {
    const files: StagedFile[] = [];
    for (const chunk of paths === null ? [[]] : pathChunks(paths)) {
      const out = run(root, ["--literal-pathspecs", "diff", "--cached", "--raw", "-z", "--no-renames", "--", ...chunk]);
      if (out === null) return null;
      // A record is ":<old mode> <new mode> <old sha> <new sha> <status>", each mode six digits, then the path.
      const fields = out.split("\0");
      for (let i = 0; i + 1 < fields.length; i += 2) files.push({ path: fields[i + 1], from: fields[i].slice(1, 7), mode: fields[i].slice(8, 14) });
    }
    return files;
  },
  report(root, kind, paths) {
    const scope = paths === null ? [] : ["--", ...paths];
    const args =
      kind === "log"
        ? ["log", "--oneline", "-n", "10"]
        : kind === "status"
          ? ["status", "--short", "--untracked-files=all", ...scope]
          : ["diff", headOrEmpty(root), ...(kind === "stat" ? ["--stat"] : []), "--", ...(paths ?? [])];
    const done = spawnSync("git", ["--literal-pathspecs", ...args], { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });
    return `${done.stderr ?? ""}${done.stdout ?? ""}`;
  },
  repoRoot(cwd) {
    const out = run(cwd, ["rev-parse", "--show-toplevel"]);
    const root = out?.trim();
    return root ? root.replaceAll("\\", "/") : null;
  },
  branch(cwd) {
    const name = run(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"])?.trim();
    return name ? name : null;
  },
  commit(root, ref) {
    return line(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  },
  untrackedFiles(root, path) {
    const out = run(root, ["--literal-pathspecs", "ls-files", "--others", "--exclude-standard", "-z", ...(path === undefined ? [] : ["--", path])]);
    return out ? out.split("\0").filter((path) => path !== "") : [];
  },
};

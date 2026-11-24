/*
 * git.ts - the git command adapter of the Git port: runs `git` and maps its
 * output to the port's values; a failed command is the port's empty answer.
 */

import { execFileSync } from "node:child_process";
import type { ChangedFile, Git, StatusEntry, TrackedFile } from "../ports.ts";

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

export const gitCommand: Git = {
  repoRoot(cwd) {
    const out = run(cwd, ["rev-parse", "--show-toplevel"]);
    const root = out?.trim();
    return root ? root.replaceAll("\\", "/") : null;
  },
  trackedFiles(root) {
    const out = run(root, ["ls-files", "-s", "-z"]);
    if (!out) return [];
    const files: TrackedFile[] = [];
    for (const entry of out.split("\0")) {
      const tab = entry.indexOf("\t");
      if (tab < 0) continue;
      files.push({ path: entry.slice(tab + 1), mode: entry.slice(0, entry.indexOf(" ")) });
    }
    return files;
  },
  branch(cwd) {
    const name = run(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"])?.trim();
    return name ? name : null;
  },
  commit(root, ref) {
    return line(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  },
  symbolicRef(root, name) {
    return line(root, ["symbolic-ref", "--quiet", name]);
  },
  mergeBase(root, a, b) {
    return line(root, ["merge-base", a, b]);
  },
  firstAdded(root, path) {
    // The oldest commit comes first under --reverse; a limit would cut the list before it is reversed.
    return line(root, ["--literal-pathspecs", "log", "--diff-filter=A", "--reverse", "--format=%H", "--", path]);
  },
  changedFiles(root, base) {
    // With no base the work tree is compared to the empty tree, whose name depends on the hash of the repository.
    const from = base ?? line(root, ["hash-object", "-t", "tree", "--stdin"]);
    const out = from === null ? null : run(root, ["diff", "--name-status", "-z", from, "--"]);
    if (!out) return [];
    const files: ChangedFile[] = [];
    const fields = out.split("\0");
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const status = fields[i].slice(0, 1);
      // A rename or copy carries two paths, the old one first.
      if (status === "R" || status === "C") i += 1;
      files.push({ status, path: fields[i + 1] });
    }
    return files;
  },
  untrackedFiles(root) {
    const out = run(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
    return out ? out.split("\0").filter((path) => path !== "") : [];
  },
  status(root) {
    const out = run(root, ["status", "--porcelain", "-z", "-uall"]);
    if (!out) return [];
    const entries: StatusEntry[] = [];
    const fields = out.split("\0");
    for (let i = 0; i < fields.length; i++) {
      if (fields[i].length < 4) continue;
      const code = fields[i].slice(0, 2);
      entries.push({ code, path: fields[i].slice(3) });
      // A rename or copy is followed by one more field, the old path.
      if (code.includes("R") || code.includes("C")) i += 1;
    }
    return entries;
  },
};

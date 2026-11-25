/*
 * git.ts - the git command adapter of the Git port: runs `git` and maps its
 * output to the port's values; a failed command is the port's empty answer.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { pathChunks } from "./path-chunks.ts";
import type { ChangedFile, Git, GrepHit, StagedFile, StatusEntry, TrackedFile } from "../ports.ts";

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
  isRepository(cwd) {
    return run(cwd, ["rev-parse", "--git-dir"]) !== null;
  },
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
  log(root, from) {
    const out = run(root, ["log", "--reverse", "--format=%h %s", `${from}..HEAD`, "--"]);
    return (out ?? "").split("\n").flatMap((row) => {
      const cut = row.indexOf(" ");
      return cut < 0 ? [] : [{ short: row.slice(0, cut), subject: row.slice(cut + 1) }];
    });
  },
  committedFiles(root, ref) {
    const out = run(root, ["diff-tree", "-r", "-z", "--no-commit-id", "--no-renames", "--root", "--name-only", ref, "--"]);
    return out ? out.split("\0").filter((path) => path !== "") : [];
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
  untrackedFiles(root, path) {
    const out = run(root, ["--literal-pathspecs", "ls-files", "--others", "--exclude-standard", "-z", ...(path === undefined ? [] : ["--", path])]);
    return out ? out.split("\0").filter((path) => path !== "") : [];
  },
  trackedIgnored(root) {
    const out = run(root, ["ls-files", "-z", "-c", "-i", "--exclude-standard"]);
    return out ? out.split("\0").filter((path) => path !== "") : [];
  },
  ignored(root, path) {
    // Exit 1 names no rule; --no-index asks the rules alone, so a tracked path is judged too.
    return run(root, ["check-ignore", "-q", "--no-index", "--", path]) !== null;
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
  grep(root, terms, word) {
    if (terms.length === 0) return [];
    // -z ends the path and the line number on a NUL, so a colon in a path splits nothing and no path is quoted; the two --no- flags pin the line shape against the developer config.
    const out = run(root, ["grep", "-n", "-I", "-F", "-z", "--no-color", "--no-column", "--untracked", "--exclude-standard", ...(word ? ["-w"] : []), ...terms.flatMap((term) => ["-e", term])]);
    if (!out) return [];
    const hits: GrepHit[] = [];
    for (const row of out.split("\n")) {
      const fields = row.split("\0");
      if (fields.length >= 3) hits.push({ path: fields[0], line: Number(fields[1]), text: fields.slice(2).join("\0") });
    }
    return hits;
  },
};

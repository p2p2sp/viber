/*
 * git.ts - the git command adapter of the Git port. Its reads run git here;
 * its two writes run build-commit.ts as a process, whose standard error is
 * what git and its hooks printed.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import type { Committed, Git } from "../ports.ts";

const COMMIT_ENTRY = `${import.meta.dirname}/../../build-commit.ts`;
// A patch or a file list of a large task: the default 1 MB buffer would cut the answer.
const MAX_BUFFER = 256 * 1024 * 1024;

/** Every pathspec is one exact path, never a glob. */
const literal = (): NodeJS.ProcessEnv => ({ ...process.env, GIT_LITERAL_PATHSPECS: "1" });

function git(root: string, args: string[], env: NodeJS.ProcessEnv = literal()): { exit: number; out: string } {
  const done = spawnSync("git", args, { cwd: root, env, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: MAX_BUFFER });
  return { exit: done.status ?? 1, out: done.stdout ?? "" };
}

const listed = (out: string): string[] => out.split("\0").filter((name) => name !== "");

/** The paths git can stage: one the index holds, or an untracked one no ignore rule covers. `git add` fails on any other. */
function stageable(root: string, paths: string[]): string[] {
  if (paths.length === 0) return [];
  const known = [...listed(git(root, ["ls-files", "-z", "--", ...paths]).out), ...listed(git(root, ["ls-files", "-z", "--others", "--exclude-standard", "--", ...paths]).out)];
  return paths.filter((path) => known.some((file) => file === path || file.startsWith(`${path}/`)));
}

function write(call: { op: "stage" | "commit"; root: string; paths: string[]; message?: string }): { exit: number; output: string } {
  const done = spawnSync(process.execPath, [COMMIT_ENTRY], { input: JSON.stringify(call), encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: MAX_BUFFER });
  return { exit: done.status ?? 1, output: `${done.stdout ?? ""}${done.stderr ?? ""}`.trim() };
}

export const gitCommand: Git = {
  head(root) {
    const head = git(root, ["rev-parse", "--quiet", "--verify", "HEAD"]);
    return head.exit === 0 && head.out.trim() !== "" ? head.out.trim() : null;
  },
  holds(root, path) {
    return listed(git(root, ["ls-files", "-z", "--", path]).out).length > 0;
  },
  diff(root, paths) {
    const keep = stageable(root, paths);
    const dir = git(root, ["rev-parse", "--absolute-git-dir"]).out.trim();
    if (keep.length === 0 || dir === "") return "";
    // A copy of the index takes the task's files, new ones included; the real one stays as the user left it.
    const index = `${dir}/index.viber-build.${process.pid}`;
    const env = { ...literal(), GIT_INDEX_FILE: index };
    try {
      if (fs.existsSync(`${dir}/index`)) fs.copyFileSync(`${dir}/index`, index);
      else git(root, ["read-tree", "HEAD"], env);
      git(root, ["add", "-A", "--", ...keep], env);
      return git(root, ["diff", "--cached", "HEAD", "--", ...keep], env).out;
    } catch {
      return "";
    } finally {
      fs.rmSync(index, { force: true });
    }
  },
  dirty(root, paths) {
    if (paths.length === 0) return [];
    // Each entry is `XY <path>`; with no rename detection it names one path.
    return listed(git(root, ["status", "--porcelain", "-z", "--no-renames", "--untracked-files=all", "--", ...paths]).out).map((entry) => entry.slice(3));
  },
  sizeAtHead(root, path) {
    // `ls-tree -l` gives `<mode> <type> <sha> <size>\t<path>`; a directory's size is `-` and does not match.
    const entry = listed(git(root, ["ls-tree", "-l", "-z", "HEAD", "--", path]).out)[0] ?? "";
    const match = /^\d+ blob \S+\s+(\d+)\t/.exec(entry);
    return match === null ? null : Number(match[1]);
  },
  restore(root, paths) {
    if (paths.length === 0) return true;
    try {
      const head = listed(git(root, ["ls-tree", "-r", "-z", "--name-only", "HEAD", "--", ...paths]).out);
      const inHead = new Set(head);
      // Files the work tree holds that HEAD lacks are removed; the index entries of the work tree stay as they are.
      for (const file of gitCommand.dirty(root, paths)) {
        if (!inHead.has(file)) fs.rmSync(`${root}/${file}`, { force: true });
      }
      if (head.length === 0) return true;
      return git(root, ["restore", "--source=HEAD", "--worktree", "--", ...head]).exit === 0;
    } catch {
      return false;
    }
  },
  changes(root, base) {
    // -z gives every path as it is: a line would quote one holding a quote, a backslash or a non-ASCII character.
    const done = git(root, ["diff", "--name-status", "-z", base, "HEAD"]);
    if (done.exit !== 0) return null;
    const parts = listed(done.out);
    const lines: string[] = [];
    // A status, then its path; a rename or a copy has two.
    for (let i = 0; i < parts.length; ) {
      const count = /^[RC]/.test(parts[i]) ? 3 : 2;
      lines.push(parts.slice(i, i + count).join("\t"));
      i += count;
    }
    return lines.join("\n");
  },
  log(root, base) {
    const done = git(root, ["log", "--oneline", `${base}..HEAD`]);
    return done.exit === 0 ? done.out.trim() : null;
  },
  commit(root, message, paths): Committed {
    const keep = stageable(root, paths);
    if (keep.length === 0) return { kind: "none" };
    const staged = write({ op: "stage", root, paths: keep });
    if (staged.exit !== 0) return { kind: "refused", output: staged.output };
    if (git(root, ["diff", "--cached", "--quiet", "HEAD", "--", ...keep]).exit === 0) return { kind: "none" };
    const before = gitCommand.head(root);
    const done = write({ op: "commit", root, paths: keep, message });
    if (done.exit !== 0) return { kind: "refused", output: done.output };
    const after = gitCommand.head(root);
    return after !== null && after !== before ? { kind: "done", sha: after } : { kind: "refused", output: "git exited 0 and HEAD did not move" };
  },
};

/*
 * commit.ts - the commit core: stages what the selector names, commits it with
 * the message it is handed and reads off HEAD whether the commit landed. The
 * contract lives in the header of ../skills/commit/scripts/commit.ts.
 */

import { diskPath, readSelector } from "./commit-args.ts";
import { answer, type MapAnswer } from "./map-answer.ts";
import type { Fs, Git, GitWrite } from "./ports.ts";

interface Ports {
  fs: Fs;
  git: Git;
  write: GitWrite;
}

/** Nothing on stdout; git has said why on stderr. */
const stopped = (exit: number): MapAnswer => ({ stdout: "", stderr: "", exit });

/**
 * Gives the work tree the exec bit the index holds for every path whose staged
 * mode differs from HEAD's. Under core.fileMode=true git reads a tracked path's
 * mode back from the tree as it stages it, so an exec bit staged with
 * "git update-index --chmod=+x" over a 0644 file was dropped before the commit;
 * under core.fileMode=false git keeps the index mode by itself. A mode only the
 * tree changed is not touched: that change is the caller's.
 */
function syncTreeModes(root: string, paths: string[] | null, { fs, git }: Ports): void {
  for (const staged of git.stagedFiles(root, paths) ?? []) {
    const file = diskPath(staged.path, root);
    if (staged.from === staged.mode || fs.kind(file) !== "file" || fs.isLink(file)) continue;
    const runs = fs.executable(file);
    if (staged.mode === "100755" && !runs) fs.setExecutable(file, true);
    else if (staged.mode === "100644" && runs) fs.setExecutable(file, false);
  }
}

/** The exit of the first staging step that failed, or the paths git knows afterwards. */
function stagePaths(root: string, paths: string[], ports: Ports): number | string[] {
  const { fs, git, write } = ports;
  const known: string[] = [];
  syncTreeModes(root, paths, ports);
  for (const path of paths) {
    // Tracked files first, whatever the ignore rules say; a new file only when none covers it. A path gone from disk and index needs nothing: its deletion is staged.
    if (git.indexHolds(root, path)) {
      const exit = write.stageTracked(root, path);
      if (exit !== 0) return exit;
    }
    if (fs.exists(diskPath(path, root))) {
      const added = git.untrackedFiles(root, path);
      const exit = added.length > 0 ? write.stage(root, added) : 0;
      if (exit !== 0) return exit;
    }
    if (git.indexHolds(root, path) || git.headHolds(root, path)) known.push(path);
  }
  return known;
}

/** The stdout, stderr and exit code of one commit call. */
export function runCommit(argv: string[], cwd: string, ports: Ports): MapAnswer {
  const { git, write } = ports;
  const message = argv[0] ?? "";
  if (message === "") {
    return { stdout: "", stderr: "error: missing required parameter 'message'\nusage: commit.sh <message> [selector...]\n", exit: 1 };
  }
  const { root, mode, paths, missing } = readSelector(argv.slice(1).join(" "), cwd, ports);
  const before = git.commit(root, "HEAD");
  if (mode === "missing") {
    return { stdout: "", stderr: `error: none of the named paths exists: ${missing} - nothing committed\n`, exit: 3 };
  }

  let scope: string[] | null = null;
  if (mode === "paths") {
    const known = stagePaths(root, paths, ports);
    if (typeof known === "number") return stopped(known);
    if (known.length === 0) return answer(["Nothing to commit"]);
    scope = known;
  } else {
    syncTreeModes(root, null, ports);
    const exit = write.stageAll(root, null);
    if (exit !== 0) return stopped(exit);
  }
  if (git.stagedFiles(root, scope)?.length === 0) return answer(["Nothing to commit"]);
  const exit = write.commit(root, message, scope, false);
  if (exit !== 0) return stopped(exit);

  // Git exited 0: HEAD alone says whether the commit landed.
  const after = git.commit(root, "HEAD");
  const verdict = after !== null && after !== before ? "VERIFIED" : "FAILED";
  return answer([`${git.shortCommit(root, "HEAD") ?? "(none)"} | ${message.split("\n")[0]} (${verdict})`]);
}

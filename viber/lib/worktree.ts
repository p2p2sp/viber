/*
 * worktree.ts - the worktree core: adds and removes the clean checkout a hunter
 * or critic replays a claim in, reporting only what it verified. The contract
 * lives in the header of ../skills/code-auditor/scripts/worktree.ts.
 */

import type { MapAnswer } from "./map-answer.ts";
import type { Fs, Git, GitOutcome, GitWrite } from "./ports.ts";

/** What git printed, with one line end; nothing for nothing. */
const relayed = (output: string): string => (output.trim() === "" ? "" : `${output.replace(/\n+$/, "")}\n`);

const failed = (reason: string, output = ""): MapAnswer => ({ stdout: `WORKTREE_FAILED ${reason}\n`, stderr: relayed(output), exit: 1 });

/** Forward slashes, no trailing one: for comparing two spellings as text. */
const spelled = (path: string): string => path.replaceAll("\\", "/").replace(/\/*$/, "");

/** The stdout, stderr and exit code of one worktree call. */
export function runWorktree(argv: string[], { fs, git, write }: { fs: Fs; git: Git; write: GitWrite }): MapAnswer {
  const [cmd = "", root = "", wt = ""] = argv;
  if (cmd === "" || root === "" || wt === "") return failed("usage: worktree.sh add|remove <target-root> <worktree-path>");
  if (/^(\/{1,2}|[A-Za-z]:[\\/])$/.test(wt)) return failed(`refusing to operate on a filesystem root: ${wt}`);
  if (!/^(\/|[A-Za-z]:[\\/])/.test(wt)) return failed(`worktree path must be absolute: ${wt}`);
  if (spelled(wt) === spelled(root)) return failed(`worktree path must not be the target root: ${wt}`);
  if (!git.isRepository(root)) return failed(`not a git repository: ${root}`);

  // The text guards miss other spellings (case, /./, an ancestor): compare physically. An empty target is `/`, which holds every root.
  if (fs.kind(wt) === "dir") {
    const physical = (path: string): string => spelled(fs.realPath(path) ?? "").toLowerCase();
    const inner = physical(root);
    if (inner !== "" && `${inner}/`.startsWith(`${physical(wt)}/`)) return failed(`worktree path holds the target root: ${wt}`);
  }

  // As rm does: a path ending on . or .. names a directory by another one, so it is never removed whole.
  const clear = (): void => {
    if (!/\/\.{1,2}$/.test(spelled(wt))) fs.removeTree(wt);
  };
  // The worktree itself decides: "git worktree add" exits with a failing post-checkout hook's status too.
  const made = (): boolean => fs.kind(`${wt}/.git`) === "file" && git.repoRoot(wt) !== null;

  if (cmd === "add") {
    const fresh = !fs.exists(wt);
    let told = "";
    let added: GitOutcome = write.addWorktree(root, wt);
    if (added.exit !== 0 && !(fresh && made())) {
      // A registration git still holds, a directory it does not know, or both.
      write.removeWorktree(root, wt);
      if (fs.exists(wt)) clear();
      write.pruneWorktrees(root);
      added = write.addWorktree(root, wt);
      if (added.exit !== 0 && !made()) return failed(`worktree add failed after recovery: ${wt}`, added.output);
    }
    if (added.exit !== 0) told = added.output;
    if (git.repoRoot(wt) === null) return failed(`worktree add reported success but ${wt} is not a work tree`, told);
    return { stdout: `WORKTREE_READY ${wt}\n`, stderr: relayed(told), exit: 0 };
  }
  if (cmd === "remove") {
    if (fs.exists(wt)) {
      const removed = write.removeWorktree(root, wt);
      if (removed.exit !== 0) clear();
      if (fs.exists(wt)) return failed(`could not remove ${wt}`, removed.output);
    }
    write.pruneWorktrees(root);
    return { stdout: `WORKTREE_REMOVED ${wt}\n`, stderr: "", exit: 0 };
  }
  return failed(`unknown command: ${cmd} (expected add or remove)`);
}

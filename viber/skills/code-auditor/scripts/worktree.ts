/*
 * worktree.ts - the clean-checkout verification worktree lifecycle of the hunter
 * and critic runs. The entry holds no logic: viber/lib/worktree.ts does all of
 * it, and the agents run it through the wrapper worktree.sh, which keeps its call
 * line and refuses the root "/" itself.
 *
 * Self-verifying: `add` does not report READY until the path actually resolves
 * as a git worktree (judged by the worktree it made, not by git's exit status,
 * which carries a failing post-checkout hook's), and `remove` does not report REMOVED until the path is
 * gone. Every recovery from a dirty or half-registered state is handled here -
 * a stale registration, a leftover directory, replay artifacts a bare
 * `worktree remove` refuses to delete - so the caller never has to branch on a
 * git error message. Both commands are idempotent: `add` over an existing path
 * reclaims it, `remove` over an absent path succeeds.
 *
 * IN : add|remove <target-root> <worktree-path>
 *      <target-root>    the repo to anchor to (git -C). The caller's cwd is
 *                       never used to locate a repo - without -C git would
 *                       silently operate on whatever tree the session sits in.
 *      <worktree-path>  MUST be absolute (POSIX /... or Windows C:/...). A
 *                       relative path would resolve against the caller's cwd,
 *                       and parallel callers each own a distinct path.
 *                       MUST NOT be the target root or an ancestor of it -
 *                       compared on the physical, case-folded path.
 * OUT: exactly one line on stdout -
 *        WORKTREE_READY <worktree-path>     add succeeded and was verified
 *        WORKTREE_REMOVED <worktree-path>   remove succeeded and was verified
 *        WORKTREE_FAILED <reason>           neither could be achieved
 *      exit 0 on READY / REMOVED, 1 on FAILED. git's own stderr is relayed on
 *      stderr for diagnosis; stdout stays exactly one line either way.
 */

import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { gitWriteCommand } from "../../../lib/adapters/git-write.ts";
import { runWorktree } from "../../../lib/worktree.ts";

const result = runWorktree(process.argv.slice(2), { fs: nodeFs, git: gitCommand, write: gitWriteCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

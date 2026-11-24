/*
 * run-changes.ts - prints the paths a run changed in the working tree: the base
 * commit the run started from and one line per path that differs from it. The
 * entry holds no logic: viber/lib/run-changes.ts asks git and builds the lines.
 *
 * `test-runner` selects the integration tests of the final run from the files the
 * build changed, and it used to work that set out itself: find the commit that
 * added the run's `plan.md`, diff against it, add the untracked files, drop the
 * duplicates. A model asked to do that drifts - it diffs against the wrong
 * commit, forgets the untracked files, lists a path twice. This script derives
 * the set the same way every time, so the caller reads lines and selects.
 * Callers run it through the wrapper run-changes.sh, which keeps its call line.
 *
 * Contract:
 *   argv   : $1 run directory (OPTIONAL, at most one): relative to the repository
 *            root or absolute; a backslash is read as `/` and trailing slashes
 *            are dropped. A relative one, and an absolute one below the root,
 *            is spelled one way first, as text (a `.` segment and a doubled
 *            slash dropped, a `..` taking the segment before it); an absolute one
 *            that does not read as below the root goes to git as written. No
 *            argument, or an empty one, means the base is HEAD. More than one
 *            argument exits 2.
 *   cwd    : any directory inside the host repository - the repository root is
 *            resolved from it, so a relative argument resolves the same from
 *            every directory and the printed paths are relative to the root.
 *            Outside a repository it exits 2. No git command writes.
 *   env    : none. The run directory is handed to git as a literal path, so a
 *            bracket or star in its name is no glob.
 *   reads  : the git history and index. The run directory itself is never read,
 *            only named to git: a directory that does not exist has no commit
 *            adding its plan.md.
 *   writes : nothing.
 *   stdout : on exit 0, in this order:
 *              base: <sha>       the oldest commit of
 *                                `git log --diff-filter=A -- <run-dir>/plan.md`
 *              base: HEAD        when no argument was given
 *              base: none        when the argument was given and no commit added
 *                                its plan.md; nothing else is printed then
 *              changed: <path>   one line per path of `git diff <base>`, a
 *                                deleted one included and a rename as its new
 *                                path, then one per path of `git ls-files
 *                                --others --exclude-standard`; a path both lists
 *                                hold is printed once, at its first place. A
 *                                path is printed as it is, never quoted: a
 *                                blank, a quote, a backslash or a non-ASCII
 *                                character stays itself. A path holding a
 *                                newline is not supported.
 *            Nothing changed prints the `base:` line alone.
 *   exit   : 0 the lines were printed.
 *            2 more than one argument, or no git repository around the cwd; one
 *              `error: ...` line on stderr, nothing on stdout.
 */

import { gitCommand } from "../lib/adapters/git.ts";
import { runRunChanges } from "../lib/run-changes.ts";

const result = runRunChanges(process.argv.slice(2), process.cwd(), { git: gitCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

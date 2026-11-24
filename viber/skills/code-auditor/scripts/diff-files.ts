/*
 * viber - skills/code-auditor/scripts/diff-files.ts
 * Prints the diff base and the changed files of the "current diff" audit scope.
 * The entry holds no logic: viber/lib/diff-files.ts asks git and builds the
 * lines.
 *
 * Why it exists: the audit scope "the current diff" has edge cases a model gets
 * wrong when it improvises them - the default branch (origin/HEAD, main or
 * master), unpushed commits on the default branch, a detached HEAD, an orphan
 * branch, a repository with no commit, deleted files, paths with spaces or
 * non-ASCII characters. One script answers them the same way every run, and the
 * caller trusts its output without re-checking it. frame.sh runs it through the
 * wrapper diff-files.sh, which keeps its call line.
 *
 * Base rules, in order:
 *   1. An explicit <base> (any commit-ish) wins over every rule below, even on
 *      the default branch.
 *   2. No commit yet -> `BASE none`.
 *   3. The default branch is the target of refs/remotes/origin/HEAD, else local
 *      main, else local master. None -> `BASE HEAD`.
 *   4. A detached HEAD, a current branch that IS the default branch (its short
 *      name, or origin/HEAD's target without the `refs/remotes/origin/` prefix) -
 *      so unpushed commits there are not printed - or a current branch sharing
 *      no merge base with the default branch -> `BASE HEAD`.
 *   5. Otherwise `BASE <merge-base of HEAD and the default branch>`.
 *
 * Contract:
 *   argv   : <repo-root> [<base>]. <repo-root> is the directory every printed
 *            path is relative to, the top level of the work tree or a directory
 *            below it (only the paths below it are printed then); a backslash is
 *            read as `/`; an absent or empty one is a usage error (exit 2).
 *            <base> is optional; an empty one means absent, one starting with
 *            `-` names no commit.
 *   cwd    : irrelevant: it only ever resolves a relative <repo-root>.
 *   env    : none read beyond what git itself reads.
 *   files  : none written; git's repository state is only read.
 *   stdout : the base line, then the paths, one per line:
 *              BASE <full sha> | BASE HEAD | BASE none
 *              <root-relative path>   sorted by the bytes of its UTF-8 form,
 *                                     unique, as it is (no quoting)
 *            Paths are those changed between the base and the working tree
 *            (added, modified, type-changed, renamed to; deleted excluded), plus
 *            staged, plus untracked files not ignored. In a repository with no
 *            commit the tracked files present on disk count. Paths under
 *            .temp/viber/code-auditor/ are never printed. A path holding a
 *            newline is not supported.
 *            With nothing changed only the base line is printed.
 *   exit   : 0 on success. 1 with the single stdout line `NOT_A_REPO <repo-root>`
 *            (as given) when <repo-root> lies in no work tree of a git
 *            repository, or `BAD_BASE <base>` when <base> names no commit. 2 on
 *            a missing <repo-root>, with the usage on stderr and nothing on
 *            stdout.
 */

import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runDiffFiles } from "../../../lib/diff-files.ts";

const result = runDiffFiles(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

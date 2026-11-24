/*
 * tree-record.ts - records the paths the working tree has changed before the fixer's first edit
 * and names, at the handoff, every path changed since. The entry holds no logic:
 * viber/lib/tree-record.ts asks git, keeps the record and builds the lines.
 *
 * It exists because the fixer's two `git status` steps (keep the changed paths as the record, then
 * compare against it before the handoff) were prose a model applied by eye: a path missed in the
 * comparison reached the planner as an edit the fixer never owned. The script holds the one
 * definition of "a changed path" for both steps and answers in directive lines, so the skill acts
 * on them instead of reading git's output itself. The skill runs it through the wrapper
 * tree-record.sh, which keeps its call line.
 *
 * Contract:
 *   argv   : --save
 *              writes .temp/viber/fixer/tree-record under the repository root: one repo-relative
 *              path per line, sorted by the bytes of its UTF-8 form, every path
 *              `git status --porcelain -z -uall` reports staged, unstaged or untracked. Ignored
 *              paths and every path under .temp/ are left out, an untracked directory is listed
 *              file by file, a rename counts as its new path. An earlier record is replaced.
 *            --check [<reproduction test path>]
 *              the paths git status reports now, under the same rules, that are neither in the
 *              record nor the given path. The given path is turned into its repo-relative form
 *              first: a leading ./ dropped once, an absolute path under the root (on Windows in
 *              the C:/ or C:\ form, the drive letter's case ignored) losing the root, a relative
 *              path gaining the cwd's prefix inside the repository; an absolute path outside the
 *              root is compared as given, and so is a `/c/...` form, which the MSYS runtime of
 *              Git Bash turns into `C:/...` before this entry starts. An empty path counts as
 *              none. A recorded path changed further is never listed: a path is recorded by
 *              name, not by content.
 *   cwd    : any directory inside the repository; the repository root is resolved from it. A
 *            relative --check argument is read against it.
 *   env    : none.
 *   reads  : git status; for --check, the record file.
 *   writes : the record file, by --save only.
 *   stdout : --save   NEXT: trace
 *                     recorded: <repo-relative path>      one per recorded path
 *            --check  NEXT: handoff                       when no such path is left
 *                     STOP: changed since the record - revert before the handoff
 *                     path: <repo-relative path>          one per such path
 *            A path is printed as it is, never quoted. A path holding a newline is not supported.
 *   stderr : one error: line when the exit is 2, nothing on stdout then.
 *   exit   : 0; 2 with no mode or an unknown one, --save with an argument, --check with more than
 *            one argument or with no record file, --save when the record cannot be written, or
 *            outside a git repository.
 */

import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runTreeRecord } from "../../../lib/tree-record.ts";

const result = runTreeRecord(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

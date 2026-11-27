/*
 * direct.ts - closes a build of the direct flow: hands the commit skill the
 * change and names what the build left uncommitted. The entry holds no logic:
 * lib/direct-run.ts does all of it.
 *
 * It exists because what a build left in the work tree is a fact of git, not
 * of the coders' returns: which files are the user's own, which the coders
 * reported, which nobody did, whether the commit was made.
 *
 * Contract:
 *   argv   : <session-id> start
 *            <session-id> done [<FILES>]
 *            <session-id> stopped [<FILES>]
 *            <session-id> committed
 *            every argument double-quoted by the caller.
 *            <session-id> : the session's id, letters, digits, `.`, `_`, `-`.
 *            start        : before the first dispatch. No resume: it replaces
 *                           the state an earlier build of the session kept.
 *            done         : every stage and the full test run returned `DONE`.
 *            stopped      : a dispatch returned `BLOCKED` twice.
 *            <FILES>      : the `FILES:` values of every coder return of the
 *                           build, paths separated by commas; `\` is turned to
 *                           `/`, a leading `./` and a <root>/ prefix are cut, a
 *                           path under .temp/ is dropped.
 *            committed    : the commit skill returned, whatever it said.
 *   cwd    : any directory inside the host project. Outside a git repository
 *            with a commit `start` still succeeds and every later call prints
 *            `END` and `No git repository with a commit: nothing is
 *            committed.`.
 *   reads  : git status and HEAD, <dir>/state.json.
 *   writes : <dir> is <root>/.temp/viber/<session-id>/direct/, never committed.
 *            <dir>/state.json : `before` (the repo-relative paths that differed
 *                      from HEAD at `start`: the user's own files), the
 *                      reported paths, the paths handed to the commit skill and
 *                      HEAD at that moment.
 *            git    : nothing: the commit skill commits.
 *   stdout : `start`: the line `STARTED`.
 *            `done` with a path to commit:
 *              SKILL: viber:commit
 *              <one line: the arguments of the skill, verbatim>
 *            its line: the paths that differ from HEAD, were reported and are
 *            none of `before`, separated by spaces. A path holding a blank, a
 *            comma or an apostrophe is left out: the commit skill cannot read
 *            it in a list.
 *            Any other call: `END` followed by plain lines the caller shows the
 *            user, each path as it is, in this order:
 *              one of `The change is committed: <short sha>.` (`committed`,
 *              HEAD moved since `done`), `The change is not committed.`
 *              (`committed`, HEAD did not move), `Nothing to commit.` (`done`
 *              with no path, `committed` after such a `done`), `Nothing is
 *              committed: the build stopped.` (`stopped`);
 *              `Left uncommitted: <paths>`: the reported paths, none of
 *              `before`, that still differ from HEAD;
 *              `Left uncommitted, changed before the run too: <paths>`: the
 *              reported paths of `before`, never committed: git cannot tell
 *              the user's change from the coder's;
 *              `Left uncommitted, reported by no coder: <paths>`: the paths
 *              that differ from HEAD, none of `before`, that no return named.
 *            A path of `before` no coder reported and a path under .temp/ are
 *            never named. Paths are separated by `, `.
 *   stderr : one line naming the cause when the exit is 2, the usage on a call
 *            that matches no form.
 *   exit   : 0 with lines on stdout; 2 on bad usage, a bad session id, a call
 *            before `start`, or a state that cannot be read or written (stdout
 *            empty).
 */

import { projectTree } from "../../planner/scripts/lib/adapters/tree.ts";
import { nodeFs } from "../../spec-implementor/scripts/lib/adapters/fs.ts";
import { gitCommand } from "../../spec-implementor/scripts/lib/adapters/git.ts";
import { runDirect } from "./lib/direct-run.ts";

const result = runDirect(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand, tree: projectTree });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

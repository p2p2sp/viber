/*
 * reach.ts - collects the reference candidates of the planner's reach targets into one file, so
 * `impact-mapper` classifies a list instead of searching the repository itself. The entry holds
 * no logic: viber/lib/reach.ts asks git, writes the file and builds the lines.
 *
 * It exists because the mapper's own searching (one grep per target, per spelling of the target)
 * is the bulk of its tokens, and the search is mechanical: the candidates are every line naming a
 * target, the judgement is which of them really reference it. The script does the first, the
 * mapper the second, and searches itself only where the file says the script could not. It also
 * prints the dispatch block of the mapper, so the planner sends its lines as printed instead of
 * composing the prompt itself. The planner runs it through the wrapper reach.sh, which keeps its
 * call line.
 *
 * Contract:
 *   argv   : --plan <plan path> then one or more targets (the plan path is printed back as given
 *            and never read). A missing or empty --plan is an error. Each target is one of
 *              <repo-relative path>            the path, its file name, the file name without its
 *                                              last extension (which covers ./x, ../x and x.ts
 *                                              imports); for an index file its directory too
 *              <repo-relative path> | <symbol> the symbol, as a whole word
 *              <repo-relative path> | new      the parent directory path (the file does not exist
 *                                              yet)
 *            A leading ./ of the path is dropped once for the search; the target is printed as
 *            given. No target, or a target with an empty path, is an error.
 *   cwd    : any directory; inside a repository its root is resolved from it.
 *   env    : none.
 *   reads  : tracked files and untracked files the repository does not ignore (git grep, fixed
 *            strings); binary files, each target's own file and everything under .temp/ are left
 *            out. A term shorter than 3 characters is not searched, it is named on the skipped:
 *            line.
 *   writes : .temp/viber/planner/reach-<yyyy-mm-dd-HH-MM-SS>.md under the repository root, one
 *            section per target in argument order:
 *              ## <target as written>
 *              terms: <term>[, <term>...]
 *              skipped: <term>[, <term>...]       (only when a term was too short)
 *              <path>:<line>: <line text, leading blanks dropped, cut at 200 characters>
 *              truncated: past 200 lines - search this target yourself
 *            At most 200 hit lines are kept per target; the truncated: line follows them only past
 *            that cap. A path is written as it is, never quoted. Nothing is written on an error.
 *   stdout : candidates: <absolute path of that file, forward slashes>
 *            hits: <n> lines in <m> files        (the hit lines kept, all targets)
 *            NEXT: dispatch | agent: viber:impact-mapper
 *            plan: <plan path as given>
 *            candidates: <the same absolute path>
 *            targets:
 *            <each target as given, one per line, in argument order>
 *            The prompt of the dispatch is every line below the NEXT: line. Outside a git
 *            repository nothing is written, the two lines above the block and the candidates:
 *            line inside it are left out.
 *   stderr : one error: line when the exit is 2.
 *   exit   : 0; 2 with a missing or empty --plan, no target, an empty target path or a candidates
 *            file that cannot be written (stdout empty).
 */

import { systemClock } from "../../../lib/adapters/clock.ts";
import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runReach } from "../../../lib/reach.ts";

const result = runReach(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand, clock: systemClock });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

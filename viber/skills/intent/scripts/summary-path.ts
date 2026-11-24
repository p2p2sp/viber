/*
 * summary-path.ts - names the file `intent` writes its confirmed summary to, so
 * the hand-off runs no `date` and spells no path pattern itself. The entry holds
 * no logic: viber/lib/summary-path.ts builds the path, runSummaryPath returns
 * the answer.
 *
 * It exists because the hand-off used to make the model read the clock, build
 * `<project root>/.temp/viber/intent/summary-<stamp>.md` by hand and normalise
 * the slashes of a Windows drive; the stamp, the root and the slashes are
 * mechanical, so the script answers with the finished path. Callers run it
 * through the wrapper summary-path.sh, which keeps its call line.
 *
 * Contract:
 *   argv   : none. Any argument is an error.
 *   cwd    : any directory; inside a git repository the script resolves the
 *            repository root, outside one the cwd stands for it.
 *   env    : none; the stamp is the local time of the process.
 *   writes : creates <root>/.temp/viber/intent/ when absent; never writes the
 *            summary file itself.
 *   stdout : NEXT: write | path: <root>/.temp/viber/intent/summary-<YYYY-MM-DD-HH-MM-SS>.md
 *            <root> is absolute with forward slashes, a Windows drive as C:/.
 *   stderr : one error: line when the exit is 2.
 *   exit   : 0; 2 with any argument or when the directory cannot be created
 *            (stdout empty).
 */

import { systemClock } from "../../../lib/adapters/clock.ts";
import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runSummaryPath } from "../../../lib/summary-path.ts";

const result = runSummaryPath(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand, clock: systemClock });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

/*
 * attach-lines.ts - turns the paths a skill received into the `Attachment:` lines
 * of its hand-off: one line per existing file or directory under the repository's
 * `.temp/`, and nothing for any other path. The entry holds no logic:
 * viber/lib/attach-lines.ts applies the check, runAttachLines returns the answer.
 *
 * It exists because `intent` and `fixer` decided from prose which of the paths
 * their input names sat under `.temp/`, and spelled each absolute path with
 * forward slashes and a Windows drive by hand; a wrong call dropped an attachment
 * or wrote a path the planner could not land. This script applies the check, so
 * the model only runs it and carries the lines it prints. Callers run it through
 * the wrapper attach-lines.sh, which keeps its call line.
 *
 * Contract:
 *   argv   : one or more paths, each a file or a directory, absolute or relative.
 *            A relative path resolves against the cwd; a backslash counts as a
 *            forward slash; a `.` segment, a doubled or a trailing slash is
 *            dropped and a `..` segment takes the segment before it, as text,
 *            before the path is looked up. Nothing else is accepted: no option.
 *   cwd    : resolves a relative argument and locates the repository; the root is
 *            the one git reports for it, so any subdirectory works.
 *   env    : none.
 *   writes : nothing.
 *   stdout : one `Attachment: <absolute path>` line per argument naming an
 *            existing file or directory strictly under <repository root>/.temp/,
 *            in argument order, a repeat printed once. The path has forward
 *            slashes and a Windows drive as C:/; a directory is printed by its
 *            real path and a file by the real path of its directory, so a
 *            symlinked directory resolves as the repository root does. An
 *            argument that is empty, does not exist, sits outside
 *            <repository root>/.temp/ or is `.temp/` itself prints nothing, with
 *            no error.
 *   stderr : one `error: attach-lines.sh: ...` line when the exit is 2.
 *   exit   : 0 with the lines above, none included; 2 with no argument or outside
 *            a git repository (stdout empty).
 */

import { nodeFs } from "../lib/adapters/fs.ts";
import { gitCommand } from "../lib/adapters/git.ts";
import { runAttachLines } from "../lib/attach-lines.ts";

const result = runAttachLines(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

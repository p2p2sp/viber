/*
 * handoff-path.ts - resolves where the handoff skill writes its file, and on
 * which branch the conversation stands. The entry holds no logic:
 * viber/lib/handoff-path.ts builds the path, runHandoffPath returns the stdout.
 *
 * It exists because the model does not know the current time to the second,
 * and the stamp, the repository root and the path forms are a fixed format, not
 * a judgement. The skill preloads it through the wrapper handoff-path.sh, which
 * keeps its call line, so it resolves once, before the model reads a word of
 * the body, and the model only fills in the `{slug}` placeholder.
 *
 * Contract:
 *   argv   : the first argument optional, the first word of the skill arguments
 *            (`$0`, which Claude Code leaves as the literal `$0` when no
 *            argument was given), surrounding whitespace and one pair of
 *            surrounding double quotes dropped, every `\` made `/`. It names
 *            the target only when it looks like a path: it holds a `/`, ends in
 *            `.md` or is `.`; any other word opens the user's prompt, not a
 *            path.
 *              absent, empty, `$0` or not path-like -> the directory
 *                                   <root>/.temp/viber/handoff.
 *              ending in `.md`    -> that file.
 *              anything else      -> a directory.
 *            Absolute is `/...` or `X:...`, kept as written. A relative target
 *            has one leading `./` stripped and is resolved against <root>; `.`
 *            alone is <root>. The path is not normalized further (`..` stays as
 *            written). Any later argument is ignored.
 *   cwd    : any directory inside the host project - the repository root is
 *            the one git reports for it. Outside a repository the cwd is the
 *            root. Either has forward slashes, a Windows drive as C:/.
 *   env    : none; the stamp is the local time of the process.
 *   reads  : only whether FILE exists, in the `.md` case, asked for as written.
 *   writes : nothing. The directory is not created here: the writer does that.
 *   stdout : exactly four lines, in this order -
 *              FILE=<dir>/<YYYY-MM-DD-HH-MM-SS>_{slug}.md   (a directory; the
 *                `{slug}` is literal, the caller substitutes it; the stamp
 *                reads `unknown` only when the clock gives no valid time), or
 *              FILE=<path>.md                               (a file)
 *              EXISTS=true | false  - true only for a `.md` target that
 *                already exists; a directory target is always false.
 *              BRANCH=<name> | none - the branch HEAD stands on, one with no
 *                commit yet included; none outside a repository or on a
 *                detached HEAD.
 *              TARGET=named | default - named when the first argument was
 *                taken as the path, so the prompt is the arguments after it;
 *                default otherwise, so the prompt is the whole arguments.
 *   stderr : always empty.
 *   exit   : 0. The core never throws.
 */

import { systemClock } from "../../../lib/adapters/clock.ts";
import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runHandoffPath } from "../../../lib/handoff-path.ts";

process.stdout.write(runHandoffPath(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand, clock: systemClock }));

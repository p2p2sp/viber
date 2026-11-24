/*
 * frame.ts - frames a code-auditor run: reads the argument tokens, settles the lens and the scope,
 * runs every check of the Frame phase and, on a framed run, writes the run workspace and run.md.
 * The entry holds no logic: viber/lib/frame.ts reads the tokens, asks git and writes the files.
 *
 * It exists because classifying up to two tokens (a lens name beats a directory of that name,
 * `./<name>` is the directory, `diff:<sha>`, group tokens), resolving a directory against the
 * repository root, reading the lens's `Worktree:` line, settling the diff base and writing run.md
 * were prose the model re-derived on every run, each time reading the whole Frame section. One
 * script answers every argument form the same way and the skill acts on one directive. The skill
 * runs it through the wrapper frame.sh, which keeps its call line.
 *
 * Contract:
 *   argv   : the tokens of $ARGUMENTS, each read on its own: a lens name (bugs, security,
 *            web-performance, runtime-performance, tests, design), the group `performance` or
 *            `quality`, `diff`, `diff:<sha>`, `repo`, or anything else as a directory.
 *            `--apostrophe` stands for a token that held an apostrophe (read as a directory, never
 *            found). An empty token is ignored. No token is valid.
 *   cwd    : the session's directory. <root> is the top level of the repository holding it, else
 *            the cwd, with forward slashes. Nothing else depends on the cwd.
 *   env    : none.
 *   paths  : <skill dir> (printed, and written as `Lens file:`) is two directories above this
 *            file, cut as text from the path the entry was started by, with forward slashes:
 *            `C:/...` on Windows whichever spelling invoked the wrapper.
 *   files  : read: the lens file of ../references/lenses/ (its `Worktree:` line); on the diff
 *            scope, what the diff-files core reads (the header of diff-files.ts), in process.
 *            Written only on a framed run: <ws>/reports/, <ws>/worktrees/ and <ws>/run.md,
 *            <ws> = <root>/.temp/viber/code-auditor/<YYYYMMDD-HHMMSS, local time>. run.md holds
 *            `Lens:`, `Lens file:`, `Scope:` (diff, repo or a root-relative directory: an absolute
 *            one is rewritten, a leading `./` dropped, `diff` and `repo` recorded as `./diff` and
 *            `./repo`; an absolute token read with `\` as `/` and the case of its drive letter
 *            folded to the root's own first; one that reads as outside the root is followed to
 *            where it really is), `Target root:` and, on the diff scope, `Base:` and
 *            `## Changed files`.
 *   stdout : exactly one answer:
 *              NEXT: ask-lens | numbers: 1-6|3,4|5,6    no lens given, then the scope token
 *                given, if any, as the body line `scope: <token>`
 *              ASK: changes -> diff | directory -> directory | whole repository -> repo
 *                a lens and no scope, then the body line `lens: <lens>`
 *              STOP: <stop line>    an argument, directory, clean checkout or diff refusal;
 *                nothing is written
 *              RUN: sh "<skill dir>/scripts/map-signals.sh" "<ws>"    a framed run
 *   exit   : 0 in every case.
 */

import { systemClock } from "../../../lib/adapters/clock.ts";
import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runFrame } from "../../../lib/frame.ts";

process.stdout.write(runFrame(process.argv.slice(2), process.cwd(), process.argv[1], { fs: nodeFs, git: gitCommand, clock: systemClock }));

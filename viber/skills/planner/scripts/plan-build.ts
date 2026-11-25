/*
 * plan-build.ts - prints the dispatch blocks of the planner's writing agents and moves what they
 * wrote, file to file, into the plan. The entry holds no logic: viber/lib/plan-build.ts does the
 * work. The planner runs it through the wrapper plan-build.sh, which keeps its call line.
 *
 * It exists because the plan text, the reach lines, the fixes and the findings used to travel
 * through the planner's session: an agent returned them as text and the session typed them again,
 * into the plan file or into the next agent's prompt. Here an agent writes a file, the session
 * passes its path, and the script reads and writes the files.
 *
 * Commands, <plan> the absolute path of the plan file plan mode names:
 *   survey <plan> [--input <summary file>]
 *       The block of viber:plan-surveyor. A plan path other than the one of the last survey removes
 *       the work files of that plan first; the same path adds "outline: <dir>/outline.md" when that
 *       file exists, so a phase cut from a split starts from the outline of the whole change.
 *   outline <plan> <survey file>
 *       Copies the survey file to <dir>/outline.md, searches its TARGET: lines (below) and prints
 *         TASKS: <n>                     its TASKS: line
 *         FILES: <m>                     the count of its FILE: lines
 *         threshold: <n> tasks, past 30  only past 30 tasks
 *         threshold: <m> files, past 60  only past 60 files
 *         DECIDE: <...>                  each DECIDE: line, as written
 *         Split proposal:                only with a threshold: line and PHASE: lines: the text of
 *         <each PHASE: line>             each, then "Open decisions:" and "- <decision>" per
 *                                        DECIDE: line (its text before the first "|")
 *       then the block of viber:plan-architect, "mode: whole" at 8 tasks or fewer, else
 *       "mode: skeleton".
 *   skeleton <plan> <architect file>
 *       Writes the lines above a "<!-- DECISIONS -->" line into the plan file and the lines below it
 *       into <dir>/decisions.md, and prints "plan:", "tasks: <n>", "mode: skeleton" when a task
 *       holds PENDING as its Verification or DoD (else "mode: whole") and "decisions: <path>".
 *   slices <plan>
 *       Cuts the tasks into ceil(n / 8) runs of consecutive tasks (the cut of plan-index.sh),
 *       writes one brief per run, <dir>/slice-<first id>-<last id>.md, and prints one block of
 *       viber:plan-detailer per run. A brief holds, under "## " headings: Must not change, the
 *       Acceptance criteria its tasks cover, its Tasks, the Contracts they use, the File map lines
 *       of their Files and the Reach sections of those files.
 *   merge <plan> <first id>-<last id>=<task file>...
 *       Puts the "- Verification:" and "- DoD:" lines each task file gives under a "### <id>"
 *       heading into that task of the plan, no other line of it touched, writes the "GAP: " lines
 *       of the files to <dir>/gaps.md and the briefs again, and prints "merged: <n> tasks",
 *       "pending: <id>, ..." for tasks still holding PENDING and, with gaps, "gaps: <count>" and the
 *       block of viber:plan-fixer.
 *   apply <plan> <fix file>
 *       Applies every "@@ EDIT" / "@@ WITH" / "@@ END" block of the fix file to the plan, in order,
 *       all or none: the lines up to "@@ WITH" must occur exactly once in the plan (trailing blanks
 *       ignored) and are replaced by the lines up to "@@ END". Writes the "fix: " lines outside the
 *       blocks to <dir>/fixes.md, the briefs again when the plan has some, and prints
 *       "applied: <n> edits" and "fixes: <path>".
 *   fix <plan> [--findings <file>]... [--brief <file>]... [--gaps]
 *       The block of viber:plan-fixer, "add: lines" on it when neither findings nor gaps are named.
 *
 * A block opens on "NEXT: dispatch | agent: viber:<name>" and its prompt is every line below that
 * line, then the text of each "add:" field the line names: "add: input" ("input:" and the
 * confirmed summary or diagnosis verbatim, when no summary file was given), "add: answered" (one
 * "Answered: <decision> -> <option>" line per answer of the user) and "add: lines" (what the fixer
 * is to fix). Every block opens on "plan: <plan>" and "refs: <plugin root>/references"; "out:" is
 * the file the agent writes when plan mode names it none of its own. The lines of a block, in
 * order, a line left out when it has no value:
 *   plan-surveyor   plan, refs, outline, out, input
 *   plan-architect  plan, refs, templates, memory, mode, outline, reach, candidates, out, input
 *   plan-detailer   plan, refs, memory, tasks, brief, candidates, out
 *   plan-fixer      plan, refs, templates, memory, decisions, findings and brief (one line per
 *                   file), gaps, candidates, out, input
 *
 * Contract:
 *   argv   : <command> <plan> and the command's own arguments, as above.
 *   cwd    : any directory inside the repository; its root is resolved from it.
 *   env    : none.
 *   reads  : the plan file, the files named in argv, the config (build.memory) and, for the reach
 *            search, tracked files and untracked files the repository does not ignore, binary
 *            files, each target's own file and everything under .temp/ left out.
 *   writes : under <dir> = <repository root>/.temp/viber/planner: plan-build (the plan path, the
 *            summary file and the candidates file of the last survey), outline.md, decisions.md,
 *            slice-*.md, gaps.md, fixes.md, reach-<yyyy-mm-dd-HH-MM-SS>.md (per target "## <target>",
 *            "terms:", an optional "skipped:", at most 200 lines "<path>:<line>: <text>" and a
 *            "truncated:" line past that cap) and reach-paths.md (per target "## <target>" and one
 *            "<path> | <hit count>" line per file), a target past the cap ending on the same
 *            "truncated:" line; and the plan file itself (skeleton, merge, apply).
 *   stdout : the lines above; nothing on an error.
 *   stderr : "error: <reason>" on exit 2 and 5; one "FIX: <defect>" line per defect on exit 4.
 *   exit   : 0; 2 on misuse, outside a repository or a file that cannot be read or written; 4 when
 *            what an agent wrote cannot be used (nothing is written then); 5 when the plan file
 *            itself cannot be written.
 */

import { systemClock } from "../../../lib/adapters/clock.ts";
import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runPlanBuild } from "../../../lib/plan-build.ts";

const result = runPlanBuild(process.argv.slice(2), process.cwd(), process.argv[1], { fs: nodeFs, git: gitCommand, clock: systemClock });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

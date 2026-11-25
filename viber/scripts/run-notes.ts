/*
 * run-notes.ts - prints what became of every open item the plan review left in a
 * landed plan and of every ruling the build made, then every path a task commit
 * refused and every pair of tasks the build put in sequence, one line each. The
 * entry holds no logic: viber/lib/run-notes.ts reads the run and builds the
 * lines.
 *
 * A plan review leaves its notes in the "## Open items" section of the plan, and
 * plan-index.sh --split hands each task its own as "- N<k>:" lines of the task
 * file. What a coder did with a note sits in its notes file under work/, which
 * the archive of the run drops, and a ruling sits in rulings.md, which nobody
 * opens once the build is over; a refused path and a sequenced pair sit in
 * status.md, which the archive drops too. This script joins them into the one
 * list commit-task.sh --leftovers writes into outcome.md, so after a build the
 * user reads that list and never the plan. run-summary.sh takes its refused
 * lines for the final summary of every close, the one with no closeout included. It is a script and not a step of an agent
 * because the join is fixed (an item, its number, the line carrying that number)
 * and a model asked to do it drops or merges lines. Callers run it through the
 * wrapper run-notes.sh, which keeps its call line.
 *
 * Contract:
 *   argv   : $1 the landed plan file, <run>/plan.md (REQUIRED, exactly one):
 *            relative to the cwd or absolute, a backslash read as "/". The run
 *            directory is the directory holding it.
 *   cwd    : the repository root, the base a relative plan path resolves
 *            against (its callers commit-task.sh and run-summary.sh run
 *            there, the second one with an absolute plan path). No git
 *            command runs.
 *   env    : none.
 *   reads  : the plan (its "## Open items" section: "- critical|note |
 *            <task id>|plan | <text>" lines, any other line there ignored),
 *            <run>/status.md (the "skipped:" list, the "<task id>:<path>"
 *            entries of its last "refused:" line, split on blanks, "%20",
 *            "%09" and "%25" of a path read back as a space, a tab and "%",
 *            and its "decision: <id>:
 *            sequenced after <other>: both need <path>" lines), <run>/rulings.md
 *            (its "- " entries) and <run>/work/<task id>-coder.md of each task
 *            holding a note, each as UTF-8; with a refused entry also the Files
 *            lines of the plan's task blocks and the two extras files
 *            <run>/work/<id>-extra.md and -extra-review.md of every task. A
 *            missing status.md, rulings.md, notes or extras file reads as empty.
 *   writes : nothing.
 *   stdout : on exit 0, in this order, one line each and nothing when there is
 *            none:
 *              - critical | <task id>|plan | <text> | open
 *              - note | <task id> | N<k> | <text> | <outcome>
 *              - note | plan | <text> | for the user
 *              - ruling | <the rulings.md entry without its "- ">
 *              - refused | <task id> | <path> | claimed by task <id>
 *              - sequenced | <task id> | after <task id> | <path>
 *            A critical line per open critical problem, in section order. A task
 *            note line per "note" item naming a task, in section order, N<k>
 *            counted from 1 per task as plan-index.sh --split numbers them in
 *            the task file; <outcome> is "task skipped" for a task on the
 *            skipped list, else the text of the first line "N<k>: <text>" (a
 *            leading "- " allowed, at column 0) of that task's notes file, else
 *            "no coder line" (no file, no such line, or one with no text). A
 *            plan note line per "note" item naming "plan". A ruling line per
 *            entry of rulings.md, in file order. A refused line per entry of
 *            the "refused:" key, in its order: the claimant is the first task
 *            in plan order, other than the refused one, whose Files or extras
 *            file lists the path, the line ending "claimed by another task"
 *            when none lists it any more. A sequenced line per sequenced
 *            decision line, in file order.
 *   stderr : one "error: ..." line on exit 2.
 *   exit   : 0 the list was printed, an empty one included.
 *            2 unusable argv (no argument, more than one, an empty one) or a
 *              plan file that does not exist or cannot be read; nothing on
 *              stdout.
 */

import { nodeFs } from "../lib/adapters/fs.ts";
import { runRunNotes } from "../lib/run-notes.ts";

const result = runRunNotes(process.argv.slice(2), process.cwd(), { fs: nodeFs });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

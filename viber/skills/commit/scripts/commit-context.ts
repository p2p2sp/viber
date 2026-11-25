/*
 * commit-context.ts - prints the context the commit fork composes its message
 * from: the resolved selector, the issue footer, the branch, the recent commit
 * subjects (the repo's type/scope style to match), and the git status and diff of
 * the selected set, the diff capped so it cannot flood the fork's context. The
 * entry holds no logic: viber/lib/commit-context.ts does all of it over the
 * selector reading of viber/lib/commit-args.ts, and the commit skill runs it
 * through the wrapper commit-context.sh, which keeps its call line.
 *
 * Contract:
 *   argv   : $1 selector (optional) - the skill's whole raw argument string,
 *            read as in commit.ts: ""/all -> all, existing paths -> paths (the
 *            context narrowed to them), named paths none of which exists ->
 *            missing.
 *   cwd    : any directory inside the repository to commit in; git runs at its
 *            root, so every path printed is root-relative.
 *   env    : none read. A "[", "*" or "?" in a selector is part of a file name,
 *            never a glob.
 *   plugin root : three directories above the entry's own, cut as text from the
 *            path it was started by, forward slashes: C:/... on Windows
 *            whichever spelling invoked the wrapper.
 *   stdout : the commit call first, as a directive line, then markdown
 *            sections. Mode all: RUN: "<plugin root>/skills/commit/scripts/commit.sh"
 *            "<message>"; mode paths adds the paths label single-quoted as a
 *            third argument; mode missing prints only STOP: Nothing committed -
 *            paths not found: <missing>. <message> is the slot the fork
 *            replaces. Then, always, the
 *            "## Issue footer" section whose one line is Refs: #<n>[, #<n>]...
 *            (the arguments' references when any, else the branch's single
 *            task.<n> or issue.<n> number, either case) or none; then the
 *            "## Current branch" section. The diff is capped at MAX_LINES with a notice
 *            naming the real total; an empty diff beside a non-empty status
 *            (untracked files only) says outright that commit.sh still has
 *            work to commit.
 *            What git reports on its stderr for the log, the status and the
 *            diffs stands in front of their output.
 *   exit   : 0 in every data condition: a failed git call leaves its section
 *            empty or holding git's message.
 */

import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runCommitContext } from "../../../lib/commit-context.ts";

process.stdout.write(runCommitContext(process.argv.slice(2), process.cwd(), process.argv[1], { fs: nodeFs, git: gitCommand }));

/*
 * memory.ts - the deterministic steps of the memory skill around its
 * memory-editor agents: which directories are targets and what each agent is
 * briefed with. The entry holds no logic: lib/memory-run.ts routes the call.
 *
 * A node is a file CLAUDE.md in a directory, a section a file CLAUDE.<topic>.md
 * in the directory of its node, the root the CLAUDE.md at the repository root.
 * CLAUDE.local.md belongs to the user and is never a node or a section. A
 * target is a directory of the repository, `.` the root. A path in the argv is
 * resolved against the cwd. A path written to a brief is repo-relative, `.`
 * the root; a path printed on stdout is absolute with forward slashes. No call
 * stages or commits: the result stays in the work tree. <work> is
 * .temp/viber/<id>/memory/ at the repository root.
 *
 * Contract:
 *   argv   : prepare <id> update|rewrite [<dir>...]
 *              <id>   : the run id, letters, digits, `.`, `_`, `-`.
 *              <dir>  : a target directory; none is the root. A repeat is
 *                       dropped; the order is kept.
 *              Everything is validated before any file changes. Clears <work>.
 *              In `rewrite`, first: when a CLAUDE.md node or CLAUDE.<topic>.md
 *              section in a target or below it is untracked, staged, modified
 *              or deleted, prints `REFUSED: <repo-relative path>` per such
 *              file, in path order, for all targets, and stops: nothing is
 *              deleted, no brief is written.
 *              Then deletes each orphan of the whole repository below the root,
 *              in both modes, no agent: a CLAUDE.md node or CLAUDE.<topic>.md
 *              section whose directory and its subdirectories hold no tracked
 *              file other than CLAUDE*.md. An orphan that git status lists is
 *              kept. Deletes from the work tree only, so the deletions stay
 *              unstaged. Writes <work>/orphans.txt, one line per orphan in path
 *              order: `deleted: <path>` or `kept, uncommitted: <path>`.
 *              In `rewrite`, then deletes the committed CLAUDE.md nodes and
 *              CLAUDE.<topic>.md sections in each target and below it (never
 *              the root directory, never CLAUDE.local.md), from the work tree
 *              only: the index is not touched, so the deletions stay unstaged.
 *              Then writes <work>/brief-<k>.md for target k (1, 2, ... in
 *              argument order), one `<label>: <value>` a line:
 *                mode: update | rewrite
 *                repo: <absolute repository root>
 *                target: <dir>              repo-relative, `.` for the root
 *                note: <work>/note-<k>.md   the note file the agent writes,
 *                                           repo-relative
 *                root: verify               only for the target `.`, and only
 *                                           while the root CLAUDE.md exists: the
 *                                           agent verifies the root (R24)
 *                root: new                  while the root CLAUDE.md is missing,
 *                                           in every brief of a target (R27)
 *              While the root CLAUDE.md is missing, also writes <work>/brief-root.md:
 *                mode: root
 *                repo: <absolute repository root>
 *                note: <work>/note-root.md
 *              whose agent creates the root (R26).
 *              Prints `BRIEF: <absolute path of brief-<k>.md>` per target, in
 *              order, then the BRIEF line of brief-root.md when written: one
 *              memory-editor each, in parallel.
 *   check <id>
 *              Reads the briefs of prepare <id>. Prints one
 *              `BACK: <brief> | take off: <n> bytes from <file> | unlinked: <file>...`
 *              line per target with a violation, in brief order; <brief> is the
 *              absolute brief path, <file> repo-relative, the violations in
 *              path order. Prints `DONE` when none. A section (a CLAUDE.<topic>.md
 *              below the root) whose node (the CLAUDE.md of its directory) names
 *              no line holding its file name as a whole word, or has no node, is
 *              a violation `unlinked: <file>`. A violation is a node (a
 *              CLAUDE.md below the root) or a section (a CLAUDE.<topic>.md
 *              below the root) over 6000 bytes, or a node whose chain (the
 *              root CLAUDE.md, every ancestor node, the node) is over 16000
 *              bytes while the chain files outside its target stay within
 *              16000 bytes; the excess is the chain's. A file is named once,
 *              by its larger excess, under its deepest target. When prepare
 *              wrote <work>/brief-root.md (the root was missing), a root
 *              CLAUDE.md over 2000 bytes (R30) gets one more BACK line after
 *              the target lines, `BACK: <brief-root.md> | take off: <n> bytes
 *              from CLAUDE.md`, sent back once like a target. Any other root
 *              CLAUDE.md is never named by BACK; CLAUDE.local.md is never checked.
 *              A target already sent back (listed in <work>/sent.txt by an
 *              earlier check) prints no BACK line: its violations are written
 *              to <work>/over.txt as `OVER: <file> <n> bytes` (n the excess) or `unlinked: <file>`,
 *              one per file. A chain whose files outside the target (the root
 *              CLAUDE.md and every ancestor node outside it) alone exceed
 *              16000 bytes costs the target nothing: each such file is written
 *              to over.txt as `OVER: <file> <n> bytes` (n its size), once per
 *              file, whatever the target's state; a file also named by a
 *              sent-back violation keeps that line's excess. Every target
 *              given a BACK line is added to sent.txt. Deletes and restores
 *              nothing.
 *   report <id>
 *              Prints `## CLAUDE.md`, an empty line, then the `claude: ` lines
 *              of the note of the target `.` (its brief's note) in note order;
 *              prints `## Missing in CLAUDE.md`, an empty line, then the
 *              `missing: ` lines of <work>/note-root.md in note order;
 *              prints `## Orphan nodes`, an empty line, then the lines of
 *              <work>/orphans.txt; prints `## Over budget`, an empty line, then
 *              the lines of <work>/over.txt. A section with no line is not
 *              printed; a section after another is preceded by an empty line.
 *   cwd    : any directory inside the host project, a git repository.
 *   exit   : 0 done, or refused (REFUSED lines on stdout); 2 with one `error: memory.sh: ...` line on stderr on a bad
 *            argument (an unknown subcommand or mode, a bad id, a target
 *            outside the repository, a target that is no directory), outside
 *            a repository, a report or check with no prepare for <id>, or on a failed
 *            file operation.
 */

import { run } from "./lib/memory-run.ts";

process.exitCode = run(process.argv.slice(2), process.cwd());

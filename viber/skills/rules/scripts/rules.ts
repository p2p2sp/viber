/*
 * rules.ts - the deterministic steps of the rules skill around its
 * rules-editor agents: which user rules can be adopted, which rule goes to
 * which target, what each agent may write, whether it kept to it, and the
 * report. The entry holds no logic: lib/rules-run.ts routes the call.
 *
 * A rule is a `.md` file under .claude/rules/; the plugin's rules live flat in
 * .claude/rules/viber/<topic>.md, every other rule is the user's own. A target
 * is a directory of the repository, `.` the root. A file a rule's `paths:`
 * globs match is a file of `git ls-files`. A path in the argv is resolved
 * against the cwd. A path printed on stdout or written to a brief is absolute
 * with forward slashes; the report and state.json are repo-relative. A file
 * has uncommitted changes unless it is tracked and equal to HEAD (untracked,
 * ignored, staged and changed all count). No call stages or commits:
 * deletions and moves are plain file operations, the result stays in the work
 * tree. The scripts never write rule content. <work> is
 * .temp/viber/<id>/rules/ at the repository root.
 *
 * Contract:
 *   argv   : list
 *              Prints `OWN: <path>` for each rule under .claude/rules/ outside
 *              .claude/rules/viber/, sorted; nothing when there is none. Writes
 *              nothing.
 *            prepare <id> <mode> [<dir>...] [--adopt <file>...]
 *              <id>   : the run id, letters, digits, `.`, `_`, `-`.
 *              <mode> : update | rewrite.
 *              <dir>  : a target directory; none is the root. A
 *                       repeat is dropped; the order is kept and decides ties.
 *              <file> : a user rule picked for adoption (each argument after
 *                       `--adopt`), under .claude/rules/ outside viber/.
 *              Everything is validated before any file changes; then, in order:
 *              1. Dead rules: a rule of viber/ with `paths:` that match no
 *                 file is deleted, or kept when it has uncommitted changes.
 *                 Both modes, no agent.
 *              2. Assignment: every other rule of viber/ goes to the target
 *                 holding the most files its `paths:` match, a tie to the first
 *                 target named; a rule with no `paths:` goes to the first
 *                 target. A rule matching no file of any target is not
 *                 assigned and not touched.
 *              3. rewrite: deletes every assigned rule; with the root among the
 *                 targets, every rule of viber/ but a dead kept one. When any
 *                 of them has uncommitted changes, the whole call is refused:
 *                 a `REFUSED: <path> has uncommitted changes` line each, exit
 *                 3, nothing deleted or moved, no <work> written. update
 *                 deletes nothing here.
 *              4. Adoption: a picked file with `paths:` moves to
 *                 viber/<file name> and is assigned as in 2, to the first
 *                 target when it matches no file of any target (in both modes,
 *                 a rewrite never deletes it). A picked file with no `paths:`
 *                 stays where it is and is handed to the first target under
 *                 `adopt:`.
 *              5. Room: 20000 minus the bytes of viber/ now, split evenly
 *                 between the targets, rounded down. When viber/ is over, the
 *                 excess is split by the bytes of the rules assigned to each
 *                 target, rounded up: negative for a target owning bytes, 0
 *                 for one owning none. An agent's own deletions add to it.
 *              A file operation failing in 1 to 5 or in writing <work> exits 2,
 *              its error line naming the deletions and moves done before it.
 *              Clears <work>, then writes <work>/brief-<k>.md for target k
 *              (1, 2, ... in argument order), one `<label>: <value>` a line:
 *                mode: <mode>
 *                target: <dir>
 *                rule: <path>               one per rule assigned, none on a
 *                                           rewrite but the adopted ones
 *                rule limit: 2000 bytes
 *                room: <n> bytes            the net growth of viber/ it may add
 *                own: <path>                one per user rule outside viber/ not
 *                                           adopted: read only to avoid a
 *                                           duplicate, never verified or changed
 *                adopt: <path>              first target only, one per adopted
 *                                           file with no `paths:` (never in an
 *                                           `own:` line of the first target)
 *                note: <work>/note-<k>.md   the note file the agent writes
 *              and <work>/state.json: per target its directory, brief, note,
 *              rules and room; the hash and byte size of every file of viber/
 *              at this point; the dead rule lines.
 *              Prints `BRIEF: <work>/brief-<k>.md` per target, in order: one
 *              rules-editor each, in parallel.
 *            check <id>
 *              Run after the agents returned, once more after the send-back.
 *              A changed file is one of viber/ (now or in state.json) whose
 *              content differs from state.json: new, changed or deleted. It
 *              belongs to the target whose note names it in a `file:` line, as
 *              the path before its first `|` (the first such note), else the target it was assigned to by
 *              prepare, else the target its `paths:` give by the rule of
 *              prepare 2, else the first target.
 *              Violations of a target: a changed file over 2000 bytes, a
 *              changed file with no `paths:`, the net growth of its changed
 *              files (bytes now minus bytes in state.json, a deleted file
 *              negative) over its room.
 *              First check with violations of a target: prints one line
 *                BACK: <brief> | <violation> | <violation>...
 *              each violation one of
 *                take off: <n> bytes from <file>   (over the rule limit)
 *                no paths: <file>
 *                take off: <n> bytes               (growth over its room)
 *              The skill sends that agent back once with them.
 *              A later check with violations of a target sent back: prints
 *              nothing for it and records for the report, replacing the last
 *              record, `OVER: <file> <n> bytes` per file over the limit,
 *              `OVER: <dir> <n> bytes` for growth over the room, `no paths:
 *              <file>` per file with none. Nothing is deleted or restored: the
 *              user decides before committing.
 *              Prints `DONE` when it printed no BACK line. Rewrites state.json.
 *            report <id>
 *              Joins the notes of every target with the findings of prepare
 *              and check into <work>/report.md and prints it. A note line
 *              counts only by its prefix, after indentation and a `- ` or `* `
 *              bullet; any other line is ignored:
 *                check: <a linter or test check to add>
 *                claude: <a suggestion for the root CLAUDE.md>
 *                removed: <file> - <reason>
 *                file: <path> | <file>, <file>   every rule file the agent
 *                                  wrote, changed, moved or deleted, then the
 *                                  files proving it (read by check only)
 *              The report: `# Rules report`, then each non-empty section in
 *              this order, `## <heading>`, an empty line, one `- ` line each:
 *                Proposed checks   the `check:` texts
 *                CLAUDE.md         the `claude:` texts
 *                Removed rules     the `removed:` texts
 *                Dead rules        `deleted: <path>`, `kept, uncommitted: <path>`
 *                Over budget       the OVER and `no paths:` records of check
 *                Missing notes     each note file absent
 *   cwd    : any directory inside the host project, a git repository.
 *   exit   : 0 done; 3 a rewrite refused; 2 with one `error: rules.sh: ...`
 *            line on stderr on a bad argument (an unknown subcommand or mode, a
 *            bad id, a target or a picked file outside the repository, a target
 *            that is no directory, a picked file absent, not a
 *            rule or inside viber/, two picked files or a picked file and a
 *            rule of viber/ with one file name, compared ignoring case),
 *            outside a repository, with no or a damaged state.json for check
 *            and report, or on a failed file operation. Exit 3 and every exit
 *            2 but a failed file operation of prepare change no file.
 */

import { run } from "./lib/rules-run.ts";

process.exitCode = run(process.argv.slice(2), process.cwd());

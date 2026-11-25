/*
 * plan-build.ts - prints the dispatch blocks of the planner's writing agents and of the plan
 * judge, cuts a mapped change into the slices its authors get, assembles what they wrote into the
 * plan, and counts the review rounds. The entry holds no logic: viber/lib/plan-build.ts does the
 * work. The planner runs it through the wrapper plan-build.sh, which keeps its call line.
 *
 * It exists because plan text, reach lines, fixes and review findings carried through the
 * planner's session are typed again by the session, into the plan file or into the next agent's
 * prompt, because a session that counts review rounds itself runs as many as it likes, and
 * because tasks written by several authors at once can be numbered and ordered by no one of
 * them. Here an agent writes a file, the session passes its path and a verdict word, and the
 * script reads and writes the files, numbers the tasks, computes every Depends-on line, sends
 * each defect to the owner of its text, opens at most two review rounds and says what comes next.
 *
 * Commands, <plan> the absolute path of the plan file plan mode names:
 *   survey <plan> [--input <summary file>] [--phase]
 *       The block of viber:plan-surveyor. It removes the work files of the last survey first, with
 *       one exception: --phase on the plan path of that survey, when the last outline of it
 *       printed a split proposal, keeps them and adds "outline: <dir>/outline.md" when that file
 *       exists, so a phase cut from a split starts from the outline of the whole change. The path
 *       alone keeps nothing: plan mode names one plan file for a whole session, the plan abandoned
 *       before this one included. It writes no plan text and so leaves the review rounds as they
 *       stand: they start again at the assemble that follows it.
 *   outline <plan> <survey file>
 *       Copies the survey file to <dir>/outline.md, searches its TARGET: lines (below), cuts its
 *       areas into slices (below), writes <dir>/slices.md and prints
 *         TASKS: <n>                     the sum of the estimates of its AREA: lines
 *         FILES: <m>                     the count of its FILE: lines
 *         SLICES: <s>                    the slices of the cut
 *         threshold: <n> tasks, past 30  only past 30 tasks
 *         threshold: <m> files, past 60  only past 60 files
 *         DECIDE: <...>                  each DECIDE: line, as written
 *         Split proposal:                only with a threshold: line and PHASE: lines: the text of
 *         <each PHASE: line>             each, then "Open decisions:" and "- <decision>" per
 *                                        DECIDE: line (its text before the first "|")
 *       then, for one slice, the block of viber:plan-author with "mode: whole" (that author
 *       writes the whole plan), and for two or more the block of viber:plan-architect, who
 *       writes the frame. A survey file is refused (exit 4) when it cannot be read, with no AREA:
 *       line, with an AREA: estimate that is no number, and with a FILE: line whose area no AREA:
 *       line names.
 *   frame <plan> <frame file>
 *       Only for a change cut into two or more slices. Cuts the frame file at its
 *       "<!-- SLICES -->" and "<!-- DECISIONS -->" lines: the plan text above them (frontmatter,
 *       the specification half, "## Tasks" alone, "## Contracts" with the blocks two or more
 *       slices share) goes into the plan file, the "SLICE: <k> | covers: AC1, AC3 | uses: C1 |
 *       <what the slice delivers>" lines into <dir>/frame-slices.md, the decision log into
 *       <dir>/decisions.md. It writes one brief per slice (below) and prints "plan: <plan>",
 *       "slices: <s>" and one block of viber:plan-author with "mode: slice" per slice. Refused
 *       (exit 4): a frame file that cannot be read, a plan text that does not open on "---",
 *       whose frontmatter holds no "source:" line, that holds no "## Tasks" line or holds a task
 *       block, a slice with no SLICE: line, a SLICE: line of no slice, an acceptance criterion on
 *       no SLICE: line, a "uses:" block the plan text lacks.
 *   assemble <plan> <slice>=<author file>...
 *       Every slice in one call. An author file holds the text of its slice, then
 *       "<!-- NOTES -->", then "FACT: <path>:<line> | <quote> | <what the plan takes from it>",
 *       "GAP: <what the frame lacks or states wrong>" and "OUTSIDE: <path> | <the behaviour that
 *       reference keeps>" lines. The text of a slice is its task blocks and, below them, the
 *       "### L<n> - <name>" contract blocks it alone uses; the text of the one author of an
 *       unframed change is the whole plan. It puts the task blocks under "## Tasks" in slice
 *       order, moves each task behind the tasks it needs (Order, below), numbers them T1.. as
 *       they then stand, reads each task id an author wrote in a Delivers, Verification or DoD
 *       line through the new numbers (the numbers of its own slice, outside backticks), gives
 *       each L<n> block the next free C<k> (the token renamed in the Uses, Delivers and DoD
 *       lines of the tasks), writes every "- Depends-on:" line (below), lists each OUTSIDE:
 *       line under "### Out of scope" as "- <path> - <text>", below the
 *       heading "#### References kept" it writes there, and writes the plan, the FACT: lines of
 *       each slice to <dir>/notes-<k>.md, <dir>/owners.md and the briefs. After a survey it is
 *       the one command that starts the review rounds again, at round 0: the plan text is new.
 *       Assembled again with no survey since, a plan keeps its rounds. Then it checks the
 *       written plan in process with the plan-index core (the checks of a plan that never
 *       landed, and those of its summary file), places every reach file (below) and prints
 *         assembled: <n> tasks
 *         shared: <path> | <id>, <id>    per file two or more tasks list
 *         threshold: <n> tasks, past 30  only past 30 and past the count keep recorded
 *       then the first that applies:
 *         GAP: lines on a framed plan whose frame was not corrected yet: they go to
 *           <dir>/gaps.md as "GAP: slice <k> | <text>", and "gaps: <count>" is followed by the
 *           fix block of viber:plan-architect naming that file, and as "findings:" the defects
 *           the check found in the text of the frame, so that its fix leaves none it was never
 *           shown. The defects of the slice authors wait for the apply of that fix. A GAP:
 *           line arriving later, or on an unframed plan, becomes
 *           "- critical | plan | frame gap: <text>" ("gap: <text>" with no frame);
 *         a defect of the check: "NEXT: fix | defects" and one fix block per owner of a defect;
 *         else "NEXT: judge".
 *       Refused (exit 4, nothing written): an author file that cannot be read, holds no task
 *       block, or holds a task block with no "### <id> - <title>" heading; the whole plan of an
 *       unframed change not opening on "---", or whose frontmatter holds no "source:" line.
 *   keep <plan> <count>
 *       Records the task count the user kept past the limit and prints "accepted: <count>".
 *   judge <plan>
 *       Opens the next review round and prints the block of viber:plan-judge:
 *         NEXT: dispatch | agent: viber:plan-judge | round: <r>[ | add: input] | add: answered
 *         plan: <plan>
 *         round: <1|2>
 *         input: <summary file>          only with a summary file (else "add: input")
 *         changed: <dir>/changed.md      only in round 2, when the fix of round 1 changed text
 *         out: <dir>/judge-<r>.md
 *       While the verdict of a round is awaited it prints that round's block again and counts
 *       nothing. Once the review is over (a PASS, the end of round 2) it prints "NEXT: exit-plan"
 *       and the OPEN: lines (below) and no block: no command opens or accepts a round 3, and
 *       none reviews again a text that was not assembled anew. While the fix of a round is open
 *       it exits 2.
 *   judged <plan> <PASS|FAIL|DENIED|none> [--out <file>]
 *       Takes the verdict word of the judge's reply and the file of its "OUT:" line. The judge
 *       file holds "VERDICT: PASS | FAIL", "CRITICAL: <where> | <what is wrong> | <what to
 *       change>" and "NOTE: <T<n>|plan> | <one line>" lines. With no round awaiting a verdict it
 *       exits 2, "error: no review round is open". It prints
 *         judge: round <r> | <PASS|FAIL|DENIED|none> | critical: <n> | notes: <m>
 *       then the first that applies:
 *         a readable file holding a CRITICAL: line, whatever the word: the NOTE: lines go into
 *           "## Open items" of the plan (below), the file is copied to <dir>/judge-<r>.md, each
 *           CRITICAL: line goes to the owner of the text it names (below), and
 *           "NEXT: fix | round: <r>" is followed by one fix block per owner;
 *         PASS: the notes and the copy as above (no file: neither), then "NEXT: exit-plan" and
 *           the OPEN: lines;
 *         FAIL with no readable file or with a file holding no CRITICAL: line:
 *           "NEXT: judged | none" and no round counted. The NOTE: lines of a readable file go
 *           into "## Open items" first (the none report names no file) and are counted on the
 *           judge: line; nothing else is written. The reply is no verdict and is reported
 *           again as none: the plan gate takes a FAIL as answered by an apply or an open, and
 *           in round 2 by that call;
 *         none, the first time in the round: "NEXT: redispatch" and the same judge block, the
 *           round still awaiting its verdict;
 *         the second none in round 1: "STOP: the plan stays unreviewed - no hand-off";
 *         the second none in round 2: the plan gets
 *           "- note | plan | review round 2 returned no usable result" and "NEXT: exit-plan"
 *           with the OPEN: lines follows;
 *         DENIED in round 2: the plan gets
 *           "- note | plan | review round 2 did not run: a tool call was refused" and
 *           "NEXT: exit-plan" with the OPEN: lines follows.
 *       DENIED in round 1 exits 2: that refusal is the user's to answer.
 *   apply <plan> <owner>=<fix file>...
 *       Every owner of one fix step in one call, <owner> a slice number or "frame". Applies
 *       every "@@ EDIT" / "@@ WITH" / "@@ END" block of each fix file to the plan, in order,
 *       all or none: the lines up to "@@ WITH" must occur exactly once in the plan (trailing blanks
 *       ignored) and are replaced by the lines up to "@@ END". Outside the blocks it reads the
 *       "fix: <where> - <change>" and "unfixed: <where> - <why>" lines and the
 *       "GAP: <T<n>|frame> | <what that owner must change>" lines, and lists each
 *       "OUTSIDE: <path> | <the behaviour that reference keeps>" line under "### Out of scope"
 *       as assemble does (blanks and a list mark in front of one dropped). Then it numbers the
 *       tasks T1.. again (a task the fix adds carries an id no task of the plan holds, a
 *       contract block it adds the id L<n>; the open items and the owners follow the new
 *       numbers, and so does each task id in a Delivers, Verification or DoD line), orders the
 *       tasks and writes every "- Depends-on:" line again and checks the candidate as assemble
 *       checks the plan, the placement of every reach file included, before anything is written.
 *       Refused (exit 4, nothing written, every line "FIX: owner <owner>: <defect>"): a fix file
 *       that cannot be read, a marker
 *       line out of order, an edit block and no "fix: " line outside the blocks, no edit block
 *       unless the file holds an "OUTSIDE: " line, or "unfixed: " or "GAP: " lines and no
 *       "fix: " line, an edit whose text does not occur once, a task block with no heading or
 *       under an id the plan holds, a candidate that still holds a defect of an owner of the
 *       call, and one holding a defect the plan did not hold, unless a GAP: line of the call
 *       sends it on to its owner.
 *       A GAP: line of the frame owner naming a task goes to the author of that task; one of
 *       a slice author naming "frame" goes to the architect once per plan; every other GAP:
 *       line becomes an open critical item ("- critical | <T<n>|plan> | gap: <text>", "frame
 *       gap: <text>" for the frame). It writes the plan, <dir>/owners.md and the briefs and
 *       prints "applied: <n> edits", then the first that applies:
 *         an owner still to fix (a gap sent on, or a defect the plan held before in the text of
 *           an owner outside the call): "NEXT: fix | gaps" or "NEXT: fix | defects" and one fix
 *           block per such owner;
 *         the fix answered "NEXT: fix | round: 1": "NEXT: judge";
 *         it answered "NEXT: fix | round: 2": "NEXT: exit-plan" and the OPEN: lines;
 *         the review is over (a change made after it): "NEXT: exit-plan" and the OPEN: lines;
 *         else (no review round opened yet, or round 2 still due): "NEXT: judge".
 *       A fix answering "NEXT: fix | round: <r>" also settles the open items: an open
 *       critical problem whose <where> a "fix: " line names is closed, and each CRITICAL: line of
 *       <dir>/judge-<r>.md that no "fix: " line names, or that an "unfixed: " line names, becomes
 *       "- critical | <T<n> or plan> | <what is wrong>[ (not fixed: <why>)]" (an "unfixed: " line
 *       naming no CRITICAL: line: "- critical | <where> | not fixed: <why>"). In round 1 it
 *       writes <dir>/changed.md (every "fix: " line, then per edit a line "## edit <n>" and its
 *       new lines, the lines it listed under "### Out of scope" as one edit more; no edit, no
 *       file), which the fix of an owner a gap was sent on to adds to;
 *       in round 2 it adds per "fix: " line "- note | T<n> | fixed after the last review:
 *       <change>" (a <where> that is no task id: "- note | plan | fixed after the last review:
 *       <where> - <change>"). While an owner a gap of the round was sent on to still owes its
 *       fix, the round stays open and <dir>/pending.md holds what is owed.
 *   open <plan>
 *       Gives up the fix of the open round, when a fix file cannot be had or applied: every
 *       CRITICAL: line of <dir>/judge-<r>.md becomes an open critical item of the plan, or, once
 *       those were settled, every line of <dir>/pending.md does. It prints "NEXT: judge" after
 *       round 1, "NEXT: exit-plan" and the OPEN: lines after round 2. Once the review is over it
 *       gives up the fix of a change made after it: the plan gets
 *       "- critical | plan | a change asked for after the review was not applied" and
 *       "NEXT: exit-plan" with the OPEN: lines follows. With no fix to give up (no review round
 *       opened, a verdict awaited, or round 2 still due) it exits 2.
 *   fix <plan>
 *       The fix block of the frame owner of a framed plan, of slice 1 of an unframed one, with
 *       "add: lines" on it: for the user's own change and for accepted decision records.
 *
 * Slices. The areas of the survey, in its order, are cut so that one author reads its files
 * once: consecutive areas join one slice while it stays within 8 estimated tasks and 200000
 * bytes of existing files (a file the change adds counts for nothing). An area past the bytes
 * alone is cut into runs of its files, each within them; an area past the tasks alone stays
 * one slice. <dir>/slices.md holds one "SLICE: <k> | <area>[, <area>] | <bytes> | <path>,
 * <path>..." line per slice. A brief, <dir>/slice-<k>.md, written by frame and again by
 * assemble and apply from the plan as it stands, holds under "## " headings: Delivers (the text
 * of its SLICE: line), Must not change, the Acceptance criteria its SLICE: line and its tasks
 * cover, its Tasks, the Contracts its SLICE: line and its tasks use, Files (its FILE: lines,
 * " | <bytes>" appended), the File map lines of its files, Reach (the sections of the paths
 * page naming them) and Notes (the NOTE: lines of the survey naming one of its files). An
 * unframed plan has no brief.
 *
 * Owners. <dir>/owners.md holds "<id> | <owner>" per task and contract block: the slice number
 * of the author who wrote it, or "frame" for a block of the frame and for a task the frame
 * owner added. A finding or a defect goes to the owner of the text it names: a task or a
 * contract block to its owner, an uncovered acceptance criterion to the slice whose SLICE:
 * line covers it, a "line <n>" defect to the owner of the block that line sits in, an unplaced
 * reach file to the slice whose SLICE: line of <dir>/slices.md holds the file of its target, a
 * ring of tasks (Order, below) to their author when one slice wrote them all, everything else
 * to the frame owner. Every owner of an unframed plan is slice 1. What an owner is to fix is
 * written to <dir>/fix-in-<owner>.md, its CRITICAL:, FIX:, SPLIT: and GAP: lines.
 *
 * Order. assemble and apply keep the tasks in the order they stand in, slice by slice, and
 * move a task only behind a producer that stands after it: the first task writing a contract
 * block it uses (that task lists the block's File: path and names the block in Uses) when no
 * task before it writes that block, and the first task listing a file its Verification,
 * Delivers or DoD names when no task before it lists that file and the tree does not hold it.
 * So a slice may use what a later slice creates, and the numbers need not follow the slices.
 * Tasks that need each other in a ring keep their order and are one defect:
 *   FIX: cycle: <id> needs <block or path> of <id>, <id> needs <block or path> of <id> - no
 *   order builds each after what it needs: move a contract block or a file so that one of
 *   them needs nothing of the next
 *
 * Depends-on. No author writes a dependency: every "- Depends-on:" line is "none" or the ids
 * of the earlier tasks a task waits for, ascending. A task waits for an earlier one when both
 * list one Files path, when its Uses names a contract block whose File: path the earlier one
 * lists while naming that block in its own Uses, or when its Verification, Delivers or DoD
 * names a file the earlier one lists; an edge reached through another is dropped.
 *
 * Reach placement. assemble and apply hold every file of <dir>/reach-paths.md to a place in
 * the plan: the Files of a task, a "### File map" line or a line under "### Out of scope"
 * naming its path. That page holds the files referring to a path or symbol the change
 * modifies, moves or deletes: a "<path> | new" target has nothing referring to it, so the
 * lines naming its directory go to the candidates file alone and place nothing. The lines the
 * script lists itself stand below "#### References kept": a task file takes "### Out of scope"
 * up to the first heading below it, so they stay in the specification and reach no task file.
 * A file in none of the places is one defect, naming the first target it refers to:
 *   FIX: reach: <path> refers to <target> and sits in no task Files, no File map line and no
 *   Out of scope line - list it or write an OUTSIDE: line
 * With no reach paths page nothing is placed.
 *
 * Open items. "## Open items" is the last section above "## Tasks", written by this script alone
 * and left out of a plan with no item:
 *   - critical | <T<n>|plan> | <text>     an open critical problem of the review
 *   - note | <T<n>|plan> | <text>         a note: of a task (it reaches that task file) or of the
 *                                         plan (for the user alone)
 * Critical items come first, then the notes task by task. A task keeps at most 3 notes, the ones
 * opening with "fixed after the last review:" ahead of the judge's in file order; each note past
 * the third is rewritten as "- note | plan | (T<n>) <text>". A <where> that is no task id of the
 * plan becomes "plan", named in front of the text ("<where> - <text>"). "NEXT: exit-plan" is
 * always followed by one "OPEN: <critical|note> | <T<n>|plan> | <text>" line per open item,
 * critical first, and by nothing else. No command prints a line asking the user.
 *
 * A block opens on "NEXT: dispatch | agent: viber:<name>" and its prompt is every line below that
 * line, then the text of each "add:" field the line names: "add: input" ("input:" and the
 * confirmed summary or diagnosis verbatim, when no summary file was given), "add: answered" (one
 * "Answered: <decision> -> <option>" line per answer of the user) and "add: lines" (what the
 * owner is to fix). A writing block names its slice on "slice: <k>", a fix block its owner on
 * "owner: <owner>". Every block opens on "plan: <plan>", a writing block then on
 * "refs: <plugin root>/references"; "out:" is the file the agent writes when plan mode names it
 * none of its own. The lines of a block, in order, a line left out when it has no value:
 *   plan-surveyor   plan, refs, outline, out, input
 *   plan-architect  plan, refs, templates, memory, outline, slices, reach, candidates, out,
 *                   input; as the fix block of the frame: plan, refs, templates, memory, mode,
 *                   outline, slices, decisions, findings, gaps, out, input
 *   plan-author     plan, refs, templates, memory, mode, slice, then for "mode: whole" outline,
 *                   reach, candidates, out, input; for "mode: slice" brief, candidates, out; as
 *                   a fix block ("mode: fix") brief, notes, findings, out, and input on an
 *                   unframed plan, which has no brief
 *   plan-judge      plan, round, input, changed, out (no refs: it reads no reference file)
 *
 * Contract:
 *   argv   : <command> <plan> and the command's own arguments, as above.
 *   cwd    : any directory inside the repository; its root is resolved from it.
 *   env    : none.
 *   reads  : the plan file, the files named in argv, the config (build.memory), the planner
 *            templates (their slots), the size of each existing file of the survey and, for the
 *            reach search, tracked files and untracked files the repository does not ignore,
 *            binary files, each target's own file and everything under .temp/ left out.
 *   writes : under <dir> = <repository root>/.temp/viber/planner: plan-build (one "key: value"
 *            line each: plan, input and candidates, the plan path, the summary file and the
 *            candidates file of the last survey; split, yes when its outline printed a split
 *            proposal; round, the review rounds opened, 0 to 2; await, judge, fix, gaps or
 *            none, what the open round waits for, done once the review is over; retry, 1 once
 *            its judge was sent again; accepted, the task count keep recorded, or none; slices,
 *            the slices of the last outline; frame-fixes, 1 once the frame was corrected;
 *            surveyed, 1 from a survey to the assemble after it), outline.md, slices.md,
 *            frame-slices.md, decisions.md, slice-<k>.md, notes-<k>.md, owners.md, gaps.md,
 *            fix-in-<owner>.md, judge-<r>.md, changed.md, pending.md,
 *            reach-<yyyy-mm-dd-HH-MM-SS>.md (per target "## <target>", "terms:", an optional
 *            "skipped:" for the terms under 3 characters, an optional "common:" and at most 200
 *            lines "<path>:<line>: <text>") and
 *            reach-paths.md (per target "## <target>" and one "<path> | <hit count>" line per
 *            file), which holds no section for a "<path> | new" target and is not written
 *            when no target has one; and the plan file itself (frame, assemble, judged, apply,
 *            open). A derived term of a whole-file target (its file name, that name without its
 *            extension, the directory of an index file), or the directory of a "<path> | new"
 *            target, whose hits span more than 25 files is searched no
 *            more and named on "common: <term> (<n> files)"; the path itself and a symbol are
 *            never dropped. A target past 200 hit lines keeps at most 2 lines per file, files
 *            in path order, and ends on "truncated: <kept> of <total> lines kept, 2 per file
 *            at most" in the candidates file and on "truncated: <total> lines, <kept> kept in
 *            <candidates file>" in reach-paths.md. A survey that starts a new plan removes
 *            every .md file of <dir>.
 *   stdout : the lines above; nothing on an error.
 *   stderr : "error: <reason>" on exit 2 and 5; one "FIX: <defect>" line per defect on exit 4.
 *   exit   : 0; 2 on misuse (the error line names the call to make), outside a repository, or
 *            when a work file cannot be written or the plan file cannot be read; 4 when what an
 *            agent wrote cannot be used, a file of its that cannot be read included (nothing is
 *            written then); 5 when the plan file itself cannot be written.
 */

import { systemClock } from "../../../lib/adapters/clock.ts";
import { nodeFs } from "../../../lib/adapters/fs.ts";
import { gitCommand } from "../../../lib/adapters/git.ts";
import { runPlanBuild } from "../../../lib/plan-build.ts";

const result = runPlanBuild(process.argv.slice(2), process.cwd(), process.argv[1], { fs: nodeFs, git: gitCommand, clock: systemClock });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

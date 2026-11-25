// archive-run.ts - moves a finished run's lasting work out of the runs
// directory and into the archive, dropping the scaffolding the build needed
// only while it was running, and commits the move. The entry holds no logic:
// viber/lib/archive-run.ts does all of it, and the closeout agent runs it through
// the wrapper archive-run.sh, which keeps its call line.
//
// A run directory is two things at once: the specification and the QA documents,
// which are worth reading months later, and the plan, the state file, the task
// decomposition and the trail - all of which duplicate what git already holds.
// Left whole, the second half buries the first. This script keeps the first and
// removes the second in one commit, so the archive reads like a specification
// rather than like a process log.
//
// It exists as a script rather than as a few lines in an agent for the reason
// every deterministic step here does: the operation is fixed (git, a basename,
// an enumerated list of paths), and a hand-composed `git mv` plus `git rm` is
// exactly the composition that deletes the wrong tree when the run is not shaped
// the way the caller assumed. The two gates below are the whole point - the
// caller is refused rather than corrected.
//
// The directory is MOVED, never copied file by file, and the caller edits
// spec.md BEFORE calling, so both sides of the move land in ONE commit and what
// the build changed about the specification is an ordinary diff in the history.
// That is why there is no changelog here - the history is the changelog. Git's
// rename detection then pairs the two sides whenever the edit left the file
// recognisably itself, which a few markers and a closing section on a real
// specification do; a very short spec rewritten more than half over falls under
// git's own 50% threshold and reads as an add plus a delete until `git log -M30`
// or `--follow` is asked for it. The commit is the same either way.
//
// Contract:
//   argv   : $1 run directory (REQUIRED), repository-relative, exactly as
//            plan-path.sh printed its `path:` line minus `/plan.md`; an
//            absolute path inside the repository is read as its relative form.
//            The safety gate rejects every path outside docs/<runs>/, an
//            absolute one outside the repository and one carrying a `..`
//            segment included: that is not a typo to fix up, it is the signal
//            that the caller is outside this script's contract.
//   cwd    : any directory inside the host repository - the script moves to the
//            repository root itself, because the argument is relative to it.
//            Outside a repository the cwd is the base every path resolves
//            against.
//   env    : none read. Git's writes run with GIT_LITERAL_PATHSPECS=1.
//   file   : <repo root>/.claude/viber.yml (optional) - `runs` and
//            `specifications` inside its `directories:` group, resolved and
//            sanitized exactly as config.sh resolves them, defaulting to
//            `_specs` and `specs`. An unusable value is ignored.
//   removes: once the run is archived, the scratch the build and its planning
//            left under <repo root>/.temp/viber/ (the enumerated list below).
//            Best effort: a path that cannot be removed is left, silently, and
//            changes neither stdout nor the exit code.
//   stdout : ALWAYS exactly one line, and never anything else - every byte of
//            git noise goes to stderr:
//              ARCHIVED: docs/specs/<key> (<n> files)
//              ARCHIVED: docs/specs/<key> (<n> files - no git repository)
//            <key> is the run directory's own name, kept unchanged, so a second
//            build of the same area lands beside this one and nothing is ever
//            merged or overwritten. <n> counts the files the archive holds after
//            the scaffolding is gone.
//   exit   :
//     0 - archived
//     1 - a file step failed (the archive root cannot be created, the directory
//         cannot be moved outside a repository, a scaffolding path cannot be
//         removed), or the run held scaffolding alone; after the move it stands
//         and nothing is committed
//     2 - unusable argv: no argument, more than one, a directory that does not
//         exist, or one the safety gate refuses (outside docs/<runs>/, carrying
//         a `..` segment, or holding no status.md); every trailing slash is
//         stripped first, and an argument whose run key then comes out empty or
//         `.` ("/", "//", ".", "./") is refused as `error: refused <argument as
//         typed> - no run key` with nothing moved
//     3 - the destination already exists; nothing is touched
//     4 - the run is unfinished: a task of plan.md is in neither `done:` nor
//         `skipped:` of status.md; nothing is touched
//     5 - a git step failed. A failing `git mv` is the realistic one and leaves
//         the run exactly where it was; a failure after it leaves the directory
//         moved and the move uncommitted, which `git status` shows.
//
// The scaffolding is an enumerated list - plan.md, status.md, tasks/, work/ -
// so anything else the run left behind travels into the archive on its own,
// without this script having to know what it is.
//
// The scratch is an enumerated list too, never all of .temp/viber/: each task
// directory the plan names, `lessons`, `test-runner/`, `final-fix/`,
// `repair-*/` and `extension-*/` of the build, and `intent/summary-*.md`,
// `planner/reach-*.md`, `planner/review-round` and `fixer/tree-record` of its
// planning. Left behind, they pile up run after run, and a stale task state or
// lessons file is read by the next build of the same task id. Every other skill
// keeps its files (prototype mockups, code-auditor findings, pr-feedback,
// handoff, e2e). A build running at the same time in the same repository shares
// these names, so its scratch goes too.
//
// Once the last run has left, docs/<runs>/ is removed too, before the commit:
// git tracks no directory, so an empty one would only linger in the working
// tree. It goes only when it holds nothing at all - a sibling run or any stray
// file keeps it.

import { nodeFs } from "../lib/adapters/fs.ts";
import { gitCommand } from "../lib/adapters/git.ts";
import { gitWriteCommand } from "../lib/adapters/git-write.ts";
import { runArchiveRun } from "../lib/archive-run.ts";

const result = runArchiveRun(process.argv.slice(2), process.cwd(), { fs: nodeFs, git: gitCommand, write: gitWriteCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

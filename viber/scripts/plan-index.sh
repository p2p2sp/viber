#!/usr/bin/env bash
#
# plan-index.sh - compact task index for the orchestrator, plus plan structure
# validation and, on demand, the decomposition the per-task agents read.
#
# Usage:
#   plan-index.sh <plan-file>            validate + index (the planner's call)
#   plan-index.sh <plan-file> --split    ... and decompose (the orchestrator's call)
#   plan-index.sh <plan-file> --extra <task-id>
#                                        the reviewer's scope for one task (below)
#   plan-index.sh <plan-file> --dispatch <task-id> coder|reviewer
#                                        the labelled lines of one dispatch (below)
#   plan-index.sh <plan-file> --slice <id>[,<id>]...
#                                        the commits and files of a final-review slice (below)
#   plan-index.sh <plan-file> --final-review
#                                        the final-review dispatch blocks (below)
#   plan-index.sh <plan-file> --input <summary-file>
#                                        validate + index, and check the plan against the
#                                        planner's input (below)
#
# stdout (the orchestrator's only view of the plan - the decomposed files are read
# by agents):
#   plan: <path>
#   title: <plan title>
#   progress: <done>/<total>
#   skipped: T4                     only when status.md carries the entry
#   unreviewed: T3                  only when status.md carries the entry
#   deferred: T7:src/a.ts           only when status.md carries the entry
#   closed: memory rules            only when status.md carries the entry
#   decision: T2: <text>            one per "decision:" line of status.md, in
#                                   file order, printed as it stands there
#   ruling: T2: retry | why: <why> | cost if wrong: <cost>
#                                   one per "- " entry of rulings.md beside the
#                                   plan (commit-task.sh --rule), leading "- "
#                                   dropped, in file order, after the decision
#                                   lines; none when the file is absent
#   next: phase <n> of <N> - <name>
#                                   only when the plan's phases have an entry after
#                                   the one marked "(this plan)": that entry, its
#                                   1-based position, the entry count, the name
#                                   without its marker (e.g. next: phase 3 of 4 - X)
#   tasks: id | state | tdd | excl | hard | deps | feeds | files | title
#   T1 | done | none     | -   | -   | -  | C1:1 | .claude/settings.json | Tighten the settings schema
#   T2 | todo | required | yes | yes | T1 | -    | src/a.ts,src/b.ts     | Add the retry loop
#   verify: T1 | node --test tests/settings.test.ts
#   verify: T2 | grep -n "retry" src/a.ts
#   profile: T2 | tier: opus | review: opus | subject: T2 [TDD] - Add the retry loop
#                                   --split only: one per task neither done nor
#                                   skipped, in task order, after the verify:
#                                   lines (below)
#   dirty: T2 | src/a.ts            only for a task not done whose own files are
#                                   dirty (its "Repro:" path excepted)
#   orphan: lib/x.ts                one line per changed path claimed by no task
#   orphan: lib/y.ts                not "done" (run directory excluded), in git
#                                   order, a path holding a comma kept whole;
#                                   no line when none
#   NEXT: extension | step: 1 | name: write-help
#   run: <dir>                      --split only, after the orphan: lines: one block
#   spec: <dir>/spec.md             per name of the config build.extensions: line
#   notes: <dir>/work/              (steps split on ", ", the names of a step on
#   out: .temp/viber/extension-write-help/   " + "), in listed order, its step: the
#                                   number of the step among those keeping a name,
#                                   from 1. A name status.md closed: holds as
#                                   extension:<name> prints no block and a step
#                                   whose every name is closed takes no number;
#                                   "build.extensions: none" prints none. Blocks
#                                   follow each other with no blank line.
#   NEXT: qa-kept                  --split only, last (after every extension block),
#   RUN: "<plugin root>/scripts/commit-task.sh" --qa "<plan>" "<dir>/qa.md" "<dir>/qa.e2e.md"
#                                   when build.qa is true, <dir>/qa.md or <dir>/qa.e2e.md
#                                   exists and closed: does not name qa: the --qa call
#                                   over each of the two present, qa.md first;
#                                   <plugin root> is cut as under --dispatch. No block
#                                   otherwise.
#   review: single                last, on a fresh plan only (a plain call with
#   dispatch: viber:planner-review  no status.md beside the plan; a landed plan,
#                                   --split and --extra print none of it): a plan
#                                   of 12 tasks or fewer
#   review: set                     a plan of more than 12 tasks: the spec and graph
#   dispatch: viber:planner-spec-review     reviewers, then one task reviewer per
#   dispatch: viber:planner-graph-review    slice - ceil(n / 8) runs of consecutive
#   dispatch: viber:planner-task-review | tasks: T1-T7     tasks, sizes differing
#   dispatch: viber:planner-task-review | tasks: T8-T13    by at most one, the
#                                   larger first, cut as plan-gate.sh cuts them
#                                   (13 tasks -> T1-T7, T8-T13)
#   threshold: 31 tasks, past 30    only past 30 tasks and, with --accepted <n>, past
#                                   <n> tasks, after the dispatch lines
#
# --extra <task-id> prints, instead of the index, the scope a reviewer checks
# beyond the task's own Files, read from the coder extras file
# <run-dir>/work/<task-id>-extra.md (one path per line; the reviewer file
# <task-id>-extra-review.md is never read):
#   extra: lib/x.ts,src/a.ts        the file paths in file order, minus a blank
#                                   line, a repeat, one under .temp/, one the
#                                   task's own Files lists and one a task not yet
#                                   done lists; a carriage return and a leading
#                                   "./" are stripped first, a backslash of a
#                                   relative path is read as "/", an absolute path
#                                   inside the repository is folded to its
#                                   repo-relative form (one outside stays as
#                                   written)
#   recheck: T1 | node --test tests/a.test.ts
#                                   one per done task whose Files lists a path of
#                                   the extra line, in task order, its Verification
#                                   command as on "verify:"
# Nothing at all when no path remains or the file is missing, exit 0. The plan is
# validated as under --split. An id the plan does not hold, or --extra with
# --split, exits 2.
#
# --dispatch <task-id> coder|reviewer prints, instead of the index, the labelled
# lines of that task's dispatch, a line omitted when its value is empty. <dir> is
# the plan's directory, <plugin root> this script's invoked path with its trailing
# "/scripts/<name>.sh" cut off as text (backslashes read as "/", never resolved).
# The plan is validated as under --split.
#   coder:    task: <dir>/tasks/<id>.md
#             notes: <dir>/work/<id>-coder.md
#             out: .temp/viber/<id>/
#             refs: <plugin root>/references
#             extras: <dir>/work/<id>-extra.md
#             decide-file: <dir>/work/<id>-options.md
#             baseline: <dir>/work/tests-baseline.md   only when config.sh prints
#                                   build.baseline-tests fast or full
#             deferred: <path>, <path>     the "deferred:" entries of status.md
#                                   naming the id
#             prior: <dir>/work/<dep-id>-coder.md, ...   the task's own deps
#             decision: <task-id>: <text>  one per status.md decision line of the
#                                   task or of one it depends on, directly or
#                                   through another, in file order
#             run-lessons: <Name> x<n>, ...   the second line of
#                                   <repository root>/.temp/viber/lessons, a
#                                   "lessons: " prefix dropped, when not empty
#   reviewer: task:, notes:, out:, refs:, baseline:, deferred:, decision: as above, then
#             extras: <dir>/work/<id>-extra-review.md
#             scope: "<plugin root>/scripts/plan-index.sh" "<plan>" --extra "<id>"
# An id the plan does not hold, a form other than coder or reviewer, or --dispatch
# with --split or --extra, exits 2.
#
# --slice <id>[,<id>]... prints, instead of the index, what a final review of those
# tasks reads, over the commits since the oldest commit that added the plan file:
#   commit: T3 | 1a2b3c4 | T3(2) - Add the retry loop
#                                   one per commit whose subject is "<id> - <title>"
#                                   or "<id>(<n>) - <title>" of a slice task (the
#                                   title as the plan holds it), oldest first, the
#                                   short sha as git rev-parse --short prints it
#   file: src/a.ts                  one per path those commits changed or removed,
#                                   in byte order, each once, minus every path a
#                                   commit of a task outside the slice also changed
#                                   when that task is numbered below the slice
#                                   task of the highest number
# Nothing at all, exit 0, when no commit matches or no commit added the plan. The
# plan is validated as under --split and no file is written. An id the plan does
# not hold, or --slice beside --split, --extra or --dispatch, exits 2.
#
# --final-review prints, instead of the index, the dispatches of the final review:
#   NEXT: skip                      status.md closes final-review, or no task is done
# or one block per slice, the tasks cut into ceil(n / 8) runs of consecutive tasks in
# index order, skipped ones included, sizes differing by at most one, the larger
# first (as the planner review slices are cut):
#   NEXT: final-review | slice: <k> | model: <sonnet clamped into tiers.min..tiers.max>
#   run: <dir>
#   tasks: <id>, <id>, ...
#   report: <dir>/work/final-review-<k>.md
#   refs: <plugin root>/references
#   memory: <the build.memory value config.sh prints>
#   scope: "<plugin root>/scripts/plan-index.sh" "<plan>" --slice "<id>,<id>,..."
# <plugin root> is cut as under --dispatch. The plan is validated as under --split and
# no file is written. --final-review beside --split, --extra, --dispatch or --slice
# exits 2.
#
# --input <summary-file> (validate mode only, never beside --split, --extra, --dispatch,
# --slice or --final-review: exit 2, "error: --input cannot be combined with ...") reads
# the file as text and adds three checks to the validation, each a "FIX:" line (exit 4,
# every defect of the run printed together); a plan validated without it runs none of
# them. The lines it reads open at line start with "Attachment: <path>", "Root cause:"
# or "Repro: <path>":
#   FIX: input: Attachment <path> has no entry in the attachments map - add one (Attachments)
#                                   an Attachment path no entry value of the frontmatter
#                                   "attachments:" map holds, one line per path
#   FIX: input gives a root cause but the plan has no "## Root cause" section - add it (Root cause)
#   FIX: the plan carries a "## Root cause" section its input gives no cause for - drop it (Root cause)
#                                   the input gives a cause when it carries a "Root cause:"
#                                   line or an Attachment path under .temp/viber/code-auditor/;
#                                   the heading counts outside a fenced block
#   FIX: input: Repro <path> is on no task Repro: line - put it on the fixing task (Reproduced)
#                                   a Repro path no task "Repro:" line holds (a leading "./"
#                                   dropped), one line per path
# A missing summary file exits 2 with "error: input file not found: <path>".
#
# --accepted <n> (digits only; validate mode, beside --input too, never beside --split,
# --extra, --dispatch, --slice or --final-review: exit 2, "error: --accepted cannot be
# combined with ...") is the task count the user already kept past the threshold: the
# "threshold:" line is then printed only when the count is also above <n>. A missing or
# non-digit value exits 2 with the usage line; without it the line is printed past 30 alone.
#
# --split removes, once the plan is validated and decomposed and before the index
# is printed, the coder and reviewer extras files of every task not done; a done
# task keeps its files.
#
# "feeds" is the comma-separated "<id>:<count>" entries of the contract blocks
# whose "File:" path is in this task's "Files" and which at least one OTHER
# task names in "Uses", <count> being how many do - "-" when none. It is what
# tells the orchestrator, without opening a file, how load-bearing a task's
# work is for others: a block on "File: none" feeds nothing, since no task
# holds that path.
#
# "verify:" carries the orchestrator the one thing it needs to decide a
# reviewer waiver without ever opening a task file: one line per task, in task
# order, right after the task rows and before any "dirty:" line. Its value is
# the task's own "Verification" text up to its first " -> ", trimmed - the
# whole value when it carries no arrow - with one pair of wrapping backticks
# removed (the first and last character of the value, the rest trimmed again;
# inner backticks stay, and a value not opening AND closing with a backtick is
# printed unchanged). The "recheck:" value is the same. The command is always the last field,
# so a "|" inside it (a shell pipeline) is part of the command, not a column
# break.
#
# "profile:" (--split only) is the model tier of each open task and of its review, so
# the orchestrator decides only what needs the project. Three shapes:
#   profile: <id> | tier: <tier> | review: <tier> | subject: <subject>
#   profile: <id> | tier: <tier> | review: waive? <tier> | subject: <subject>
#   profile: <id> | haiku? | mechanical: <tier> review <tier> | else: <tier> review <tier> | subject: <subject>
#   (the last one's "else:" part reads "<tier> waive? <tier>" when the review may be waived)
# Rules, before the clamp: "hard" yes -> opus; "TDD: none" over at most 2 Files and not
# hard -> the "haiku?" line (mechanical haiku, else sonnet); any other task -> sonnet.
# The review tier is the task tier raised to sonnet from haiku and to opus on a task
# whose feeds entry counts 3 or more. "waive?" marks a sonnet task with TDD none and no
# feeds entry of 3 or more: its review is waived when its "verify:" line runs the
# project build or its tests, else it runs at the tier printed after "waive?". Every
# printed tier is clamped into config.sh tiers.min..tiers.max (haiku < sonnet < opus <
# fable) after that is decided; a "haiku?" line keeps both alternatives whatever the
# clamp makes of them. The subject is "<id> - <title>", "<id> [TDD] - <title>" on a
# "TDD: required" task.
#
# The run's state is read from status.md beside the plan - "done", "skipped",
# "unreviewed", "deferred" and "closed", one key per line,
# "none" for an empty one. The plan
# itself is never written to after it lands, so nothing here parses it for
# progress; a plan with no status.md beside it (one being validated before it
# ever landed, a run whose first commit has not happened) simply has nothing
# done. The state lines and the "dirty" lines are what a session that did
# not start the build needs. A "deferred" entry is "<task-id>:<path>" - code an
# earlier task left without its own test because the criterion that proves it
# belongs to that task, which is how a resumed session still knows who owes the
# proof. Any other key of status.md is ignored. A "decision:" line is the build's ruling on a stalled task
# (commit-task.sh --decide), "decision: <task-id>: <text>", any number of them;
# a status.md with none prints exactly what it printed before the line existed.
# "state" is "done", "skipped" or "todo"; a "dirty"
# line means that task's own files carry uncommitted work, so an earlier session
# was cut off mid-task and a fresh coder would land on top of it. An "orphan"
# line lists changed paths no coder would otherwise reach (a "done" task's own
# files included, since nothing dispatches onto it again), its run directory
# exclusion relying on "$dir" being the repo-relative plan path plan-path.sh
# prints, as commit-task.sh's run_dir() does. Everything else
# a resume needs is already derivable, so nothing here is stored twice.
#
# "Repro:" is the second optional field: the one path of a fixing task that the
# fixer skill left in the tree as a RED reproduction test, deliberately
# uncommitted. It is always uncommitted when the build starts, so counted as
# dirty it would read as an interrupted session and stop the build on a
# question with only one right answer. It never enters a "dirty" line; every
# other path of that task still does.
#
# "excl" is "yes" for a task the plan marked "Exclusive: true" - work that cannot
# share the working tree or a machine-wide resource (a fixed port, one database),
# so the orchestrator dispatches it alone. The plan declares the constraint and
# this script only carries it: nothing here decides whether two tasks may run
# together.
#
# "hard" is "yes" for a task carrying a "Hard: <reason>" line - the third
# optional field, the plan's mark for a task whose design it cannot settle in
# advance, which the orchestrator alone turns into a model tier. A "Hard:" line
# with no reason is refused; the reason itself stays in the task file.
#
# "Files:" is a comma-separated list of exact repo-relative file paths - no
# patterns, no directories, no annotations - so the same list drives the commit
# and the collision check below. A pattern is decided by SHAPE, not by the mere
# presence of a bracket: "*" and "?" are always one, and a "[" is one unless it
# wraps a WHOLE path segment as "[name]", "[...name]" or "[[...name]]" - the
# three Next.js App Router dynamic segments, where the brackets are part of the
# file's own name. A bracket inside a segment ("src/a[bc].ts") stays a glob
# character class and is still refused.
#
# --split writes, into the plan's OWN directory (docs/_specs/<stamp>_<slug>/):
#   spec.md        - everything above "## Tasks": goal, acceptance criteria, scope.
#                    WHAT and WHY, read by the user and by the closing writers.
#                    The frontmatter and every HTML comment are cut out of it:
#                    both belong to the run, not to the specification the
#                    archive keeps. A fenced block (``` or ~~~ up to a
#                    bare closing fence of the same character at least as long
#                    as the opening one) is content and
#                    stays whole, comments and blank lines included, and a
#                    heading line inside one is body text: it neither cuts
#                    the plan, opens a section nor splits a contract block.
#                    The "## Phases" section is cut out of it too, into phases.md.
#                    It ends with "## Attachments" when <run>/attachments/ (the
#                    files plan-path.sh --land copied there) holds an entry:
#                    one line per file or directory, its repo-relative path
#                    ("$dir" is the repo-relative run directory, as for the
#                    orphan line), a directory ending in "/", sorted by name;
#                    no directory or no entry, no section.
#   phases.md    - only when the plan carries a "## Phases" section: that
#                    section, heading included, up to the next "## " heading,
#                    its HTML comments dropped. The phases of a split change and
#                    the decisions settled for the later ones, which a later
#                    phase's interview resumes from; committed with the rest.
#   tasks/<id>.md  - the whole job of one coder: its task block, then the
#                    plan's "## Goal", the text of the criteria its "Covers:" line
#                    names, the "## Contracts" blocks its "Uses:" line names, the
#                    plan's "### Must not change" when the big shape has one,
#                    the plan's "### Out of scope". It carries no attachment or
#                    prototype section: a task that needs an attached file names
#                    it itself. The block is
#                    verbatim but for its "- DoD:" line, cut on ";" outside
#                    backtick spans (the clause count limit cuts the same way) into one
#                    "- DoD.<k>: <clause>" line per clause (no ";" -> "DoD.1",
#                    an empty trailing clause dropped): a coder answers for each
#                    clause and a reviewer gates each one, which a single
#                    sentence carrying seven of them does not allow. The plan
#                    keeps the one line it was written as - the decomposition is
#                    the only place the DoD is cut.
#   status.md      - the run's state, created empty and only when it is not there
#                    yet: an existing one carries progress and is never rewritten
#                    here. From then on commit-task.sh is the only writer, which
#                    is what keeps the plan and the specification frozen.
# A coder handed tasks/T3.md CANNOT see the other tasks, so it cannot drift into
# their files - that isolation is the point, not the token saving. It is handed
# nothing else either: the file is self-contained, which is why the "## Contracts"
# appendix sits BELOW the tasks and reaches a coder only through "Uses:" - a
# shared contracts section in the specification would put every route, type and
# error code of the whole plan into the context of a task that touches one.
#
# Each contract block opens with "File:" - the paths its shape is declared in, or
# "none" - which is what makes the appendix checkable against the task map: the
# task holding that path is the block's writer, so a path no task creates and a
# path whose holders never name the block are both plan defects caught here
# rather than by a coder editing a file outside its own map. An appendix where no
# block carries the line at all predates it and is left alone: a plan is frozen
# once it lands, so a run resumed after an upgrade must still validate.
# tasks/ is rebuilt from scratch on every call, so a re-run after a plan edit
# carries no stale task file, and the decomposition is committed together with the
# plan and attachments/ when the run holds files there (pathspec-scoped,
# best-effort): it lives under docs/, so leaving it
# uncommitted would have every later commit-task.sh run report it as left behind.
#
# Validation (exit != 0, nothing on stdout, nothing written) - catches plan drift
# before a build starts. Every plan defect is one stderr line opening on "FIX: " (the
# message as listed below, without any "error: " prefix), or on "SPLIT: " for a
# task past its Files or DoD cap; an argument error or a missing plan or input file
# (exit 2) keeps its "error: " line:
#   2 - plan file missing or unusable, an argument that is not --split or
#       --extra <task-id>, --extra beside --split, a --extra id the plan does not
#       hold, a --dispatch with an unknown id or form or beside --split or
#       --extra, a --slice with an unknown id or beside --split, --extra or
#       --dispatch, a --final-review beside any of those four, an --input beside any of
#       those five, an --input file that is missing, or a --split pointed at anything but the run's own <dir>/plan.md
#   3 - no <!-- TASK --> blocks
#   4 - broken task contract (<!-- TASK --> blocks under no "## Tasks" heading,
#       where the cut would leave tasks/ empty while the index still lists
#       them; a <!-- TASK --> block that opens before that heading has ever
#       been seen, which would ride into spec.md instead of its own task
#       file while the index still lists it; duplicate id, an id that is not [A-Za-z0-9_-]+,
#       missing field, illegal dependency, an "Exclusive:" value other than
#       "true", a "Repro:" that is not one path of the same task's "Files:" or
#       sits on a task not marked "TDD: none", a "Covers:" criterion absent from the
#       acceptance criteria, an acceptance criterion no task's "Covers:" names, a
#       "Uses:" contract absent from the appendix, a contract block no task's
#       "Uses:" names, a malformed or duplicate contract heading, a contract
#       block with no "File:" line (even one where no block in the whole
#       appendix carries the line at all - exempted as below), a contract file that no task's "Files:" creates and the tree
#       does not already hold, a contract file whose holders never name the
#       block in "Uses:", an unparseable "Files:" entry, the same file listed
#       by two tasks with no dependency path between them - they would run at
#       the same time -, a task naming a contract block in "Uses:" with no
#       dependency path, direct or transitive, to a lower-numbered task that
#       holds the block's "File:" path and names it in its own "Uses:" (the
#       consumer would run beside its writer; the error names both tasks),
#       a "Depends-on" naming a task marked "Exclusive: true": that task is a
#       leaf of the dependency graph, so nothing may depend on it, or a
#       "Depends-on" entry another entry of the same line already reaches,
#       directly or transitively (the edge orders nothing; the error names the
#       task, the entry and the one reaching it), or a "DoD:" line naming
#       another task of the plan as a whole token outside a backtick span
#       (its own id never matches - prove each clause inside the task itself,
#       naming a file or symbol instead), or a "DoD:" or "Delivers:" line naming
#       a contract block of the appendix as a whole token outside a backtick
#       span while the task "Uses:" does not name it (a token with no block in
#       the appendix names nothing; stderr, one line per block:
#       "FIX: task <id>: <DoD|Delivers> names <block id>, missing from its
#       Uses - add it to Uses"), or a task holding more "Files:"
#       entries or "DoD:" clauses than its TDD value allows - 12 and 6 on
#       "required", 25 and 10 on "none" (it bundles several behaviours -
#       split it), or a read-after: a "Verification:", "Delivers:" or "DoD:" line naming,
#       as a whole path token (a backtick, a quote, a space or a sentence period
#       bounds it, a longer path or a bare file name inside one does not), a
#       file a lower-numbered task lists in its "Files:" while no dependency
#       path, direct or transitive, joins the two (the reader would run beside
#       the writer; the error names the reader, the path and the writer), or a
#       file the tree does not hold that only higher-numbered tasks list, none
#       of them the reader or a lower-numbered task (stderr: "FIX: task <id>
#       reads <path>, which only the later task <other> creates - move the
#       reading after <other> (Read after)", <other> the lowest-numbered lister;
#       the "Delivers:" of a task whose every "Files:" path lies under docs/adr/
#       is no reading), or an
#       integration test: a "Files:" path under a directory segment "integration"
#       or one holding integration[-_.]?tests? (case folded), or whose file name
#       holds ".integration.", while no command of its "Verification:" text before
#       the first " -> " (cut at ";", ",", "&&", "||" and "|", a grep, git grep or
#       rg command never counting) names the path, a directory of it at or below
#       that test directory, or a file inside such a directory (stderr: "FIX:
#       task <id>: Files writes <path> under an integration test directory, which
#       no Verification command names - list or type-check that file or its test
#       project there (Layered)"; a "Verification:" that is the word PENDING alone,
#       a skeleton task plan-build.sh merge fills later, is not checked), or a git grep: a command of its "Verification:"
#       text before the first " -> " (cut at ";", "&&", "||" and "|") that runs
#       git grep with no --untracked and names, as a token, a "Files:" path the
#       tree does not hold (stderr: "FIX: task <id>: Verification runs git grep
#       without --untracked over <path>, which this task creates and git grep
#       never reads - add --untracked or use grep (Provable)"), or a task id that is
#       not T<k>, the <k>th task block in order (Ids), a contract id that is not C<k>,
#       the <k>th block in order (Blocks), or a task title opening with a commit type
#       prefix - feat, fix, docs, style, refactor, perf, test, build, ci, chore or
#       revert, case folded, an optional (scope), an optional "!", then ":" (Title),
#       or a "Verification:" whose command before the first " -> " is wrapped in
#       backticks, runs inline interpreter code (node or ruby with -e, python or
#       python3 with -c, perl with -e, in command position - a quoted argument of
#       another command is none), or runs a script under .temp/ (a command word
#       starting with .temp/ or ./.temp/, or the first non-option argument of bash,
#       sh or an interpreter starting that way - a redirect target or another
#       command argument is none), each with its own error naming the fix
#       (Provable), or a task whose "Files:" lists a file named CLAUDE.md (a path
#       whose last segment is exactly that, the root one included) while
#       build.memory is on - the "build.memory: true" line "config.sh" prints,
#       run in the caller cwd (never the plan directory, so a plan outside the
#       repository is held to it too) and only on a fresh plan; with the switch
#       off or no .claude/viber.yml the case never fires, and a CLAUDE-notes.md
#       or CLAUDE.run-scripts.md is none (stderr: "FIX: task <id>: Files lists
#       <path> while build.memory is on - drop it, the build close updates every
#       CLAUDE.md (Memory-owned)"), or a frontmatter "attachments:" map (the
#       indented entry lines up to the first line that is not indented, a blank
#       line skipped, a name being what precedes the first ":" of an entry) holding
#       a name that is not one path component matching
#       ^[A-Za-z0-9][A-Za-z0-9_.-]*$ (stderr: "FIX: attachments: name "<name>" is
#       not one path component of letters, digits, _, . and - opening on a letter
#       or digit - rename it (Attachments)") or repeating an earlier one, case
#       folded ("FIX: attachments: name "<name>" repeats an earlier one - rename
#       one of them (Attachments)"), or a "DoD:" line naming attachments/<name>, the
#       first path component after the prefix a sentence period does not close, with
#       no <name> entry in a map the plan carries (a plan with no frontmatter or no
#       "attachments:" key has none to check; "FIX: task <id>: DoD names
#       attachments/<name>, absent from the attachments map - add a <name> entry or
#       drop the reference (Attachments)"), or a template slot left in the plan text:
#       a "<...>" span of the planner templates (spec-full.md, spec-lite.md and
#       tasks.md under ../skills/planner/templates, located from this script, read
#       at run time outside their HTML comments; no templates directory, no check),
#       found on a plan line outside a fenced block, an HTML comment, a backtick span
#       and the "## Contracts" appendix ("FIX: line <n>: template slot <slot> left
#       unfilled - replace it (Filled)"; one per line and slot), or a "### " heading
#       outside a fenced block under a "## Behaviour" section that is neither
#       "### Edge cases" nor "### S<k> - <title>", <k> being the heading's place among
#       the section's "### " headings but "### Edge cases", counted from 1 (stderr:
#       "FIX: line <n>: scenario heading "<heading>" must be "### S<k> - <title>", the
#       <k>th scenario in order - number it (Scenarios)"; a plan with no "## Behaviour"
#       section has none to check), or a "- modify - <path>" or "- delete - <path>" line
#       under "### File map" (outside a fenced block) naming a path the tree does not hold
#       ("<path>" cut at the first " - ", a comma-separated list checked path by path,
#       a wrapping backtick pair and a leading "./" dropped; an "add" line is none;
#       stderr: "FIX: file map: <modify|delete> <path>, which the tree does not hold -
#       correct the path or list it as add (File map)", one per path).
#       The last twenty cases and the parenthetical one above are exempted under --split
#       and under --extra, and on a plain call whose plan has status.md beside
#       it (a landed run plan): a plan that landed before the rule is frozen,
#       and a run resumed after the upgrade must still validate and decompose.
#       A plain call with no status.md beside the plan (a fresh plan) applies
#       every rule.
#       One run prints every defect the plan carries: the dependency-graph,
#       read-after and contract file checks run whatever an earlier check found,
#       and a task or contract heading that is not "### <id> - <name>" prints
#       its heading line alone, with no follow-on defect of its block.
#
#       An unparseable "Files:" entry is an empty one, one carrying "*" or "?",
#       one whose bracket does not wrap a whole segment in one of the three App
#       Router shapes above, an absolute or "~" path, one ending in "/" (a
#       directory), one carrying whitespace (a path plus an annotation), or one
#       carrying a backtick or a double quote (a quoted path commit-task.sh
#       could not stage).
#
# Contract:
#   argv   : the plan file, optionally --split, --extra <task-id>, --dispatch
#            <task-id> coder|reviewer, --slice <id>[,<id>]... or --final-review,
#            never two of them, or --input <summary-file>, beside none of them;
#            --accepted <n> (digits) beside --input or alone, never beside one of those.
#   cwd    : the repository root - the plan path and every path in the index are
#            relative to it; a plan path given absolute, or with a leading
#            "./", inside it is read as its relative form.
#   env    : none. --split reads tiers.min and tiers.max from config.sh (no usable
#            value: haiku and opus) for the profile lines, --final-review for its
#            model field and build.memory (no usable value: false) for its memory
#            line. --split also reads build.extensions (no usable value: none)
#            for its extension blocks and build.qa (no usable value: false) for its
#            qa-kept block. The sibling plugin-root.sh is sourced on every call: the
#            <plugin root> of a printed command is cut from the invoked path by it.
#   exit   : 0 on a valid plan; a git failure during the --split commit never
#            changes that, the decomposed files are already on disk.
#
set -euo pipefail

# The plugin root of a printed command is cut from the invoked path as text.
. "$(dirname -- "$0")/plugin-root.sh"

plan="${1:-}"
mode=""
extra_id=""
has_extra=0
has_dispatch=0
dispatch_id=""
dispatch_form=""
has_slice=0
slice_arg=""
has_final=0
has_input=0
input_file=""
has_accepted=0
accepted=""
[[ $# -eq 0 ]] || shift
usage="error: usage: plan-index.sh <plan-file> [--split | --extra <task-id> | --dispatch <task-id> coder|reviewer | --slice <id>[,<id>]... | --final-review | --input <summary-file>] [--accepted <n>]"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --split) mode="--split" ;;
    --final-review) has_final=1 ;;
    --extra)
      if [[ $# -lt 2 || -z "$2" ]]; then echo "$usage" >&2; exit 2; fi
      has_extra=1
      extra_id="$2"
      shift
      ;;
    --dispatch)
      if [[ $# -lt 3 || -z "$2" ]]; then echo "$usage" >&2; exit 2; fi
      has_dispatch=1
      dispatch_id="$2"
      dispatch_form="$3"
      shift 2
      ;;
    --slice)
      if [[ $# -lt 2 || -z "$2" ]]; then echo "$usage" >&2; exit 2; fi
      has_slice=1
      slice_arg="$2"
      shift
      ;;
    --input)
      if [[ $# -lt 2 || -z "$2" ]]; then echo "$usage" >&2; exit 2; fi
      has_input=1
      input_file="$2"
      shift
      ;;
    --accepted)
      if [[ $# -lt 2 || ! "$2" =~ ^[0-9]+$ ]]; then echo "$usage" >&2; exit 2; fi
      has_accepted=1
      accepted="$2"
      shift
      ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
  shift
done

if [[ -z "$plan" ]]; then
  echo "$usage" >&2
  exit 2
fi

if [[ "$has_extra" -eq 1 && "$mode" == "--split" ]]; then
  echo "error: --extra cannot be combined with --split" >&2
  exit 2
fi

if [[ "$has_dispatch" -eq 1 ]]; then
  if [[ "$has_extra" -eq 1 || "$mode" == "--split" ]]; then
    echo "error: --dispatch cannot be combined with --split or --extra" >&2
    exit 2
  fi
  if [[ "$dispatch_form" != "coder" && "$dispatch_form" != "reviewer" ]]; then
    echo "error: --dispatch form must be coder or reviewer, got: $dispatch_form" >&2
    exit 2
  fi
fi

if [[ "$has_slice" -eq 1 && ( "$has_extra" -eq 1 || "$has_dispatch" -eq 1 || "$mode" == "--split" ) ]]; then
  echo "error: --slice cannot be combined with --split, --extra or --dispatch" >&2
  exit 2
fi

if [[ "$has_final" -eq 1 && ( "$has_slice" -eq 1 || "$has_extra" -eq 1 || "$has_dispatch" -eq 1 || "$mode" == "--split" ) ]]; then
  echo "error: --final-review cannot be combined with --split, --extra, --dispatch or --slice" >&2
  exit 2
fi

if [[ "$has_input" -eq 1 && ( "$has_final" -eq 1 || "$has_slice" -eq 1 || "$has_extra" -eq 1 || "$has_dispatch" -eq 1 || "$mode" == "--split" ) ]]; then
  echo "error: --input cannot be combined with --split, --extra, --dispatch, --slice or --final-review" >&2
  exit 2
fi

if [[ "$has_accepted" -eq 1 && ( "$has_final" -eq 1 || "$has_slice" -eq 1 || "$has_extra" -eq 1 || "$has_dispatch" -eq 1 || "$mode" == "--split" ) ]]; then
  echo "error: --accepted cannot be combined with --split, --extra, --dispatch, --slice or --final-review" >&2
  exit 2
fi

if [[ ! -f "$plan" ]]; then
  echo "error: plan file not found: $plan" >&2
  exit 2
fi

if [[ "$has_input" -eq 1 && ! -f "$input_file" ]]; then
  echo "error: input file not found: $input_file" >&2
  exit 2
fi

# The input summary file (--input): its "Attachment: <path>" lines, whether it
# gives a root cause (a "Root cause:" line or an Attachment path under
# .temp/viber/code-auditor/) and its "Repro: <path>" lines, read as text at line
# start. Handed to the awk pass below, which holds the plan.
in_atts=""
in_repros=""
in_cause=0
if [[ "$has_input" -eq 1 ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    case "$line" in
      "Attachment:"*)
        line="${line#Attachment:}"
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        [[ -n "$line" ]] || continue
        in_atts="$in_atts$line"$'\n'
        case "$line" in
          *".temp/viber/code-auditor/"*) in_cause=1 ;;
        esac
        ;;
      "Root cause:"*) in_cause=1 ;;
      "Repro:"*)
        line="${line#Repro:}"
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        [[ -n "$line" ]] || continue
        in_repros="$in_repros$line"$'\n'
        ;;
    esac
  done < "$input_file"
fi

# Windows hands over a backslashed path ("docs\_specs\...\plan.md"). `dirname`
# splits it, the shell's own "${x##*/}" below does not, so the two would disagree
# on the very same path - the basename check seeing ONE segment and refusing a
# legitimate --split. Normalized once here, every later split reads alike.
plan="${plan//\\//}"

# An absolute path inside the cwd, rewritten relative to it; any other path is
# printed unchanged. Both sides are resolved physically, so a symlinked spelling
# (macOS /var against /private/var) or a Git Bash drive form (C:/ against /c/)
# still matches; a path whose parent does not exist stays as it is. The same
# function is in commit-task.sh, the same rule in lib/archive-run.ts.
cwd_relative() {
  local p="${1//\\//}" root base leaf="" full
  case "$p" in
    /*|[A-Za-z]:/*) ;;
    *) printf '%s\n' "$1"; return 0 ;;
  esac
  root="$(pwd -P)"
  if [[ -d "$p" ]]; then
    base="$(cd -- "$p" 2>/dev/null && pwd -P)" || base=""
  else
    base="$(cd -- "${p%/*}/" 2>/dev/null && pwd -P)" || base=""
    leaf="/${p##*/}"
  fi
  full="$base$leaf"
  if [[ -n "$base" && "$full" == "$root/"?* ]]; then
    printf '%s\n' "${full#"$root/"}"
  else
    printf '%s\n' "$1"
  fi
}

# The orphan exclusion and every path printed below need "$dir" repo-relative,
# so an absolute or "./" spelling of the same plan is folded into that form.
plan="$(cwd_relative "${plan#./}")"

# --split rebuilds <dir>/tasks from scratch, so it only ever accepts the run's
# own <dir>/plan.md: pointed at a plan sitting loose in a repository it would
# delete a "tasks" directory belonging to the project.
dir="$(dirname -- "$plan")"
if [[ "$mode" == "--split" ]] && { [[ "${plan##*/}" != "plan.md" ]] || [[ "$dir" == "." || "$dir" == "/" ]]; }; then
  echo "error: --split expects the run's own <dir>/plan.md, got: $plan" >&2
  exit 2
fi

# Uncommitted work, so a task a previous session left half-finished can be told
# apart from one nobody has started. Read once here rather than per task, and
# empty outside a git repository - the index still has to come out.
#   -z   no C-quoting, so a non-ASCII path still compares to a "Files:" entry
changed=""
if git rev-parse --git-dir >/dev/null 2>&1; then
  skiprec=0
  while IFS= read -r -d '' rec; do
    # a rename/copy record is followed by a second one carrying the old path
    if [[ $skiprec -eq 1 ]]; then skiprec=0; continue; fi
    if [[ "${rec:0:2}" == *[RC]* ]]; then skiprec=1; fi
    changed="$changed${rec:3}"$'\n'
  done < <(git status --porcelain --untracked-files=all -z 2>/dev/null)
fi

# The run's state, beside the plan. One key per line, "none" for an empty one;
# a run with no status.md yet has nothing done, which is also the answer for a
# plan validated before it ever landed.
st_done=""
st_skipped=""
st_unreviewed=""
st_deferred=""
st_closed=""
st_decisions=""
if [[ -f "$dir/status.md" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    case "$line" in
      done:*)       st_done="${line#done:}" ;;
      skipped:*)    st_skipped="${line#skipped:}" ;;
      unreviewed:*) st_unreviewed="${line#unreviewed:}" ;;
      deferred:*)   st_deferred="${line#deferred:}" ;;
      closed:*)     st_closed="${line#closed:}" ;;
      decision:*)   st_decisions="$st_decisions$line"$'\n' ;;
    esac
  done < "$dir/status.md"
fi

# The run's register of rulings (commit-task.sh --rule): one "- " entry per
# line, printed as "ruling:" lines. No file, no lines.
st_rulings=""
if [[ -f "$dir/rulings.md" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    case "$line" in
      "- "*) st_rulings="$st_rulings""ruling: ${line#- }"$'\n' ;;
    esac
  done < "$dir/rulings.md"
fi

# --extra validates like --split: it runs against a plan already landed, which
# must still resolve after a rule was added.
awk_mode="$mode"
[[ "$has_extra" -eq 0 ]] || awk_mode="--split"
[[ "$has_dispatch" -eq 0 ]] || awk_mode="--split"
[[ "$has_slice" -eq 0 ]] || awk_mode="--split"
[[ "$has_final" -eq 0 ]] || awk_mode="--split"
# A plain call on a landed plan (status.md beside it) is validated the same way:
# the plan is frozen, so a rule added after it landed must not refuse it.
[[ ! -f "$dir/status.md" ]] || awk_mode="--split"

# Memory-owned (a fresh plan only): with build.memory on, no task lists a
# CLAUDE.md. The switch is the "build.memory: true" line config.sh prints, read
# in the caller's cwd (the repository this script already reads with git status),
# never in the plan's own directory, so a plan file outside the repository is
# still held to it. The output is captured whole: grep -q on a pipe would end
# config.sh early under pipefail.
memory_on=0
if [[ "$awk_mode" != "--split" ]]; then
  cfg_out="$(bash "$(dirname -- "${BASH_SOURCE[0]}")/config.sh" 2>/dev/null || true)"
  cfg_out="${cfg_out//$'\r'/}"
  case $'\n'"$cfg_out"$'\n' in
    *$'\nbuild.memory: true\n'*) memory_on=1 ;;
  esac
fi

# The coder extras file of the --extra task, one path per line, each folded to its
# repo-relative form so the ownership comparison below sees one spelling of a file
# (an absolute path inside the repository, as the coder may have written it, equals
# its relative one); a path outside the repository stays as written. A relative
# path has its backslashes read as "/" (Windows writes "src\b.ts").
extra_paths=""
if [[ "$has_extra" -eq 1 && -f "$dir/work/$extra_id-extra.md" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    case "$line" in
      /*|[A-Za-z]:[/\\]*) ;;
      *) line="${line//\\//}" ;;
    esac
    line="${line#./}"
    [[ -n "$line" ]] || continue
    extra_paths="$extra_paths$(cwd_relative "$line")"$'\n'
  done < "$dir/work/$extra_id-extra.md"
fi

# Filled (a fresh plan only): the slots of the planner templates, one per line, read
# at run time as the angle-bracket spans outside HTML comments of the three files
# beside this script, so a slot added to a template needs no edit here. No
# templates directory, no slot, no check. The apostrophe rule of the awk block
# below holds for this one too.
slots=""
tpl_dir="$(dirname -- "${BASH_SOURCE[0]}")/../skills/planner/templates"
if [[ "$awk_mode" != "--split" && -d "$tpl_dir" ]]; then
  tpl_files=()
  for tpl_name in spec-full.md spec-lite.md tasks.md; do
    [[ ! -f "$tpl_dir/$tpl_name" ]] || tpl_files+=("$tpl_dir/$tpl_name")
  done
  if [[ ${#tpl_files[@]} -gt 0 ]]; then
    slots="$(awk '
    {
      s = $0
      sub(/\r$/, "", s)
      if (cm) { p = index(s, "-->"); if (!p) next; s = substr(s, p + 3); cm = 0 }
      while ((p = index(s, "<!--")) > 0) {
        rest = substr(s, p + 4); q = index(rest, "-->")
        if (!q) { s = substr(s, 1, p - 1); cm = 1; break }
        s = substr(s, 1, p - 1) " " substr(rest, q + 3)
      }
      while (match(s, /<[^<>]+>/)) {
        sl = substr(s, RSTART, RLENGTH)
        if (!(sl in sn)) { sn[sl] = 1; print sl }
        s = substr(s, RSTART + RLENGTH)
      }
    }
    ' "${tpl_files[@]}" 2>/dev/null || true)"
  fi
fi

# The profile lines (--split only) clamp their tiers into the config block's
# tiers.min..tiers.max, read from config.sh; no usable value keeps haiku..opus.
# --final-review clamps its model field the same way and reads build.memory.
profile_on=0
tier_min="haiku"
tier_max="opus"
cfg_memory="false"
cfg_ext="none"
cfg_qa="false"
if [[ "$mode" == "--split" || "$has_final" -eq 1 ]]; then
  [[ "$mode" != "--split" ]] || profile_on=1
  cfg_tiers="$(bash "$(dirname -- "${BASH_SOURCE[0]}")/config.sh" 2>/dev/null || true)"
  cfg_tiers="${cfg_tiers//$'\r'/}"
  while IFS= read -r line; do
    case "$line" in
      "tiers.min: "*) tier_min="${line#tiers.min: }" ;;
      "tiers.max: "*) tier_max="${line#tiers.max: }" ;;
      "build.memory: "*) cfg_memory="${line#build.memory: }" ;;
      "build.extensions: "*) cfg_ext="${line#build.extensions: }" ;;
      "build.qa: "*) cfg_qa="${line#build.qa: }" ;;
    esac
  done < <(printf '%s\n' "$cfg_tiers")
fi

# The path travels through ENVIRON, not -v: awk -v expands escape sequences and
# would mangle a Windows path containing backslashes. The output is held until
# the awk pass has exited 0, so a plan refused for any reason prints nothing and
# --split below touches nothing.
index_out="$(plan="$plan" changed="$changed" mode="$awk_mode" rundir="$dir" memory_on="$memory_on" slots="$slots" \
profile="$profile_on" tier_min="$tier_min" tier_max="$tier_max" \
extra="$extra_id" extra_paths="$extra_paths" dispatch="$dispatch_id" \
st_done="$st_done" st_skipped="$st_skipped" st_unreviewed="$st_unreviewed" \
st_deferred="$st_deferred" st_closed="$st_closed" st_decisions="$st_decisions" st_rulings="$st_rulings" \
accepted="$accepted" in_on="$has_input" in_atts="$in_atts" in_repros="$in_repros" in_cause="$in_cause" \
awk '
function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }
function val(s)  { sub(/^[^:]*:/, "", s); return trim(s) }
function fail(msg) { printf "FIX: %s\n", msg > "/dev/stderr"; err = 1 }
function oversize(msg) { printf "SPLIT: %s\n", msg > "/dev/stderr"; err = 1 }

# every backtick-quoted span removed: a done clause may quote a task id as
# literal test data (a fixture plan built by the tests of this repository),
# and that mention proves nothing.
function stripticks(s,   out) { out = s; gsub(/`[^`]*`/, " ", out); return out }

# the clauses of a DoD value cut on each semicolon outside a backtick span, into
# cl[1..n], n returned. A span runs from a backtick to the next one and is kept
# whole; a backtick with no closing partner is plain text. Copy of the one in
# the splitting program: one edit changes both.
function dodcut(s, cl,   n, cur, i, len, ch, j) {
  split("", cl)
  n = 0; cur = ""; i = 1; len = length(s)
  while (i <= len) {
    ch = substr(s, i, 1)
    if (ch == "`") {
      j = index(substr(s, i + 1), "`")
      if (j > 0) { cur = cur substr(s, i, j + 1); i += j + 1; continue }
    }
    if (ch == ";") { cl[++n] = cur; cur = ""; i++; continue }
    cur = cur ch; i++
  }
  cl[++n] = cur
  return n
}

# the id of another task of the plan present as a whole token (bounded by a
# character outside [A-Za-z0-9_-]) in the DoD line of this task, "" when none.
# Padding both ends of the text with a space guarantees a boundary character
# at the edges of the text too, so a leading or trailing id needs no special
# case. n and id[] are the globals every caller has already populated.
function selfproven(text, own,   t, pad, k) {
  t = stripticks(text)
  pad = " " t " "
  for (k = 1; k <= n; k++) {
    if (id[k] == own) continue
    if (pad ~ ("[^A-Za-z0-9_-]" id[k] "[^A-Za-z0-9_-]")) return id[k]
  }
  return ""
}

function listed(s) { s = trim(s); return (s == "none" || s == "-" ? "" : s) }

# p present in text as a whole path token: the character before it is outside
# [A-Za-z0-9_./-] (a leading "./" is allowed), the one after it outside
# [A-Za-z0-9_/-], and a "." after it closes the token only when no word
# character follows (a sentence period, not an extension). A backtick, a quote
# or a space bound it. Plain index() scans, so a bracket or a dot in p is literal.
function pathtok(text, p,   t, pl, off, pos, s, b, a, a2, lc, rc) {
  lc = "[A-Za-z0-9_./-]"; rc = "[A-Za-z0-9_/-]"
  t = "   " text "   "; pl = length(p); off = 0
  while ((pos = index(substr(t, off + 1), p)) > 0) {
    s = off + pos
    b = substr(t, s - 1, 1); a = substr(t, s + pl, 1); a2 = substr(t, s + pl + 1, 1)
    if (b !~ lc || (b == "/" && substr(t, s - 2, 1) == "." && substr(t, s - 3, 1) !~ lc))
      if (a !~ rc && (a != "." || a2 !~ /[A-Za-z0-9_]/)) return 1
    off = s
  }
  return 0
}

# the integration test directory of a Files path: the shallowest directory prefix
# whose last segment is "integration" or holds integration[-_.]?tests? (case
# folded), or the path itself when its file name holds ".integration.", "" when
# the path is neither. The file name alone matching the segment pattern does not
# count (integration-tests.md is a document, not a test).
function integfloor(p,   isg, ins, ik, ipre, ilow) {
  ins = split(p, isg, "/")
  ipre = ""
  for (ik = 1; ik < ins; ik++) {
    ipre = (ik == 1 ? isg[ik] : ipre "/" isg[ik])
    ilow = tolower(isg[ik])
    if (ilow == "integration" || ilow ~ /integration[-_.]?tests?/) return ipre
  }
  if (index(tolower(isg[ins]), ".integration.") > 0) return p
  return ""
}

# t is the path p itself, or a directory of p that ends at or below floor
function inchain(t, p, floor) {
  if (t == p) return 1
  return (length(t) >= length(floor) && substr(p, 1, length(t) + 1) == t "/")
}

# 1 when a command of the Verification text, cut at ; , && || and |, names the
# file p or a directory of it at or below floor, or a file directly inside such a
# directory (the test project); a grep, git grep or rg command names nothing
function namesinteg(vtext, p, floor,   nv, vcmds, vc, vtk, nt, vk, vt, vd, vg, vq) {
  vq = "[`\"\047()]"
  gsub(/&&|[|][|]|[;,|]/, "\n", vtext)
  nv = split(vtext, vcmds, "\n")
  for (vc = 1; vc <= nv; vc++) {
    nt = split(trim(vcmds[vc]), vtk, /[[:space:]]+/)
    for (vk = 1; vk <= nt; vk++) gsub(vq, "", vtk[vk])
    if (vtk[1] ~ /^(grep|egrep|fgrep|rg)$/) continue
    if (vtk[1] == "git") {
      vg = 0
      for (vk = 2; vk <= nt; vk++) if (vtk[vk] == "grep") vg = 1
      if (vg) continue
    }
    for (vk = 1; vk <= nt; vk++) {
      vt = vtk[vk]
      sub(/^\.\//, "", vt)
      sub("/+$", "", vt)
      if (vt == "") continue
      if (inchain(vt, p, floor)) return 1
      vd = vt
      if (sub("/[^/]*$", "", vd) && inchain(vd, p, floor)) return 1
    }
  }
  return 0
}

# 1 when a command of the Verification text, cut at && || ; and |, is a git grep
# without --untracked that names the path p as one of its tokens: git grep reads
# tracked files only, so it never sees a file the task is about to create
function gitgrepblind(vtext, p,   nv, vcmds, vc, vtk, nt, vk, vg, vu, vt, vq) {
  vq = "[`\"\047()]"
  gsub(/&&|[|][|]|[;|]/, "\n", vtext)
  nv = split(vtext, vcmds, "\n")
  for (vc = 1; vc <= nv; vc++) {
    nt = split(trim(vcmds[vc]), vtk, /[[:space:]]+/)
    for (vk = 1; vk <= nt; vk++) gsub(vq, "", vtk[vk])
    if (vtk[1] != "git") continue
    vg = 0; vu = 0
    for (vk = 2; vk <= nt; vk++) {
      if (vtk[vk] == "grep" && !vg) vg = vk
      if (vtk[vk] == "--untracked") vu = 1
    }
    if (!vg || vu) continue
    for (vk = vg + 1; vk <= nt; vk++) {
      vt = vtk[vk]
      sub(/^\.\//, "", vt)
      if (vt == p) return 1
    }
  }
  return 0
}

# the simple commands of a Verification command, cut at ; | || && and a newline
# outside quotes, into sg[1..n], n returned: a quoted argument never splits
function cmdsegs(s, sg,   n, cur, i, len, ch, q) {
  split("", sg)
  n = 0; cur = ""; q = ""; len = length(s)
  for (i = 1; i <= len; i++) {
    ch = substr(s, i, 1)
    if (q != "") { if (ch == q) q = ""; cur = cur ch; continue }
    if (ch == "\"" || ch == "\047") { q = ch; cur = cur ch; continue }
    if (ch == ";" || ch == "|" || ch == "\n" || (ch == "&" && substr(s, i + 1, 1) == "&")) {
      if (ch == "&") i++
      if (trim(cur) != "") sg[++n] = trim(cur)
      cur = ""
      continue
    }
    cur = cur ch
  }
  if (trim(cur) != "") sg[++n] = trim(cur)
  return n
}

# 1 when the path starts under .temp/, with or without a leading "./"
function temppath(a) { return (index(a, ".temp/") == 1 || index(a, "./.temp/") == 1) }

# Provable scan of a Verification command: sets vbi to "<interpreter> <option>"
# for the first inline interpreter code (node, ruby or perl with -e, python or
# python3 with -c, the option among the leading options) and vbt to the first path
# under .temp/ it runs (a command word, or the first non-option argument of
# bash, sh or an interpreter), "" when none. A leading VAR=value is skipped, a
# redirect and its target are no argument, a quoted argument of another command is none.
function verifyscan(cmd,   ns, sg, k, nt, tk, j, w, opt, a) {
  vbi = ""; vbt = ""
  ns = cmdsegs(cmd, sg)
  for (k = 1; k <= ns; k++) {
    nt = split(sg[k], tk, /[[:space:]]+/)
    for (j = 1; j <= nt; j++) gsub("[\"\047]", "", tk[j])
    j = 1
    while (j <= nt && tk[j] ~ /^[A-Za-z_][A-Za-z0-9_]*=/) j++
    if (j > nt) continue
    w = tk[j]
    if (temppath(w)) { if (vbt == "") vbt = w; continue }
    if (w !~ /^(bash|sh|node|python|python3|ruby|perl)$/) continue
    opt = (w == "python" || w == "python3") ? "-c" : ((w == "node" || w == "ruby" || w == "perl") ? "-e" : "")
    for (j++; j <= nt; j++) {
      a = tk[j]
      if (a == "") continue
      if (a ~ /^[0-9]*[<>]+&?$/) { j++; continue }
      if (a ~ /^[0-9]*[<>]/) continue
      if (a ~ /^-/) { if (opt != "" && a == opt && vbi == "") vbi = w " " opt; continue }
      if (temppath(a) && vbt == "") vbt = a
      break
    }
  }
}

# the length of the run of one repeated first character that opens t
function frun(t,   c, n) {
  c = substr(t, 1, 1); n = 0
  while (substr(t, n + 1, 1) == c) n++
  return n
}

# Fed every line in order: 1 when the line sits inside a ``` or ~~~ fence (the
# fence lines included), so a heading-looking line there is body text. A fence
# ends only on a bare line of the same character at least as long as the line
# that opened it. A comment opened outside a fence runs to its closing arrow and
# opens no fence; inside a fence a comment opener is text. fch (the fence
# character), flen (its opening length) and fcom carry the state between lines.
function fstep(raw,   t) {
  t = trim(raw)
  if (fch == "") {
    if (fcom) { if (t ~ /-->/) fcom = 0; return 0 }
    if (t ~ /^<!--/) { if (t !~ /-->/) fcom = 1; return 0 }
    if (t ~ /^(```|~~~)/) { fch = substr(t, 1, 1); flen = frun(t); return 1 }
    return 0
  }
  if (substr(t, 1, 1) == fch && t ~ /^(`+|~+)$/ && length(t) >= flen) fch = ""
  return 1
}

# the "verify:" value: a task Verification text cut at its first " -> ",
# trimmed - the whole text when it carries no arrow - then, when the whole value
# opens and closes with a backtick, that first and last backtick removed and the
# rest trimmed again (every inner backtick kept). The command is always the
# LAST field, so a "|" inside it (a shell pipeline) is part of the command.
function verifycmd(s,   p, v) {
  p = index(s, " -> ")
  v = trim(p == 0 ? s : substr(s, 1, p - 1))
  if (length(v) >= 2 && substr(v, 1, 1) == "`" && substr(v, length(v), 1) == "`") v = trim(substr(v, 2, length(v) - 2))
  return v
}

# tier ranks and names (haiku < sonnet < opus < fable), 0 and "" for anything else
function trank(t) { return (t == "haiku" ? 1 : (t == "sonnet" ? 2 : (t == "opus" ? 3 : (t == "fable" ? 4 : 0)))) }
function tname(r) { return (r == 1 ? "haiku" : (r == 2 ? "sonnet" : (r == 3 ? "opus" : "fable"))) }

# the tier t raised to floor when it ranks below it
function raise(t, floor) { return (trank(t) < trank(floor) ? floor : t) }

# the tier t clamped into the range tmin..tmax (ranks set in BEGIN)
function clampt(t,   r) {
  r = trank(t)
  if (r < tmin) r = tmin
  if (r > tmax) r = tmax
  return tname(r)
}

# the review tier of a task run at tier t: raised to sonnet from haiku, to opus when
# the task is load-bearing (heavy)
function reviewtier(t, heavy,   r) {
  r = raise(t, "sonnet")
  return (heavy ? raise(r, "opus") : r)
}

# the criterion numbers of a "Covers:" value: tokens split on commas and
# whitespace, only "AC<n>" counting, so "#3", "3" and an annotation like
# "(see S3)" name no criterion. c and m are locals: the callers loop on globals.
function covnums(s, out,   c, m, k, j) {
  m = split(s, c, /[,[:space:]]+/)
  j = 0
  for (k = 1; k <= m; k++) if (c[k] ~ /^AC[0-9]+$/) { sub(/^AC/, "", c[k]); out[++j] = c[k] }
  return j
}

# a path already in the tree: a contract may describe a shape this change only
# consumes, and nothing has to create what is already written
function present(p,   r) { r = (getline _ < p); close(p); return (r >= 0) }

# one Next.js App Router dynamic segment: "[id]", "[...slug]", "[[...slug]]".
# The brackets are part of the directory name there, not a pattern. A literal
# bracket is written as the bracket expression "[[]" / "[]]" rather than "\[" -
# the POSIX form every awk parses alike, and no script here relies on the escape.
function dynseg(s) {
  return (s ~ /^[[][A-Za-z0-9_-]+[]]$/ ||
          s ~ /^[[]\.\.\.[A-Za-z0-9_-]+[]]$/ ||
          s ~ /^[[][[]\.\.\.[A-Za-z0-9_-]+[]][]]$/)
}

# a "Files:" or "File:" entry that is a pattern rather than one exact path.
# Decided by shape: "*" and "?" always, a bracket only when it does NOT wrap a
# whole segment - an App-Router repository has a bracket in the path of every
# route it owns, so rejecting the character itself locks the whole stack out.
# m, seg and k are parameters, hence local: both call sites sit inside a loop
# using the globals of those names.
function patterned(p,   m, seg, k) {
  if (p ~ /[*?]/) return 1
  m = split(p, seg, "/")
  for (k = 1; k <= m; k++)
    if ((index(seg[k], "[") || index(seg[k], "]")) && !dynseg(seg[k])) return 1
  return 0
}

# Attachments: every attachments/<name> a DoD text names, <name> being the first
# path component after the prefix (a sentence period closing it is dropped), must
# be an entry of the map amap. A prefix glued to a longer path (docs/attachments/)
# names none. One error per task and name.
function attdod(text, own,   t, off, pos, s, rest, nm) {
  t = " " text; off = 0
  while ((pos = index(substr(t, off + 1), "attachments/")) > 0) {
    s = off + pos
    off = s
    if (substr(t, s - 1, 1) ~ "[A-Za-z0-9_./-]") continue
    rest = substr(t, s + 12)
    if (!match(rest, /^[A-Za-z0-9_.-]+/)) continue
    nm = substr(rest, 1, RLENGTH)
    if (!(nm in amap)) sub(/[.]+$/, "", nm)
    if (nm == "" || (nm in amap) || ((own, nm) in amiss)) continue
    amiss[own, nm] = 1
    fail("task " own ": DoD names attachments/" nm ", absent from the attachments map - add a " nm " entry or drop the reference (Attachments)")
  }
}

# Filled: the plan line with every backtick span and every HTML comment cut out
# (a comment may open on one line and close on a later one; scm carries it), so
# what is left is plan text. The state of a line inside a fence never reaches here.
function slotstrip(raw,   s, p, rest, q) {
  s = raw
  sub(/\r$/, "", s)
  if (scm) { p = index(s, "-->"); if (!p) return ""; s = substr(s, p + 3); scm = 0 }
  gsub(/`[^`]*`/, " ", s)
  while ((p = index(s, "<!--")) > 0) {
    rest = substr(s, p + 4); q = index(rest, "-->")
    if (!q) { s = substr(s, 1, p - 1); scm = 1; break }
    s = substr(s, 1, p - 1) " " substr(rest, q + 3)
  }
  return s
}

# the --extra report for task "self": the paths of its coder extras file, in file
# order, minus a blank line, a path under .temp/, a repeat, one the task itself
# lists and one a task not yet done lists; then one recheck line per done task
# whose Files lists a kept path, in task order. Nothing at all when no path is
# kept or the file is missing. The lines arrive cleaned and folded to their
# repo-relative form by the shell (extra_paths).
function scope(self,   nl, lines, j, p, k, out, me, claimed) {
  nl = split(extrapaths, lines, /\n/)
  me = seen[self]
  out = ""
  for (j = 1; j <= nl; j++) {
    p = lines[j]
    if (p == "" || index(p, ".temp/") == 1 || (p in xseen)) continue
    xseen[p] = 1
    if ((me, p) in fset) continue
    claimed = 0
    for (k = 1; k <= n; k++) if (!(id[k] in isdone) && ((k, p) in fset)) claimed = 1
    if (claimed) continue
    out = (out == "" ? p : out "," p)
    for (k = 1; k <= n; k++) if ((id[k] in isdone) && ((k, p) in fset)) recheck[k] = 1
  }
  if (out == "") return
  printf "extra: %s\n", out
  for (k = 1; k <= n; k++) if (k in recheck) printf "recheck: %s | %s\n", id[k], verifycmd(verif[k])
}

BEGIN {
  n = 0; ncrit = 0; ncon = 0; err = 0; title = ""
  # a TDD task is one behaviour run red-green clause by clause, so it stays
  # small; a TDD-none task (a shape, a migration, config) carries no cycle to
  # drift in and may span more files
  maxfiles["required"] = 12; maxdod["required"] = 6
  maxfiles["none"] = 25;     maxdod["none"] = 10
  plan = ENVIRON["plan"]
  mode = ENVIRON["mode"]
  extra = ENVIRON["extra"]
  extrapaths = ENVIRON["extra_paths"]
  # what is committed, plus the two decisions and the close that no later
  # session could read off the tree, all of it out of the status file
  done    = listed(ENVIRON["st_done"])
  skipped = listed(ENVIRON["st_skipped"])
  unrev   = listed(ENVIRON["st_unreviewed"])
  defer   = listed(ENVIRON["st_deferred"])
  closed  = listed(ENVIRON["st_closed"])
  decisions = ENVIRON["st_decisions"]
  rulings = ENVIRON["st_rulings"]
  rundir = ENVIRON["rundir"]
  if (rundir == ".") rundir = ""
  profile = (ENVIRON["profile"] == "1")
  tmin = trank(ENVIRON["tier_min"]); if (tmin == 0) tmin = 1
  tmax = trank(ENVIRON["tier_max"]); if (tmax == 0) tmax = 3
  if (tmin > tmax) { tmin = 1; tmax = 3 }
  nslot = split(ENVIRON["slots"], slot, "\n")
  nch = split(ENVIRON["changed"], ch, /\n/)
  for (k = 1; k <= nch; k++) if (ch[k] != "") chg[ch[k]] = 1
}

# the frontmatter "attachments:" map (the one plan-path.sh lands): hasatt when the
# key is there, attent[1..natt] its indented entry lines in file order, a blank
# line skipped, the map ending at the first line that is not indented
NR == 1 && /^---[ \t]*\r?$/ { infm = 1 }
infm && NR > 1 {
  fmline = $0; sub(/\r$/, "", fmline)
  if (fmline ~ /^---[ \t]*$/) infm = 0
  else if (attin && fmline ~ /^[ \t]*$/) { }
  else if (attin && fmline ~ /^[ \t]/) attent[++natt] = fmline
  else { attin = 0; if (fmline ~ /^attachments:[ \t]*$/) { hasatt = 1; attin = 1 } }
}

# infc: this line sits inside a code fence, so no heading rule below fires on it
{ infc = fstep($0) }

# Filled: a template slot left in the plan text, outside fences, comments, backtick
# spans and the "## Contracts" appendix (the heading line itself is read as the
# section it opens). Fresh plan only, like the other checks added after plans were
# frozen; it runs before the rules below, whose next would skip a heading line.
mode != "--split" && nslot > 0 && !infc {
  stext = slotstrip($0)
  scon = ($0 ~ /^##[[:space:]]/) ? ($0 ~ /Contracts/) : incon
  if (!scon)
    for (sk = 1; sk <= nslot; sk++)
      if (slot[sk] != "" && index(stext, slot[sk]) > 0)
        fail("line " NR ": template slot " slot[sk] " left unfilled - replace it (Filled)")
}

# plan title: the first H1
!infc && /^#[[:space:]]/ && title == "" { title = trim(substr($0, 2)); next }

# the "## Phases" section above "## Tasks": its numbered entries in build order
# and which one carries the "(this plan)" marker. Guidance comments are skipped;
# a heading of any other name closes the section.
!hastasks {
  rt = trim($0)
  if (rcom) { if (rt ~ /-->/) rcom = 0 }
  else if (rt ~ /^<!--/) { if (rt !~ /-->/) rcom = 1 }
  else if (!infc && $0 ~ /^##[[:space:]]/) inphases = ($0 ~ /^##[[:space:]]*(Phases|Roadmap)[[:space:]]*$/)
  else if (inphases && $0 ~ /^[0-9]+\. /) {
    rname = $0
    sub(/^[0-9]+\.[[:space:]]+/, "", rname)
    rname = trim(rname)
    rent[++nrent] = rname
    if (!rthis && rname ~ /\(this plan\)$/) rthis = nrent
  }
}

# the heading --split cuts the plan in two at, matched by the SAME pattern the
# cut uses: a plan that validates is a plan that splits where this says it will
!infc && /^##[[:space:]]*Tasks/ { hastasks = 1 }

# acceptance criteria: the numbered list inside its own section; contract blocks:
# the "### <id> - <name>" headings inside theirs
!infc && /^##[[:space:]]/ {
  incrit = ($0 ~ /Acceptance criteria/) ? 1 : 0
  incon  = ($0 ~ /Contracts/) ? 1 : 0
  inbeh  = ($0 ~ /^##[[:space:]]*Behaviour[[:space:]]*$/) ? 1 : 0
  nscen = 0
  cid = ""
}

# Scenarios: under "## Behaviour" every "### " heading outside a fence is "### Edge cases"
# or "### S<k> - <title>", <k> counting the scenarios from 1 in order (any other heading
# takes a place in that count, so the numbers after it stay checked). Fresh plan only,
# like the other checks added after plans were frozen.
mode != "--split" && !infc && inbeh && /^###[[:space:]]/ {
  sh = trim(substr($0, 4))
  if (sh != "Edge cases") {
    nscen++
    if (!(match(sh, /^S[1-9][0-9]* - /) && trim(substr(sh, RLENGTH + 1)) != "" && substr(sh, 2, RLENGTH - 4) + 0 == nscen))
      fail("line " NR ": scenario heading \"" sh "\" must be \"### S<k> - <title>\", the " nscen "th scenario in order - number it (Scenarios)")
  }
}

# File map: under "### File map" a line "- modify - <path>[, <path>]... - <text>" or
# "- delete - ..." names paths the tree already holds, each one checked alone; an "add"
# line is none. Fresh plan only, like the other checks added after plans were frozen.
!infc && /^#+[[:space:]]/ { infmap = ($0 ~ /^###[[:space:]]+File map[[:space:]]*$/) }
mode != "--split" && !infc && infmap && /^-[[:space:]]+(modify|delete)[[:space:]]+-[[:space:]]/ {
  fmval = $0
  sub(/\r$/, "", fmval)
  sub(/^-[[:space:]]+/, "", fmval)
  fmkind = fmval
  sub(/[[:space:]].*$/, "", fmkind)
  sub(/^(modify|delete)[[:space:]]+-[[:space:]]+/, "", fmval)
  fmcut = index(fmval, " - ")
  if (fmcut > 0) fmval = substr(fmval, 1, fmcut - 1)
  fmn = split(fmval, fmparts, ",")
  for (fmi = 1; fmi <= fmn; fmi++) {
    fmpath = trim(fmparts[fmi])
    if (fmpath ~ /^`.*`$/) fmpath = trim(substr(fmpath, 2, length(fmpath) - 2))
    sub(/^\.\//, "", fmpath)
    if (fmpath != "" && !present(fmpath))
      fail("file map: " fmkind " " fmpath ", which the tree does not hold - correct the path or list it as add (File map)")
  }
}
# Root cause: the plan carries the section when a "## Root cause" heading sits outside
# a fence (checked against the input by --input only).
!infc && /^##[[:space:]]+Root cause[[:space:]]*\r?$/ { hasrc = 1 }
incrit && /^[0-9]+\./ {
  c = $0
  sub(/\..*/, "", c)
  crit[c + 0] = 1
  if (c + 0 > ncrit) ncrit = c + 0
}
!infc && incon && !intask && /^###[[:space:]]/ {
  cid = ""
  h = trim(substr($0, 4))
  p = index(h, " - ")
  if (p == 0) { fail("contract heading must be \"### <id> - <name>\", got: " h); next }
  cid = trim(substr(h, 1, p - 1))
  if (cid !~ /^[A-Za-z0-9_-]+$/) fail("contract id \"" cid "\": letters, digits, \"-\" and \"_\" only - a Uses line references it by name")
  else if (cid in con)           fail("duplicate contract id: " cid)
  else { con[cid] = 1; corder[++ncon] = cid }
  cfresh = 1
  next
}

# where the shape lives, which is what ties the appendix to the task map. Only
# the opening line of a block counts, so a "File:" inside the shape stays shape
incon && !intask && cid != "" && cfresh && /^-?[[:space:]]*File:/ {
  cfile[cid] = val($0)
  ncfile++
  cfresh = 0
  next
}
incon && !intask && cid != "" && trim($0) != "" { cfresh = 0 }

/^[[:space:]]*<!--[[:space:]]*TASK[[:space:]]*-->[[:space:]]*$/ {
  intask = 1; n++
  id[n] = ""; ttl[n] = ""; tdd[n] = ""; deps[n] = ""; files[n] = ""
  covers[n] = ""; uses[n] = ""; deliv[n] = ""; verif[n] = ""; dod[n] = ""
  excl[n] = ""; repro[n] = ""; hard[n] = ""; hashard[n] = 0; badhead[n] = 0
  # the cut --split makes is the FIRST "## Tasks" heading, so a block opening
  # before it has ever been seen would ride into spec.md instead of decomposing
  # into its own task file, while the index above still lists it as a task
  early[n] = (hastasks ? 0 : 1)
  next
}
/^[[:space:]]*<!--[[:space:]]*\/TASK[[:space:]]*-->[[:space:]]*$/ { intask = 0; next }

intask {
  if (!infc && $0 ~ /^###[[:space:]]/) {
    h = trim(substr($0, 4))
    p = index(h, " - ")
    if (p == 0) { fail("task heading must be \"### <id> - <title>\", got: " h); badhead[n] = 1; next }
    id[n]  = trim(substr(h, 1, p - 1))
    ttl[n] = trim(substr(h, p + 3))
    next
  }
  if ($0 ~ /^-[[:space:]]*TDD:/)          { tdd[n]    = val($0); next }
  if ($0 ~ /^-[[:space:]]*Exclusive:/)    { excl[n]   = val($0); next }
  if ($0 ~ /^-[[:space:]]*Repro:/)        { repro[n]  = val($0); next }
  if ($0 ~ /^-[[:space:]]*Hard:/)         { hard[n]   = val($0); hashard[n] = 1; next }
  if ($0 ~ /^-[[:space:]]*Covers:/)       { covers[n] = val($0); next }
  if ($0 ~ /^-[[:space:]]*Uses:/)         { uses[n]   = val($0); next }
  if ($0 ~ /^-[[:space:]]*Depends-on:/)   { deps[n]   = val($0); next }
  if ($0 ~ /^-[[:space:]]*Files:/)        { files[n]  = val($0); next }
  if ($0 ~ /^-[[:space:]]*Delivers:/)     { deliv[n]  = val($0); next }
  if ($0 ~ /^-[[:space:]]*Verification:/) { verif[n]  = val($0); next }
  if ($0 ~ /^-[[:space:]]*DoD:/)          { dod[n]    = val($0); next }
}

END {
  if (n == 0) { printf "FIX: no <!-- TASK --> blocks in %s\n", plan > "/dev/stderr"; exit 3 }
  # The cut is a heading, so a plan carrying blocks under any other one would
  # decompose into an empty tasks/ while this index still lists every task -
  # the orchestrator would then dispatch a coder onto a task file that does not
  # exist. Caught at validation, so the planner sees it before its own gate.
  if (!hastasks) { printf "FIX: %s carries <!-- TASK --> blocks but no \"## Tasks\" heading - that heading is where the specification is cut off\n", plan > "/dev/stderr"; exit 4 }

  # id -> ordinal; a duplicate id is fatal, and the id also names the task file
  # --split writes, so it stays a bare token
  for (i = 1; i <= n; i++) {
    if (badhead[i]) continue
    if (id[i] == "") { fail("task #" i " has no id"); continue }
    if (id[i] !~ /^[A-Za-z0-9_-]+$/) fail("task id \"" id[i] "\": letters, digits, \"-\" and \"_\" only - it names the task file")
    if (id[i] in seen) fail("duplicate task id: " id[i])
    seen[id[i]] = i
  }

  # a block that opened before "## Tasks" was ever seen: --split cuts there, so
  # this one would land in spec.md rather than tasks/<id>.md while the index
  # above still lists it as a task the orchestrator can dispatch
  for (i = 1; i <= n; i++)
    if (early[i] && !badhead[i]) fail("task " id[i] ": <!-- TASK --> block sits above the \"## Tasks\" heading")

  # Attachments: a name of the map is one path component and unique once case
  # folded. Fresh plan only, like the other checks added after plans were frozen.
  if (mode != "--split")
    for (ak = 1; ak <= natt; ak++) {
      ae = trim(attent[ak]); ap = index(ae, ":")
      if (ap) ae = trim(substr(ae, 1, ap - 1))
      if (ae !~ /^[A-Za-z0-9][A-Za-z0-9_.-]*$/) { fail("attachments: name \"" ae "\" is not one path component of letters, digits, _, . and - opening on a letter or digit - rename it (Attachments)"); continue }
      if (tolower(ae) in aseen) { fail("attachments: name \"" ae "\" repeats an earlier one - rename one of them (Attachments)"); continue }
      aseen[tolower(ae)] = 1
      amap[ae] = 1
    }

  for (i = 1; i <= n; i++) {
    # a block whose heading is malformed reports that heading alone: its fields
    # raise nothing here, though what it covers and uses still counts, so the
    # criteria and contracts it names are not reported as left out, and the
    # files it lists (badfile) are not reported as created by no task
    if (badhead[i]) {
      dnorm[i] = "-"
      delete cnums
      m = covnums(covers[i], cnums)
      for (k = 1; k <= m; k++) covered[cnums[k] + 0] = 1
      u = uses[i]
      gsub(/,/, " ", u)
      m = split(trim(u), unums, /[[:space:]]+/)
      for (k = 1; k <= m; k++) usedcon[unums[k]] = 1
      m = split(files[i], fl, /,/)
      for (k = 1; k <= m; k++) {
        p = trim(fl[k])
        sub(/^\.\//, "", p)
        if (p != "") badfile[p] = 1
      }
      continue
    }
    # Ids and Title: the ids run T1, T2, ... in block order and a title never opens
    # with a commit type prefix, since the commit subject is "<id> - <title>".
    # Skipped under --split, like the other checks added after plans were frozen.
    if (mode != "--split") {
      if (id[i] != "" && id[i] != "T" i) fail("task " id[i] ": id must be T" i ", the " i "th task block in order - renumber the tasks (Ids)")
      if (match(tolower(ttl[i]), /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)([(][^)]*[)])?!?:/))
        fail("task " id[i] ": title opens with the commit type prefix \"" substr(ttl[i], 1, RLENGTH) "\" - drop it, the commit subject is \"<id> - <title>\" (Title)")
    }
    if (tdd[i] != "required" && tdd[i] != "none") fail("task " id[i] ": TDD must be \"required\" or \"none\", got: \"" tdd[i] "\"")
    # Exclusive is optional: absent means an ordinary task. Two
    # states only - a third spelling would start the same drift the mandatory
    # "Uses: none" was written to close.
    if (excl[i] != "" && excl[i] != "true") fail("task " id[i] ": Exclusive must be \"true\" or the line left out, got: \"" excl[i] "\"")
    if (hashard[i] && hard[i] == "") fail("task " id[i] ": Hard needs its reason, or the line left out")
    if (files[i] == "") fail("task " id[i] ": missing Files")
    if (deliv[i] == "") fail("task " id[i] ": missing Delivers")
    if (verif[i] == "") fail("task " id[i] ": missing Verification")
    if (dod[i] == "")   fail("task " id[i] ": missing DoD")

    # Self-proven: a done clause may not hand its own proof to another task -
    # every clause is proven inside the task that delivers it. Skipped under
    # --split, like the other checks added after plans were frozen.
    if (mode != "--split" && dod[i] != "") {
      other = selfproven(dod[i], id[i])
      if (other != "") fail("task " id[i] ": DoD names task " other " - prove each clause inside this task, naming a file or symbol instead")
    }

    # Attachments: a DoD names only the attachments the map holds, once the plan
    # carries the map. Skipped under --split, like the other checks added after
    # plans were frozen.
    if (mode != "--split" && hasatt && dod[i] != "") attdod(dod[i], id[i])

    # Files: bare repo-relative paths, so commit-task.sh can stage them and the
    # collision check below can compare them literally
    nf[i] = 0
    m = split(files[i], fl, /,/)
    for (k = 1; k <= m; k++) {
      p = trim(fl[k])
      sub(/^\.\//, "", p)
      if (p == "")                     { fail("task " id[i] ": empty entry in Files"); continue }
      if (patterned(p))                { fail("task " id[i] ": Files entry \"" p "\" is a glob, list exact paths"); continue }
      if (p ~ /^\// || p ~ /^~/)       { fail("task " id[i] ": Files entry \"" p "\" must be repo-relative"); continue }
      if (p ~ /\/$/)                   { fail("task " id[i] ": Files entry \"" p "\" is a directory, list each file"); continue }
      if (p ~ /[[:space:]]/)           { fail("task " id[i] ": Files entry \"" p "\" is not a bare path, drop the annotation"); continue }
      if (p ~ /[`"]/)                  { fail("task " id[i] ": Files entry \"" p "\" is not a bare path, drop the quoting"); continue }
      fset[i, p] = 1
      fpath[i, ++nf[i]] = p
      # Memory-owned: the build close updates every CLAUDE.md while build.memory is
      # on. Fresh plan only, like the other checks added after plans were frozen.
      if (mode != "--split" && ENVIRON["memory_on"] == "1" && p ~ /(^|\/)CLAUDE\.md$/)
        fail("task " id[i] ": Files lists " p " while build.memory is on - drop it, the build close updates every CLAUDE.md (Memory-owned)")
    }

    # Layered: an integration test is written in its own task and never run there,
    # so the Verification of a task writing one names it, or a directory of it at
    # or below its test directory, in a command that is no grep. Skipped under
    # --split, like the other checks added after plans were frozen, and for a
    # Verification that is the word PENDING alone: a skeleton task, whose
    # Verification the plan-build merge fills before the plan is reviewed.
    if (mode != "--split" && verif[i] != "" && verif[i] !~ /^PENDING[[:space:]]*$/)
      for (k = 1; k <= nf[i]; k++) {
        ifloor = integfloor(fpath[i, k])
        if (ifloor != "" && !namesinteg(verifycmd(verif[i]), fpath[i, k], ifloor))
          fail("task " id[i] ": Files writes " fpath[i, k] " under an integration test directory, which no Verification command names - list or type-check that file or its test project there (Layered)")
      }

    # Provable: a git grep over a file this task creates reads nothing, so the
    # proof would find no match whatever the code holds. A path the tree already
    # holds is read. Skipped under --split, like the other checks added after
    # plans were frozen.
    if (mode != "--split" && verif[i] != "")
      for (k = 1; k <= nf[i]; k++)
        if (!present(fpath[i, k]) && gitgrepblind(verifycmd(verif[i]), fpath[i, k]))
          fail("task " id[i] ": Verification runs git grep without --untracked over " fpath[i, k] ", which this task creates and git grep never reads - add --untracked or use grep (Provable)")

    # Provable: the command before the first " -> " is written bare, never wrapped
    # in backticks, and is no inline interpreter code and no script under .temp/,
    # which the coder shell refuses. Skipped under --split, like the other checks
    # added after plans were frozen.
    if (mode != "--split" && verif[i] != "") {
      vpa = index(verif[i], " -> ")
      vraw = trim(vpa == 0 ? verif[i] : substr(verif[i], 1, vpa - 1))
      if (length(vraw) >= 2 && substr(vraw, 1, 1) == "`" && substr(vraw, length(vraw), 1) == "`")
        fail("task " id[i] ": Verification is wrapped in backticks - write the command bare (Provable)")
      verifyscan(verifycmd(verif[i]))
      if (vbi != "") fail("task " id[i] ": Verification runs inline interpreter code \"" vbi "\" - run a project test or script instead (Provable)")
      if (vbt != "") fail("task " id[i] ": Verification runs " vbt " under .temp/ - run a project test or script instead (Provable)")
    }

    # Size:a task past either cap bundles several behaviours, and a coder
    # holding that many files and clauses at once drifts. Skipped under --split,
    # like the other checks added after plans were frozen.
    if (mode != "--split" && (tdd[i] in maxfiles)) {
      tm = tdd[i]
      if (nf[i] > maxfiles[tm]) oversize("task " id[i] ": " nf[i] " Files, past the " maxfiles[tm] " a TDD: " tm " task may hold - split it, one behaviour per task")
      nd = 0
      m = dodcut(dod[i], dc)
      for (k = 1; k <= m; k++) if (trim(dc[k]) != "") nd++
      if (nd > maxdod[tm]) oversize("task " id[i] ": " nd " DoD clauses, past the " maxdod[tm] " a TDD: " tm " task may hold - split it, one behaviour per task; clauses are cut at each semicolon outside backticks, so a semicolon inside a list cuts a clause")
    }

    # Repro: the reproduction test the fixer left RED, one path the task already
    # stages - so it is compared against the parsed Files, never trusted alone.
    # Its RED cycle is done, which is what "TDD: none" on the task says.
    if (repro[i] != "") {
      sub(/^\.\//, "", repro[i])
      if (!((i, repro[i]) in fset)) fail("task " id[i] ": Repro \"" repro[i] "\" must be one path of its own Files")
      if (tdd[i] != "none")        fail("task " id[i] ": Repro needs \"TDD: none\" - the reproduction test is already RED")
    }

    # Covers must point at an existing acceptance criterion; the reverse direction
    # is checked once, after this loop
    delete cnums
    m = covnums(covers[i], cnums)
    if (m == 0) fail("task " id[i] ": Covers references no acceptance criterion")
    for (k = 1; k <= m; k++)
      if (!(cnums[k] + 0 in crit)) fail("task " id[i] ": Covers AC" cnums[k] ", absent from acceptance criteria")
      else covered[cnums[k] + 0] = 1

    # Uses is what carries a contract block into the task file, so it is
    # mandatory and says "none" out loud: a task silently missing the line and
    # one that genuinely touches no shape would otherwise look the same
    u = uses[i]
    if (u == "") fail("task " id[i] ": missing Uses - name its contract blocks, or \"none\"")
    else if (u != "none" && u != "-") {
      gsub(/,/, " ", u)
      m = split(trim(u), unums, /[[:space:]]+/)
      for (k = 1; k <= m; k++)
        if (!(unums[k] in con)) fail("task " id[i] ": Uses " unums[k] ", no such contract block")
        else { usedcon[unums[k]] = 1; usesset[i, unums[k]] = 1 }
    }

    # Uses is what carries a contract block into the task file: a block named in
    # DoD or Delivers (a whole token outside backtick spans) but absent from Uses
    # is a shape the coder is held to without ever receiving it. A token with no
    # block in the appendix names nothing. Skipped under --split, like the other
    # checks added after plans were frozen.
    if (mode != "--split")
      for (c = 1; c <= ncon; c++) {
        if ((i, corder[c]) in usesset) continue
        cpat = "[^A-Za-z0-9_-]" corder[c] "[^A-Za-z0-9_-]"
        if ((" " stripticks(dod[i]) " ") ~ cpat) fail("task " id[i] ": DoD names " corder[c] ", missing from its Uses - add it to Uses")
        if ((" " stripticks(deliv[i]) " ") ~ cpat) fail("task " id[i] ": Delivers names " corder[c] ", missing from its Uses - add it to Uses")
      }

    # a dependency may only point at an earlier existing task, which makes the graph acyclic by construction
    d = deps[i]
    if (d == "" || d == "none" || d == "-") { dnorm[i] = "-"; continue }
    gsub(/,/, " ", d)
    m = split(trim(d), dn, /[[:space:]]+/)
    out = ""
    for (k = 1; k <= m; k++) {
      if (!(dn[k] in seen)) { fail("task " id[i] ": Depends-on " dn[k] ", no such task"); continue }
      if (seen[dn[k]] >= i) { fail("task " id[i] ": Depends-on " dn[k] " must reference an earlier task"); continue }
      # An Exclusive task is a leaf: it runs last, so nothing may depend on it.
      # Skipped under --split - a plan that landed before this rule is frozen and
      # a run resumed after the upgrade must still validate and decompose.
      if (mode != "--split" && excl[seen[dn[k]]] == "true") { fail("task " id[i] ": Depends-on " dn[k] ", an Exclusive task - it runs last, so no task may depend on it"); continue }
      out = (out == "" ? dn[k] : out "," dn[k])
    }
    dnorm[i] = (out == "" ? "-" : out)
  }

  # tasks with no dependency path between them run at the same time, so they may not
  # share a file; deps point backwards only, so one forward pass resolves ancestry.
  # It runs whatever an earlier check found, so one run reports every defect: a
  # dependency that failed above never entered dnorm, so the graph holds only
  # entries that point at an earlier task
  {
    for (i = 1; i <= n; i++) {
      if (dnorm[i] == "-") continue
      m = split(dnorm[i], dn, /,/)
      for (k = 1; k <= m; k++) {
        j = seen[dn[k]]
        anc[i, j] = 1
        for (t = 1; t < j; t++) if ((j, t) in anc) anc[i, t] = 1
      }
    }
    # an entry another entry of the same line already reaches orders nothing:
    # it only tangles the graph the orchestrator profiles and schedules from.
    # Skipped under --split - a plan that landed before this rule is frozen.
    if (mode != "--split")
      for (i = 1; i <= n; i++) {
        if (dnorm[i] == "-") continue
        m = split(dnorm[i], dn, /,/)
        for (k = 1; k <= m; k++)
          for (t = 1; t <= m; t++)
            if (t != k && (seen[dn[t]], seen[dn[k]]) in anc) {
              fail("task " id[i] ": Depends-on " dn[k] " is already reached through " dn[t] " - drop it")
              break
            }
      }
    for (i = 1; i <= n; i++)
      for (j = i + 1; j <= n; j++) {
        if ((j, i) in anc) continue
        for (k = 1; k <= nf[i]; k++)
          if ((j, fpath[i, k]) in fset)
            fail("tasks " id[i] " and " id[j] " both list " fpath[i, k] ", with no dependency path between them")
      }
    # read-after: a task naming, in its Verification, Delivers or DoD, a file a
    # lower-numbered task lists must run after that task, or it reads a file not yet
    # written; naming a file the tree does not hold that only a higher-numbered task
    # lists, it reads a file no earlier task writes. The Delivers of a decision record
    # task (every Files path under docs/adr/) is no reading: it records what other
    # tasks build. Skipped under --split - a plan that landed before this rule is frozen.
    if (mode != "--split")
      for (i = 1; i <= n; i++) {
        if (badhead[i]) continue
        adr = (nf[i] > 0)
        for (k = 1; k <= nf[i]; k++) if (index(fpath[i, k], "docs/adr/") != 1) adr = 0
        rtext = verif[i] " " (adr ? "" : deliv[i] " ") dod[i]
        for (j = 1; j < i; j++) {
          if ((i, j) in anc) continue
          for (k = 1; k <= nf[j]; k++) {
            if ((i, fpath[j, k]) in fset) continue
            if (pathtok(rtext, fpath[j, k]))
              fail("task " id[i] " reads " fpath[j, k] ", listed by " id[j] ", but has no dependency path to " id[j] " - add " id[j] " to its Depends-on")
          }
        }
        for (j = i + 1; j <= n; j++)
          for (k = 1; k <= nf[j]; k++) {
            rp = fpath[j, k]
            if ((i, rp) in fset || (i, rp) in fwdseen) continue
            lower = 0
            for (t = 1; t < i; t++) if ((t, rp) in fset) lower = 1
            if (lower || present(rp) || !pathtok(rtext, rp)) continue
            fwdseen[i, rp] = 1
            fail("task " id[i] " reads " rp ", which only the later task " id[j] " creates - move the reading after " id[j] " (Read after)")
          }
      }
  }

  # a criterion no task covers would run through the whole build unnoticed -
  # nothing downstream gates the specification as a whole. Walked by number, not
  # with "for (c in crit)", which awk iterates in no defined order.
  for (c = 1; c <= ncrit; c++)
    if ((c in crit) && !(c in covered)) fail("acceptance criterion AC" c " is covered by no task")

  # a contract block reaches a coder only through a "Uses:" line - one no task
  # names sits in the plan unreachable, and the shape it describes is then
  # whatever each coder invents
  for (c = 1; c <= ncon; c++) {
    # Blocks: the ids run C1, C2, ... in block order. Skipped under --split.
    if (mode != "--split" && corder[c] != "C" c) fail("contract " corder[c] ": id must be C" c ", the " c "th block in order - renumber the blocks (Blocks)")
    if (!(corder[c] in usedcon)) fail("contract " corder[c] " is used by no task")
    # missing outright, or an appendix where NO block carries the line at all -
    # exempted under --split, under --extra and on a landed plan in plain mode
    # (see below), required everywhere else
    if (!(corder[c] in cfile) && (mode == "--split" ? ncfile > 0 : 1))
      fail("contract " corder[c] ": missing File - name the paths the shape is declared in, or \"none\"")
  }

  # the file of a block decides who writes it, so the two halves of the plan
  # have to meet: a path nothing creates leaves the shape to be invented by
  # whoever needs it first, and a path whose holders never name the block leaves
  # its writer blind to it while a consumer writes it outside its own file map.
  # An appendix where NO block carries "File:" is required everywhere outside
  # --split, --extra and a landed plan in plain mode, caught above; under those
  # it may still predate the field - a plan that landed before this check and is
  # being resumed - so nothing here runs for it either, because a frozen plan
  # cannot grow the line and a build must not stall mid-resume.
  if (ncfile > 0) {
    for (c = 1; c <= ncon; c++) {
      cn = corder[c]
      if (cfile[cn] == "none" || cfile[cn] == "-") continue
      m = split(cfile[cn], cl, /,/)
      for (k = 1; k <= m; k++) {
        p = trim(cl[k])
        sub(/^\.\//, "", p)
        if (p == "") { fail("contract " cn ": empty entry in File"); continue }
        if (patterned(p) || p ~ /^\// || p ~ /^~/ || p ~ /\/$/ || p ~ /[[:space:]]/) {
          fail("contract " cn ": File entry \"" p "\" must be one bare repo-relative file path")
          continue
        }
        held = ""
        named = 0
        for (i = 1; i <= n; i++)
          if ((i, p) in fset) {
            held = (held == "" ? id[i] : held "," id[i])
            if ((i, cn) in usesset) named = 1
          }
        if (held == "") {
          if (!present(p) && !(p in badfile)) fail("contract " cn " declares " p ", which no task creates - put it in the Files of the task that writes the shape")
        }
        else if (!named) fail("contract " cn " declares " p ", held by " held ", but no holder names " cn " in Uses - its writer would never see the shape")

        # a consumer of cn runs after every lower-numbered writer of it, or it
        # would be built beside the code it calls. A writer holds p and names cn;
        # a higher-numbered one cannot be depended on, so it raises nothing.
        # Skipped under --split - a plan that landed before this rule is frozen.
        if (mode != "--split")
          for (j = 1; j <= n; j++) {
            if (!((j, p) in fset) || !((j, cn) in usesset)) continue
            for (i = j + 1; i <= n; i++)
              if ((i, cn) in usesset && !((i, j) in anc) && !((i, j, cn) in unordered)) {
                unordered[i, j, cn] = 1
                fail("task " id[i] " uses " cn ", written by " id[j] ", but has no dependency path to " id[j] " - add " id[j] " to its Depends-on")
              }
          }

        # "feeds": a holder of this path carries cn in its own feeds column,
        # with the count of OTHER tasks naming cn in Uses - a shape a task
        # declares but sends to no one feeds no one
        for (i = 1; i <= n; i++) {
          if (!((i, p) in fset)) continue
          cnt = 0
          for (j = 1; j <= n; j++) {
            if (j == i) continue
            if ((j, cn) in usesset) cnt++
          }
          if (cnt > 0) feeds[i, cn] = cnt
        }
      }
    }
  }

  # Input (--input only): the summary file the plan was written from. An Attachment path
  # needs an entry of the attachments map, the section Root cause stands exactly when the
  # input gives a cause, and a Repro path sits on the Repro line of a task.
  if (ENVIRON["in_on"] == "1") {
    for (ak = 1; ak <= natt; ak++) {
      ae = attent[ak]
      sub(/^[^:]*:/, "", ae)
      ae = trim(ae)
      if (ae ~ /^".*"$/ || ae ~ /^\047.*\047$/) ae = substr(ae, 2, length(ae) - 2)
      aheld[ae] = 1
    }
    na = split(ENVIRON["in_atts"], inatt, "\n")
    for (ik = 1; ik <= na; ik++) {
      ip = inatt[ik]
      if (ip == "" || (ip in aheld) || (ip in iseen)) continue
      iseen[ip] = 1
      fail("input: Attachment " ip " has no entry in the attachments map - add one (Attachments)")
    }
    if (ENVIRON["in_cause"] == "1" && !hasrc) fail("input gives a root cause but the plan has no \"## Root cause\" section - add it (Root cause)")
    if (ENVIRON["in_cause"] != "1" && hasrc) fail("the plan carries a \"## Root cause\" section its input gives no cause for - drop it (Root cause)")
    for (i = 1; i <= n; i++) if (repro[i] != "") { rp = repro[i]; sub(/^\.\//, "", rp); rheld[rp] = 1 }
    nr = split(ENVIRON["in_repros"], inrep, "\n")
    for (ik = 1; ik <= nr; ik++) {
      ip = inrep[ik]
      rp = ip; sub(/^\.\//, "", rp)
      if (ip == "" || (rp in rheld) || (ip in rseen)) continue
      rseen[ip] = 1
      fail("input: Repro " ip " is on no task Repro: line - put it on the fixing task (Reproduced)")
    }
  }

  if (err) exit 4

  # --extra names a task the plan holds, or the call is refused
  if (extra != "" && !(extra in seen)) { printf "error: --extra: no such task: %s\n", extra > "/dev/stderr"; exit 2 }
  if (ENVIRON["dispatch"] != "" && !(ENVIRON["dispatch"] in seen)) { printf "error: --dispatch: no such task: %s\n", ENVIRON["dispatch"] > "/dev/stderr"; exit 2 }

  # task state from the done list, and the tasks the user dropped from the
  # skipped one - both are settled, neither is dispatched again
  ndone = 0
  split(done, dlist, /[[:space:]]+/)
  for (k in dlist) if (dlist[k] != "" && dlist[k] != "-") isdone[dlist[k]] = 1
  split(skipped, slist, /[[:space:]]+/)
  for (k in slist) if (slist[k] != "" && slist[k] != "-") isskipped[slist[k]] = 1
  for (i = 1; i <= n; i++) if (id[i] in isdone) ndone++

  if (extra != "") { scope(extra); exit 0 }

  printf "plan: %s\n", plan
  printf "title: %s\n", title
  printf "progress: %d/%d\n", ndone, n
  if (skipped != "") printf "skipped: %s\n", skipped
  if (unrev   != "") printf "unreviewed: %s\n", unrev
  if (defer   != "") printf "deferred: %s\n", defer
  if (closed  != "") printf "closed: %s\n", closed
  printf "%s", decisions
  printf "%s", rulings
  if (rthis && rthis < nrent) {
    rnext = rent[rthis + 1]
    sub(/[[:space:]]*\((built|this plan)\)$/, "", rnext)
    printf "next: phase %d of %d - %s\n", rthis + 1, nrent, trim(rnext)
  }
  printf "tasks: id | state | tdd | excl | hard | deps | feeds | files | title\n"
  for (i = 1; i <= n; i++) {
    f = ""
    for (k = 1; k <= nf[i]; k++) f = (f == "" ? fpath[i, k] : f "," fpath[i, k])
    fd = ""
    for (c = 1; c <= ncon; c++) if ((i, corder[c]) in feeds) fd = (fd == "" ? "" : fd ",") corder[c] ":" feeds[i, corder[c]]
    if (fd == "") fd = "-"
    state = (id[i] in isdone ? "done" : (id[i] in isskipped ? "skipped" : "todo"))
    x = (excl[i] == "true" ? "yes" : "-")
    hd = (hashard[i] ? "yes" : "-")
    printf "%s | %s | %s | %s | %s | %s | %s | %s | %s\n", id[i], state, tdd[i], x, hd, dnorm[i], fd, f, ttl[i]
  }
  for (i = 1; i <= n; i++) printf "verify: %s | %s\n", id[i], verifycmd(verif[i])

  # the profile of every open task, under --split only: tier and review tier from
  # the rules of the header, clamped after the waiver is decided
  if (profile)
    for (i = 1; i <= n; i++) {
      if ((id[i] in isdone) || (id[i] in isskipped)) continue
      fmax = 0
      for (c = 1; c <= ncon; c++) if (((i, corder[c]) in feeds) && feeds[i, corder[c]] > fmax) fmax = feeds[i, corder[c]]
      heavy = (fmax >= 3)
      subj = (tdd[i] == "required" ? id[i] " [TDD]" : id[i]) " - " ttl[i]
      if (hashard[i]) {
        printf "profile: %s | tier: %s | review: %s | subject: %s\n", id[i], clampt("opus"), clampt(reviewtier("opus", heavy)), subj
      } else if (tdd[i] == "none" && nf[i] <= 2) {
        alt = (heavy ? "review " clampt(reviewtier("sonnet", heavy)) : "waive? " clampt("sonnet"))
        printf "profile: %s | haiku? | mechanical: %s review %s | else: %s %s | subject: %s\n", id[i], clampt("haiku"), clampt(reviewtier("haiku", heavy)), clampt("sonnet"), alt, subj
      } else if (tdd[i] == "none" && !heavy) {
        printf "profile: %s | tier: %s | review: waive? %s | subject: %s\n", id[i], clampt("sonnet"), clampt("sonnet"), subj
      } else {
        printf "profile: %s | tier: %s | review: %s | subject: %s\n", id[i], clampt("sonnet"), clampt(reviewtier("sonnet", heavy)), subj
      }
    }

  # a task whose own files carry uncommitted work: an earlier session was cut
  # off inside it, and a fresh coder would land on top of what it left. The
  # Repro path is uncommitted by design, so it is never that evidence. A done
  # task is settled - its own dirty files are not a session cut off inside it,
  # they are orphan: below
  for (i = 1; i <= n; i++) {
    if (id[i] in isdone) continue
    d = ""
    for (k = 1; k <= nf[i]; k++)
      if (fpath[i, k] in chg && fpath[i, k] != repro[i]) d = (d == "" ? fpath[i, k] : d "," fpath[i, k])
    if (d != "") printf "dirty: %s | %s\n", id[i], d
  }

  # a changed path claimed by no task not done: a done task no longer owns its
  # dirty files (moved above into "dirty:" only for todo and skipped), and a
  # path outside every task map entirely is the same kind of orphaned work - a
  # session cut off after a task landed, or one that touched a file no task
  # names at all. Walked in ch[] order (git order), never "for (p in chg)",
  # whose order awk leaves unspecified. The run directory itself is excluded,
  # the same exclusion commit-task.sh applies in warn_unclaimed().
  for (i = 1; i <= n; i++) {
    if (id[i] in isdone) continue
    for (k = 1; k <= nf[i]; k++) claimedp[fpath[i, k]] = 1
  }
  orph = ""
  for (k = 1; k <= nch; k++) {
    p = ch[k]
    if (p == "") continue
    if (p in claimedp) continue
    if (rundir != "" && index(p, rundir "/") == 1) continue
    orph = orph "orphan: " p "\n"
  }
  printf "%s", orph

  # the review instruction, last and on a fresh plan only: the reviewers the
  # planner dispatches, task-review slices cut as plan-gate.sh cuts them
  # (ceil(n / 8) runs, sizes differing by at most one, the larger first)
  if (mode != "--split") {
    if (n <= 12) {
      printf "review: single\n"
      printf "dispatch: viber:planner-review\n"
    } else {
      printf "review: set\n"
      printf "dispatch: viber:planner-spec-review\n"
      printf "dispatch: viber:planner-graph-review\n"
      m = int((n + 7) / 8)
      base = int(n / m)
      rem = n % m
      c = 1
      for (i = 1; i <= m; i++) {
        ce = c + base - 1 + (i <= rem ? 1 : 0)
        printf "dispatch: viber:planner-task-review | tasks: T%d-T%d\n", c, ce
        c = ce + 1
      }
      if (n > 30 && (ENVIRON["accepted"] == "" || n > ENVIRON["accepted"] + 0)) printf "threshold: %d tasks, past 30\n", n
    }
  }
}
' "$plan")"

# --final-review: one dispatch block per slice of consecutive tasks, read off the
# validated index above (its task rows, progress and closed lines). The plugin root
# is this script's own path as invoked, cut at its "/scripts/<name>.sh" as text.
if [[ "$has_final" -eq 1 ]]; then
  plugin_root="$(plugin_root_of "$0" 1)"

  fr_ids=()
  fr_done=0
  fr_closed=""
  in_rows=0
  while IFS= read -r row; do
    case "$row" in
      "closed: "*) fr_closed="${row#closed: }" ;;
      "tasks: "*) in_rows=1 ;;
      "verify: "*) in_rows=0 ;;
      *)
        if [[ $in_rows -eq 1 ]]; then
          row_rest="${row#* | }"
          fr_ids+=("${row%% | *}")
          [[ "${row_rest%% | *}" != "done" ]] || fr_done=$((fr_done + 1))
        fi
        ;;
    esac
  done < <(printf '%s\n' "$index_out")

  case " $fr_closed " in
    *" final-review "*) printf 'NEXT: skip\n'; exit 0 ;;
  esac
  if [[ $fr_done -eq 0 ]]; then printf 'NEXT: skip\n'; exit 0; fi

  # sonnet clamped into tiers.min..tiers.max (haiku < sonnet < opus < fable)
  fr_model="sonnet"
  case "$tier_min" in haiku) r_min=1 ;; sonnet) r_min=2 ;; opus) r_min=3 ;; fable) r_min=4 ;; *) r_min=1 ;; esac
  case "$tier_max" in haiku) r_max=1 ;; sonnet) r_max=2 ;; opus) r_max=3 ;; fable) r_max=4 ;; *) r_max=3 ;; esac
  r_model=2
  if [[ $r_model -lt $r_min ]]; then r_model=$r_min; fi
  if [[ $r_model -gt $r_max ]]; then r_model=$r_max; fi
  case "$r_model" in 1) fr_model="haiku" ;; 2) fr_model="sonnet" ;; 3) fr_model="opus" ;; *) fr_model="fable" ;; esac

  fr_n=${#fr_ids[@]}
  fr_m=$(((fr_n + 7) / 8))
  fr_base=$((fr_n / fr_m))
  fr_rem=$((fr_n % fr_m))
  fr_at=0
  for ((k = 1; k <= fr_m; k++)); do
    fr_size=$fr_base
    if [[ $k -le $fr_rem ]]; then fr_size=$((fr_size + 1)); fi
    fr_list=""
    for ((j = fr_at; j < fr_at + fr_size; j++)); do fr_list="${fr_list:+$fr_list, }${fr_ids[$j]}"; done
    fr_at=$((fr_at + fr_size))
    printf 'NEXT: final-review | slice: %d | model: %s\n' "$k" "$fr_model"
    printf 'run: %s\n' "$dir"
    printf 'tasks: %s\n' "$fr_list"
    printf 'report: %s/work/final-review-%d.md\n' "$dir" "$k"
    printf 'refs: %s/references\n' "$plugin_root"
    printf 'memory: %s\n' "$cfg_memory"
    printf 'scope: "%s/scripts/plan-index.sh" "%s" --slice "%s"\n' "$plugin_root" "$plan" "${fr_list//, /,}"
  done
  exit 0
fi

# --slice: the commits and files of a final-review slice, read off the validated
# index above (its id and title columns) and the history since the oldest commit
# that added the plan. Nothing is written.
if [[ "$has_slice" -eq 1 ]]; then
  # Every path handed to git below is literal: a bracketed path stays one file.
  export GIT_LITERAL_PATHSPECS=1

  t_ids=()
  t_titles=()
  in_rows=0
  while IFS= read -r row; do
    case "$row" in
      "tasks: "*) in_rows=1 ;;
      "verify: "*) in_rows=0 ;;
      *)
        if [[ $in_rows -eq 1 ]]; then
          row_rest="$row"
          for _ in 1 2 3 4 5 6 7 8; do row_rest="${row_rest#* | }"; done
          t_ids+=("${row%% | *}")
          t_titles+=("$row_rest")
        fi
        ;;
    esac
  done < <(printf '%s\n' "$index_out")

  slice_ords=" "
  max_ord=0
  set -f
  for want in ${slice_arg//,/ }; do
    found=0
    for ((i = 0; i < ${#t_ids[@]}; i++)); do
      if [[ "${t_ids[$i]}" == "$want" ]]; then
        found=1
        slice_ords="$slice_ords$((i + 1)) "
        [[ $((i + 1)) -le $max_ord ]] || max_ord=$((i + 1))
      fi
    done
    if [[ $found -eq 0 ]]; then
      set +f
      echo "error: --slice: no such task: $want" >&2
      exit 2
    fi
  done
  set +f
  if [[ "$slice_ords" == " " ]]; then echo "$usage" >&2; exit 2; fi

  slice_base=""
  if git rev-parse --git-dir >/dev/null 2>&1; then
    slice_base="$(git log --diff-filter=A --reverse --format=%H -- "$plan" 2>/dev/null | sed -n '1p')"
  fi
  [[ -n "$slice_base" ]] || exit 0

  slice_commits=""
  slice_files=""
  other_files=$'\n'
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    c_sha="${line%% *}"
    c_subject="${line#* }"
    c_ord=0
    for ((i = 0; i < ${#t_ids[@]}; i++)); do
      t_id="${t_ids[$i]}"
      t_title="${t_titles[$i]}"
      if [[ "$c_subject" == "$t_id - $t_title" ]]; then c_ord=$((i + 1)); break; fi
      if [[ "$c_subject" == "$t_id("* ]]; then
        c_rest="${c_subject#"$t_id("}"
        c_num="${c_rest%%)*}"
        case "$c_num" in '' | *[!0-9]*) continue ;; esac
        if [[ "$c_rest" == "$c_num) - $t_title" ]]; then c_ord=$((i + 1)); break; fi
      fi
    done
    [[ $c_ord -gt 0 ]] || continue
    case "$slice_ords" in
      *" $c_ord "*) in_slice=1 ;;
      *) in_slice=0 ;;
    esac
    if [[ $in_slice -eq 0 && $c_ord -ge $max_ord ]]; then continue; fi
    if [[ $in_slice -eq 1 ]]; then
      slice_commits="${slice_commits}commit: ${t_ids[$((c_ord - 1))]} | $c_sha | $c_subject"$'\n'
    fi
    while IFS= read -r -d '' f; do
      if [[ $in_slice -eq 1 ]]; then slice_files="$slice_files$f"$'\n'; else other_files="$other_files$f"$'\n'; fi
    done < <(git diff-tree -r -z --no-commit-id --no-renames --root --name-only "$c_sha" 2>/dev/null || true)
  done < <(git log --reverse --format='%h %s' "$slice_base..HEAD" 2>/dev/null || true)

  [[ -n "$slice_commits" ]] || exit 0
  printf '%s' "$slice_commits"
  while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    case "$other_files" in *$'\n'"$f"$'\n'*) continue ;; esac
    printf 'file: %s\n' "$f"
  done < <(printf '%s' "$slice_files" | LC_ALL=C sort -u)
  exit 0
fi

# --dispatch: the labelled lines of one task's coder or reviewer dispatch, read off
# the validated index above (its deps column) and the state beside the plan. The
# plugin root is this script's own path as invoked, cut at its "/scripts/<name>.sh"
# as text, never resolved.
if [[ "$has_dispatch" -eq 1 ]]; then
  plugin_root="$(plugin_root_of "$0" 1)"

  dep_rows=""
  in_rows=0
  while IFS= read -r row; do
    case "$row" in
      "tasks: "*) in_rows=1 ;;
      "verify: "*) in_rows=0 ;;
      *)
        if [[ $in_rows -eq 1 ]]; then
          row_rest="${row#* | }"
          row_rest="${row_rest#* | }"
          row_rest="${row_rest#* | }"
          row_rest="${row_rest#* | }"
          row_rest="${row_rest#* | }"
          dep_rows="$dep_rows${row%% | *} ${row_rest%% | *}"$'\n'
        fi
        ;;
    esac
  done < <(printf '%s\n' "$index_out")

  own_deps=""
  while IFS=' ' read -r d_id d_list; do
    if [[ "$d_id" == "$dispatch_id" && "$d_list" != "-" ]]; then own_deps="$d_list"; fi
  done < <(printf '%s' "$dep_rows")

  # the task and every task it depends on, directly or through another
  related=" $dispatch_id "
  grew=1
  while [[ $grew -eq 1 ]]; do
    grew=0
    while IFS=' ' read -r d_id d_list; do
      case "$related" in *" $d_id "*) ;; *) continue ;; esac
      [[ "$d_list" != "-" ]] || continue
      for d in ${d_list//,/ }; do
        case "$related" in
          *" $d "*) ;;
          *) related="$related$d "; grew=1 ;;
        esac
      done
    done < <(printf '%s' "$dep_rows")
  done

  baseline_on=0
  cfg_out="$(bash "$(dirname -- "${BASH_SOURCE[0]}")/config.sh" 2>/dev/null || true)"
  cfg_out="${cfg_out//$'\r'/}"
  case $'\n'"$cfg_out"$'\n' in
    *$'\nbuild.baseline-tests: fast\n'*|*$'\nbuild.baseline-tests: full\n'*) baseline_on=1 ;;
  esac

  deferred_paths=""
  set -f
  for entry in $st_deferred; do
    if [[ "${entry%%:*}" == "$dispatch_id" && "$entry" == *:* ]]; then
      deferred_paths="${deferred_paths:+$deferred_paths, }${entry#*:}"
    fi
  done
  set +f

  prior_paths=""
  for d in ${own_deps//,/ }; do
    prior_paths="${prior_paths:+$prior_paths, }$dir/work/$d-coder.md"
  done

  decision_lines=""
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    d_rest="${line#decision:}"
    d_rest="${d_rest# }"
    case "$related" in *" ${d_rest%%:*} "*) decision_lines="$decision_lines$line"$'\n' ;; esac
  done < <(printf '%s' "$st_decisions")

  lessons=""
  if [[ "$dispatch_form" == "coder" ]]; then
    root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
    if [[ -f "$root/.temp/viber/lessons" ]]; then
      lessons="$(sed -n '2p' "$root/.temp/viber/lessons" 2>/dev/null || true)"
      lessons="${lessons//$'\r'/}"
      lessons="${lessons#lessons: }"
    fi
  fi

  emit() { [[ -z "$2" ]] || printf '%s: %s\n' "$1" "$2"; }
  emit task "$dir/tasks/$dispatch_id.md"
  emit notes "$dir/work/$dispatch_id-coder.md"
  emit out ".temp/viber/$dispatch_id/"
  emit refs "$plugin_root/references"
  if [[ "$dispatch_form" == "coder" ]]; then
    emit extras "$dir/work/$dispatch_id-extra.md"
    emit decide-file "$dir/work/$dispatch_id-options.md"
  fi
  [[ $baseline_on -eq 0 ]] || emit baseline "$dir/work/tests-baseline.md"
  emit deferred "$deferred_paths"
  [[ "$dispatch_form" != "coder" ]] || emit prior "$prior_paths"
  printf '%s' "$decision_lines"
  if [[ "$dispatch_form" == "coder" ]]; then
    emit run-lessons "$lessons"
  else
    emit extras "$dir/work/$dispatch_id-extra-review.md"
    emit scope "\"$plugin_root/scripts/plan-index.sh\" \"$plan\" --extra \"$dispatch_id\""
  fi
  exit 0
fi

# --split: the extras files of a task not done belong to a session that is over
# (a done task keeps its files, committed in its trail). Task rows sit between
# the "tasks:" header and the first "verify:" line of the index.
if [[ "$mode" == "--split" ]]; then
  in_rows=0
  while IFS= read -r row; do
    case "$row" in
      "tasks: "*) in_rows=1 ;;
      "verify: "*) in_rows=0 ;;
      *)
        if [[ $in_rows -eq 1 ]]; then
          row_id="${row%% | *}"
          row_rest="${row#* | }"
          if [[ "${row_rest%% | *}" != "done" ]]; then
            rm -f -- "$dir/work/$row_id-extra.md" "$dir/work/$row_id-extra-review.md"
          fi
        fi
        ;;
    esac
  done < <(printf '%s\n' "$index_out")
fi

[[ -z "$index_out" ]] || printf '%s\n' "$index_out"

# --split: one extension block per name of build.extensions left to run, after the
# orphan: lines. A step is cut on ", ", its names on " + "; a name status.md closed:
# holds as extension:<name> prints none, and a step with no name left takes no number.
if [[ "$mode" == "--split" && "$cfg_ext" != "none" && -n "$cfg_ext" ]]; then
  ext_step=0
  ext_rest="$cfg_ext, "
  while [[ -n "$ext_rest" ]]; do
    ext_cur="${ext_rest%%, *}"
    ext_rest="${ext_rest#*, }"
    ext_open=0
    ext_names="$ext_cur + "
    while [[ -n "$ext_names" ]]; do
      ext_name="${ext_names%% + *}"
      ext_names="${ext_names#* + }"
      [[ -n "$ext_name" ]] || continue
      case " $st_closed " in
        *" extension:$ext_name "*) continue ;;
      esac
      if [[ $ext_open -eq 0 ]]; then ext_open=1; ext_step=$((ext_step + 1)); fi
      printf 'NEXT: extension | step: %d | name: %s\n' "$ext_step" "$ext_name"
      printf 'run: %s\n' "$dir"
      printf 'spec: %s/spec.md\n' "$dir"
      printf 'notes: %s/work/\n' "$dir"
      printf 'out: .temp/viber/extension-%s/\n' "$ext_name"
    done
  done
fi

# --split: last, the commit of the QA documents already in the run directory, when
# build.qa is true and status.md has not closed qa. qa.md first, then qa.e2e.md, each
# only when present. <plugin root> is cut as under --dispatch.
if [[ "$mode" == "--split" && "$cfg_qa" == "true" ]]; then
  case " $st_closed " in
    *" qa "*) ;;
    *)
      qa_paths=""
      for qa_name in qa.md qa.e2e.md; do
        [[ ! -f "$dir/$qa_name" ]] || qa_paths="$qa_paths \"$dir/$qa_name\""
      done
      if [[ -n "$qa_paths" ]]; then
        printf 'NEXT: qa-kept\n'
        printf 'RUN: "%s/scripts/commit-task.sh" --qa "%s"%s\n' "$(plugin_root_of "$0" 1)" "$plan" "$qa_paths"
      fi
      ;;
  esac
fi

[[ "$mode" == "--split" ]] || exit 0

# --- the decomposition, beside the plan ---
# A second pass over a file the first one just proved well-formed: every id is
# present, unique and a bare token, so nothing here has to guard against drift.
rm -rf -- "$dir/tasks" "$dir/phases.md" "$dir/roadmap.md"
mkdir -p -- "$dir/tasks"

dir="$dir" awk '
function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }

# the clauses of a DoD value cut on each semicolon outside a backtick span, into
# cl[1..n], n returned. A span runs from a backtick to the next one and is kept
# whole; a backtick with no closing partner is plain text. Copy of the one in
# the validating program: one edit changes both.
function dodcut(s, cl,   n, cur, i, len, ch, j) {
  split("", cl)
  n = 0; cur = ""; i = 1; len = length(s)
  while (i <= len) {
    ch = substr(s, i, 1)
    if (ch == "`") {
      j = index(substr(s, i + 1), "`")
      if (j > 0) { cur = cur substr(s, i, j + 1); i += j + 1; continue }
    }
    if (ch == ";") { cl[++n] = cur; cur = ""; i++; continue }
    cur = cur ch; i++
  }
  cl[++n] = cur
  return n
}

# the body under a heading, up to the next heading of any level: leading blank
# lines dropped, interior ones kept, trailing ones collapsed away
function section(pat,   i, started, out, pend) {
  started = 0; out = ""; pend = 0
  for (i = 1; i <= NR; i++) {
    if (!started) { if (!fnc[i] && line[i] ~ pat) started = 1; continue }
    if (!fnc[i] && line[i] ~ /^##/) break
    if (trim(line[i]) == "") { if (out != "") pend++; continue }
    while (pend > 0) { out = out "\n"; pend-- }
    out = out line[i] "\n"
  }
  return out
}

function rstrip(s) {
  while (s ~ /\n[[:space:]]*\n$/) sub(/\n[[:space:]]*\n$/, "\n", s)
  return s
}

# The "- DoD:" line, cut on ";" into one numbered line per clause. A coder
# answers for each clause and a reviewer gates each one, which a single sentence
# carrying seven of them does not allow. Empty clauses are dropped, so the
# numbers stay contiguous and both sides cite the same one; a DoD that cuts into
# nothing at all is left exactly as it was written.
function dodlines(s,   v, m, cl, k, c, out, j) {
  v = s
  sub(/^[^:]*:/, "", v)
  m = dodcut(v, cl)
  out = ""; j = 0
  for (k = 1; k <= m; k++) {
    c = trim(cl[k])
    if (c == "") continue
    out = out "- DoD." (++j) ": " c "\n"
  }
  return (j ? out : s "\n")
}

# the criterion numbers of a "Covers:" value: tokens split on commas and
# whitespace, only "AC<n>" counting, so "#3", "3" and an annotation like
# "(see S3)" name no criterion. c and m are locals: the callers loop on globals.
function covnums(s, out,   c, m, k, j) {
  m = split(s, c, /[,[:space:]]+/)
  j = 0
  for (k = 1; k <= m; k++) if (c[k] ~ /^AC[0-9]+$/) { sub(/^AC/, "", c[k]); out[++j] = c[k] }
  return j
}

# the length of the run of one repeated first character that opens t
function frun(t,   c, n) {
  c = substr(t, 1, 1); n = 0
  while (substr(t, n + 1, 1) == c) n++
  return n
}

# Fed every line in order: 1 when the line sits inside a ``` or ~~~ fence (the
# fence lines included), so a heading-looking line there is body text. A fence
# ends only on a bare line of the same character at least as long as the line
# that opened it. A comment opened outside a fence runs to its closing arrow and
# opens no fence; inside a fence a comment opener is text. fch (the fence
# character), flen (its opening length) and fcom carry the state between lines.
function fstep(raw,   t) {
  t = trim(raw)
  if (fch == "") {
    if (fcom) { if (t ~ /-->/) fcom = 0; return 0 }
    if (t ~ /^<!--/) { if (t !~ /-->/) fcom = 1; return 0 }
    if (t ~ /^(```|~~~)/) { fch = substr(t, 1, 1); flen = frun(t); return 1 }
    return 0
  }
  if (substr(t, 1, 1) == fch && t ~ /^(`+|~+)$/ && length(t) >= flen) fch = ""
  return 1
}

BEGIN { dir = ENVIRON["dir"] }
{ line[NR] = $0; fnc[NR] = fstep($0) }

END {
  # the cut: everything above the task list is the specification
  for (i = 1; i <= NR; i++) if (!fnc[i] && line[i] ~ /^##[[:space:]]*Tasks/) { cut = i; break }
  if (!cut) cut = NR + 1

  # The specification: everything above the task list, minus the frontmatter and
  # minus every HTML comment. --land already strips the guidance the template
  # carries, and a plan that never went through it still carries all of it;
  # a plan written before the source path moved into the frontmatter carries that
  # marker as a comment too. Nothing above the cut is read by anything here, so
  # the cut takes them all, single-line and block alike, and collapses the blank
  # runs they leave so the head reads like a document written without them. A
  # fenced block is copied through line for line: a comment there is an example.
  # (No apostrophe anywhere in here: this comment sits INSIDE the single-quoted
  # awk program, where one would close the quote.)
  spec = dir "/spec.md"
  # The frontmatter is run plumbing too - it carries the source path, the one
  # key the implementor reads out of the plan text - so the specification starts
  # after it. No closing marker means no frontmatter: the whole head is kept
  # rather than swallowed. issue: is the one frontmatter key that outlives the
  # run - the archive keeps it - so it alone rides into spec.md as its own
  # three-line frontmatter; every other key stays in plan.md.
  sfrom = 1
  issueval = ""
  if (trim(line[1]) == "---") {
    for (i = 2; i < cut; i++) {
      t = trim(line[i])
      if (t == "---") { sfrom = i + 1; break }
      if (t ~ /^issue:/) { v = t; sub(/^issue:/, "", v); issueval = trim(v) }
    }
  }
  if (issueval != "") {
    print "---" > spec
    print "issue: " issueval > spec
    print "---" > spec
    print "" > spec
  }
  # The "## Phases" section, heading included, up to the next "## " heading,
  # goes to phases.md instead, under the same comment and blank-line rules: it
  # holds the phases this plan does not build, which are no part of its
  # specification. No section, no file.
  phases = dir "/phases.md"
  for (i = sfrom; i < cut; i++) {
    t = trim(line[i])
    if (incom) { if (t ~ /-->/) incom = 0; continue }
    if (sfence == "") {
      if (t ~ /^<!--/) { if (t !~ /-->/) incom = 1; continue }
      if (line[i] ~ /^##[[:space:]]/) {
        inphases = (line[i] ~ /^##[[:space:]]*(Phases|Roadmap)[[:space:]]*$/)
        if (inphases) line[i] = "## Phases"
      }
      if (t == "") { if (inphases) rblank = 1; else sblank = 1; continue }
      if (t ~ /^(```|~~~)/) { sfence = substr(t, 1, 1); slen = frun(t) }
    } else if (substr(t, 1, 1) == sfence && t ~ /^(`+|~+)$/ && length(t) >= slen) sfence = ""
    if (inphases) {
      if (rblank && rkept) print "" > phases
      rblank = 0; rkept = 1
      print line[i] > phases
      continue
    }
    if (sblank && skept) print "" > spec
    sblank = 0; skept = 1
    print line[i] > spec
  }
  close(spec)
  if (rkept) close(phases)

  # the standing context every task file carries: what the run is for, and the
  # two boundaries none of its coders may cross - the behaviour that has to keep
  # working, where the spec shape names any, and the area the change does not
  # touch. A coder is handed its task file and nothing else, so all three travel
  # with it rather than sitting in a spec it reads. "### Must not change" is the
  # one anchor only the big shape carries: absent, it prints nothing, which is
  # why this stays one script over both shapes.
  goal = section("^##[[:space:]]*Goal[[:space:]]*$")
  mnc  = section("^###[[:space:]]*Must not change[[:space:]]*$")
  oos  = section("^###[[:space:]]*Out of scope[[:space:]]*$")

  # contract blocks by id: the heading line plus everything under it, sliced into
  # the task files their "Uses:" names and nowhere else
  for (i = 1; i <= NR; i++) {
    s = line[i]
    if (!fnc[i] && s ~ /^##[[:space:]]/) { incon = (s ~ /Contracts/); cid = ""; continue }
    if (!incon) continue
    if (!fnc[i] && s ~ /^###[[:space:]]/) {
      h = trim(substr(s, 4)); p = index(h, " - ")
      cid = (p ? trim(substr(h, 1, p - 1)) : trim(h))
      cbody[cid] = s "\n"
      continue
    }
    if (cid != "") cbody[cid] = cbody[cid] s "\n"
  }

  # acceptance criteria by number: the "N." line plus its continuations, ended by
  # the next number, a blank line or the end of the section
  for (i = 1; i < cut; i++) {
    s = line[i]
    if (!fnc[i] && s ~ /^##[[:space:]]/) { incrit = (s ~ /Acceptance criteria/); cur = 0; continue }
    if (!incrit) continue
    if (s ~ /^[0-9]+\./)    { c = s; sub(/\..*/, "", c); cur = c + 0; crit[cur] = s; continue }
    if (trim(s) == "")      { cur = 0; continue }
    if (cur) crit[cur] = crit[cur] "\n" s
  }

  # one file per task, and it is the whole job: the block verbatim, the run goal,
  # the criteria it covers, the contracts it uses, the boundaries it may not cross
  for (i = cut; i <= NR; i++) {
    if (line[i] ~ /^[[:space:]]*<!--[[:space:]]*TASK[[:space:]]*-->[[:space:]]*$/)   { intask = 1; body = ""; id = ""; cov = ""; use = ""; continue }
    if (line[i] ~ /^[[:space:]]*<!--[[:space:]]*\/TASK[[:space:]]*-->[[:space:]]*$/) {
      intask = 0
      if (id == "") continue
      f = dir "/tasks/" id ".md"
      printf "%s", body > f
      if (goal != "") printf "\n## Goal\n%s", goal > f
      m = split(cov, cn, /[[:space:]]+/)
      if (m > 0) {
        printf "\n## Covered criteria\n" > f
        for (k = 1; k <= m; k++) if (cn[k] != "" && (cn[k] + 0) in crit) printf "%s\n", crit[cn[k] + 0] > f
      }
      m = split(use, un, /[[:space:]]+/)
      opened = 0
      for (k = 1; k <= m; k++) {
        if (un[k] == "" || !(un[k] in cbody)) continue
        if (!opened) { printf "\n## Contracts\n" > f; opened = 1 }
        printf "\n%s", rstrip(cbody[un[k]]) > f
      }
      if (mnc != "") printf "\n## Must not change\n%s", mnc > f
      if (oos != "") printf "\n## Out of scope\n%s", oos > f
      close(f)
      n++
      continue
    }
    if (!intask) continue
    if (line[i] ~ /^-[[:space:]]*DoD:/) { body = body dodlines(line[i]); continue }
    body = body line[i] "\n"
    if (id == "" && !fnc[i] && line[i] ~ /^###[[:space:]]/) {
      h = trim(substr(line[i], 4)); p = index(h, " - ")
      id = (p ? trim(substr(h, 1, p - 1)) : trim(h))
    }
    if (line[i] ~ /^-[[:space:]]*Covers:/) {
      c = line[i]; sub(/^[^:]*:/, "", c)
      delete cn; m = covnums(c, cn); cov = ""
      for (k = 1; k <= m; k++) cov = cov (k > 1 ? " " : "") cn[k]
    }
    if (line[i] ~ /^-[[:space:]]*Uses:/) {
      u = line[i]; sub(/^[^:]*:/, "", u); gsub(/,/, " ", u); use = trim(u)
      if (use == "none" || use == "-") use = ""
    }
  }
  printf "decomposed: %d tasks into %s\n", n, dir > "/dev/stderr"
}
' "$plan"

# --- the attachments, closing the specification ---
# The files and directories --land copied into <run>/attachments/ are listed
# by repo-relative path, a directory ending in "/", sorted by name (byte order,
# whatever the locale), so a task that needs one names it itself. No
# directory, or nothing in it, means no section.
attach_list=""
if [[ -d "$dir/attachments" ]]; then
  while IFS= read -r attach; do
    if [[ -f "$attach" ]]; then
      attach_list="$attach_list$attach"$'\n'
    elif [[ -d "$attach" ]]; then
      attach_list="$attach_list$attach/"$'\n'
    fi
  done < <(printf '%s\n' "$dir"/attachments/* | LC_ALL=C sort)
fi
if [[ -n "$attach_list" ]]; then
  {
    printf '\n## Attachments\n'
    printf '%s' "$attach_list"
  } >> "$dir/spec.md"
fi

# --- the run's state file ---
# Created here, with the run, and only when it is not there yet: a resume splits
# again and must find its progress untouched. commit-task.sh is its only other
# writer, and the plan beside it is never written to again at all.
if [[ ! -f "$dir/status.md" ]]; then
  total="$(grep -cE '^[[:space:]]*<!--[[:space:]]*TASK[[:space:]]*-->[[:space:]]*$' -- "$plan" || true)"
  {
    printf '# status\n\n'
    printf 'progress: 0/%s\n' "${total:-0}"
    printf 'done: none\n'
    printf 'skipped: none\n'
    printf 'unreviewed: none\n'
    printf 'deferred: none\n'
    printf 'closed: none\n'
  } > "$dir/status.md"
fi

# --- and into the history ---
# The decomposition lives under docs/, so it has to be committed by somebody: no
# task's "Files:" list names it, and commit-task.sh stages nothing it was not
# given. The pathspec names only the paths this call itself writes or owns
# (plan.md, spec.md, tasks/, status.md, phases.md when the plan carries a
# "## Phases" section and attachments/ when --land copied files in, which
# spec.md lists under "## Attachments") rather than the whole run directory:
# a coder's own docs/<run>/work/ trail file is written later, by a different
# actor, and must stay untracked until commit-task.sh decides it belongs in a
# task's own commit - swept in here it would ride into a chore commit no task
# claims. Every failure here is swallowed - the files are on disk either way,
# and a build must not stop because git refused a chore commit.
# A run tied to an issue (the frontmatter's "issue:" key, a full GitHub issue URL)
# gets "Refs: #<N>" as the footer, as every commit-task.sh commit of the run does;
# issue_ref() is a verbatim copy of commit-task.sh's, so change the two together.
issue_ref() {
  local line val first=1 num=""
  local fence='^[[:space:]]*---[[:space:]]*$'
  local key='^[[:space:]]*issue:[[:space:]]*(.*)$'
  local url='/issues/([0-9]+)([/?#].*)?[[:space:]]*$'
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ $first -eq 1 ]]; then
      first=0
      [[ "$line" =~ $fence ]] || return 0
      continue
    fi
    if [[ "$line" =~ $fence ]]; then
      [[ -z "$num" ]] || printf '#%s\n' "$num"
      return 0
    fi
    if [[ "$line" =~ $key ]]; then
      num=""
      val="${BASH_REMATCH[1]}"
      if [[ "$val" =~ $url ]]; then num="${BASH_REMATCH[1]}"; fi
    fi
  done < "$1"
}
issue="$(issue_ref "$plan")"
commit_msg=(-m "chore(viber): decompose plan ${dir##*/}")
[[ -z "$issue" ]] || commit_msg+=(-m "Refs: $issue")
split_paths=("$dir/plan.md" "$dir/spec.md" "$dir/tasks" "$dir/status.md")
[[ ! -f "$dir/phases.md" ]] || split_paths+=("$dir/phases.md")
# a run split under the name roadmap.md: its removal above is committed too
! git ls-files --error-unmatch -- "$dir/roadmap.md" >/dev/null 2>&1 || split_paths+=("$dir/roadmap.md")
[[ -z "$attach_list" ]] || split_paths+=("$dir/attachments")
if git rev-parse --git-dir >/dev/null 2>&1; then
  git add -A -- "${split_paths[@]}" >/dev/null 2>&1 || true
  if ! git diff --cached --quiet -- "${split_paths[@]}" 2>/dev/null; then
    git commit "${commit_msg[@]}" -- "${split_paths[@]}" >&2 || true
  fi
fi

exit 0

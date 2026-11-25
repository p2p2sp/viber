// plan-index.ts - compact task index for the orchestrator, plus plan structure
// validation and, on demand, the decomposition the per-task agents read. The entry
// holds no logic: viber/lib/plan-index/ does all of it, and its callers run it
// through the wrapper plan-index.sh, whose name the usage and the printed
// commands carry.
//
// Usage:
//   plan-index.sh <plan-file>            validate + index (the planner's call)
//   plan-index.sh <plan-file> --split    ... and decompose (the orchestrator's call)
//   plan-index.sh <plan-file> --extra <task-id>
//                                        the reviewer's scope for one task (below)
//   plan-index.sh <plan-file> --dispatch <task-id> coder|reviewer
//                                        the labelled lines of one dispatch (below)
//   plan-index.sh <plan-file> --slice <id>[,<id>]...
//                                        the commits and files of a final-review slice (below)
//   plan-index.sh <plan-file> --final-review
//                                        the final-review dispatch blocks (below)
//   plan-index.sh <plan-file> --input <summary-file>
//                                        validate + index, and check the plan against the
//                                        planner's input (below)
//   plan-index.sh <plan-file> --detailed
//                                        validate + index, and refuse a task still holding
//                                        PENDING (below)
//
// stdout (the orchestrator's only view of the plan - the decomposed files are read
// by agents):
//   plan: <path>
//   title: <plan title>
//   progress: <done>/<total>
//   skipped: T4                     only when status.md carries the entry
//   unreviewed: T3                  only when status.md carries the entry
//   deferred: T7:src/a.ts           only when status.md carries the entry
//   closed: memory rules            only when status.md carries the entry
//   decision: T2: <text>            one per "decision:" line of status.md, in
//                                   file order, printed as it stands there
//   ruling: T2: retry | why: <why> | cost if wrong: <cost>
//                                   one per "- " entry of rulings.md beside the
//                                   plan (commit-task.sh --rule), leading "- "
//                                   dropped, in file order, after the decision
//                                   lines; none when the file is absent
//   next: phase <n> of <N> - <name>
//                                   only when the plan's phases have an entry after
//                                   the one marked "(this plan)": that entry, its
//                                   1-based position, the entry count, the name
//                                   without its marker (e.g. next: phase 3 of 4 - X)
//   tasks: id | state | tdd | excl | hard | deps | feeds | files | title
//   T1 | done | none     | -   | -   | -  | C1:1 | .claude/settings.json | Tighten the settings schema
//   T2 | todo | required | yes | yes | T1 | -    | src/a.ts,src/b.ts     | Add the retry loop
//   verify: T1 | node --test tests/settings.test.ts
//   verify: T2 | grep -n "retry" src/a.ts
//   profile: T2 | tier: opus | review: opus | subject: T2 [TDD] - Add the retry loop
//                                   --split only: one per task neither done nor
//                                   skipped, in task order, after the verify:
//                                   lines (below)
//   dirty: T2 | src/a.ts            only for a task not done whose own files are
//                                   dirty (its "Repro:" path excepted)
//   orphan: lib/x.ts                one line per changed path claimed by no task
//   orphan: lib/y.ts                not "done" (run directory excluded), in git
//                                   order, a path holding a comma kept whole;
//                                   no line when none
//   NEXT: extension | step: 1 | name: write-help
//   run: <dir>                      --split only, after the orphan: lines: one block
//   spec: <dir>/spec.md             per name of the config build.extensions: line
//   notes: <dir>/work/              (steps split on ", ", the names of a step on
//   out: .temp/viber/extension-write-help/   " + "), in listed order, its step: the
//                                   number of the step among those keeping a name,
//                                   from 1. A name status.md closed: holds as
//                                   extension:<name> prints no block and a step
//                                   whose every name is closed takes no number;
//                                   "build.extensions: none" prints none. Blocks
//                                   follow each other with no blank line.
//   NEXT: qa-kept                  --split only, last (after every extension block),
//   RUN: "<plugin root>/scripts/commit-task.sh" --qa "<plan>" "<dir>/qa.md" "<dir>/qa.e2e.md"
//                                   when build.qa is true, <dir>/qa.md or <dir>/qa.e2e.md
//                                   exists and closed: does not name qa: the --qa call
//                                   over each of the two present, qa.md first;
//                                   <plugin root> is cut as under --dispatch. No block
//                                   otherwise.
//   review: single                last, on a fresh plan only (a plain call with
//   dispatch: viber:planner-review  no status.md beside the plan; a landed plan,
//                                   --split and --extra print none of it): a plan
//                                   of 12 tasks or fewer
//   review: set                     a plan of more than 12 tasks: the spec and graph
//   dispatch: viber:planner-spec-review     reviewers, then one task reviewer per
//   dispatch: viber:planner-graph-review    slice - ceil(n / 8) runs of consecutive
//   dispatch: viber:planner-task-review | tasks: T1-T7     tasks, sizes differing
//   dispatch: viber:planner-task-review | tasks: T8-T13    by at most one, the
//                                   larger first, cut as plan-gate.sh cuts them
//                                   (13 tasks -> T1-T7, T8-T13)
//   threshold: 31 tasks, past 30    only past 30 tasks and, with --accepted <n>, past
//                                   <n> tasks, after the dispatch lines
//
// --extra <task-id> prints, instead of the index, the scope a reviewer checks
// beyond the task's own Files, read from the coder extras file
// <run-dir>/work/<task-id>-extra.md (one path per line; the reviewer file
// <task-id>-extra-review.md is never read):
//   extra: lib/x.ts,src/a.ts        the file paths in file order, minus a blank
//                                   line, a repeat, one under .temp/, one the
//                                   task's own Files lists and one a task not yet
//                                   done lists; a carriage return and a leading
//                                   "./" are stripped first, a backslash of a
//                                   relative path is read as "/", an absolute path
//                                   inside the repository is folded to its
//                                   repo-relative form (one outside stays as
//                                   written)
//   recheck: T1 | node --test tests/a.test.ts
//                                   one per done task whose Files lists a path of
//                                   the extra line, in task order, its Verification
//                                   command as on "verify:"
// Nothing at all when no path remains or the file is missing, exit 0. The plan is
// validated as under --split. An id the plan does not hold, or --extra with
// --split, exits 2.
//
// --dispatch <task-id> coder|reviewer prints, instead of the index, the labelled
// lines of that task's dispatch, a line omitted when its value is empty. <dir> is
// the plan's directory, <plugin root> the path this entry was started by with its
// trailing "/scripts/<name>.ts" cut off (absolute, backslashes read as "/", a link
// never followed; `C:/...` whichever spelling invoked the wrapper).
// The plan is validated as under --split.
//   coder:    task: <dir>/tasks/<id>.md
//             notes: <dir>/work/<id>-coder.md
//             out: .temp/viber/<id>/
//             refs: <plugin root>/references
//             extras: <dir>/work/<id>-extra.md
//             decide-file: <dir>/work/<id>-options.md
//             baseline: <dir>/work/tests-baseline.md   only when config.sh prints
//                                   build.baseline-tests fast or full
//             deferred: <path>, <path>     the "deferred:" entries of status.md
//                                   naming the id
//             prior: <dir>/work/<dep-id>-coder.md, ...   the task's own deps
//             decision: <task-id>: <text>  one per status.md decision line of the
//                                   task or of one it depends on, directly or
//                                   through another, in file order
//             run-lessons: <Name> x<n>, ...   the second line of
//                                   <repository root>/.temp/viber/lessons, a
//                                   "lessons: " prefix dropped, when not empty
//   reviewer: task:, notes:, out:, refs:, baseline:, deferred:, decision: as above, then
//             extras: <dir>/work/<id>-extra-review.md
//             scope: "<plugin root>/scripts/plan-index.sh" "<plan>" --extra "<id>"
// An id the plan does not hold, a form other than coder or reviewer, or --dispatch
// with --split or --extra, exits 2.
//
// --slice <id>[,<id>]... prints, instead of the index, what a final review of those
// tasks reads, over the commits since the oldest commit that added the plan file:
//   commit: T3 | 1a2b3c4 | T3(2) - Add the retry loop
//                                   one per commit whose subject is "<id> - <title>"
//                                   or "<id>(<n>) - <title>" of a slice task (the
//                                   title as the plan holds it), oldest first, the
//                                   short sha as git rev-parse --short prints it
//   file: src/a.ts                  one per path those commits changed or removed,
//                                   in byte order, each once, minus every path a
//                                   commit of a task outside the slice also changed
//                                   when that task is numbered below the slice
//                                   task of the highest number
// Nothing at all, exit 0, when no commit matches or no commit added the plan. The
// plan is validated as under --split and no file is written. An id the plan does
// not hold, or --slice beside --split, --extra or --dispatch, exits 2.
//
// --final-review prints, instead of the index, the dispatches of the final review:
//   NEXT: skip                      status.md closes final-review, or no task is done
// or one block per slice, the tasks cut into ceil(n / 8) runs of consecutive tasks in
// index order, skipped ones included, sizes differing by at most one, the larger
// first (as the planner review slices are cut):
//   NEXT: final-review | slice: <k> | model: <sonnet clamped into tiers.min..tiers.max>
//   run: <dir>
//   tasks: <id>, <id>, ...
//   report: <dir>/work/final-review-<k>.md
//   refs: <plugin root>/references
//   memory: <the build.memory value config.sh prints>
//   scope: "<plugin root>/scripts/plan-index.sh" "<plan>" --slice "<id>,<id>,..."
// <plugin root> is cut as under --dispatch. The plan is validated as under --split and
// no file is written. --final-review beside --split, --extra, --dispatch or --slice
// exits 2.
//
// --input <summary-file> (validate mode only, never beside --split, --extra, --dispatch,
// --slice or --final-review: exit 2, "error: --input cannot be combined with ...") reads
// the file as text and adds three checks to the validation, each a "FIX:" line (exit 4,
// every defect of the run printed together); a plan validated without it runs none of
// them. The lines it reads open at line start with "Attachment: <path>", "Root cause:"
// or "Repro: <path>":
//   FIX: input: Attachment <path> has no entry in the attachments map - add one (Attachments)
//                                   an Attachment path no entry value of the frontmatter
//                                   "attachments:" map holds, one line per path
//   FIX: input gives a root cause but the plan has no "## Root cause" section - add it (Root cause)
//   FIX: the plan carries a "## Root cause" section its input gives no cause for - drop it (Root cause)
//                                   the input gives a cause when it carries a "Root cause:"
//                                   line or an Attachment path under .temp/viber/code-auditor/;
//                                   the heading counts outside a fenced block
//   FIX: input: Repro <path> is on no task Repro: line - put it on the fixing task (Reproduced)
//                                   a Repro path no task "Repro:" line holds (a leading "./"
//                                   dropped), one line per path
// A missing summary file exits 2 with "error: input file not found: <path>".
//
// --accepted <n> (digits only; validate mode, beside --input too, never beside --split,
// --extra, --dispatch, --slice or --final-review: exit 2, "error: --accepted cannot be
// combined with ...") is the task count the user already kept past the threshold: the
// "threshold:" line is then printed only when the count is also above <n>. A missing or
// non-digit value exits 2 with the usage line; without it the line is printed past 30 alone.
//
// --detailed (validate mode, beside --input and --accepted too, never beside --split,
// --extra, --dispatch, --slice or --final-review: exit 2, "error: --detailed cannot be
// combined with ...") says the detail stage of the plan is over: a task whose
// "Verification:" or "DoD:" value still opens with the word PENDING, the line of a skeleton
// task plan-build.sh merge never filled, is a defect (exit 4), one line per field:
//   FIX: task <id>: <Verification|DoD> is still PENDING - dispatch the plan-detailer block of its slice and merge its file (Detailed)
// Without it such a task passes: a skeleton plan is validated before its tasks are written.
// review-round.sh passes it on every start outside the skeleton stage.
//
// --split removes, once the plan is validated and decomposed and before the index
// is printed, the coder and reviewer extras files of every task not done; a done
// task keeps its files.
//
// "feeds" is the comma-separated "<id>:<count>" entries of the contract blocks
// whose "File:" path is in this task's "Files" and which at least one OTHER
// task names in "Uses", <count> being how many do - "-" when none. It is what
// tells the orchestrator, without opening a file, how load-bearing a task's
// work is for others: a block on "File: none" feeds nothing, since no task
// holds that path.
//
// "verify:" carries the orchestrator the one thing it needs to decide a
// reviewer waiver without ever opening a task file: one line per task, in task
// order, right after the task rows and before any "dirty:" line. Its value is
// the task's own "Verification" text up to its first " -> ", trimmed - the
// whole value when it carries no arrow - with one pair of wrapping backticks
// removed (the first and last character of the value, the rest trimmed again;
// inner backticks stay, and a value not opening AND closing with a backtick is
// printed unchanged). The "recheck:" value is the same. The command is always the last field,
// so a "|" inside it (a shell pipeline) is part of the command, not a column
// break.
//
// "profile:" (--split only) is the model tier of each open task and of its review, so
// the orchestrator decides only what needs the project. Three shapes:
//   profile: <id> | tier: <tier> | review: <tier> | subject: <subject>
//   profile: <id> | tier: <tier> | review: waive? <tier> | subject: <subject>
//   profile: <id> | haiku? | mechanical: <tier> review <tier> | else: <tier> review <tier> | subject: <subject>
//   (the last one's "else:" part reads "<tier> waive? <tier>" when the review may be waived)
// Rules, before the clamp: "hard" yes -> opus; "TDD: none" over at most 2 Files and not
// hard -> the "haiku?" line (mechanical haiku, else sonnet); any other task -> sonnet.
// The review tier is the task tier raised to sonnet from haiku and to opus on a task
// whose feeds entry counts 3 or more. "waive?" marks a sonnet task with TDD none and no
// feeds entry of 3 or more: its review is waived when its "verify:" line runs the
// project build or its tests, else it runs at the tier printed after "waive?". Every
// printed tier is clamped into config.sh tiers.min..tiers.max (haiku < sonnet < opus <
// fable) after that is decided; a "haiku?" line keeps both alternatives whatever the
// clamp makes of them. The subject is "<id> - <title>", "<id> [TDD] - <title>" on a
// "TDD: required" task.
//
// The run's state is read from status.md beside the plan - "done", "skipped",
// "unreviewed", "deferred" and "closed", one key per line,
// "none" for an empty one. The plan
// itself is never written to after it lands, so nothing here parses it for
// progress; a plan with no status.md beside it (one being validated before it
// ever landed, a run whose first commit has not happened) simply has nothing
// done. The state lines and the "dirty" lines are what a session that did
// not start the build needs. A "deferred" entry is "<task-id>:<path>" - code an
// earlier task left without its own test because the criterion that proves it
// belongs to that task, which is how a resumed session still knows who owes the
// proof. Any other key of status.md is ignored. A "decision:" line is the build's ruling on a stalled task
// (commit-task.sh --decide), "decision: <task-id>: <text>", any number of them;
// a status.md with none prints exactly what it printed before the line existed.
// "state" is "done", "skipped" or "todo"; a "dirty"
// line means that task's own files carry uncommitted work, so an earlier session
// was cut off mid-task and a fresh coder would land on top of it. An "orphan"
// line lists changed paths no coder would otherwise reach (a "done" task's own
// files included, since nothing dispatches onto it again), its run directory
// exclusion relying on "$dir" being the repo-relative plan path plan-path.sh
// prints, as commit-task.sh's run_dir() does. Everything else
// a resume needs is already derivable, so nothing here is stored twice.
//
// "Repro:" is the second optional field: the one path of a fixing task that the
// fixer skill left in the tree as a RED reproduction test, deliberately
// uncommitted. It is always uncommitted when the build starts, so counted as
// dirty it would read as an interrupted session and stop the build on a
// question with only one right answer. It never enters a "dirty" line; every
// other path of that task still does.
//
// "excl" is "yes" for a task the plan marked "Exclusive: true" - work that cannot
// share the working tree or a machine-wide resource (a fixed port, one database),
// so the orchestrator dispatches it alone. The plan declares the constraint and
// this script only carries it: nothing here decides whether two tasks may run
// together.
//
// "hard" is "yes" for a task carrying a "Hard: <reason>" line - the third
// optional field, the plan's mark for a task whose design it cannot settle in
// advance, which the orchestrator alone turns into a model tier. A "Hard:" line
// with no reason is refused; the reason itself stays in the task file.
//
// "Files:" is a comma-separated list of exact repo-relative file paths - no
// patterns, no directories, no annotations - so the same list drives the commit
// and the collision check below. A pattern is decided by SHAPE, not by the mere
// presence of a bracket: "*" and "?" are always one, and a "[" is one unless it
// wraps a WHOLE path segment as "[name]", "[...name]" or "[[...name]]" - the
// three Next.js App Router dynamic segments, where the brackets are part of the
// file's own name. A bracket inside a segment ("src/a[bc].ts") stays a glob
// character class and is still refused.
//
// --split writes, into the plan's OWN directory (docs/_specs/<stamp>_<slug>/):
//   spec.md        - everything above "## Tasks": goal, acceptance criteria, scope.
//                    WHAT and WHY, read by the user and by the closing writers.
//                    The frontmatter and every HTML comment are cut out of it:
//                    both belong to the run, not to the specification the
//                    archive keeps. A fenced block (``` or ~~~ up to a
//                    bare closing fence of the same character at least as long
//                    as the opening one) is content and
//                    stays whole, comments and blank lines included, and a
//                    heading line inside one is body text: it neither cuts
//                    the plan, opens a section nor splits a contract block.
//                    The "## Phases" section is cut out of it too, into phases.md.
//                    It ends with "## Attachments" when <run>/attachments/ (the
//                    files plan-path.sh --land copied there) holds an entry:
//                    one line per file or directory, its repo-relative path
//                    ("$dir" is the repo-relative run directory, as for the
//                    orphan line), a directory ending in "/", sorted by name;
//                    no directory or no entry, no section.
//   phases.md    - only when the plan carries a "## Phases" section: that
//                    section, heading included, up to the next "## " heading,
//                    its HTML comments dropped. The phases of a split change and
//                    the decisions settled for the later ones, which a later
//                    phase's interview resumes from; committed with the rest.
//   tasks/<id>.md  - the whole job of one coder: its task block, then the
//                    plan's "## Goal", the text of the criteria its "Covers:" line
//                    names, the "## Contracts" blocks its "Uses:" line names, the
//                    plan's "### Must not change" when the big shape has one,
//                    the plan's "### Out of scope". It carries no attachment or
//                    prototype section: a task that needs an attached file names
//                    it itself. The block is
//                    verbatim but for its "- DoD:" line, cut on ";" outside
//                    backtick spans (the clause count limit cuts the same way) into one
//                    "- DoD.<k>: <clause>" line per clause (no ";" -> "DoD.1",
//                    an empty trailing clause dropped): a coder answers for each
//                    clause and a reviewer gates each one, which a single
//                    sentence carrying seven of them does not allow. The plan
//                    keeps the one line it was written as - the decomposition is
//                    the only place the DoD is cut.
//   status.md      - the run's state, created empty and only when it is not there
//                    yet: an existing one carries progress and is never rewritten
//                    here. From then on commit-task.sh is the only writer, which
//                    is what keeps the plan and the specification frozen.
// A coder handed tasks/T3.md CANNOT see the other tasks, so it cannot drift into
// their files - that isolation is the point, not the token saving. It is handed
// nothing else either: the file is self-contained, which is why the "## Contracts"
// appendix sits BELOW the tasks and reaches a coder only through "Uses:" - a
// shared contracts section in the specification would put every route, type and
// error code of the whole plan into the context of a task that touches one.
//
// Each contract block opens with "File:" - the paths its shape is declared in, or
// "none" - which is what makes the appendix checkable against the task map: the
// task holding that path is the block's writer, so a path no task creates and a
// path whose holders never name the block are both plan defects caught here
// rather than by a coder editing a file outside its own map. An appendix where no
// block carries the line at all predates it and is left alone: a plan is frozen
// once it lands, so a run resumed after an upgrade must still validate.
// tasks/ is rebuilt from scratch on every call, so a re-run after a plan edit
// carries no stale task file, and the decomposition is committed together with the
// plan and attachments/ when the run holds files there (pathspec-scoped,
// best-effort, through a private index, so whatever else is staged stays staged and
// out of it): it lives under docs/, so leaving it
// uncommitted would have every later commit-task.sh run report it as left behind.
//
// Validation (exit != 0, nothing on stdout, nothing written) - catches plan drift
// before a build starts. Every plan defect is one stderr line opening on "FIX: " (the
// message as listed below, without any "error: " prefix), or on "SPLIT: " for a
// task past its Files or DoD cap; an argument error or a missing plan or input file
// (exit 2) keeps its "error: " line:
//   2 - plan file missing or unusable, an argument that is not --split or
//       --extra <task-id>, --extra beside --split, a --extra id the plan does not
//       hold, a --dispatch with an unknown id or form or beside --split or
//       --extra, a --slice with an unknown id or beside --split, --extra or
//       --dispatch, a --final-review beside any of those four, an --input beside any of
//       those five, an --input file that is missing, or a --split pointed at anything but the run's own <dir>/plan.md
//   3 - no <!-- TASK --> blocks
//   4 - broken task contract (<!-- TASK --> blocks under no "## Tasks" heading,
//       where the cut would leave tasks/ empty while the index still lists
//       them; a <!-- TASK --> block that opens before that heading has ever
//       been seen, which would ride into spec.md instead of its own task
//       file while the index still lists it; duplicate id, an id that is not [A-Za-z0-9_-]+,
//       missing field, illegal dependency, an "Exclusive:" value other than
//       "true", a "Repro:" that is not one path of the same task's "Files:" or
//       sits on a task not marked "TDD: none", a "Covers:" criterion absent from the
//       acceptance criteria, an acceptance criterion no task's "Covers:" names, a
//       "Uses:" contract absent from the appendix, a contract block no task's
//       "Uses:" names, a malformed or duplicate contract heading, a contract
//       block with no "File:" line (even one where no block in the whole
//       appendix carries the line at all - exempted as below), a contract file that no task's "Files:" creates and the tree
//       does not already hold, a contract file whose holders never name the
//       block in "Uses:", an unparseable "Files:" entry, the same file listed
//       by two tasks with no dependency path between them - they would run at
//       the same time -, a task naming a contract block in "Uses:" with no
//       dependency path, direct or transitive, to a lower-numbered task that
//       holds the block's "File:" path and names it in its own "Uses:" (the
//       consumer would run beside its writer; the error names both tasks),
//       a "Depends-on" naming a task marked "Exclusive: true": that task is a
//       leaf of the dependency graph, so nothing may depend on it, or a
//       "Depends-on" entry another entry of the same line already reaches,
//       directly or transitively (the edge orders nothing; the error names the
//       task, the entry and the one reaching it), or a "DoD:" line naming
//       another task of the plan as a whole token outside a backtick span
//       (its own id never matches - prove each clause inside the task itself,
//       naming a file or symbol instead), or a "DoD:" or "Delivers:" line naming
//       a contract block of the appendix as a whole token outside a backtick
//       span while the task "Uses:" does not name it (a token with no block in
//       the appendix names nothing; stderr, one line per block:
//       "FIX: task <id>: <DoD|Delivers> names <block id>, missing from its
//       Uses - add it to Uses"), or a task holding more "Files:"
//       entries or "DoD:" clauses than its TDD value allows - 12 and 6 on
//       "required", 25 and 10 on "none" (it bundles several behaviours -
//       split it), or a read-after: a "Verification:", "Delivers:" or "DoD:" line naming,
//       as a whole path token (a backtick, a quote, a space or a sentence period
//       bounds it, a longer path or a bare file name inside one does not), a
//       file a lower-numbered task lists in its "Files:" while no dependency
//       path, direct or transitive, joins the two (the reader would run beside
//       the writer; the error names the reader, the path and the writer), or a
//       file the tree does not hold that only higher-numbered tasks list, none
//       of them the reader or a lower-numbered task (stderr: "FIX: task <id>
//       reads <path>, which only the later task <other> creates - move the
//       reading after <other> (Read after)", <other> the lowest-numbered lister;
//       the "Delivers:" of a task whose every "Files:" path lies under docs/adr/
//       is no reading), or an
//       integration test: a "Files:" path under a directory segment "integration"
//       or one holding integration[-_.]?tests? (case folded), or whose file name
//       holds ".integration.", while no command of its "Verification:" text before
//       the first " -> " (cut at ";", ",", "&&", "||" and "|", a grep, git grep or
//       rg command never counting) names the path, a directory of it at or below
//       that test directory, or a file inside such a directory (stderr: "FIX:
//       task <id>: Files writes <path> under an integration test directory, which
//       no Verification command names - list or type-check that file or its test
//       project there (Layered)"; a "Verification:" that is the word PENDING alone,
//       a skeleton task plan-build.sh merge fills later, is not checked), or a git grep: a command of its "Verification:"
//       text before the first " -> " (cut at ";", "&&", "||" and "|") that runs
//       git grep with no --untracked and names, as a token, a "Files:" path the
//       tree does not hold (stderr: "FIX: task <id>: Verification runs git grep
//       without --untracked over <path>, which this task creates and git grep
//       never reads - add --untracked or use grep (Provable)"), or a task id that is
//       not T<k>, the <k>th task block in order (Ids), a contract id that is not C<k>,
//       the <k>th block in order (Blocks), or a task title opening with a commit type
//       prefix - feat, fix, docs, style, refactor, perf, test, build, ci, chore or
//       revert, case folded, an optional (scope), an optional "!", then ":" (Title),
//       or a "Verification:" whose command before the first " -> " is wrapped in
//       backticks, runs inline interpreter code (node or ruby with -e, python or
//       python3 with -c, perl with -e, in command position - a quoted argument of
//       another command is none), or runs a script under .temp/ (a command word
//       starting with .temp/ or ./.temp/, or the first non-option argument of bash,
//       sh or an interpreter starting that way - a redirect target or another
//       command argument is none), each with its own error naming the fix
//       (Provable), or a task whose "Files:" lists a file named CLAUDE.md (a path
//       whose last segment is exactly that, the root one included) while
//       build.memory is on - resolved from the
//       caller cwd (never the plan directory, so a plan outside the
//       repository is held to it too) and only on a fresh plan; with the switch
//       off or no .claude/viber.yml the case never fires, and a CLAUDE-notes.md
//       or CLAUDE.run-scripts.md is none (stderr: "FIX: task <id>: Files lists
//       <path> while build.memory is on - drop it, the build close updates every
//       CLAUDE.md (Memory-owned)"), or a frontmatter "attachments:" map (the
//       indented entry lines up to the first line that is not indented, a blank
//       line skipped, a name being what precedes the first ":" of an entry) holding
//       a name that is not one path component matching
//       ^[A-Za-z0-9][A-Za-z0-9_.-]*$ (stderr: "FIX: attachments: name "<name>" is
//       not one path component of letters, digits, _, . and - opening on a letter
//       or digit - rename it (Attachments)") or repeating an earlier one, case
//       folded ("FIX: attachments: name "<name>" repeats an earlier one - rename
//       one of them (Attachments)"), or a "DoD:" line naming attachments/<name>, the
//       first path component after the prefix a sentence period does not close, with
//       no <name> entry in a map the plan carries (a plan with no frontmatter or no
//       "attachments:" key has none to check; "FIX: task <id>: DoD names
//       attachments/<name>, absent from the attachments map - add a <name> entry or
//       drop the reference (Attachments)"), or a template slot left in the plan text:
//       a "<...>" span of the planner templates (spec-full.md, spec-lite.md and
//       tasks.md under ../skills/planner/templates, located from this entry, read
//       at run time outside their HTML comments; no templates directory, no check),
//       found on a plan line outside a fenced block, an HTML comment, a backtick span
//       and the "## Contracts" appendix ("FIX: line <n>: template slot <slot> left
//       unfilled - replace it (Filled)"; one per line and slot), or a "### " heading
//       outside a fenced block under a "## Behaviour" section that is neither
//       "### Edge cases" nor "### S<k> - <title>", <k> being the heading's place among
//       the section's "### " headings but "### Edge cases", counted from 1 (stderr:
//       "FIX: line <n>: scenario heading "<heading>" must be "### S<k> - <title>", the
//       <k>th scenario in order - number it (Scenarios)"; a plan with no "## Behaviour"
//       section has none to check), or a "- modify - <path>" or "- delete - <path>" line
//       under "### File map" (outside a fenced block) naming a path the tree does not hold
//       ("<path>" cut at the first " - ", a comma-separated list checked path by path,
//       a wrapping backtick pair and a leading "./" dropped; an "add" line is none;
//       stderr: "FIX: file map: <modify|delete> <path>, which the tree does not hold -
//       correct the path or list it as add (File map)", one per path).
//       The last twenty cases and the parenthetical one above are exempted under --split
//       and under --extra, and on a plain call whose plan has status.md beside
//       it (a landed run plan): a plan that landed before the rule is frozen,
//       and a run resumed after the upgrade must still validate and decompose.
//       A plain call with no status.md beside the plan (a fresh plan) applies
//       every rule.
//       One run prints every defect the plan carries: the dependency-graph,
//       read-after and contract file checks run whatever an earlier check found,
//       and a task or contract heading that is not "### <id> - <name>" prints
//       its heading line alone, with no follow-on defect of its block.
//
//       An unparseable "Files:" entry is an empty one, one carrying "*" or "?",
//       one whose bracket does not wrap a whole segment in one of the three App
//       Router shapes above, an absolute or "~" path, one ending in "/" (a
//       directory), one carrying whitespace (a path plus an annotation), or one
//       carrying a backtick or a double quote (a quoted path commit-task.sh
//       could not stage).
//
// Contract:
//   argv   : the plan file, optionally --split, --extra <task-id>, --dispatch
//            <task-id> coder|reviewer, --slice <id>[,<id>]... or --final-review,
//            never two of them, or --input <summary-file>, beside none of them;
//            --accepted <n> (digits) beside --input or alone, never beside one of those;
//            --detailed beside --input, --accepted or alone, never beside one of those.
//   cwd    : the repository root - the plan path and every path in the index are
//            relative to it; a plan path given absolute, or with a leading
//            "./", inside it is read as its relative form.
//   env    : none read; git's writes run with GIT_LITERAL_PATHSPECS=1. The config
//            block config.sh prints is resolved in process, from the cwd: tiers.min
//            and tiers.max (profile lines, the --final-review model), build.memory
//            (the Memory-owned check, the --final-review memory line),
//            build.extensions and build.qa (the blocks of --split) and
//            build.baseline-tests (--dispatch).
//   files  : the plan, status.md, rulings.md and work/<id>-extra.md beside it, the
//            --input file, .temp/viber/lessons and the planner templates, read as
//            UTF-8 text: a byte that is no valid UTF-8 reaches spec.md, phases.md or
//            a task file as U+FFFD.
//   exit   : 0 on a valid plan; a git failure during the --split commit never
//            changes that, the decomposed files are already on disk. A file --split
//            cannot write ends it on 1, the index printed, the path on stderr.

import { nodeFs } from "../lib/adapters/fs.ts";
import { gitCommand } from "../lib/adapters/git.ts";
import { gitWriteCommand } from "../lib/adapters/git-write.ts";
import { runPlanIndex } from "../lib/plan-index/run.ts";

const result = runPlanIndex(process.argv.slice(2), process.cwd(), process.argv[1], { fs: nodeFs, git: gitCommand, write: gitWriteCommand });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;

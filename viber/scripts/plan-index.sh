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
#
# stdout (the orchestrator's only view of the plan - the decomposed files are read
# by agents):
#   plan: <path>
#   title: <plan title>
#   progress: <done>/<total>
#   skipped: T4                     only when status.md carries the entry
#   unreviewed: T3                  only when status.md carries the entry
#   deferred: T7:src/a.ts           only when status.md carries the entry
#   owed: T1:src/a.ts               only the "owed" entries of status.md whose
#                                   task is not on its "repaired" line, none left
#                                   no line
#   closed: memory rules            only when status.md carries the entry
#   decision: T2: <text>            one per "decision:" line of status.md, in
#                                   file order, printed as it stands there
#   ruling: T2: retry | why: <why> | cost if wrong: <cost>
#                                   one per "- " entry of rulings.md beside the
#                                   plan (commit-task.sh --rule), leading "- "
#                                   dropped, in file order, after the decision
#                                   lines; none when the file is absent
#   next: part <n> of <N> - <name>
#                                   only when the plan Roadmap has an entry after
#                                   the one marked "(this plan)": that entry, its
#                                   1-based position, the entry count, the name
#                                   without its marker (e.g. next: part 3 of 4 - X)
#   tasks: id | state | tdd | excl | hard | deps | feeds | files | title
#   T1 | done | none     | -   | -   | -  | C1:1 | .claude/settings.json | Tighten the settings schema
#   T2 | todo | required | yes | yes | T1 | -    | src/a.ts,src/b.ts     | Add the retry loop
#   verify: T1 | node --test tests/settings.test.ts
#   verify: T2 | grep -n "retry" src/a.ts
#   dirty: T2 | src/a.ts            only for a task not done whose own files are
#                                   dirty (its "Repro:" path excepted)
#   orphan: lib/x.ts,lib/y.ts       only when non-empty: changed paths claimed
#                                   by no task not "done" (run directory excluded)
#
# --extra <task-id> prints, instead of the index, the scope a reviewer checks
# beyond the task's own Files, read from the coder extras file
# <run-dir>/work/<task-id>-extra.md (one repo-relative path per line; the
# reviewer file <task-id>-extra-review.md is never read):
#   extra: lib/x.ts,src/a.ts        the file paths in file order, minus a blank
#                                   line, a repeat, one under .temp/, one the
#                                   task's own Files lists and one a task not yet
#                                   done lists; a carriage return and a leading
#                                   "./" are stripped first
#   recheck: T1 | node --test tests/a.test.ts
#                                   one per done task whose Files lists a path of
#                                   the extra line, in task order, its Verification
#                                   command as on "verify:"
# Nothing at all when no path remains or the file is missing, exit 0. The plan is
# validated as under --split. An id the plan does not hold, or --extra with
# --split, exits 2.
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
# whole value when it carries no arrow. The command is always the last field,
# so a "|" inside it (a shell pipeline) is part of the command, not a column
# break.
#
# The run's state is read from status.md beside the plan - "done", "skipped",
# "unreviewed", "deferred", "owed", "repaired" and "closed", one key per line,
# "none" for an empty one. The plan
# itself is never written to after it lands, so nothing here parses it for
# progress; a plan with no status.md beside it (one being validated before it
# ever landed, a run whose first commit has not happened) simply has nothing
# done. The state lines and the "dirty" lines are what a session that did
# not start the build needs. A "deferred" entry is "<task-id>:<path>" - code an
# earlier task left without its own test because the criterion that proves it
# belongs to that task, which is how a resumed session still knows who owes the
# proof. An "owed" entry is "<task-id>:<path>" too - code that task left behind
# with no task to prove it; a task on the "repaired" line has had it dealt with,
# so its entries are not printed. A "decision:" line is the build's ruling on a stalled task
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
#                    archive keeps. A fenced block (``` or ~~~ up to the
#                    closing fence of the same character) is content and
#                    stays whole, comments and blank lines included, and a
#                    heading line inside one is body text: it neither cuts
#                    the plan, opens a section nor splits a contract block.
#                    The "## Roadmap" section is cut out of it too, into roadmap.md.
#                    It ends with "## Attachments" when <run>/attachments/ (the
#                    files plan-path.sh --land copied there) holds an entry:
#                    one line per file or directory, its repo-relative path
#                    ("$dir" is the repo-relative run directory, as for the
#                    orphan line), a directory ending in "/", sorted by name;
#                    no directory or no entry, no section.
#   roadmap.md    - only when the plan carries a "## Roadmap" section: that
#                    section, heading included, up to the next "## " heading,
#                    its HTML comments dropped. The parts of a split change and
#                    the decisions settled for the later ones, which a later
#                    part's interview resumes from; committed with the rest.
#   tasks/<id>.md  - the whole job of one coder: its task block, then the
#                    plan's "## Goal", the text of the criteria its "Covers:" line
#                    names, the "## Contracts" blocks its "Uses:" line names, the
#                    plan's "### Must not change" when the big shape has one,
#                    the plan's "### Out of scope". It carries no attachment or
#                    prototype section: a task that needs an attached file names
#                    it itself. The block is
#                    verbatim but for its "- DoD:" line, cut on ";" into one
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
# before a build starts:
#   2 - plan file missing or unusable, an argument that is not --split or
#       --extra <task-id>, --extra beside --split, a --extra id the plan does not
#       hold, or a --split pointed at anything but the run's own <dir>/plan.md
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
#       appendix carries the line at all - exempted under --split alone,
#       below), a contract file that no task's "Files:" creates and the tree
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
#       naming a file or symbol instead), or a task holding more "Files:"
#       entries or "DoD:" clauses than its TDD value allows - 12 and 6 on
#       "required", 25 and 10 on "none" (it bundles several behaviours -
#       split it). The last five cases and the
#       parenthetical one above are exempted under --split
#       alone: a plan that landed before the rule is frozen, and a run resumed
#       after the upgrade must still validate and decompose.
#
#       An unparseable "Files:" entry is an empty one, one carrying "*" or "?",
#       one whose bracket does not wrap a whole segment in one of the three App
#       Router shapes above, an absolute or "~" path, one ending in "/" (a
#       directory), one carrying whitespace (a path plus an annotation), or one
#       carrying a backtick or a double quote (a quoted path commit-task.sh
#       could not stage).
#
# Contract:
#   argv   : the plan file, optionally --split or --extra <task-id>, never both.
#   cwd    : the repository root - the plan path and every path in the index are
#            relative to it; a plan path given absolute, or with a leading
#            "./", inside it is read as its relative form.
#   env    : none.
#   exit   : 0 on a valid plan; a git failure during the --split commit never
#            changes that, the decomposed files are already on disk.
#
set -euo pipefail

plan="${1:-}"
mode=""
extra_id=""
has_extra=0
[[ $# -eq 0 ]] || shift
usage="error: usage: plan-index.sh <plan-file> [--split | --extra <task-id>]"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --split) mode="--split" ;;
    --extra)
      if [[ $# -lt 2 || -z "$2" ]]; then echo "$usage" >&2; exit 2; fi
      has_extra=1
      extra_id="$2"
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

if [[ ! -f "$plan" ]]; then
  echo "error: plan file not found: $plan" >&2
  exit 2
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
# function is in archive-run.sh and commit-task.sh.
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
st_owed=""
st_repaired=""
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
      owed:*)       st_owed="${line#owed:}" ;;
      repaired:*)   st_repaired="${line#repaired:}" ;;
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

# The path travels through ENVIRON, not -v: awk -v expands escape sequences and
# would mangle a Windows path containing backslashes. The output is held until
# the awk pass has exited 0, so a plan refused for any reason prints nothing and
# --split below touches nothing.
index_out="$(plan="$plan" changed="$changed" mode="$awk_mode" rundir="$dir" \
extra="$extra_id" workdir="$dir/work" \
st_done="$st_done" st_skipped="$st_skipped" st_unreviewed="$st_unreviewed" \
st_deferred="$st_deferred" st_owed="$st_owed" st_repaired="$st_repaired" st_closed="$st_closed" st_decisions="$st_decisions" st_rulings="$st_rulings" \
awk '
function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }
function val(s)  { sub(/^[^:]*:/, "", s); return trim(s) }
function fail(msg) { printf "error: %s\n", msg > "/dev/stderr"; err = 1 }

# every backtick-quoted span removed: a done clause may quote a task id as
# literal test data (a fixture plan built by the tests of this repository),
# and that mention proves nothing.
function stripticks(s,   out) { out = s; gsub(/`[^`]*`/, " ", out); return out }

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

# Fed every line in order: 1 when the line sits inside a ``` or ~~~ fence (the
# fence lines included), so a heading-looking line there is body text. A comment
# opened outside a fence runs to its closing arrow and opens no fence; inside a
# fence a comment opener is text. fch and fcom carry the state between lines.
function fstep(raw,   t) {
  t = trim(raw)
  if (fch == "") {
    if (fcom) { if (t ~ /-->/) fcom = 0; return 0 }
    if (t ~ /^<!--/) { if (t !~ /-->/) fcom = 1; return 0 }
    if (t ~ /^(```|~~~)/) { fch = substr(t, 1, 3); return 1 }
    return 0
  }
  if (substr(t, 1, 3) == fch && t ~ /^(```+|~~~+)$/) fch = ""
  return 1
}

# the "verify:" value: a task Verification text cut at its first " -> ",
# trimmed - the whole text when it carries no arrow. The command is always the
# LAST field, so a "|" inside it (a shell pipeline) is part of the command.
function verifycmd(s,   p) {
  p = index(s, " -> ")
  return trim(p == 0 ? s : substr(s, 1, p - 1))
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

# the --extra report for task "self": the paths of its coder extras file, in file
# order, minus a blank line, a path under .temp/, a repeat, one the task itself
# lists and one a task not yet done lists; then one recheck line per done task
# whose Files lists a kept path, in task order. Nothing at all when no path is
# kept or the file is missing. A carriage return and a leading dot-slash are
# stripped from each line first.
function scope(self,   f, line, p, k, out, me, claimed) {
  f = workdir "/" self "-extra.md"
  me = seen[self]
  out = ""
  while ((getline line < f) > 0) {
    sub(/\r$/, "", line)
    p = trim(line)
    sub(/^\.\//, "", p)
    if (p == "" || index(p, ".temp/") == 1 || (p in xseen)) continue
    xseen[p] = 1
    if ((me, p) in fset) continue
    claimed = 0
    for (k = 1; k <= n; k++) if (!(id[k] in isdone) && ((k, p) in fset)) claimed = 1
    if (claimed) continue
    out = (out == "" ? p : out "," p)
    for (k = 1; k <= n; k++) if ((id[k] in isdone) && ((k, p) in fset)) recheck[k] = 1
  }
  close(f)
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
  workdir = ENVIRON["workdir"]
  # what is committed, plus the two decisions and the close that no later
  # session could read off the tree, all of it out of the status file
  done    = listed(ENVIRON["st_done"])
  skipped = listed(ENVIRON["st_skipped"])
  unrev   = listed(ENVIRON["st_unreviewed"])
  defer   = listed(ENVIRON["st_deferred"])
  owed    = listed(ENVIRON["st_owed"])
  repaired = listed(ENVIRON["st_repaired"])
  closed  = listed(ENVIRON["st_closed"])
  decisions = ENVIRON["st_decisions"]
  rulings = ENVIRON["st_rulings"]
  rundir = ENVIRON["rundir"]
  if (rundir == ".") rundir = ""
  nch = split(ENVIRON["changed"], ch, /\n/)
  for (k = 1; k <= nch; k++) if (ch[k] != "") chg[ch[k]] = 1
}

# infc: this line sits inside a code fence, so no heading rule below fires on it
{ infc = fstep($0) }

# plan title: the first H1
!infc && /^#[[:space:]]/ && title == "" { title = trim(substr($0, 2)); next }

# the "## Roadmap" section above "## Tasks": its numbered entries in build order
# and which one carries the "(this plan)" marker. Guidance comments are skipped;
# a heading of any other name closes the section.
!hastasks {
  rt = trim($0)
  if (rcom) { if (rt ~ /-->/) rcom = 0 }
  else if (rt ~ /^<!--/) { if (rt !~ /-->/) rcom = 1 }
  else if (!infc && $0 ~ /^##[[:space:]]/) inroad = ($0 ~ /^##[[:space:]]*Roadmap[[:space:]]*$/)
  else if (inroad && $0 ~ /^[0-9]+\. /) {
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
  cid = ""
}
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
  excl[n] = ""; repro[n] = ""; hard[n] = ""; hashard[n] = 0
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
    if (p == 0) { fail("task heading must be \"### <id> - <title>\", got: " h); next }
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
  if (n == 0) { printf "error: no <!-- TASK --> blocks in %s\n", plan > "/dev/stderr"; exit 3 }
  # The cut is a heading, so a plan carrying blocks under any other one would
  # decompose into an empty tasks/ while this index still lists every task -
  # the orchestrator would then dispatch a coder onto a task file that does not
  # exist. Caught at validation, so the planner sees it before its own gate.
  if (!hastasks) { printf "error: %s carries <!-- TASK --> blocks but no \"## Tasks\" heading - that heading is where the specification is cut off\n", plan > "/dev/stderr"; exit 4 }

  # id -> ordinal; a duplicate id is fatal, and the id also names the task file
  # --split writes, so it stays a bare token
  for (i = 1; i <= n; i++) {
    if (id[i] == "") { fail("task #" i " has no id"); continue }
    if (id[i] !~ /^[A-Za-z0-9_-]+$/) fail("task id \"" id[i] "\": letters, digits, \"-\" and \"_\" only - it names the task file")
    if (id[i] in seen) fail("duplicate task id: " id[i])
    seen[id[i]] = i
  }

  # a block that opened before "## Tasks" was ever seen: --split cuts there, so
  # this one would land in spec.md rather than tasks/<id>.md while the index
  # above still lists it as a task the orchestrator can dispatch
  for (i = 1; i <= n; i++)
    if (early[i]) fail("task " id[i] ": <!-- TASK --> block sits above the \"## Tasks\" heading")

  for (i = 1; i <= n; i++) {
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
    }

    # Size: a task past either cap bundles several behaviours, and a coder
    # holding that many files and clauses at once drifts. Skipped under --split,
    # like the other checks added after plans were frozen.
    if (mode != "--split" && (tdd[i] in maxfiles)) {
      tm = tdd[i]
      if (nf[i] > maxfiles[tm]) fail("task " id[i] ": " nf[i] " Files, past the " maxfiles[tm] " a TDD: " tm " task may hold - split it, one behaviour per task")
      nd = 0
      m = split(dod[i], dc, /;/)
      for (k = 1; k <= m; k++) if (trim(dc[k]) != "") nd++
      if (nd > maxdod[tm]) fail("task " id[i] ": " nd " DoD clauses, past the " maxdod[tm] " a TDD: " tm " task may hold - split it, one behaviour per task")
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
  # share a file; deps point backwards only, so one forward pass resolves ancestry
  if (!err) {
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
    if (!(corder[c] in usedcon)) fail("contract " corder[c] " is used by no task")
    # missing outright, or an appendix where NO block carries the line at all -
    # exempted under --split alone (see below), required everywhere else
    if (!(corder[c] in cfile) && (mode == "--split" ? ncfile > 0 : 1))
      fail("contract " corder[c] ": missing File - name the paths the shape is declared in, or \"none\"")
  }

  # the file of a block decides who writes it, so the two halves of the plan
  # have to meet: a path nothing creates leaves the shape to be invented by
  # whoever needs it first, and a path whose holders never name the block leaves
  # its writer blind to it while a consumer writes it outside its own file map.
  # An appendix where NO block carries "File:" is now required everywhere
  # outside --split, caught above (which already sets err and skips this
  # block); under --split alone it may still predate the field - a plan that
  # landed before this check and is being resumed - so nothing here runs for
  # it either, because a frozen plan cannot grow the line and a build must not
  # stall mid-resume.
  if (!err && ncfile > 0) {
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
          if (!present(p)) fail("contract " cn " declares " p ", which no task creates - put it in the Files of the task that writes the shape")
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

  if (err) exit 4

  # --extra names a task the plan holds, or the call is refused
  if (extra != "" && !(extra in seen)) { printf "error: --extra: no such task: %s\n", extra > "/dev/stderr"; exit 2 }

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
  # an owed entry is "<task-id>:<path>"; the id is what a repaired line names
  split(repaired, rlist, /[[:space:]]+/)
  for (k in rlist) if (rlist[k] != "") isrepaired[rlist[k]] = 1
  openowed = ""
  m = split(owed, olist, /[[:space:]]+/)
  for (k = 1; k <= m; k++) {
    if (olist[k] == "") continue
    oid = substr(olist[k], 1, index(olist[k], ":") - 1)
    if (!(oid in isrepaired)) openowed = (openowed == "" ? olist[k] : openowed " " olist[k])
  }
  if (openowed != "") printf "owed: %s\n", openowed
  if (closed  != "") printf "closed: %s\n", closed
  printf "%s", decisions
  printf "%s", rulings
  if (rthis && rthis < nrent) {
    rnext = rent[rthis + 1]
    sub(/[[:space:]]*\((built|this plan)\)$/, "", rnext)
    printf "next: part %d of %d - %s\n", rthis + 1, nrent, trim(rnext)
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
    orph = (orph == "" ? p : orph "," p)
  }
  if (orph != "") printf "orphan: %s\n", orph
}
' "$plan")"

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

[[ "$mode" == "--split" ]] || exit 0

# --- the decomposition, beside the plan ---
# A second pass over a file the first one just proved well-formed: every id is
# present, unique and a bare token, so nothing here has to guard against drift.
rm -rf -- "$dir/tasks" "$dir/roadmap.md"
mkdir -p -- "$dir/tasks"

dir="$dir" awk '
function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }

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
  m = split(v, cl, /;/)
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

# Fed every line in order: 1 when the line sits inside a ``` or ~~~ fence (the
# fence lines included), so a heading-looking line there is body text. A comment
# opened outside a fence runs to its closing arrow and opens no fence; inside a
# fence a comment opener is text. fch and fcom carry the state between lines.
function fstep(raw,   t) {
  t = trim(raw)
  if (fch == "") {
    if (fcom) { if (t ~ /-->/) fcom = 0; return 0 }
    if (t ~ /^<!--/) { if (t !~ /-->/) fcom = 1; return 0 }
    if (t ~ /^(```|~~~)/) { fch = substr(t, 1, 3); return 1 }
    return 0
  }
  if (substr(t, 1, 3) == fch && t ~ /^(```+|~~~+)$/) fch = ""
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
  # three-line frontmatter; source and into never leave plan.md.
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
  # The "## Roadmap" section, heading included, up to the next "## " heading,
  # goes to roadmap.md instead, under the same comment and blank-line rules: it
  # holds the parts this plan does not build, which are no part of its
  # specification. No section, no file.
  roadmap = dir "/roadmap.md"
  for (i = sfrom; i < cut; i++) {
    t = trim(line[i])
    if (incom) { if (t ~ /-->/) incom = 0; continue }
    if (sfence == "") {
      if (t ~ /^<!--/) { if (t !~ /-->/) incom = 1; continue }
      if (line[i] ~ /^##[[:space:]]/) inroad = (line[i] ~ /^##[[:space:]]*Roadmap[[:space:]]*$/)
      if (t == "") { if (inroad) rblank = 1; else sblank = 1; continue }
      if (t ~ /^(```|~~~)/) sfence = substr(t, 1, 3)
    } else if (substr(t, 1, 3) == sfence && t ~ /^(```+|~~~+)$/) sfence = ""
    if (inroad) {
      if (rblank && rkept) print "" > roadmap
      rblank = 0; rkept = 1
      print line[i] > roadmap
      continue
    }
    if (sblank && skept) print "" > spec
    sblank = 0; skept = 1
    print line[i] > spec
  }
  close(spec)
  if (rkept) close(roadmap)

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
# (plan.md, spec.md, tasks/, status.md, roadmap.md when the plan carries a
# "## Roadmap" section and attachments/ when --land copied files in, which
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
[[ ! -f "$dir/roadmap.md" ]] || split_paths+=("$dir/roadmap.md")
[[ -z "$attach_list" ]] || split_paths+=("$dir/attachments")
if git rev-parse --git-dir >/dev/null 2>&1; then
  git add -A -- "${split_paths[@]}" >/dev/null 2>&1 || true
  if ! git diff --cached --quiet -- "${split_paths[@]}" 2>/dev/null; then
    git commit "${commit_msg[@]}" -- "${split_paths[@]}" >&2 || true
  fi
fi

exit 0

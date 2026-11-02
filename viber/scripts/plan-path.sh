#!/usr/bin/env bash
#
# plan-path.sh - resolves the plan file of a build, and on --land puts the
# approved plan there. One dated directory per run:
# docs/_specs/<yyyy-mm-dd-HH-mm-ss>_<slug>/plan.md, the stamp being the moment
# the plan is landed. The decomposition plan-index.sh --split writes (spec.md
# and tasks/T<n>.md) lands in that same directory, so one run is one directory
# and one key.
#
# `_specs` is the DEFAULT name of that directory, not a fixed one: `runs` inside
# the `directories:` group of .claude/viber.yml renames it, resolved here the
# same way config.sh resolves it and fail-open on anything unusable, so every
# example below reads docs/<runs>/ for a project that set the key.
#
# Usage:
#   plan-path.sh --land <src>              land <src> as this run's plan
#   plan-path.sh                          no argument: the plan most recently
#                                          worked on
#   plan-path.sh --branch <plan>           read-only report on the run branch
#                                          situation for <plan> (C3); nothing
#                                          moves, nothing is written
#   plan-path.sh --start [--fixer] [--pr] [--roadmap]
#                        [--entry <key>] [--settled <key>] [<issue URL>]
#                                          read-only start report (C1) needing no
#                                          plan: the same situation as --branch
#                                          from the issue URL alone, ending in
#                                          /issues/<n>, then the branch decision
#                                          (see stdout below); nothing moves,
#                                          nothing is written
#   plan-path.sh --checkout <branch>       put HEAD on an existing local branch
#                                          (C2); never creates one, never fetches
#
# <src> is the approved plan as plan mode wrote it. Its directory is a user-level
# setting ("plansDirectory"), so the file normally sits OUTSIDE this repository:
# it is copied, never moved, and the source is left untouched. The slug comes
# from the plan's own first H1, falling back to its file name when there is no
# H1 or the H1 normalizes to nothing (a non-Latin script), and is normalized
# here - lowercased, every other run of characters collapsed to "-", 60 chars
# max - so no caller has to form one. The copy is stripped of the template's
# guidance comments on the way in: everything the run itself reads stays
# (<!-- TASK -->, <!-- /TASK -->, and <!-- source: --> for a plan written before
# that path moved into the frontmatter), the rest would only ride through
# spec.md and every task file into the build. A fenced block (``` or ~~~ up to
# a closing fence of the same character at least as long as the opening one) is content, not guidance: every line
# of it, comments and blank lines included, is copied through untouched. The
# frontmatter is not a comment and survives whole but for its "source:" line,
# which the copy rewrites to its own absolute path.
#
# The run branch. Under a branching.mode other than off (config.sh --branching,
# read by the sourced run-branch.sh; outside a git repository it acts as off), a
# FIRST landing - a plan-mode source - validates argv first, then puts HEAD on
# the run branch, and only
# then looks up runs by slug and copies: a run already open on that branch is
# found there rather than minted again beside it. The plan's entry is the
# branching.work entry its frontmatter "work:" key names, or the single entry
# when it names none. The run branch is the source's frontmatter "branch:" key
# (up to its first whitespace; "none" is no branch): kept when HEAD is on it,
# switched to when it exists, else created from the local base of the plan's
# entry. With no branch recorded, "allowed" keeps the current branch;
# "required" keeps a branch that is no entry base and, with HEAD on the base of
# any entry, creates the plan's entry name pattern from that entry's base -
# {type} fix when a task block carries a "Repro:"
# line, else feature; {issue-number} the number of the frontmatter "issue:"
# URL, read as commit-task.sh's issue_ref() reads it; {slug} the run slug - a
# run of - _ . left next to a / or at either end dropped, // and -- collapsed.
# Under required a recorded branch equal to any entry base is refused, the
# plan's own entry or another. A switch
# that moves HEAD to another commit is refused on a dirty tree (untracked files
# count); one keeping the commit carries the uncommitted work along. The
# no-argument form and a source
# that is itself a landed run plan never switch. Nothing is ever fetched.
#
# Contract:
#   argv   : --land and the source plan, or
#            --branch and a plan, or --start with its flags and optionally an issue URL, or
#            --checkout and a branch name, or nothing.
#   file   : On a first landing, and on --branch, <src>'s frontmatter "branch:",
#            "work:" and "issue:" keys and its task blocks' "Repro:" lines, for
#            the run branch. On every form printing "branch:", the resolved
#            plan's "work:" key, for the "target:" line. On every --land, the
#            source's frontmatter "attachments:" map, checked before the run
#            branch step (exit 6, see below): "attachments:" alone on its line,
#            then one "<name>: <source path>" entry per line, indented, the map
#            ending at the first line not indented. A name is one path
#            component (^[A-Za-z0-9][A-Za-z0-9_.-]*$), an extension optional,
#            a blank or whitespace-only line inside the map skipped, in the
#            source and in the landed copy alike, and unique; the path (C:/, C:\ or POSIX form) is non-empty. On
#            every copy (a new run, never an "existing" answer), each source of
#            the copy's map, a file or a directory (copied recursively), is
#            copied to <run>/attachments/<name>. The map keeps its source
#            values. A source missing or a copy that failed is one "warning:"
#            line on stderr, the plan landed and exit and stdout unchanged. A
#            "prototype:" key is not read.
#   git    : HEAD moves only in the branch step of a first landing, or by
#            --checkout, through one checkout; every failure before or inside that step
#            leaves HEAD, the index and the tree as they were. --branch and
#            --start never move HEAD, the index or the tree - they only read.
#   gh     : --branch and --start alone, through issue-facts.sh, for the issue
#            type (see their stdout below); never fetches, pushes or writes.
#   cwd    : the repository root - every path printed is relative to it, and the
#            caller splits and stages those paths from there. The config file is
#            read from there too, as .claude/viber.yml.
#   env    : none.
#   stdout :
#     path: docs/_specs/2026-09-19-17-30-00_add-login/plan.md
#     key: 2026-09-19-17-30-00_add-login
#     state: new | existing
#     branch: feature/add-login (created | switched | kept)
#     target: main
#     open: docs/_specs/2026-09-18-09-12-44_add-search/plan.md | 2/6
#   The "branch:" line only when branching.mode is not off, "branch: detached
#   (kept)" on a detached HEAD; every other form reports the current branch kept.
#   "target:" follows "branch:" wherever it is printed, naming the pull request
#   target of the resolved plan's work entry; absent when that entry does not
#   resolve.
#   stdout, --branch <plan>, mode allowed or required inside a git repository,
#   read from config.sh --branching:
#     mode: allowed | required
#     issue-type: <type> | none
#     suggested: <entry key> | none
#     entry: <key> | base: <branch> | target: <branch> | new: <name>|- | new-exists: yes|no | behind: <n>|unknown
#     current: <branch> | detached
#     current-is-base: yes | no
#     dirty: yes | no
#     error: <reason>
#   "current-is-base:" is yes only when the current branch is the base of some
#   entry, never on a detached HEAD. One "entry:" line per valid branching.work entry, in file order; "new:"
#   its name pattern with {issue-number} (the plan's issue number), {slug} and
#   {type} filled in, "-" (and "new-exists: no") when it needs {issue-number}
#   and the plan has no issue; "behind:" counts the entry base against its
#   upstream. "issue-type:" is the plan issue's GitHub type, read through
#   issue-facts.sh only when branching.issue-type-mappings is not empty and
#   the plan has an "issue:"; none otherwise or when the type is empty.
#   "suggested:" is the entry the type maps to, else the one entry whose name
#   the plan can fill, else none. "error:" lines, zero or more: every
#   config.sh --branching error, then, with mappings, "issue <n> has no issue
#   type" or "issue type <type> is not in branching.issue-type-mappings".
#   stdout, --start [<issue URL>], mode allowed or required inside a git
#   repository, read from config.sh --branching:
#     mode: allowed | required
#     issue-type: <type> | none
#     suggested: <entry key> | none
#     entry: <key> | base: <branch> | target: <branch> | name: <pattern> | usable: yes|no | base-exists: yes|no | at-base: yes|no | behind: <n>|unknown
#     current: <branch> | detached
#     current-is-base: yes | no
#     dirty: yes | no
#     error: <reason>
#   The lines --branch prints, without a plan: "name:" is the entry name
#   pattern, {issue-number} replaced by the URL's issue number when one was
#   given, {type} and {slug} as written; "usable:" is no when the entry
#   name needs {issue-number} and no URL was given; "base-exists:" is whether
#   the local base branch exists; "at-base:" is yes only when HEAD's commit is
#   that base branch's commit, whatever HEAD's own branch name; the issue is
#   the URL's, its type read like --branch does. "suggested:" and the
#   "error:" lines follow --branch's rules.
#   The decision, mode allowed or required, after those lines (flags: --fixer
#   for a bug fix, --pr a pull request's own
#   branch, --roadmap the next part of a roadmap, --entry the entry to base-check,
#   --settled <entry key>|no-branch|current|pr|nothing the re-run after an issue
#   save, "nothing" being no settlement reached before it):
#     next: settled | kept | ask-entry | ask-base | errors | none | abort
#     settled: <entry key> | no-branch | current | pr   (next: settled or kept;
#                                       next: errors when --settled names one)
#     option: <answer> | <branch or -> | <effect on the run branch>   (ask-entry,
#                                       ask-base; one per answer)
#     checking: <entry key>             (ask-base: the entry whose base is checked)
#     note: <one sentence>              (zero or more)
#   Answers on ask-entry: <entry key> | no-branch | abort; on ask-base: switch |
#   stay | current | abort. The first rule that applies decides:
#     1. any error: line -> next: errors; --settled nothing asks the entry
#        question instead (rule 5 options, suggested: ignored).
#     2. --settled (checked before --pr): pr, or no-branch with --pr
#        -> kept; nothing -> rule 5; a suggested: other than none and the settled
#        key -> rule 6 for it; otherwise kept.
#     3. --pr: allowed -> settled no-branch; required off an entry base and off a
#        detached HEAD -> settled pr; otherwise go on.
#     4. --entry <key> -> rule 6 for that entry.
#     5. suggested: other than none -> rule 6; otherwise ask-entry with every
#        usable: yes entry plus no-branch (allowed) or abort (required); none
#        usable -> next: none and a note.
#     6. base check of one entry: at-base: yes -> settled; --roadmap off an entry
#        base and off a detached HEAD -> settled current; otherwise ask-base with
#        switch (left out on base-exists: no), stay (left out with --fixer),
#        current (left out under required on an entry base or a detached HEAD)
#        and abort, notes for behind: above 0, dirty: yes and a missing base;
#        --fixer under required with abort alone left -> next: abort and a note.
#   stdout, --branch <plan> or --start, mode off or outside a git repository:
#     mode: off
#   stdout, --checkout <branch>, whatever the branching mode (never read):
#     branch: <branch> (switched | kept)
#   "kept" is HEAD already on <branch>. A switch to another commit is refused
#   on a dirty tree (untracked files count); one keeping the commit carries
#   the uncommitted work along. Exit 5 with the reason on stderr and HEAD,
#   index and tree unchanged: an invalid name (@{-1} included), no local
#   branch of that name (nothing is created or fetched), a dirty tree and a
#   branch at another commit, or no git repository.
#   exit != 0:
#     2 - unusable argv: an unknown first argument, --checkout without exactly
#         one branch name, --land without a source or with anything after
#         it, a source that is not a file, a title and file name that both
#         normalize to nothing, or --branch on a plan that is not a
#         file, or --start on an argument that is not an issue URL ending in
#         /issues/<n>, on an unknown flag, or on --entry or --settled
#         with no value
#     3 - no argument and docs/_specs/ holds no plan
#     4 - the copy failed; nothing was landed
#     5 - the run branch could not be set: a switch to another commit on a
#         dirty tree, a base missing locally, an invalid branch name, any entry
#         base as target under required ("branching is required and the run
#         branch is a work entry base: <branch>"), a detached HEAD under required with no
#         branch recorded, or a branch to create while the plan's entry does
#         not resolve ("the plan records no branching.work entry and several
#         exist", "no valid branching.work entry", a "work:" key naming no
#         entry) or its pattern needs the issue the plan lacks ("work entry
#         <key> needs an issue for {issue-number}"), or a branch to create
#         while config.sh --branching reports an error (the first one is the
#         reason); stderr names the reason; nothing landed, HEAD, index and
#         tree unchanged. A recorded branch that exists is kept or switched to
#         whatever those errors are.
#     6 - the source's attachments: map is unusable: "error: unusable
#         attachments: <reason>" on stderr, <reason> one of "duplicate name
#         <name>" (a name equal to an earlier one, case ignored, the later
#         spelling shown), "invalid name <name>", "entry without a path: <name>" or
#         "attachments: carries a value"; stdout empty, nothing copied, no run
#         directory created, HEAD, index and tree unchanged. Checked on every
#         --land, before the run branch step.
#
# One "open:" line per OTHER run still holding a task that is neither committed
# nor skipped - the resolved run is never among them, and a repository with
# nothing else half-built prints none. The counter shown is committed over total,
# so a run closed by dropping its last task reads as finished and disappears.
# A build resumes from the plan it was given; a second run left unfinished is the
# one thing the caller cannot see for itself, and it decides whether landing this
# plan is a switch or a fresh start. Progress is read the same way everywhere: the
# done list out of the run's status.md, the total out of the plan's own TASK
# blocks.
#
# "new"      - the plan was just copied in, so this run starts here.
# "existing" - a run already open for that slug, carrying its own progress in the
#              status.md beside its plan; a run whose every task is committed or
#              skipped is not open, and the plan lands as "new" beside it. An
#              open run is NEVER overwritten: a source edited
#              after the build started does not reach it, because the landed run
#              is the state. A <src> that already IS a landed plan answers the
#              same way, which makes --land idempotent.
#
set -euo pipefail
shopt -s nullglob

# The runs directory, named by `runs` inside the `directories:` group of
# .claude/viber.yml and defaulting to `_specs`. Read exactly as config.sh reads
# it: only inside that group, and one path segment rather than a path, so a
# value carrying a slash, a traversal or an absolute path leaves the default
# standing instead of moving the run directory out of docs/.
runs_dir="_specs"
if [[ -f .claude/viber.yml ]]; then
  configured="$(awk '
/^[^[:space:]#]/ { ingroup = ($0 ~ /^directories[[:space:]]*:/); next }
ingroup && /^[[:space:]]+runs[[:space:]]*:/ {
  sub(/^[^:]*:[[:space:]]*/, "")
  sub(/[[:space:]#].*$/, "")
  print
  exit
}
' .claude/viber.yml)"
  case "$configured" in
    ''|.|..|*[!A-Za-z0-9._-]*) ;;
    *) runs_dir="$configured" ;;
  esac
fi
specs_dir="docs/$runs_dir"

# The run branch step and the branching values it reads (run-branch.sh).
# shellcheck source=run-branch.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/run-branch.sh"
branch_setup

# Modification time of a file, 0 when it is missing or unreadable.
mtime() {
  t="$(stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0)"
  case "$t" in ''|*[!0-9]*) t=0 ;; esac
  printf '%s\n' "$t"
}

# Newest by mtime of the paths on stdin; non-files are skipped, so a non-matching
# glob and a name that does not exist both drop out here. A landed plan is frozen,
# so "most recently worked on" is the later of the plan and the status file beside
# it - the one file every commit of that run rewrites.
newest() {
  best=""
  best_t=-1
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    t="$(mtime "$f")"
    s="$(mtime "${f%/*}/status.md")"
    if [[ "$s" -gt "$t" ]]; then t="$s"; fi
    if [[ "$t" -gt "$best_t" ]]; then
      best_t="$t"
      best="$f"
    fi
  done
  printf '%s\n' "$best"
}

# "<done> <settled> <total>" for one run: the done and skipped lists out of the
# status file beside the plan, the total out of the plan's own TASK blocks. A run
# that never reached its first commit carries no status file and comes back with
# nothing done. "settled" counts the dropped tasks too - a run whose every task
# is either committed or skipped has nothing left to build. Per criterion #5, both
# the total and the settled count are the SET of ids the plan actually declares:
# an id under "done:"/"skipped:" that names no task in the plan, or repeats one
# already counted, settles nothing - a plan drifted from its status file, or a
# typo'd id, must never read as more finished than it is.
progress_of() {
  awk -v st="${1%/*}/status.md" '
/^[[:space:]]*<!--[[:space:]]*TASK[[:space:]]*-->[[:space:]]*$/ { intask = 1; tid = ""; next }
/^[[:space:]]*<!--[[:space:]]*\/TASK[[:space:]]*-->[[:space:]]*$/ { intask = 0; next }
intask && tid == "" && /^###[[:space:]]/ {
  h = $0
  sub(/^###[[:space:]]+/, "", h)
  sub(/\r$/, "", h)
  p = index(h, " - ")
  tid = (p ? substr(h, 1, p - 1) : h)
  gsub(/[[:space:]]+$/, "", tid)
  if (tid != "" && !(tid in known)) { known[tid] = 1; n++ }
}
END {
  while ((getline line < st) > 0) {
    if (line !~ /^done:/ && line !~ /^skipped:/) continue
    isdone = (line ~ /^done:/)
    sub(/^[A-Za-z]+:/, "", line)
    m = split(line, v, /[[:space:]]+/)
    for (k = 1; k <= m; k++) {
      tok = v[k]
      if (tok == "" || tok == "none" || tok == "-") continue
      if (!(tok in known)) continue
      if (tok in settled) continue
      settled[tok] = 1
      s++
      if (isdone) d++
    }
  }
  close(st)
  printf "%d %d %d\n", d + 0, s + 0, n + 0
}
' "$1"
}

# The landed plan, without the guidance the template carries for whoever writes
# it: those comments have done their work by the time the plan is approved, and
# they would otherwise ride into spec.md, into every task file and through the
# whole build. Only the markers the run itself reads survive - <!-- TASK -->,
# <!-- /TASK --> and <!-- source: -->, the last one only for a plan written
# before the source path moved into the frontmatter - and a comment block
# spanning several lines goes whole. Blank runs left behind collapse to one, so
# the result reads like a plan written without them. Nothing that is not a
# comment is touched, which is how the frontmatter comes through whole, and
# nothing inside a fenced block is either: a comment opened outside a fence
# still goes whole, a fence line inside it included.
# In place, on the COPY only.
strip_guidance() {
  tmp="$1.tmp.$$"
  awk '
function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }
function runlen(s, c,  n) { n = 0; while (substr(s, n + 1, 1) == c) n++; return n }
{
  t = trim($0)
  if (inblock) { if (t ~ /-->/) inblock = 0; next }
  if (fence == "") {
    if (t ~ /^<!--/ && t !~ /^<!--[[:space:]]*\/?TASK[[:space:]]*-->$/ && t !~ /^<!--[[:space:]]*source:/) {
      if (t !~ /-->/) inblock = 1
      next
    }
    if (t == "") { blank = 1; next }
    if (t ~ /^(```|~~~)/) { fence = substr(t, 1, 1); flen = runlen(t, fence) }
  } else if (substr(t, 1, 1) == fence && runlen(t, fence) == length(t) && length(t) >= flen) fence = ""
  if (blank && NR > 1 && kept) print ""
  blank = 0; kept = 1
  print
}
' "$1" > "$tmp" && mv -f "$tmp" "$1"
  rm -f "$tmp"
}

# The copy's frontmatter "source:" line, pointed at the copy itself: the
# plan-mode file it named is gone by the next round, and a context cleared on
# approval finds the landed plan through that line alone. Absolute, and in the
# mixed C:/ form where cygpath exists, so a Windows reader opens it as written.
# Only the frontmatter is touched; a plan without one is left as it is.
set_source() {
  abs="$(cd -- "${1%/*}" && pwd -P)/${1##*/}"
  if command -v cygpath >/dev/null 2>&1; then abs="$(cygpath -m "$abs")"; fi
  tmp="$1.tmp.$$"
  abs="$abs" awk '
NR == 1 { infm = ($0 ~ /^---[[:space:]]*\r?$/); print; next }
infm && /^---[[:space:]]*\r?$/ { infm = 0 }
infm && /^source:/ { print "source: " ENVIRON["abs"]; next }
{ print }
' "$1" > "$tmp" && mv -f "$tmp" "$1"
  rm -f "$tmp"
}

# Reads the frontmatter "attachments:" map of $1 into att_names / att_paths
# (att_n entries, in file order). Returns 6, the reason on stderr, when the map
# is unusable; nothing is written. A file without the key yields no entries.
# No apostrophe anywhere in the awk program: it sits inside single quotes.
read_attachments() {
  local line body reason=""
  att_n=0
  att_names=()
  att_paths=()
  while IFS= read -r line; do
    case "$line" in
      "E "*) reason="${line#E }"; break ;;
      "A "*)
        body="${line#A }"
        att_names[att_n]="${body%% *}"
        att_paths[att_n]="${body#* }"
        att_n=$((att_n + 1))
        ;;
    esac
  done < <(awk '
function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
NR == 1 { if ($0 !~ /^---[ \t]*\r?$/) exit; next }
/^---[ \t]*\r?$/ { exit }
{ sub(/\r$/, "") }
inmap && /^[ \t]*$/ { next }
inmap && /^[ \t]/ {
  e = trim($0)
  p = index(e, ":")
  name = e
  path = ""
  if (p) { name = trim(substr(e, 1, p - 1)); path = trim(substr(e, p + 1)) }
  if (name !~ /^[A-Za-z0-9][A-Za-z0-9_.-]*$/) { print "E invalid name " name; exit }
  if (path == "") { print "E entry without a path: " name; exit }
  if (tolower(name) in seen) { print "E duplicate name " name; exit }
  seen[tolower(name)] = 1
  print "A " name " " path
  next
}
inmap { inmap = 0 }
/^attachments:/ {
  v = $0
  sub(/^attachments:/, "", v)
  if (trim(v) != "") { print "E attachments: carries a value"; exit }
  inmap = 1
}
' "$1" 2>/dev/null)
  if [[ -n "$reason" ]]; then
    echo "error: unusable attachments: $reason" >&2
    return 6
  fi
  return 0
}

# The attachments of the copy $1, put beside the landed plan under
# attachments/<name>, a directory copied whole, so the run keeps every file
# its plan is built from once .temp/ is cleared. The map keeps its source values: nothing rewrites them to
# the run path. A C:/ or C:\ value goes through cygpath -u where cygpath
# exists; without it the value is used as written. A copy with no map leaves
# no attachments/ directory. Fail-open: a missing source or a failed copy is
# one warning on stderr, never an exit, since the plan is landed either way.
land_attachments() {
  local dir i src_file
  dir="${1%/*}/attachments"
  if ! read_attachments "$1" 2>/dev/null || [[ "$att_n" -eq 0 ]]; then
    return 0
  fi
  mkdir -p -- "$dir" 2>/dev/null || true
  for ((i = 0; i < att_n; i++)); do
    src_file="${att_paths[i]}"
    if command -v cygpath >/dev/null 2>&1; then
      src_file="$(cygpath -u -- "$src_file" 2>/dev/null || printf '%s\n' "$src_file")"
    fi
    if [[ ! -f "$src_file" && ! -d "$src_file" ]]; then
      echo "warning: attachment not found, not landed: ${att_paths[i]}" >&2
    elif ! cp -R -- "$src_file" "$dir/${att_names[i]}" 2>/dev/null; then
      echo "warning: could not copy attachment ${att_names[i]}" >&2
      rm -rf -- "$dir/${att_names[i]}" 2>/dev/null || true
    fi
  done
  rmdir -- "$dir" 2>/dev/null || true
  return 0
}

# The plan's own title, or its file name when it carries no H1.
title_of() {
  local title base
  title="$(awk '/^#[[:space:]]/ { sub(/^#[[:space:]]+/, ""); sub(/\r$/, ""); print; exit }' "$1")"
  if [[ -z "$title" ]]; then
    base="$(basename -- "$1")"
    title="${base%.md}"
  fi
  printf '%s\n' "$title"
}

# Normalize stdin into a slug: lowercased, every other run of characters
# collapsed to "-", 60 chars max, empty when nothing survives.
slugify() {
  tr '[:upper:]' '[:lower:]' \
    | sed -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-*//' -e 's/-*$//' \
    | cut -c1-60 \
    | sed -e 's/-*$//'
}

# The run slug of that plan: its title normalized, or its file name normalized
# when the title leaves nothing (a title in a non-Latin script), empty when
# neither survives.
slug_of() {
  local slug base
  slug="$(title_of "$1" | slugify)"
  if [[ -z "$slug" ]]; then
    base="$(basename -- "$1")"
    slug="$(printf '%s\n' "${base%.md}" | slugify)"
  fi
  printf '%s\n' "$slug"
}

emit() {
  d="${1%/*}"
  printf 'path: %s\n' "$1"
  printf 'key: %s\n' "${d##*/}"
  printf 'state: %s\n' "$2"
  if [[ -n "$br_line" ]]; then
    printf 'branch: %s\n' "$br_line"
    # the pull request target of the plan's work entry, when one resolves;
    # this overwrites br_entry/br_why with the PRINTED plan's values, not the source's
    branch_entry "$1"
    [[ -z "$br_entry" ]] || printf 'target: %s\n' "$br_target"
  fi
  # every OTHER run still holding unfinished tasks, so the caller can tell a
  # switch from a fresh start without reading a single file itself
  for f in "$specs_dir"/*/plan.md; do
    [[ -f "$f" ]] || continue
    [[ "$f" == "$1" ]] && continue
    read -r pdone psettled ptotal <<<"$(progress_of "$f")"
    if [[ "$psettled" -lt "$ptotal" ]]; then
      printf 'open: %s | %s/%s\n' "$f" "$pdone" "$ptotal"
    fi
  done
  return 0
}

mode="${1:-}"

# --- no argument: whichever plan was touched last ---
if [[ -z "$mode" ]]; then
  found="$(printf '%s\n' "$specs_dir"/*/plan.md | newest)"
  if [[ -z "$found" ]]; then
    echo "error: no plan under $specs_dir - land the approved plan first: plan-path.sh --land <src>" >&2
    exit 3
  fi
  emit "$found" existing
  exit 0
fi

# --- --branch: the read-only C3 report, no argument beyond the plan itself ---
if [[ "$mode" == "--branch" ]]; then
  plan="${2:-}"
  if [[ -z "$plan" || ! -f "$plan" ]]; then
    echo "error: plan file not found: $plan" >&2
    exit 2
  fi
  branch_report "$plan" "$(slug_of "$plan")"
  exit 0
fi

# --- --start: the read-only start report, no plan needed ---
if [[ "$mode" == "--start" ]]; then
  shift
  start_url=""
  st_fixer=0
  st_pr=0
  st_roadmap=0
  st_entry=""
  st_settled=""
  start_usage="error: usage: plan-path.sh --start [--fixer] [--pr] [--roadmap] [--entry <key>] [--settled <key>] [<issue URL ending in /issues/<n>>]"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fixer) st_fixer=1 ;;
      --pr) st_pr=1 ;;
      --roadmap) st_roadmap=1 ;;
      --entry|--settled)
        if [[ $# -lt 2 || -z "$2" || "$2" == --* ]]; then
          echo "$start_usage" >&2
          exit 2
        fi
        case "$1" in
          --entry) st_entry="$2" ;;
          *) st_settled="$2" ;;
        esac
        shift
        ;;
      -*)
        echo "$start_usage" >&2
        exit 2
        ;;
      *)
        if [[ -n "$start_url" || ! "$1" =~ ^https?://[^[:space:]]+/issues/[0-9]+$ ]]; then
          echo "$start_usage" >&2
          exit 2
        fi
        start_url="$1"
        ;;
    esac
    shift
  done
  branch_start "$start_url"
  exit 0
fi

# --- --checkout: HEAD onto an existing local branch, whatever the mode ---
if [[ "$mode" == "--checkout" ]]; then
  if [[ $# -ne 2 || -z "$2" ]]; then
    echo "error: usage: plan-path.sh --checkout <branch>" >&2
    exit 2
  fi
  branch_checkout "$2" || exit $?
  exit 0
fi

if [[ "$mode" != "--land" ]]; then
  echo "error: usage: plan-path.sh [--land <src>] [--branch <plan>] [--start [<issue URL>]] [--checkout <branch>], got: $mode" >&2
  exit 2
fi

src="${2:-}"
if [[ -z "$src" || $# -gt 2 ]]; then
  echo "error: usage: plan-path.sh --land <src>" >&2
  exit 2
fi
if [[ ! -f "$src" ]]; then
  echo "error: plan file not found: $src" >&2
  exit 2
fi

read_attachments "$src" || exit $?

# Already landed? The source's own directory, resolved, against docs/_specs - so
# a relative, an absolute and a native Windows path all answer alike, and
# re-landing a plan that is already in place is a no-op rather than a second run.
src_dir="$(cd -- "$(dirname -- "$src")" 2>/dev/null && pwd -P || true)"
if [[ "$(basename -- "$src")" == "plan.md" && -n "$src_dir" && -d "$specs_dir" ]]; then
  specs_abs="$(cd -- "$specs_dir" 2>/dev/null && pwd -P || true)"
  if [[ -n "$specs_abs" && "${src_dir%/*}" == "$specs_abs" ]]; then
    emit "$specs_dir/${src_dir##*/}/plan.md" existing
    exit 0
  fi
fi

slug="$(slug_of "$src")"
if [[ -z "$slug" ]]; then
  echo "error: slug is empty after normalization: $(title_of "$src")" >&2
  exit 2
fi

# The run branch, set before the lookup below: a run already open for this slug
# may sit on that branch alone, and switching first is what finds it there.
branch_land "$src" "$slug" || exit $?

# --- a run already open for that slug: its progress is the state, leave it ---
# Only a run with a task neither committed nor skipped answers. A finished run
# left in place (cleanup off) is history, so a new plan under the same title
# gets its own directory.
found="$(
  for f in "$specs_dir"/*_"$slug"/plan.md; do
    [[ -f "$f" ]] || continue
    read -r pdone psettled ptotal <<<"$(progress_of "$f")"
    [[ "$psettled" -lt "$ptotal" ]] || continue
    printf '%s\n' "$f"
  done | newest
)"
if [[ -n "$found" ]]; then
  emit "$found" existing
  exit 0
fi

dest="$specs_dir/$(date +%Y-%m-%d-%H-%M-%S)_$slug/plan.md"
if ! mkdir -p -- "${dest%/*}" || ! cp -- "$src" "$dest"; then
  rmdir -- "${dest%/*}" 2>/dev/null || true
  echo "error: could not land the plan at $dest" >&2
  exit 4
fi
strip_guidance "$dest"
set_source "$dest"
land_attachments "$dest"
emit "$dest" new

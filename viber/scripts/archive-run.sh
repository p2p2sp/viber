#!/usr/bin/env bash
#
# archive-run.sh - moves a finished run's lasting work out of the runs
# directory and into the archive, dropping the scaffolding the build needed
# only while it was running, and commits the move.
#
# A run directory is two things at once: the specification and the QA documents,
# which are worth reading months later, and the plan, the state file, the task
# decomposition and the trail - all of which duplicate what git already holds.
# Left whole, the second half buries the first. This script keeps the first and
# removes the second in one commit, so the archive reads like a specification
# rather than like a process log.
#
# It exists as a script rather than as a few lines in an agent for the reason
# every deterministic step here does: the operation is fixed (git, a basename,
# an enumerated list of paths), and a hand-composed `git mv` plus `git rm` is
# exactly the composition that deletes the wrong tree when the run is not shaped
# the way the caller assumed. The two gates below are the whole point - the
# caller is refused rather than corrected.
#
# The directory is MOVED, never copied file by file, and the caller edits
# spec.md BEFORE calling, so both sides of the move land in ONE commit and what
# the build changed about the specification is an ordinary diff in the history.
# That is why there is no changelog here - the history is the changelog. Git's
# rename detection then pairs the two sides whenever the edit left the file
# recognisably itself, which a few markers and a closing section on a real
# specification do; a very short spec rewritten more than half over falls under
# git's own 50% threshold and reads as an add plus a delete until `git log -M30`
# or `--follow` is asked for it. The commit is the same either way.
#
# Contract:
#   argv   : $1 run directory (REQUIRED), repository-relative, exactly as
#            plan-path.sh printed its `path:` line minus `/plan.md`; an
#            absolute path inside the repository is read as its relative form.
#            The safety gate rejects every path outside docs/<runs>/, an
#            absolute one outside the repository and one carrying a `..`
#            segment included: that is not a typo to fix up, it is the signal
#            that the caller is outside this script's contract.
#   cwd    : any directory inside the host repository - the script moves to the
#            repository root itself, because the argument is relative to it.
#            Outside a repository the cwd is the base every path resolves
#            against and is left untouched.
#   env    : none. GIT_LITERAL_PATHSPECS is exported here, never read.
#   file   : <repo root>/.claude/viber.yml (optional) - `runs` and
#            `specifications` inside its `directories:` group, resolved and
#            sanitized exactly as config.sh resolves them, defaulting to
#            `_specs` and `specs`. An unusable value is ignored.
#   stdout : ALWAYS exactly one line, and never anything else - every byte of
#            git noise goes to stderr:
#              ARCHIVED: docs/specs/<key> (<n> files)
#              ARCHIVED: docs/specs/<key> (<n> files - no git repository)
#            <key> is the run directory's own name, kept unchanged, so a second
#            build of the same area lands beside this one and nothing is ever
#            merged or overwritten. <n> counts the files the archive holds after
#            the scaffolding is gone.
#   exit != 0:
#     2 - unusable argv: no argument, more than one, a directory that does not
#         exist, or one the safety gate refuses (outside docs/<runs>/, carrying
#         a `..` segment, or holding no status.md); every trailing slash is
#         stripped first, and an argument whose run key then comes out empty or
#         `.` ("/", "//", ".", "./") is refused as `error: refused <argument as
#         typed> - no run key` with nothing moved
#     3 - the destination already exists; nothing is touched
#     4 - the run is unfinished: a task of plan.md is in neither `done:` nor
#         `skipped:` of status.md; nothing is touched
#     5 - a git step failed. A failing `git mv` is the realistic one and leaves
#         the run exactly where it was; a failure after it leaves the directory
#         moved and the move uncommitted, which `git status` shows.
#
# The scaffolding is an enumerated list - plan.md, status.md, tasks/, work/ -
# so anything else the run left behind travels into the archive on its own,
# without this script having to know what it is.
#
# Once the last run has left, docs/<runs>/ is removed too, before the commit:
# git tracks no directory, so an empty one would only linger in the working
# tree. It goes only when it holds nothing at all - a sibling run or any stray
# file keeps it.
#
set -euo pipefail

# Every pathspec here is one exact path derived from the argument - never a
# pattern. A run key is a stamp and a slug, but the archive lives beside
# whatever else the host keeps under docs/, and git otherwise reads "*", "?"
# and "[...]" in a pathspec as wildmatch.
export GIT_LITERAL_PATHSPECS=1

usage() {
  echo "error: usage: archive-run.sh <run-dir>" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
raw="${1:-}"
[[ -n "$raw" ]] || usage

# The argument is repository-relative, so resolve it against the repository
# root, never against the caller's cwd: this script is called by an agent,
# whose cwd is less certain than a skill's. Outside a repository the cwd stays.
in_git=0
if git rev-parse --git-dir >/dev/null 2>&1; then
  in_git=1
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$repo_root" && -d "$repo_root" ]]; then
    CDPATH= cd -- "$repo_root"
  fi
fi

# Normalization, before the gate and before anything is printed: a native
# Windows path arrives backslashed, and a trailing "/" or a leading "./" is
# how a path gets typed rather than how it differs.
dir="${raw//\\//}"
while [[ "$dir" == */ ]]; do dir="${dir%/}"; done
[[ "$dir" == ./* ]] && dir="${dir#./}"

# A path that names no run key - nothing left of it, or the working directory
# itself - is refused as typed, before anything is resolved or moved.
if [[ -z "$dir" || "${dir##*/}" == "." ]]; then
  echo "error: refused $raw - no run key" >&2
  exit 2
fi

# An absolute path inside the cwd, rewritten relative to it; any other path is
# printed unchanged. Both sides are resolved physically, so a symlinked spelling
# (macOS /var against /private/var) or a Git Bash drive form (C:/ against /c/)
# still matches; a path whose parent does not exist stays as it is. The same
# function is in plan-index.sh and commit-task.sh.
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

# --- the two directory keys ---
# Read here rather than taken from the caller: the caller that knows the run
# directory is an agent, and a third reader of the same group is ~10 lines. Only
# inside `directories:`, exactly as config.sh reads it.
read_dir_key() {
  local key="$1" fallback="$2" value=""
  if [[ -f .claude/viber.yml ]]; then
    value="$(awk -v key="$key" '
/^[^[:space:]#]/ { ingroup = ($0 ~ /^directories[[:space:]]*:/); next }
ingroup && $0 ~ "^[[:space:]]+" key "[[:space:]]*:" {
  sub(/^[^:]*:[[:space:]]*/, "")
  sub(/[[:space:]#].*$/, "")
  print
  exit
}
' .claude/viber.yml)"
  fi
  case "$value" in
    ''|.|..|*[!A-Za-z0-9._-]*) value="$fallback" ;;
  esac
  printf '%s\n' "$value"
}

runs_dir="$(read_dir_key runs _specs)"
specs_dir="$(read_dir_key specifications specs)"

# --- safety gate: only a real viber run directory ---
case "/$dir/" in
  */../*)
    echo "error: refused $dir - a run directory carries no '..' segment" >&2
    exit 2
    ;;
esac

# Only once the '..' gate has seen the path as the caller wrote it: resolving
# it first would fold a '..' segment away.
dir="$(cwd_relative "$dir")"

if [[ "$dir" != "docs/$runs_dir/"* ]]; then
  echo "error: refused $dir - a run directory lives under docs/$runs_dir/" >&2
  exit 2
fi

if [[ ! -d "$dir" ]]; then
  echo "error: run directory not found: $dir" >&2
  exit 2
fi

if [[ ! -f "$dir/status.md" ]]; then
  echo "error: refused $dir - no status.md, so this is not a run directory" >&2
  exit 2
fi

# --- completeness gate ---
# Every task the plan defines has to be settled - committed or dropped by the
# user. An unfinished run still resumes from its own scaffolding, so archiving
# it would take the state the resume reads. Settled is the SET of real task ids
# the done: and skipped: lists of status.md name: an id the list repeats counts
# once, and an id naming no task in the plan (a typo, a stale entry) counts for
# nothing rather than inflating the count past what the plan actually defines.
# Total is the distinct task ids the plan's own TASK blocks declare, and a TASK
# marker only opens a block when it stands alone on its line - the shape C3
# fixes, so one mentioned in prose starts nothing.
settled=0
total=0
if [[ -f "$dir/plan.md" ]]; then
  read -r settled total <<<"$(
    awk -v st="$dir/status.md" '
/^[[:space:]]*<!--[[:space:]]*TASK[[:space:]]*-->[[:space:]]*$/  { intask = 1; gotid = 0; next }
/^[[:space:]]*<!--[[:space:]]*\/TASK[[:space:]]*-->[[:space:]]*$/ { intask = 0; next }
intask && !gotid && /^###[[:space:]]/ {
  h = $0
  sub(/^###[[:space:]]*/, "", h)
  p = index(h, " - ")
  tid = (p ? substr(h, 1, p - 1) : h)
  gsub(/[[:space:]]+$/, "", tid)
  if (tid != "" && !(tid in ids)) { ids[tid] = 1; n++ }
  gotid = 1
  next
}
END {
  while ((getline line < st) > 0) {
    if (line !~ /^done:/ && line !~ /^skipped:/) continue
    sub(/^[A-Za-z]+:/, "", line)
    m = split(line, v, /[[:space:]]+/)
    for (k = 1; k <= m; k++) {
      if (v[k] == "" || v[k] == "none" || v[k] == "-") continue
      if ((v[k] in ids) && !(v[k] in settledset)) { settledset[v[k]] = 1; s++ }
    }
  }
  close(st)
  printf "%d %d\n", s + 0, n + 0
}
' "$dir/plan.md"
  )"
fi

if [[ "$settled" -lt "$total" ]]; then
  echo "error: refused $dir - the run is unfinished: $settled of $total tasks settled" >&2
  exit 4
fi

key="${dir##*/}"
archive_root="docs/$specs_dir"
dest="$archive_root/$key"

if [[ -e "$dest" ]]; then
  echo "error: $dest already exists - nothing was moved" >&2
  exit 3
fi

scaffold=(plan.md status.md tasks work)

mkdir -p -- "$archive_root"

# --- outside a repository: the same result, without the history ---
if [[ $in_git -eq 0 ]]; then
  mv -- "$dir" "$dest"
  for leaf in "${scaffold[@]}"; do
    rm -rf -- "$dest/$leaf"
  done
  rmdir -- "docs/$runs_dir" 2>/dev/null || true
  n="$(find "$dest" -type f | awk 'END { print NR + 0 }')"
  echo "ARCHIVED: $dest ($n files - no git repository)"
  exit 0
fi

# Commits exactly the named paths as the real index holds them, leaving every
# other staged path staged: commit_named <git commit option>... -- <path>...
# "git commit -- <paths>" re-reads each named path from the working tree into an
# index built from HEAD, and under core.fileMode=false (every Windows checkout)
# the mode then comes from HEAD, so an exec bit staged with "git update-index
# --chmod=+x" was dropped from the archive. Here a temporary index starts from
# HEAD, takes each named path's entry from the real index (a staged deletion is
# its absence there; printed --full-name, since update-index reads every path as
# root-relative), and the commit runs on it with no pathspec. The real index
# already holds those entries, so afterwards it agrees with HEAD on them. The
# same function is in commit-task.sh.
commit_named() {
  local idx rc=0
  local -a opts=()
  while [[ $# -gt 0 && "$1" != "--" ]]; do opts+=("$1"); shift; done
  [[ $# -gt 0 ]] && shift
  idx="$(git rev-parse --absolute-git-dir)/index.archive-run.$$"
  rm -f "$idx"
  GIT_INDEX_FILE="$idx" git read-tree HEAD || rc=1
  if [[ $rc -eq 0 ]]; then
    GIT_INDEX_FILE="$idx" git rm -r -q --cached --ignore-unmatch -- "$@" >/dev/null || rc=1
  fi
  if [[ $rc -eq 0 ]]; then
    git ls-files -s -z --full-name -- "$@" | GIT_INDEX_FILE="$idx" git update-index -z --index-info || rc=1
  fi
  if [[ $rc -eq 0 ]]; then
    GIT_INDEX_FILE="$idx" git commit "${opts[@]}" || rc=$?
  fi
  rm -f "$idx"
  return $rc
}

# --- inside a repository: one rename, one removal, one commit ---
# `git mv` on the whole directory is what makes the archive a rename in the
# history: the caller's edit of spec.md is already in the working tree, so the
# commit reads as rename plus modification and the drift is a plain diff.
if ! git mv -- "$dir" "$dest" >&2; then
  echo "error: could not move $dir to $dest - nothing was moved" >&2
  exit 5
fi

for leaf in "${scaffold[@]}"; do
  if ! git rm -r -f -q --ignore-unmatch -- "$dest/$leaf" >&2; then
    echo "error: could not remove $dest/$leaf - the move stands, nothing was committed" >&2
    exit 5
  fi
  rm -rf -- "$dest/$leaf"
done

n="$(find "$dest" -type f | awk 'END { print NR + 0 }')"

# The pathspec is the archive and the run directory it came from, and nothing
# else: a path staged before or beside this call stays in the index.
paths=("$dir")
if [[ "$n" -gt 0 ]]; then
  git add -A -- "$dest" >&2 || exit 5
  paths+=("$dest")
else
  rmdir -- "$dest" 2>/dev/null || true
fi

rmdir -- "docs/$runs_dir" 2>/dev/null || true

commit_named -q -m "docs(viber): archive run $key" -- "${paths[@]}" >&2 || exit 5

echo "ARCHIVED: $dest ($n files)"

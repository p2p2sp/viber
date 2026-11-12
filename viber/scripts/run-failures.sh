#!/usr/bin/env bash
#
# run-failures.sh - writes a run's failure trail, `failures.md`, from the reports
# its agents left in `work/`, and prints how many failures each cause holds.
#
# A build deletes its `work/` directory when the run is archived, and with it the
# only record of what an agent actually got wrong: the Blocking findings of the
# two reviewers and the failing lines of the final test runs. This script copies
# that record into one file that survives the archive, so a later run of
# `/viber:rules` can tell a gap that repeats from a one-off. It is a script and not
# a step of an agent because the operation is fixed - read a few files, keep the
# lines of one shape, order them, write one file - and a model asked to do it
# drifts: it summarises, merges, drops. Here nothing is judged: a line either has
# the shape or it does not.
#
# Entries, one per line of `failures.md`, `- <cause> | <source> | <text>`:
#   - a Blocking item of a review report (`- Blocking [<cause>] <path>:<line> -
#     <what is wrong>`, the first line of the item only) carries the bracket's
#     cause when it is one of convention, place, plan or task, else `unknown`; its
#     text is everything after the bracket (after the word Blocking when there is
#     no bracket). A Minor item and every indented continuation line yield nothing.
#   - every line of a final test run report carries the cause `test`, the line as
#     written; the report's `status:` line and its blank lines are no failure.
# `<source>` is the report's file name without `.md`. Entries are ordered by source
# in byte order (LC_ALL=C), then by the order inside the report.
#
# `failures.md` exists only while it holds an entry: a call with none removes one
# already there, a call with some replaces the file whole, so a second call over
# the same reports never doubles a failure.
#
# Contract:
#   argv   : $1 run directory (REQUIRED, exactly one): relative to the repository
#            root or absolute; a backslash is read as `/` and trailing slashes are
#            dropped.
#   cwd    : any directory inside the host repository - the script moves to the
#            repository root itself, because a relative argument is relative to
#            it. Outside a repository the cwd is the base a relative argument
#            resolves against and is left untouched. No git command writes.
#   env    : none.
#   reads  : <run>/status.md (must exist, else the argument is no run directory),
#            <run>/work/review-*.md, <run>/work/final-review-*.md and
#            <run>/work/tests-<digits>.md. Any other file of work/ is ignored,
#            tests-baseline.md included. A missing work/ means no report.
#   writes : <run>/failures.md alone, or removes it when no entry is left.
#   stdout : on exit 0 exactly one line, nothing else:
#              failures: <total> convention <n> place <n> plan <n> task <n> test <n> unknown <n>
#            each count is the number of entries of that cause in the file.
#   exit   : 0 the trail was written, or <total> is 0 and no failures.md is left.
#            2 unusable argv: no argument, more than one, a directory that does
#              not exist or one holding no status.md; one `error: ...` line on
#              stderr, nothing on stdout, nothing written.
#            3 failures.md could not be written or removed; one `error: ...`
#              line on stderr, nothing on stdout.
#
set -u

usage() {
  echo "error: usage: run-failures.sh <run-dir>" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
raw="$1"
[[ -n "$raw" ]] || usage

# A relative argument is relative to the repository root, never to the cwd of the
# agent that calls this script. Outside a repository the cwd stays.
if git rev-parse --git-dir >/dev/null 2>&1; then
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$repo_root" && -d "$repo_root" ]]; then
    CDPATH= cd -- "$repo_root"
  fi
fi

dir="${raw//\\//}"
while [[ "$dir" == */ && "$dir" != "/" ]]; do dir="${dir%/}"; done

if [[ ! -d "$dir" ]]; then
  echo "error: run directory not found: $raw" >&2
  exit 2
fi
if [[ ! -f "$dir/status.md" ]]; then
  echo "error: $raw holds no status.md, so this is not a run directory" >&2
  exit 2
fi

out="$dir/failures.md"
work="$dir/work"

entries=""
total=0
n_convention=0
n_place=0
n_plan=0
n_task=0
n_test=0
n_unknown=0

add_entry() {
  entries+="- $1 | $2 | $3"$'\n'
  total=$((total + 1))
  case "$1" in
    convention) n_convention=$((n_convention + 1)) ;;
    place) n_place=$((n_place + 1)) ;;
    plan) n_plan=$((n_plan + 1)) ;;
    task) n_task=$((n_task + 1)) ;;
    test) n_test=$((n_test + 1)) ;;
    *) n_unknown=$((n_unknown + 1)) ;;
  esac
}

# The report names, without `.md`; the tests reports only when the suffix is a
# round number.
names=""
for f in "$work"/review-*.md "$work"/final-review-*.md "$work"/tests-*.md; do
  [[ -f "$f" ]] || continue
  base="${f##*/}"
  base="${base%.md}"
  case "$base" in
    tests-*)
      num="${base#tests-}"
      case "$num" in
        '' | *[!0-9]*) continue ;;
      esac
      ;;
  esac
  names+="$base"$'\n'
done

bracket_re='^\[([^]]*)\][[:space:]]*(.*)$'

while IFS= read -r report <&3; do
  [[ -n "$report" ]] || continue
  lineno=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    lineno=$((lineno + 1))
    case "$report" in
      tests-*)
        if [[ $lineno -eq 1 && "$line" == status:* ]]; then continue; fi
        [[ -n "${line//[[:space:]]/}" ]] || continue
        add_entry test "$report" "$line"
        ;;
      *)
        if [[ "$line" == "- Blocking" || "$line" == "- Blocking "* ]]; then
          rest="${line#- Blocking}"
          rest="${rest#"${rest%%[![:space:]]*}"}"
          cause="unknown"
          text="$rest"
          if [[ "$rest" =~ $bracket_re ]]; then
            text="${BASH_REMATCH[2]}"
            case "${BASH_REMATCH[1]}" in
              convention | place | plan | task) cause="${BASH_REMATCH[1]}" ;;
            esac
          fi
          add_entry "$cause" "$report" "$text"
        fi
        ;;
    esac
  done <"$work/$report.md"
done 3< <(printf '%s' "$names" | LC_ALL=C sort)

if [[ $total -eq 0 ]]; then
  if [[ -e "$out" || -L "$out" ]]; then
    if ! rm -f -- "$out" 2>/dev/null; then
      echo "error: could not remove $out" >&2
      exit 3
    fi
  fi
else
  # A redirection onto a directory is not refused on every platform (Git Bash), so
  # the target is checked first.
  if [[ -d "$out" ]]; then
    echo "error: could not write $out - it is a directory" >&2
    exit 3
  fi
  if ! { printf '# Failures\n\n%s' "$entries"; } 2>/dev/null >"$out"; then
    echo "error: could not write $out" >&2
    exit 3
  fi
fi

echo "failures: $total convention $n_convention place $n_place plan $n_plan task $n_task test $n_test unknown $n_unknown"

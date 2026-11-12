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
#     <what is wrong>`, the first line of the item only) opens with `- Blocking` or
#     `- **Blocking**`, followed by the end of the line or a blank. It carries the
#     bracket's cause, trimmed and lower-cased (blanks inside the bracket allowed),
#     when it is one of convention, place, plan or task, else `unknown`; its text is
#     everything after the bracket (after the word Blocking when there is no
#     bracket), leading blanks dropped. A Blocking line with no text yields no
#     entry. A Minor item and every indented continuation line yield nothing.
#   - a finding repeated across the review rounds of one task is kept once: of the
#     entries of `review-<id>-<round>` reports with the same <id> (the same task), the same cause
#     and the same text, only the one of the lowest round stays (rounds compared as
#     numbers, so round 2 is lower than round 10). The entries of one report, of
#     `final-review-*` reports, of the same finding in two different tasks and
#     every test entry are never merged.
#   - every line of a final test run report carries the cause `test`, the line as
#     written less a leading `- ` or `* ` marker; the report's `status:` line and
#     its blank lines are no failure.
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

# Every entry read is first held here, in report order; the ones kept are written
# and counted after the last report is read. e_id and e_round are set for the
# entries of a review-<id>-<round> report alone, the only ones that can be merged.
e_cause=()
e_source=()
e_text=()
e_id=()
e_round=()
n_ent=0
round_re='^review-(.+)-([0-9]+)$'

add_entry() {
  local id="" round=""
  if [[ "$2" =~ $round_re ]]; then
    id="${BASH_REMATCH[1]}"
    round="${BASH_REMATCH[2]}"
  fi
  e_cause[$n_ent]="$1"
  e_source[$n_ent]="$2"
  e_text[$n_ent]="$3"
  e_id[$n_ent]="$id"
  e_round[$n_ent]="$round"
  n_ent=$((n_ent + 1))
}

# An entry of a review report is dropped when another one of the same task, the
# same cause and the same text stands in a lower round (compared as a number).
is_repeat() {
  local i="$1" j=0
  [[ -n "${e_id[$i]}" ]] || return 1
  while [[ $j -lt $n_ent ]]; do
    if [[ $j -ne $i && "${e_id[$j]}" == "${e_id[$i]}" && "${e_cause[$j]}" == "${e_cause[$i]}" && "${e_text[$j]}" == "${e_text[$i]}" ]]; then
      if [[ $((10#${e_round[$j]})) -lt $((10#${e_round[$i]})) ]]; then
        return 0
      fi
    fi
    j=$((j + 1))
  done
  return 1
}

keep_entries() {
  local i=0
  while [[ $i -lt $n_ent ]]; do
    if ! is_repeat "$i"; then
      entries+="- ${e_cause[$i]} | ${e_source[$i]} | ${e_text[$i]}"$'\n'
      total=$((total + 1))
      case "${e_cause[$i]}" in
        convention) n_convention=$((n_convention + 1)) ;;
        place) n_place=$((n_place + 1)) ;;
        plan) n_plan=$((n_plan + 1)) ;;
        task) n_task=$((n_task + 1)) ;;
        test) n_test=$((n_test + 1)) ;;
        *) n_unknown=$((n_unknown + 1)) ;;
      esac
    fi
    i=$((i + 1))
  done
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

blocking_re='^- (\*\*Blocking\*\*|Blocking)([[:space:]].*)?$'
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
        case "$line" in
          '- '* | '* '*) line="${line#??}" ;;
        esac
        add_entry test "$report" "$line"
        ;;
      *)
        if [[ "$line" =~ $blocking_re ]]; then
          rest="${BASH_REMATCH[2]}"
          rest="${rest#"${rest%%[![:space:]]*}"}"
          cause="unknown"
          text="$rest"
          if [[ "$rest" =~ $bracket_re ]]; then
            text="${BASH_REMATCH[2]}"
            word="${BASH_REMATCH[1]}"
            word="${word#"${word%%[![:space:]]*}"}"
            word="${word%"${word##*[![:space:]]}"}"
            word="$(printf '%s' "$word" | tr '[:upper:]' '[:lower:]')"
            case "$word" in
              convention | place | plan | task) cause="$word" ;;
            esac
          fi
          [[ -n "$text" ]] || continue
          add_entry "$cause" "$report" "$text"
        fi
        ;;
    esac
  done <"$work/$report.md"
done 3< <(printf '%s' "$names" | LC_ALL=C sort)

keep_entries

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

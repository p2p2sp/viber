#!/usr/bin/env bash
#
# tree-record.sh - records the paths the working tree has changed before the fixer's first edit and
# names, at the handoff, every path changed since.
#
# It exists because the fixer's two `git status` steps (keep the changed paths as the record, then
# compare against it before the handoff) were prose a model applied by eye: a path missed in the
# comparison reached the planner as an edit the fixer never owned. The script holds the one
# definition of "a changed path" for both steps and answers in directive lines, so the skill acts
# on them instead of reading git's output itself.
#
# Contract:
#   argv   : --save
#              writes .temp/viber/fixer/tree-record under the repository root: one repo-relative
#              path per line, sorted, every path `git status --porcelain -z -uall` reports staged,
#              unstaged or untracked. Ignored paths and every path under .temp/ are left out, an
#              untracked directory is listed file by file, a rename counts as its new path.
#              An earlier record is replaced.
#            --check [<reproduction test path>]
#              the paths git status reports now, under the same rules, that are neither in the
#              record nor the given path (a leading ./ dropped once). A recorded path changed
#              further is never listed: a path is recorded by name, not by content.
#   cwd    : any directory inside the repository; the script moves to its root.
#   env    : none.
#   reads  : git status; for --check, the record file.
#   writes : the record file, by --save only.
#   stdout : --save   NEXT: trace
#                     recorded: <repo-relative path>      one per recorded path
#            --check  NEXT: handoff                       when no such path is left
#                     STOP: changed since the record - revert before the handoff
#                     path: <repo-relative path>          one per such path
#   stderr : one error: line when the exit is 2, nothing on stdout then.
#   exit   : 0; 2 with no mode or an unknown one, --save with an argument, --check with more than
#            one argument or with no record file, or outside a git repository.
#
set -u

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

mode="${1:-}"
case "$mode" in
  --save)
    [ "$#" -eq 1 ] || fail "--save takes no argument"
    ;;
  --check)
    [ "$#" -le 2 ] || fail "--check takes at most one argument: the reproduction test path"
    ;;
  "")
    fail "no mode: tree-record.sh --save | --check [<reproduction test path>]"
    ;;
  *)
    fail "unknown mode: $mode"
    ;;
esac

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$root" ] || fail "not inside a git repository"
cd "$root" || fail "cannot enter the repository root: $root"

record=".temp/viber/fixer/tree-record"

# Prints the changed paths, one per line, sorted. A rename or copy entry of the -z format is
# followed by one more entry holding the old path, which is skipped.
changed_paths() {
  local entry path skip=0
  while IFS= read -r -d '' entry; do
    if [ "$skip" -eq 1 ]; then
      skip=0
      continue
    fi
    case "${entry:0:2}" in
      *R* | *C*) skip=1 ;;
    esac
    path="${entry:3}"
    case "$path" in
      .temp/*) continue ;;
    esac
    printf '%s\n' "$path"
  done < <(git status --porcelain -z -uall 2>/dev/null) | LC_ALL=C sort -u
}

if [ "$mode" = "--save" ]; then
  paths="$(changed_paths)"
  mkdir -p "${record%/*}" || fail "cannot create ${record%/*}"
  : > "$record" || fail "cannot write $record"
  if [ -n "$paths" ]; then
    printf '%s\n' "$paths" >> "$record" || fail "cannot write $record"
  fi
  printf 'NEXT: trace\n'
  if [ -n "$paths" ]; then
    printf '%s\n' "$paths" | sed 's/^/recorded: /'
  fi
  exit 0
fi

[ -f "$record" ] || fail "no record file: run tree-record.sh --save before the first edit"
recorded="$(cat "$record")"
given="${2:-}"
given="${given#./}"

extra=""
while IFS= read -r path; do
  [ -n "$path" ] || continue
  if [ "$path" = "$given" ]; then
    continue
  fi
  case "
$recorded
" in
    *"
$path
"*) continue ;;
  esac
  extra="${extra}path: $path
"
done < <(changed_paths)

if [ -z "$extra" ]; then
  printf 'NEXT: handoff\n'
else
  printf 'STOP: changed since the record - revert before the handoff\n'
  printf '%s' "$extra"
fi
exit 0

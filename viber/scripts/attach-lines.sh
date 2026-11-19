#!/bin/sh
#
# attach-lines.sh - turns the paths a skill received into the `Attachment:` lines
# of its hand-off: one line per existing file or directory under the repository's
# `.temp/`, and nothing for any other path.
#
# It exists because `intent` and `fixer` decided from prose which of the paths
# their input names sat under `.temp/`, and spelled each absolute path with
# forward slashes and a Windows drive by hand; a wrong call dropped an attachment
# or wrote a path the planner could not land. This script applies the check, so
# the model only runs it and carries the lines it prints.
#
# Contract:
#   argv   : one or more paths, each a file or a directory, absolute or relative.
#            A relative path resolves against the cwd; a backslash counts as a
#            forward slash. Nothing else is accepted: no option.
#   cwd    : resolves a relative argument and locates the repository; the root is
#            the one git reports for it, so any subdirectory works.
#   env    : none.
#   writes : nothing.
#   stdout : one `Attachment: <absolute path>` line per argument naming an
#            existing file or directory strictly under <repository root>/.temp/,
#            in argument order, a repeat printed once. The path has forward
#            slashes and a Windows drive as C:/. An argument that is empty, does
#            not exist, sits outside <repository root>/.temp/ or is `.temp/`
#            itself prints nothing, with no error.
#   stderr : one `error: attach-lines.sh: ...` line when the exit is 2.
#   exit   : 0 with the lines above, none included; 2 with no argument or outside
#            a git repository (stdout empty).
#
set -u

fail() {
  echo "error: attach-lines.sh: $1" >&2
  exit 2
}

[ $# -ge 1 ] || fail "usage: attach-lines.sh <path> [<path>]..."

root=$(git rev-parse --show-toplevel 2>/dev/null) || root=""
[ -n "$root" ] || fail "not inside a git repository"
root=$(printf '%s' "$root" | tr '\\' '/')
root=${root%/}

# Absolute directory of $1 with forward slashes: Git Bash prints C:/ for pwd -W
# and /c/ for pwd; a symlinked directory resolves like the repository root does.
abs_dir() {
  (
    cd "$1" 2>/dev/null || exit 1
    pwd -W 2>/dev/null || pwd -P
  )
}

seen=""
for arg in "$@"; do
  p=$(printf '%s' "$arg" | tr '\\' '/')
  while [ "${p%/}" != "$p" ] && [ "$p" != "/" ]; do
    p=${p%/}
  done
  [ -n "$p" ] || continue
  if [ -d "$p" ]; then
    abs=$(abs_dir "$p") || continue
  elif [ -e "$p" ]; then
    case $p in
      */*) dir=${p%/*}; [ -n "$dir" ] || dir=/ ;;
      *) dir=. ;;
    esac
    dir=$(abs_dir "$dir") || continue
    abs="${dir%/}/${p##*/}"
  else
    continue
  fi
  case $abs in
    "$root"/.temp/?*) ;;
    *) continue ;;
  esac
  case "
$seen
" in
    *"
$abs
"*) continue ;;
  esac
  seen="$seen
$abs"
  printf 'Attachment: %s\n' "$abs"
done
exit 0

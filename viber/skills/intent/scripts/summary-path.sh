#!/usr/bin/env bash
#
# summary-path.sh - names the file `intent` writes its confirmed summary to, so
# the hand-off runs no `date` and spells no path pattern itself.
#
# It exists because the hand-off used to make the model read the clock, build
# `<project root>/.temp/viber/intent/summary-<stamp>.md` by hand and normalise
# the slashes of a Windows drive; the stamp, the root and the slashes are
# mechanical, so the script answers with the finished path.
#
# Contract:
#   argv   : none. Any argument is an error.
#   cwd    : any directory; inside a git repository the script resolves the
#            repository root, outside one the cwd stands for it.
#   env    : none.
#   writes : creates <root>/.temp/viber/intent/ when absent; never writes the
#            summary file itself.
#   stdout : NEXT: write | path: <root>/.temp/viber/intent/summary-<YYYY-MM-DD-HH-MM-SS>.md
#            <root> is absolute with forward slashes, a Windows drive as C:/.
#   stderr : one error: line when the exit is 2.
#   exit   : 0; 2 with any argument or when the directory cannot be created
#            (stdout empty).
#
set -u

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

[ "$#" -eq 0 ] || fail "summary-path.sh takes no argument"

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$root" ]; then
  # Git Bash prints a Windows cwd as /c/... for pwd and C:/... for pwd -W.
  root="$(pwd -W 2>/dev/null || pwd)"
fi
root="${root//\\//}"
root="${root%/}"

stamp="$(date +%Y-%m-%d-%H-%M-%S)"
dir="$root/.temp/viber/intent"
mkdir -p "$dir" || fail "cannot create $dir"

printf 'NEXT: write | path: %s/summary-%s.md\n' "$dir" "$stamp"

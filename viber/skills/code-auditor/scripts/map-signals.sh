#!/bin/sh
# viber - skills/code-auditor/scripts/map-signals.sh
# Runs the map signals of an audit run once and writes them into <ws>/signals.md.
#
# Why it exists: the mapper used to run every bash block of the lens's signals
# file itself, one Bash call each, substituting `<scope>` by hand, judging which
# failures count as empty and listing the fix commits. That is mechanical work a
# model repeats differently every run and pays tokens for. One script runs the
# blocks the same way every time, so the mapper reads one finished file and
# spends its turns on judgement.
#
# What it does: reads the Lens file:, Scope:, Target root: and Base: lines of
# <ws>/run.md (only the header lines before its first `## ` heading), takes the
# signals file from the lens file path (`<name>.md` -> `<name>.signals.md`),
# and writes <ws>/signals.md: the signals file verbatim, with each fenced bash
# block (fence lines included) replaced by a fenced text block holding
#   - its stdout lines, or `empty` when it printed nothing, on exit 0;
#   - `empty` when it ended with exit 1 and an empty stderr (a grep that matched
#     nothing), or failed in any way while the run file reads `Base: none` or the
#     target root holds no commit (a signal needs history);
#   - its stdout lines, if any, then `error: exit <code>: <first stderr line>`
#     for every other failure (`error: exit <code>` when stderr is empty).
# In a block `<scope>` is replaced literally by `.` for the diff and repo scopes
# and by the directory otherwise. A `## Fix commits` section closes the file:
# the fix commits of the last 12 months as `<hash> <subject>`, or `none`.
# Every block runs under bash, in the target root, with an empty stdin.
#
# Contract:
#   argv   : <ws>, the run workspace holding run.md. Absent or empty is a usage
#            error (exit 2).
#   cwd    : irrelevant. Blocks run in the Target root of run.md and every git
#            call is anchored with `git -C <root>`; cwd only resolves a relative
#            <ws>.
#   env    : none read beyond what git, bash and the blocks themselves read.
#   files  : reads <ws>/run.md and the signals file beside the lens file; writes
#            <ws>/signals.md (replaced in one move, never half written). A
#            scratch directory inside <ws> lives only while the script runs.
#   stdout : on success, the mapper dispatch block:
#              NEXT: mapper
#              Run file: <ws>/run.md
#              Lens file: <lens file>
#              Signals: <ws>/signals.md
#              Output: <ws>/map.md
#   exit   : 0 on success, whatever the blocks printed. 2 with one `error:` line
#            on stderr and nothing on stdout when <ws> or <ws>/run.md is
#            missing, the run file lacks a Lens file:, Scope: or Target root:
#            line, or the signals file is missing.
set -u

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

ws=${1:-}
if [ -z "$ws" ]; then
  fail "usage: map-signals.sh <ws>"
fi
ws=${ws%/}
run_file=$ws/run.md
if [ ! -f "$run_file" ]; then
  fail "run file not found: $run_file"
fi

# header_value <key> -> the value of the first `<key>: <value>` line before the
# first `## ` heading of run.md.
header_value() {
  RUN_KEY="$1" awk '
    BEGIN { k = ENVIRON["RUN_KEY"] ": "; n = length(k) }
    /^## / { exit }
    substr($0, 1, n) == k { v = substr($0, n + 1); sub(/\r$/, "", v); print v; exit }
  ' "$run_file"
}

lens_file=$(header_value "Lens file")
scope=$(header_value "Scope")
root=$(header_value "Target root")
base=$(header_value "Base")

[ -n "$lens_file" ] || fail "run file has no Lens file: line: $run_file"
[ -n "$scope" ] || fail "run file has no Scope: line: $run_file"
[ -n "$root" ] || fail "run file has no Target root: line: $run_file"

case $lens_file in
  *.md) signals_file=${lens_file%.md}.signals.md ;;
  *) fail "lens file is not a .md file: $lens_file" ;;
esac
[ -f "$signals_file" ] || fail "signals file not found: $signals_file"

case $scope in
  diff | repo) block_scope=. ;;
  *) block_scope=$scope ;;
esac

# A signal needs history: with no commit, or a run file reading Base: none, a
# failing block is a missing signal, not an error.
no_history=0
[ "$base" = none ] && no_history=1
git -C "$root" rev-parse --verify -q HEAD >/dev/null 2>&1 || no_history=1

ws_abs=$(cd "$ws" && pwd) || fail "workspace not reachable: $ws"
tmp=$(mktemp -d "$ws_abs/signals.tmp.XXXXXX") || fail "cannot create a scratch directory in $ws"
trap 'rm -rf "$tmp"' EXIT

# Cut the signals file into numbered pieces: prose (kept verbatim) and bash
# blocks (`<scope>` replaced literally, a plain index loop since gsub would read
# a `&` or a backslash of the scope).
SIGNALS_DIR="$tmp" SIGNALS_SCOPE="$block_scope" awk '
  BEGIN {
    dir = ENVIRON["SIGNALS_DIR"]
    scope = ENVIRON["SIGNALS_SCOPE"]
    n = 1
    mode = "prose"
    file = sprintf("%s/piece.%04d.prose", dir, n)
    printf "" > file
  }
  mode == "prose" && /^```bash[ \t\r]*$/ {
    close(file)
    n++
    mode = "bash"
    file = sprintf("%s/piece.%04d.bash", dir, n)
    printf "" > file
    next
  }
  mode == "bash" && /^```[ \t\r]*$/ {
    close(file)
    n++
    mode = "prose"
    file = sprintf("%s/piece.%04d.prose", dir, n)
    printf "" > file
    next
  }
  mode == "bash" {
    rest = $0
    line = ""
    while (1) {
      i = index(rest, "<scope>")
      if (i == 0) break
      line = line substr(rest, 1, i - 1) scope
      rest = substr(rest, i + 7)
    }
    print line rest > file
    next
  }
  { print > file }
  END { close(file) }
' "$signals_file"

# run_block <block file> -> the text block that replaces the bash block. awk
# prints the captured stdout so a missing last newline is restored.
run_block() {
  out=$tmp/block.out
  err=$tmp/block.err
  ( cd "$root" && bash "$1" ) </dev/null >"$out" 2>"$err"
  code=$?
  printf '%s\n' '```text'
  if [ "$code" -eq 0 ]; then
    if [ -s "$out" ]; then awk '{ print }' "$out"; else printf 'empty\n'; fi
  elif [ "$no_history" -eq 1 ] || { [ "$code" -eq 1 ] && [ ! -s "$err" ]; }; then
    printf 'empty\n'
  else
    if [ -s "$out" ]; then awk '{ print }' "$out"; fi
    first=$(sed -n '1p' "$err" | tr -d '\r')
    if [ -n "$first" ]; then
      printf 'error: exit %s: %s\n' "$code" "$first"
    else
      printf 'error: exit %s\n' "$code"
    fi
  fi
  printf '%s\n' '```'
}

{
  for piece in "$tmp"/piece.*; do
    case $piece in
      *.prose) cat "$piece" ;;
      *.bash) run_block "$piece" ;;
    esac
  done
  printf '\n## Fix commits\n'
  fixes=$(git -C "$root" log --no-merges -i -E --grep='fix|bug|regress|revert' --since='12 months ago' --format='%h %s' 2>/dev/null) || fixes=""
  if [ -n "$fixes" ]; then
    printf '%s\n' "$fixes"
  else
    printf 'none\n'
  fi
} >"$tmp/signals.out"

mv -f "$tmp/signals.out" "$ws/signals.md"

printf 'NEXT: mapper\n'
printf 'Run file: %s\n' "$run_file"
printf 'Lens file: %s\n' "$lens_file"
printf 'Signals: %s/signals.md\n' "$ws"
printf 'Output: %s/map.md\n' "$ws"
exit 0

#!/usr/bin/env bash
#
# run-suite.sh - runs the test command of a command file into its log, and waits
# for the log's exit line.
#
# It exists because `test-runner` ran the whole suite in one tool call that the
# host cuts off after ten minutes, and a model deciding by hand how long to wait,
# which log is current and what an early exit means is a model that reads a stale
# log or runs the suite twice. The suite runs once in the background through
# `run`; `wait` answers in one line, and a suite still running is a directive to
# call `wait` again.
#
# The files live beside each other under <repository root>/.temp/viber/test-runner/,
# named after the report file without its `.md`: `<name>.cmd` (the test command
# `test-runner` wrote) and `<name>.log` (what `run` writes).
#
# Contract:
#   argv   : run <report path> <command file>
#              <command file> is the `.cmd` file of the report, a path relative to
#              the repository root or absolute. Creates the log's directory,
#              deletes an old log, runs `bash <command file>` from the repository
#              root with stdout and stderr into the log, and ends the log on a
#              line `exit=<code>` of the command (on a line of its own, even when
#              the output ended without a newline).
#            wait <report path>
#              waits until a log at least as new as the report's command file ends
#              on a line `exit=<code>`. A log older than the command file is an
#              earlier run's and is never read; an equal timestamp counts as
#              current, so a command finishing within the second its file was
#              written is read.
#   cwd    : any directory of the repository; the script moves to the repository
#            root itself (the current directory when there is no repository).
#   env    : RUN_SUITE_WAIT - the seconds `wait` waits at most (default 590; a
#            value that is not a run of digits is the default).
#   stdout : run  -> "log: <log path>" once the command ended.
#            wait -> "log: <log path>" then "exit=<code>", or "log: <log path>"
#                    then "NEXT: wait" when the time ran out first: the caller
#                    runs `wait` again.
#   exit   : 0 on a printed answer, whatever the exit code of the command;
#            2 a missing or unknown mode, a missing report path or a missing
#              command file (one `error:` line on stderr, stdout empty).
#
set -u

dir_rel=".temp/viber/test-runner"

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

mode="${1:-}"
report="${2:-}"
case "$mode" in
  run | wait) ;;
  '') fail "usage: run-suite.sh run <report path> <command file> | wait <report path>" ;;
  *) fail "unknown mode: $mode" ;;
esac
[ -n "$report" ] || fail "missing report path"

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$root" ] || root="$(pwd)"
cd "$root" || fail "cannot enter $root"

report="${report//\\//}"
base="${report##*/}"
base="${base%.md}"
log_dir="$root/$dir_rel"
log="$log_dir/$base.log"

if [ "$mode" = "run" ]; then
  cmd="${3:-}"
  [ -n "$cmd" ] || fail "missing command file"
  cmd="${cmd//\\//}"
  [ -f "$cmd" ] || fail "no such command file: $cmd"
  mkdir -p "$log_dir"
  rm -f "$log"
  bash "$cmd" >"$log" 2>&1
  code=$?
  # A last byte other than a newline leaves the exit line glued to the output.
  if [ -n "$(tail -c 1 "$log" 2>/dev/null)" ]; then
    printf '\n' >>"$log"
  fi
  printf 'exit=%s\n' "$code" >>"$log"
  printf 'log: %s\n' "$log"
  exit 0
fi

cmd="$log_dir/$base.cmd"
[ -f "$cmd" ] || fail "no command file for the report: $cmd"

limit="${RUN_SUITE_WAIT:-590}"
case "$limit" in
  '' | *[!0-9]*) limit=590 ;;
esac

# The log is current unless the command file is strictly newer: the same second
# counts, because a command can finish within the second its file was written.
waited=0
while :; do
  if [ -f "$log" ] && ! [ "$cmd" -nt "$log" ]; then
    last="$(tail -n 1 "$log" 2>/dev/null || true)"
    last="${last%$'\r'}"
    if [[ "$last" =~ ^exit=[0-9]+$ ]]; then
      printf 'log: %s\n' "$log"
      printf '%s\n' "$last"
      exit 0
    fi
  fi
  [ "$waited" -lt "$limit" ] || break
  sleep 1
  waited=$((waited + 1))
done

printf 'log: %s\n' "$log"
printf 'NEXT: wait\n'
exit 0

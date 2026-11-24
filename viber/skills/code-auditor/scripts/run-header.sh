#!/bin/sh
#
# run-header.sh - a sourced library: header_value prints one header line value of
# the run file of an audit run.
#
# It exists for map-signals.sh, the one shell script that reads the run header; the
# Node cores read it through viber/lib/run-header.ts, and both read it the same way.
#
# It is sourced, never run: it sets no shell option and defines one function. It
# touches no file but the run file and runs no command but awk.
#
# Contract:
#   usage  : `. "$(dirname -- "$0")/run-header.sh"` from
#            viber/skills/code-auditor/scripts/<name>.sh, with `run_file` set, then
#            `header_value <key>`.
#   argv   : <key> is the header key without its colon and space (`Lens file`).
#   cwd    : irrelevant: `run_file` is read as the caller spells it.
#   env    : `run_file`, set by the caller; RUN_KEY, set for the awk call alone.
#   stdout : the value of the first `<key>: <value>` line before the first `## `
#            line of "$run_file", a trailing "\r" removed; nothing when absent.
#   exit   : 0.

header_value() {
  RUN_KEY="$1" awk '
    BEGIN { k = ENVIRON["RUN_KEY"] ": "; n = length(k) }
    /^## / { exit }
    substr($0, 1, n) == k { v = substr($0, n + 1); sub(/\r$/, "", v); print v; exit }
  ' "$run_file"
}

#!/bin/sh
# viber - skills/code-auditor/scripts/keep-units.sh
# Gates the mapper's map of an audit run and prints the hunter blocks of a scope
# whose hunts fit its budget, recording each printed hunt in the ledger.
#
# Why it exists: after the mapper returned, the skill checked the four headings of
# map.md, retried the mapper, read the `none:` line of `## Units`, appended the map
# to run.md and then assembled every hunter brief by hand: the angles of the lens,
# the unit lines, the worktree and overlay lines. That is mechanical work a model
# repeats differently every run and pays tokens for. One script answers each call
# with the next directive, so the skill only dispatches what is printed.
#
# What it does, the first step that applies answering the call:
#   1. Map gate. A trailing closing tag of map.md is stripped (strip-tag.sh), then
#      map.md must hold `## Conventions`, `## History`, `## Severity calibration`
#      and `## Units` at column 0. A miss prints the mapper block once more with
#      `retry` (ledger `mapper-retried`), the next miss the stop line
#      `code-auditor: map unavailable after two attempts`. A `## Units` whose first
#      line reads `none: <reason>` stops with `code-auditor: nothing to audit for
#      <lens>: <reason>`. A passed gate appends a blank line, `## Map` and map.md
#      verbatim to run.md and writes the ledger line `map-appended`; once that line
#      stands the gate is not run again, so the map is appended once however often
#      the script runs.
#   2. Hunters, only while the ledger holds no wave 1 `hunt:` line. On the diff
#      scope one hunter block per `### <slug>` angle of the lens's `## Hunts`, hunt
#      id `A-<slug>`. On a directory (budget 8) or repo (budget 16) scope with no
#      more units than the budget, one block per unit line of `## Units`, hunt id
#      `U<n>`. Each printed hunt is appended to the ledger as
#      `hunt: <id> | wave: 1 | unit: U<n>|none | angle: <slug>|none`. The line
#      `hunters-at-once: 16` (4 on the tests lens) comes first. A lens reading
#      `Worktree: required` adds the worktree script and worktree lines, and on the
#      diff scope the overlay script line. Units above the budget print nothing here.
#   3. Otherwise `NEXT: none`.
#
# Contract:
#   argv   : <ws>, the run workspace holding run.md and map.md. Absent or empty is a
#            usage error (exit 2). Any further argument is ignored.
#   cwd    : irrelevant: every path derives from argv and the files it names, cwd
#            only resolves a relative <ws>.
#   env    : TMPDIR, read by strip-tag.sh; nothing else.
#   files  : reads <ws>/run.md (the header lines before its first `## ` heading:
#            Lens:, Lens file:, Scope:), <ws>/map.md, <ws>/ledger.md and the lens
#            file. Writes: map.md (a trailing closing tag stripped), run.md (the map
#            appended once) and <ws>/ledger.md (lines appended, never rewritten).
#   stdout : exactly one answer, in the auditor directive format:
#              NEXT: mapper | retry, then the lines Run file:, Lens file:, Signals:,
#                Output: of the map-signals.sh block
#              STOP: code-auditor: map unavailable after two attempts
#              STOP: code-auditor: nothing to audit for <lens>: <reason>
#              hunters-at-once: <n>, then per hunt NEXT: hunter | id: <id> |
#                background and the lines Run file:, Lens file:, Schema:, Test
#                rules:, Hunt:, Unit: or Angle:, Reports:, and for a lens reading
#                Worktree: required Worktree script:, Worktree:, and on the diff
#                scope Overlay script:
#              NEXT: none
#   exit   : 0 in every case. 2 with one `error:` line on stderr and nothing on
#            stdout when <ws> or <ws>/run.md is missing or the run file lacks a
#            Lens:, Lens file: or Scope: line.
set -u

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

script_dir=$(cd "$(dirname "$0")" && pwd)
skill_dir=${script_dir%/*}
plugin_root=${skill_dir%/skills/code-auditor}

ws=${1:-}
if [ -z "$ws" ]; then
  fail "usage: keep-units.sh <ws>"
fi
ws=${ws%/}
run_file=$ws/run.md
map_file=$ws/map.md
ledger=$ws/ledger.md
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

lens=$(header_value "Lens")
lens_file=$(header_value "Lens file")
scope=$(header_value "Scope")

[ -n "$lens" ] || fail "run file has no Lens: line: $run_file"
[ -n "$lens_file" ] || fail "run file has no Lens file: line: $run_file"
[ -n "$scope" ] || fail "run file has no Scope: line: $run_file"

in_ledger() {
  [ -f "$ledger" ] && grep -Eq "$1" "$ledger"
}

if ! in_ledger '^map-appended$'; then
  sh "$script_dir/strip-tag.sh" "$map_file"

  gate_ok=1
  if [ ! -f "$map_file" ]; then
    gate_ok=0
  else
    for heading in Conventions History "Severity calibration" Units; do
      grep -Eq "^## $heading[[:space:]]*\$" "$map_file" || gate_ok=0
    done
  fi

  if [ "$gate_ok" -eq 0 ]; then
    if in_ledger '^mapper-retried$'; then
      printf 'STOP: code-auditor: map unavailable after two attempts\n'
      exit 0
    fi
    printf 'mapper-retried\n' >> "$ledger"
    printf 'NEXT: mapper | retry\n'
    printf 'Run file: %s\n' "$run_file"
    printf 'Lens file: %s\n' "$lens_file"
    printf 'Signals: %s/signals.md\n' "$ws"
    printf 'Output: %s\n' "$map_file"
    exit 0
  fi

  none_line=$(awk '
    /^## / { insec = ($0 ~ /^## Units[ \t\r]*$/); next }
    insec && NF {
      if ($0 ~ /^none:/) {
        v = substr($0, 6)
        sub(/^[ \t]+/, "", v)
        sub(/[ \t\r]+$/, "", v)
        print "none:" v
      }
      exit
    }
  ' "$map_file")
  case $none_line in
    none:*)
      printf 'STOP: code-auditor: nothing to audit for %s: %s\n' "$lens" "${none_line#none:}"
      exit 0 ;;
  esac

  {
    printf '\n## Map\n'
    cat "$map_file"
  } >> "$run_file"
  printf 'map-appended\n' >> "$ledger"
fi

if in_ledger '^hunt: .* \| wave: 1 \|'; then
  printf 'NEXT: none\n'
  exit 0
fi

worktree=0
grep -q '^Worktree: required' "$lens_file" 2>/dev/null && worktree=1

# hunter_block <hunt id> <unit line | ""> <angle | ""> <unit id | ""> prints one hunter
# block and records the hunt in the ledger.
hunter_block() {
  hid=$1
  unit_line=$2
  angle=$3
  unit_id=$4
  printf 'NEXT: hunter | id: %s | background\n' "$hid"
  printf 'Run file: %s\n' "$run_file"
  printf 'Lens file: %s\n' "$lens_file"
  printf 'Schema: %s/references/synthesis.md\n' "$skill_dir"
  printf 'Test rules: %s/references/test-strategy.md\n' "$plugin_root"
  printf 'Hunt: %s\n' "$hid"
  [ -z "$unit_line" ] || printf 'Unit: %s\n' "$unit_line"
  [ -z "$angle" ] || printf 'Angle: %s\n' "$angle"
  printf 'Reports: %s/reports/%s\n' "$ws" "$hid"
  if [ "$worktree" -eq 1 ]; then
    printf 'Worktree script: %s/scripts/worktree.sh\n' "$skill_dir"
    printf 'Worktree: %s/worktrees/%s\n' "$ws" "$hid"
    if [ "$scope" = diff ]; then
      printf 'Overlay script: %s/scripts/diff-overlay.sh\n' "$skill_dir"
    fi
  fi
  printf 'hunt: %s | wave: 1 | unit: %s | angle: %s\n' "$hid" "${unit_id:-none}" "${angle:-none}" >> "$ledger"
}

at_once=16
[ "$lens" != tests ] || at_once=4

if [ "$scope" = diff ]; then
  angles=$(awk '
    /^## / { insec = ($0 ~ /^## Hunts[ \t\r]*$/); next }
    insec && /^### / {
      s = substr($0, 5)
      sub(/^[ \t]+/, "", s)
      sub(/[ \t\r]+$/, "", s)
      if (s != "") print s
    }
  ' "$lens_file")
  if [ -n "$angles" ]; then
    printf 'hunters-at-once: %s\n' "$at_once"
    printf '%s\n' "$angles" | while IFS= read -r slug; do
      hunter_block "A-$slug" "" "$slug" ""
    done
    exit 0
  fi
else
  budget=8
  [ "$scope" != repo ] || budget=16
  units=$(awk '
    /^## / { insec = ($0 ~ /^## Units[ \t\r]*$/); next }
    insec && /^- U[0-9]+ \|/ { print }
  ' "$map_file")
  count=$(printf '%s' "$units" | awk 'END { print NR }')
  if [ "$count" -gt 0 ] && [ "$count" -le "$budget" ]; then
    printf 'hunters-at-once: %s\n' "$at_once"
    printf '%s\n' "$units" | while IFS= read -r line; do
      id=${line#- }
      id=${id%% *}
      hunter_block "$id" "$line" "" "$id"
    done
    exit 0
  fi
fi

printf 'NEXT: none\n'
exit 0

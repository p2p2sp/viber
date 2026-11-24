#!/bin/sh
# viber - skills/code-auditor/scripts/keep-units.sh
# Gates the mapper's map of an audit run, prints the scout batches of a scope whose
# units exceed its budget and the hunter blocks of the kept units, recording each
# printed hunt in the ledger.
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
#      diff scope the overlay script line.
#   3. Scouts and kept units, on a directory or repo scope with more units than the
#      budget and no wave 1 `hunt:` line. With no `scouts:` ledger line, one scout
#      block per batch of up to 8 units in map order (id S<b>, `model: sonnet` on the
#      security lens only), recorded as the ledger line `scouts: S1,S2,...`. On the
#      next call the units with no score line in <ws>/scores/*.md (a missing score
#      file leaves its units unscored) go once to `S<b>-retry` batches, recorded as
#      `scouts-retried`; when none is unscored no retry is printed. After that no call
#      prints a scout block: the kept units, the budget's count with the highest score
#      first, equal scores in map order, units still unscored after every scored one
#      in map order, are printed as hunter blocks in that order. A score file loses a
#      trailing closing tag (strip-tag.sh) and every line that is not a score line
#      (`{"unit":"U<n>","score":1-5,...}`) is skipped.
#   4. Otherwise `NEXT: none`.
#
# With `--wave` (the variant wave, after synthesize.sh wrote <ws>/seeds.md) the map
# gate and the wave 1 steps are skipped. A ledger already holding a wave 2 `hunt:`
# line, a missing seeds.md or one with no `Seed:` line prints `NEXT: none`. Otherwise,
# on the diff scope one hunter block per `Seed: <angle slug>: <class>` line, hunt id
# `V-<n>` with n from 1, carrying `Angle: <that slug>` and that `Seed:` line. On a
# directory or repo scope first one block per unit whose wave 1 hunt left a ledger
# `no-report: U<n>` line, in map order, hunt id `R-U<n>` (the unit re-hunt), then one
# block per unit no ledger `hunt:` line names yet, best first as in step 3 (without
# scores, in map order), the two kinds together up to the budget, each carrying every
# `Seed:` line. Each printed hunt is appended to the ledger as a wave 2 `hunt:` line
# (`hunt: R-U<n> | wave: 2 | unit: U<n> | angle: none` for a re-hunt); no hunt to print
# answers `NEXT: none`.
#
# Contract:
#   argv   : <ws>, the run workspace holding run.md and map.md. Absent or empty is a
#            usage error (exit 2). The second argument `--wave` selects the variant
#            wave; any other further argument is ignored.
#   cwd    : irrelevant: every path derives from argv and the files it names, cwd
#            only resolves a relative <ws>.
#   env    : PATH must resolve `node` for strip-tag.sh, which strips nothing
#            without it; nothing else.
#   paths  : the Schema:, Test rules:, Worktree script: and Overlay script: paths are
#            spelled from the path the script was invoked by, through
#            scripts/plugin-root.sh: `C:/...` for a `C:\...` or `C:/...` call,
#            `/c/...` for a `/c/...` call.
#   files  : reads <ws>/run.md (the header lines before its first `## ` heading:
#            Lens:, Lens file:, Scope:), <ws>/map.md, <ws>/scores/*.md, <ws>/ledger.md,
#            <ws>/seeds.md (--wave) and the lens file. Writes: map.md and the score files (a trailing closing
#            tag stripped), run.md (the map appended once) and <ws>/ledger.md (lines
#            appended, never rewritten).
#   stdout : exactly one answer, in the auditor directive format:
#              NEXT: mapper | retry, then the lines Run file:, Lens file:, Signals:,
#                Output: of the map-signals.sh block
#              STOP: code-auditor: map unavailable after two attempts
#              STOP: code-auditor: nothing to audit for <lens>: <reason>
#              per batch NEXT: scout | id: S<b>[-retry][ | model: sonnet], then the
#                lines Run file:, Lens file:, Out:, and one Unit: line per unit
#              hunters-at-once: <n>, then per hunt NEXT: hunter | id: <id> |
#                background and the lines Run file:, Lens file:, Schema:, Test
#                rules:, Hunt:, Unit: or Angle:, Seed: per seed (--wave only),
#                Reports:, and for a lens reading
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

. "$(dirname -- "$0")/../../../scripts/plugin-root.sh"
script_dir=$(cd "$(dirname "$0")" && pwd)
skill_dir=$(plugin_root_of "$0" 1)
plugin_root=$(plugin_root_of "$0" 3)

ws=${1:-}
if [ -z "$ws" ]; then
  fail "usage: keep-units.sh <ws>"
fi
ws=${ws%/}
wave_mode=0
[ "${2:-}" != "--wave" ] || wave_mode=1
run_file=$ws/run.md
map_file=$ws/map.md
ledger=$ws/ledger.md
if [ ! -f "$run_file" ]; then
  fail "run file not found: $run_file"
fi

. "$script_dir/run-header.sh"

lens=$(header_value "Lens")
lens_file=$(header_value "Lens file")
scope=$(header_value "Scope")

[ -n "$lens" ] || fail "run file has no Lens: line: $run_file"
[ -n "$lens_file" ] || fail "run file has no Lens file: line: $run_file"
[ -n "$scope" ] || fail "run file has no Scope: line: $run_file"

in_ledger() {
  [ -f "$ledger" ] && grep -Eq "$1" "$ledger"
}

if [ "$wave_mode" -eq 0 ] && ! in_ledger '^map-appended$'; then
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

if [ "$wave_mode" -eq 0 ] && in_ledger '^hunt: .* \| wave: 1 \|'; then
  printf 'NEXT: none\n'
  exit 0
fi

worktree=0
grep -q '^Worktree: required' "$lens_file" 2>/dev/null && worktree=1

# The wave a printed hunt is recorded under.
hunt_wave=1
[ "$wave_mode" -eq 0 ] || hunt_wave=2

# hunter_block <hunt id> <unit line | ""> <angle | ""> <unit id | ""> <seed lines | ""> prints
# one hunter block and records the hunt in the ledger.
hunter_block() {
  hid=$1
  unit_line=$2
  angle=$3
  unit_id=$4
  seed_lines=$5
  printf 'NEXT: hunter | id: %s | background\n' "$hid"
  printf 'Run file: %s\n' "$run_file"
  printf 'Lens file: %s\n' "$lens_file"
  printf 'Schema: %s/references/synthesis.md\n' "$skill_dir"
  printf 'Test rules: %s/references/test-strategy.md\n' "$plugin_root"
  printf 'Hunt: %s\n' "$hid"
  [ -z "$unit_line" ] || printf 'Unit: %s\n' "$unit_line"
  [ -z "$angle" ] || printf 'Angle: %s\n' "$angle"
  [ -z "$seed_lines" ] || printf '%s\n' "$seed_lines"
  printf 'Reports: %s/reports/%s\n' "$ws" "$hid"
  if [ "$worktree" -eq 1 ]; then
    printf 'Worktree script: %s/scripts/worktree.sh\n' "$skill_dir"
    printf 'Worktree: %s/worktrees/%s\n' "$ws" "$hid"
    if [ "$scope" = diff ]; then
      printf 'Overlay script: %s/scripts/diff-overlay.sh\n' "$skill_dir"
    fi
  fi
  printf 'hunt: %s | wave: %s | unit: %s | angle: %s\n' "$hid" "$hunt_wave" "${unit_id:-none}" "${angle:-none}" >> "$ledger"
}

# batch_ids <unit count> prints S1,S2,... one id per batch of up to 8 units.
batch_ids() {
  total=$(($1 + 7))
  batches=$((total / 8))
  i=1
  ids=
  while [ "$i" -le "$batches" ]; do
    ids="${ids:+$ids,}S$i"
    i=$((i + 1))
  done
  printf '%s' "$ids"
}

# scout_blocks <unit lines> <id suffix> prints one scout block per batch of up to 8
# unit lines in the order given; the security lens passes model: sonnet.
scout_blocks() {
  printf '%s\n' "$1" | SC_RUN=$run_file SC_LENS=$lens_file SC_OUT=$ws/scores SC_SUFFIX=$2 SC_LENSNAME=$lens \
    awk '
      (NR - 1) % 8 == 0 {
        b++
        head = "NEXT: scout | id: S" b ENVIRON["SC_SUFFIX"]
        if (ENVIRON["SC_LENSNAME"] == "security") head = head " | model: sonnet"
        print head
        print "Run file: " ENVIRON["SC_RUN"]
        print "Lens file: " ENVIRON["SC_LENS"]
        print "Out: " ENVIRON["SC_OUT"] "/S" b ENVIRON["SC_SUFFIX"] ".md"
      }
      { print "Unit: " $0 }
    '
}

# scored_units prints one `U<n> <score>` line per unit with a score line in
# <ws>/scores/*.md, the first one seen. Each file first loses a trailing closing tag
# (strip-tag.sh); a line that is no score line (a JSON object holding "unit":"U<n>"
# and "score" 1-5) is skipped.
scored_units() {
  set --
  for f in "$ws"/scores/*.md; do
    [ -f "$f" ] && set -- "$@" "$f"
  done
  [ "$#" -gt 0 ] || return 0
  sh "$script_dir/strip-tag.sh" "$@"
  awk '
    /^[ \t]*[{]/ {
      if (match($0, /"unit"[ \t]*:[ \t]*"U[0-9]+"/) == 0) next
      u = substr($0, RSTART, RLENGTH)
      sub(/^.*:[ \t]*"/, "", u)
      sub(/"$/, "", u)
      if (match($0, /"score"[ \t]*:[ \t]*[1-5][ \t,}]/) == 0) next
      v = substr($0, RSTART, RLENGTH)
      gsub(/[^0-9]/, "", v)
      if (!(u in seen)) { seen[u] = 1; print u " " v }
    }
  ' "$@"
}

at_once=16
[ "$lens" != tests ] || at_once=4

budget=8
[ "$scope" != repo ] || budget=16

# unit_lines prints the unit lines of map.md's `## Units`, in map order.
unit_lines() {
  awk '
    /^## / { insec = ($0 ~ /^## Units[ \t\r]*$/); next }
    insec && /^- U[0-9]+ \|/ { print }
  ' "$map_file"
}

# kept_units <unit lines> <scored units> <hunted ids> prints, among the unit lines whose
# id is not in <hunted ids> (one per line), the budget's count (the budget left after the
# R-U hunts, once keep_limit is set) with the highest score first, equal scores in map
# order, units with no score after every scored one.
kept_units() {
  printf '%s\n' "$1" | SCORED="$2" HUNTED="$3" BUDGET="${keep_limit:-$budget}" awk '
    BEGIN {
      n = split(ENVIRON["SCORED"], a, "\n")
      for (i = 1; i <= n; i++) { split(a[i], p, " "); if (p[1] != "") s[p[1]] = p[2] + 0 }
      n = split(ENVIRON["HUNTED"], a, "\n")
      for (i = 1; i <= n; i++) if (a[i] != "") h[a[i]] = 1
      limit = ENVIRON["BUDGET"] + 0
    }
    $2 in h { next }
    { m++; line[m] = $0; rank[m] = ($2 in s) ? s[$2] : 0 }
    END {
      for (k = 5; k >= 0; k--)
        for (i = 1; i <= m; i++)
          if (rank[i] == k && taken < limit) { print line[i]; taken++ }
    }
  '
}

# print_unit_hunts <unit lines> <seed lines> prints hunters-at-once, then one hunter
# block per unit line, each carrying the seed lines.
print_unit_hunts() {
  printf 'hunters-at-once: %s\n' "$at_once"
  printf '%s\n' "$1" | while IFS= read -r line; do
    id=${line#- }
    id=${id%% *}
    hunter_block "$id" "$line" "" "$id" "$2"
  done
}

if [ "$wave_mode" -eq 1 ]; then
  seeds=
  [ ! -f "$ws/seeds.md" ] || seeds=$(awk '/^Seed: / { sub(/\r$/, ""); print }' "$ws/seeds.md")
  if [ -z "$seeds" ] || in_ledger '^hunt: .* \| wave: 2 \|'; then
    printf 'NEXT: none\n'
    exit 0
  fi
  if [ "$scope" = diff ]; then
    printf 'hunters-at-once: %s\n' "$at_once"
    printf '%s\n' "$seeds" | {
      n=0
      while IFS= read -r seed; do
        n=$((n + 1))
        slug=${seed#Seed: }
        slug=${slug%%: *}
        hunter_block "V-$n" "" "$slug" "" "$seed"
      done
    }
    exit 0
  fi
  hunted=$(awk '
    /^hunt: / && match($0, /unit: U[0-9]+/) { print substr($0, RSTART + 6, RLENGTH - 6) }
  ' "$ledger" 2>/dev/null)
  missed=$(awk '
    /^no-report: U[0-9]+[ \t\r]*$/ { sub(/\r$/, ""); print substr($0, 12) }
  ' "$ledger" 2>/dev/null)
  all_units=$(unit_lines)
  rehunts=$(printf '%s\n' "$all_units" | MISSED="$missed" BUDGET="$budget" awk '
    BEGIN {
      n = split(ENVIRON["MISSED"], a, "\n")
      for (i = 1; i <= n; i++) if (a[i] != "") m[a[i]] = 1
      limit = ENVIRON["BUDGET"] + 0
    }
    $2 in m && taken < limit { print; taken++ }
  ')
  rehunt_count=$(printf '%s' "$rehunts" | awk 'END { print NR }')
  keep_limit=$((budget - rehunt_count))
  kept=$(kept_units "$all_units" "$(scored_units)" "$hunted")
  if [ -z "$rehunts" ] && [ -z "$kept" ]; then
    printf 'NEXT: none\n'
    exit 0
  fi
  printf 'hunters-at-once: %s\n' "$at_once"
  printf '%s\n' "$rehunts" | while IFS= read -r line; do
    [ -n "$line" ] || continue
    id=${line#- }
    id=${id%% *}
    hunter_block "R-$id" "$line" "" "$id" "$seeds"
  done
  printf '%s\n' "$kept" | while IFS= read -r line; do
    [ -n "$line" ] || continue
    id=${line#- }
    id=${id%% *}
    hunter_block "$id" "$line" "" "$id" "$seeds"
  done
  exit 0
fi

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
      hunter_block "A-$slug" "" "$slug" "" ""
    done
    exit 0
  fi
else
  units=$(unit_lines)
  count=$(printf '%s' "$units" | awk 'END { print NR }')
  if [ "$count" -gt 0 ] && [ "$count" -le "$budget" ]; then
    print_unit_hunts "$units" ""
    exit 0
  fi
  if [ "$count" -gt "$budget" ]; then
    if ! in_ledger '^scouts: '; then
      scout_blocks "$units" ""
      printf 'scouts: %s\n' "$(batch_ids "$count")" >> "$ledger"
      exit 0
    fi
    scored=$(scored_units)
    if ! in_ledger '^scouts-retried$'; then
      unscored=$(printf '%s\n' "$units" | SCORED="$scored" awk '
        BEGIN {
          n = split(ENVIRON["SCORED"], a, "\n")
          for (i = 1; i <= n; i++) { split(a[i], p, " "); if (p[1] != "") s[p[1]] = 1 }
        }
        !($2 in s) { print }
      ')
      if [ -n "$unscored" ]; then
        scout_blocks "$unscored" "-retry"
        printf 'scouts-retried\n' >> "$ledger"
        exit 0
      fi
    fi
    kept=$(kept_units "$units" "$scored" "")
    print_unit_hunts "$kept" ""
    exit 0
  fi
fi

printf 'NEXT: none\n'
exit 0

#!/bin/sh
# viber - skills/code-auditor/scripts/hunt-return.sh
# Answers the return of a hunter or a critic of an audit run: one critic block per
# claim the hunt filed, the one retry of a hunter that filed no report or of a critic
# that left no verdict, or `NEXT: none`.
#
# Why it exists: on each hunter return the skill listed the reports of that hunt only
# (a hyphen and one digit right after the full id, so `A-x` never counted an `A-x-y`
# file), stripped a leaked closing tag, built one critic brief per claim sidecar, with
# its worktree, overlay, test rules and variant lines per lens, scope and wave, and
# rebuilt the hunter brief by hand for the retry; on each critic return it stripped the
# verdict file, looked for the `VERDICT:` line and rebuilt the critic brief for the
# retry. That is mechanical work a model repeats differently every run and pays tokens
# for. One script answers each return with the next directive, so the skill only
# dispatches what is printed.
#
# What it does for `critic <hunt id>-<k>`:
#   1. <ws>/verdicts/<hunt id>-<k>.md loses a trailing closing tag (strip-tag.sh).
#   2. A `VERDICT:` line holding one of the four verdicts (VERIFIED, REFUTED,
#      PARTIALLY VERIFIED, INCONCLUSIVE) answers `NEXT: none`.
#   3. A missing file, or one with no such line, the first time: the critic block of
#      the claim once more with `retry` and its worktree suffixed `-retry`, recorded as
#      the ledger line `critic-retried: <hunt id>-<k>`; once that line stands, the
#      miss answers `NEXT: none` and records nothing.
#
# What it does for `hunter <hunt id>`:
#   1. Every <ws>/reports/<hunt id>-<digit>.md and <hunt id>-<digit>.claim.md loses a
#      trailing closing tag (strip-tag.sh). A file of a longer id (`A-x-y-1.md` for
#      `A-x`) is neither stripped nor counted.
#   2. With at least one claim sidecar, one critic block per sidecar, k ascending, the
#      critic id `<hunt id>-<k>`.
#   3. With no sidecar and a report (`<hunt id>-0.md` or a report without sidecar),
#      `NEXT: none`.
#   4. With no report at all: the first time, the hunter block keep-units.sh printed
#      for the hunt, once more with `retry` and its worktree suffixed `-retry`, recorded
#      as the ledger line `retried: <hunt id>`; once that line stands, the miss is
#      recorded as `no-report: <hunt id>` (once) and answered with `NEXT: none`.
#
# The retry brief is rebuilt from the ledger `hunt:` line of the hunt: its unit line
# comes from `## Units` of map.md, its angle from the ledger line, and a wave 2 hunt
# carries its seeds from seeds.md (every `Seed:` line on a unit hunt, the n-th on the
# diff hunt `V-<n>`). A critic block of a wave 2 hunt ends on `Variant: yes`. The unit
# re-hunt `R-U<n>` keep-units.sh --wave prints for a unit whose wave 1 hunt left
# `no-report: U<n>` is a wave 2 unit hunt of its own: its reports are `R-U<n>-<k>`, its
# `retried:` and `no-report:` lines name `R-U<n>`, never the unit's own hunt.
#
# Contract:
#   argv   : <ws> hunter <hunt id>, or <ws> critic <hunt id>-<k> (k one digit). A
#            missing <ws>, a mode other than `hunter` or `critic`, an id that is empty
#            or holds a character outside [A-Za-z0-9._-], a critic id not ending in a
#            hyphen and one digit after a non-empty hunt id, a hunt with no `hunt:`
#            line in the ledger, or a unit hunt whose unit line is not in map.md is a
#            usage error (exit 2).
#   cwd    : irrelevant: every path derives from argv and the files it names, cwd
#            only resolves a relative <ws>.
#   env    : PATH must resolve `node` for strip-tag.sh, which strips nothing
#            without it; nothing else.
#   paths  : the Schema:, Test rules:, Worktree script: and Overlay script: paths are
#            spelled from the path the script was invoked by, through
#            scripts/plugin-root.sh: `C:/...` for a `C:\...` or `C:/...` call,
#            `/c/...` for a `/c/...` call.
#   files  : reads <ws>/run.md (the header lines before its first `## ` heading:
#            Lens:, Lens file:, Scope:), <ws>/ledger.md, <ws>/map.md, <ws>/seeds.md,
#            the lens file, <ws>/reports/ and, for a critic, its verdict file
#            <ws>/verdicts/<hunt id>-<k>.md. Writes: the hunt's report and sidecar files
#            or the verdict file (a trailing closing tag stripped) and <ws>/ledger.md
#            (a line appended, never rewritten).
#   stdout : exactly one answer, in the auditor directive format:
#              per claim NEXT: critic | id: <hunt id>-<k> | background, then the lines
#                Claim:, Run file:, Lens file:, Out:, and for a lens reading
#                Worktree: required Worktree script:, Worktree: and, on the diff
#                scope, Overlay script:, then on the tests lens Test rules:, then for a
#                wave 2 hunt Variant: yes
#              NEXT: critic | id: <hunt id>-<k> | background | retry, then the critic
#                lines above with the Worktree: line suffixed -retry
#              NEXT: hunter | id: <hunt id> | background | retry, then the lines of the
#                hunter block of keep-units.sh
#              NEXT: none
#            Nothing on stdout on a usage error.
#   exit   : 0 in every case but the usage error: 2 with one `error:` line on stderr.
set -u

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

. "$(dirname -- "$0")/../../../scripts/plugin-root.sh"
script_dir=$(cd "$(dirname "$0")" && pwd)
skill_dir=$(plugin_root_of "$0" 1)
plugin_root=$(plugin_root_of "$0" 3)

usage="usage: hunt-return.sh <ws> hunter <hunt id> | <ws> critic <hunt id>-<k>"
ws=${1:-}
mode=${2:-}
id=${3:-}
[ -n "$ws" ] || fail "$usage"
ws=${ws%/}
case $mode in
  hunter | critic) ;;
  *) fail "$usage" ;;
esac
case $id in
  '' | *[!A-Za-z0-9._-]*) fail "bad hunt id: $id" ;;
esac
cid=
if [ "$mode" = critic ]; then
  case $id in
    *-[0-9]) ;;
    *) fail "bad critic id: $id" ;;
  esac
  cid=$id
  id=${cid%-?}
  [ -n "$id" ] || fail "bad critic id: $cid"
fi

run_file=$ws/run.md
map_file=$ws/map.md
ledger=$ws/ledger.md
reports=$ws/reports
[ -f "$run_file" ] || fail "run file not found: $run_file"

. "$script_dir/run-header.sh"

lens=$(header_value "Lens")
lens_file=$(header_value "Lens file")
scope=$(header_value "Scope")

[ -n "$lens" ] || fail "run file has no Lens: line: $run_file"
[ -n "$lens_file" ] || fail "run file has no Lens file: line: $run_file"
[ -n "$scope" ] || fail "run file has no Scope: line: $run_file"

hunt_line=
[ ! -f "$ledger" ] || hunt_line=$(HUNT_ID="$id" awk '
  index($0, "hunt: " ENVIRON["HUNT_ID"] " | ") == 1 { sub(/\r$/, ""); print; exit }
' "$ledger")
[ -n "$hunt_line" ] || fail "hunt not in the ledger: $id"

rest=${hunt_line#*| wave: }
wave=${rest%% *}
rest=${hunt_line#*| unit: }
unit_id=${rest%% *}
rest=${hunt_line#*| angle: }
angle=$rest
[ "$unit_id" != none ] || unit_id=
[ "$angle" != none ] || angle=

in_ledger() {
  [ -f "$ledger" ] && grep -Fxq "$1" "$ledger"
}

worktree=0
grep -q '^Worktree: required' "$lens_file" 2>/dev/null && worktree=1

# critic_block <critic id> [retry] -> the critic block of one claim; on `retry` the
# second attempt, its worktree suffixed -retry.
critic_block() {
  cb_id=$1
  cb_retry=${2:-}
  cb_tail=
  cb_suffix=
  if [ "$cb_retry" = retry ]; then
    cb_tail=' | retry'
    cb_suffix=-retry
  fi
  printf 'NEXT: critic | id: %s | background%s\n' "$cb_id" "$cb_tail"
  printf 'Claim: %s/%s.claim.md\n' "$reports" "$cb_id"
  printf 'Run file: %s\n' "$run_file"
  printf 'Lens file: %s\n' "$lens_file"
  printf 'Out: %s/verdicts/%s.md\n' "$ws" "$cb_id"
  if [ "$worktree" -eq 1 ]; then
    printf 'Worktree script: %s/scripts/worktree.sh\n' "$skill_dir"
    printf 'Worktree: %s/worktrees/critic-%s%s\n' "$ws" "$cb_id" "$cb_suffix"
    if [ "$scope" = diff ]; then
      printf 'Overlay script: %s/scripts/diff-overlay.sh\n' "$skill_dir"
    fi
  fi
  if [ "$lens" = tests ]; then
    printf 'Test rules: %s/references/test-strategy.md\n' "$plugin_root"
  fi
  if [ "$wave" = 2 ]; then
    printf 'Variant: yes\n'
  fi
}

# has_verdict <file> -> success when the file holds a `VERDICT: <verdict>` line with
# one of the four verdicts of the critic verdict schema.
has_verdict() {
  [ -f "$1" ] && awk '
    { sub(/\r$/, "") }
    /^VERDICT: (VERIFIED|REFUTED|PARTIALLY VERIFIED|INCONCLUSIVE)[ \t]*$/ { found = 1; exit }
    END { exit !found }
  ' "$1"
}

# Critic return: strip the verdict file, then answer with the one retry or `NEXT: none`.
if [ "$mode" = critic ]; then
  verdict_file=$ws/verdicts/$cid.md
  sh "$script_dir/strip-tag.sh" "$verdict_file"
  if has_verdict "$verdict_file" || in_ledger "critic-retried: $cid"; then
    printf 'NEXT: none\n'
    exit 0
  fi
  printf 'critic-retried: %s\n' "$cid" >> "$ledger"
  critic_block "$cid" retry
  exit 0
fi

# 1. Strip the closing tag of each file of this hunt and no other.
set --
for f in "$reports/$id"-[0-9].md "$reports/$id"-[0-9].claim.md; do
  [ -f "$f" ] && set -- "$@" "$f"
done
[ "$#" -eq 0 ] || sh "$script_dir/strip-tag.sh" "$@"

# 2. One critic block per claim sidecar, k ascending.
claims=0
for k in 0 1 2 3 4 5 6 7 8 9; do
  [ -f "$reports/$id-$k.claim.md" ] || continue
  claims=$((claims + 1))
  critic_block "$id-$k"
done
[ "$claims" -eq 0 ] || exit 0

# 3. A report with no sidecar: nothing to dispatch.
for f in "$reports/$id"-[0-9].md; do
  if [ -f "$f" ]; then
    printf 'NEXT: none\n'
    exit 0
  fi
done

# 4. No report at all: the one retry, then the recorded miss.
if in_ledger "retried: $id"; then
  in_ledger "no-report: $id" || printf 'no-report: %s\n' "$id" >> "$ledger"
  printf 'NEXT: none\n'
  exit 0
fi
if in_ledger "no-report: $id"; then
  printf 'NEXT: none\n'
  exit 0
fi

unit_line=
if [ -n "$unit_id" ]; then
  unit_line=$(UNIT_ID="$unit_id" awk '
    /^## / { insec = ($0 ~ /^## Units[ \t\r]*$/); next }
    insec && /^- U[0-9]+ \|/ && $2 == ENVIRON["UNIT_ID"] { print; exit }
  ' "$map_file" 2>/dev/null)
  [ -n "$unit_line" ] || fail "unit not in $map_file: $unit_id"
fi

seed_lines=
if [ "$wave" = 2 ] && [ -f "$ws/seeds.md" ]; then
  if [ -n "$unit_id" ]; then
    seed_lines=$(awk '/^Seed: / { sub(/\r$/, ""); print }' "$ws/seeds.md")
  else
    n=${id#V-}
    seed_lines=$(SEED_N="$n" awk '
      /^Seed: / { c++; if (c == ENVIRON["SEED_N"] + 0) { sub(/\r$/, ""); print; exit } }
    ' "$ws/seeds.md")
  fi
fi

printf 'retried: %s\n' "$id" >> "$ledger"
printf 'NEXT: hunter | id: %s | background | retry\n' "$id"
printf 'Run file: %s\n' "$run_file"
printf 'Lens file: %s\n' "$lens_file"
printf 'Schema: %s/references/synthesis.md\n' "$skill_dir"
printf 'Test rules: %s/references/test-strategy.md\n' "$plugin_root"
printf 'Hunt: %s\n' "$id"
[ -z "$unit_line" ] || printf 'Unit: %s\n' "$unit_line"
[ -z "$angle" ] || printf 'Angle: %s\n' "$angle"
[ -z "$seed_lines" ] || printf '%s\n' "$seed_lines"
printf 'Reports: %s/reports/%s\n' "$ws" "$id"
if [ "$worktree" -eq 1 ]; then
  printf 'Worktree script: %s/scripts/worktree.sh\n' "$skill_dir"
  printf 'Worktree: %s/worktrees/%s-retry\n' "$ws" "$id"
  if [ "$scope" = diff ]; then
    printf 'Overlay script: %s/scripts/diff-overlay.sh\n' "$skill_dir"
  fi
fi
exit 0

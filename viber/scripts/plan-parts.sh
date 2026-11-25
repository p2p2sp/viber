#!/usr/bin/env bash
#
# plan-parts.sh - the checksum of the part of a plan one plan reviewer gates.
# A library: sourced by skills/planner/scripts/review-round.sh and
# hooks/scripts/plan-gate.sh, never invoked, so it carries no `set` line and
# mode 100644 in the index.
#
# It exists because both scripts ask the same question - is this the text that
# reviewer passed? - and two copies of the cut would drift: the round script
# would then send a reviewer a `sum:` the gate never finds in the plan.
#
# Contract:
#   plan_part_sum <plan file> <agent> [<tasks slice>]
#     argv   : the plan file; the reviewer, as `viber:<name>` or bare `<name>`;
#              for planner-task-review its slice `T<a>-T<b>`, read as the a-th to
#              the b-th task block in file order; no slice, or an empty one,
#              is no task block.
#     cwd    : irrelevant unless the plan path is relative.
#     env    : none.
#     reads  : the plan file.
#     stdout : `<crc>-<bytes>` of the part, as cksum prints them, with no line
#              feed. The part of
#                planner-review        the whole plan
#                planner-spec-review   every line outside the "## Tasks" section
#                planner-graph-review  every line from "## Tasks" on
#                planner-task-review   the task blocks of its slice
#              A carriage return at a line end is dropped first; a "## " line
#              inside a task block opens no section. A plan that cannot be read
#              gives the sum of the empty text.
#     exit   : that of the last command; the callers read stdout alone.

plan_part_sum() {
  local kind="all" lo=0 hi=0 sum
  case "$2" in
    *planner-spec-review) kind="spec" ;;
    *planner-graph-review) kind="graph" ;;
    *planner-task-review)
      kind="task"
      lo="${3-}"
      hi="${lo##*-T}"
      lo="${lo#T}"
      lo="${lo%%-*}"
      ;;
  esac
  sum="$(
    PART_KIND="$kind" PART_LO="$lo" PART_HI="$hi" awk '
      BEGIN { kind = ENVIRON["PART_KIND"]; lo = ENVIRON["PART_LO"] + 0; hi = ENVIRON["PART_HI"] + 0; zone = "spec" }
      { sub(/\r$/, "") }
      /^[[:space:]]*<!-- TASK -->[[:space:]]*$/ { inblock = 1; n++ }
      !inblock && /^## / {
        if ($0 ~ /^## Tasks[[:space:]]*$/) zone = "tasks"
        else if (zone != "spec") zone = "after"
      }
      {
        if (kind == "all") print
        else if (kind == "spec") { if (zone != "tasks") print }
        else if (kind == "graph") { if (zone != "spec") print }
        else if (inblock && n >= lo && n <= hi) print
      }
      /^[[:space:]]*<!-- \/TASK -->[[:space:]]*$/ { inblock = 0 }
    ' "$1" 2>/dev/null | cksum
  )"
  printf '%s' "${sum// /-}"
}

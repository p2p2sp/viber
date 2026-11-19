#!/usr/bin/env bash
#
# review-round.sh - keeps the bookkeeping of the planner's review rounds and
# prints the dispatch block of every member of a round.
#
# It exists because the planner applied the round rules by hand from prose: which
# reviewers a round dispatches, which lines each one gets, when the previous
# findings join the prompt, which round a plan written after a fix is in. One
# wrong application sent a reviewer the wrong prompt or counted the wrong round.
# This script keeps the round between calls and prints the blocks, so the model
# only runs it and sends what it prints.
#
# Usage:
#   review-round.sh <plan> start [--input <summary file>] [--fresh]
#   review-round.sh <plan> returned <k>=<PASS|FAIL|DENIED|none> [<k>=<word>]...
#   review-round.sh <plan> retry-denied
#   review-round.sh <plan> override <k>[,<k>]
#   review-round.sh <plan> stop
#
# Directive format. An answer is one or more blocks, one per member, each opening
# on a directive line and followed by body lines "<label>: <value>" up to the
# next directive line:
#   NEXT: review | member: <k> | agent: viber:<name> | round: <r>[ | add: input][ | add: answered][ | add: previous]
#   NEXT: redispatch | members: <k>[,<k>]
#   NEXT: fix | members: <k>[,<k>][ | no-verdict: <k>[,<k>]]
#   NEXT: exit-plan
#   ASK: permission added -> retry-denied | stop -> stop
#   STOP: the plan stays unreviewed - no hand-off
#
# Block of a member, in dispatch: line order, members numbered from 1:
#   NEXT: review | member: <k> | agent: viber:<name> | round: <r>[ | add: input][ | add: answered][ | add: previous]
#   plan: <plan>
#   refs: <plugin root>/references
#   memory: <config.sh build.memory value>   planner-review, planner-graph-review, planner-task-review
#   input: <summary file>                    planner-review, planner-spec-review, with --input
#   tasks: T<a>-T<b>                         planner-task-review, its dispatch: slice
# The prompt of a dispatch is the block lines below its NEXT: line, then the text
# of each add: field; the NEXT: line itself is never sent. An add: field names a
# text the model appends from what it holds:
#   add: input     planner-review, planner-spec-review, without --input: append
#                  "input:" and the confirmed summary or fixer diagnosis verbatim
#   add: answered  planner-review, planner-spec-review: append one
#                  "Answered: <decision> -> <option>" per user answer, none when
#                  none
#   add: previous  round 2 on: append a "previous findings:" line, then every
#                  member's previous findings verbatim and one "fix: <line>" per
#                  fix applied
#
# Events:
#   start      runs <plugin root>/scripts/plan-index.sh "<plan>" and opens a round
#              on its dispatch: lines, one member each: planner-review for a plan
#              of 12 tasks or fewer, else the spec, graph and task reviewers.
#              Round 1, with no add: previous, on --fresh, with no state or with
#              the state of another plan path; round r+1, with add: previous,
#              when the last answer was NEXT: fix; any other state is refused.
#              --input puts the summary file path on the input: line and drops
#              add: input.
#   returned   (an awaited member - one of the last dispatch still without a
#              verdict - not named counts as none; a member already holding a
#              verdict keeps it)
#                NEXT: redispatch | members: <k>[,<k>]   then those blocks again,
#                    same round: a member at its first none of the round (a
#                    second none of a member counts as FAIL, "no verdict")
#              once every member holds a verdict, the first that applies:
#                ASK: permission added -> retry-denied | stop -> stop   any DENIED
#                NEXT: fix | members: <k>[,<k>][ | no-verdict: <k>[,<k>]]   any FAIL
#                NEXT: exit-plan                                        every member PASS
#   retry-denied   NEXT: redispatch | members: <the DENIED ones>, then their blocks
#   override <k>[,<k>]   only after NEXT: exit-plan: those members count as FAIL,
#              NEXT: fix | members: <k>[,<k>]
#   stop       STOP: the plan stays unreviewed - no hand-off
#
# Contract:
#   argv   : <plan> <event> and the event's own arguments, as in Usage. The plan
#            path is read as plan-index.sh reads it: relative to the cwd.
#   cwd    : any directory inside the repository; a relative <plan> resolves
#            against it. The script resolves the repository root itself for its
#            state file.
#   env    : none.
#   reads  : <plugin root>/scripts/plan-index.sh and config.sh (build.memory),
#            where <plugin root> is three directories above this script; the
#            state file.
#   writes : the state file <repository root>/.temp/viber/planner/review-round,
#            for one plan path: the plan, the round number, the last answer
#            (review, redispatch, fix, exit-plan, ask or stop), the input path,
#            the memory value, whether the round carries add: previous, and per
#            member its agent, tasks slice, verdict and none count. A start
#            replaces it; an error leaves it as it was.
#   stdout : the blocks above, nothing on an error.
#   stderr : on exit 2, one "error: <message>" line; a start on a plan
#            plan-index.sh refuses prints "error: plan-index.sh refused the plan"
#            and then the stderr lines of plan-index.sh.
#   exit   : 0; 2 on misuse (an unknown event, an unknown option, an argument
#            missing, an unknown member, a verdict word other than PASS, FAIL,
#            DENIED or none, returned before start or with no member awaiting a
#            verdict, override after another answer), a start refused by
#            plan-index.sh or printing no dispatch: line, a start on a round not
#            closed on NEXT: fix without --fresh, a config.sh exiting non-zero,
#            or no repository.
#
set -u

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

here="$(cd "$(dirname "$0")" 2>/dev/null && pwd)" || fail "cannot resolve the script directory"
plugin_root="$(cd "$here/../../.." 2>/dev/null && pwd)" || fail "cannot resolve the plugin root"

[ "$#" -ge 2 ] || fail "usage: review-round.sh <plan> <start|returned|retry-denied|override|stop> [args]"

plan="$1"
event="$2"
shift 2
[ -n "$plan" ] || fail "empty plan path"

# Appends one line to the answer being built; the answer is printed whole only
# when every step before it held, so an error leaves stdout empty.
out=""
add_line() {
  out="${out}$1"$'\n'
}

# Appends the block of member $1 (agent $2, tasks slice $3) of round $4.
emit_block() {
  local k="$1" agent="$2" tasks="$3" round="$4" adds=""
  case "$agent" in
    viber:planner-review | viber:planner-spec-review)
      if [ -z "$input" ]; then
        adds="$adds | add: input"
      fi
      adds="$adds | add: answered"
      ;;
  esac
  if [ "$previous" = "yes" ]; then
    adds="$adds | add: previous"
  fi
  add_line "NEXT: review | member: $k | agent: $agent | round: $round$adds"
  add_line "plan: $plan"
  add_line "refs: $plugin_root/references"
  case "$agent" in
    viber:planner-review | viber:planner-graph-review | viber:planner-task-review)
      add_line "memory: $memory"
      ;;
  esac
  case "$agent" in
    viber:planner-review | viber:planner-spec-review)
      if [ -n "$input" ]; then
        add_line "input: $input"
      fi
      ;;
  esac
  if [ "$agent" = "viber:planner-task-review" ] && [ -n "$tasks" ]; then
    add_line "tasks: $tasks"
  fi
}

do_start() {
  local fresh=0
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --fresh)
        fresh=1
        shift
        ;;
      --input)
        [ "$#" -ge 2 ] || fail "--input needs a summary file path"
        case "$2" in
          "" | --*) fail "--input needs a summary file path" ;;
        esac
        input="$2"
        shift 2
        ;;
      *)
        fail "start: unknown argument: $1"
        ;;
    esac
  done

  root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [ -n "$root" ] || fail "not inside a git repository"
  statedir="$root/.temp/viber/planner"
  state="$statedir/review-round"

  mkdir -p "$statedir" || fail "cannot create $statedir"
  errfile="$statedir/review-round.err.$$"
  idx="$(bash "$plugin_root/scripts/plan-index.sh" "$plan" 2>"$errfile")"
  idx_status=$?
  refusal="$(cat "$errfile" 2>/dev/null || true)"
  rm -f "$errfile"
  if [ "$idx_status" -ne 0 ]; then
    printf 'error: plan-index.sh refused the plan\n' >&2
    if [ -n "$refusal" ]; then
      printf '%s\n' "$refusal" >&2
    fi
    exit 2
  fi

  count=0
  agents=()
  slices=()
  while IFS= read -r line; do
    line="${line%$'\r'}"
    case "$line" in
      "dispatch: "*)
        rest="${line#dispatch: }"
        agent="${rest%% | *}"
        slice=""
        case "$rest" in
          *" | tasks: "*) slice="${rest#* | tasks: }" ;;
        esac
        agents[$count]="$agent"
        slices[$count]="$slice"
        count=$((count + 1))
        ;;
    esac
  done < <(printf '%s\n' "$idx")
  [ "$count" -gt 0 ] || fail "plan-index.sh printed no dispatch: line - the plan is not a fresh one"

  st_plan=""
  st_round=""
  st_answer=""
  if [ -f "$state" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%$'\r'}"
      case "$line" in
        "plan: "*) st_plan="${line#plan: }" ;;
        "round: "*) st_round="${line#round: }" ;;
        "answer: "*) st_answer="${line#answer: }" ;;
      esac
    done < "$state"
  fi
  case "$st_round" in
    "" | *[!0-9]*) st_plan="" ;;
  esac

  if [ "$fresh" -eq 1 ] || [ -z "$st_plan" ] || [ "$st_plan" != "$plan" ]; then
    round=1
    previous="no"
  elif [ "$st_answer" = "fix" ]; then
    round=$((st_round + 1))
    previous="yes"
  else
    fail "round $st_round is not closed on NEXT: fix - run start --fresh"
  fi

  cfg="$(bash "$plugin_root/scripts/config.sh" 2>/dev/null)" || fail "config.sh failed - build.memory unknown"
  while IFS= read -r line; do
    line="${line%$'\r'}"
    case "$line" in
      "build.memory: "*) memory="${line#build.memory: }" ;;
    esac
  done < <(printf '%s\n' "$cfg")

  k=1
  while [ "$k" -le "$count" ]; do
    emit_block "$k" "${agents[$((k - 1))]}" "${slices[$((k - 1))]}" "$round"
    k=$((k + 1))
  done

  {
    printf 'plan: %s\n' "$plan"
    printf 'round: %s\n' "$round"
    printf 'answer: review\n'
    printf 'input: %s\n' "$input"
    printf 'memory: %s\n' "$memory"
    printf 'previous: %s\n' "$previous"
    k=1
    while [ "$k" -le "$count" ]; do
      printf 'member: %s | agent: %s | tasks: %s | verdict: - | none: 0\n' "$k" "${agents[$((k - 1))]}" "${slices[$((k - 1))]}"
      k=$((k + 1))
    done
  } > "$state" || fail "cannot write $state"
}

input=""
previous="no"
memory="false"

case "$event" in
  start) do_start "$@" ;;
  *) fail "unknown event: $event" ;;
esac

printf '%s' "$out"
exit 0

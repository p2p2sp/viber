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
#              Round r+1 prints the blocks of the members to review again only:
#              a member without a PASS, and a member whose part of the plan
#              differs from the part it passed on. The other members keep their
#              PASS and get no block. The whole set is printed when the
#              dispatch: lines differ from the members of the state, or after an
#              override. The part of a member, compared by cksum:
#                planner-review        the whole plan
#                planner-spec-review   every line outside the "## Tasks" section
#                planner-graph-review  every line from "## Tasks" on
#                planner-task-review   the task blocks of its tasks: slice
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
#              NEXT: fix | members: <k>[,<k>]; the start after it prints the
#              whole set (a plan write with every member at PASS voids every
#              verdict for plan-gate.sh)
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
#            where <plugin root> is three directories above this script, spelled
#            as plugin_root_of (scripts/plugin-root.sh) reads the invoked path:
#            C:/... for a C:\ or C:/ invocation, /c/... for a /c/ one; the state
#            file.
#   writes : the state file <repository root>/.temp/viber/planner/review-round,
#            for one plan path: the plan, the round number, the last answer
#            (review, redispatch, fix, exit-plan, ask or stop), the input path,
#            the memory value, whether the round carries add: previous, the
#            members awaiting a verdict (all of them after a start, the
#            redispatched ones after a redispatch, none once the round is
#            answered) and per member its agent, tasks slice, verdict, none
#            count and the cksum of its part of the plan at its last dispatch
#            (empty after an override). A start replaces it, a returned updates
#            it; an error leaves it as it was.
#   stdout : the blocks above, nothing on an error.
#   stderr : on exit 2, one "error: <message>" line; a start on a plan
#            plan-index.sh refuses prints "error: plan-index.sh refused the plan"
#            and then the stderr lines of plan-index.sh.
#   exit   : 0; 2 on misuse (an unknown event, an unknown option, an argument
#            missing, an unknown member, a verdict word other than PASS, FAIL,
#            DENIED or none, an event before start or with no member awaiting a
#            verdict, retry-denied after another answer than ASK:, override after
#            another answer than NEXT: exit-plan), a start refused by
#            plan-index.sh or printing no dispatch: line, a start on a round not
#            closed on NEXT: fix without --fresh, a config.sh exiting non-zero,
#            or no repository.
#
set -u

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

. "$(dirname -- "$0")/../../../scripts/plugin-root.sh"
plugin_root="$(plugin_root_of "$0" 3)"

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

# Prints the cksum of the part of the plan member agent $1 (tasks slice $2)
# reviews, as "<crc>-<bytes>". The task blocks are counted in file order, the
# numbering plan-index.sh enforces; a "## " line inside a task block opens no
# section.
part_sum() {
  local kind="all" lo=0 hi=0 sum
  case "$1" in
    viber:planner-spec-review) kind="spec" ;;
    viber:planner-graph-review) kind="graph" ;;
    viber:planner-task-review)
      kind="task"
      lo="${2#T}"
      lo="${lo%%-*}"
      hi="${2##*-T}"
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
    ' "$plan" 2>/dev/null | cksum
  )"
  printf '%s' "${sum// /-}"
}

# Sets root, statedir and state: the state file of the repository the cwd is in.
locate_state() {
  root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [ -n "$root" ] || fail "not inside a git repository"
  statedir="$root/.temp/viber/planner"
  state="$statedir/review-round"
}

# Reads the state file into st_plan, st_round, st_answer, st_input, st_memory,
# st_previous, st_awaiting and, per member, st_agents, st_slices, st_verdicts,
# st_nones and st_sums (indexed from 0), st_count of them. No file, or a round
# that is not a number, leaves st_plan empty: no state.
load_state() {
  st_plan=""
  st_round=""
  st_answer=""
  st_input=""
  st_memory="false"
  st_previous="no"
  st_awaiting=""
  st_count=0
  st_agents=()
  st_slices=()
  st_verdicts=()
  st_nones=()
  st_sums=()
  if [ -f "$state" ]; then
    local line rest mk v
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%$'\r'}"
      case "$line" in
        "plan: "*) st_plan="${line#plan: }" ;;
        "round: "*) st_round="${line#round: }" ;;
        "answer: "*) st_answer="${line#answer: }" ;;
        "input: "*) st_input="${line#input: }" ;;
        "memory: "*) st_memory="${line#memory: }" ;;
        "previous: "*) st_previous="${line#previous: }" ;;
        "awaiting: "*) st_awaiting="${line#awaiting: }" ;;
        "member: "*)
          rest="${line#member: }"
          mk="${rest%% | *}"
          mk=$((mk - 1))
          rest="${rest#* | }"
          v="${rest%% | *}"
          st_agents[$mk]="${v#agent: }"
          rest="${rest#* | }"
          v="${rest%% | *}"
          st_slices[$mk]="${v#tasks: }"
          rest="${rest#* | }"
          v="${rest%% | *}"
          st_verdicts[$mk]="${v#verdict: }"
          rest="${rest#* | }"
          v="${rest%% | *}"
          st_nones[$mk]="${v#none: }"
          case "$rest" in
            *" | sum: "*) st_sums[$mk]="${rest#* | sum: }" ;;
            *) st_sums[$mk]="" ;;
          esac
          st_count=$((st_count + 1))
          ;;
      esac
    done < "$state"
  fi
  case "$st_round" in
    "" | *[!0-9]*) st_plan="" ;;
  esac
}

# Writes the state file from plan, round, answer, input, memory, previous,
# awaiting and the count members of agents, slices, verdicts, nones and sums.
write_state() {
  local k=1
  {
    printf 'plan: %s\n' "$plan"
    printf 'round: %s\n' "$round"
    printf 'answer: %s\n' "$answer"
    printf 'input: %s\n' "$input"
    printf 'memory: %s\n' "$memory"
    printf 'previous: %s\n' "$previous"
    printf 'awaiting: %s\n' "$awaiting"
    while [ "$k" -le "$count" ]; do
      printf 'member: %s | agent: %s | tasks: %s | verdict: %s | none: %s | sum: %s\n' "$k" "${agents[$((k - 1))]}" "${slices[$((k - 1))]}" "${verdicts[$((k - 1))]}" "${nones[$((k - 1))]}" "${sums[$((k - 1))]-}"
      k=$((k + 1))
    done
  } > "$state" || fail "cannot write $state"
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

  locate_state

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

  load_state

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

  # A round after a fix keeps the PASS of a member whose part of the plan is the
  # part it passed on, as long as the members are the ones of the state.
  keep=0
  if [ "$previous" = "yes" ] && [ "$st_count" -eq "$count" ]; then
    keep=1
    k=0
    while [ "$k" -lt "$count" ]; do
      if [ "${st_agents[$k]-}" != "${agents[$k]}" ] || [ "${st_slices[$k]-}" != "${slices[$k]}" ]; then
        keep=0
      fi
      k=$((k + 1))
    done
  fi

  awaiting=""
  verdicts=()
  nones=()
  sums=()
  k=1
  while [ "$k" -le "$count" ]; do
    i=$((k - 1))
    sum="$(part_sum "${agents[$i]}" "${slices[$i]}")"
    nones[$i]=0
    sums[$i]="$sum"
    if [ "$keep" -eq 1 ] && [ -n "$sum" ] && [ "${st_verdicts[$i]-}" = "PASS" ] && [ "${st_sums[$i]-}" = "$sum" ]; then
      verdicts[$i]="PASS"
    else
      emit_block "$k" "${agents[$i]}" "${slices[$i]}" "$round"
      verdicts[$i]="-"
      awaiting="${awaiting:+$awaiting,}$k"
    fi
    k=$((k + 1))
  done

  answer="review"
  write_state
}

# Loads the state of the round open for the plan; no state, or the state of another
# plan path, is a misuse of $event.
open_round() {
  locate_state
  load_state
  if [ -z "$st_plan" ] || [ "$st_plan" != "$plan" ]; then
    fail "$event: no round is open for this plan - run start first"
  fi
}

# Copies the loaded state into the variables write_state and emit_block read.
adopt_state() {
  round="$st_round"
  input="$st_input"
  memory="$st_memory"
  previous="$st_previous"
  count="$st_count"
  agents=(${st_agents[@]+"${st_agents[@]}"})
  slices=(${st_slices[@]+"${st_slices[@]}"})
  verdicts=(${st_verdicts[@]+"${st_verdicts[@]}"})
  nones=(${st_nones[@]+"${st_nones[@]}"})
  sums=(${st_sums[@]+"${st_sums[@]}"})
}

# Appends the blocks of the members named in the comma list $1, in member order.
emit_members() {
  local k=1
  while [ "$k" -le "$count" ]; do
    case ",$1," in
      *",$k,"*) emit_block "$k" "${agents[$((k - 1))]}" "${slices[$((k - 1))]}" "$round" ;;
    esac
    k=$((k + 1))
  done
}

do_returned() {
  [ "$#" -ge 1 ] || fail "returned: name at least one <k>=<PASS|FAIL|DENIED|none>"

  open_round
  [ -n "$st_awaiting" ] || fail "returned: no member is awaiting a verdict"

  local named=() arg k w
  for arg in "$@"; do
    case "$arg" in
      *=*) ;;
      *) fail "returned: expected <k>=<word>, got: $arg" ;;
    esac
    k="${arg%%=*}"
    w="${arg#*=}"
    case "$k" in
      "" | *[!0-9]*) fail "returned: member $k is not in the round" ;;
    esac
    k=$((10#$k))
    if [ "$k" -lt 1 ] || [ "$k" -gt "$st_count" ]; then
      fail "returned: member $k is not in the round"
    fi
    case "$w" in
      PASS | FAIL | DENIED | none) ;;
      *) fail "returned: unknown verdict word: $w" ;;
    esac
    [ -z "${named[$k]-}" ] || fail "returned: member $k is named twice"
    named[$k]="$w"
  done

  adopt_state

  local redo="" i
  k=1
  while [ "$k" -le "$count" ]; do
    i=$((k - 1))
    case ",$st_awaiting," in
      *",$k,"*)
        w="${named[$k]-none}"
        if [ "$w" = "none" ]; then
          nones[$i]=$((${nones[$i]} + 1))
          if [ "${nones[$i]}" -eq 1 ]; then
            redo="${redo:+$redo,}$k"
          else
            verdicts[$i]="FAIL"
          fi
        else
          verdicts[$i]="$w"
        fi
        ;;
    esac
    k=$((k + 1))
  done

  if [ -n "$redo" ]; then
    awaiting="$redo"
    answer="redispatch"
    add_line "NEXT: redispatch | members: $redo"
    emit_members "$redo"
  else
    awaiting=""
    local denied=0 failed="" silent=""
    k=1
    while [ "$k" -le "$count" ]; do
      i=$((k - 1))
      case "${verdicts[$i]}" in
        DENIED) denied=1 ;;
        FAIL)
          failed="${failed:+$failed,}$k"
          if [ "${nones[$i]}" -ge 2 ]; then
            silent="${silent:+$silent,}$k"
          fi
          ;;
      esac
      k=$((k + 1))
    done
    if [ "$denied" -eq 1 ]; then
      answer="ask"
      add_line "ASK: permission added -> retry-denied | stop -> stop"
    elif [ -n "$failed" ]; then
      answer="fix"
      add_line "NEXT: fix | members: $failed${silent:+ | no-verdict: $silent}"
    else
      answer="exit-plan"
      add_line "NEXT: exit-plan"
    fi
  fi

  write_state
}

do_retry_denied() {
  [ "$#" -eq 0 ] || fail "retry-denied: unexpected argument: $1"

  open_round
  [ "$st_answer" = "ask" ] || fail "retry-denied: only after ASK: permission added"
  adopt_state

  local redo="" k=1 i
  while [ "$k" -le "$count" ]; do
    i=$((k - 1))
    if [ "${verdicts[$i]}" = "DENIED" ]; then
      verdicts[$i]="-"
      redo="${redo:+$redo,}$k"
    fi
    k=$((k + 1))
  done

  awaiting="$redo"
  answer="redispatch"
  add_line "NEXT: redispatch | members: $redo"
  emit_members "$redo"
  write_state
}

do_override() {
  [ "$#" -eq 1 ] || fail "override: name the members as <k>[,<k>]"

  open_round
  [ "$st_answer" = "exit-plan" ] || fail "override: only after NEXT: exit-plan"
  adopt_state

  local rest="$1," part k named=""
  while [ -n "$rest" ]; do
    part="${rest%%,*}"
    rest="${rest#*,}"
    case "$part" in
      "") fail "override: expected <k>[,<k>], got: $1" ;;
      *[!0-9]*) fail "override: member $part is not in the round" ;;
    esac
    k=$((10#$part))
    if [ "$k" -lt 1 ] || [ "$k" -gt "$count" ]; then
      fail "override: member $k is not in the round"
    fi
    case ",$named," in
      *",$k,"*) fail "override: member $k is named twice" ;;
    esac
    named="${named:+$named,}$k"
  done

  # Every sum is emptied: the fix of an override is a plan write with every member
  # at PASS, which voids every verdict for plan-gate.sh, so the next start must
  # print the whole set.
  local overridden="" i
  k=1
  while [ "$k" -le "$count" ]; do
    i=$((k - 1))
    sums[$i]=""
    case ",$named," in
      *",$k,"*)
        verdicts[$i]="FAIL"
        overridden="${overridden:+$overridden,}$k"
        ;;
    esac
    k=$((k + 1))
  done

  awaiting=""
  answer="fix"
  add_line "NEXT: fix | members: $overridden"
  write_state
}

do_stop() {
  [ "$#" -eq 0 ] || fail "stop: unexpected argument: $1"

  open_round
  adopt_state

  awaiting=""
  answer="stop"
  add_line "STOP: the plan stays unreviewed - no hand-off"
  write_state
}

input=""
previous="no"
memory="false"

case "$event" in
  start) do_start "$@" ;;
  returned) do_returned "$@" ;;
  retry-denied) do_retry_denied "$@" ;;
  override) do_override "$@" ;;
  stop) do_stop "$@" ;;
  *) fail "unknown event: $event" ;;
esac

printf '%s' "$out"
exit 0

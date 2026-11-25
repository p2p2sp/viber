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
# only runs it and sends what it prints. The findings stay in files: a reviewer
# writes them, the script copies them beside its state and names them to the
# next agent, so the session relays paths and verdict words, never the text.
#
# Usage:
#   review-round.sh <plan> start [--input <summary file>] [--fresh] [--answered] [--skeleton]
#   review-round.sh <plan> returned <k>=<PASS|FAIL|DENIED|none> [<k>=<word>]... [--out <k>=<file>]...
#   review-round.sh <plan> retry-denied
#   review-round.sh <plan> stop
#
# Directive format. An answer is the report lines of a returned event, then one
# or more blocks, each opening on a directive line and followed by body lines
# "<label>: <value>" up to the next directive line:
#   member: <k> | viber:<name> | <PASS|FAIL|DENIED> | blocking: <n> | minor: <m>[ | <findings file>]
#   NEXT: review | member: <k> | agent: viber:<name> | round: <r>[ | add: input][ | add: answered]
#   NEXT: redispatch | members: <k>[,<k>]
#   NEXT: fix | members: <k>[,<k>][ | no-verdict: <k>[,<k>]][ | behaviour: <k>[,<k>]]
#   NEXT: dispatch | agent: viber:plan-fixer ...      the block plan-build.sh fix prints,
#                                                     right after a NEXT: fix with a
#                                                     findings file to name; a NEXT: fix
#                                                     with none stands alone
#   NEXT: detail
#   NEXT: exit-plan
#   MINOR: viber:<name>: <a Minor finding ending in (inferred), (untouched) or (behaviour)>
#   ASK: retry -> retry-denied | stop -> stop
#   STOP: the plan stays unreviewed - no hand-off
#
# Block of a member, in dispatch: line order, members numbered from 1:
#   NEXT: review | member: <k> | agent: viber:<name> | round: <r>[ | add: input][ | add: answered]
#   plan: <plan>
#   refs: <plugin root>/references
#   memory: <config.sh build.memory value>   planner-review, planner-graph-review, planner-task-review
#   input: <summary file>                    planner-review, planner-spec-review, with --input
#   tasks: T<a>-T<b>                         planner-task-review, its dispatch: slice
#   sum: <crc>-<bytes>                       the cksum of the member's part of the plan
#                                            (scripts/plan-parts.sh), which
#                                            plan-gate.sh compares with the plan
#   brief: <dir>/slice-T<a>-T<b>.md          planner-task-review: the brief of its slice,
#                                            which start writes; none without node
#   reach: <dir>/reach-paths.md              every other member, and a task reviewer
#                                            with no brief, when plan-build.sh wrote it
#   candidates: <reach candidates file>      when the plan-build state names one
#   previous: <dir>/findings-<k>.md          a round carrying the previous findings, when
#                                            the member has a findings file
#   fixes: <dir>/fixes.md                    the same round, when plan-build.sh apply wrote it
#   out: <dir>/review-<k>.md                 where the member writes its findings when plan
#                                            mode names it no file of its own
# <dir> is <repository root>/.temp/viber/planner. The prompt of a dispatch is the
# block lines below its NEXT: line, then the text of each add: field; the NEXT:
# line itself is never sent. An add: field names a text the model appends from
# what it holds:
#   add: input     planner-review, planner-spec-review, without --input: append
#                  "input:" and the confirmed summary or fixer diagnosis verbatim
#   add: answered  planner-review, planner-spec-review: append one
#                  "Answered: <decision> -> <option>" per user answer, none when
#                  none
#
# Events:
#   start      runs <plugin root>/scripts/plan-index.sh "<plan>" and opens a round
#              on its dispatch: lines, one member each: planner-review for a plan
#              of 12 tasks or fewer, else the spec, graph and task reviewers.
#              Round 1, carrying no previous findings, on --fresh, with no state
#              or with the state of another plan path; it removes the
#              findings-*.md and review-*.md files an earlier round left in
#              <dir>. Round r+1 when the last answer was NEXT: fix (carrying the
#              previous findings), NEXT: detail (carrying none: the tasks were
#              written since) or NEXT: exit-plan (a change made after the review,
#              carrying them); any other state is refused.
#              Round r+1 prints the blocks of the members to review again only:
#              a member without a PASS, and a member whose part of the plan
#              differs from the part it passed on. The other members keep their
#              PASS and get no block. The whole set is printed when the
#              dispatch: lines differ from the members of the state. --answered
#              (after a user's answer to a finding) also prints the members that
#              read the Answered: lines, planner-review and planner-spec-review,
#              whatever they hold. A round after a member returned no verdict at
#              all (its FAIL is a second none) carries no previous findings: that
#              member reviewed nothing, and a reviewer given the previous findings
#              checks the fixes alone. A round with no member to send prints
#              NEXT: exit-plan at once.
#              --skeleton, on round 1, opens the skeleton stage: the plan holds
#              tasks still to be written, so only planner-spec-review and
#              planner-graph-review are sent; the task reviewers and
#              planner-review wait. The stage lasts until NEXT: detail; a plan
#              with nothing to send in it (12 tasks or fewer) gets NEXT: detail
#              at once.
#              Outside the skeleton stage a round holding a task reviewer first
#              runs plan-build.sh slices "<plan>" beside this script, its output
#              and exit unread: it writes the brief of every slice again from
#              the plan as it stands, cut as the dispatch: lines are, so a plan
#              written whole has briefs too. A task reviewer whose brief is not
#              there after it (no node) gets the reach: line the other members
#              get, or neither line.
#              --input puts the summary file path on the input: line and drops
#              add: input.
#   returned   (an awaited member - one of the last dispatch still without a
#              verdict - not named counts as none; a member already holding a
#              verdict keeps it). --out <k>=<file> names the findings file member
#              <k> wrote: it is copied to <dir>/findings-<k>.md; a PASS without one
#              removes that file; a FAIL without a readable one counts as none,
#              since there is nothing to fix from. One "member:" line is printed
#              per member given a verdict in this call (a DENIED one with zero
#              counts and no file), then
#                NEXT: redispatch | members: <k>[,<k>]   then those blocks again,
#                    same round: a member at its first none of the round (a
#                    second none of a member counts as FAIL, "no verdict", and
#                    removes its findings file: what an earlier round left there
#                    is fixed already)
#              once every awaited member holds a verdict, the first that applies:
#                ASK: retry -> retry-denied | stop -> stop   any DENIED
#                NEXT: fix | members: <k>[,<k>][ | no-verdict: <k>[,<k>]][ | behaviour: <k>[,<k>]]
#                    any FAIL. A member sent this round that holds a PASS while
#                    its findings file holds a Minor line ending in (behaviour)
#                    counts as FAIL too, once per member and plan, and is named on
#                    behaviour: beside the failed ones, or alone when every member
#                    passed. members: names them all in member order, no-verdict:
#                    those whose FAIL is a second none. Then the block of
#                    viber:plan-fixer over the findings files of those members and
#                    the briefs of the task reviewers among them; with no findings
#                    file among them (every one a no-verdict member) the line
#                    stands alone, there is nothing to fix from, and the next
#                    start sends them again
#                NEXT: detail                             the skeleton stage passed
#                NEXT: exit-plan                          every member PASS, then
#                    one MINOR: line per Minor finding ending in (inferred),
#                    (untouched) or (behaviour) the findings files hold: a
#                    (behaviour) one is still there when it outlived its one fix
#                    round, and the user is shown it
#   retry-denied   NEXT: redispatch | members: <the DENIED ones>, then their blocks
#   stop       STOP: the plan stays unreviewed - no hand-off
#
# Contract:
#   argv   : <plan> <event> and the event's own arguments, as in Usage. The plan
#            path is read as plan-index.sh reads it: relative to the cwd.
#   cwd    : any directory inside the repository; a relative <plan> resolves
#            against it. The script resolves the repository root itself for its
#            state file.
#   env    : PATH must resolve `node` for plan-build.sh, which writes the briefs
#            and prints the fixer block; without it a task reviewer gets no
#            brief: line and NEXT: fix is printed with no block after it.
#   reads  : <plugin root>/scripts/plan-index.sh and config.sh (build.memory),
#            where <plugin root> is three directories above this script, spelled
#            as plugin_root_of (scripts/plugin-root.sh) reads the invoked path:
#            C:/... for a C:\ or C:/ invocation, /c/... for a /c/ one; the state
#            file; <dir>/plan-build (its candidates: line); the files --out names;
#            through plan-build.sh, the plan and what its slices and fix commands
#            read.
#   writes : the state file <dir>/review-round, for one plan path: the plan, the
#            round number, the stage (skeleton or full), the last answer (review,
#            redispatch, fix, detail, exit-plan, ask or stop), the input path, the
#            memory value, whether the round carries the previous findings, the
#            members awaiting a verdict (all of those sent after a start, the
#            redispatched ones after a redispatch, none once the round is
#            answered), the members sent in the round and per member its agent,
#            tasks slice, verdict, none count, whether its (behaviour) Minor was
#            raised and the cksum of its part of the plan at its last dispatch. A
#            start replaces it, a returned updates it; an error leaves it as it
#            was. Also <dir>/findings-<k>.md, copied from --out and removed as
#            the events say; a round 1 start removes <dir>/review-*.md too; a
#            start outside the skeleton stage with a task reviewer among its
#            members has plan-build.sh slices replace <dir>/slice-*.md.
#   stdout : the lines above, nothing on an error.
#   stderr : on exit 2, one "error: <message>" line; a start on a plan
#            plan-index.sh refuses prints "error: plan-index.sh refused the plan"
#            and then the stderr lines of plan-index.sh.
#   exit   : 0; 2 on misuse (an unknown event, an unknown option, an argument
#            missing, an unknown member, a verdict word other than PASS, FAIL,
#            DENIED or none, an event before start or with no member awaiting a
#            verdict, retry-denied after another answer than ASK:), a start refused
#            by plan-index.sh or printing no dispatch: line, a start on a round
#            not closed on NEXT: fix, NEXT: detail or NEXT: exit-plan without
#            --fresh, a config.sh exiting non-zero, or no repository.
#
set -u

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

here="$(dirname -- "$0")"
. "$here/../../../scripts/plugin-root.sh"
. "$here/../../../scripts/plan-parts.sh"
plugin_root="$(plugin_root_of "$0" 3)"

[ "$#" -ge 2 ] || fail "usage: review-round.sh <plan> <start|returned|retry-denied|stop> [args]"

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
  if [ -n "${sums[$((k - 1))]-}" ]; then
    add_line "sum: ${sums[$((k - 1))]}"
  fi
  if [ "$agent" = "viber:planner-task-review" ] && [ -f "$statedir/slice-$tasks.md" ]; then
    add_line "brief: $statedir/slice-$tasks.md"
  elif [ -f "$statedir/reach-paths.md" ]; then
    add_line "reach: $statedir/reach-paths.md"
  fi
  if [ -n "$candidates" ]; then
    add_line "candidates: $candidates"
  fi
  if [ "$previous" = "yes" ]; then
    if [ -f "$statedir/findings-$k.md" ]; then
      add_line "previous: $statedir/findings-$k.md"
    fi
    if [ -f "$statedir/fixes.md" ]; then
      add_line "fixes: $statedir/fixes.md"
    fi
  fi
  add_line "out: $statedir/review-$k.md"
}

# Prints "<blocking> <minor>": the "- " lines of findings file $1 under its
# Blocking and its Minor heading.
count_findings() {
  awk '
    { sub(/\r$/, "") }
    /^[[:space:]#*_]*Blocking[[:space:]:*_]*$/ { zone = "b"; next }
    /^[[:space:]#*_]*Minor[[:space:]:*_]*$/ { zone = "m"; next }
    /^[[:space:]]*- / { if (zone == "b") b++; else if (zone == "m") m++ }
    END { print b + 0, m + 0 }
  ' "$1" 2>/dev/null
}

# Prints the Minor findings of file $1 whose line matches the regular expression
# $2, each without its leading "- " and the blanks at its end.
minor_lines() {
  MINOR_RE="$2" awk '
    { sub(/\r$/, "") }
    /^[[:space:]#*_]*Blocking[[:space:]:*_]*$/ { zone = "b"; next }
    /^[[:space:]#*_]*Minor[[:space:]:*_]*$/ { zone = "m"; next }
    zone == "m" && /^[[:space:]]*- / && $0 ~ ENVIRON["MINOR_RE"] { sub(/^[[:space:]]*- /, ""); sub(/[[:space:]]+$/, ""); print }
  ' "$1" 2>/dev/null
}

# Appends the line of member $1: its agent, its verdict and the counts of its
# findings file, the path of that file last when it exists. A DENIED member
# wrote none in this round: the file an earlier round left is not counted.
report_member() {
  local k="$1" file="$statedir/findings-$1.md" counts="0 0" tail=""
  if [ "${verdicts[$((k - 1))]}" != "DENIED" ] && [ -f "$file" ]; then
    counts="$(count_findings "$file")"
    case "$counts" in
      [0-9]*" "[0-9]*) ;;
      *) counts="0 0" ;;
    esac
    tail=" | $file"
  fi
  add_line "member: $k | ${agents[$((k - 1))]} | ${verdicts[$((k - 1))]} | blocking: ${counts%% *} | minor: ${counts##* }$tail"
}

# Appends "NEXT: fix" for the members of the comma list $1 ($2: the fields to add
# to that line, or empty) and then the block of the fixer: the findings file of
# each member that has one and the brief of each task reviewer among them. With
# no findings file among them the line stands alone: nothing to fix from.
emit_fix() {
  local k=1 args=() block found=0
  add_line "NEXT: fix | members: $1$2"
  while [ "$k" -le "$count" ]; do
    case ",$1," in
      *",$k,"*)
        if [ -f "$statedir/findings-$k.md" ]; then
          args+=(--findings "$statedir/findings-$k.md")
          found=1
        fi
        if [ "${agents[$((k - 1))]}" = "viber:planner-task-review" ] && [ -f "$statedir/slice-${slices[$((k - 1))]}.md" ]; then
          args+=(--brief "$statedir/slice-${slices[$((k - 1))]}.md")
        fi
        ;;
    esac
    k=$((k + 1))
  done
  if [ "$found" -eq 0 ]; then
    return 0
  fi
  block="$(bash "$here/plan-build.sh" fix "$plan" ${args[@]+"${args[@]}"} 2>/dev/null)" || block=""
  if [ -n "$block" ]; then
    out="${out}${block}"$'\n'
  fi
}

# Appends "NEXT: exit-plan" and one "MINOR:" line per Minor finding ending in
# (inferred), (untouched) or (behaviour) the findings files still hold: a
# (behaviour) one was raised once already and outlived its fix round.
emit_exit() {
  local k=1 line
  add_line "NEXT: exit-plan"
  while [ "$k" -le "$count" ]; do
    if [ -f "$statedir/findings-$k.md" ]; then
      while IFS= read -r line; do
        add_line "MINOR: ${agents[$((k - 1))]}: $line"
      done < <(minor_lines "$statedir/findings-$k.md" '\((inferred|untouched|behaviour)\)[[:space:]]*$')
    fi
    k=$((k + 1))
  done
}

# Sets root, statedir, state and candidates: the state file of the repository the
# cwd is in and the reach candidates file the plan-build state names, if any.
locate_state() {
  local row
  root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [ -n "$root" ] || fail "not inside a git repository"
  statedir="$root/.temp/viber/planner"
  state="$statedir/review-round"
  candidates=""
  if [ -f "$statedir/plan-build" ]; then
    while IFS= read -r row || [ -n "$row" ]; do
      row="${row%$'\r'}"
      case "$row" in
        "candidates: "*) candidates="${row#candidates: }" ;;
      esac
    done < "$statedir/plan-build"
  fi
}

# Reads the state file into st_plan, st_round, st_stage, st_answer, st_input,
# st_memory, st_previous, st_awaiting, st_sent and, per member, st_agents,
# st_slices, st_verdicts, st_nones, st_raised and st_sums (indexed from 0),
# st_count of them. No file, or a round that is not a number, leaves st_plan
# empty: no state.
load_state() {
  st_plan=""
  st_round=""
  st_stage="full"
  st_answer=""
  st_input=""
  st_memory="false"
  st_previous="no"
  st_awaiting=""
  st_sent=""
  st_count=0
  st_agents=()
  st_slices=()
  st_verdicts=()
  st_nones=()
  st_raised=()
  st_sums=()
  if [ -f "$state" ]; then
    local line rest mk v
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%$'\r'}"
      case "$line" in
        "plan: "*) st_plan="${line#plan: }" ;;
        "round: "*) st_round="${line#round: }" ;;
        "stage: "*) st_stage="${line#stage: }" ;;
        "answer: "*) st_answer="${line#answer: }" ;;
        "input: "*) st_input="${line#input: }" ;;
        "memory: "*) st_memory="${line#memory: }" ;;
        "previous: "*) st_previous="${line#previous: }" ;;
        "awaiting: "*) st_awaiting="${line#awaiting: }" ;;
        "sent: "*) st_sent="${line#sent: }" ;;
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
          rest="${rest#* | }"
          v="${rest%% | *}"
          st_raised[$mk]="${v#raised: }"
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

# Writes the state file from plan, round, stage, answer, input, memory, previous,
# awaiting, sent and the count members of agents, slices, verdicts, nones, raised
# and sums.
write_state() {
  local k=1
  {
    printf 'plan: %s\n' "$plan"
    printf 'round: %s\n' "$round"
    printf 'stage: %s\n' "$stage"
    printf 'answer: %s\n' "$answer"
    printf 'input: %s\n' "$input"
    printf 'memory: %s\n' "$memory"
    printf 'previous: %s\n' "$previous"
    printf 'awaiting: %s\n' "$awaiting"
    printf 'sent: %s\n' "$sent"
    while [ "$k" -le "$count" ]; do
      printf 'member: %s | agent: %s | tasks: %s | verdict: %s | none: %s | raised: %s | sum: %s\n' "$k" "${agents[$((k - 1))]}" "${slices[$((k - 1))]}" "${verdicts[$((k - 1))]}" "${nones[$((k - 1))]}" "${raised[$((k - 1))]:-0}" "${sums[$((k - 1))]-}"
      k=$((k + 1))
    done
  } > "$state" || fail "cannot write $state"
}

do_start() {
  local fresh=0 answered=0 skeleton=0 resend held
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --fresh)
        fresh=1
        shift
        ;;
      --answered)
        answered=1
        shift
        ;;
      --skeleton)
        skeleton=1
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

  # keep: a later round keeps the PASS of a member whose part of the plan is the
  # part it passed on, as long as the members are the ones of the state.
  keep=1
  if [ "$fresh" -eq 1 ] || [ -z "$st_plan" ] || [ "$st_plan" != "$plan" ]; then
    round=1
    previous="no"
    keep=0
    stage="full"
    if [ "$skeleton" -eq 1 ]; then
      stage="skeleton"
    fi
    rm -f "$statedir"/findings-*.md "$statedir"/review-*.md
  elif [ "$st_answer" = "fix" ]; then
    round=$((st_round + 1))
    previous="yes"
    stage="$st_stage"
  elif [ "$st_answer" = "detail" ]; then
    round=$((st_round + 1))
    previous="no"
    stage="full"
  elif [ "$st_answer" = "exit-plan" ]; then
    round=$((st_round + 1))
    previous="yes"
    stage="full"
  else
    fail "round $st_round is not closed on NEXT: fix, NEXT: detail or NEXT: exit-plan - run start --fresh"
  fi

  cfg="$(bash "$plugin_root/scripts/config.sh" 2>/dev/null)" || fail "config.sh failed - build.memory unknown"
  while IFS= read -r line; do
    line="${line%$'\r'}"
    case "$line" in
      "build.memory: "*) memory="${line#build.memory: }" ;;
    esac
  done < <(printf '%s\n' "$cfg")

  if [ "$keep" -eq 1 ] && [ "$st_count" -ne "$count" ]; then
    keep=0
  fi
  if [ "$keep" -eq 1 ]; then
    k=0
    while [ "$k" -lt "$count" ]; do
      if [ "${st_agents[$k]-}" != "${agents[$k]}" ] || [ "${st_slices[$k]-}" != "${slices[$k]}" ]; then
        keep=0
      fi
      k=$((k + 1))
    done
  fi

  # A member whose FAIL is a second none reviewed nothing, and a reviewer given the
  # previous findings checks the fixes alone: the round then carries none, so
  # every member it sends reviews its whole part.
  if [ "$previous" = "yes" ]; then
    k=0
    while [ "$k" -lt "$st_count" ]; do
      if [ "${st_nones[$k]:-0}" -ge 2 ]; then
        previous="no"
      fi
      k=$((k + 1))
    done
  fi

  # The briefs the task reviewers read in place of the plan: written here from
  # the plan as it stands, so a plan that never went through the skeleton stage
  # has them and a fixed plan has current ones. With none there afterwards (no
  # node) the block falls back to the reach file.
  if [ "$stage" != "skeleton" ]; then
    k=0
    while [ "$k" -lt "$count" ]; do
      if [ "${agents[$k]}" = "viber:planner-task-review" ]; then
        bash "$here/plan-build.sh" slices "$plan" > /dev/null 2>&1 || true
        break
      fi
      k=$((k + 1))
    done
  fi

  awaiting=""
  sent=""
  verdicts=()
  nones=()
  raised=()
  sums=()
  k=1
  while [ "$k" -le "$count" ]; do
    i=$((k - 1))
    sum="$(plan_part_sum "$plan" "${agents[$i]}" "${slices[$i]}")"
    nones[$i]=0
    sums[$i]="$sum"
    raised[$i]=0
    if [ "$keep" -eq 1 ]; then
      raised[$i]="${st_raised[$i]:-0}"
    fi
    # An answer of the user changes what the readers of the Answered: lines gate.
    resend=0
    if [ "$answered" -eq 1 ]; then
      case "${agents[$i]}" in
        viber:planner-review | viber:planner-spec-review) resend=1 ;;
      esac
    fi
    # The skeleton stage holds the reviewers of the tasks back: they read tasks
    # that are not written yet.
    held=0
    if [ "$stage" = "skeleton" ]; then
      case "${agents[$i]}" in
        viber:planner-review | viber:planner-task-review) held=1 ;;
      esac
    fi
    if [ "$held" -eq 1 ]; then
      verdicts[$i]="-"
      sums[$i]=""
    elif [ "$keep" -eq 1 ] && [ "$resend" -eq 0 ] && [ -n "$sum" ] && [ "${st_verdicts[$i]-}" = "PASS" ] && [ "${st_sums[$i]-}" = "$sum" ]; then
      verdicts[$i]="PASS"
    else
      emit_block "$k" "${agents[$i]}" "${slices[$i]}" "$round"
      verdicts[$i]="-"
      awaiting="${awaiting:+$awaiting,}$k"
    fi
    k=$((k + 1))
  done
  sent="$awaiting"

  answer="review"
  if [ -z "$awaiting" ]; then
    if [ "$stage" = "skeleton" ]; then
      answer="detail"
      add_line "NEXT: detail"
    else
      answer="exit-plan"
      emit_exit
    fi
  fi
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
  stage="$st_stage"
  input="$st_input"
  memory="$st_memory"
  previous="$st_previous"
  sent="$st_sent"
  count="$st_count"
  agents=(${st_agents[@]+"${st_agents[@]}"})
  slices=(${st_slices[@]+"${st_slices[@]}"})
  verdicts=(${st_verdicts[@]+"${st_verdicts[@]}"})
  nones=(${st_nones[@]+"${st_nones[@]}"})
  raised=(${st_raised[@]+"${st_raised[@]}"})
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

# Sets member_k from "<k>=<rest>" in $1 and prints nothing; a <k> that is no
# member of the round is a misuse of the event named in $2.
member_of() {
  member_k="${1%%=*}"
  case "$member_k" in
    "" | *[!0-9]*) fail "$2: member $member_k is not in the round" ;;
  esac
  member_k=$((10#$member_k))
  if [ "$member_k" -lt 1 ] || [ "$member_k" -gt "$st_count" ]; then
    fail "$2: member $member_k is not in the round"
  fi
}

do_returned() {
  [ "$#" -ge 1 ] || fail "returned: name at least one <k>=<PASS|FAIL|DENIED|none>"

  open_round
  [ -n "$st_awaiting" ] || fail "returned: no member is awaiting a verdict"

  local named=() files=() arg k w file
  while [ "$#" -gt 0 ]; do
    arg="$1"
    shift
    if [ "$arg" = "--out" ]; then
      [ "$#" -ge 1 ] || fail "returned: --out needs <k>=<file>"
      arg="$1"
      shift
      case "$arg" in
        *=?*) ;;
        *) fail "returned: --out needs <k>=<file>, got: $arg" ;;
      esac
      member_of "$arg" returned
      files[$member_k]="${arg#*=}"
      continue
    fi
    case "$arg" in
      *=*) ;;
      *) fail "returned: expected <k>=<word>, got: $arg" ;;
    esac
    member_of "$arg" returned
    w="${arg#*=}"
    case "$w" in
      PASS | FAIL | DENIED | none) ;;
      *) fail "returned: unknown verdict word: $w" ;;
    esac
    [ -z "${named[$member_k]-}" ] || fail "returned: member $member_k is named twice"
    named[$member_k]="$w"
  done

  adopt_state

  local redo="" i told=""
  k=1
  while [ "$k" -le "$count" ]; do
    i=$((k - 1))
    case ",$st_awaiting," in
      *",$k,"*)
        w="${named[$k]-none}"
        file="${files[$k]-}"
        case "$w" in
          PASS | FAIL)
            if [ -n "$file" ] && [ -f "$file" ] && [ -r "$file" ]; then
              cat "$file" > "$statedir/findings-$k.md" || fail "cannot write $statedir/findings-$k.md"
            elif [ "$w" = "PASS" ]; then
              rm -f "$statedir/findings-$k.md"
            else
              # A FAIL with no findings to read leaves nothing to fix from.
              w="none"
            fi
            ;;
        esac
        if [ "$w" = "none" ]; then
          nones[$i]=$((${nones[$i]} + 1))
          if [ "${nones[$i]}" -eq 1 ]; then
            redo="${redo:+$redo,}$k"
          else
            # The findings an earlier round left are fixed already: the fixer is
            # not sent them again in the name of a member that reviewed nothing.
            rm -f "$statedir/findings-$k.md"
            verdicts[$i]="FAIL"
            told="${told:+$told,}$k"
          fi
        else
          verdicts[$i]="$w"
          told="${told:+$told,}$k"
        fi
        ;;
    esac
    k=$((k + 1))
  done

  k=1
  while [ "$k" -le "$count" ]; do
    case ",$told," in
      *",$k,"*) report_member "$k" ;;
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
    local denied=0 failed="" silent="" behaving="" hit
    k=1
    while [ "$k" -le "$count" ]; do
      i=$((k - 1))
      case "${verdicts[$i]}" in
        DENIED) denied=1 ;;
        FAIL)
          if [ "${nones[$i]}" -ge 2 ]; then
            silent="${silent:+$silent,}$k"
          fi
          ;;
      esac
      k=$((k + 1))
    done
    if [ "$denied" -eq 0 ]; then
      # A Minor finding marked (behaviour) is fixed like a Blocking one, beside
      # the failed members or alone, once per member: a reviewer that insists is
      # not asked a third time. A round still at ASK: raises none yet.
      k=1
      while [ "$k" -le "$count" ]; do
        i=$((k - 1))
        case ",$sent," in
          *",$k,"*)
            if [ "${verdicts[$i]}" = "PASS" ] && [ "${raised[$i]:-0}" = "0" ] && [ -f "$statedir/findings-$k.md" ]; then
              hit="$(minor_lines "$statedir/findings-$k.md" '\(behaviour\)[[:space:]]*$')"
              if [ -n "$hit" ]; then
                raised[$i]=1
                verdicts[$i]="FAIL"
                behaving="${behaving:+$behaving,}$k"
              fi
            fi
            ;;
        esac
        k=$((k + 1))
      done
    fi
    # failed: every member at FAIL, in member order, the (behaviour) ones included.
    k=1
    while [ "$k" -le "$count" ]; do
      if [ "${verdicts[$((k - 1))]}" = "FAIL" ]; then
        failed="${failed:+$failed,}$k"
      fi
      k=$((k + 1))
    done
    if [ "$denied" -eq 1 ]; then
      answer="ask"
      add_line "ASK: retry -> retry-denied | stop -> stop"
    elif [ -n "$failed" ]; then
      answer="fix"
      emit_fix "$failed" "${silent:+ | no-verdict: $silent}${behaving:+ | behaviour: $behaving}"
    elif [ "$stage" = "skeleton" ]; then
      answer="detail"
      add_line "NEXT: detail"
    else
      answer="exit-plan"
      emit_exit
    fi
  fi

  write_state
}

do_retry_denied() {
  [ "$#" -eq 0 ] || fail "retry-denied: unexpected argument: $1"

  open_round
  [ "$st_answer" = "ask" ] || fail "retry-denied: only after ASK: retry"
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
stage="full"
sent=""

case "$event" in
  start) do_start "$@" ;;
  returned) do_returned "$@" ;;
  retry-denied) do_retry_denied "$@" ;;
  stop) do_stop "$@" ;;
  *) fail "unknown event: $event" ;;
esac

printf '%s' "$out"
exit 0

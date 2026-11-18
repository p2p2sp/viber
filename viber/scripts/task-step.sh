#!/usr/bin/env bash
#
# task-step.sh - answers one return of a task's coder with the directive the
# implementor acts on next: the dispatch to send, its attempt number and tiers,
# or the commit call.
#
# It exists because the implementor re-read a decision table (attempt counting,
# tier climbing, the review waiver, the limit with its dependents) on every
# return and composed each dispatch by hand; one wrong application sent the
# wrong tier or lost a line. This script keeps the task's step between returns
# and prints the answer, so the model only runs it and follows the directive.
#
# Usage:
#   task-step.sh <plan> <subject> <started> <event> [<flag>...]
#     <plan>     the landed plan file, as plan-path.sh printed it
#     <subject>  a task id the plan holds
#     <started>  the run-clock.sh mark of this session ("unknown" included)
#   events:
#     start --tier <tier> --review <tier>|waived [--resume <path>[,<path>]...]
#     coder PASS|FAIL|DENIED [--dod <m>/<n>] [--red <n>|missing] [--red-log <path>]
#                            [--with <path>[,<path>]...]
#                            [--defer <id>:<path>[,<id>:<path>]...]
#                            [--decide] [--red-timeout]
#                            (an omitted --dod is no short DOD; --decide and
#                            --red-timeout are read by later events only)
#     retry coder [--denied]
#
# stdout, one block per directive, a block opening on a directive line and its
# body lines (labelled "<label>: <value>") sent verbatim in the dispatch it names:
#   NEXT: coder | attempt: <n> | model: <tier> | review: <tier>|waived [| add: reason]
#         the coder lines plan-index.sh --dispatch prints, then resume: <paths>
#         when start got --resume, then the ready reason line of a failure that
#         returned no REASON ("reason: DOD: <m>/<n>" or "reason: no red evidence");
#         "add: reason" tells the model to append the returned REASON as "reason: ..."
#   NEXT: review | round: <r> | model: <tier>
#         the reviewer lines, report: <dir>/work/review-<id>-<r>.md, then
#         red: <path> when the coder's last return named a red log
#   NEXT: commit
#   RUN: "<plugin root>/scripts/commit-task.sh" "<plan>" "<id>" [--with "<path>"...] [--defer "<entry>"...]
#   NEXT: hold | dependents: <ids>|none
#         the fifth failed attempt: the task and every task depending on it,
#         directly or through another, in plan order
#   ASK: retry -> retry coder --denied | skip -> skip | abort
#         after coder DENIED
#
# Attempts: a task gets 5 per session; a coder failure (a FAIL, a PASS whose --dod
# is short, a PASS of a TDD: required task with no --red or --red 0) ends one.
# Each next attempt runs one tier up, clamped into tiers.max, the review tier
# rising with it (never below sonnet, "waived" staying waived). A coder PASS goes
# to review when the review is not waived or any coder of the task reported
# --with, else to the commit; a waived review runs at the attempt's tier, raised
# to sonnet from haiku. "--red missing" is red evidence (RED: missing <symbol>).
#
# The state is .temp/viber/<id>/state under the repository root: key=value lines,
# discarded when written under another <started>, a "start" under "unknown"
# discarding it always. A "start" under the current mark keeps it and prints the
# current attempt's coder block again, as "retry coder" does without a
# "--denied"; both keep the ready reason line of that attempt and its resume:
# line, and drop the "add" field. The state is written only once the answer is
# complete. The session lessons file .temp/viber/lessons ("started: <mark>", then
# the run-failures.sh --lessons list without its prefix, or nothing) is written by
# "start" when it does not hold the current mark, and always under "unknown".
#
# Contract:
#   argv   : as above; a flag value is the next argument; --with, --defer and
#            --resume take comma-separated entries (a comma inside one is not
#            supported). No free text: only ids, verdict words, counts, paths.
#   cwd    : any directory inside the repository; the plan path and the paths
#            printed are relative to the cwd as given, the state and the lessons
#            file live under the repository root (git rev-parse --show-toplevel,
#            the cwd outside a repository).
#   env    : none.
#   reads  : plan-index.sh (the index, then --dispatch), config.sh (tiers.max,
#            default opus), run-failures.sh --lessons, the state file; all three
#            scripts are the ones beside this one, called as this one was invoked.
#   writes : .temp/viber/<id>/state, and .temp/viber/lessons through a temporary
#            file renamed into place.
#   exit   : 0 with an answer on stdout. 2 with one "error: ..." line on stderr
#            and nothing on stdout: bad arguments, an unknown event, a plan
#            plan-index.sh refuses, an id the plan does not hold, an event that
#            needs a state the task has not under the current mark.
#
set -euo pipefail

die() {
  echo "error: $*" >&2
  exit 2
}

# The plugin root is this script's invoked path with its trailing
# "/scripts/<name>.sh" cut off as text, a backslash read as "/", never resolved.
self="${0//\\//}"
case "$self" in
  */*) here="${self%/*}" ;;
  *) here="." ;;
esac
plugin_root="${self%/scripts/${self##*/}}"

[[ $# -ge 4 ]] || die "usage: task-step.sh <plan> <subject> <started> <event> [<flag>...]"
plan="${1//\\//}"
plan="${plan#./}"
id="$2"
started="$3"
event="$4"
shift 4

[[ "$id" =~ ^[A-Za-z0-9._-]+$ ]] || die "bad subject: $id"
[[ -n "$started" ]] || die "bad started mark"

verdict=""
case "$event" in
  start) ;;
  coder)
    [[ $# -ge 1 ]] || die "coder needs PASS, FAIL or DENIED"
    verdict="$1"
    shift
    case "$verdict" in
      PASS|FAIL|DENIED) ;;
      *) die "bad coder verdict: $verdict" ;;
    esac
    ;;
  retry)
    [[ $# -ge 1 && "$1" == "coder" ]] || die "retry needs coder"
    event="retry coder"
    shift
    ;;
  *) die "unknown event: $event" ;;
esac

f_tier=""
f_review=""
f_resume=""
f_dod=""
f_red=""
f_redlog=""
f_with=""
f_defer=""
f_denied=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --decide|--red-timeout) shift ;;
    --denied) f_denied=1; shift ;;
    --tier|--review|--resume|--dod|--red|--red-log|--with|--defer)
      [[ $# -ge 2 ]] || die "$1 needs a value"
      case "$1" in
        --tier) f_tier="$2" ;;
        --review) f_review="$2" ;;
        --resume) f_resume="$2" ;;
        --dod) f_dod="$2" ;;
        --red) f_red="$2" ;;
        --red-log) f_redlog="$2" ;;
        --with) f_with="$2" ;;
        --defer) f_defer="$2" ;;
      esac
      shift 2
      ;;
    *) die "unknown flag: $1" ;;
  esac
done

rank() {
  case "$1" in
    haiku) echo 1 ;;
    sonnet) echo 2 ;;
    opus) echo 3 ;;
    fable) echo 4 ;;
    *) echo 0 ;;
  esac
}

tier_name() {
  case "$1" in
    1) echo haiku ;;
    2) echo sonnet ;;
    3) echo opus ;;
    *) echo fable ;;
  esac
}

dod_m=0
dod_n=0
if [[ "$event" == "start" ]]; then
  [[ "$(rank "$f_tier")" -gt 0 ]] || die "start needs --tier haiku, sonnet, opus or fable"
  if [[ "$f_review" != "waived" ]]; then
    [[ "$(rank "$f_review")" -gt 0 ]] || die "start needs --review <tier> or waived"
  fi
fi
if [[ -n "$f_dod" ]]; then
  [[ "$f_dod" =~ ^([0-9]+)/([0-9]+)$ ]] || die "bad --dod: $f_dod"
  dod_m=$((10#${BASH_REMATCH[1]}))
  dod_n=$((10#${BASH_REMATCH[2]}))
fi
red_ok=0
if [[ "$f_red" == "missing" ]]; then
  red_ok=1
elif [[ -n "$f_red" ]]; then
  [[ "$f_red" =~ ^[0-9]+$ ]] || die "bad --red: $f_red"
  [[ $((10#$f_red)) -eq 0 ]] || red_ok=1
fi

trim() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

# The cell n (1-based) of an index row, cells separated by " | ".
cell() {
  local r="$1" n="$2"
  while [[ $n -gt 1 ]]; do
    r="${r#* | }"
    n=$((n - 1))
  done
  trim "${r%% | *}"
}

index_out="$(bash "$here/plan-index.sh" "$plan" 2>/dev/null)" || {
  err="$(bash "$here/plan-index.sh" "$plan" 2>&1 >/dev/null || true)"
  die "plan-index.sh refused the plan: $err"
}

t_ids=()
t_tdds=()
t_deps=()
in_rows=0
while IFS= read -r row; do
  row="${row//$'\r'/}"
  case "$row" in
    "tasks: "*) in_rows=1 ;;
    "verify: "*) in_rows=0 ;;
    *)
      if [[ $in_rows -eq 1 && -n "$row" ]]; then
        t_ids[${#t_ids[@]}]="$(cell "$row" 1)"
        t_tdds[${#t_tdds[@]}]="$(cell "$row" 3)"
        t_deps[${#t_deps[@]}]="$(cell "$row" 6)"
      fi
      ;;
  esac
done < <(printf '%s\n' "$index_out")

tdd_required=0
known=0
for ((i = 0; i < ${#t_ids[@]}; i++)); do
  if [[ "${t_ids[$i]}" == "$id" ]]; then
    known=1
    [[ "${t_tdds[$i]}" != "required" ]] || tdd_required=1
  fi
done
[[ $known -eq 1 ]] || die "the plan holds no task $id"

# Every task depending on $id, directly or through another, in plan order.
dependents_of_task() {
  local seen=" $id " grew=1 i d out="" hit
  while [[ $grew -eq 1 ]]; do
    grew=0
    for ((i = 0; i < ${#t_ids[@]}; i++)); do
      case "$seen" in *" ${t_ids[$i]} "*) continue ;; esac
      hit=0
      for d in ${t_deps[$i]//,/ }; do
        case "$seen" in *" $d "*) hit=1 ;; esac
      done
      if [[ $hit -eq 1 ]]; then
        seen="$seen${t_ids[$i]} "
        grew=1
      fi
    done
  done
  for ((i = 0; i < ${#t_ids[@]}; i++)); do
    [[ "${t_ids[$i]}" != "$id" ]] || continue
    case "$seen" in *" ${t_ids[$i]} "*) out="${out:+$out,}${t_ids[$i]}" ;; esac
  done
  printf '%s' "${out:-none}"
}

max="opus"
cfg_out="$(bash "$here/config.sh" 2>/dev/null || true)"
while IFS= read -r line; do
  line="${line//$'\r'/}"
  case "$line" in
    "tiers.max: "*) max="${line#tiers.max: }" ;;
  esac
done < <(printf '%s\n' "$cfg_out")
[[ "$(rank "$max")" -gt 0 ]] || max="opus"

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
state_dir="$root/.temp/viber/$id"
state_file="$state_dir/state"
plan_dir="$(dirname -- "$plan")"

st_started=""
attempt=1
model=""
review=""
round=0
with=""
defer=""
anywith=0
redlog=""
resume=""
reason=""

load_state() {
  local line
  st_started=""
  [[ -f "$state_file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//$'\r'/}"
    case "$line" in
      started=*) st_started="${line#*=}" ;;
      attempt=*) attempt="${line#*=}" ;;
      model=*) model="${line#*=}" ;;
      review=*) review="${line#*=}" ;;
      round=*) round="${line#*=}" ;;
      with=*) with="${line#*=}" ;;
      defer=*) defer="${line#*=}" ;;
      anywith=*) anywith="${line#*=}" ;;
      redlog=*) redlog="${line#*=}" ;;
      resume=*) resume="${line#*=}" ;;
      reason=*) reason="${line#*=}" ;;
    esac
  done < "$state_file"
}

require_state() {
  load_state
  [[ "$st_started" == "$started" ]] || die "no step state for $id under started $started: report start first"
}

save_state() {
  local tmp="$state_file.tmp.$$"
  mkdir -p "$state_dir"
  printf '%s\n' "started=$started" "attempt=$attempt" "model=$model" "review=$review" "round=$round" \
    "with=$with" "defer=$defer" "anywith=$anywith" "redlog=$redlog" "resume=$resume" "reason=$reason" > "$tmp"
  mv -f "$tmp" "$state_file"
}

# The session lessons file: rewritten when it does not hold the current mark,
# and always under "unknown".
write_lessons() {
  local file="$root/.temp/viber/lessons" first="" res="" list="" abs tmp
  if [[ "$started" != "unknown" && -f "$file" ]]; then
    first="$(sed -n '1p' "$file")"
    first="${first//$'\r'/}"
    [[ "$first" != "started: $started" ]] || return 0
  fi
  abs="$(cd -- "$plan_dir" 2>/dev/null && pwd)" || abs="$plan_dir"
  res="$(bash "$here/run-failures.sh" --lessons "$abs" 2>/dev/null)" || res=""
  res="${res//$'\r'/}"
  case "$res" in
    "lessons: none"|"") ;;
    "lessons: "*) list="${res#lessons: }" ;;
  esac
  mkdir -p "$root/.temp/viber"
  tmp="$file.tmp.$$"
  {
    printf 'started: %s\n' "$started"
    [[ -z "$list" ]] || printf '%s\n' "$list"
  } > "$tmp"
  mv -f "$tmp" "$file"
}

ans=""
say() {
  ans="$ans$1"$'\n'
}

say_block() {
  local t="$1"
  while [[ "$t" == *$'\n' ]]; do
    t="${t%$'\n'}"
  done
  [[ -z "$t" ]] || ans="$ans$t"$'\n'
}

dispatch() {
  local d
  d="$(bash "$here/plan-index.sh" "$plan" --dispatch "$id" "$1")" || die "plan-index.sh --dispatch failed for $id"
  say_block "$d"
}

# The current attempt's coder block; $1 is the field after the tiers, if any.
coder_block() {
  say "NEXT: coder | attempt: $attempt | model: $model | review: $review${1:+ | $1}"
  dispatch coder
  [[ -z "$resume" ]] || say "resume: $resume"
  [[ -z "$reason" ]] || say "reason: $reason"
}

# A list entry per quoted argument: a,b -> ` "a" "b"`.
quoted_list() {
  local rest="$1," item out=""
  while [[ -n "$rest" ]]; do
    item="${rest%%,*}"
    rest="${rest#*,}"
    [[ -z "$item" ]] || out="$out \"$item\""
  done
  printf '%s' "$out"
}

union() {
  local out="$1" rest="$2," item
  while [[ -n "$rest" ]]; do
    item="${rest%%,*}"
    rest="${rest#*,}"
    [[ -n "$item" ]] || continue
    case ",$out," in
      *",$item,"*) ;;
      *) out="${out:+$out,}$item" ;;
    esac
  done
  printf '%s' "$out"
}

# One tier up, clamped into tiers.max; the review tier rises with it, never below
# sonnet, and a waived review stays waived.
climb() {
  local mr r
  mr="$(rank "$max")"
  r=$(($(rank "$model") + 1))
  [[ $r -le $mr ]] || r=$mr
  model="$(tier_name "$r")"
  if [[ "$review" != "waived" ]]; then
    r=$(($(rank "$review") + 1))
    [[ $r -le $mr ]] || r=$mr
    [[ $r -ge 2 ]] || r=2
    review="$(tier_name "$r")"
  fi
}

case "$event" in
  start)
    [[ -n "$f_tier" && -n "$f_review" ]] || die "start needs --tier and --review"
    kept=0
    if [[ "$started" != "unknown" && -f "$state_file" ]]; then
      load_state
      [[ "$st_started" != "$started" ]] || kept=1
    fi
    if [[ $kept -eq 0 ]]; then
      attempt=1
      model="$f_tier"
      review="$f_review"
      round=0
      with=""
      defer=""
      anywith=0
      redlog=""
      resume="$f_resume"
      reason=""
    fi
    write_lessons
    coder_block ""
    save_state
    ;;

  "retry coder")
    require_state
    add=""
    if [[ $f_denied -eq 1 ]]; then
      add="add: reason"
      reason=""
    fi
    coder_block "$add"
    ;;

  coder)
    require_state
    if [[ "$verdict" == "DENIED" ]]; then
      say "ASK: retry -> retry coder --denied | skip -> skip | abort"
    else
      with="$(union "$with" "$f_with")"
      defer="$(union "$defer" "$f_defer")"
      [[ -z "$f_with" ]] || anywith=1
      redlog="$f_redlog"
      failed=0
      add=""
      why=""
      if [[ "$verdict" == "FAIL" ]]; then
        failed=1
        add="add: reason"
      elif [[ $dod_m -lt $dod_n ]]; then
        failed=1
        why="DOD: $dod_m/$dod_n"
      elif [[ $tdd_required -eq 1 && $red_ok -eq 0 ]]; then
        failed=1
        why="no red evidence"
      fi

      if [[ $failed -eq 1 ]]; then
        if [[ $attempt -ge 5 ]]; then
          say "NEXT: hold | dependents: $(dependents_of_task)"
        else
          climb
          attempt=$((attempt + 1))
          with=""
          defer=""
          redlog=""
          resume=""
          reason="$why"
          coder_block "$add"
        fi
      elif [[ "$review" != "waived" || $anywith -eq 1 ]]; then
        round=$((round + 1))
        review_model="$review"
        if [[ "$review" == "waived" ]]; then
          review_model="$model"
          [[ "$(rank "$review_model")" -ge 2 ]] || review_model="sonnet"
        fi
        say "NEXT: review | round: $round | model: $review_model"
        dispatch reviewer
        say "report: $plan_dir/work/review-$id-$round.md"
        [[ -z "$redlog" ]] || say "red: $redlog"
      else
        say "NEXT: commit"
        say "RUN: \"$plugin_root/scripts/commit-task.sh\" \"$plan\" \"$id\"${with:+ --with$(quoted_list "$with")}${defer:+ --defer$(quoted_list "$defer")}"
      fi
      save_state
    fi
    ;;
esac

printf '%s' "$ans"

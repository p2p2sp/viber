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
#                            (an omitted --dod is no short DOD; --red-timeout says
#                            the earlier call of this return ran out of time in
#                            the red check, so it is not run again; --decide says
#                            the coder returned a DECIDE: line)
#     reviewer PASS|FAIL|DENIED [--report <path>] [--with <path>[,<path>]...]
#     retry coder [--denied] | retry reviewer
#     accept
#     commit <exit code> [--landed]
#     landed <sha>
#     ruled --case decide|baseline|tests|final-review|commit [--options "<a> | <b>"]
#           [--refused]   (the subject is a task id on decide, else the case name)
#     resume-failed
#
# stdout, one block per directive, a block opening on a directive line and its
# body lines (labelled "<label>: <value>") sent verbatim in the dispatch it names:
#   NEXT: coder | attempt: <n> | model: <tier> | review: <tier>|waived [| add: reason]
#         the coder lines plan-index.sh --dispatch prints, then resume: <paths>
#         when start got --resume, report: <path> after a review failure, then the
#         ready reason line of a failure that returned no REASON ("reason: DOD:
#         <m>/<n>" or "reason: no red evidence"); "add: reason" tells the model to
#         append the returned REASON (the commit's error after a refused commit)
#         as "reason: ..."
#   NEXT: review | round: <r> | model: <tier>
#         the reviewer lines, report: <dir>/work/review-<id>-<r>.md, previous:
#         <path> once a review of the task failed, then red: <path> when the
#         coder's last return named a red log, then red-check: <the check's line
#         without its prefix> when the red check ran on that return; the
#         directive line then carries the field "red-check: <result word>"
#   NEXT: commit
#   RUN: "<plugin root>/scripts/commit-task.sh" "<plan>" "<id>" [--with "<path>"... | --landed "<sha>"] [--defer "<entry>"...] [--unreviewed]
#   NEXT: arbiter [| add: reason]
#         case: decide, options: <the DECIDE: options of <dir>/work/<id>-options.md>,
#         task:, report: <dir>/work/<id>-coder.md, ruling: <dir>/work/ruling-<id>.md,
#         then the ready reason line of a failure that returned no REASON; the
#         answer to a coder failure of attempts 1 to 4 that carried --decide when
#         the options file holds a DECIDE: line, the attempt unchanged (a resumed
#         coder's second DECIDE: goes here again); attempt 5 holds the task instead
#   RUN: commit-task.sh --rule ... --from <ruling file>   (a refused arbiter: the fixed
#         words, the case's first option)
#   RUN: commit-task.sh --decide ... --from <ruling file> | --first-of <options file>
#         the two answers to "ruled --case decide", the --first-of form when the
#         RULING names none of the options (or the arbiter was refused), then
#   NEXT: resume [| mismatch]
#         one decision: line per decision of the task and its dependencies, the one
#         just ruled last, then "Continue the task under these decisions, then
#         return your output lines again."; "resume-failed" instead answers the
#         next attempt's coder block, whose decision: lines come from status.md
#   NEXT: carry-out: <option>[ | mismatch]
#         after "ruled" on baseline, tests, final-review or commit, as the --rule
#         call; the first of --options with "mismatch" when the RULING names none
#         of them, the case's first word (continue, accept, accept, leave
#         uncommitted) when the arbiter was refused; "ruled" on these subjects
#         writes no state, and --case cap is not answered
#   NEXT: done
#         after commit 0
#   NEXT: hold | dependents: <ids>|none[ | red-check: PASSED-WITHOUT-CHANGE]
#         the fifth failed attempt: the task and every task depending on it,
#         directly or through another, in plan order
#   ASK: retry -> retry coder --denied | skip -> skip | abort
#         after coder DENIED
#   ASK: retry -> retry reviewer | accept -> accept | abort
#         after reviewer DENIED; "accept" answers the commit with --unreviewed
#   ASK: [already committed -> landed <sha> | ]retry | skip -> skip | abort
#         after commit 4 (the first answer when it carried --landed); "landed
#         <sha>" answers the commit with --landed in place of the --with paths
#
# Attempts: a task gets 5 per session; a coder failure (a FAIL, a PASS whose --dod
# is short, a PASS of a TDD: required task with no --red or --red 0), a reviewer
# FAIL and a commit exiting other than 0 and 4 each end one; the next attempt of a
# review failure carries the returned --report path as report:, that of a refused
# commit "add: reason". Every reviewer FAIL rewrites the session lessons file
# first.
# Each next attempt runs one tier up, clamped into tiers.max, the review tier
# rising with it (never below sonnet, "waived" staying waived). A coder PASS goes
# to review when the review is not waived or any coder of the task reported
# --with, else to the commit; a waived review runs at the attempt's tier, raised
# to sonnet from haiku. "--red missing" is red evidence (RED: missing <symbol>).
#
# The red check: a coder PASS of a TDD: required task that is no coder failure,
# with build.red-check reading true, runs red-check.sh (beside this script) on the
# plan and the task, and always goes to review. Its "NEXT: review" answer carries
# its red-check: line to the reviewer block; its "NEXT: coder-failure" answer is a
# coder failure whose ready reason line is the check's reason and whose directive
# line carries "red-check: PASSED-WITHOUT-CHANGE"; a non-zero exit, an answer with
# no usable NEXT: line or a call under --red-timeout reads as the line
# "UNRUNNABLE exit <n>", "UNRUNNABLE no NEXT: line" or "UNRUNNABLE timeout".
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
#            default opus; build.red-check, default off), run-failures.sh
#            --lessons, red-check.sh, the state file; all four scripts are the
#            ones beside this one, called as this one was invoked.
#   writes : .temp/viber/<id>/state, and .temp/viber/lessons through a temporary
#            file renamed into place; red-check.sh writes
#            .temp/viber/<id>/red-check.log when the red check runs.
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
exit_code=""
sha=""
case "$event" in
  start|accept|ruled|resume-failed) ;;
  coder|reviewer)
    [[ $# -ge 1 ]] || die "$event needs PASS, FAIL or DENIED"
    verdict="$1"
    shift
    case "$verdict" in
      PASS|FAIL|DENIED) ;;
      *) die "bad $event verdict: $verdict" ;;
    esac
    ;;
  retry)
    [[ $# -ge 1 && ( "$1" == "coder" || "$1" == "reviewer" ) ]] || die "retry needs coder or reviewer"
    event="retry $1"
    shift
    ;;
  commit)
    [[ $# -ge 1 && "$1" =~ ^[0-9]+$ ]] || die "commit needs an exit code"
    exit_code=$((10#$1))
    shift
    ;;
  landed)
    [[ $# -ge 1 && "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._~^/-]*$ ]] || die "landed needs a commit sha"
    sha="$1"
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
f_report=""
f_denied=0
f_landed=0
f_timeout=0
f_decide=0
f_refused=0
f_case=""
f_options=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --decide) f_decide=1; shift ;;
    --refused) f_refused=1; shift ;;
    --red-timeout) f_timeout=1; shift ;;
    --denied) f_denied=1; shift ;;
    --landed) f_landed=1; shift ;;
    --tier|--review|--resume|--dod|--red|--red-log|--with|--defer|--report|--case|--options)
      [[ $# -ge 2 ]] || die "$1 needs a value"
      case "$1" in
        --case) f_case="$2" ;;
        --options) f_options="$2" ;;
        --tier) f_tier="$2" ;;
        --review) f_review="$2" ;;
        --resume) f_resume="$2" ;;
        --dod) f_dod="$2" ;;
        --red) f_red="$2" ;;
        --red-log) f_redlog="$2" ;;
        --with) f_with="$2" ;;
        --defer) f_defer="$2" ;;
        --report) f_report="$2" ;;
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

fixed_subject=0
if [[ "$event" == "ruled" ]]; then
  case "$id" in
    baseline|tests|final-review|commit) fixed_subject=1 ;;
  esac
fi

tdd_required=0
known=0
for ((i = 0; i < ${#t_ids[@]}; i++)); do
  if [[ "${t_ids[$i]}" == "$id" ]]; then
    known=1
    [[ "${t_tdds[$i]}" != "required" ]] || tdd_required=1
  fi
done
[[ $known -eq 1 || $fixed_subject -eq 1 ]] || die "the plan holds no task $id"

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
red_check_on=0
cfg_out="$(bash "$here/config.sh" 2>/dev/null || true)"
while IFS= read -r line; do
  line="${line//$'\r'/}"
  case "$line" in
    "tiers.max: "*) max="${line#tiers.max: }" ;;
    "build.red-check: true") red_check_on=1 ;;
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
rpt=""
lastrev=""
unrev=0
rc=""

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
      rpt=*) rpt="${line#*=}" ;;
      lastrev=*) lastrev="${line#*=}" ;;
      unrev=*) unrev="${line#*=}" ;;
      rc=*) rc="${line#*=}" ;;
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
    "with=$with" "defer=$defer" "anywith=$anywith" "redlog=$redlog" "resume=$resume" "reason=$reason" \
    "rpt=$rpt" "lastrev=$lastrev" "unrev=$unrev" "rc=$rc" > "$tmp"
  mv -f "$tmp" "$state_file"
}

# The session lessons file: rewritten when it does not hold the current mark,
# and always under "unknown" or when $1 is "force".
write_lessons() {
  local file="$root/.temp/viber/lessons" first="" res="" list="" abs tmp
  if [[ "${1:-}" != "force" && "$started" != "unknown" && -f "$file" ]]; then
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
  [[ -z "$rpt" ]] || say "report: $rpt"
  [[ -z "$reason" ]] || say "reason: $reason"
}

# The reviewer block of the current round: a waived review runs at the attempt's
# tier, raised to sonnet from haiku.
review_block() {
  local review_model="$review"
  if [[ "$review" == "waived" ]]; then
    review_model="$model"
    [[ "$(rank "$review_model")" -ge 2 ]] || review_model="sonnet"
  fi
  say "NEXT: review | round: $round | model: $review_model${rc:+ | red-check: ${rc%% *}}"
  dispatch reviewer
  say "report: $plan_dir/work/review-$id-$round.md"
  [[ -z "$lastrev" ]] || say "previous: $lastrev"
  [[ -z "$redlog" ]] || say "red: $redlog"
  [[ -z "$rc" ]] || say "red-check: $rc"
}

# Runs the red check of the task and sets rc to its line without the prefix,
# and rc_reason to the reason of a "NEXT: coder-failure" answer (else empty).
run_red_check() {
  local out="" code=0 line rline="" nline=""
  rc_reason=""
  if [[ $f_timeout -eq 1 ]]; then
    rc="UNRUNNABLE timeout"
    return 0
  fi
  out="$(bash "$here/red-check.sh" "$plan" "$id" 2>/dev/null < /dev/null)" || code=$?
  if [[ $code -ne 0 ]]; then
    rc="UNRUNNABLE exit $code"
    return 0
  fi
  while IFS= read -r line; do
    line="${line//$'\r'/}"
    case "$line" in
      "red-check: "*) [[ -n "$rline" ]] || rline="${line#red-check: }" ;;
      "NEXT: "*) [[ -n "$nline" ]] || nline="${line#NEXT: }" ;;
    esac
  done < <(printf '%s\n' "$out")
  case "$nline" in
    "review") [[ -z "$rline" ]] || { rc="$rline"; return 0; } ;;
    "coder-failure | reason: "?*)
      rc="PASSED-WITHOUT-CHANGE"
      rc_reason="${nline#coder-failure | reason: }"
      return 0
      ;;
  esac
  rc="UNRUNNABLE no NEXT: line"
}

# The commit answer; $1 is a sha the task's work already landed under, else the
# --with paths stand.
commit_block() {
  local paths="" unr=""
  if [[ -n "${1:-}" ]]; then
    paths=" --landed \"$1\""
  elif [[ -n "$with" ]]; then
    paths=" --with$(quoted_list "$with")"
  fi
  if [[ $unrev -eq 1 ]]; then
    unr=" --unreviewed"
  fi
  say "NEXT: commit"
  say "RUN: \"$plugin_root/scripts/commit-task.sh\" \"$plan\" \"$id\"$paths${defer:+ --defer$(quoted_list "$defer")}$unr"
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

# The next attempt's coder block, or the hold at the fifth failure. $1 is the
# ready reason line, $2 the add field, $3 the report path of a review failure,
# $4 the red-check field.
next_attempt() {
  local rcfield="${4:-}"
  rc=""
  if [[ $attempt -ge 5 ]]; then
    say "NEXT: hold | dependents: $(dependents_of_task)${rcfield:+ | $rcfield}"
    return 0
  fi
  climb
  attempt=$((attempt + 1))
  with=""
  defer=""
  redlog=""
  resume=""
  unrev=0
  reason="$1"
  rpt="$3"
  coder_block "${rcfield:+$rcfield${2:+ | }}$2"
}

# The text after the first line of file $1 starting with prefix $2, a trailing
# carriage return cut; status 1 when the file or the line is absent.
file_line() {
  local line
  [[ -f "$1" && -r "$1" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//$'\r'/}"
    case "$line" in
      "$2"*)
        printf '%s' "${line#"$2"}"
        return 0
        ;;
    esac
  done < "$1"
  return 1
}

# The options of "<a> | <b>", one trimmed non-empty option per line.
split_options() {
  local rest="$1" item
  while :; do
    case "$rest" in
      *" | "*)
        item="${rest%% | *}"
        rest="${rest#* | }"
        ;;
      *)
        item="$rest"
        rest=""
        ;;
    esac
    item="$(trim "$item")"
    if [[ -n "$item" ]]; then
      printf '%s\n' "$item"
    fi
    [[ -n "$rest" ]] || break
  done
}

# The closed list of "<a> | <b>" as one line, options trimmed.
join_options() {
  local o out=""
  while IFS= read -r o; do
    out="${out:+$out | }$o"
  done < <(split_options "$1")
  printf '%s' "$out"
}

# The arbiter block of a stalled coder when the task's options file holds a
# DECIDE: line; $1 is the ready reason line, $2 the add field. Status 1 when it
# holds none, so the failure goes to the next attempt.
route_arbiter() {
  local text opts
  text="$(file_line "$plan_dir/work/$id-options.md" "DECIDE: ")" || return 1
  opts="$(join_options "$text")"
  [[ -n "$opts" ]] || return 1
  rc=""
  say "NEXT: arbiter${2:+ | $2}"
  say "case: decide"
  say "options: $opts"
  say "task: $plan_dir/tasks/$id.md"
  say "report: $plan_dir/work/$id-coder.md"
  say "ruling: $plan_dir/work/ruling-$id.md"
  [[ -z "$1" ]] || say "reason: $1"
}

# The first option the build takes for a case whose arbiter was refused.
case_first() {
  case "$1" in
    baseline) printf 'continue' ;;
    commit) printf 'leave uncommitted' ;;
    *) printf 'accept' ;;
  esac
}

# The resume message: the decision lines of the task and its dependencies, the
# decision just ruled ($1) last, then the closing sentence.
resume_message() {
  local d line new="decision: $id: $1" seen=0 body=""
  d="$(bash "$here/plan-index.sh" "$plan" --dispatch "$id" coder)" || die "plan-index.sh --dispatch failed for $id"
  while IFS= read -r line; do
    line="${line//$'\r'/}"
    case "$line" in
      "decision: "*)
        body="$body$line"$'\n'
        [[ "$line" != "$new" ]] || seen=1
        ;;
    esac
  done < <(printf '%s\n' "$d")
  [[ $seen -eq 1 ]] || body="$body$new"$'\n'
  say_block "$body"
  say "Continue the task under these decisions, then return your output lines again."
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
      rpt=""
      lastrev=""
      unrev=0
      rc=""
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

      rc=""
      rc_reason=""
      checked=0
      if [[ $failed -eq 0 && $tdd_required -eq 1 && $red_check_on -eq 1 ]]; then
        checked=1
        run_red_check
      fi

      if [[ $failed -eq 1 ]]; then
        if [[ $f_decide -eq 1 && $attempt -lt 5 ]] && route_arbiter "$why" "$add"; then
          :
        else
          next_attempt "$why" "$add" ""
        fi
      elif [[ -n "$rc_reason" ]]; then
        if [[ $f_decide -eq 1 && $attempt -lt 5 ]] && route_arbiter "$rc_reason" ""; then
          :
        else
          next_attempt "$rc_reason" "" "" "red-check: PASSED-WITHOUT-CHANGE"
        fi
      elif [[ $checked -eq 1 || "$review" != "waived" || $anywith -eq 1 ]]; then
        round=$((round + 1))
        review_block
      else
        commit_block ""
      fi
      save_state
    fi
    ;;

  reviewer)
    require_state
    case "$verdict" in
      DENIED)
        say "ASK: retry -> retry reviewer | accept -> accept | abort"
        ;;
      PASS)
        with="$(union "$with" "$f_with")"
        [[ -z "$f_with" ]] || anywith=1
        commit_block ""
        save_state
        ;;
      FAIL)
        write_lessons force
        [[ -z "$f_report" ]] || lastrev="$f_report"
        next_attempt "" "" "$f_report"
        save_state
        ;;
    esac
    ;;

  "retry reviewer")
    require_state
    [[ $round -ge 1 ]] || die "no review to retry for $id: report a coder PASS first"
    review_block
    ;;

  accept)
    require_state
    unrev=1
    commit_block ""
    save_state
    ;;

  commit)
    require_state
    if [[ $exit_code -eq 0 ]]; then
      say "NEXT: done"
    elif [[ $exit_code -eq 4 ]]; then
      if [[ $f_landed -eq 1 ]]; then
        say "ASK: already committed -> landed <sha> | retry | skip -> skip | abort"
      else
        say "ASK: retry | skip -> skip | abort"
      fi
    else
      next_attempt "" "add: reason" ""
      save_state
    fi
    ;;

  landed)
    require_state
    commit_block "$sha"
    ;;

  resume-failed)
    require_state
    next_attempt "" "" ""
    save_state
    ;;

  ruled)
    case "$f_case" in
      decide|baseline|tests|final-review|commit) ;;
      cap) die "ruled --case cap is not answered by this script" ;;
      *) die "ruled needs --case decide, baseline, tests, final-review or commit" ;;
    esac
    if [[ $fixed_subject -eq 1 ]]; then
      [[ "$f_case" == "$id" ]] || die "ruled --case $f_case does not fit the subject $id"
    else
      [[ "$f_case" == "decide" ]] || die "ruled --case $f_case needs the subject $f_case"
      require_state
    fi
    ruling_file="$plan_dir/work/ruling-$id.md"
    options_file="$plan_dir/work/$id-options.md"
    ct="\"$plugin_root/scripts/commit-task.sh\""
    opts_text="$f_options"
    if [[ -z "$opts_text" && "$f_case" == "decide" ]]; then
      opts_text="$(file_line "$options_file" "DECIDE: ")" || opts_text=""
    fi

    first=""
    got=""
    matched=""
    while IFS= read -r option; do
      [[ -n "$first" ]] || first="$option"
    done < <(split_options "$opts_text")
    if [[ $f_refused -eq 0 ]]; then
      [[ -n "$first" ]] || die "ruled --case $f_case needs --options"
      got="$(file_line "$ruling_file" "RULING: ")" || got=""
      got="$(trim "$got")"
      if [[ -n "$got" ]]; then
        while IFS= read -r option; do
          if [[ "$option" == "$got" ]]; then
            matched="$option"
          fi
        done < <(split_options "$opts_text")
      fi
      say "RUN: $ct --rule \"$plan\" \"$id\" --from \"$ruling_file\""
    elif [[ "$f_case" == "decide" ]]; then
      [[ -n "$first" ]] || die "ruled --case decide needs the DECIDE: options of $options_file"
      say "RUN: $ct --rule \"$plan\" \"$id\" \"the coder's first option\" \"the arbiter was refused\" \"not assessed - the arbiter was refused\""
    else
      first="$(case_first "$f_case")"
      say "RUN: $ct --rule \"$plan\" \"$id\" \"$first\" \"the arbiter was refused\" \"not assessed - the arbiter was refused\""
    fi

    if [[ "$f_case" == "decide" ]]; then
      if [[ -n "$matched" ]]; then
        say "RUN: $ct --decide \"$plan\" \"$id\" --from \"$ruling_file\""
        say "NEXT: resume"
        resume_message "auto: $matched"
      else
        say "RUN: $ct --decide \"$plan\" \"$id\" --first-of \"$options_file\""
        if [[ $f_refused -eq 1 ]]; then
          say "NEXT: resume"
        else
          say "NEXT: resume | mismatch"
        fi
        resume_message "auto: $first"
      fi
    elif [[ $f_refused -eq 1 ]]; then
      say "NEXT: carry-out: $first"
    elif [[ -n "$matched" ]]; then
      say "NEXT: carry-out: $matched"
    else
      say "NEXT: carry-out: $first | mismatch"
    fi
    ;;
esac

printf '%s' "$ans"

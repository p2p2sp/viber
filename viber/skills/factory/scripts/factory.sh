#!/usr/bin/env bash
# factory.sh - entry point of the factory skill: factory.sh <command> [args...].
#
# Passes the arguments to factory.ps1 base64-encoded and NUL separated, because PowerShell argument
# passing mangles non-ASCII text. The modes answer and approve drive one dialog of another session
# end to end (read the pending tool call and the screen, move the cursor, check it, press ENTER), so
# the skill never decides a key press itself: a wrong key press stops depending on the model.
#
# Contract:
#   argv    <command> [args...]. list, screen, pending, keys, type, send, enroll and watch pass their
#           arguments through to factory.ps1 unchanged. The dialog modes:
#             answer <session> <label>    one-question single-select AskUserQuestion
#             approve <session>           ExitPlanMode: the row holding "clear context" and
#                                         "bypass permissions", else the first row opening with "Yes"
#   cwd     irrelevant: factory.ps1 is found beside this script.
#   env     none read; powershell.exe must be on PATH (Windows only).
#   files   none read or written here; factory.ps1 reads the session registry and the transcript.
#   stdout  a passed-through command: factory.ps1's output as it is.
#           answer and approve, exit 0:
#             NEXT: done | sent: <K1,K2,...>            then the last screen lines, verbatim
#           or
#             NEXT: keys | mismatch: <reason>           then the last screen lines read, verbatim
#           reasons: not-asking (the pending tool is not AskUserQuestion for answer, not ExitPlanMode
#           for approve), several-questions, multi-select, no-option, no-row, cursor-moved.
#           ENTER is sent only after the screen shows the cursor on the target row; on a mismatch no
#           key past the cursor moves is sent. sent: lists every key in order.
#           A failing factory.ps1 prints its ERROR: line.
#   exit    0 on a passed-through command's success and on every answer or approve (done or mismatch);
#           1 when factory.ps1 failed, powershell.exe is missing or no command was given;
#           2 when answer or approve lacks an argument: one "error: <reason>" line on stderr, empty stdout,
#           raised before powershell.exe is looked for.
set -euo pipefail

die_args() { echo "error: $1" >&2; exit 2; }

case "${1:-}" in
  answer) [ -n "${2:-}" ] && [ -n "${3:-}" ] || die_args "answer needs <session> <label>" ;;
  approve) [ -n "${2:-}" ] || die_args "approve needs <session>" ;;
esac

command -v powershell.exe >/dev/null || { echo "ERROR: powershell.exe not found (Windows only)"; exit 1; }
[ $# -ge 1 ] || { echo "usage: factory.sh list|screen|pending|keys|type|send|watch|answer|approve|reject [args...]"; exit 1; }
cmd="$1"; shift
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W 2>/dev/null || pwd)"

# NUL-separated, then base64 on one line (GNU base64 wraps at 76 columns and macOS base64 has no -w).
encode() { printf '%s\0' "$@" | base64 | tr -d '\n'; }

# run_ps <command> [args...]: runs factory.ps1, leaves its stdout in $out; a failure prints it and exits 1.
run_ps() {
  local b64="" rc=0
  if [ $# -gt 1 ]; then b64="$(encode "${@:2}")"; fi
  out="$(powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$dir/factory.ps1" -Command "$1" -ArgsB64 "$b64")" || rc=$?
  if [ "$rc" -ne 0 ]; then printf '%s\n' "$out"; exit 1; fi
}

# An option row of the screen is "  [cursor ]<n>. <text>"; the cursor is the character U+276F.
cursor_mark=$'\xe2\x9d\xaf'
row_re="^[ ]*(${cursor_mark}[ ]*)?([0-9]+)\\.[ ]+(.*)\$"
pend_re='^[ ]+[0-9]+\.[ ]+(.*)$'

# scan <screen>: fills nums[] and texts[] with every option row and cur with the cursor row's number.
scan() {
  local line text
  nums=(); texts=(); cur=""
  while IFS= read -r line; do
    line="${line%$'\r'}"
    if [[ "$line" =~ $row_re ]]; then
      text="${BASH_REMATCH[3]}"
      text="${text%"${text##*[![:space:]]}"}"
      nums[${#nums[@]}]="${BASH_REMATCH[2]}"
      texts[${#texts[@]}]="$text"
      if [ -n "${BASH_REMATCH[1]}" ]; then cur="${BASH_REMATCH[2]}"; fi
    fi
  done < <(printf '%s\n' "$1")
}

# mismatch <reason> <screen>: the NEXT: keys answer.
mismatch() {
  printf 'NEXT: keys | mismatch: %s\n' "$1"
  printf '%s\n' "$2"
  exit 0
}

# press <session> <target option number> <screen already read>: scan has filled cur from that screen.
# Moves the cursor to the target (one keys call), checks the screen that call prints, then presses ENTER.
press() {
  local session="$1" tgt="$2" scr="$3"
  local diff key list="" sent="" i
  diff=$((tgt - cur))
  if [ "$diff" -ne 0 ]; then
    key=DOWN
    if [ "$diff" -lt 0 ]; then key=UP; diff=$((0 - diff)); fi
    i=0
    while [ "$i" -lt "$diff" ]; do list="${list:+$list,}$key"; i=$((i + 1)); done
    run_ps keys "$session" "$list"; scr="$out"
    sent="$list"
    scan "$scr"
    [ "$cur" = "$tgt" ] || mismatch cursor-moved "$scr"
  fi

  run_ps keys "$session" ENTER
  sent="${sent:+$sent,}ENTER"
  printf 'NEXT: done | sent: %s\n' "$sent"
  printf '%s\n' "$out"
  exit 0
}

# answer <session> <label>
answer() {
  local session="$1" label="$2"
  local pend scr tool="" nq=0 multi=0 found=0 line rest i n tgt=""
  run_ps pending "$session"; pend="$out"
  run_ps screen "$session" 40; scr="$out"

  while IFS= read -r line; do
    line="${line%$'\r'}"
    case "$line" in
      "tool: "*) tool="${line#tool: }" ;;
      Q[0-9]*" ["*)
        nq=$((nq + 1))
        case "$line" in *" (multiSelect)") multi=1 ;; esac ;;
      *)
        if [ "$nq" -gt 0 ] && [[ "$line" =~ $pend_re ]]; then
          rest="${BASH_REMATCH[1]}"
          if [[ "$rest" == "$label - "* ]] || [ "$rest" = "$label -" ]; then found=1; fi
        fi ;;
    esac
  done < <(printf '%s\n' "$pend")

  [ "$tool" = "AskUserQuestion" ] || mismatch not-asking "$scr"
  [ "$nq" -le 1 ] || mismatch several-questions "$scr"
  [ "$multi" -eq 0 ] || mismatch multi-select "$scr"
  [ "$found" -eq 1 ] || mismatch no-option "$scr"

  scan "$scr"
  n=${#nums[@]}
  i=0
  while [ "$i" -lt "$n" ]; do
    if [ "${texts[$i]}" = "$label" ]; then tgt="${nums[$i]}"; fi
    i=$((i + 1))
  done
  { [ -n "$tgt" ] && [ -n "$cur" ]; } || mismatch no-row "$scr"
  press "$session" "$tgt" "$scr"
}

# approve <session>
approve() {
  local session="$1"
  local pend scr tool="" line i n tgt="" yes=""
  run_ps pending "$session"; pend="$out"
  run_ps screen "$session" 40; scr="$out"

  while IFS= read -r line; do
    line="${line%$'\r'}"
    case "$line" in "tool: "*) tool="${line#tool: }" ;; esac
  done < <(printf '%s\n' "$pend")

  [ "$tool" = "ExitPlanMode" ] || mismatch not-asking "$scr"

  scan "$scr"
  n=${#nums[@]}
  i=0
  while [ "$i" -lt "$n" ]; do
    if [ -z "$tgt" ] && [[ "${texts[$i]}" == *"clear context"* ]] && [[ "${texts[$i]}" == *"bypass permissions"* ]]; then
      tgt="${nums[$i]}"
    fi
    if [ -z "$yes" ] && [[ "${texts[$i]}" == "Yes"* ]]; then yes="${nums[$i]}"; fi
    i=$((i + 1))
  done
  tgt="${tgt:-$yes}"
  { [ -n "$tgt" ] && [ -n "$cur" ]; } || mismatch no-row "$scr"
  press "$session" "$tgt" "$scr"
}

case "$cmd" in
  answer) answer "$@" ;;
  approve) approve "$@" ;;
esac

b64=""
if [ $# -gt 0 ]; then b64="$(encode "$@")"; fi
exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$dir/factory.ps1" -Command "$cmd" -ArgsB64 "$b64"

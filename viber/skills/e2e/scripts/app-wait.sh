#!/bin/sh
#
# app-wait.sh - probes the application the e2e skill is about to test and waits
# for it, answering in one directive line the skill acts on.
#
# It exists because the probe, the 2-second poll, the bound and the doubled wait
# were prose the model had to apply by hand, and a wrong count or a missed
# 404/401 answer sent a good application to a needless launch. The launch itself
# stays the model's own background Bash call: this script never starts, stops or
# edits the application.
#
# Contract:
#   argv   : <base-url> <seconds>, exactly two. <seconds> is digits, 0 to 540.
#            0 probes once; otherwise it probes every 2 s until an answer or
#            <seconds> of wall time have passed since the script began, probe
#            time included; the last sleep is capped at the time left. The
#            seconds the script itself slept are a floor for the elapsed time,
#            so a clock that stands still or steps back never lengthens the wait.
#   cwd    : any directory inside the host project: the repository root (the
#            cwd outside a repository) holds the launch log.
#   env    : none.
#   probe  : curl -s -o /dev/null -w "%{http_code}" --max-time 5 "<base-url>";
#            any code but 000 answers, a 404 or 401 included.
#   file   : <root>/.temp/viber/e2e/launch.log, <root> absolute with forward
#            slashes (a Windows drive as C:/). Created (its directory only) on
#            "NEXT: launch"; read, never written, on "ASK:".
#   stdout : one of
#              NEXT: test | code: <http code>
#                an answer.
#              NEXT: launch | log: <root>/.temp/viber/e2e/launch.log
#                no answer and <seconds> 0; the log's directory now exists.
#              ASK: no answer after <seconds> s | wait -> <2 x seconds, at most 540> | abort -> abort
#              log: <line>        (zero to ten lines)
#                no answer past <seconds>; the log lines are its last 10, none
#                when the file is missing or empty.
#   stderr : one "error: ..." line on exit 2.
#   exit   : 0 on every answer above; 2 with an empty stdout for an argument
#            count other than two, <seconds> not digits or past 540, or curl
#            not on PATH.
#
set -u

if [ "$#" -ne 2 ]; then
  echo "error: usage: app-wait.sh <base-url> <seconds>" >&2
  exit 2
fi

url="$1"
seconds="$2"

case "$seconds" in
  '' | *[!0-9]*)
    echo "error: <seconds> must be digits from 0 to 540" >&2
    exit 2
    ;;
esac
if [ "${#seconds}" -gt 4 ] || [ "$seconds" -gt 540 ]; then
  echo "error: <seconds> must be digits from 0 to 540" >&2
  exit 2
fi
seconds=$((seconds + 0))

if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl not found - install curl, which macOS and Git for Windows ship" >&2
  exit 2
fi

probe() {
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null)"
  case "$code" in
    [0-9][0-9][0-9]) ;;
    *) code=000 ;;
  esac
}

root="$(git rev-parse --show-toplevel 2>/dev/null)" || root="$(pwd -W 2>/dev/null || pwd)"
root="$(printf '%s' "$root" | sed 's|\\|/|g')"
log="${root}/.temp/viber/e2e/launch.log"

start="$(date +%s)"
slept=0
while :; do
  probe
  if [ "$code" != "000" ]; then
    echo "NEXT: test | code: ${code}"
    exit 0
  fi
  elapsed=$(($(date +%s) - start))
  if [ "$elapsed" -lt "$slept" ]; then
    elapsed="$slept"
  fi
  if [ "$elapsed" -ge "$seconds" ]; then
    break
  fi
  step=$((seconds - elapsed))
  if [ "$step" -gt 2 ]; then
    step=2
  fi
  sleep "$step"
  slept=$((slept + step))
done

if [ "$seconds" -eq 0 ]; then
  mkdir -p "${root}/.temp/viber/e2e" 2>/dev/null
  echo "NEXT: launch | log: ${log}"
  exit 0
fi

wait_next=$((seconds * 2))
if [ "$wait_next" -gt 540 ]; then
  wait_next=540
fi
echo "ASK: no answer after ${seconds} s | wait -> ${wait_next} | abort -> abort"
if [ -s "$log" ]; then
  tail -n 10 "$log" | tr -d '\r' | while IFS= read -r line || [ -n "$line" ]; do
    echo "log: ${line}"
  done
fi
exit 0

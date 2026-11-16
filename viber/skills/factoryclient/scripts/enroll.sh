#!/usr/bin/env bash
# Enrolls the calling Claude Code session as a factory client: writes <config>/factory/clients/<pid>.json.
# The factory acts only on enrolled sessions; procStart guards against a later process reusing the pid.
set -euo pipefail
cfg="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
pid="${CLAUDE_PID:-}"
[ -n "$pid" ] || { echo "ERROR: CLAUDE_PID is not set; run this from a Claude Code session"; exit 1; }
reg="$cfg/sessions/$pid.json"
[ -f "$reg" ] || { echo "ERROR: no session registry entry $reg"; exit 1; }
proc="$(grep -o '"procStart":"[0-9]*"' "$reg" | grep -o '[0-9][0-9]*' || true)"
[ -n "$proc" ] || { echo "ERROR: no procStart in $reg"; exit 1; }
name="$(grep -o '"name":"[^"]*"' "$reg" | head -1 | sed 's/"name":"//; s/"$//' || true)"
dir="$cfg/factory/clients"
mkdir -p "$dir"
cwd="$(grep -o '"cwd":"[^"]*"' "$reg" | head -1 | sed 's/"cwd":"//; s/"$//' || true)"  # JSON-escaped, copied as is
printf '{"pid":%s,"procStart":"%s","sessionId":"%s","cwd":"%s","enrolledAt":"%s"}\n' \
  "$pid" "$proc" "${CLAUDE_CODE_SESSION_ID:-}" "$cwd" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$dir/$pid.json"
echo "ENROLLED pid $pid ($name) in ${cwd//\\\\/\\}"

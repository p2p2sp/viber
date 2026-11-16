#!/usr/bin/env bash
# Entry point: factory.sh <command> [args...]. Passes the arguments to factory.ps1 base64-encoded,
# NUL separated, because PowerShell argument passing mangles non-ASCII text.
set -euo pipefail
command -v powershell.exe >/dev/null || { echo "ERROR: powershell.exe not found (Windows only)"; exit 1; }
[ $# -ge 1 ] || { echo "usage: factory.sh list|screen|pending|keys|type|send|watch [args...]"; exit 1; }
cmd="$1"; shift
b64=""
[ $# -gt 0 ] && b64="$(printf '%s\0' "$@" | base64 -w0)"
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W 2>/dev/null || pwd)"
exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$dir/factory.ps1" -Command "$cmd" -ArgsB64 "$b64"

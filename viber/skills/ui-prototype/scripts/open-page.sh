#!/usr/bin/env bash
#
# open-page.sh - opens one local HTML file in the user's default browser, so
# the skill hands the user a local page instead of printing its content into
# the session's context, where it would cost tokens on every later turn.
# Caller: `ui-prototype` (the built mockup).
#
# It is a bundled script because the opener differs per platform and a skill
# may only make one pre-approved literal call: `open` on macOS, the Windows
# shell's file handler through `rundll32` from Git Bash (the path converted by
# `cygpath -w`), `wslview` under WSL, `xdg-open` on a Linux desktop. `xdg-open`
# is started in the background, in its own session where `setsid` exists,
# because some desktops keep it alive for the browser's whole lifetime, which
# would hang the calling tool, and a tool that ends its process group on return
# would take the browser with it; its launch is therefore reported, not its
# outcome. A session with no opener (a remote or headless one) gets the path to
# open by hand instead.
#
# Contract:
#   argv   : $1 = the file to open (absolute or relative to the cwd).
#   cwd    : resolves a relative $1 only.
#   env    : DISPLAY, WAYLAND_DISPLAY - either one non-empty means a Linux
#            desktop can take `xdg-open`; both empty skip it.
#   reads  : $1 (existence only).
#   stdout : exactly one line, prefixed with the file's basename:
#              <name>: opened in the browser
#              <name>: the browser did not open - open <path> by hand
#              <name>: no browser to open it - open <path> by hand
#              <name>: missing at <path>
#            <path> is absolute, in the C:/ form on Windows.
#   exit   : 0 on every line above - the caller carries the line into its
#            report and never retries. 2 when $1 is absent (a wiring bug).
#
set -u

if [ "$#" -lt 1 ] || [ -z "$1" ]; then
  echo "usage: open-page.sh <file>" >&2
  exit 2
fi

name="$(basename "$1")"
dir="$(cd "$(dirname "$1")" 2>/dev/null && pwd)"
case "$1" in
  /* | [A-Za-z]:*) file="$1" ;;
  *) file="$(pwd)/$1" ;;
esac
[ -n "$dir" ] && file="$dir/$name"

shown="$file"
if command -v cygpath >/dev/null 2>&1; then
  shown="$(cygpath -m "$file" 2>/dev/null || echo "$file")"
fi

if [ -z "$dir" ] || [ ! -f "$file" ]; then
  echo "$name: missing at $shown"
  exit 0
fi

opened=none
case "$(uname -s 2>/dev/null)" in
  Darwin)
    if command -v open >/dev/null 2>&1; then
      open "$file" >/dev/null 2>&1 && opened=yes || opened=failed
    fi
    ;;
  MINGW* | MSYS* | CYGWIN*)
    if command -v rundll32 >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
      rundll32 url.dll,FileProtocolHandler "$(cygpath -w "$file")" >/dev/null 2>&1 && opened=yes || opened=failed
    fi
    ;;
  *)
    if command -v wslview >/dev/null 2>&1; then
      wslview "$file" >/dev/null 2>&1 && opened=yes || opened=failed
    elif [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
      if command -v setsid >/dev/null 2>&1; then
        setsid xdg-open "$file" </dev/null >/dev/null 2>&1 &
      else
        xdg-open "$file" </dev/null >/dev/null 2>&1 &
      fi
      opened=yes
    fi
    ;;
esac

case "$opened" in
  yes) echo "$name: opened in the browser" ;;
  failed) echo "$name: the browser did not open - open $shown by hand" ;;
  *) echo "$name: no browser to open it - open $shown by hand" ;;
esac
exit 0

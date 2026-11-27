#!/usr/bin/env bash
# viber / SessionStart hook.
#
# Shows the user the loaded plugin version, with a note when the project's
# config file is at another schema than this version's, and injects the manifest
# into the MAIN session's context (SessionStart never fires for sub-agents).
#
# Contract:
#   stdin  : the hook payload, read and ignored.
#   env    : CLAUDE_PLUGIN_ROOT, the plugin root; unset -> two levels above
#            this script.
#            CLAUDE_PROJECT_DIR, a directory of the project; unset -> the cwd.
#   stdout : { "systemMessage": "viber <version>[<schema note>]",
#              "hookSpecificOutput": { "hookEventName": "SessionStart",
#                                      "additionalContext": "<manifest>" } }
#            without additionalContext when hooks/content/manifest.md is empty
#            or unreadable.
#   exit 0 : always (fail open).
#
# <version> is the "version" of .claude-plugin/plugin.json, "dev" when it
# cannot be read.
# Schema note: the column-0 `schema:` number of `.claude/viber.yml` at the
# git top level of the project directory (the directory itself outside a
# repository; 0 when the line is absent or not a number) against the one of
# `skills/setup/templates/viber.yml`:
#   lower  -> " - .claude/viber.yml is at schema <n>, this version expects <m>: align it with the setup template"
#   higher -> " - .claude/viber.yml is at schema <n>, newer than this version's <m>: update the viber plugin"
# Equal numbers, no project file or no readable template -> no note.
# The manifest is injected VERBATIM: wrapping markers and any preamble live in
# manifest.md, not here.
# `resume` is excluded by the matcher in hooks.json: the prior injection
# reloads with the transcript.

set -u
# NB: no `set -e` -- fail open requires swallowing non-zero exits.

root="${CLAUDE_PLUGIN_ROOT:-}"
[ -z "$root" ] && root="$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)"

escape_for_json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

# Drain the payload so the writer never hits EPIPE.
cat >/dev/null 2>&1

version="$(grep -m1 -oE '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$root/.claude-plugin/plugin.json" 2>/dev/null \
  | sed -E 's/.*"([^"]*)"$/\1/')"
[ -z "$version" ] && version="dev"
banner="viber ${version}"

# Prints the number of the column-0 `schema:` line of file $1, 0 when the line
# is absent or not a number. Prints nothing when the file cannot be read.
schema_of() {
  local line
  [ -f "$1" ] && [ -r "$1" ] || return 1
  line="$(grep -m1 -E '^schema:' "$1" 2>/dev/null | tr -d '\r')"
  line="${line#schema:}"
  line="${line%%#*}"
  line="${line//[[:space:]]/}"
  case "$line" in
    ''|*[!0-9]*) printf '0' ;;
    *) printf '%s' "$((10#$line))" ;;
  esac
}

project="${CLAUDE_PROJECT_DIR:-$PWD}"
top="$(git -C "$project" rev-parse --show-toplevel 2>/dev/null)"
[ -n "$top" ] && project="$top"
expected="$(schema_of "$root/skills/setup/templates/viber.yml")"
actual="$(schema_of "$project/.claude/viber.yml")"
if [ -n "$expected" ] && [ -n "$actual" ]; then
  if [ "$actual" -lt "$expected" ]; then
    banner="${banner} - .claude/viber.yml is at schema ${actual}, this version expects ${expected}: align it with the setup template"
  elif [ "$actual" -gt "$expected" ]; then
    banner="${banner} - .claude/viber.yml is at schema ${actual}, newer than this version's ${expected}: update the viber plugin"
  fi
fi

manifest="$(cat "$root/hooks/content/manifest.md" 2>/dev/null)"

# `systemMessage` MUST stay top-level: nested in `hookSpecificOutput` it is
# silently ignored by Claude Code.
if [ -z "$manifest" ]; then
  printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"SessionStart"}}\n' \
    "$(escape_for_json "$banner")"
  exit 0
fi

printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' \
  "$(escape_for_json "$banner")" \
  "$(escape_for_json "$manifest")"
exit 0

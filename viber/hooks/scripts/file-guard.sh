#!/usr/bin/env bash
#
# file-guard.sh - viber / PreToolUse hook on Edit and Write: refuses the edit a
# task coder makes to a file another unfinished task claims. The wrapper that
# runs file-guard.ts beside it, and only for a viber:task-coder call.
#
# Why a wrapper with a filter: the hook fires on every Edit and Write of every
# session the plugin is loaded in, and starting node costs tens of milliseconds
# each time. The filter below decides on the head of the payload with bash
# builtins alone, so the main session and every other agent pay one bash start
# and, past a 4096-character payload carrying no agent_type in its head, one
# fork. The rule itself lives in file-guard.ts and viber/lib/file-guard.ts, where
# it is tested in process.
#
# Why the head: bash reads a pipe one byte per system call, so reading a whole
# payload with "read" took 0.3 s per megabyte (1.7 s for a 5 MB Write) on every
# Write of every session. The top-level keys of a hook payload stand ahead of
# tool_input, which holds the file text, so the first 4096 characters name the
# caller. A longer payload with no agent_type there is a main-session call, or
# carries the key late: its rest is read in blocks by one command substitution,
# so the key is found wherever it stands.
#
# Contract:
#   argv   : none - every input arrives on stdin.
#   cwd    : irrelevant; every path comes from the payload.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#            No `node`: nothing printed, the edit goes on.
#   file   : file-guard.ts beside this script and viber/lib/ two directories up,
#            found from the invoked path with either separator.
#   stdin  : PreToolUse JSON. Read here: the top-level "agent_type" (present
#            only inside a subagent), in the first 4096 characters, and in the
#            rest only when those hold no complete agent_type. Empty, malformed
#            or truncated input, no agent_type, or one that is not
#            viber:task-coder -> nothing printed; a caller whose agent_type
#            stands in the head leaves before the rest of stdin is read, and no
#            external command runs for a caller that is no coder. Text quoting
#            the key inside tool_input carries escaped quotes and never matches.
#   stdout : for viber:task-coder what file-guard.ts prints for the same stdin:
#            nothing, or the one deny line its header defines, whose reason opens
#            with the "viber guard: " marker.
#   exit 0 : always (fail-open: a broken guard must never block an edit).
set -u

whole=0
IFS= read -r -n 4096 -d '' input || whole=1
if [[ $whole -eq 0 ]] && ! [[ "$input" =~ \"agent_type\"[[:space:]]*:[[:space:]]*\"[^\"]*\" ]]; then
  input="$input$(</dev/stdin)"
  whole=1
fi
[[ "$input" =~ \"agent_type\"[[:space:]]*:[[:space:]]*\"viber:task-coder\" ]] || exit 0
command -v node >/dev/null 2>&1 || exit 0

if [[ $whole -eq 1 ]]; then
  printf '%s' "$input" | node "${0%[/\\]*}/file-guard.ts" 2>/dev/null
else
  { printf '%s' "$input"; cat; } | node "${0%[/\\]*}/file-guard.ts" 2>/dev/null
fi
exit 0

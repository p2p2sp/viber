#!/usr/bin/env bash
#
# verdict-nudge.sh - viber / SubagentStop hook: sends an agent back once when it ends without its output line.
#
# Every viber agent but scout, mapper and hunter ends its final message on a
# VERDICT: line (the code-auditor's agents on an AUDIT: line). An agent that stops
# without one leaves the dispatching skill to compose a second reply by hand. This
# hook blocks the stop once with a short nudge, so the agent itself returns the
# line; stop_hook_active (set by the harness on the second stop) ends the loop.
#
# Contract:
#   argv   : none - every input arrives on stdin.
#   cwd    : irrelevant; no path is read or written.
#   env    : none read; LC_ALL=C is set so the message is scanned by byte, in linear
#            time (a UTF-8 locale makes each character lookup scan from the start).
#   reads  : nothing but stdin. A call whose agent_type is not a nudged viber:
#            agent returns before any external command runs (bash builtins only).
#   stdin  : SubagentStop JSON. Read: the top-level "agent_type", "stop_hook_active"
#            and "last_assistant_message" (JSON-unescaped: \n, \r, \t, \", \\).
#            Empty, malformed or truncated input, no agent_type, no message -> nothing printed.
#   stdout : nothing, or exactly one line when all hold: agent_type starts "viber:"
#            and is none of viber:scout, viber:mapper, viber:hunter; stop_hook_active
#            is not true; last_assistant_message is present; and no line of it,
#            after optional leading whitespace and any leading "`", "*" or "-"
#            characters, starts "VERDICT:" or "AUDIT:":
#            {"decision":"block","reason":"Finish your task, then return your output lines."}
#   exit 0 : always (fail-open: a broken hook must never hold an agent).
#            JSON is read with bash regexes; jq is not assumed.
set -u
LC_ALL=C

IFS= read -r -d '' input || true

type_re='"agent_type"[[:space:]]*:[[:space:]]*"(viber:[^"\\]*)"'
[[ "$input" =~ $type_re ]] || exit 0
case "${BASH_REMATCH[1]}" in
  viber:scout | viber:mapper | viber:hunter) exit 0 ;;
esac

active_re='"stop_hook_active"[[:space:]]*:[[:space:]]*true'
[[ "$input" =~ $active_re ]] && exit 0

msg_re='"last_assistant_message"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)"'
[[ "$input" =~ $msg_re ]] || exit 0
msg="${BASH_REMATCH[1]}"

# JSON-unescape the message: \\ goes through a placeholder so that \\n stays a
# backslash followed by n.
sep=$'\001'
nl=$'\n'
cr=$'\r'
tab=$'\t'
bs='\'
dq='"'
msg="${msg//\\\\/$sep}"
msg="${msg//\\\"/$dq}"
msg="${msg//\\n/$nl}"
msg="${msg//\\r/$cr}"
msg="${msg//\\t/$tab}"
msg="${msg//$sep/$bs}"

line_re='(^|'"$nl"')[[:blank:]`*-]*(VERDICT|AUDIT):'
[[ "$msg" =~ $line_re ]] && exit 0

printf '%s\n' '{"decision":"block","reason":"Finish your task, then return your output lines."}'
exit 0

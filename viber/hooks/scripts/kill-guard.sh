#!/usr/bin/env bash
#
# kill-guard.sh - viber / PreToolUse hook on Bash: refuses stopping processes by name.
#
# Inside a viber agent, refuses a Bash command that stops processes by name
# (killall, pkill, taskkill by image name, xargs running kill, kill fed by a
# command substitution) and tells the model to stop only the PIDs it started
# itself, with kill <PID>, then confirm each is gone with kill -0 <PID>.
#
# Why a hook: an agent that hunts processes by name (a leftover test host, a
# dev server) also stops processes it never started - the user's own, or another
# coder's in the shared tree. The instruction in the agents is soft; this is the
# hard edge. The hook never answers allow: anything it does not refuse stays
# with the normal permission flow.
#
# Contract:
#   argv   : none - every input arrives on stdin.
#   cwd    : irrelevant; no path is read or written.
#   env    : none read; LC_ALL=C is set so the command is scanned by byte, in linear
#            time (a UTF-8 locale makes each character lookup scan from the start).
#   reads  : nothing but stdin. A call whose input does not name a viber: agent
#            returns before any external command runs (bash builtins only).
#   stdin  : PreToolUse JSON. Read: the top-level "agent_type" (present only
#            inside a subagent) and "tool_input.command". Empty, malformed or
#            truncated input, no agent_type, an agent_type not starting with
#            "viber:", or no command -> nothing printed.
#   stdout : nothing, or one line when agent_type starts with "viber:" and the
#            command holds, in command position (the start of the command or right
#            after ; & | ( a backtick, $( or a newline, whitespace allowed):
#              - killall or pkill
#              - taskkill with an /IM argument (any case, one or two slashes)
#              - xargs whose command word is kill (xargs options allowed between)
#              - kill whose arguments hold a command substitution ($( or a backtick)
#            {"hookSpecificOutput":{"hookEventName":"PreToolUse",
#             "permissionDecision":"deny","permissionDecisionReason":"viber guard: <text>"}}
#            The reason opens with the "viber guard: " marker, which tells the
#            agent the refusal is a rule to follow, never a reason to halt.
#            kill <PID>, kill -0 <PID>, kill $!, taskkill by PID and a name merely
#            quoted as an argument (grep killall notes.md) are not refused.
#   exit 0 : always (fail-open: a broken guard must never block a command).
#            JSON is read with bash regexes; jq is not assumed.
set -u
LC_ALL=C

IFS= read -r -d '' input || true
[[ "$input" =~ \"agent_type\"[[:space:]]*:[[:space:]]*\"viber: ]] || exit 0

command_re='"command"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)"'
[[ "$input" =~ $command_re ]] || exit 0
cmd="${BASH_REMATCH[1]}"

# JSON-unescape the command: \\ goes through a placeholder so that \\n stays a
# backslash followed by n.
sep=$'\001'
nl=$'\n'
cr=$'\r'
tab=$'\t'
bs='\'
dq='"'
sq="'"
sl='/'
amp='&'
lt='<'
gt='>'
cmd="${cmd//\\\\/$sep}"
cmd="${cmd//\\\"/$dq}"
cmd="${cmd//\\n/$nl}"
cmd="${cmd//\\r/$cr}"
cmd="${cmd//\\t/$tab}"
cmd="${cmd//\\\//$sl}"
cmd="${cmd//\\u0026/$amp}"
cmd="${cmd//\\u003c/$lt}"
cmd="${cmd//\\u003e/$gt}"
cmd="${cmd//\\u0027/$sq}"
cmd="${cmd//$sep/$bs}"

cp='(^|[;&|(`'"$nl"'])[[:space:]]*'
end='([^[:alnum:]_.-]|$)'
span='[^;&|'"$nl"']*'
xargs_opts='(([[:space:]]+-[nPILsdEa][[:space:]]+[^[:space:];&|]+)|([[:space:]]+-[^[:space:];&|]*))*'

if [[ "$cmd" =~ ${cp}(killall|pkill)${end} ]] \
  || [[ "$cmd" =~ ${cp}taskkill${span}[[:space:]]//?[iI][mM]([[:space:]]|$) ]] \
  || [[ "$cmd" =~ ${cp}xargs${xargs_opts}[[:space:]]+kill${end} ]] \
  || [[ "$cmd" =~ ${cp}kill[[:space:]]${span}(\$\(|\`) ]]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"viber guard: Stopping processes by name is refused in viber agents: it also stops processes you did not start. Stop only the PIDs you started yourself with kill <PID>, then confirm each is gone with kill -0 <PID>."}}'
fi
exit 0

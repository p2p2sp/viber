#!/usr/bin/env bash
#
# plan-hints.sh - viber / UserPromptSubmit hook: the review hint for a plan written outside the planner.
#
# Injects one rule into the model's context on every prompt sent in plan
# mode: a fresh outside-plan-review after every plan write, its PASS before
# ExitPlanMode. The rule's text lives in hooks/content/plan-hints.md, injected
# verbatim, so a wording change never touches this script. A plan the viber
# chain drives has its own reviewers, so a planner, intent or fixer Skill
# tool_use in the current plan-mode episode (or one whose own EnterPlanMode
# opened it), or a typed /viber:intent or /viber:fixer command in it, silences
# the hint. intent and fixer only hand off to the planner,
# so plan-gate.sh does not count them: its planner-review choice needs the
# planner itself.
#
# Why a hook: the rule only matters while an outside plan is written, so carrying
# it in the session manifest spent context in every session for nothing. The
# hint is soft; outside-plan-review (plan-gate.sh, planning.outside-plan-review: true)
# is what enforces the review.
#
# The episode window and the Skill grep are copied from plan-gate.sh, the grep
# widened to intent and fixer plus their typed commands: keep both in step, a
# rename on either side disarms the other silently. The gate additionally
# requires the planner's frontmatter in the plan file, which this hook cannot
# see (it runs before any plan exists), so a refused planner leaves the hint
# silenced for the rest of the episode - accepted, as the hint is soft.
#
# Like plan-gate.sh, every transcript scan skips the "api-request-blob" records,
# whose replayed messages look like live events.
#
# Contract:
#   argv   : none - every input arrives on stdin.
#   cwd    : irrelevant; the payload carries an absolute "transcript_path".
#   env    : none read.
#   reads  : the transcript file named by the payload's "transcript_path", only
#            to look for a planner, intent or fixer Skill tool_use, or a typed
#            /viber:intent or /viber:fixer command, in the current episode. A
#            missing or unreadable transcript counts as none. Then
#            ../content/plan-hints.md beside this script (via $0), the hint
#            text; an empty, missing or unreadable file -> nothing printed.
#   stdin  : UserPromptSubmit JSON; "permission_mode" decides. Absent, empty,
#            or any value but "plan" -> nothing printed. Empty stdin -> the same.
#   stdout : nothing, or in plan mode
#            {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit",
#             "additionalContext":"<plan-hints.md, trailing newlines cut>"}}
#   exit 0 : always (fail-open: a broken hint must never block a prompt).
#            JSON is read with grep/sed; jq is not assumed.
set -u

# Value of a top-level string key, JSON-unescaped enough for a Windows path
# ("C:\\Users\\.." -> "C:\Users\.."). Same as plan-gate.sh.
json_str() {
  printf '%s' "$2" \
    | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
    | head -n1 \
    | sed -E "s/^\"$1\"[[:space:]]*:[[:space:]]*\"(.*)\"$/\1/" \
    | sed 's/\\\\/\\/g'
}

input="$(cat)"
[ -n "$input" ] || exit 0
printf '%s' "$input" | grep -qE '"permission_mode"[[:space:]]*:[[:space:]]*"plan"' || exit 0

transcript_path="$(json_str transcript_path "$input")"
if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
  # Episode window, as in plan-gate.sh: everything after the last turn recorded
  # in a non-plan permission mode.
  episode_start=$(
    grep -nE '"type":"permission-mode"' "$transcript_path" 2>/dev/null \
      | grep -vE '"type":"api-request-blob"' \
      | grep -vE '"permissionMode":"plan"' \
      | tail -n1 \
      | cut -d: -f1
  )
  episode_start="${episode_start:-0}"

  # Chain Skill tool_use, as in plan-gate.sh but also intent and fixer: bare or
  # "viber:"-prefixed, inside the episode or directly followed by its own
  # EnterPlanMode inside it. A typed /viber:intent or /viber:fixer records no
  # Skill tool_use, only a user message opening with <command-message>; it
  # counts inside the episode. The planner is not user-invocable, so it has none.
  planner_raw="$(
    awk '
      /"type":"api-request-blob"/ { next }
      /"name":"Skill"/ && /"skill":"(viber:)?(planner|intent|fixer)"/ { skill = NR; entry = 0; pending = 1; next }
      /"message":[{]("role":"user",)?"content":"<command-message>viber:(intent|fixer)<\/command-message>/ { skill = NR; entry = 0; pending = 0; next }
      pending && /"type":"tool_use",("id":"[^"]*",)?"name":"EnterPlanMode"/ { entry = NR; pending = 0; next }
      pending && (/"permissionMode":"plan"/ || /"message":[{]("role":"user",)?"content":"/) { pending = 0 }
      END { print skill + 0, entry + 0 }
    ' "$transcript_path" 2>/dev/null
  )"
  printf '%s' "$planner_raw" | grep -qE '^[0-9]+ [0-9]+$' || planner_raw="0 0"
  set -- $planner_raw
  if [ "$1" -gt "$episode_start" ] || [ "$2" -gt "$episode_start" ]; then
    exit 0
  fi
fi

hints="$(cat "$(dirname "$0")/../content/plan-hints.md" 2>/dev/null)"
[ -n "$hints" ] || exit 0
hints="${hints//\\/\\\\}"
hints="${hints//\"/\\\"}"
hints="${hints//$'\n'/\\n}"
hints="${hints//$'\r'/\\r}"
hints="${hints//$'\t'/\\t}"
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}\n' "$hints"
exit 0

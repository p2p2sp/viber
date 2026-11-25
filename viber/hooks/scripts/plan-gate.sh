#!/usr/bin/env bash
#
# plan-gate.sh - viber / PreToolUse hook for ExitPlanMode: the plan review gate.
#
# Why a hook: a plan leaves plan mode only with a trace of its review, and the
# model skipping the review, or handing the user a plan whose review failed and
# was never answered, is the failure a rule in a prompt does not stop. The gate
# asks for that trace alone. The review runs at most two rounds and its second
# fix is checked by script, so the approved text is by design not the reviewed
# text: the gate never compares the plan file with what the reviewer read.
#
# Armed only when the CURRENT plan-mode episode shows a Write/Edit of a
# plans/*.md file - plan mode names that path itself, so it is the harness plans
# directory unless the project redirects it. The episode then picks its reviewer:
#   - a Skill tool_use for "planner" in the episode, or one whose own
#     EnterPlanMode opened it (the skill is user-invocable: false, so a model
#     dispatch is the only way it runs), AND the plan file opens with the
#     planner's frontmatter `source:` line (an unreadable plan keeps the
#     planner's reviewer) -> the plan-judge agent, always;
#   - anything else -> a plan written outside the planner, gated by the
#     outside-plan-review agent only when config.sh resolves
#     `planning.outside-plan-review: true` for the session's cwd, whatever files it names.
# Anything else - no plan write, planning.outside-plan-review off, a plan-mode exit in a session
# that already built a plan - passes untouched. The episode starts after the
# last non-plan permission mode recorded before plan mode was entered or after an
# ExitPlanMode that was not refused, so a plan approved earlier in the session
# cannot re-arm the gate, while the user switching plan mode off and on by hand
# closes nothing.
#
# When armed, the gate reads the verdict of the LAST completed (dispatch ->
# verdict) pair of the chosen agent inside the episode and denies ExitPlanMode
# in three cases only, each with its own next step:
#   1. no pair completed - the agent was never dispatched, or its dispatch has
#      no verdict yet: review the plan;
#   2. that verdict is DENIED (the harness refused a tool call of the reviewer)
#      and no answering call follows its verdict line: grant the permission,
#      then review again;
#   3. that verdict is FAIL and no answering write follows its verdict line:
#      answer the review.
# Everything else allows: a PASS, whatever was written to the plan after it, and
# a DENIED or a FAIL that was answered. A verdict of the other reviewer never
# counts.
#
# A PASS stands through the fix writes of its plan, not through a new plan: a
# pair counts only when its dispatch follows the last assembly of a plan
# surveyed anew (a plan-build.sh `survey` call, then a tool_result opening on
# the `assembled: <n> tasks` line of its `assemble`). That is where the script
# starts its own round counter again, so its `judge` prints a new block there.
#
# What answers is a transcript line after the verdict line, the line alone
# counting, whether or not the call wrote:
#   - a DENIED: only a Bash tool_use whose command runs plan-build.sh with
#     `judged`, names a plans/*.md path and carries the word DENIED after it. The
#     planner reports a refused second review round that way, and its script
#     records that the round did not run and sends the session on to
#     ExitPlanMode. The review of a plan written outside the planner has no such
#     call, so there a DENIED denies until a new review returns;
#   - a FAIL: a Write/Edit of a plans/*.md file, a Bash tool_use whose command
#     runs plan-build.sh with `apply` or `open` and names a plans/*.md path (the
#     planner answers a FAIL through that script: `apply` writes the fix, `open`
#     records the finding it could not fix), or one that runs it with `judged`,
#     names a plans/*.md path and carries the word `none` after it (a FAIL whose
#     findings could not be read: plan-build.sh answers the FAIL report of one
#     with `NEXT: judged | none`, so the session makes that call). The `none`
#     call answers no FAIL of round one, told by the `round: 1` line of the
#     dispatch prompt: there the script ends on `STOP:` and the plan stays
#     unreviewed, while in round two it ends the review and sends the session
#     on to ExitPlanMode. A prompt with no round line keeps the answer.
# A `judged` call with PASS or FAIL answers nothing. The subcommand and the
# verdict word may stand in quotes of either kind or in none. Only a Write/Edit
# arms the gate and names the plan file.
#
# The pair is bound by the dispatch's tool-use id where the transcript carries
# it: a later pair supersedes an earlier one both ways, and a verdict quoted
# anywhere else never counts as one. An id-bearing dispatch binds ONLY to a
# verdict line carrying that same id - no weaker fallback: a foreign verdict
# (another id, or none) arriving while the own review is still running is
# invisible to the pairing. A dispatch line that carries no id at all keeps the
# older, looser pairing: the first verdict line after it.
#
# Every transcript scan skips the "api-request-blob" records: each replays a whole
# earlier message on one line, so its tool_use blocks look like live events.
#
# Contract:
#   argv   : none - every input arrives on stdin.
#   cwd    : irrelevant; the payload's own "cwd" key is the session directory.
#            It resolves a RELATIVE plan "file_path" the transcript records,
#            and is where ../../scripts/config.sh runs to read planning.outside-plan-review.
#            No "cwd" key -> planning.outside-plan-review is off.
#   env    : none read.
#   reads  : the transcript file named by the payload's "transcript_path", the
#            config.sh output for the session's cwd (outside plan only), and,
#            once the plan write line resolves a path, the frontmatter of the
#            plan file itself (planner ownership). Nothing else of the plan
#            file is read: neither its body nor its mtime.
#   stdin  : PreToolUse JSON with at least { "transcript_path": "<abs path>" }
#   stdout : {"hookSpecificOutput":{"hookEventName":"PreToolUse",
#             "permissionDecision":"allow"|"deny","permissionDecisionReason":"..."}}
#            Every deny reason opens with "Next step:".
#   exit 0 : always. Every parse miss or unreadable file falls back to allow -
#            a broken gate must not trap the user in plan mode - except the plan
#            file under a planner signal: a miss there keeps plan-judge
#            rather than loosening the gate to the outside path. JSON is read with
#            grep/sed/awk; jq is not assumed. A malformed or empty result from
#            any read (including a broken awk on PATH) fails open the same way.
set -u

emit_allow() {
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
  exit 0
}

emit_deny() {
  reason="${1//\\/\\\\}"
  reason="${reason//\"/\\\"}"
  printf '%s\n' "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"${reason}\"}}"
  exit 0
}

# Value of a top-level string key, JSON-unescaped enough for a Windows path
# ("C:\\Users\\.." -> "C:\Users\..").
json_str() {
  printf '%s' "$2" \
    | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
    | head -n1 \
    | sed -E "s/^\"$1\"[[:space:]]*:[[:space:]]*\"(.*)\"$/\1/" \
    | sed 's/\\\\/\\/g'
}

input="$(cat)"
[ -n "$input" ] || emit_allow

transcript_path="$(json_str transcript_path "$input")"
[ -n "$transcript_path" ] && [ -f "$transcript_path" ] || emit_allow
project_cwd="$(json_str cwd "$input")"

# Episode window: everything after the last non-plan permission-mode record that
# closed an episode. Such a record closes one when plan mode was not entered before
# it (the turns ahead of plan mode) or when an ExitPlanMode that was not refused
# precedes it (the plan was approved). Keeps a plan that was approved and built
# earlier in this session - its file since touched by the implementor - from arming
# the gate on a later, unrelated exit. A non-plan record reached from plan mode with
# no such exit is the user switching the mode by hand: it closes nothing, so the
# planner keeps its plan and a written plan stays armed. A refused ExitPlanMode is
# the tool_result carrying its id and "is_error":true; one without an id is
# refused by the first such result after it.
episode_start="$(
  awk '
    /"type":"api-request-blob"/ { next }
    /"type":"tool_use",("id":"[^"]*",)?"name":"EnterPlanMode"/ { in_plan = 1; next }
    /"type":"tool_use",("id":"[^"]*",)?"name":"ExitPlanMode"/ {
      exit_open = 1; exit_id = ""
      if (match($0, /"type":"tool_use","id":"[^"]*","name":"ExitPlanMode"/)) {
        exit_id = substr($0, RSTART, RLENGTH)
        sub(/^"type":"tool_use","id":"/, "", exit_id)
        sub(/","name":"ExitPlanMode"$/, "", exit_id)
      }
      next
    }
    exit_open && /"type":"tool_result"/ && /"is_error":true/ && (exit_id == "" || index($0, "\"tool_use_id\":\"" exit_id "\"")) { exit_open = 0; next }
    /"type":"permission-mode"/ {
      if (/"permissionMode":"plan"/) { in_plan = 1; next }
      if (!in_plan || exit_open) { start = NR; in_plan = 0 }
      exit_open = 0
    }
    END { print start + 0 }
  ' "$transcript_path" 2>/dev/null
)"
printf '%s' "$episode_start" | grep -qE '^[0-9]+$' || episode_start=0

# The plan file itself. Anchored on the "file_path" key of a Write/Edit, so a plan
# path merely quoted in prose or read back does not arm the gate. Both separators
# are matched: Windows records "C:\\Users\\..\\plans\\..".
plan_write_line=$(
  grep -nE '"file_path":"[^"]*[\\/]+plans[\\/]+[^"]*\.md"' "$transcript_path" 2>/dev/null \
    | grep -vE '"type":"api-request-blob"' \
    | grep -E '"(tool_name|name)":"(Write|Edit)"' \
    | tail -n1 \
    | cut -d: -f1
)
[ -n "$plan_write_line" ] && [ "$plan_write_line" -gt "$episode_start" ] || emit_allow

plan_path=$(
  PLAN_WRITE_LINE="$plan_write_line" awk 'NR == ENVIRON["PLAN_WRITE_LINE"] + 0' "$transcript_path" 2>/dev/null \
    | grep -oE '"file_path":"[^"]*[\\/]+plans[\\/]+[^"]*\.md"' \
    | tail -n1 \
    | sed -E 's/^"file_path":"(.*)"$/\1/' \
    | sed 's/\\\\/\\/g'
)
# A relative file_path resolves against the session cwd.
if [ -n "$plan_path" ] && [ ! -f "$plan_path" ] && [ -n "$project_cwd" ] && [ -f "$project_cwd/$plan_path" ]; then
  plan_path="$project_cwd/$plan_path"
fi
plan_name="${plan_path##*[\\/]}"

# Which review owns this plan. The planner skill running picks its own reviewer:
# a Skill tool_use is the only form it can take - the skill is user-invocable:
# false, so no typed command ever loads it. An escaped mention inside some other
# tool's payload cannot match: `\"skill\":\"planner\"` carries a backslash where
# the pattern needs the quote. Only viber's own install form arms the gate: bare
# "planner" or "viber:planner" - another plugin's "xyz:planner" is not this one.
#
# The planner loads in normal mode and calls EnterPlanMode itself, and Claude Code
# can flush the old permission mode mid-turn between the two, which puts the Skill
# line before episode_start. So the planner also owns the episode when the first
# signal after its Skill line is its own EnterPlanMode tool_use and that entry lies
# inside the episode. A user prompt or a plan-mode record reached first ends the
# pending entry: a refused planner followed by a new request stays out.
#
# The Skill signal alone is not ownership: a refused planner followed by an outside
# plan in the same episode would otherwise hand that plan to plan-judge. The
# planner writes a `source:` key into the frontmatter of every plan, and a plan
# written outside it never carries one, so the plan file itself
# must open with that frontmatter. A plan path that resolves to nothing, or a
# file that cannot be read, keeps plan-judge: a read miss never loosens the gate.
planner_raw="$(
  awk '
    /"type":"api-request-blob"/ { next }
    /"name":"Skill"/ && /"skill":"(viber:)?planner"/ { skill = NR; entry = 0; pending = 1; next }
    pending && /"type":"tool_use",("id":"[^"]*",)?"name":"EnterPlanMode"/ { entry = NR; pending = 0; next }
    pending && (/"permissionMode":"plan"/ || /"message":[{]("role":"user",)?"content":"/) { pending = 0 }
    END { print skill + 0, entry + 0 }
  ' "$transcript_path" 2>/dev/null
)"
printf '%s' "$planner_raw" | grep -qE '^[0-9]+ [0-9]+$' || planner_raw="0 0"
set -- $planner_raw
planner_owns=0
if [ "$1" -gt "$episode_start" ] || [ "$2" -gt "$episode_start" ]; then
  planner_owns=1
  if [ -n "$plan_path" ] && [ -f "$plan_path" ] && [ -r "$plan_path" ]; then
    # Prints 1 for a `source:` line inside a frontmatter block that opens on line 1,
    # else 0. A CR is stripped first, so a plan saved with CRLF endings still counts.
    # Any other output is a broken read and keeps the planner.
    planner_fm="$(
      awk '
        { sub(/\r$/, "") }
        NR == 1 { if ($0 != "---") exit; next }
        $0 == "---" { exit }
        /^source:/ { found = 1; exit }
        END { print found + 0 }
      ' "$plan_path" 2>/dev/null
    )"
    [ "$planner_fm" = "0" ] && planner_owns=0
  fi
fi

# Text of the refusals. Under the planner, a plan the model wrote by hand reaches
# this gate with the planner steps ahead of the review skipped, and a refusal
# naming the review alone would send it straight past them: steps_first names
# them. dispatch_with is what the reviewer is dispatched with, answer_with what
# answers its FAIL. For a plan written outside the planner the dispatch is what
# agents/outside-plan-review.md takes as its input and content/plan-hints.md
# tells the session to send: the three name the same second dispatch, the
# CRITICAL lines of the first review and what was changed for each added.
steps_first=""
if [ "$planner_owns" = "1" ]; then
  agent="plan-judge"
  steps_first="first run the planner skill steps this plan has not been through, their scripts being expected in plan mode, then plan-build.sh judge, whose printed block is the dispatch. Then "
  writer="The planner skill"
  dispatch_with="the block plan-build.sh judge prints"
  answer_with="report the verdict with plan-build.sh judged and act on what it prints"
  gate="the planner's review gate"
else
  # A plan written outside the planner is gated only when the host turned
  # planning.outside-plan-review on. config.sh stays the one parser of viber.yml; it
  # resolves the repository from its cwd, so it runs in the session's own cwd, and a
  # payload without one leaves the switch off.
  [ -n "$project_cwd" ] && [ -d "$project_cwd" ] || emit_allow
  config_sh="$(dirname "$0")/../../scripts/config.sh"
  plan_review=$(cd "$project_cwd" 2>/dev/null && bash "$config_sh" 2>/dev/null | grep -E '^planning\.outside-plan-review: ')
  [ "$plan_review" = "planning.outside-plan-review: true" ] || emit_allow
  agent="outside-plan-review"
  writer="Plan mode"
  dispatch_with="the plan path and one sentence stating the user's goal, and on a second review the CRITICAL lines of the first plus what you changed for each"
  answer_with="fix its CRITICAL lines in the plan, or add the ones you cannot fix under \"## Open items\""
  gate="the plan review gate (planning.outside-plan-review in .claude/viber.yml)"
fi

# The review trace: the last completed (dispatch -> verdict) pair of the chosen
# agent inside the episode.
#
# Dispatch line: an Agent tool_use carrying "subagent_type":"<agent>" - or
# "viber:<agent>", the prefixed form a plugin-shipped agent gets - plus its
# "toolu_..." id when the line exposes one.
# Verdict line : the agent's own report - inline as a tool_result, or, for a
# background agent, inside the <result> of its task-notification. The verdict must
# open a line (escaped \n), a content string, or the <result> element, and its value
# must end the token, so a quoted "VERDICT: PASS is not..." cannot pass as one.
# Markdown emphasis the agent wraps around the label or the value (* _ `, as in
# "**VERDICT: PASS**" or "**VERDICT:** PASS") is skipped, never read as missing.
# Pairing binds strictly on the dispatch's own tool-use id when it carries one: a
# verdict line missing that id (another dispatch's, or none at all) is skipped
# outright, never kept as a fallback, so a foreign VERDICT while the own review is
# still in flight cannot be mistaken for it. A dispatch line with no id at all
# falls back to the first verdict after it; the later completed pair wins either
# way.
# A background agent's launch record ("status":"async_launched") carries the
# dispatch id AND echoes the whole prompt, so it is never read as a verdict.
#
# The round of a pair is the first `round: <n>` line of its dispatch prompt, the
# second line of the block plan-build.sh judge prints; 0 when the prompt holds
# none.
#
# A plan assembled anew is a new text: the pairs ahead of it count no more. The
# mark is the one plan-build.sh keeps for its own round counter, a `survey` call
# and then an assembly that wrote the plan, read here as a Bash tool_use of
# plan-build.sh with `survey` (quoted or not) followed by a tool_result opening
# on the `assembled: <n> tasks` line a successful `assemble` prints. A survey
# alone, an assembly with no survey ahead of it and an assembly the script
# refused reset nothing, there as here. The patterns hold no interval
# expression: not every awk reads one.
pair_raw="$(
  PAIR_START="$((episode_start + 1))" PAIR_AGENT="$agent" awk '
    BEGIN { start = ENVIRON["PAIR_START"] + 0; agent = ENVIRON["PAIR_AGENT"] }
    NR < start { next }
    /"type":"api-request-blob"/ { next }
    $0 ~("\"subagent_type\":\"([a-zA-Z0-9_.-]+:)?" agent "\"") {
      last_dispatch = NR; call = NR; cid = ""; cround = 0
      if (match($0, /"id":"toolu_[A-Za-z0-9_-]+"/)) cid = substr($0, RSTART + 6, RLENGTH - 7)
      if (match($0, /(\\n|")round: [0-9]+(\\n|")/)) {
        cround = substr($0, RSTART, RLENGTH)
        gsub(/[^0-9]/, "", cround)
      }
      next
    }
    /"(tool_name|name)":"Bash"/ && /plan-build\.sh[[:punct:]]?[[:punct:]]?[[:space:]]+[[:punct:]]?[[:punct:]]?survey[^[:alnum:]_-]/ { surveyed = 1; next }
    surveyed && /"type":"tool_result"/ && /"(text|content|stdout)":"assembled: [0-9]+ tasks/ {
      surveyed = 0; last_dispatch = 0; call = 0; best_call = 0; best_verdict = 0; best_round = 0
      next
    }
    /"status":"async_launched"/ { next }
    call && /(\\n|"(text|content)":"|<result>)[[:space:]]*[*_`]*VERDICT:[*_`]*[[:space:]]+[*_`]*(PASS|FAIL|DENIED)[*_`]*[[:space:]]*(\\n|"|<)/ {
      if (cid != "" && index($0, cid) == 0) {
        # This dispatch carries its own id, and this verdict line does not -
        # a sibling agent reply, or an echo. It cannot be this dispatch answer,
        # so it is skipped outright, never remembered as a fallback: the own
        # review stays in flight until a line carrying cid shows up.
        next
      }
      best_call = call; best_verdict = NR; best_round = cround; call = 0
    }
    END {
      print last_dispatch + 0, best_call + 0, best_verdict + 0, best_round + 0
    }
  ' "$transcript_path" 2>/dev/null
)"

# The awk pipeline above always prints exactly four numbers on success (its
# END block runs unconditionally). Anything else - empty output, a partial
# line, non-numeric text - means the read itself broke (no working awk on
# PATH, a killed process) rather than a legitimate "nothing found yet"
# (which prints as the well-formed "0 0 0 0"). Fail open rather than read that
# breakage as "no dispatch" and deny on it.
if ! printf '%s' "$pair_raw" | grep -qE '^[0-9]+ [0-9]+ [0-9]+ [0-9]+$'; then
  emit_allow
fi
set -- $pair_raw
verdict_line="$3"
verdict_round="$4"

# Case 1: no pair completed, the agent never dispatched or still running.
if [ "$verdict_line" = "0" ]; then
  emit_deny "Next step: review the plan. ${writer} wrote ${plan_name} but the viber:${agent} agent has not returned a verdict on it - ${steps_first}dispatch it with ${dispatch_with}, then retry ExitPlanMode. (This is ${gate}, not an error.)"
fi

# The SAME pattern that selected the line above, trailing delimiter included:
# read the value with a looser one and a qualified "VERDICT: PASS is not
# warranted" ahead of the real FAIL is picked up as the verdict - a false allow
# on the gate. The two patterns must stay identical.
verdict_value=$(
  VERDICT_LINE="$verdict_line" awk 'NR == ENVIRON["VERDICT_LINE"] + 0 {
    if (match($0, /(\\n|"(text|content)":"|<result>)[[:space:]]*[*_`]*VERDICT:[*_`]*[[:space:]]+[*_`]*(PASS|FAIL|DENIED)[*_`]*[[:space:]]*(\\n|"|<)/)) {
      v = substr($0, RSTART, RLENGTH)
      if (match(v, /PASS|FAIL|DENIED/)) print substr(v, RSTART, RLENGTH)
    }
  }' "$transcript_path" 2>/dev/null
)

# What answers a DENIED or a FAIL is a transcript line after the verdict line.
# One kind is a Bash tool_use whose command runs plan-build.sh with a given
# subcommand and names a plans/*.md path, for `judged` with the reported verdict
# as the next word. The command is a JSON string, so its own quotes arrive
# escaped (plan-build.sh\" apply \"/x/plans/p.md\"); a single quote or none is
# matched too, and both separators as in the plan write grep. The subcommand may
# stand in quotes of either kind as well (plan-build.sh\" \"apply\" \"/x/..):
# the planner skill asks for every argument double-quoted. The tool name must
# stand unescaped on the line, so the same text quoted in a prompt or typed by
# the user answers nothing. The line alone counts, whether or not the call wrote.
script_call='plan-build\.sh[[:punct:]]{0,2}[[:space:]]+[[:punct:]]{0,2}'
plan_arg='[[:punct:]]{0,2}[[:space:]]+(\\")?[^"]*[\\/]+plans[\\/]+[^"]*\.md'
# The word after the plan path, in quotes of either kind or in none.
next_word='[[:punct:]]{0,2}[[:space:]]+[[:punct:]]{0,2}'
word_end='([^[:alnum:]_]|$)'

# Succeeds when a Bash tool_use matching the pattern $1 follows the verdict line.
called_since() {
  called_line=$(
    grep -nE "$1" "$transcript_path" 2>/dev/null \
      | grep -vE '"type":"api-request-blob"' \
      | grep -E '"(tool_name|name)":"Bash"' \
      | tail -n1 \
      | cut -d: -f1
  )
  case "$called_line" in ''|*[!0-9]*) return 1 ;; esac
  [ "$called_line" -gt "$verdict_line" ]
}

# Case 2: the harness refused one of the reviewer's calls, so nothing was
# reviewed. The one answer is the planner reporting that verdict to its script,
# `plan-build.sh judged <plan> DENIED`: the script then records that the round
# did not run and sends the session on to ExitPlanMode. Any other call after the
# verdict, a `judged` with another word included, answers nothing.
if [ "$verdict_value" = "DENIED" ]; then
  if ! called_since "${script_call}judged${plan_arg}${next_word}DENIED${word_end}"; then
    emit_deny "Next step: grant the permission. The viber:${agent} agent returned 'VERDICT: DENIED' for ${plan_name}: the harness refused one of its tool calls, the one its REASON: line names. Ask the user to allow that call, dispatch the agent again with ${dispatch_with}, then retry ExitPlanMode. (This is ${gate}, not an error.)"
  fi
fi

# Case 3: a FAIL nothing answered. The answers: a Write/Edit of a plans/*.md file
# (plan_write_line is the last one of the transcript), `plan-build.sh apply` or
# `open` (the fix written, or the finding recorded as open), and
# `plan-build.sh judged <plan> none` (a FAIL whose findings file could not be
# read, reported as no verdict). A `judged` with PASS or FAIL answers nothing.
# The `none` report answers only where the script ends the review on it, round
# two: after the second one of round one it prints STOP and the plan stays
# unreviewed, so a FAIL of a dispatch whose prompt reads `round: 1` is not
# answered by it. A dispatch whose round cannot be read keeps the answer.
if [ "$verdict_value" = "FAIL" ]; then
  answers="${script_call}(apply|open)${plan_arg}"
  [ "$verdict_round" = "1" ] || answers="${answers}|${script_call}judged${plan_arg}${next_word}none${word_end}"
  if [ "$plan_write_line" -le "$verdict_line" ] && ! called_since "$answers"; then
    emit_deny "Next step: answer the review. The viber:${agent} agent returned 'VERDICT: FAIL' for ${plan_name} and the plan was not written since - ${answer_with}, then retry ExitPlanMode. (This is ${gate}, not an error.)"
  fi
fi

# A PASS, an answered DENIED or FAIL, or a verdict value that could not be read back.
emit_allow

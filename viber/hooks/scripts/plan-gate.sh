#!/usr/bin/env bash
#
# plan-gate.sh - viber / PreToolUse hook for ExitPlanMode: the plan review gate.
#
# Armed only when the CURRENT plan-mode episode shows a Write/Edit of a
# plans/*.md file - plan mode names that path itself, so it is the harness plans
# directory unless the project redirects it. The episode then picks its reviewer:
#   - a Skill tool_use for "planner" in the episode, or one whose own
#     EnterPlanMode opened it (the skill is user-invocable: false, so a model
#     dispatch is the only way it runs), AND the plan file opens with the
#     planner's frontmatter `source:` line (an unreadable plan keeps the
#     planner's reviewer) -> the planner-review agent, always;
#   - anything else -> a plain plan-mode plan, gated by the plain-plan-review agent
#     only when config.sh resolves `planning.plain-plan-review: true` for the session's cwd,
#     and refused outright, before any review check, when the plan file names more
#     than 8 distinct repository files (the file limit, described at its code below).
# Anything else - no plan write, planning.plain-plan-review off, a plan-mode exit in a session
# that already built a plan - passes untouched. The episode starts after the
# last recorded non-plan permission mode, so a plan approved earlier in the
# session cannot re-arm the gate.
#
# When armed, ExitPlanMode is allowed only if the chosen agent was dispatched
# AFTER the last plan write and returned "VERDICT: PASS", and the plan file has
# not been touched since that verdict (file mtime vs. the transcript timestamp
# on the verdict line - that catches an edit through any channel, not just
# Write/Edit). A verdict of the other reviewer never counts. A "VERDICT: DENIED"
# (the reviewer's tool call was refused) denies with its own next step: grant the
# permission, then review again.
#
# The verdict is read from the LAST completed (dispatch -> verdict) pair, bound by
# the dispatch's tool-use id where the transcript carries it: a re-review after a
# FAIL supersedes it, and a PASS quoted anywhere else never counts as one. An
# id-bearing dispatch binds ONLY to a verdict line carrying that same id - no
# weaker fallback: a foreign verdict (another id, or none) arriving while the own
# review is still running is invisible to the pairing, so ExitPlanMode stays
# denied with "let the review finish" until the matching verdict lands. A
# dispatch line that carries no id at all keeps the older, looser pairing: the
# first verdict line after it.
#
# A planner plan past 12 task blocks is gated on the whole review set instead of
# planner-review (see "The review set" below): spec, graph and every task covered by
# a task-review slice must each have a latest PASS, refusals in the order missing
# member, DENIED, FAIL, plan touched after the earliest deciding verdict.
#
# Every transcript scan skips the "api-request-blob" records: each replays a whole
# earlier message on one line, so its tool_use blocks look like live events.
#
# Contract:
#   argv   : none - every input arrives on stdin.
#   cwd    : irrelevant; the payload's own "cwd" key is the session directory.
#            It resolves a RELATIVE plan "file_path" the transcript records,
#            and is where ../../scripts/config.sh runs to read planning.plain-plan-review.
#            No "cwd" key -> planning.plain-plan-review is off.
#   env    : none read.
#   reads  : the transcript file named by the payload's "transcript_path", the
#            config.sh output for the session's cwd (plain plan only), and,
#            once the plan write line resolves a path, the plan file itself:
#            its frontmatter (planner ownership), its tokens and the files they
#            name under the repository root (the file limit, plain plan only;
#            the root is `git rev-parse --show-toplevel` in the session cwd,
#            else the cwd), then existence and mtime (the tamper guard below).
#   stdin  : PreToolUse JSON with at least { "transcript_path": "<abs path>" }
#   stdout : {"hookSpecificOutput":{"hookEventName":"PreToolUse",
#             "permissionDecision":"allow"|"deny","permissionDecisionReason":"..."}}
#   exit 0 : always. Every parse miss or unreadable file falls back to allow -
#            a broken gate must not trap the user in plan mode - except the plan
#            file under a planner signal: a miss there keeps planner-review
#            rather than loosening the gate to the plain path. JSON is read with
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

# Episode window: everything after the last turn recorded in a non-plan permission
# mode. Keeps a plan that was approved and built earlier in this session - its file
# since touched by the implementor - from arming the gate on a later, unrelated exit.
episode_start=$(
  grep -nE '"type":"permission-mode"' "$transcript_path" 2>/dev/null \
    | grep -vE '"type":"api-request-blob"' \
    | grep -vE '"permissionMode":"plan"' \
    | tail -n1 \
    | cut -d: -f1
)
episode_start="${episode_start:-0}"

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
  awk -v ln="$plan_write_line" 'NR==ln' "$transcript_path" 2>/dev/null \
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
# The Skill signal alone is not ownership: a refused planner followed by a plain
# plan in the same episode would otherwise hand that plan to planner-review. The
# planner writes a `source:` key into the frontmatter of every plan, draft
# included, and a plain plan-mode plan never carries one, so the plan file itself
# must open with that frontmatter. A plan path that resolves to nothing, or a
# file that cannot be read, keeps planner-review: a read miss never loosens the gate.
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
if [ "$planner_owns" = "1" ]; then
  agent="planner-review"
  writer="The planner skill"
  dispatch_with="the plan path, \`refs:\` (the reference directory), \`memory:\` (the planner's resolved config value) and \`input:\` (the confirmed interview summary or bug diagnosis the plan answers, verbatim), as planner-review.md expects its input"
  gate="the planner's review gate"
else
  # A plain plan-mode plan is gated only when the host turned planning.plain-plan-review on.
  # config.sh stays the one parser of viber.yml; it resolves the repository from
  # its cwd, so it runs in the session's own cwd, and a payload without one
  # leaves the switch off.
  [ -n "$project_cwd" ] && [ -d "$project_cwd" ] || emit_allow
  config_sh="$(dirname "$0")/../../scripts/config.sh"
  plan_review=$(cd "$project_cwd" 2>/dev/null && bash "$config_sh" 2>/dev/null | grep -E '^planning\.plain-plan-review: ')
  [ "$plan_review" = "planning.plain-plan-review: true" ] || emit_allow
  agent="plain-plan-review"
  writer="Plan mode"
  dispatch_with="the plan path and one sentence stating the user's goal"
  gate="the plan review gate (planning.plain-plan-review in .claude/viber.yml)"

  # The file limit: a plain plan naming more than 8 distinct repository files is
  # refused before the review check, a plain-plan-review PASS included. The tokens
  # of the plan file (whitespace and "](" split) are normalized by the awk below:
  # surrounding punctuation and a :<n> or :<n>-<m> suffix stripped, backslashes read
  # as "/", a URL skipped, a path under the repository root (drive form or Git Bash
  # form, drive letter case-insensitive) folded to its relative form, any other
  # absolute or "~" path skipped, one leading "./" stripped, a ".temp/" path skipped.
  # The awk prints "S <token>" for a token holding "/" and ending in an extension of
  # 1 to 10 letters or digits, "T <token>" for any other: that one counts only when
  # it names an existing file under the root. An unreadable plan counts nothing.
  if [ -n "$plan_path" ] && [ -f "$plan_path" ] && [ -r "$plan_path" ]; then
    file_root="$(git -C "$project_cwd" rev-parse --show-toplevel 2>/dev/null)" || file_root=""
    [ -n "$file_root" ] || file_root="$project_cwd"
    file_root="${file_root//\\//}"
    file_count=0
    while IFS= read -r file_tok; do
      case "$file_tok" in
        "S "*) file_count=$((file_count + 1)) ;;
        "T "*) [ -f "$file_root/${file_tok#T }" ] && file_count=$((file_count + 1)) ;;
      esac
    done < <(
      ROOT="$file_root" awk '
        function canon(p) {
          if (p ~ /^[A-Za-z]:(\/|$)/) return "/" tolower(substr(p, 1, 1)) substr(p, 3)
          if (p ~ /^\/[A-Za-z](\/|$)/) return "/" tolower(substr(p, 2, 1)) substr(p, 3)
          return p
        }
        BEGIN {
          q = sprintf("%c", 39)
          lead = "^[`\"" q "[({<]+"
          trail = "[]`\"" q ")}>.,;:]+$"
          root = ENVIRON["ROOT"]
          gsub(/\\/, "/", root)
          sub(/\/+$/, "", root)
          rlen = length(root)
          croot = canon(root)
        }
        {
          gsub(/\r/, " ")
          gsub(/\]\(/, " ")
          for (i = 1; i <= NF; i++) {
            t = $i
            gsub(/\\/, "/", t)
            if (index(t, "://") > 0) continue
            do {
              b = t
              sub(lead, "", t)
              sub(trail, "", t)
              sub(/:[0-9]+(-[0-9]+)?$/, "", t)
            } while (t != b)
            if (t == "") continue
            ct = canon(t)
            if (rlen > 0 && (ct == croot || index(ct, croot "/") == 1)) {
              t = substr(t, rlen + 2)
            } else if (t ~ /^[\/~]/ || t ~ /^[A-Za-z]:\//) {
              continue
            }
            sub(/^\.\//, "", t)
            if (t == "" || index(t, ".temp/") == 1) continue
            if (t in seen) continue
            seen[t] = 1
            shaped = 0
            if (index(t, "/") > 0 && match(t, /\.[A-Za-z0-9]+$/) && RLENGTH >= 2 && RLENGTH <= 11) shaped = 1
            print (shaped ? "S " : "T ") t
          }
        }
      ' "$plan_path" 2>/dev/null
    )
    if [ "$file_count" -gt 8 ]; then
      emit_deny "Next step: narrow the plan or switch to the planner. ${plan_name} names ${file_count} repository files, past the 8 a plain plan-mode plan may name - narrow it to at most 8, or leave plan mode and run /viber:intent for a planned build. (This is ${gate}, not an error.)"
    fi
  fi
fi

# The review set: a planner plan past 12 task blocks (the plan file lines that are
# `<!-- TASK -->` alone, surrounding whitespace and a CR allowed) is gated on the
# PASS of every member instead of planner-review alone: planner-spec-review,
# planner-graph-review and, for every task T<k>, a planner-task-review whose prompt
# line `tasks: T<a>-T<b>` holds a <= k <= b. 12 tasks or fewer, or a plan that
# cannot be read, keep planner-review alone.
#
# Among the dispatches after the last plan write, every open dispatch is tracked at
# once: a verdict line carrying a tracked dispatch id pairs with that dispatch, in
# whatever order the verdicts arrive; a verdict line matching no id pairs with the
# earliest open dispatch that carries no id. The latest completed pair decides per
# member (per task for the task reviewers). The verdict pattern below is the one of
# the pair_raw awk and the verdict_value awk further down: the three must stay
# identical.
task_count=0
if [ "$planner_owns" = "1" ] && [ -n "$plan_path" ] && [ -f "$plan_path" ] && [ -r "$plan_path" ]; then
  task_count="$(grep -cE '^[[:space:]]*<!-- TASK -->[[:space:]]*$' "$plan_path" 2>/dev/null)"
  case "$task_count" in ''|*[!0-9]*) task_count=0 ;; esac
fi

if [ "$task_count" -gt 12 ]; then
  set_raw="$(
    awk -v start="$((plan_write_line + 1))" -v n="$task_count" '
      function pick(k, kind) {
        if (kind == "all") return 1
        if (kind == "none") return tval[k] == ""
        return tval[k] == kind
      }
      # The runs of tasks picked by kind: "T9-T16, T20" as ranges, or, with chunk,
      # as dispatch slices of at most 8 tasks each. A dash when no task is picked.
      function runs(kind, chunk,    k, s, e, c, ce, out) {
        out = ""
        k = 1
        while (k <= n) {
          if (!pick(k, kind)) { k++; continue }
          s = k
          while (k <= n && pick(k, kind)) k++
          e = k - 1
          if (chunk) {
            for (c = s; c <= e; c += 8) {
              ce = c + 7
              if (ce > e) ce = e
              out = out (out == "" ? "" : ", ") "T" c "-T" ce
            }
          } else {
            out = out (out == "" ? "" : ", ") (s == e ? "T" s : "T" s "-T" e)
          }
        }
        return out == "" ? "-" : out
      }
      NR < start { next }
      /"type":"api-request-blob"/ { next }
      /"subagent_type":"([a-zA-Z0-9_.-]+:)?planner-(spec|graph|task)-review"/ {
        m = "task"
        if ($0 ~ /planner-spec-review"/) m = "spec"
        else if ($0 ~ /planner-graph-review"/) m = "graph"
        nd++
        dag[nd] = m; did[nd] = ""; dlo[nd] = 1; dhi[nd] = 0; opn[nd] = 1
        if (match($0, /"id":"toolu_[A-Za-z0-9_-]+"/)) did[nd] = substr($0, RSTART + 6, RLENGTH - 7)
        if (match($0, /(\\n|"prompt":")[[:space:]]*tasks: T[0-9]+-T[0-9]+/)) {
          t = substr($0, RSTART, RLENGTH)
          sub(/^.*tasks: T/, "", t)
          split(t, ab, "-T")
          dlo[nd] = ab[1] + 0; dhi[nd] = ab[2] + 0
        }
        next
      }
      /"status":"async_launched"/ { next }
      nd && /(\\n|"(text|content)":"|<result>)[[:space:]]*[*_`]*VERDICT:[*_`]*[[:space:]]+[*_`]*(PASS|FAIL|DENIED)[*_`]*[[:space:]]*(\\n|"|<)/ {
        tgt = 0
        for (i = 1; i <= nd && !tgt; i++) if (opn[i] && did[i] != "" && index($0, did[i]) > 0) tgt = i
        for (i = 1; i <= nd && !tgt; i++) if (opn[i] && did[i] == "") tgt = i
        if (!tgt) next
        match($0, /(\\n|"(text|content)":"|<result>)[[:space:]]*[*_`]*VERDICT:[*_`]*[[:space:]]+[*_`]*(PASS|FAIL|DENIED)[*_`]*[[:space:]]*(\\n|"|<)/)
        v = substr($0, RSTART, RLENGTH)
        match(v, /PASS|FAIL|DENIED/)
        v = substr(v, RSTART, RLENGTH)
        opn[tgt] = 0
        if (dag[tgt] == "spec") { sv = v; sl = NR }
        else if (dag[tgt] == "graph") { gv = v; gl = NR }
        else for (k = dlo[tgt]; k <= dhi[tgt] && k <= n; k++) if (k >= 1) { tval[k] = v; tln[k] = NR }
      }
      END {
        print "spec", (sv == "" ? "-" : sv)
        print "graph", (gv == "" ? "-" : gv)
        print "uncovered", runs("none", 0)
        print "uslices", runs("none", 1)
        print "fail", runs("FAIL", 0)
        print "denied", runs("DENIED", 0)
        print "allslices", runs("all", 1)
        out = "lines"
        if (sl && !(sl in seen)) { seen[sl] = 1; out = out " " sl }
        if (gl && !(gl in seen)) { seen[gl] = 1; out = out " " gl }
        for (k = 1; k <= n; k++) if (tln[k] && !(tln[k] in seen)) { seen[tln[k]] = 1; out = out " " tln[k] }
        print out
      }
    ' "$transcript_path" 2>/dev/null
  )"
  # Eight tagged lines on success (the END block always prints them); anything
  # else is a broken read, which allows rather than denies.
  [ "$(printf '%s\n' "$set_raw" | grep -cE '^(spec|graph|uncovered|uslices|fail|denied|allslices|lines)( .*)?$')" = "8" ] || emit_allow
  set_val() { printf '%s\n' "$set_raw" | sed -n "s/^$1 *//p"; }
  spec_v="$(set_val spec)"
  graph_v="$(set_val graph)"
  uncovered="$(set_val uncovered)"
  uslices="$(set_val uslices)"
  task_fail="$(set_val fail)"
  task_denied="$(set_val denied)"
  allslices="$(set_val allslices)"
  decided="$(set_val lines)"

  d_spec="viber:planner-spec-review with the plan path, \`refs:\` (the reference directory) and \`input:\` (the confirmed interview summary or bug diagnosis the plan answers, verbatim)"
  d_graph="viber:planner-graph-review with the plan path and \`refs:\`"
  d_task="viber:planner-task-review with the plan path, \`refs:\`, \`memory:\` (the planner's resolved config value) and a \`tasks: T<a>-T<b>\` line, one dispatch per slice:"
  gate="the planner's review set gate"

  if [ "$spec_v" = "-" ] || [ "$graph_v" = "-" ] || [ "$uncovered" != "-" ]; then
    names=""
    todo=""
    if [ "$spec_v" = "-" ]; then
      names="viber:planner-spec-review"
      todo="$d_spec"
    fi
    if [ "$graph_v" = "-" ]; then
      names="${names:+$names, }viber:planner-graph-review"
      todo="${todo:+$todo; }$d_graph"
    fi
    if [ "$uncovered" != "-" ]; then
      names="${names:+$names, }viber:planner-task-review (uncovered tasks ${uncovered})"
      todo="${todo:+$todo; }$d_task ${uslices}"
    fi
    emit_deny "Next step: review the plan. ${plan_name} holds ${task_count} tasks, past 12, so a planner-review PASS alone does not open ExitPlanMode: every member of the review set must return 'VERDICT: PASS' after the last write of the plan, and these still miss a dispatch or a verdict: ${names}. Dispatch ${todo} - all in one message - wait for every 'VERDICT: PASS', then retry ExitPlanMode without writing the plan again: Minor findings stay unapplied, since any write after the PASS voids it. (This is ${gate}, not an error.)"
  fi

  whole_set="${d_spec}; ${d_graph}; ${d_task} ${allslices}"

  names=""
  if [ "$spec_v" = "DENIED" ]; then names="viber:planner-spec-review"; fi
  if [ "$graph_v" = "DENIED" ]; then names="${names:+$names, }viber:planner-graph-review"; fi
  if [ "$task_denied" != "-" ]; then names="${names:+$names, }viber:planner-task-review (tasks ${task_denied})"; fi
  if [ -n "$names" ]; then
    emit_deny "Next step: grant the permission. ${names} returned 'VERDICT: DENIED' for ${plan_name}: the harness refused one of its tool calls, the one its REASON: line names. Ask the user to allow that call, dispatch the whole review set again - ${whole_set} - then retry ExitPlanMode. (This is ${gate}, not an error.)"
  fi

  names=""
  if [ "$spec_v" = "FAIL" ]; then names="viber:planner-spec-review"; fi
  if [ "$graph_v" = "FAIL" ]; then names="${names:+$names, }viber:planner-graph-review"; fi
  if [ "$task_fail" != "-" ]; then names="${names:+$names, }viber:planner-task-review (tasks ${task_fail})"; fi
  if [ -n "$names" ]; then
    emit_deny "Next step: fix the findings. ${names} returned 'VERDICT: FAIL' for ${plan_name}, not PASS - apply the findings to the plan, dispatch the whole review set again - ${whole_set} - with the previous findings and your fixes, then retry ExitPlanMode. (This is ${gate}, not an error.)"
  fi

  # Every member passed. The plan must be no newer than the EARLIEST deciding
  # verdict (same 2s slack as the single-reviewer check below).
  plan_mtime=$(stat -c %Y "$plan_path" 2>/dev/null || stat -f %m "$plan_path" 2>/dev/null)
  case "${plan_mtime:-}" in ''|*[!0-9]*) plan_mtime="" ;; esac
  earliest=""
  for vl in $decided; do
    iso=$(
      awk -v ln="$vl" 'NR==ln' "$transcript_path" 2>/dev/null \
        | grep -oE '"timestamp":"[^"]+"' \
        | head -n1 \
        | sed -E 's/.*"timestamp":"([^"]+)".*/\1/'
    )
    [ -n "$iso" ] || continue
    ep=$(date -u -d "$iso" +%s 2>/dev/null) \
      || ep=$(date -j -u -f '%Y-%m-%dT%H:%M:%S' "${iso%%[.Z]*}" +%s 2>/dev/null) \
      || ep=""
    case "${ep:-}" in ''|*[!0-9]*) continue ;; esac
    if [ -z "$earliest" ] || [ "$ep" -lt "$earliest" ]; then earliest="$ep"; fi
  done
  if [ -n "$plan_mtime" ] && [ -n "$earliest" ] && [ "$plan_mtime" -gt "$((earliest + 2))" ]; then
    emit_deny "Next step: re-review. ${plan_name} was modified after the earliest 'VERDICT: PASS' of its review set - dispatch the whole review set again - ${whole_set} - then retry ExitPlanMode. (This is ${gate}, not an error.)"
  fi

  emit_allow
fi

# The review of THIS plan version: only dispatches after the last plan write count.
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
# falls back to the first verdict after it, as before; the later completed pair
# wins either way.
# A background agent's launch record ("status":"async_launched") carries the
# dispatch id AND echoes the whole prompt, so it is never read as a verdict.
pair_raw="$(
  awk -v start="$((plan_write_line + 1))" -v agent="$agent" '
    NR < start { next }
    /"type":"api-request-blob"/ { next }
    $0 ~("\"subagent_type\":\"([a-zA-Z0-9_.-]+:)?" agent "\"") {
      last_dispatch = NR; call = NR; cid = ""
      if (match($0, /"id":"toolu_[A-Za-z0-9_-]+"/)) cid = substr($0, RSTART + 6, RLENGTH - 7)
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
      best_call = call; best_verdict = NR; call = 0
    }
    END {
      print last_dispatch + 0, best_call + 0, best_verdict + 0
    }
  ' "$transcript_path" 2>/dev/null
)"

# The awk pipeline above always prints exactly three numbers on success (its
# END block runs unconditionally). Anything else - empty output, a partial
# line, non-numeric text - means the read itself broke (no working awk on
# PATH, a killed process) rather than a legitimate "nothing found yet"
# (which prints as the well-formed "0 0 0"). Fail open rather than read that
# breakage as "no dispatch" and deny on it.
if ! printf '%s' "$pair_raw" | grep -qE '^[0-9]+ [0-9]+ [0-9]+$'; then
  emit_allow
fi
set -- $pair_raw
last_dispatch="$1"
dispatch_line="$2"
verdict_line="$3"

if [ "$last_dispatch" = "0" ]; then
  emit_deny "Next step: review the plan. ${writer} wrote ${plan_name} but the viber:${agent} agent has not run on this version - dispatch it with ${dispatch_with}, wait for 'VERDICT: PASS', then retry ExitPlanMode without writing the plan again: Minor findings stay unapplied, since any write after the PASS voids it. (This is ${gate}, not an error.)"
fi

if [ "$verdict_line" = "0" ]; then
  emit_deny "Next step: let the review finish. The viber:${agent} agent was dispatched (transcript line ${last_dispatch}, after the last write of ${plan_name} on line ${plan_write_line}) but returned no 'VERDICT:' line - dispatch it again and read its verdict, then retry ExitPlanMode. (This is ${gate}, not an error.)"
fi

# The SAME pattern that selected the line above, trailing delimiter included:
# read the value with a looser one and a qualified "VERDICT: PASS is not
# warranted" ahead of the real FAIL is picked up as the verdict - a false allow
# on the gate. The two patterns must stay identical.
verdict_value=$(
  awk -v ln="$verdict_line" 'NR==ln {
    if (match($0, /(\\n|"(text|content)":"|<result>)[[:space:]]*[*_`]*VERDICT:[*_`]*[[:space:]]+[*_`]*(PASS|FAIL|DENIED)[*_`]*[[:space:]]*(\\n|"|<)/)) {
      v = substr($0, RSTART, RLENGTH)
      if (match(v, /PASS|FAIL|DENIED/)) print substr(v, RSTART, RLENGTH)
    }
  }' "$transcript_path" 2>/dev/null
)

if [ "$verdict_value" = "DENIED" ]; then
  emit_deny "Next step: grant the permission. The viber:${agent} agent returned 'VERDICT: DENIED' for ${plan_name}: the harness refused one of its tool calls, the one its REASON: line names. Ask the user to allow that call, dispatch the agent again with ${dispatch_with}, then retry ExitPlanMode. (Read from the latest review: dispatch on transcript line ${dispatch_line}, verdict on line ${verdict_line}. This is ${gate}, not an error.)"
fi

if [ "$verdict_value" != "PASS" ]; then
  emit_deny "Next step: fix the findings. The viber:${agent} agent returned 'VERDICT: ${verdict_value}' for ${plan_name}, not PASS - apply its findings to the plan, dispatch the agent again with ${dispatch_with}, the previous findings and your fixes, then retry ExitPlanMode. (Read from the latest review: dispatch on transcript line ${dispatch_line}, verdict on line ${verdict_line}. This is ${gate}, not an error.)"
fi

# A PASS approves the plan AS REVIEWED. The plan file must therefore be no newer
# than its own verdict - this catches an edit made through a channel the transcript
# scan above cannot see (a redirect, sed -i, an external editor). Either value
# missing skips the check; the 2s slack absorbs clock and filesystem rounding.
if [ -n "$plan_path" ] && [ -f "$plan_path" ]; then
  plan_mtime=$(stat -c %Y "$plan_path" 2>/dev/null || stat -f %m "$plan_path" 2>/dev/null)
  verdict_iso=$(
    awk -v ln="$verdict_line" 'NR==ln' "$transcript_path" 2>/dev/null \
      | grep -oE '"timestamp":"[^"]+"' \
      | head -n1 \
      | sed -E 's/.*"timestamp":"([^"]+)".*/\1/'
  )
  verdict_epoch=""
  if [ -n "$verdict_iso" ]; then
    verdict_epoch=$(date -u -d "$verdict_iso" +%s 2>/dev/null) \
      || verdict_epoch=$(date -j -u -f '%Y-%m-%dT%H:%M:%S' "${verdict_iso%%[.Z]*}" +%s 2>/dev/null) \
      || verdict_epoch=""
  fi
  case "${plan_mtime:-}"    in ''|*[!0-9]*) plan_mtime="" ;; esac
  case "${verdict_epoch:-}" in ''|*[!0-9]*) verdict_epoch="" ;; esac
  if [ -n "$plan_mtime" ] && [ -n "$verdict_epoch" ] && [ "$plan_mtime" -gt "$((verdict_epoch + 2))" ]; then
    emit_deny "Next step: re-review. ${plan_name} was modified after its 'VERDICT: PASS' - dispatch the viber:${agent} agent again with ${dispatch_with}, then retry ExitPlanMode. (This is ${gate}, not an error.)"
  fi
fi

emit_allow

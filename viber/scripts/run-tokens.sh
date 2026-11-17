#!/usr/bin/env bash
#
# run-tokens.sh - prints how many tokens the agents of one run spent, by agent role
# and model, summed over the agent transcripts Claude Code keeps on disk.
#
# A finished build says nothing about its cost, so the tier policy and the review
# waivers can only be judged by feel. Claude Code writes every subagent's turns,
# with the usage of each, to `agent-<id>.jsonl` under a `subagents` directory of the
# projects directory, and the role of the agent to `agent-<id>.meta.json` beside it.
# This script reads that record. It is a script and not a step of an agent because
# the operation is fixed - find the transcripts of the run, sum four numbers per
# role and model - and a model asked to do it drifts: it estimates, rounds, skips.
# It assumes no jq: the JSON lines are read with bash and awk.
#
# What counts:
#   - a transcript is counted when its first line (the prompt that started the
#     agent) contains `<runs>/<key>`, the last two segments of the run directory,
#     followed by `/`, a backslash, a double quote or a space (a JSON-escaped
#     backslash spelling counts too), so a prompt naming the bare directory counts
#     like one naming a file in it, and the agents of another run never leak in,
#     whichever session they ran in.
#   - a transcript last written before the day the run key names is never opened:
#     the key opens with the local date the run was created on, and opening the
#     first line of every transcript on the machine is the cost of this script.
#     A key opening with no date, or a find without `-newermt`, opens them all.
#   - the role is the `agentType` of the meta file beside the transcript, `unknown`
#     when that file is missing or holds none. The `closeout` agent is never
#     counted, whatever its prompt names: the last report line says so.
#   - every assistant line carries `message.model` and `message.usage`; a message id
#     written on several lines is one message and counts once, with the usage of its
#     last line (files read in byte order of their path, lines in order). A line of
#     the model `<synthetic>` is the record of an API error, no message: skipped.
#   - `in` is `input_tokens`, `out` `output_tokens`, `cache-read`
#     `cache_read_input_tokens`, `cache-write` `cache_creation_input_tokens`.
#
# Contract:
#   argv   : $1 run directory (REQUIRED, exactly one): relative to the repository
#            root or absolute; a backslash is read as `/` and trailing slashes are
#            dropped.
#   cwd    : any directory inside the host repository - the script moves to the
#            repository root itself, because a relative argument is relative to it.
#            Outside a repository the cwd is the base a relative argument resolves
#            against and is left untouched.
#   env    : CLAUDE_CONFIG_DIR - the projects directory is `$CLAUDE_CONFIG_DIR/projects`,
#            else `$HOME/.claude/projects`.
#   reads  : the transcripts `*/subagents/agent-<id>.jsonl` under the projects
#            directory and the `agent-<id>.meta.json` beside each counted one. Nothing
#            is written.
#   stdout : on exit 0 one of
#              tokens: <role> <model> in <n> out <n> cache-read <n> cache-write <n>
#              ...one line per role and model, sorted by role then model in byte order
#              ...then the same line for the planning agents, sorted alike (below)
#              tokens: agents only - the main session and the closeout agent are not counted
#            or the single line
#              tokens: unavailable - <reason>
#            with <reason> `no projects directory`, `no agent transcript names this
#            run` or `a transcript holds no readable usage` (a counted transcript
#            with assistant lines and no usage on any of them, one that could not
#            be read through, or counted transcripts with no assistant line at
#            all): never a partial sum. The reason is decided by the build transcripts
#            alone; the planning rows print after it either way.
#            The planning rows are the same line for each transcript, wherever and
#            whenever written (no date cut), whose `agentType` ends in `:planner-review`,
#            `:planner-spec-review`, `:planner-graph-review`, `:planner-task-review`,
#            `:impact-mapper` or `:adr-screener` and whose first line names the `planned:`
#            path of plan.md (the spellings the rounds line accepts): a transcript the
#            build rows counted is not counted again, one with no readable usage adds no
#            row, and no `planned:` line or no projects directory means no planning row.
#            Either form ends on one rounds line, read from `<run-dir>/plan.md`:
#              rounds: plan review <n>
#              rounds: plan review unavailable - <reason>
#            <n> counts the transcripts, wherever and whenever written (the plan is
#            reviewed before the run key exists), whose `agentType` ends in
#            `:planner-review` or `:planner-graph-review` and whose first line names
#            the path of the `planned:` line of plan.md (forward slashes, or its
#            backslash spelling, JSON-escaped or not, followed by a character that
#            cannot continue a path). <reason> is `no projects directory`, `no planned
#            line in plan.md` (plan.md missing included) or `no review transcript names
#            the plan`.
#   exit   : 0 always once the argument is usable, the report being `unavailable`
#            when the transcripts cannot be read.
#            2 unusable argv: no argument, more than one, or a directory that does
#              not exist; one `error: ...` line on stderr, nothing on stdout.
#
set -u
LC_ALL=C
export LC_ALL

usage() {
  echo "error: usage: run-tokens.sh <run-dir>" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
raw="$1"
[[ -n "$raw" ]] || usage

# A relative argument is relative to the repository root, never to the cwd of the
# agent that calls this script. Outside a repository the cwd stays.
if git rev-parse --git-dir >/dev/null 2>&1; then
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$repo_root" && -d "$repo_root" ]]; then
    CDPATH= cd -- "$repo_root"
  fi
fi

dir="${raw//\\//}"
while [[ "$dir" == */ && "$dir" != "/" ]]; do dir="${dir%/}"; done

if [[ ! -d "$dir" ]]; then
  echo "error: run directory not found: $raw" >&2
  exit 2
fi

abs="$(CDPATH= cd -- "$dir" 2>/dev/null && pwd)"
key="${abs##*/}"
parent="${abs%/*}"
runs="${parent##*/}"
needle="$runs/$key"
needle_escaped="$runs\\\\$key"

config="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
config="${config//\\//}"
projects="$config/projects"

# The plan review rounds line: the review transcripts naming the plan this run was
# landed from (the `planned:` line of its plan.md). The plan is reviewed before the
# run exists, so no date cut here: every transcript with a review role is opened.
planned_re='^planned:[[:space:]]*(.*[^[:space:]])[[:space:]]*$'
planned_path=""
read_planned() {
  local line=""
  planned_path=""
  [[ -r "$abs/plan.md" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" =~ $planned_re ]]; then
      planned_path="${BASH_REMATCH[1]//\\//}"
      break
    fi
  done <"$abs/plan.md"
}
rounds() {
  local reason="" planned="" file="" meta="" meta_text="" role="" first="" p="" p_escaped="" p_back="" n=0
  if [[ ! -d "$projects" ]]; then
    reason="no projects directory"
  else
    read_planned
    planned="$planned_path"
    if [[ -z "$planned" ]]; then
      reason="no planned line in plan.md"
    fi
  fi
  if [[ -z "$reason" ]]; then
    p="$planned"
    p_back="${planned//\//\\}"
    p_escaped="${planned//\//\\\\}"
    while IFS= read -r file <&4; do
      [[ -n "$file" ]] || continue
      meta="${file%.jsonl}.meta.json"
      [[ -r "$meta" ]] || continue
      meta_text="$(<"$meta")"
      [[ "$meta_text" =~ $role_re && -n "${BASH_REMATCH[1]}" ]] || continue
      role="${BASH_REMATCH[1]}"
      case "$role" in
        *:planner-review | *:planner-graph-review) ;;
        *) continue ;;
      esac
      first=""
      IFS= read -r first <"$file" || [[ -n "$first" ]] || continue
      if [[ "$first" == *"$p"[!A-Za-z0-9._-]* || "$first" == *"$p_escaped"[!A-Za-z0-9._-]* || "$first" == *"$p_back"[!A-Za-z0-9._-]* ]]; then
        n=$((n + 1))
      fi
    done 4< <(find "$projects" -type f -name 'agent-*.jsonl' -path '*/subagents/agent-*.jsonl' 2>/dev/null | sort)
    if [[ $n -eq 0 ]]; then
      reason="no review transcript names the plan"
    fi
  fi
  if [[ -n "$reason" ]]; then
    echo "rounds: plan review unavailable - $reason"
  else
    echo "rounds: plan review $n"
  fi
}

role_re='"agentType"[[:space:]]*:[[:space:]]*"([^"]*)"'

# The transcripts the build rows counted, one path per line between newlines: a
# planning transcript that also names the run directory is never counted twice.
counted_files=$'\n'

# One call per counted transcript: a `U` row per assistant line with a usage block
# (id, role, model, the four numbers, tab separated) and one `N` row with the number
# of assistant lines and of those rows.
read_transcript='
function num(str, name) {
  if (!match(str, "\"" name "\":[0-9]+")) return 0
  t = substr(str, RSTART, RLENGTH)
  sub(/^[^:]*:/, "", t)
  return t + 0
}
function txt(str, name) {
  if (!match(str, "\"" name "\":\"[^\"]*\"")) return ""
  t = substr(str, RSTART, RLENGTH)
  sub(/^[^:]*:"/, "", t)
  sub(/"$/, "", t)
  return t
}
BEGIN { role = ENVIRON["RT_ROLE"]; a = 0; u = 0 }
index($0, "\"type\":\"assistant\"") == 0 { next }
{
  p = index($0, "\"message\":{")
  s = p == 0 ? "" : substr($0, p)
  model = txt(s, "model")
  if (model == "<synthetic>") next
  a++
  if (p == 0) next
  q = index(s, "\"usage\":{")
  if (q == 0) next
  us = substr(s, q)
  id = txt(s, "id")
  if (id == "") id = FILENAME ":" NR
  if (model == "") model = "unknown"
  u++
  printf "U\t%s\t%s\t%s\t%d\t%d\t%d\t%d\n", id, role, model, num(us, "input_tokens"), num(us, "output_tokens"), num(us, "cache_read_input_tokens"), num(us, "cache_creation_input_tokens")
}
END { printf "N\t%d\t%d\n", a, u }
'

# The last row of a message id wins; the rows of one role and model are then summed
# into one `tokens:` line each, sorted by role then model.
sum_rows() {
  awk '
BEGIN { FS = "\t" }
$1 == "U" {
  id = $2
  role[id] = $3
  model[id] = $4
  vin[id] = $5
  vout[id] = $6
  vread[id] = $7
  vwrite[id] = $8
}
END {
  for (id in role) {
    k = role[id] "\t" model[id]
    tin[k] += vin[id]
    tout[k] += vout[id]
    tread[k] += vread[id]
    twrite[k] += vwrite[id]
  }
  for (k in tin) {
    split(k, part, "\t")
    printf "tokens: %s %s in %.0f out %.0f cache-read %.0f cache-write %.0f\n", part[1], part[2], tin[k], tout[k], tread[k], twrite[k]
  }
}
' | sort
}

# The planning rows: the planning agents whose first line names the `planned:` path,
# whenever written, that the build rows did not count already. A transcript with no
# readable usage adds nothing; no planned line or no projects directory, no row.
plan_rows() {
  local file="" meta="" meta_text="" role="" first="" p="" p_escaped="" p_back="" result="" u_rows="" prow=""
  [[ -d "$projects" ]] || return 0
  read_planned
  [[ -n "$planned_path" ]] || return 0
  p="$planned_path"
  p_back="${p//\//\\}"
  p_escaped="${p//\//\\\\}"
  while IFS= read -r file <&5; do
    [[ -n "$file" ]] || continue
    case "$counted_files" in
      *$'\n'"$file"$'\n'*) continue ;;
    esac
    meta="${file%.jsonl}.meta.json"
    [[ -r "$meta" ]] || continue
    meta_text="$(<"$meta")"
    [[ "$meta_text" =~ $role_re && -n "${BASH_REMATCH[1]}" ]] || continue
    role="${BASH_REMATCH[1]}"
    case "$role" in
      *:planner-review | *:planner-spec-review | *:planner-graph-review | *:planner-task-review | *:impact-mapper | *:adr-screener) ;;
      *) continue ;;
    esac
    first=""
    IFS= read -r first <"$file" || [[ -n "$first" ]] || continue
    if [[ "$first" == *"$p"[!A-Za-z0-9._-]* || "$first" == *"$p_escaped"[!A-Za-z0-9._-]* || "$first" == *"$p_back"[!A-Za-z0-9._-]* ]]; then
      result="$(RT_ROLE="$role" awk "$read_transcript" "$file" 2>/dev/null || true)"
      u_rows="$(printf '%s\n' "$result" | grep '^U' || true)"
      if [[ -n "$u_rows" ]]; then
        prow+="$u_rows"$'\n'
      fi
    fi
  done 5< <(find "$projects" -type f -name 'agent-*.jsonl' -path '*/subagents/agent-*.jsonl' 2>/dev/null | sort)
  if [[ -n "$prow" ]]; then
    printf '%s' "$prow" | sum_rows
  fi
}

unavailable() {
  echo "tokens: unavailable - $1"
  plan_rows
  rounds
  exit 0
}

[[ -d "$projects" ]] || unavailable "no projects directory"

# The transcripts to open. A find refusing `-newermt`, or failing on any directory,
# is run again with no date: the full list is slower, never wrong.
transcripts() {
  find "$projects" -type f -name 'agent-*.jsonl' -path '*/subagents/agent-*.jsonl' "$@" 2>/dev/null
}
files=""
listed=0
date_re='^([0-9]{4}-[0-9]{2}-[0-9]{2})-'
if [[ "$key" =~ $date_re ]]; then
  if files="$(transcripts -newermt "${BASH_REMATCH[1]} 00:00:00")"; then
    listed=1
  fi
fi
if [[ $listed -eq 0 ]]; then
  files="$(transcripts || true)"
fi

rows=""
counted=0
unreadable=0

while IFS= read -r file <&3; do
  [[ -n "$file" ]] || continue
  first=""
  IFS= read -r first <"$file" || [[ -n "$first" ]] || continue
  if [[ "$first" != *"$needle"[/\\\"[:space:]]* && "$first" != *"$needle_escaped"[/\\\"[:space:]]* ]]; then
    continue
  fi

  role="unknown"
  meta="${file%.jsonl}.meta.json"
  if [[ -r "$meta" ]]; then
    meta_text="$(<"$meta")"
    if [[ "$meta_text" =~ $role_re && -n "${BASH_REMATCH[1]}" ]]; then
      role="${BASH_REMATCH[1]}"
    fi
  fi
  case "$role" in
    closeout | *:closeout) continue ;;
  esac
  counted=$((counted + 1))
  counted_files+="$file"$'\n'

  # No `N` row means awk did not read the file through: its rows would be a
  # partial sum, so the whole report turns unavailable.
  result="$(RT_ROLE="$role" awk "$read_transcript" "$file" 2>/dev/null || true)"
  n_line="$(printf '%s\n' "$result" | grep '^N' || true)"
  u_rows="$(printf '%s\n' "$result" | grep '^U' || true)"
  n_rest="${n_line#N$'\t'}"
  n_assistant="${n_rest%%$'\t'*}"
  n_usage="${n_rest#*$'\t'}"
  if [[ "$n_assistant" =~ ^[0-9]+$ && "$n_usage" =~ ^[0-9]+$ ]]; then
    if [[ $n_assistant -gt 0 && $n_usage -eq 0 ]]; then
      unreadable=1
    fi
  else
    unreadable=1
  fi
  if [[ -n "$u_rows" ]]; then
    rows+="$u_rows"$'\n'
  fi
done 3< <(printf '%s\n' "$files" | sort)

[[ $counted -gt 0 ]] || unavailable "no agent transcript names this run"
[[ $unreadable -eq 0 && -n "$rows" ]] || unavailable "a transcript holds no readable usage"

printf '%s' "$rows" | sum_rows
plan_rows
echo "tokens: agents only - the main session and the closeout agent are not counted"
rounds
exit 0

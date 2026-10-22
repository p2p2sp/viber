#!/usr/bin/env bash
#
# run-branch.sh - the run branch step of plan-path.sh: which branch a run's
# commits land on, and putting HEAD there before a first landing copies
# anything. Sourced by plan-path.sh, never invoked on its own.
#
# It exists so the branch a project's strategy expects is set by a script at
# the one moment it is still safe - before the run's first file lands - instead
# of depending on the user remembering to branch before planning.
#
# Contract:
#   argv   : none - sourced. Every function takes its own arguments.
#   cwd    : the repository root, as plan-path.sh's own contract pins it.
#   env    : none. branch_decide takes its flags from the st_fixer, st_pr,
#            st_roadmap, st_draft, st_entry and st_settled shell variables
#            plan-path.sh sets before branch_start.
#   file   : the sibling config.sh --branching lines (mode and work entries
#            for the landing, all of them for branch_report); the plan's
#            frontmatter "branch:", "work:" and "issue:" keys and its task
#            blocks' "Repro:" lines; branch_decide reads the --draft file's
#            "branch:" and "work:" keys.
#   gh     : only through the sibling issue-facts.sh, for the issue type of
#            branch_report and branch_start, and only when a mapping exists and
#            there is an issue: its TYPE= line, empty on any failure.
#   git    : reads HEAD, refs/heads/ and the tree state; branch_land and
#            branch_checkout alone move HEAD, each through one checkout,
#            never a fetch.
#   stdout : branch_setup, branch_entry and branch_land print nothing - their
#            result is the br_* variables; the plan_* and branch_expand helpers print one
#            value for a caller to capture. branch_report prints the C3
#            report of plan-path.sh --branch and branch_start the C1 report of
#            plan-path.sh --start, the decision lines of branch_decide
#            included, whose header shows both; branch_checkout
#            prints the one "branch:" line of plan-path.sh --checkout.
#   return : branch_land and branch_checkout 0, or 6 with the reason on stderr
#            and HEAD, index and tree untouched (branch_land and
#            branch_checkout share branch_name_ok and branch_move_ok for the
#            name and dirty-tree checks). branch_report and branch_start always 0 -
#            they are read-only and never touch HEAD, the index or the tree.
#
# Outside a git repository branching acts as off. No `set` line of its own: it
# runs under plan-path.sh's.

run_branch_dir="$(dirname -- "${BASH_SOURCE[0]}")"

# The branching mode, the valid work entries (br_keys, br_bases, br_names,
# br_targets, in file order), the first config.sh error (br_err, empty with
# none) and the current branch (empty when detached). br_line is what
# plan-path.sh prints after "branch: ", empty under off.
branch_setup() {
  local line rest
  br_mode=off
  br_keys=()
  br_bases=()
  br_names=()
  br_targets=()
  br_err=""
  br_cur=""
  br_line=""
  while IFS= read -r line; do
    case "$line" in
      'mode: '*) br_mode="${line#mode: }" ;;
      'error: '*) [[ -n "$br_err" ]] || br_err="${line#error: }" ;;
      'entry: '*)
        rest="${line#entry: }"
        br_keys+=("${rest%% | *}")
        rest="${rest#* | base: }"
        br_bases+=("${rest%% | *}")
        rest="${rest#* | name: }"
        br_names+=("${rest%% | *}")
        br_targets+=("${rest##* | target: }")
        ;;
    esac
  done < <(bash "$run_branch_dir/config.sh" --branching 2>/dev/null || true)
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || br_mode=off
  [[ "$br_mode" == allowed || "$br_mode" == required ]] || br_mode=off
  [[ "$br_mode" != off ]] || return 0
  br_cur="$(git symbolic-ref --short -q HEAD 2>/dev/null || true)"
  if [[ -n "$br_cur" ]]; then br_line="$br_cur (kept)"; else br_line="detached (kept)"; fi
}

# The plan frontmatter's value of key $2 ("branch", "work"), up to its first
# whitespace.
plan_field() {
  awk -v key="$2" '
NR == 1 { if ($0 !~ /^---[[:space:]]*\r?$/) exit; next }
/^---[[:space:]]*\r?$/ { exit }
$0 ~ "^" key ":" { sub(/^[^:]*:[[:space:]]*/, ""); sub(/[[:space:]].*$/, ""); print; exit }
' "$1"
}

# The work entry of plan $1: its "work:" key, or the single entry when it
# names none. Sets br_entry, br_base, br_pattern and br_target; unresolved,
# br_entry is empty and br_why holds the exit 6 reason.
branch_entry() {
  local want i n=${#br_keys[@]}
  br_entry=""
  br_base=""
  br_pattern=""
  br_target=""
  br_why=""
  want="$(plan_field "$1" work)"
  if [[ -z "$want" ]]; then
    if [[ $n -eq 0 ]]; then
      br_why="no valid branching.work entry"
      return 0
    fi
    if [[ $n -gt 1 ]]; then
      br_why="the plan records no branching.work entry and several exist"
      return 0
    fi
    want="${br_keys[0]}"
  fi
  for ((i = 0; i < n; i++)); do
    if [[ "${br_keys[$i]}" == "$want" ]]; then
      br_entry="$want"
      br_base="${br_bases[$i]}"
      br_pattern="${br_names[$i]}"
      br_target="${br_targets[$i]}"
      return 0
    fi
  done
  br_why="the plan records work entry $want and branching.work has none of that name"
}

# True when branch $1 is the base of any entry, the resolved one or not.
branch_is_base() {
  local b
  for b in ${br_bases[@]+"${br_bases[@]}"}; do
    [[ "$1" != "$b" ]] || return 0
  done
  return 1
}

# The issue number of the plan frontmatter's "issue:" URL, empty without one;
# with "url" as $2, that URL cut after the number instead. Read the way
# issue_ref() in commit-task.sh reads it; change the two together.
plan_issue() {
  local line val first=1 num="" ref=""
  local fence='^[[:space:]]*---[[:space:]]*$'
  local key='^[[:space:]]*issue:[[:space:]]*(.*)$'
  local url='/issues/([0-9]+)([/?#].*)?[[:space:]]*$'
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ $first -eq 1 ]]; then
      first=0
      [[ "$line" =~ $fence ]] || return 0
      continue
    fi
    if [[ "$line" =~ $fence ]]; then
      if [[ -n "$num" ]]; then
        if [[ "${2:-}" == url ]]; then printf '%s\n' "$ref"; else printf '%s\n' "$num"; fi
      fi
      return 0
    fi
    if [[ "$line" =~ $key ]]; then
      num=""
      val="${BASH_REMATCH[1]}"
      if [[ "$val" =~ $url ]]; then
        num="${BASH_REMATCH[1]}"
        ref="${val%%/issues/$num*}/issues/$num"
      fi
    fi
  done < "$1"
}

# The GitHub issue type of plan $1's issue, from the TYPE= header line the
# sibling issue-facts.sh prints; empty without an issue or on any failure.
plan_issue_type() {
  url_issue_type "$(plan_issue "$1" url)"
}

# The GitHub issue type of issue URL $1, the same way; empty for no URL.
url_issue_type() {
  local url="$1" line
  [[ -n "$url" ]] || return 0
  while IFS= read -r line; do
    case "$line" in
      'TYPE='*) printf '%s\n' "${line#TYPE=}"; return 0 ;;
      '--- body ---') return 0 ;;
    esac
  done < <(sh "$run_branch_dir/issue-facts.sh" "$url" 2>/dev/null || true)
}

# "fix" when any task block of the plan carries a "Repro:" line, else "feature".
plan_type() {
  awk '
/^[[:space:]]*<!--[[:space:]]*TASK[[:space:]]*-->[[:space:]]*$/ { intask = 1; next }
/^[[:space:]]*<!--[[:space:]]*\/TASK[[:space:]]*-->[[:space:]]*$/ { intask = 0; next }
intask && /^[[:space:]]*(-[[:space:]]*)?Repro:/ { fix = 1; exit }
END { print (fix ? "fix" : "feature") }
' "$1"
}

# The work entry name pattern $3 expanded for plan $1 and run slug $2:
# separators left dangling by an empty placeholder are dropped, doubled ones
# collapsed, and a leading or trailing `/` at either edge is dropped too, so
# the result never starts or ends with `/`.
branch_expand() {
  local name="$3" type issue
  type="$(plan_type "$1")"
  issue="$(plan_issue "$1")"
  name="${name//\{type\}/$type}"
  name="${name//\{issue-number\}/$issue}"
  name="${name//\{slug\}/$2}"
  printf '%s\n' "$name" \
    | sed -E -e 's#[-_.]+/#/#g' -e 's#/[-_.]+#/#g' -e 's#^[-_.]+##' -e 's#[-_.]+$##' -e 's#/+#/#g' -e 's#-+#-#g' -e 's#^/+##' -e 's#/+$##'
}

# Refuses a branch creation while config.sh reports an error: return 6 with
# the first one on stderr, 0 on a configuration it accepts.
branch_config_ok() {
  [[ -n "$br_err" ]] || return 0
  echo "error: $br_err" >&2
  return 6
}

# True when $1 is a usable branch name. check-ref-format --branch expands
# @{-n}, so a name it hands back changed is a shorthand for another branch,
# not a name.
branch_name_ok() {
  [[ "$1" != -* && "$(git check-ref-format --branch "$1" 2>/dev/null || true)" == "$1" ]]
}

# Refuses moving HEAD onto branch $1 (ref $2) with return 6 and the reason on
# stderr: a checkout carries uncommitted work along only while HEAD keeps its
# commit, and moving it elsewhere on a dirty tree could lose or tangle that
# work. 0 otherwise.
branch_move_ok() {
  local head_c to_c
  head_c="$(git rev-parse -q --verify 'HEAD^{commit}' 2>/dev/null || true)"
  to_c="$(git rev-parse -q --verify "$2^{commit}" 2>/dev/null || true)"
  if [[ "$head_c" != "$to_c" && -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
    echo "error: uncommitted changes and $1 is at another commit - commit or stash them first" >&2
    return 6
  fi
}

# Puts HEAD on the existing local branch $1 and prints "branch: <name>
# (switched | kept)" (the --checkout form). Any mode, config never read. Never
# creates a branch, never fetches. Return 6 with the reason on stderr and HEAD,
# index and tree untouched.
branch_checkout() {
  local cur action=switched
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "error: not a git repository" >&2
    return 6
  fi
  if ! branch_name_ok "$1"; then
    echo "error: invalid branch name: $1" >&2
    return 6
  fi
  if ! git show-ref --verify --quiet "refs/heads/$1"; then
    echo "error: branch $1 does not exist locally - nothing is fetched, create it first" >&2
    return 6
  fi
  cur="$(git symbolic-ref --short -q HEAD 2>/dev/null || true)"
  if [[ "$cur" == "$1" ]]; then
    action=kept
  else
    branch_move_ok "$1" "refs/heads/$1" || return 6
    if ! git checkout -q "$1" -- >/dev/null; then
      echo "error: could not put HEAD on the branch $1" >&2
      return 6
    fi
  fi
  printf 'branch: %s (%s)\n' "$1" "$action"
}

# Puts HEAD on the run branch of plan $1 (run slug $2) and sets br_line. A
# branch is created only from the base of the plan's work entry and only on a
# configuration config.sh reports no error for; keeping or switching to a
# recorded branch that exists never reads those errors. The required checks
# read every entry base, the resolved entry's or not.
branch_land() {
  local target
  [[ "$br_mode" != off ]] || return 0
  branch_entry "$1"
  target="$(plan_field "$1" branch)"
  [[ "$target" != none ]] || target=""
  if [[ -z "$target" ]]; then
    [[ "$br_mode" == required ]] || return 0
    if [[ -z "$br_cur" ]]; then
      echo "error: HEAD is detached, branching is required and the plan records no branch" >&2
      return 6
    fi
    if [[ -z "$br_entry" ]]; then
      # no entry, so no base to tell: HEAD on any entry base, or no entry at
      # all, would need a branch this plan cannot name
      if [[ ${#br_keys[@]} -eq 0 ]] || branch_is_base "$br_cur"; then
        branch_config_ok || return 6
        echo "error: $br_why" >&2
        return 6
      fi
      return 0
    fi
    branch_is_base "$br_cur" || return 0
    branch_config_ok || return 6
    if [[ "$br_pattern" == *'{issue-number}'* && -z "$(plan_issue "$1")" ]]; then
      echo "error: work entry $br_entry needs an issue for {issue-number}" >&2
      return 6
    fi
    target="$(branch_expand "$1" "$2" "$br_pattern")"
    if [[ -z "$target" ]]; then
      echo "error: the run branch name pattern expanded to an empty name" >&2
      return 6
    fi
  fi
  if [[ "$br_mode" == required ]] && branch_is_base "$target"; then
    echo "error: branching is required and the run branch is a work entry base: $target" >&2
    return 6
  fi
  if ! branch_name_ok "$target"; then
    echo "error: invalid run branch name: $target" >&2
    return 6
  fi
  [[ "$target" != "$br_cur" ]] || return 0
  local action=switched from="refs/heads/$target"
  if ! git show-ref --verify --quiet "$from"; then
    action=created
    branch_config_ok || return 6
    if [[ -z "$br_entry" ]]; then
      echo "error: $br_why" >&2
      return 6
    fi
    from="refs/heads/$br_base"
    if ! git show-ref --verify --quiet "$from"; then
      echo "error: base branch $br_base does not exist locally - nothing is fetched, create it first" >&2
      return 6
    fi
  fi
  branch_move_ok "$target" "$from" || return 6
  if [[ "$action" == switched ]]; then
    git checkout -q "$target" -- >/dev/null || action=""
  else
    git checkout -q -b "$target" "$from" -- >/dev/null || action=""
  fi
  if [[ -z "$action" ]]; then
    echo "error: could not put HEAD on the run branch $target" >&2
    return 6
  fi
  br_line="$target ($action)"
}

# How many commits branch $1 lacks from its configured upstream, "unknown"
# when it has none. The branch is addressed as refs/heads/$1, so a tag of the
# same name is never read for it; a base with no local branch (or no tracking
# ref) reads as unknown instead of erroring under errexit.
base_behind() {
  local upstream behind=""
  upstream="$(git for-each-ref --format='%(upstream)' "refs/heads/$1" 2>/dev/null || true)"
  [[ -z "$upstream" ]] || behind="$(git rev-list --count "refs/heads/$1..$upstream" 2>/dev/null || true)"
  [[ "$behind" =~ ^[0-9]+$ ]] || behind="unknown"
  printf '%s\n' "$behind"
}

# The C3 --branch report for plan $1 (run slug $2), built from the sibling
# config.sh --branching lines: read-only, never touches HEAD, the index or the
# tree. Off, or outside a repository, prints only "mode: off". The issue type
# is fetched only when a mapping exists and the plan has an issue. The empty
# array expansions are guarded: bash 3.2 under `set -u` fails on "${a[@]}".
branch_report() {
  local issue suggested only="" usable=0 e
  local key rest base name target new exists entry_lines=""
  issue="$(plan_issue "$1")"
  branch_situation "$issue" "$(plan_issue "$1" url)"
  if [[ "$rp_mode" == off ]]; then
    printf 'mode: off\n'
    return 0
  fi
  suggested="$rp_suggested"
  for e in ${rp_entries[@]+"${rp_entries[@]}"}; do
    key="${e%% | *}"
    rest="${e#* | base: }"
    base="${rest%% | *}"
    rest="${rest#* | name: }"
    name="${rest%% | *}"
    target="${e##* | target: }"
    exists=no
    if [[ "$name" == *'{issue-number}'* && -z "$issue" ]]; then
      new=-
    else
      new="$(branch_expand "$1" "$2" "$name")"
      usable=$((usable + 1))
      only="$key"
      if [[ -n "$new" ]] && git show-ref --verify --quiet "refs/heads/$new" 2>/dev/null; then exists=yes; fi
    fi
    entry_lines+="entry: $key | base: $base | target: $target | new: $new | new-exists: $exists | behind: $(base_behind "$base")"$'\n'
  done
  [[ "$suggested" != none || "$usable" -ne 1 ]] || suggested="$only"
  printf 'mode: %s\n' "$rp_mode"
  printf 'issue-type: %s\n' "${rp_type:-none}"
  printf 'suggested: %s\n' "$suggested"
  printf '%s' "$entry_lines"
  branch_tail
}

# What --branch and --start share: reads the sibling config.sh --branching
# lines and the issue type. $1 is the issue number ("" for none), $2 its URL.
# Sets rp_mode (off outside a repository or under any mode but allowed and
# required, with nothing else read), rp_entries (config.sh entry lines),
# rp_type ("" for none), rp_suggested (the entry the type maps to, else none)
# and rp_errors (every config.sh error, then the issue type ones). The issue
# type is fetched only when a mapping exists and there is an issue.
branch_situation() {
  local line m
  local -a maps=()
  rp_mode=off
  rp_type=""
  rp_suggested=none
  rp_entries=()
  rp_errors=()
  while IFS= read -r line; do
    case "$line" in
      'mode: '*) rp_mode="${line#mode: }" ;;
      'entry: '*) rp_entries+=("${line#entry: }") ;;
      'map: '*) maps+=("${line#map: }") ;;
      'error: '*) rp_errors+=("${line#error: }") ;;
    esac
  done < <(bash "$run_branch_dir/config.sh" --branching 2>/dev/null || true)
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || rp_mode=off
  [[ "$rp_mode" == allowed || "$rp_mode" == required ]] || { rp_mode=off; return 0; }
  if [[ ${#maps[@]} -gt 0 && -n "$1" ]]; then
    rp_type="$(url_issue_type "$2")"
    if [[ -z "$rp_type" ]]; then
      rp_errors+=("issue $1 has no issue type")
    else
      for m in ${maps[@]+"${maps[@]}"}; do
        if [[ "${m% | *}" == "$rp_type" ]]; then rp_suggested="${m##* | }"; break; fi
      done
      [[ "$rp_suggested" != none ]] || rp_errors+=("issue type $rp_type is not in branching.issue-type-mappings")
    fi
  fi
}

# The closing lines both reports print, from rp_entries and rp_errors:
# current, current-is-base (yes only for a branch that is some entry base, so
# never on a detached HEAD), dirty, then the error lines.
branch_tail() {
  local cur e rest is_base=no
  cur="$(git symbolic-ref --short -q HEAD 2>/dev/null || true)"
  printf 'current: %s\n' "${cur:-detached}"
  for e in ${rp_entries[@]+"${rp_entries[@]}"}; do
    rest="${e#* | base: }"
    [[ -z "$cur" || "${rest%% | *}" != "$cur" ]] || is_base=yes
  done
  printf 'current-is-base: %s\n' "$is_base"
  tl_cur="${cur:-detached}"
  tl_is_base="$is_base"
  tl_dirty=no
  if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then tl_dirty=yes; fi
  printf 'dirty: %s\n' "$tl_dirty"
  for e in ${rp_errors[@]+"${rp_errors[@]}"}; do printf 'error: %s\n' "$e"; done
}

# The --start report for issue URL $1 ("" for none, validated by the caller):
# the same situation as branch_report without a plan, so no run branch name is
# proposed: each entry shows its name pattern instead, {issue-number} filled in
# from the URL when one is given. Each entry is checked against HEAD too:
# usable (its name needs no {issue-number} or a URL was given), base-exists,
# at-base (HEAD is the commit of the local base) and behind. Read-only like
# branch_report. Under allowed and required it ends with branch_decide's lines.
branch_start() {
  local issue="" suggested only="" usable=0 e key rest base name shown target use exists at behind head_c entry_lines=""
  [[ -z "$1" ]] || issue="${1##*/issues/}"
  branch_situation "$issue" "$1"
  if [[ "$rp_mode" == off ]]; then
    printf 'mode: off\n'
    return 0
  fi
  st_keys=()
  st_bases=()
  st_targets=()
  st_names=()
  st_usable=()
  st_exists=()
  st_at=()
  st_behind=()
  suggested="$rp_suggested"
  head_c="$(git rev-parse -q --verify 'HEAD^{commit}' 2>/dev/null || true)"
  for e in ${rp_entries[@]+"${rp_entries[@]}"}; do
    key="${e%% | *}"
    rest="${e#* | base: }"
    base="${rest%% | *}"
    rest="${rest#* | name: }"
    name="${rest%% | *}"
    target="${e##* | target: }"
    use=yes
    shown="$name"
    if [[ "$name" == *'{issue-number}'* && -z "$issue" ]]; then
      use=no
    else
      shown="${name//\{issue-number\}/$issue}"
      usable=$((usable + 1))
      only="$key"
    fi
    exists=no
    at=no
    if git show-ref --verify --quiet "refs/heads/$base" 2>/dev/null; then
      exists=yes
      [[ -z "$head_c" || "$head_c" != "$(git rev-parse -q --verify "refs/heads/$base^{commit}" 2>/dev/null || true)" ]] || at=yes
    fi
    behind="$(base_behind "$base")"
    st_keys+=("$key")
    st_bases+=("$base")
    st_targets+=("$target")
    st_names+=("$shown")
    st_usable+=("$use")
    st_exists+=("$exists")
    st_at+=("$at")
    st_behind+=("$behind")
    entry_lines+="entry: $key | base: $base | target: $target | name: $shown | usable: $use | base-exists: $exists | at-base: $at | behind: $behind"$'\n'
  done
  [[ "$suggested" != none || "$usable" -ne 1 ]] || suggested="$only"
  st_suggested="$suggested"
  printf 'mode: %s\n' "$rp_mode"
  printf 'issue-type: %s\n' "${rp_type:-none}"
  printf 'suggested: %s\n' "$suggested"
  printf '%s' "$entry_lines"
  branch_tail
  branch_decide
}

# What the --start decision report adds after today's lines (C1 of
# plan-path.sh): one verdict of rules 1 to 7, read from the st_* entry arrays,
# st_suggested, rp_errors and the tl_* tail values branch_start and branch_tail
# set, and from the flags plan-path.sh sets: st_fixer, st_pr and st_roadmap
# (1 or 0), st_draft, st_entry and st_settled (empty for not given).
branch_decide() {
  local settled="${st_settled:-}" draft="${st_draft:-}" dbranch dwork
  # rule 1: a configuration or issue type error settles nothing
  if [[ ${#rp_errors[@]} -gt 0 ]]; then
    if [[ "$settled" == nothing ]]; then
      decide_ask_entry
    else
      printf 'next: errors\n'
      [[ -z "$settled" ]] || printf 'settled: %s\n' "$settled"
    fi
    return 0
  fi
  # rule 2: the re-run after an issue save keeps or replaces the settlement
  if [[ -n "$settled" ]]; then
    if [[ "$settled" == pr || ( "$settled" == no-branch && "${st_pr:-0}" == 1 ) ]]; then
      decide_kept "$settled"
    elif [[ "$settled" == nothing ]]; then
      decide_suggested
    elif [[ "$st_suggested" != none && "$st_suggested" != "$settled" ]]; then
      decide_base "$st_suggested"
    else
      decide_kept "$settled"
    fi
    return 0
  fi
  # rule 3: a draft recording a branch decides its own entry
  if [[ -n "$draft" ]]; then
    dbranch="$(plan_field "$draft" branch)"
    dwork="$(plan_field "$draft" work)"
    if [[ -z "$dwork" && ${#st_keys[@]} -eq 1 ]]; then dwork="${st_keys[0]}"; fi
    if [[ "$dbranch" == none && "$rp_mode" == allowed ]]; then
      decide_settled no-branch
      return 0
    elif [[ -n "$dbranch" && "$dbranch" != none && -n "$dwork" ]]; then
      if [[ "$tl_cur" == "$dbranch" ]]; then
        decide_settled "$dwork"
      else
        printf 'next: ask-base\n'
        printf 'option: switch | %s | HEAD moves to the recorded branch %s now.\n' "$dbranch" "$dbranch"
        printf 'option: stay | - | nothing moves; the run goes on from %s.\n' "$tl_cur"
        printf 'option: abort | - | stop here and run nothing else.\n'
        printf 'checking: %s\n' "$dwork"
      fi
      return 0
    fi
  fi
  # rule 4: a pull request's own branch
  if [[ "${st_pr:-0}" == 1 ]]; then
    if [[ "$rp_mode" == allowed ]]; then
      decide_settled no-branch
      return 0
    elif [[ "$tl_is_base" == no && "$tl_cur" != detached ]]; then
      decide_settled pr
      return 0
    fi
  fi
  # rule 5: the entry named on argv
  if [[ -n "${st_entry:-}" ]]; then
    decide_find "$st_entry"
    if [[ $d_i -ge 0 ]]; then
      decide_base "$st_entry"
      return 0
    fi
  fi
  # rule 6
  decide_suggested
}

# Index of entry key $1 among the st_* arrays in d_i, -1 when there is none.
decide_find() {
  local i
  d_i=-1
  for ((i = 0; i < ${#st_keys[@]}; i++)); do
    if [[ "${st_keys[$i]}" == "$1" ]]; then d_i=$i; return 0; fi
  done
}

decide_settled() {
  printf 'next: settled\n'
  printf 'settled: %s\n' "$1"
}

decide_kept() {
  printf 'next: kept\n'
  printf 'settled: %s\n' "$1"
}

# Rule 6: the suggested entry goes to the base check, else the entry question.
decide_suggested() {
  if [[ "$st_suggested" != none ]]; then decide_base "$st_suggested"; else decide_ask_entry; fi
}

# The entry question: every usable entry, then no-branch (allowed) or abort
# (required); with no usable entry nothing is asked.
decide_ask_entry() {
  local i n=0
  for ((i = 0; i < ${#st_keys[@]}; i++)); do
    if [[ "${st_usable[$i]}" == yes ]]; then n=$((n + 1)); fi
  done
  if [[ $n -eq 0 ]]; then
    printf 'next: none\n'
    printf 'note: no work entry is usable yet, so none is asked; the planner settles the entry once the run carries an issue.\n'
    return 0
  fi
  printf 'next: ask-entry\n'
  for ((i = 0; i < ${#st_keys[@]}; i++)); do
    [[ "${st_usable[$i]}" == yes ]] || continue
    printf 'option: %s | %s | the run branch is cut from %s when the plan lands and pull requests target %s.\n' \
      "${st_keys[$i]}" "${st_names[$i]}" "${st_bases[$i]}" "${st_targets[$i]}"
  done
  if [[ "$rp_mode" == allowed ]]; then
    printf 'option: no-branch | - | no run branch is made; commits land on %s.\n' "$tl_cur"
  else
    printf 'option: abort | - | stop here and run nothing else.\n'
  fi
}

# Rule 7: the base check of entry $1.
decide_base() {
  local i base opts="" count=0
  decide_find "$1"
  i=$d_i
  if [[ $i -lt 0 ]]; then
    decide_ask_entry
    return 0
  fi
  base="${st_bases[$i]}"
  if [[ "${st_at[$i]}" == yes ]]; then
    decide_settled "$1"
    return 0
  fi
  if [[ "${st_roadmap:-0}" == 1 && "$tl_is_base" == no && "$tl_cur" != detached ]]; then
    decide_settled current
    return 0
  fi
  if [[ "${st_exists[$i]}" == yes ]]; then
    opts+="option: switch | $base | HEAD moves to $base now and the run branch is cut from it when the plan lands."$'\n'
    count=$((count + 1))
  fi
  if [[ "${st_fixer:-0}" != 1 ]]; then
    opts+="option: stay | - | nothing moves; the run branch keeps the entry's own name, cut from $base when the plan lands."$'\n'
    count=$((count + 1))
  fi
  if ! [[ "$rp_mode" == required && ( "$tl_is_base" == yes || "$tl_cur" == detached ) ]]; then
    opts+="option: current | - | no run branch is made; commits land on $tl_cur."$'\n'
    count=$((count + 1))
  fi
  if [[ $count -eq 0 && "$rp_mode" == required && "${st_fixer:-0}" == 1 ]]; then
    printf 'next: abort\n'
    printf 'note: branching is required, a fix never commits onto an entry base or a detached HEAD, and the base %s cannot be switched to, so only abort is left.\n' "$base"
    return 0
  fi
  printf 'next: ask-base\n'
  printf '%s' "$opts"
  printf 'option: abort | - | stop here and run nothing else.\n'
  printf 'checking: %s\n' "$1"
  if [[ "${st_behind[$i]}" =~ ^[0-9]+$ && "${st_behind[$i]}" -gt 0 ]]; then
    printf 'note: the base %s is %s commits behind its remote.\n' "$base" "${st_behind[$i]}"
  fi
  if [[ "$tl_dirty" == yes ]]; then
    printf 'note: uncommitted changes block a switch to another commit.\n'
  fi
  if [[ "${st_exists[$i]}" != yes ]]; then
    printf 'note: the base %s does not exist locally, so there is no switch.\n' "$base"
  fi
}

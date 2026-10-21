#!/usr/bin/env bash
#
# red-check.sh - proves, in an isolated git worktree, that one task's tests fail
# without the task's production change and pass with it.
#
# Why: a coder's own word that it saw its tests red is the only evidence a
# "TDD: required" task otherwise carries, and the reviewer cannot see order in a
# diff. This script checks it independently of the coder: it builds a worktree
# from HEAD, copies in only the task's changed test files, runs the task's
# Verification command (the red run), then copies in the task's changed
# production files and runs it again (the control run). The control run guards
# against an environment error posing as red: a red run that fails for any
# reason the change does not fix is reported UNRUNNABLE, never sealed.
#
# Task data comes from one parser, plan-index.sh: the task row's "files" column,
# its "verify:" line and the "extra:" line of "--extra <id>". The test path
# patterns and the linked directory names come from "config.sh --red-check".
# The worktree lies in the system temp directory, OUTSIDE the repository: one
# under .temp/ would be picked up by the test runners of coders working in the
# main tree at the same time.
#
# Known limit: the verdict is per whole Verification command. A test file that
# mixes tests depending on the change with tests that pass without it still
# fails as a whole, so it reads FAIL-AS-EXPECTED; the task's reviewer, never
# waived for a TDD: required task, checks the individual test names in the log.
#
# Contract:
#   argv   : <plan> <id>. The plan file as plan-path.sh printed it (relative to
#            the cwd or absolute) and one task id the plan holds. Any other
#            argument count, an empty value, a plan plan-index.sh refuses or an
#            id the plan does not hold exits 2 with an "error:" line on stderr.
#   cwd    : any directory inside the repository. The plan path is resolved
#            against the cwd first; everything after runs from the repository
#            root (git rev-parse --show-toplevel).
#   env    : TMPDIR (through mktemp -d) picks the system temp directory the
#            worktree lies in. GIT_LITERAL_PATHSPECS=1 is exported for every git
#            call and removed from the Verification command environment.
#   reads  : plan-index.sh "<plan>" and plan-index.sh "<plan>" --extra "<id>"
#            (the task Files, its extras, its Verification command up to the
#            first " -> "); config.sh --red-check (red-check.tests: patterns,
#            an entry ending in "/" a glob on any directory segment, any other
#            a glob on the file name; red-check.links: directory names);
#            git status --porcelain -z -uall of the main tree.
#   changes: a task path counts when git status shows it modified, added,
#            untracked, renamed (both names) or deleted. A deleted file is
#            removed from the worktree, every other one copied over HEAD with
#            its mode kept and a fresh mtime, so a build that compares mtimes
#            never reuses the red run's output in the control run.
#   links  : every directory named in red-check.links that sits in the root or
#            in a directory holding a tracked file (never one inside a linked
#            directory, never one HEAD already tracks) becomes a real directory
#            at the same relative path in the worktree holding one link per
#            entry of the main tree's directory, dot entries included; an
#            @scope directory in it becomes a real directory holding one link
#            per entry of its own. A link is a symlink (ln -s, one per entry)
#            on macOS and Linux, a junction (mklink /J, one cmd batch for all)
#            on Windows Git Bash, MSYS and Cygwin, where a file entry is
#            copied instead. Each link points to its main-tree entry, except
#            an entry that is a link resolving into the repository outside
#            every linked directory (a workspace package): its link points to
#            the same relative path inside the worktree, so the red run loads
#            HEAD's package code and the control run the placed change.
#   writes : .temp/viber/<id>/red-check.log under the repository root, replaced
#            on each call: the git worktree output, the link lines and both
#            runs' output. No tracked file of the main tree and nothing in its
#            index changes; a linked directory is shared, so a runner cache
#            written there lands in the main tree. git records the worktree
#            under .git/worktrees/ until the cleanup. Beside the worktree,
#            <temp dir>/red-check.owner holds the script PID on its first line
#            and, one per line, the worktree-relative path of each directory
#            holding links, written before the directory is made; on Windows
#            the batches mklink.cmd and rmlinks.cmd lie beside it.
#   recover: before the add, every registered worktree named "wt" whose
#            parent holds a red-check.owner with a PID no longer alive (a call
#            killed before its trap ran) loses the links of its listed paths
#            first (a listed link itself, or every link entry of a listed real
#            directory, so a whole directory and single entries both go), and
#            only when every one is gone is it removed (git worktree remove
#            --force, then its temp directory); a link that would not go leaves
#            it in place with a "warning:" line on stderr. git worktree prune
#            follows.
#   cleanup: an EXIT trap (INT, TERM and HUP exit through it) removes the
#            links first, the same way (one cmd rmdir batch on Windows, rm
#            elsewhere; a directory joins its list before it is made, so a
#            signal landing right after a link inside it exists still finds
#            that link), and only when every link is gone runs git worktree
#            remove --force and git worktree prune, so the forced remove never
#            reaches the main tree through a link. A link that would not go
#            leaves the worktree in place with a "warning:" line on stderr.
#   stdout : exactly one line, exit 0:
#              red-check: FAIL-AS-EXPECTED .temp/viber/<id>/red-check.log
#                red run non-zero, control run zero
#              red-check: PASSED-WITHOUT-CHANGE <test file> <test file> ...
#                red run zero; every changed test path of the task
#              red-check: UNRUNNABLE <reason>
#                no test files among the task's changes, a link that failed
#                (link failed: <entry path>, worktree-relative), the worktree
#                could not be built or a task path not placed in it (worktree
#                error: <what>), or
#                the control run failed (control run failed (exit <n>): <log>),
#                or, when that run exits 127 and its output holds
#                "<word>: command not found" for a word other than the first
#                word of the command, the command was cut up by shell
#                substitution (verify command mangled by shell substitution: <log>)
#   exit   : 0 with the verdict line; 2 on bad arguments or plan, nothing on
#            stdout.
#
set -euo pipefail

usage="error: usage: red-check.sh <plan> <id>"
if [[ $# -ne 2 || -z "$1" || -z "$2" ]]; then
  echo "$usage" >&2
  exit 2
fi
plan="${1//\\//}"
id="$2"
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

if [[ ! "$id" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "error: not a task id: $id" >&2
  exit 2
fi
if [[ ! -f "$plan" ]]; then
  echo "error: plan file not found: $plan" >&2
  exit 2
fi
plan_abs="$(cd -- "$(dirname -- "$plan")" && pwd -P)/${plan##*/}"
root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "error: not inside a git repository" >&2
  exit 2
}
cd -- "$root"
root="$(pwd -P)"

# Every task path is one exact path: without this git reads "[id]" or "*" in a
# pathspec as a glob, so an App Router path would also match its siblings.
export GIT_LITERAL_PATHSPECS=1

index="$(bash "$here/plan-index.sh" "$plan_abs" 2>&1)" || {
  printf 'error: plan-index.sh refused the plan: %s\n' "$index" >&2
  exit 2
}
extra="$(bash "$here/plan-index.sh" "$plan_abs" --extra "$id" 2>&1)" || {
  printf 'error: plan-index.sh --extra refused: %s\n' "$extra" >&2
  exit 2
}

files_col=""
verify=""
found=0
while IFS= read -r line; do
  case "$line" in
    "verify: $id | "*) verify="${line#"verify: $id | "}" ;;
    "$id | "*)
      found=1
      files_col="$(RC_LINE="$line" awk 'BEGIN { n = split(ENVIRON["RC_LINE"], f, " [|] "); print f[8] }')"
      ;;
  esac
done < <(printf '%s\n' "$index")
if [[ "$found" -ne 1 ]]; then
  echo "error: no task $id in $plan" >&2
  exit 2
fi
extra_col=""
while IFS= read -r line; do
  case "$line" in
    "extra: "*) extra_col="${line#extra: }" ;;
  esac
done < <(printf '%s\n' "$extra")

tests_pat=""
links_pat=""
while IFS= read -r line; do
  case "$line" in
    "red-check.tests: "*) tests_pat="${line#red-check.tests: }" ;;
    "red-check.links: "*) links_pat="${line#red-check.links: }" ;;
  esac
done < <(bash "$here/config.sh" --red-check)
set -f
# shellcheck disable=SC2206
test_patterns=($tests_pat)
# shellcheck disable=SC2206
link_names=($links_pat)
set +f

# The task's paths: its Files and its extras, a leading "./" stripped once.
task_paths=()
rest="$files_col,$extra_col,"
while [[ -n "$rest" ]]; do
  p="${rest%%,*}"
  rest="${rest#*,}"
  p="${p#./}"
  if [[ -n "$p" && "$p" != "-" ]]; then task_paths+=("$p"); fi
done

# Every path git status shows changed, one per line. With -z a rename's new
# path comes first and the old one follows as a field of its own; both count.
changed=$'\n'
rename_next=0
while IFS= read -r -d '' entry; do
  if [[ "$rename_next" -eq 1 ]]; then
    changed+="$entry"$'\n'
    rename_next=0
    continue
  fi
  xy="${entry:0:2}"
  changed+="${entry:3}"$'\n'
  case "$xy" in
    R* | C* | ?R | ?C) rename_next=1 ;;
  esac
done < <(git status --porcelain -z -uall 2>/dev/null || true)

# True when the path matches a test pattern: an entry ending in "/" against any
# directory segment, any other entry against the file name.
is_test() {
  local path="$1" pat seg name dir
  name="${path##*/}"
  dir=""
  [[ "$path" == */* ]] && dir="${path%/*}"
  for pat in ${test_patterns[@]+"${test_patterns[@]}"}; do
    if [[ "$pat" == */ ]]; then
      pat="${pat%/}"
      [[ -n "$dir" ]] || continue
      local IFS='/'
      for seg in $dir; do
        # shellcheck disable=SC2053
        [[ "$seg" == $pat ]] && return 0
      done
    else
      # shellcheck disable=SC2053
      [[ "$name" == $pat ]] && return 0
    fi
  done
  return 1
}

test_files=()
prod_files=()
seen=$'\n'
for p in ${task_paths[@]+"${task_paths[@]}"}; do
  [[ "$changed" == *$'\n'"$p"$'\n'* ]] || continue
  [[ "$seen" == *$'\n'"$p"$'\n'* ]] && continue
  seen+="$p"$'\n'
  set -f
  if is_test "$p"; then test_files+=("$p"); else prod_files+=("$p"); fi
  set +f
done

if [[ ${#test_files[@]} -eq 0 ]]; then
  echo "red-check: UNRUNNABLE no test files among the task's changes"
  exit 0
fi

log_rel=".temp/viber/$id/red-check.log"
mkdir -p ".temp/viber/$id"
log="$root/$log_rel"
: > "$log"

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) windows=1 ;;
  *) windows=0 ;;
esac

tmp=""
wt=""
links=()
added=0

# Removes every link under <base> that the given base-relative paths hold,
# never following one: a path that is itself a link goes, a real directory loses
# each entry that is a link (a real subdirectory is listed on its own), and a
# path with a link among its parents is skipped, since it lies in another tree.
# On Windows one cmd call runs an rmdir batch written into <scratch>, so a
# directory of many junctions costs one process, not one per entry. True when
# no link is left.
drop_links() {
  local scratch="$1" base="$2" rel q p e w through all=1
  shift 2
  local gone=() wins=() left=()
  set +f
  shopt -s dotglob nullglob
  for rel in "$@"; do
    through=0
    q="$rel"
    while [[ "$q" == */* ]]; do
      q="${q%/*}"
      if [[ -L "$base/$q" ]]; then through=1; fi
    done
    [[ "$through" -eq 0 ]] || continue
    p="$base/$rel"
    if [[ -L "$p" ]]; then
      gone+=("$p")
    elif [[ -d "$p" ]]; then
      for e in "$p"/*; do
        if [[ -L "$e" ]]; then gone+=("$e"); fi
      done
    fi
  done
  shopt -u dotglob nullglob
  [[ ${#gone[@]} -gt 0 ]] || return 0
  if [[ "$windows" -eq 1 ]]; then
    while IFS= read -r w; do wins+=("${w%$'\r'}"); done < <(cygpath -w "${gone[@]}" 2>/dev/null || true)
    {
      printf '@echo off\r\nchcp 65001 >nul\r\n'
      for w in ${wins[@]+"${wins[@]}"}; do printf 'rmdir "%s"\r\n' "${w//%/%%}"; done
    } 2>/dev/null > "$scratch/rmlinks.cmd" || true
    MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cmd /c "$(cygpath -w "$scratch/rmlinks.cmd")" >/dev/null 2>&1 || true
  fi
  for p in "${gone[@]}"; do
    if [[ -L "$p" || -e "$p" ]]; then left+=("$p"); fi
  done
  [[ ${#left[@]} -gt 0 ]] || return 0
  rm -f -- "${left[@]}" 2>/dev/null || true
  for p in "${left[@]}"; do
    if [[ -L "$p" || -e "$p" ]]; then all=0; fi
  done
  [[ "$all" -eq 1 ]]
}

cleanup() {
  local all_gone=1
  if [[ ${#links[@]} -gt 0 ]]; then
    drop_links "$tmp" "$wt" "${links[@]}" || all_gone=0
  fi
  if [[ "$added" -eq 1 ]]; then
    if [[ "$all_gone" -eq 1 ]]; then
      git -C "$root" worktree remove --force "$wt" >/dev/null 2>&1 || true
      git -C "$root" worktree prune >/dev/null 2>&1 || true
      rm -rf -- "$tmp" 2>/dev/null || true
    else
      echo "warning: red-check.sh left the worktree $wt in place: a link would not go" >&2
    fi
  elif [[ -n "$tmp" ]]; then
    rm -rf -- "$tmp" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

# Removes the worktree of an earlier call killed before its trap ran: its links
# first, read from its owner file, and the worktree only once all are gone.
reclaim_stale() {
  local line p owner pid rel all_gone rels
  while IFS= read -r line; do
    case "$line" in
      "worktree "*) p="${line#worktree }" ;;
      *) continue ;;
    esac
    [[ "$p" == */wt ]] || continue
    owner="${p%/wt}/red-check.owner"
    [[ -f "$owner" ]] || continue
    pid=""
    IFS= read -r pid < "$owner" || true
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    kill -0 "$pid" 2>/dev/null && continue
    all_gone=1
    rels=()
    while IFS= read -r rel; do
      rel="${rel%$'\r'}"
      [[ -n "$rel" ]] || continue
      rels+=("$rel")
    done < <(tail -n +2 "$owner")
    if [[ ${#rels[@]} -gt 0 ]]; then
      drop_links "${p%/wt}" "$p" "${rels[@]}" || all_gone=0
    fi
    if [[ "$all_gone" -eq 1 ]]; then
      git -C "$root" worktree remove --force "$p" >> "$log" 2>&1 || true
      rm -rf -- "${p%/wt}" 2>/dev/null || true
      printf 'red-check: reclaimed %s\n' "$p" >> "$log"
    else
      echo "warning: red-check.sh left the stale worktree $p in place: a link would not go" >&2
    fi
  done < <(git worktree list --porcelain 2>/dev/null || true)
}

reclaim_stale
tmp="$(mktemp -d)" || {
  echo "red-check: UNRUNNABLE worktree error: mktemp -d failed"
  exit 0
}
wt="$tmp/wt"
printf '%s\n' "$$" > "$tmp/red-check.owner"
git worktree prune >> "$log" 2>&1 || true
if git worktree add --detach "$wt" HEAD >> "$log" 2>&1; then
  added=1
else
  echo "red-check: UNRUNNABLE worktree error: git worktree add failed: $log_rel"
  exit 0
fi

# Sets entry_to to the target of the worktree link for one main-tree entry of a
# linked directory: an entry that is a link resolving into the repository
# outside every linked directory (a workspace package, node_modules/@scope/pkg
# -> ../../packages/pkg) points to the same relative path inside the worktree,
# so the red run loads HEAD's code; any other entry points to itself in the main
# tree. Builtins only (cd -P, PWD): no process per entry. Case-blind on
# Windows, where a junction may resolve in another case.
entry_target() {
  local src="$1" phys trel n inside=0
  entry_to="$src"
  [[ -L "$src" ]] || return 0
  cd -P -- "$src" 2>/dev/null || return 0
  phys="$PWD"
  cd -- "$root"
  if [[ "$windows" -eq 1 ]]; then shopt -s nocasematch; fi
  if [[ "$phys" == "$root"/* ]]; then
    trel="${phys:${#root}+1}"
    for n in ${link_names[@]+"${link_names[@]}"}; do
      case "/$trel/" in */"$n"/*) inside=1 ;; esac
    done
    if [[ "$inside" -eq 0 ]]; then entry_to="$wt/$trel"; fi
  fi
  shopt -u nocasematch
  return 0
}

pair_rel=()
pair_target=()
copied=()

# Makes <rel> a real directory of the worktree and queues one link per entry of
# the main tree's <rel>, dot entries included; at the top level (<top> 1) an
# @scope directory becomes one of its own the same way. Each directory joins
# the owner file and the cleanup list before it is made, so a signal landing
# right after any link inside it exists still finds that link. On Windows a
# file entry is copied in one cp call per directory: a junction holds only a
# directory.
queue_dir() {
  local rel="$1" top="$2" src name
  local scopes=() files=()
  printf '%s\n' "$rel" >> "$tmp/red-check.owner"
  links+=("$rel")
  mkdir -p "$wt/$rel" 2>/dev/null || {
    echo "red-check: UNRUNNABLE link failed: $rel"
    exit 0
  }
  shopt -s dotglob nullglob
  for src in "$root/$rel"/*; do
    name="${src##*/}"
    if [[ "$top" -eq 1 && "$name" == @* && -d "$src" && ! -L "$src" ]]; then
      scopes+=("$rel/$name")
    elif [[ "$windows" -eq 1 && -f "$src" ]]; then
      files+=("$src")
      copied+=("$rel/$name")
    else
      entry_target "$src"
      pair_rel+=("$rel/$name")
      pair_target+=("$entry_to")
    fi
  done
  shopt -u dotglob nullglob
  if [[ ${#files[@]} -gt 0 ]]; then
    cp -p -- "${files[@]}" "$wt/$rel/" >> "$log" 2>&1 || true
  fi
  for name in ${scopes[@]+"${scopes[@]}"}; do
    queue_dir "$name" 0
  done
}

# Link candidates: the root and every directory holding a tracked file. A
# directory inside a linked name is never one, so nothing below node_modules is
# searched.
linked=()
if [[ ${#link_names[@]} -gt 0 ]]; then
  while IFS= read -r d; do
    skip=0
    for n in "${link_names[@]}"; do
      case "/$d/" in */"$n"/*) skip=1 ;; esac
    done
    [[ "$skip" -eq 1 ]] && continue
    for n in "${link_names[@]}"; do
      if [[ "$d" == "." ]]; then rel="$n"; else rel="$d/$n"; fi
      [[ -d "$root/$rel" ]] || continue
      [[ -e "$wt/$rel" || -L "$wt/$rel" ]] && continue
      linked+=("$rel")
    done
  done < <({ printf '.\n'; git ls-files -z | tr '\0' '\n' | awk '{ n = split($0, s, "/"); d = ""; for (i = 1; i < n; i++) { d = (d == "" ? s[i] : d "/" s[i]); print d } }'; } | sort -u)
fi
for rel in ${linked[@]+"${linked[@]}"}; do
  queue_dir "$rel" 1
done

# The links themselves: one ln per entry elsewhere, one cmd call running a
# mklink /J batch on Windows, the two worktree and main-tree prefixes converted
# once rather than one cygpath per entry.
if [[ ${#pair_rel[@]} -gt 0 ]]; then
  if [[ "$windows" -eq 1 ]]; then
    win_wt="$(cygpath -w "$wt")"
    win_root="$(cygpath -w "$root")"
    {
      printf '@echo off\r\nchcp 65001 >nul\r\n'
      for ((i = 0; i < ${#pair_rel[@]}; i++)); do
        l="$win_wt\\${pair_rel[i]}"
        t="${pair_target[i]}"
        if [[ "$t" == "$wt/"* ]]; then t="$win_wt\\${t#"$wt/"}"; else t="$win_root\\${t#"$root/"}"; fi
        l="${l//\//\\}"
        t="${t//\//\\}"
        printf 'mklink /J "%s" "%s"\r\n' "${l//%/%%}" "${t//%/%%}"
      done
    } > "$tmp/mklink.cmd"
    MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cmd /c "$(cygpath -w "$tmp/mklink.cmd")" >> "$log" 2>&1 || true
  else
    for ((i = 0; i < ${#pair_rel[@]}; i++)); do
      ln -s "${pair_target[i]}" "$wt/${pair_rel[i]}" >> "$log" 2>&1 || break
    done
  fi
fi
for ((i = 0; i < ${#pair_rel[@]}; i++)); do
  if [[ ! -L "$wt/${pair_rel[i]}" ]]; then
    echo "red-check: UNRUNNABLE link failed: ${pair_rel[i]}"
    exit 0
  fi
done
for rel in ${copied[@]+"${copied[@]}"}; do
  if [[ ! -f "$wt/$rel" ]]; then
    echo "red-check: UNRUNNABLE link failed: $rel"
    exit 0
  fi
done
for rel in ${linked[@]+"${linked[@]}"}; do
  printf 'red-check: linked %s\n' "$rel" >> "$log"
done

# Brings one task path from the main tree into the worktree: copied when it
# exists, removed when the change deleted it.
place() {
  if [[ -e "$root/$1" ]]; then
    mkdir -p "$wt/$(dirname -- "$1")" && cp -p "$root/$1" "$wt/$1" && touch "$wt/$1"
  else
    rm -f -- "$wt/$1"
  fi
}

# Places every path given, or ends the run UNRUNNABLE on the first that fails.
place_all() {
  local f
  for f in "$@"; do
    place "$f" >> "$log" 2>&1 || {
      echo "red-check: UNRUNNABLE worktree error: could not place $f"
      exit 0
    }
  done
}

# Runs the Verification command in the worktree, its output appended to the log.
run_verify() {
  local status=0
  printf '\n===== %s run: %s\n' "$1" "$verify" >> "$log"
  (cd -- "$wt" && unset GIT_LITERAL_PATHSPECS && bash -c "$verify") >> "$log" 2>&1 < /dev/null || status=$?
  printf '===== %s run exit: %s\n' "$1" "$status" >> "$log"
  return "$status"
}

place_all "${test_files[@]}"
red=0
run_verify red || red=$?

if [[ "$red" -eq 0 ]]; then
  echo "red-check: PASSED-WITHOUT-CHANGE ${test_files[*]}"
  exit 0
fi

place_all ${prod_files[@]+"${prod_files[@]}"}
control=0
run_verify control || control=$?

if [[ "$control" -ne 0 ]]; then
  if [[ "$control" -eq 127 ]]; then
    first_word="${verify#"${verify%%[![:space:]]*}"}"
    first_word="${first_word%%[[:space:]]*}"
    while IFS= read -r line; do
      word="${line%%: command not found*}"
      word="${word##*: }"
      word="${word##* }"
      if [[ -n "$word" && "$word" != "$first_word" ]]; then
        echo "red-check: UNRUNNABLE verify command mangled by shell substitution: $log_rel"
        exit 0
      fi
    done < <(awk '/^===== control run: / { s = 1; next } s && /: command not found/' "$log")
  fi
  echo "red-check: UNRUNNABLE control run failed (exit $control): $log_rel"
  exit 0
fi
echo "red-check: FAIL-AS-EXPECTED $log_rel"
exit 0

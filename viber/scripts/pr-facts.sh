#!/bin/sh
#
# pr-facts.sh - resolves every fact `pr-create` needs to open a pull request for
# the current branch, as one fixed text block: whether a pull request can be
# opened at all, the branching work entry and target, the template, the type,
# the issues and the commits the pull request carries.
#
# It exists so the skill reads the situation through ONE pre-approved command:
# a hand-composed mix of `gh`, `git log` and config greps differs per run and
# each variant is a new, unapproved command. Self-verifying: a block is printed
# only after every check ran - the caller trusts it and never re-checks a stop
# reason, and nothing is pushed, created or changed here.
#
# Contract:
#   argv   : none | --entry <key> | --target <branch>. --entry names the
#            branching.work entry and --target the branch the pull request
#            targets (ENTRY stays empty). Anything else (an unknown flag, a
#            missing or empty value, both flags) -> exit 2 with one ERROR line
#            on stderr and nothing on stdout.
#   cwd    : any directory inside the host repository - the script resolves the
#            repository root itself. Outside one, the answer is `no-repo`.
#   env    : none of its own; gh reads its usual auth and host config.
#   file   : the sibling config.sh block (github.pr-title, directories.*) and
#            `config.sh --branching` (mode, entries); the frontmatter of
#            docs/<directories.runs>/*/plan.md (`branch:`, `work:`, `issue:`)
#            and its `Repro:` lines inside task blocks; the `issue:` of an
#            archived docs/<directories.specifications>/<key>/spec.md;
#            .github/PULL_REQUEST_TEMPLATE/<entry>.md and
#            .github/pull_request_template.md.
#   gh     : `gh repo view` (repository URL and default branch) and `gh pr list
#            --head <branch> --state open` (url and base branch). Never a create,
#            never a push.
#   git    : read-only. The target is resolved as the remote-tracking ref of
#            the local target branch's own upstream (`branch.<target>.remote`
#            and `.merge`), else that of the head branch's remote
#            (`branch.<b>.remote`, else origin), else refs/heads/<target>;
#            nothing is fetched.
#   stdout : exit 0, lines in this order:
#              STATUS=ready|stop
#              REASON=no-gh|no-repo|detached|dirty|on-base|pr-exists|no-commits|unknown-entry   (stop only)
#              PR_URL=<url>                        (pr-exists only)
#              QA=<repo-relative path or empty>    (pr-exists only)
#              REPO=<repository url>
#              BRANCH=<current branch>
#              DEFAULT=<default branch>
#              MODE=off|allowed|required
#              ENTRY=<work entry key or empty>
#              TARGET=<branch or empty>
#              CANDIDATE=<key> | target: <branch>  (0+, only with ENTRY and TARGET empty and MODE not off)
#              CLOSES=yes|no|                      (empty while TARGET is empty)
#              TYPE=feat|fix
#              ISSUE=<n>                           (0+, ascending, unique)
#              TEMPLATE=<repo-relative path or empty>
#              SPEC=<repo-relative path or empty>
#              QA=<repo-relative path or empty>
#              TITLE_PATTERN=<github.pr-title>
#              COMMIT=<short sha> <subject>        (0+, TARGET..HEAD oldest first)
#            A stop prints only STATUS=stop, REASON= and, on pr-exists, PR_URL=
#            and QA=.
#            Stop checks, in order: no-gh, no-repo (not a repository, or gh
#            resolves no repository or default branch), detached, dirty
#            (tracked changes only), on-base (BRANCH is DEFAULT, or any entry
#            base or target), unknown-entry (--entry names no entry), pr-exists
#            (an open pull request with head BRANCH), no-commits (TARGET
#            resolves and nothing is ahead of it). A TARGET that resolves
#            nowhere gives no COMMIT line and no stop.
#            ENTRY - never under MODE=off, where ENTRY and CANDIDATE stay empty
#            and --entry is ignored: --entry; else the `work:` of the open run
#            (the plan.md whose `branch:` is BRANCH, the last by name) when that
#            names an entry; else the single entry whose `name` pattern matches
#            BRANCH ({type} = fix|feature, {slug} = [a-z0-9-]+, {issue-number} =
#            digits). Two or more matching entries are listed as CANDIDATE, no
#            matching entry lists every entry. TARGET: --target, else the
#            entry's target. The run: the open run, else the archived run whose
#            spec.md a listed commit touches (the newest such). TYPE: fix when
#            the open run has a Repro: line, a matched {type} is fix, or BRANCH
#            starts with fix/ or hotfix/; feat otherwise. ISSUE: the `Refs: #<n>`
#            footers of the listed commits, the run's `issue:` number, a matched
#            {issue-number}. TEMPLATE: the entry's own file when ENTRY is set,
#            else the default file, else empty. SPEC: the run's spec.md, else the
#            open run's plan.md, empty with no run. QA: the qa.md in the directory
#            of SPEC (the open run, else the archived run), empty when no such
#            file exists. On pr-exists the run resolves the same way with the
#            existing pull request's base standing in for TARGET (no stop fires
#            from that). CLOSES: yes when TARGET equals DEFAULT.
#   exit   : 0 with the block (a stop included); 1 with `ERROR pr-facts.sh: gh pr
#            list failed` on stderr and nothing on stdout when that lookup fails;
#            2 on bad arguments.
#
set -u

usage() {
  echo "ERROR pr-facts.sh: usage: pr-facts.sh [--entry <key> | --target <branch>]" >&2
  exit 2
}

entry_arg=""
target_arg=""
case $# in
  0) ;;
  2)
    [ -n "$2" ] || usage
    case $1 in
      --entry) entry_arg=$2 ;;
      --target) target_arg=$2 ;;
      *) usage ;;
    esac
    ;;
  *) usage ;;
esac

here=$(cd "$(dirname -- "$0")" 2>/dev/null && pwd)

stop() {
  printf 'STATUS=stop\nREASON=%s\n' "$1"
  [ -z "${2:-}" ] || printf 'PR_URL=%s\nQA=%s\n' "$2" "${3:-}"
  exit 0
}

command -v gh >/dev/null 2>&1 || stop no-gh
root=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$root" ] && cd "$root" 2>/dev/null || stop no-repo

info=$(gh repo view --json url,defaultBranchRef --jq '.url + "\n" + (.defaultBranchRef.name // "")' 2>/dev/null | tr -d '\r')
repo=$(printf '%s\n' "$info" | sed -n 1p)
default=$(printf '%s\n' "$info" | sed -n 2p)
[ -n "$repo" ] && [ -n "$default" ] || stop no-repo

branch=$(git symbolic-ref --short -q HEAD 2>/dev/null)
[ -n "$branch" ] || stop detached
[ -z "$(git status --porcelain --untracked-files=no 2>/dev/null)" ] || stop dirty

branching=$(bash "$here/config.sh" --branching 2>/dev/null | tr -d '\r')
block=$(bash "$here/config.sh" 2>/dev/null | tr -d '\r')
mode=$(printf '%s\n' "$branching" | sed -n 's/^mode: //p' | sed -n 1p)
case $mode in
  allowed|required) entries=$(printf '%s\n' "$branching" | sed -n 's/^entry: //p') ;;
  *) mode=off; entries="" ;;
esac

cfg_value() {
  printf '%s\n' "$block" | sed -n "s/^$1: //p" | sed -n 1p
}
runs=$(cfg_value directories.runs)
specs=$(cfg_value directories.specifications)
runs=${runs:-_specs}
specs=${specs:-specs}
title_pattern=$(cfg_value github.pr-title)

# The entry line (`<key> | base: .. | name: .. | target: ..`) of key $1.
entry_line_for() {
  printf '%s\n' "$entries" | while IFS= read -r el; do
    if [ "${el%% | *}" = "$1" ]; then printf '%s\n' "$el"; break; fi
  done
}

# Sets m_ok, m_type and m_issue for name pattern $1 against branch $2.
pattern_match() {
  m_ok=""
  m_type=""
  m_issue=""
  pm_re=$(printf '%s\n' "$1" | sed -e 's#[.]#\\.#g' -e 's#{type}#(fix|feature)#g' -e 's#{issue-number}#([0-9]+)#g' -e 's#{slug}#[a-z0-9-]+#g')
  case $pm_re in *'{'*|*'}'*) return 0 ;; esac
  pm_kinds=$(printf '%s\n' "$1" | grep -o -E '\{(type|issue-number)\}' | tr -d '{}' | tr '\n' ' ')
  pm_rep=""
  pm_n=0
  for pm_k in $pm_kinds; do
    pm_n=$((pm_n + 1))
    pm_rep="$pm_rep \\$pm_n"
  done
  pm_caps=$(printf '%s\n' "$2" | sed -n -E "s#^${pm_re}\$#M${pm_rep}#p")
  [ -n "$pm_caps" ] || return 0
  m_ok=1
  set -- $pm_caps
  shift
  for pm_k in $pm_kinds; do
    case $pm_k in
      type) m_type=$1 ;;
      issue-number) m_issue=$1 ;;
    esac
    shift
  done
}

# The frontmatter value of key $2 in file $1, up to its first whitespace.
fm_field() {
  awk -v key="$2" '
NR == 1 { if ($0 !~ /^---[[:space:]]*$/) exit; next }
/^---[[:space:]]*$/ { exit }
$0 ~ "^" key ":" { sub(/^[^:]*:[[:space:]]*/, ""); sub(/[[:space:]].*$/, ""); print; exit }
' "$1"
}

# The issue number of the frontmatter `issue:` of file $1 (an issue URL, #N or N).
fm_issue() {
  awk '
NR == 1 { if ($0 !~ /^---[[:space:]]*$/) exit; next }
/^---[[:space:]]*$/ { exit }
/^issue:/ {
  v = $0
  sub(/^issue:[[:space:]]*/, "", v)
  if (match(v, /\/issues\/[0-9]+/)) print substr(v, RSTART + 8, RLENGTH - 8)
  else if (match(v, /^#?[0-9]+/)) { sub(/^#/, "", v); sub(/[^0-9].*$/, "", v); print v }
  exit
}
' "$1"
}

# "fix" when a task block of plan $1 carries a Repro: line, else "feat".
plan_type() {
  awk '
/^[[:space:]]*<!--[[:space:]]*TASK[[:space:]]*-->[[:space:]]*$/ { intask = 1; next }
/^[[:space:]]*<!--[[:space:]]*\/TASK[[:space:]]*-->[[:space:]]*$/ { intask = 0; next }
intask && /^[[:space:]]*(-[[:space:]]*)?Repro:/ { fix = 1; exit }
END { print (fix ? "fix" : "feat") }
' "$1"
}

onbase=$(printf '%s\n' "$entries" | while IFS= read -r line; do
  [ -n "$line" ] || continue
  b=${line#* | base: }
  b=${b%% | *}
  t=${line##* | target: }
  if [ "$branch" = "$b" ] || [ "$branch" = "$t" ]; then echo yes; fi
done)
[ "$branch" != "$default" ] && [ -z "$onbase" ] || stop on-base

if [ -n "$entry_arg" ] && [ "$mode" != off ] && [ -z "$(entry_line_for "$entry_arg")" ]; then stop unknown-entry; fi

open_plan=""
for p in "docs/$runs"/*/plan.md; do
  [ -f "$p" ] || continue
  if [ "$(fm_field "$p" branch)" = "$branch" ]; then open_plan=$p; fi
done

# Sets tref to the ref of branch $1, first match wins: the remote-tracking ref of
# the local $1's own upstream (branch.<$1>.remote and .merge), then the one of
# the head branch's remote (origin when it has none or it is "."), then refs/heads/<$1>, else empty. A
# remote-tracking ref comes first because the pull request opens against the
# remote branch and a local one may hold unpushed commits; the target's own
# upstream comes before the head branch's remote, which in a fork workflow is
# the fork, whose copy of the target is often stale.
resolve_tref() {
  tref=""
  [ -n "$1" ] || return 0
  up_remote=$(git config --get "branch.$1.remote" 2>/dev/null)
  up_merge=$(git config --get "branch.$1.merge" 2>/dev/null)
  case "$up_merge" in
    refs/heads/?*)
      if [ -n "$up_remote" ] && [ "$up_remote" != . ] \
        && git rev-parse -q --verify "refs/remotes/$up_remote/${up_merge#refs/heads/}^{commit}" >/dev/null 2>&1; then
        tref=refs/remotes/$up_remote/${up_merge#refs/heads/}
        return 0
      fi
      ;;
  esac
  rt_remote=$(git config --get "branch.$branch.remote" 2>/dev/null)
  case "$rt_remote" in "" | .) rt_remote=origin ;; esac
  if git rev-parse -q --verify "refs/remotes/$rt_remote/$1^{commit}" >/dev/null 2>&1; then
    tref=refs/remotes/$rt_remote/$1
  elif git rev-parse -q --verify "refs/heads/$1^{commit}" >/dev/null 2>&1; then
    tref=refs/heads/$1
  fi
}

# Sets spec and issue_file: the open run, else the archived run whose spec.md a commit of tref..HEAD touches.
find_spec() {
  spec=""
  issue_file=""
  if [ -n "$open_plan" ]; then
    if [ -f "${open_plan%/plan.md}/spec.md" ]; then spec="${open_plan%/plan.md}/spec.md"; else spec=$open_plan; fi
    issue_file=$open_plan
  elif [ -n "$tref" ]; then
    touched=$(git log --no-renames --format= --name-only "$tref..HEAD" -- "docs/$specs" 2>/dev/null | tr -d '\r' | grep -E "^docs/$specs/[^/]+/spec\.md\$" | awk '!seen[$0]++')
    spec=$(printf '%s\n' "$touched" | while IFS= read -r f; do
      [ -f "$f" ] || continue
      printf '%s\n' "$f"
      break
    done)
    issue_file=$spec
  fi
}

# The qa.md beside the resolved spec (empty when there is none).
find_qa() {
  qa=""
  if [ -n "$spec" ] && [ -f "${spec%/*}/qa.md" ]; then qa="${spec%/*}/qa.md"; fi
}

if ! pr_raw=$(gh pr list --head "$branch" --state open --json url,baseRefName --jq '.[] | .url + "\n" + (.baseRefName // "")' 2>/dev/null); then
  echo "ERROR pr-facts.sh: gh pr list failed" >&2
  exit 1
fi
pr_info=$(printf '%s\n' "$pr_raw" | tr -d '\r')
prs=$(printf '%s\n' "$pr_info" | sed -n 1p)
if [ -n "$prs" ]; then
  resolve_tref "$(printf '%s\n' "$pr_info" | sed -n 2p)"
  find_spec
  find_qa
  stop pr-exists "$prs" "$qa"
fi

entry=""
target=""
candidates=""
if [ -n "$target_arg" ]; then
  target=$target_arg
elif [ "$mode" != off ]; then
  work=""
  if [ -n "$open_plan" ]; then work=$(fm_field "$open_plan" work); fi
  if [ -n "$entry_arg" ]; then
    entry=$entry_arg
  elif [ -n "$work" ] && [ -n "$(entry_line_for "$work")" ]; then
    entry=$work
  else
    matches=$(printf '%s\n' "$entries" | while IFS= read -r line; do
      [ -n "$line" ] || continue
      name=${line#* | name: }
      name=${name%% | *}
      pattern_match "$name" "$branch"
      if [ -n "$m_ok" ]; then printf '%s\n' "${line%% | *}"; fi
    done)
    count=$(printf '%s\n' "$matches" | grep -c .)
    if [ "$count" -eq 1 ]; then
      entry=$matches
    elif [ "$count" -ge 2 ]; then
      candidates=$matches
    else
      candidates=$(printf '%s\n' "$entries" | while IFS= read -r line; do
        [ -n "$line" ] || continue
        printf '%s\n' "${line%% | *}"
      done)
    fi
  fi
  if [ -n "$entry" ]; then
    line=$(entry_line_for "$entry")
    target=${line##* | target: }
  fi
fi

m_ok=""
m_type=""
m_issue=""
if [ -n "$entry" ]; then
  line=$(entry_line_for "$entry")
  name=${line#* | name: }
  name=${name%% | *}
  pattern_match "$name" "$branch"
fi

resolve_tref "$target"

commits=""
refs_issues=""
if [ -n "$tref" ]; then
  ahead=$(git rev-list --count "$tref..HEAD" 2>/dev/null)
  [ "${ahead:-0}" -gt 0 ] || stop no-commits
  commits=$(git log --reverse --format='%h %s' "$tref..HEAD" 2>/dev/null | tr -d '\r')
  refs_issues=$(git log --format=%B "$tref..HEAD" 2>/dev/null | grep -E '^Refs:[[:space:]]*#[0-9]+' | grep -o -E '#[0-9]+' | tr -d '#')
fi

find_spec
find_qa
spec_issue=""
if [ -n "$issue_file" ]; then spec_issue=$(fm_issue "$issue_file"); fi

type=feat
if [ -n "$open_plan" ]; then type=$(plan_type "$open_plan"); fi
case $branch in fix/*|hotfix/*) type=fix ;; esac
if [ "$m_type" = fix ]; then type=fix; fi

issues=$(printf '%s\n%s\n%s\n' "$refs_issues" "$spec_issue" "$m_issue" | grep -E '^[0-9]+$' | sort -n -u)

template=""
if [ -n "$entry" ] && [ -f ".github/PULL_REQUEST_TEMPLATE/$entry.md" ]; then
  template=".github/PULL_REQUEST_TEMPLATE/$entry.md"
elif [ -f .github/pull_request_template.md ]; then
  template=.github/pull_request_template.md
fi

closes=""
if [ -n "$target" ]; then
  if [ "$target" = "$default" ]; then closes=yes; else closes=no; fi
fi

echo "STATUS=ready"
echo "REPO=$repo"
echo "BRANCH=$branch"
echo "DEFAULT=$default"
echo "MODE=$mode"
echo "ENTRY=$entry"
echo "TARGET=$target"
printf '%s\n' "$candidates" | while IFS= read -r k; do
  [ -n "$k" ] || continue
  l=$(entry_line_for "$k")
  echo "CANDIDATE=$k | target: ${l##* | target: }"
done
echo "CLOSES=$closes"
echo "TYPE=$type"
printf '%s\n' "$issues" | while IFS= read -r n; do
  [ -n "$n" ] || continue
  echo "ISSUE=$n"
done
echo "TEMPLATE=$template"
echo "SPEC=$spec"
echo "QA=$qa"
echo "TITLE_PATTERN=$title_pattern"
printf '%s\n' "$commits" | while IFS= read -r c; do
  [ -n "$c" ] || continue
  echo "COMMIT=$c"
done
exit 0

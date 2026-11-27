#!/bin/sh
#
# pr-facts.sh - resolves every fact `pr-create` needs to open a pull request for
# the current branch, as one fixed text block: whether a pull request can be
# opened at all, the target, the template, the type, the issues and the commits
# the pull request carries.
#
# It exists so the skill reads the situation through ONE pre-approved command:
# a hand-composed mix of `gh` and `git log` differs per run and each variant is
# a new, unapproved command. Self-verifying: a block is printed only after
# every check ran - the caller trusts it and never re-checks a stop reason, and
# nothing is pushed, created or changed here.
#
# Contract:
#   argv   : none | --target <branch>. --target names the branch the pull
#            request targets. Anything else (an unknown flag, a missing or
#            empty value) -> exit 2 with one ERROR line on stderr and nothing
#            on stdout.
#   cwd    : any directory inside the host repository - the script resolves the
#            repository root itself. Outside one, the answer is `no-repo`.
#   env    : none of its own; gh reads its usual auth and host config.
#   file   : the sibling plugin-root.sh (sourced);
#            .github/pull_request_template.md.
#   gh     : `gh repo view` (repository URL and default branch), `gh pr list
#            --head <branch> --state open` (url) and `gh issue view <first
#            ISSUE>` (its title). Never a create, never a push.
#   git    : read-only. The target is resolved as the remote-tracking ref of
#            the local target branch's own upstream (`branch.<target>.remote`
#            and `.merge`), else that of the head branch's remote
#            (`branch.<b>.remote`, else origin), else refs/heads/<target>;
#            nothing is fetched.
#   stdout : exit 0, lines in this order:
#              STATUS=ready|stop
#              REASON=no-gh|no-repo|detached|dirty|on-base|pr-exists|no-commits   (stop only)
#              PR_URL=<url>                        (pr-exists only)
#              SAY=<sentence of the reason>        (stop only, the last line)
#              REPO=<repository url>
#              BRANCH=<current branch>
#              DEFAULT=<default branch>
#              TARGET=<branch or empty>
#              CLOSES=yes|no|                      (empty while TARGET is empty)
#              TYPE=feat|fix
#              ISSUE=<n>                           (0+, ascending, unique)
#              ISSUE_TITLE=<title of the first ISSUE, empty with no ISSUE or a failed lookup>
#              TEMPLATE=<repo-relative path or empty>
#              COMMIT=<short sha> <subject>        (0+, TARGET..HEAD oldest first)
#              TITLE=<[<first ISSUE>] <ISSUE_TITLE> | empty>
#              FOOTER=Closes #<n> | Refs #<n>      (one per ISSUE=, same order; Closes when CLOSES=yes)
#              BODY_FILE=<root>/.temp/viber/pr-create/body-<yyyy-mm-dd-HH-MM-SS>.md   (only named, never created here)
#              ASK=target                          (only with TARGET empty)
#              RERUN="<plugin root>/scripts/pr-facts.sh" --target "<branch>"   (with ASK=)
#            <plugin root> is the invoked path cut before /scripts/ by the sibling
#            plugin-root.sh, as text (never pwd): C:/... for a C:\ or C:/ path;
#            <branch> stays a literal slot the caller fills with the answer.
#            A stop prints only STATUS=stop, REASON=, on pr-exists PR_URL=, and
#            last SAY=<the sentence of that reason, which the caller states and
#            never rewords>.
#            Stop checks, in order: no-gh, no-repo (not a repository, or gh
#            resolves no repository or default branch), detached, dirty
#            (tracked changes only), on-base (BRANCH is DEFAULT), pr-exists
#            (an open pull request with head BRANCH), no-commits (TARGET
#            resolves and nothing is ahead of it). A TARGET that resolves
#            nowhere gives no COMMIT line and no stop.
#            TARGET: --target, else empty. TYPE: fix when BRANCH starts with
#            fix/ or hotfix/; feat otherwise. ISSUE: the `Resolves #<n>[,
#            resolves #<n>]...` footers of the listed commits. TEMPLATE:
#            .github/pull_request_template.md when it exists, else empty.
#            CLOSES: yes when TARGET equals DEFAULT.
#   exit   : 0 with the block (a stop included); 1 with `ERROR pr-facts.sh: gh pr
#            list failed` on stderr and nothing on stdout when that lookup fails;
#            2 on bad arguments.
#
set -u

usage() {
  echo "ERROR pr-facts.sh: usage: pr-facts.sh [--target <branch>]" >&2
  exit 2
}

target=""
case $# in
  0) ;;
  2)
    [ -n "$2" ] || usage
    case $1 in
      --target) target=$2 ;;
      *) usage ;;
    esac
    ;;
  *) usage ;;
esac

. "$(dirname -- "$0")/plugin-root.sh"
plugin_root=$(plugin_root_of "$0" 1)

stop() {
  case $1 in
    no-gh) say="GitHub command line tool missing." ;;
    no-repo) say="No GitHub repository reachable." ;;
    detached) say="HEAD is detached; check out a branch." ;;
    dirty) say="Uncommitted changes to tracked files; commit them first." ;;
    on-base) say="The branch is the default branch; a pull request needs its own branch." ;;
    pr-exists) say="The branch already has an open pull request: ${2:-}." ;;
    no-commits) say="Nothing on the branch is ahead of its target." ;;
  esac
  printf 'STATUS=stop\nREASON=%s\n' "$1"
  [ -z "${2:-}" ] || printf 'PR_URL=%s\n' "$2"
  printf 'SAY=%s\n' "$say"
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
[ "$branch" != "$default" ] || stop on-base

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

if ! pr_raw=$(gh pr list --head "$branch" --state open --json url --jq '.[] | .url' 2>/dev/null); then
  echo "ERROR pr-facts.sh: gh pr list failed" >&2
  exit 1
fi
prs=$(printf '%s\n' "$pr_raw" | tr -d '\r' | sed -n 1p)
[ -z "$prs" ] || stop pr-exists "$prs"

resolve_tref "$target"

commits=""
issues=""
if [ -n "$tref" ]; then
  ahead=$(git rev-list --count "$tref..HEAD" 2>/dev/null)
  [ "${ahead:-0}" -gt 0 ] || stop no-commits
  commits=$(git log --reverse --format='%h %s' "$tref..HEAD" 2>/dev/null | tr -d '\r')
  issues=$(git log --format=%B "$tref..HEAD" 2>/dev/null | grep -E '^Resolves[[:space:]]+#[0-9]+' | grep -o -E '#[0-9]+' | tr -d '#' | sort -n -u)
fi

type=feat
case $branch in fix/*|hotfix/*) type=fix ;; esac

# The first issue's title becomes the pull request title; a failed lookup
# leaves it empty, so the caller states the title itself.
issue_title=""
first_issue=$(printf '%s\n' "$issues" | sed -n '1p')
if [ -n "$first_issue" ]; then
  issue_title=$(gh issue view "$first_issue" --json title --jq '.title' 2>/dev/null | tr -d '\r' | sed -n '1p')
fi

template=""
if [ -f .github/pull_request_template.md ]; then
  template=.github/pull_request_template.md
fi

title=""
if [ -n "$issue_title" ]; then
  title="[$first_issue] $issue_title"
fi

closes=""
if [ -n "$target" ]; then
  if [ "$target" = "$default" ]; then closes=yes; else closes=no; fi
fi

echo "STATUS=ready"
echo "REPO=$repo"
echo "BRANCH=$branch"
echo "DEFAULT=$default"
echo "TARGET=$target"
echo "CLOSES=$closes"
echo "TYPE=$type"
printf '%s\n' "$issues" | while IFS= read -r n; do
  [ -n "$n" ] || continue
  echo "ISSUE=$n"
done
echo "ISSUE_TITLE=$issue_title"
echo "TEMPLATE=$template"
printf '%s\n' "$commits" | while IFS= read -r c; do
  [ -n "$c" ] || continue
  echo "COMMIT=$c"
done
echo "TITLE=$title"
if [ "$closes" = yes ]; then footer_word=Closes; else footer_word=Refs; fi
printf '%s\n' "$issues" | while IFS= read -r n; do
  [ -n "$n" ] || continue
  echo "FOOTER=$footer_word #$n"
done
echo "BODY_FILE=$root/.temp/viber/pr-create/body-$(date +%Y-%m-%d-%H-%M-%S).md"
if [ -z "$target" ]; then
  echo "ASK=target"
  echo "RERUN=\"$plugin_root/scripts/pr-facts.sh\" --target \"<branch>\""
fi
exit 0

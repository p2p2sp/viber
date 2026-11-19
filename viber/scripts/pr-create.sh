#!/bin/sh
# viber - scripts/pr-create.sh
#
# Pushes the current branch with its upstream set and opens a pull request for
# it in one deterministic step: `git push -u <remote> <branch>` -> `gh pr
# create` -> parse the printed URL. It exists so `pr-create` publishes through
# ONE pre-approved command, and so the push is never repeated or skipped by a
# model deciding step by step. Self-verifying: PR_URL is printed only after gh
# returned a well-formed pull request URL - the caller trusts the block without
# re-checking. With --issue it first creates the branch on GitHub as a branch
# linked to that issue: closing keywords link a pull request to its issue only
# when it targets the default branch, GitHub has no API to link a pull request
# by hand, and a branch already pushed can no longer be linked.
#
# Contract:
#   argv : $1 = body file path, $2 = title, then in any order:
#            --base <branch>   the branch the pull request targets (required)
#            --draft           open the pull request as a draft (optional)
#            --issue <n>       the issue to link the branch to (optional)
#   cwd  : the repository whose current branch is published; gh resolves the
#          repository from it too. A relative body file resolves against it.
#   env  : none of its own; git and gh read their usual auth and config.
#   file : $1, sent verbatim as the pull request body, then removed once the
#          pull request exists (exit 0); every other exit leaves it in place.
#   remote: `branch.<branch>.remote`, else `origin`; a `.` there (the branch
#          tracks a local branch) counts as no remote. Push: `git push -u
#          <remote> <branch>`. Link, only with --issue and before the push,
#          when `git ls-remote` finds no such branch on <remote>: GraphQL
#          `createLinkedBranch` (the repository `gh repo view` resolves, the
#          issue's node id, name <branch>, oid `git merge-base HEAD
#          <remote>/<base>`, a commit the remote already holds), so the push
#          is a fast-forward of the linked branch. Any failed step leaves the
#          link out and the push and create run as without --issue.
#          Create: `gh pr create --base <base> --head
#          <branch> --title <title> --body-file <file>` plus `--draft`.
#          Assign: `gh pr edit <url> --add-assignee @me`, the authenticated
#          gh user being the pull request's author; a separate call so a
#          refused assignment (no triage right on the repository) never turns
#          a created pull request into a failure.
#   stdout, exit 0:
#            PR_URL=https://<host>/<owner>/<repo>/pull/<N>
#            PR_NUMBER=<N>
#            PUSHED=<remote>/<branch>
#            ASSIGNEE=@me | dropped   dropped: the assignment failed, the
#                                     pull request stands unassigned
#            LINK=linked | manual | none   linked: the branch was created
#                                     linked to the issue; manual: --issue
#                                     given, the link failed; none: no --issue
#            LINK_REASON=<why the link failed, empty unless LINK=manual>
#   exit 1: one ERROR line on stderr, nothing on stdout - the push failed
#           (nothing was created), or `gh pr create` failed or printed no pull
#           request URL (the ERROR line names the branch as pushed).
#   exit 2: one ERROR line on stderr - missing body file or title, body file
#           not found, no --base, an --issue that is not a number, an unknown
#           or valueless flag, gh missing or a
#           detached HEAD; nothing is pushed and gh is never invoked.
set -u

body=${1:-}; title=${2:-}
if [ -z "$body" ] || [ -z "$title" ]; then
  echo "ERROR pr-create.sh: need <body file> <title> --base <branch> [--draft]" >&2
  exit 2
fi
if [ ! -f "$body" ]; then
  echo "ERROR pr-create.sh: body file not found: $body" >&2
  exit 2
fi
shift 2

base=""
draft=""
issue=""
while [ $# -gt 0 ]; do
  a=$1; shift
  case $a in
    --base)
      [ $# -gt 0 ] || { echo "ERROR pr-create.sh: --base needs a value" >&2; exit 2; }
      base=$1; shift ;;
    --issue)
      [ $# -gt 0 ] || { echo "ERROR pr-create.sh: --issue needs a value" >&2; exit 2; }
      case $1 in
        ''|*[!0-9]*) echo "ERROR pr-create.sh: --issue is not a number: $1" >&2; exit 2 ;;
      esac
      issue=$1; shift ;;
    --draft) draft=--draft ;;
    *)
      echo "ERROR pr-create.sh: unknown flag $a" >&2; exit 2 ;;
  esac
done
if [ -z "$base" ]; then
  echo "ERROR pr-create.sh: --base is required" >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR pr-create.sh: gh not found on PATH" >&2
  exit 2
fi

branch=$(git symbolic-ref --short -q HEAD 2>/dev/null)
if [ -z "$branch" ]; then
  echo "ERROR pr-create.sh: detached HEAD, no branch to publish" >&2
  exit 2
fi
remote=$(git config --get "branch.$branch.remote" 2>/dev/null)
[ "$remote" = . ] && remote=
remote=${remote:-origin}

link=none
reason=""
if [ -n "$issue" ]; then
  link=manual
  git ls-remote --exit-code --heads "$remote" "refs/heads/$branch" >/dev/null 2>&1
  lr=$?
  if [ $lr -eq 0 ]; then
    reason="branch $branch is already on $remote"
  elif [ $lr -ne 2 ]; then
    reason="could not read the branches of $remote"
  elif ! oid=$(git merge-base HEAD "refs/remotes/$remote/$base" 2>/dev/null); then
    reason="no merge base with $remote/$base"
  elif ! repo_id=$(gh repo view --json id --jq .id 2>/dev/null) || [ -z "$repo_id" ]; then
    reason="the repository id lookup failed"
  elif ! issue_id=$(gh issue view "$issue" --json id --jq .id 2>/dev/null) || [ -z "$issue_id" ]; then
    reason="the lookup of issue #$issue failed"
  else
    lb=$(gh api graphql \
      -f query='mutation($r: ID!, $i: ID!, $o: GitObjectID!, $n: String!) { createLinkedBranch(input: {repositoryId: $r, issueId: $i, oid: $o, name: $n}) { linkedBranch { id } } }' \
      -f r="$repo_id" -f i="$issue_id" -f o="$oid" -f n="$branch" \
      --jq '.data.createLinkedBranch.linkedBranch.id' 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$lb" ] && [ "$lb" != null ]; then
      link=linked
    else
      reason="createLinkedBranch linked no branch to issue #$issue"
    fi
  fi
fi

if ! pout=$(git push -u "$remote" "$branch" 2>&1); then
  echo "ERROR pr-create.sh: git push failed: $(printf '%s' "$pout" | tr '\n\r' '  ')" >&2
  exit 1
fi

out=$(gh pr create --base "$base" --head "$branch" --title "$title" --body-file "$body" ${draft:+"$draft"} 2>&1)
st=$?
url=$(printf '%s\n' "$out" | tr -d '\r' \
  | sed -n 's#^\(https://[^/][^/]*/[^/][^/]*/[^/][^/]*/pull/[0-9][0-9]*\)$#\1#p' | tail -n 1)
if [ $st -ne 0 ] || [ -z "$url" ]; then
  echo "ERROR pr-create.sh: gh pr create failed, branch $remote/$branch is pushed: $(printf '%s' "$out" | tr '\n\r' '  ')" >&2
  exit 1
fi
rm -f "$body"

assignee=@me
gh pr edit "$url" --add-assignee @me >/dev/null 2>&1 || assignee=dropped

echo "PR_URL=$url"
echo "PR_NUMBER=${url##*/}"
echo "PUSHED=$remote/$branch"
echo "ASSIGNEE=$assignee"
echo "LINK=$link"
echo "LINK_REASON=$reason"
exit 0

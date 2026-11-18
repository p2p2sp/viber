#!/usr/bin/env bash
#
# run-changes.sh - prints the paths a run changed in the working tree: the base
# commit the run started from and one line per path that differs from it.
#
# `test-runner` selects the integration tests of the final run from the files the
# build changed, and it used to work that set out itself: find the commit that
# added the run's `plan.md`, diff against it, add the untracked files, drop the
# duplicates. A model asked to do that drifts - it diffs against the wrong
# commit, forgets the untracked files, lists a path twice. This script derives
# the set the same way every time, so the caller reads lines and selects.
#
# Contract:
#   argv   : $1 run directory (OPTIONAL, at most one): relative to the repository
#            root or absolute; a backslash is read as `/` and trailing slashes
#            are dropped. No argument, or an empty one, means the base is HEAD.
#            More than one argument exits 2.
#   cwd    : any directory inside the host repository - the script moves to the
#            repository root itself, so a relative argument resolves the same
#            from every directory and the printed paths are relative to the
#            root. Outside a repository it exits 2. No git command writes.
#   env    : none. GIT_LITERAL_PATHSPECS is set for the git calls here, so a
#            bracket or star in the run directory name is a literal path.
#   reads  : the git history and index. The run directory itself is never read,
#            only named to git: a directory that does not exist has no commit
#            adding its plan.md.
#   writes : nothing.
#   stdout : on exit 0, in this order:
#              base: <sha>       the oldest commit of
#                                `git log --diff-filter=A -- <run-dir>/plan.md`
#              base: HEAD        when no argument was given
#              base: none        when the argument was given and no commit added
#                                its plan.md; nothing else is printed then
#              changed: <path>   one line per path of `git diff --name-only
#                                <base>`, then one per path of `git ls-files
#                                --others --exclude-standard`; a path both lists
#                                hold is printed once, at its first place. A
#                                path is printed as written, never quoted.
#            Nothing changed prints the `base:` line alone.
#   exit   : 0 the lines were printed.
#            2 more than one argument, or no git repository around the cwd; one
#              `error: ...` line on stderr, nothing on stdout.
#
set -u

if [[ $# -gt 1 ]]; then
  echo "error: usage: run-changes.sh [<run-dir>]" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" || ! -d "$repo_root" ]]; then
  echo "error: not inside a git repository" >&2
  exit 2
fi
CDPATH= cd -- "$repo_root" || exit 2

# A run directory name is a literal path, never a glob.
export GIT_LITERAL_PATHSPECS=1

base="HEAD"
raw="${1:-}"
if [[ -n "$raw" ]]; then
  dir="${raw//\\//}"
  while [[ "$dir" == */ && "$dir" != "/" ]]; do dir="${dir%/}"; done
  base="$(git log --diff-filter=A --reverse --format=%H -- "$dir/plan.md" 2>/dev/null | sed -n '1p')"
  if [[ -z "$base" ]]; then
    echo "base: none"
    exit 0
  fi
fi

echo "base: $base"

{
  git -c core.quotepath=false diff --name-only "$base" 2>/dev/null || true
  git -c core.quotepath=false ls-files --others --exclude-standard 2>/dev/null || true
} | awk 'NF && !seen[$0]++ { print "changed: " $0 }'
exit 0

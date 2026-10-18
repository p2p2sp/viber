#!/usr/bin/env bash
#
# commit-context.sh - prints the context the commit fork composes its message
# from: the resolved selector, the issue footer, the branch, the recent commit
# subjects (the repo's type/scope style to match), and the git status and diff of
# the selected set, the diff capped so it cannot flood the fork's context.
#
# It exists so the fork gets everything in one `!` preload instead of composing
# git calls itself, and so the set it measures is resolved by the same parser
# (commit-args.sh) commit.sh stages with.
#
# Usage:
#   commit-context.sh [selector]
#
# Contract:
#   argv   : $1 selector (optional) - the skill's whole raw argument string,
#            resolved as in commit-args.sh: ""/all -> all, existing paths ->
#            paths (the context narrowed to them), named paths none of which
#            exists -> missing. SKILL.md passes it single-quoted
#            ('$ARGUMENTS'): Claude Code substitutes the text before the shell
#            runs, so only single quotes keep $, backticks and backslashes
#            literal - an apostrophe in the arguments breaks the preload.
#   cwd    : any directory inside the repository to commit in; the script
#            moves to its root, so every git call and every path it prints is
#            root-relative (see commit-args.sh).
#   env    : none read; it sets GIT_LITERAL_PATHSPECS=1 for its git calls, so a
#            "[", "*" or "?" in a selector is part of a file name, never a glob.
#   stdout : markdown sections, the "## Selector:" line first; in mode missing
#            that line alone. The diff is capped at MAX_LINES with a notice
#            naming the real total; an empty diff beside a non-empty status
#            (untracked files only) says outright that commit.sh still has
#            work to commit.
#   exit   : 0 in every data condition. Deliberately WITHOUT `set -e`: it is a
#            best-effort preload, and one failed git call must not abort the
#            skill load.
set -uo pipefail
# Every selector token is a literal path, as in commit.sh: "[id]" or "*" in a
# pathspec must not glob, or the status and diff would list unselected files.
export GIT_LITERAL_PATHSPECS=1
source "$(dirname "${BASH_SOURCE[0]}")/commit-args.sh"

mode_raw="${1:-}"
MAX_LINES=400

enter_repo_root
resolve_commit_selector "$mode_raw"
paths_label="${COMMIT_PATHS[*]:-}"

# Diff base: HEAD when the branch has commits, otherwise the empty tree object
# (unborn branch / fresh repo without HEAD). git diff <empty-tree> shows staged
# additions instead of dying with "ambiguous argument 'HEAD'".
if git rev-parse --verify -q HEAD >/dev/null 2>&1; then
  BASE="HEAD"
else
  BASE="$(git hash-object -t tree /dev/null 2>/dev/null || echo 4b825dc642cb6eb9a060e54bf8d69288fbee4904)"
fi

if [ "$COMMIT_MODE" = "paths" ]; then
  echo "## Selector: paths - run commit.sh with 2nd arg \"$paths_label\""
elif [ "$COMMIT_MODE" = "missing" ]; then
  echo "## Selector: missing - none of the named paths exists ($COMMIT_MISSING); do NOT run commit.sh, return: Nothing committed - paths not found: $COMMIT_MISSING"
  exit 0
else
  echo "## Selector: all - run commit.sh with no 2nd arg"
fi
echo

if [ -n "$COMMIT_ISSUE_REFS" ]; then
  echo "## Issue footer (explicit, from a #N reference or GitHub issue link in the arguments - use verbatim, ignore the branch)"
  refs=""
  for n in $COMMIT_ISSUE_REFS; do refs="${refs:+$refs, }#$n"; done
  echo "Refs: $refs"
  echo
fi

echo "## Current branch (issue-footer source)"
# symbolic-ref: the plain branch name even when unborn (main), no HEAD fatal.
git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null || true
echo

echo "## Recent commit subjects (match this type/scope style)"
git log --oneline -n 10 2>&1 || true
echo

if [ "$COMMIT_MODE" = "paths" ]; then
  echo "## Changes (git status for paths: $paths_label)"
  status_out="$(git status --short --untracked-files=all -- "${COMMIT_PATHS[@]}" 2>&1)"
else
  echo "## Changes (git status, all untracked files)"
  status_out="$(git status --short --untracked-files=all 2>&1)"
fi
[ -z "$status_out" ] || printf '%s\n' "$status_out"
echo

if [ "$COMMIT_MODE" = "paths" ]; then
  echo "## Overview (git diff HEAD --stat for paths: $paths_label)"
  git diff "$BASE" --stat -- "${COMMIT_PATHS[@]}" 2>&1 || true
  echo
  echo "## Diff (changes vs HEAD for paths: $paths_label; a new untracked file appears only in git status above)"
  diff_out="$(git diff "$BASE" -- "${COMMIT_PATHS[@]}" 2>&1)"
else
  echo "## Overview (git diff HEAD --stat)"
  git diff "$BASE" --stat 2>&1 || true
  echo
  echo "## Diff (all tracked changes vs HEAD; new untracked files are listed in git status above)"
  diff_out="$(git diff "$BASE" 2>&1)"
fi

# An empty diff beside a non-empty status is new untracked files (or a change
# with no text, such as a mode change): a fork once read the bare "no textual
# diff" line as "nothing changed" and answered Nothing to commit without ever
# running commit.sh, so that case says outright that there IS work to commit.
if [ -z "$diff_out" ] && [ -n "$status_out" ]; then
  echo "(no textual diff, but git status above lists changes - they are still committed: run commit.sh)"
elif [ -z "$diff_out" ]; then
  echo "(no textual diff for this mode)"
else
  total=$(printf '%s\n' "$diff_out" | wc -l | tr -d ' ')
  printf '%s\n' "$diff_out" | head -n "$MAX_LINES"
  if [ "$total" -gt "$MAX_LINES" ]; then
    echo "... [diff truncated: showing first ${MAX_LINES} of ${total} lines - run git diff for the rest]"
  fi
fi

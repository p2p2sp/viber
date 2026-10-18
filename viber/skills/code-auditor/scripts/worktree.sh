#!/bin/sh
# viber - skills/code-auditor/scripts/worktree.sh
# Clean-checkout verification worktree lifecycle for hunter / critic runs.
#
# Self-verifying: `add` does not report READY until the path actually resolves
# as a git worktree (judged by the worktree it made, not by git's exit status,
# which carries a failing post-checkout hook's), and `remove` does not report REMOVED until the path is
# gone. Every recovery from a dirty or half-registered state is handled here -
# a stale registration, a leftover directory, replay artifacts a bare
# `worktree remove` refuses to delete - so the caller never has to branch on a
# git error message. Both commands are idempotent: `add` over an existing path
# reclaims it, `remove` over an absent path succeeds.
#
# IN : add|remove <target-root> <worktree-path>
#      <target-root>    the repo to anchor to (git -C). The caller's cwd is
#                       never used to locate a repo - without -C git would
#                       silently operate on whatever tree the session sits in.
#      <worktree-path>  MUST be absolute (POSIX /... or Windows C:/...). A
#                       relative path would resolve against the caller's cwd,
#                       and parallel callers each own a distinct path.
#                       MUST NOT be the target root or an ancestor of it -
#                       compared on the physical, case-folded path.
# OUT: exactly one line on stdout -
#        WORKTREE_READY <worktree-path>     add succeeded and was verified
#        WORKTREE_REMOVED <worktree-path>   remove succeeded and was verified
#        WORKTREE_FAILED <reason>           neither could be achieved
#      exit 0 on READY / REMOVED, 1 on FAILED. git's own stderr is relayed on
#      stderr for diagnosis; stdout stays exactly one line either way.
set -u

fail() {
  printf 'WORKTREE_FAILED %s\n' "$1"
  exit 1
}

# norm_path <path> -> stdout: the same path with backslashes rewritten to
# forward slashes and trailing slashes stripped. Comparison-only, not
# filesystem-truthful (a bare root normalises to empty/no-drive) - used to
# decide whether two argument spellings name the same path.
norm_path() {
  printf '%s' "$1" | tr '\134' '/' | sed 's:/*$::'
}

cmd=${1:-}
root=${2:-}
wt=${3:-}

if [ -z "$cmd" ] || [ -z "$root" ] || [ -z "$wt" ]; then
  fail "usage: worktree.sh add|remove <target-root> <worktree-path>"
fi

case "$wt" in
  /|//|[A-Za-z]:[\\/]) fail "refusing to operate on a filesystem root: $wt" ;;
  /*|[A-Za-z]:[\\/]*) ;;
  *) fail "worktree path must be absolute: $wt" ;;
esac

[ "$(norm_path "$wt")" != "$(norm_path "$root")" ] || fail "worktree path must not be the target root: $wt"

git -C "$root" rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repository: $root"

# canon <dir> -> stdout: physical path (Windows form under Git Bash), no
# trailing /, case-folded. Subshell: the cd never moves the script.
canon() {
  (CDPATH= cd -- "$1" 2>/dev/null && { pwd -W 2>/dev/null || pwd -P; }) | sed 's:/*$::' | tr '[:upper:]' '[:lower:]'
}

# Text guards miss other spellings (case, /./, an ancestor): compare physically.
if [ -d "$wt" ]; then
  wt_c=$(canon "$wt")
  root_c=$(canon "$root")
  # An empty wt_c is `/`, which holds every root: "/"* still matches.
  if [ -n "$root_c" ]; then
    case "$root_c/" in
      "$wt_c"/*) fail "worktree path holds the target root: $wt" ;;
    esac
  fi
fi

# Everything that can stand between us and a fresh `worktree add` at $wt:
# a registration git still holds, a directory git no longer knows about, or
# both. Each step is best-effort - the caller only cares about the end state,
# which the add/remove verification below establishes independently.
clear_path() {
  git -C "$root" worktree remove --force "$wt" >/dev/null 2>&1 || true
  [ ! -e "$wt" ] || rm -rf "$wt" >/dev/null 2>&1 || true
  git -C "$root" worktree prune >/dev/null 2>&1 || true
}

# made_worktree -> status 0 when $wt is a linked work tree of its own (its
# `.git` link file exists and git sees it as a work tree). `git worktree add`
# exits with the post-checkout hook's status, so a non-zero exit does not say
# whether the worktree was made; this does.
made_worktree() {
  [ -f "$wt/.git" ] || return 1
  [ "$(git -C "$wt" rev-parse --is-inside-work-tree 2>/dev/null)" = "true" ]
}

case "$cmd" in
  add)
    fresh=1
    [ ! -e "$wt" ] || fresh=0
    if ! err=$(git -C "$root" worktree add --detach "$wt" HEAD 2>&1); then
      if [ "$fresh" = 1 ] && made_worktree; then
        printf '%s\n' "$err" >&2
      else
        clear_path
        if ! err=$(git -C "$root" worktree add --detach "$wt" HEAD 2>&1); then
          printf '%s\n' "$err" >&2
          made_worktree || fail "worktree add failed after recovery: $wt"
        fi
      fi
    fi
    inside=$(git -C "$wt" rev-parse --is-inside-work-tree 2>/dev/null) || inside=""
    [ "$inside" = "true" ] || fail "worktree add reported success but $wt is not a work tree"
    printf 'WORKTREE_READY %s\n' "$wt"
    ;;
  remove)
    if [ -e "$wt" ]; then
      if ! err=$(git -C "$root" worktree remove --force "$wt" 2>&1); then
        rm -rf "$wt" >/dev/null 2>&1 || true
      fi
      if [ -e "$wt" ]; then
        printf '%s\n' "$err" >&2
        fail "could not remove $wt"
      fi
    fi
    git -C "$root" worktree prune >/dev/null 2>&1 || true
    printf 'WORKTREE_REMOVED %s\n' "$wt"
    ;;
  *)
    fail "unknown command: $cmd (expected add or remove)"
    ;;
esac

#!/usr/bin/env bash
#
# commit.sh - runs the git commit with the message it is handed.
#
# It exists so the commit skill's one write to history is a single command to
# the permission engine rather than an add-then-commit pair the model composes
# per call, and so the selectors resolve through one shared parser
# (commit-args.sh) instead of once per call site.
#
# Usage:
#   commit.sh <message> [selector...]
#
# Contract:
#   argv   : $1 message (REQUIRED) - the commit's message, used verbatim.
#            $2.. selector (optional) - what to commit; several args are
#            joined with spaces into one selector string:
#              (empty)/all - every change (modified, new and deleted files)
#              <paths>     - ONLY those paths (files or directories, separated
#                            by whitespace or commas), isolated from any other
#                            staged change; POSIX, C:/, C:\ and /c/ spellings
#                            are all accepted (see commit-args.sh). A path
#                            already staged, removed with "git rm" or tracked
#                            under an ignored directory is committed; an
#                            untracked path an ignore rule covers is not.
#   cwd    : any directory inside the repository the commit lands in; the
#            script moves to its root, and a relative <path> resolves against
#            the caller's directory first, then against the root (see
#            commit-args.sh).
#   env    : none read; it sets GIT_LITERAL_PATHSPECS=1 for its git calls, so a
#            "[", "*" or "?" in a selector is part of a file name, never a glob.
#   stdout : git's own commit line, or the single line "Nothing to commit."
#            when the selected set holds no staged change.
#   exit   : 0 on a commit and on "Nothing to commit." alike. 1 on a missing
#            message (usage on stderr); 3 when the selector names paths and
#            none of them exists (mode 'missing' in commit-args.sh - nothing
#            is committed, never a fallback to every change); otherwise git's
#            own non-zero status.
#
set -euo pipefail
# Every selector token is a literal path: without this git reads "[id]" or "*" in
# a pathspec as a glob, so 'app/[id]/page.tsx' would also take app/i/page.tsx.
export GIT_LITERAL_PATHSPECS=1
source "$(dirname "${BASH_SOURCE[0]}")/commit-args.sh"

message="${1:-}"
selector="${*:2}"

if [[ -z "$message" ]]; then
  echo "error: missing required parameter 'message'" >&2
  echo "usage: commit.sh <message> [selector...]" >&2
  exit 1
fi

enter_repo_root
resolve_commit_selector "$selector"

# Gives the working tree the exec bit the index holds for every path whose staged
# mode differs from HEAD's (a new path included): sync_tree_modes [<path>...].
# Under core.fileMode=true "git add -u" and "git add -A" read a tracked path's
# mode back from the tree, so an exec bit staged with "git update-index
# --chmod=+x" over a 0644 file was dropped before the commit. Once the tree
# agrees with the index the add keeps the mode. Under core.fileMode=false git
# keeps the index mode by itself and chmod leaves the index alone. A path whose
# mode only the tree changed is not touched: that change is the caller's. The
# same shape as sync_tree_modes in viber's commit-task.sh.
sync_tree_modes() {
  local meta p mode base=HEAD
  local -a scope=()
  [[ $# -eq 0 ]] || scope=(-- "$@")
  git rev-parse -q --verify HEAD >/dev/null || base="$(git hash-object -t tree /dev/null)"
  # a --raw record is ":<old mode> <new mode> <old sha> <new sha> <status>",
  # each mode six digits, then the path
  while IFS= read -r -d '' meta && IFS= read -r -d '' p; do
    mode="${meta:8:6}"
    [[ "${meta:1:6}" != "$mode" && -f "$p" && ! -L "$p" ]] || continue
    if [[ "$mode" == 100755 && ! -x "$p" ]]; then
      chmod +x -- "$p" || true
    elif [[ "$mode" == 100644 && -x "$p" ]]; then
      chmod -x -- "$p" || true
    fi
  done < <(git diff --cached --raw -z --no-renames "$base" ${scope[@]+"${scope[@]}"})
}

if [[ "$COMMIT_MODE" == "missing" ]]; then
  echo "error: none of the named paths exists: $COMMIT_MISSING - nothing committed" >&2
  exit 3
fi

if [[ "$COMMIT_MODE" == "paths" ]]; then
  # One "git add -- <paths>" is not enough: it fails outright on a path already
  # removed with "git rm", and exits 1 on a TRACKED file under a directory an
  # ignore rule covers although it staged the file - either aborts the commit.
  # Tracked paths go through "add -u", which ignore rules never touch; untracked
  # ones only when no ignore rule covers them (never force-added). A path gone
  # from disk and index needs nothing: its deletion is already staged, and the
  # pathspec commit below takes it from HEAD. Only paths git knows afterwards
  # (index or HEAD) enter that pathspec - an ignored untracked one would make
  # "git commit" refuse the whole list. A mode change staged with
  # "git update-index --chmod=+x" is committed like any other staged change.
  sync_tree_modes "${COMMIT_PATHS[@]}"
  known=()
  for p in "${COMMIT_PATHS[@]}"; do
    if [[ -n "$(git ls-files -- "$p")" ]]; then
      git add -u -- "$p"
    fi
    if [[ -e "$p" ]]; then
      new=()
      while IFS= read -r -d '' u; do new+=("$u"); done < <(git ls-files -z -o --exclude-standard -- "$p")
      if [[ ${#new[@]} -gt 0 ]]; then
        git add -- "${new[@]}"
      fi
    fi
    if [[ -n "$(git ls-files -- "$p")" || -n "$(git ls-tree -r --name-only HEAD -- "$p" 2>/dev/null)" ]]; then
      known+=("$p")
    fi
  done
  # those paths alone: check them, then commit them as the index holds them
  if [[ ${#known[@]} -eq 0 ]] || git diff --cached --quiet -- "${known[@]}"; then
    echo "Nothing to commit."
    exit 0
  fi
  # Not "git commit -- <paths>": that partial commit re-reads each path from the
  # working tree into an index built from HEAD, and under core.fileMode=false
  # (every Windows checkout) takes the mode from HEAD - a staged exec bit was
  # dropped, and a mode change alone failed as "nothing to commit". A temporary
  # index starts from HEAD and takes the known paths' entries from the real
  # index (a staged deletion is their absence there); every other staged path
  # stays staged. The same shape as commit_named in viber's commit-task.sh.
  # --full-name: update-index reads every path as root-relative, whatever the
  # cwd, so ls-files must print them that way too.
  idx="$(git rev-parse --absolute-git-dir)/index.viber-commit.$$"
  trap 'rm -f "$idx"' EXIT
  if git rev-parse -q --verify HEAD >/dev/null; then
    GIT_INDEX_FILE="$idx" git read-tree HEAD
  else
    GIT_INDEX_FILE="$idx" git read-tree --empty
  fi
  GIT_INDEX_FILE="$idx" git rm -r -q --cached --ignore-unmatch -- "${known[@]}" >/dev/null
  git ls-files -s -z --full-name -- "${known[@]}" | GIT_INDEX_FILE="$idx" git update-index -z --index-info
  GIT_INDEX_FILE="$idx" git commit -m "$message"
else
  sync_tree_modes
  git add -A
  if git diff --cached --quiet; then
    echo "Nothing to commit."
    exit 0
  fi
  git commit -m "$message"
fi

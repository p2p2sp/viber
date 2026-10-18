#!/usr/bin/env bash
#
# commit-args.sh - the shared argument normalisation of the commit skill.
# Source it and call: enter_repo_root, then resolve_commit_selector "<raw>"
#
# It exists because commit-context.sh (which MEASURES the selected set) and
# commit.sh (which STAGES it) each parsed the selector themselves and drifted:
# one treated a file named "all" as a path, the other as the keyword.
#
# Sets these variables:
#   COMMIT_MODE       - all | paths | missing
#   COMMIT_PATHS      - array of the paths (only for mode=paths), otherwise
#                       empty
#   COMMIT_MISSING    - the path-shaped tokens that do not exist, space-joined
#                       (only for mode=missing), otherwise empty
#   COMMIT_ISSUE_REFS - the issue numbers given in the arguments - from GitHub
#                       links and from bare "#123" references (the way a user
#                       names an issue in a prompt) - unique, in order of
#                       appearance ("42" / "42 7"), an empty string when there
#                       was no reference at all
#
# The selector (the keyword is case-insensitive; an existing path WINS over it
# - a file or directory named "all" is a path). "Existing" means on disk or in
# the git index, so a deleted tracked file still counts:
#   the whole string is an existing path -> paths (that one path, spaces kept)
#   "" / all         -> all    (every change: modified, new and deleted)
#   a list           -> paths  (split on whitespace and commas; every token
#                               that is an existing path is kept, the rest
#                               dropped)
#   no token is an existing path, and one of them is path-shaped (holds a
#   "/" or "\")               -> missing (nothing is committed: a caller who
#                               named paths never gets a commit of everything)
#   no token is an existing path, none path-shaped -> all (fallback: a prose
#                               description passed by mistake in place of a
#                               selector)
#
# A path containing a space works only as the sole selector: inside a list the
# split cuts it apart.
#
# Every caller runs enter_repo_root first, so the selector resolves at the
# repository root. A relative token is tried against the caller's former
# working directory (git's own reading: the root plus --show-prefix) and then
# against the root, and COMMIT_PATHS holds the root-relative form that matched.
# Without it, a session started in a subdirectory would see a root-relative
# path as missing, and a cwd-relative path git prints, fed back where git reads
# a root-relative one, would move the selected files to the root.
#
# An absolute path is handed to git VERBATIM. On every platform git natively
# resolves the Windows-drive (C:/foo, C:\foo) and MSYS (/c/foo) forms, so no
# manual separator conversion is needed.
#
# Issue references are cut out of the arguments BEFORE the selector is
# recognised, so "src/foo #42" still resolves to path=src/foo. An existing path
# wins over a reference: the whole argument, or a whitespace token, that is an
# existing path is never cut, so a file "bugs/#12.md" is that path with no
# reference. A cut removes only the "#42" itself, never the characters around it.
#
# Contract:
#   argv   : none - it is sourced, never run. resolve_commit_selector takes $1,
#            the whole raw argument string of the skill; empty means mode all.
#   cwd    : any directory inside the repository the commit lands in;
#            enter_repo_root records its prefix and moves the sourcing shell to
#            the root, where every later check runs.
#   env    : none read; sets the four COMMIT_* variables above plus the
#            internal COMMIT_SELECTOR_RAW, COMMIT_CWD_PREFIX and
#            COMMIT_RESOLVED in the sourcing shell.
#   stdout : nothing.
#   exit   : resolve_commit_selector always returns 0; the mode carries the
#            result. enter_repo_root returns 1 only when cd to the root fails;
#            outside a repository it stays put and returns 0.
enter_repo_root() {
  local top
  COMMIT_CWD_PREFIX="$(git rev-parse --show-prefix 2>/dev/null || true)"
  top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$top" ]; then
    cd "$top" || return 1
  fi
  return 0
}

add_issue_ref() {
  local num="$1"
  case " $COMMIT_ISSUE_REFS " in
    *" $num "*) : ;;  # the same issue named twice - keep one
    *) COMMIT_ISSUE_REFS="${COMMIT_ISSUE_REFS:+$COMMIT_ISSUE_REFS }$num" ;;
  esac
}

# Cuts every match of regex $2 out of $1, adding the issue number to
# COMMIT_ISSUE_REFS; the text left without matches lands in COMMIT_SELECTOR_RAW.
# The regex holds four groups: 1 the boundary before the reference, 2 the text
# to cut, 3 the issue number, 4 the boundary after it. Only group 2 is removed;
# the boundaries stay, so "bugs/#12.md" loses just the "#12". The loop consumes
# a prefix (out += before-match, scan := after-match), so it shrinks every
# iteration and always ends - an in-place replacement could hit an earlier,
# unmatched occurrence of the same text.
strip_issue_refs() {
  local scan="$1" re="$2" full
  local out=""
  while [[ "$scan" =~ $re ]]; do
    full="${BASH_REMATCH[0]}"
    add_issue_ref "${BASH_REMATCH[3]}"
    out="$out${scan%%"$full"*}${BASH_REMATCH[1]}"
    scan="${BASH_REMATCH[4]}${scan#*"$full"}"
  done
  COMMIT_SELECTOR_RAW="$out$scan"
}

# Cuts the references out of one whitespace token into COMMIT_SELECTOR_RAW.
cut_issue_refs() {
  # A bare "#123" needs a non-alphanumeric boundary on both sides, or a hex
  # colour (#1a2b3c) or a URL fragment (#issue-12x) would pass for an issue.
  local url_re='()(https?://[^[:space:]]+/issues/([0-9]+)[^[:space:]]*)()'
  local hash_re='(^|[^[:alnum:]_])(#([0-9]+))([^[:alnum:]_]|$)'
  # Links first: a URL may carry a fragment (.../issues/42#issuecomment-1),
  # and nothing of it is left once the whole link is cut out.
  strip_issue_refs "$1" "$url_re"
  strip_issue_refs "$COMMIT_SELECTOR_RAW" "$hash_re"
}

# Fills COMMIT_ISSUE_REFS and leaves the arguments without their references in
# COMMIT_SELECTOR_RAW. A whitespace token that is an existing path is kept
# whole, so a file named "#12.md" is not read as a reference.
extract_issue_refs() {
  local raw="${1:-}" tok kept=""
  local -a words=()
  COMMIT_ISSUE_REFS=""
  IFS=$' \t\n' read -r -d '' -a words <<<"$raw" || true
  for tok in ${words[@]+"${words[@]}"}; do
    if resolve_commit_path "$tok"; then
      kept="$kept $tok"
    else
      cut_issue_refs "$tok"
      kept="$kept $COMMIT_SELECTOR_RAW"
    fi
  done
  # Cutting the references leaves doubled spaces - collapse them and trim the
  # ends, or the rest of the arguments matches neither the keyword nor a path.
  raw="$kept"
  while [[ "$raw" == *"  "* ]]; do raw="${raw//  / }"; done
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  COMMIT_SELECTOR_RAW="$raw"
}

# True when $1 is on disk, in the git index (a deleted tracked file is gone
# from disk but still indexed) or in HEAD (a path already removed with
# "git rm" is gone from both, and its staged deletion is exactly what the
# caller wants committed - dropping it silently narrowed a list to the paths
# still on disk, or widened a list of only such paths to mode 'all').
is_commit_path() {
  [ -n "$1" ] || return 1
  [ -e "$1" ] && return 0
  git ls-files --error-unmatch -- "$1" >/dev/null 2>&1 && return 0
  [ -n "$(git --literal-pathspecs ls-tree -r --name-only HEAD -- "$1" 2>/dev/null)" ]
}

# True when token $1 names a commit path; COMMIT_RESOLVED then holds it in the
# form git reads at the root: an absolute path verbatim, a relative one joined
# to the former cwd's prefix when that exists, else as given from the root.
resolve_commit_path() {
  local tok="$1"
  COMMIT_RESOLVED=""
  [ -n "$tok" ] || return 1
  case "$tok" in
    /*|\\*|[A-Za-z]:[/\\]*)
      is_commit_path "$tok" || return 1
      COMMIT_RESOLVED="$tok"; return 0 ;;
  esac
  tok="${tok#./}"
  if [ -n "${COMMIT_CWD_PREFIX:-}" ] && is_commit_path "$COMMIT_CWD_PREFIX$tok"; then
    COMMIT_RESOLVED="$COMMIT_CWD_PREFIX$tok"
  elif is_commit_path "$tok"; then
    COMMIT_RESOLVED="$tok"
  fi
  [ -n "$COMMIT_RESOLVED" ]
}

resolve_commit_selector() {
  local raw tok
  local -a toks=()
  COMMIT_PATHS=()
  COMMIT_MISSING=""
  # The whole argument first: a file named "bugs/#12.md" is that path, never a
  # reference to issue 12.
  if resolve_commit_path "${1:-}"; then
    COMMIT_ISSUE_REFS=""
    COMMIT_MODE="paths"; COMMIT_PATHS=("$COMMIT_RESOLVED")
    return 0
  fi
  extract_issue_refs "${1:-}"
  raw="$COMMIT_SELECTOR_RAW"
  # Path check BEFORE the keyword: otherwise a file named "all" could never be
  # committed alone (the keyword would silently widen the commit).
  if resolve_commit_path "$raw"; then
    COMMIT_MODE="paths"; COMMIT_PATHS=("$COMMIT_RESOLVED")
    return 0
  fi
  case "$raw" in
    ""|[Aa][Ll][Ll]) COMMIT_MODE="all"; return 0 ;;
  esac
  # read -a, not an unquoted expansion: a token holding * or ? must not glob.
  IFS=$' \t\n,' read -r -d '' -a toks <<<"$raw" || true
  for tok in ${toks[@]+"${toks[@]}"}; do
    if resolve_commit_path "$tok"; then
      COMMIT_PATHS+=("$COMMIT_RESOLVED")
    elif [[ "$tok" == */* || "$tok" == *\\* ]]; then
      COMMIT_MISSING="${COMMIT_MISSING:+$COMMIT_MISSING }$tok"
    fi
  done
  # No existing path at all: named paths that are not there are an error, never
  # a commit of everything (a typo, a stale list or a wrong cwd would otherwise
  # sweep the whole tree in); pure prose falls back to 'all'.
  if [ "${#COMMIT_PATHS[@]}" -gt 0 ]; then
    COMMIT_MODE="paths"
    COMMIT_MISSING=""
  elif [ -n "$COMMIT_MISSING" ]; then
    COMMIT_MODE="missing"
  else
    COMMIT_MODE="all"
  fi
}

#!/bin/sh
#
# gh-read.sh - read-only GitHub reader for the talk skill and the researcher
# agent: one issue or pull request, a search over issues or pull requests, one
# file of a repository, one release.
#
# It exists so a caller reads GitHub through ONE pre-approved command with a
# fixed output shape: a hand-composed `gh` call differs per run in flags, and
# a `gh api` prefix rule would also allow writes. Every gh call here reads:
# `gh api` is called with no `-X`, `-f` or `-F`, so it sends GET only.
# Self-verifying: a block is printed only after gh exited 0 and its output
# parsed; nothing on stdout on any failure.
#
# Contract:
#   argv   : one subcommand and its arguments:
#              issue <ref>                  ref: <N>, #<N> or an issue url;
#                                           runs sibling issue-facts.sh and
#                                           relays its stdout, stderr and exit
#              pr <ref>                     ref: <N>, #<N> or
#                                           https://<host>/<owner>/<repo>/pull/<N>
#                                           (a `#...` fragment or `?...` query
#                                           dropped)
#              list issues|prs <query> [<owner>/<repo>]
#                                           GitHub search syntax, open and
#                                           closed, newest update first, at
#                                           most 30; <query> may be empty
#              file <owner>/<repo> <path> [<git ref>]
#              release <owner>/<repo> [<tag>]  no tag: the latest release
#   cwd    : resolves a bare number and a `list` without <owner>/<repo>: gh
#            maps them to the repository of the cwd.
#   gh     : pr   -> gh pr view <ref> --json <PR_FIELDS> --jq <filter>
#            list -> gh issue|pr list --state all --limit 30 --search <query>
#                    [-R <owner>/<repo>] --json number,state,updatedAt,title
#                    --jq <filter>
#            file -> gh api repos/<owner>/<repo>/contents/<path>[?ref=<ref>]
#                    -H 'Accept: application/vnd.github.raw'
#            release -> gh release view [<tag>] -R <owner>/<repo>
#                    --json tagName,name,publishedAt,url,body --jq <filter>
#   env    : none of its own; gh reads its usual auth and host config.
#   stdout : on success, CR stripped:
#            pr:      NUMBER= URL= TITLE= STATE= AUTHOR= LABELS= BASE= HEAD=
#                     COMMENTS= REVIEWS= lines, `--- body ---` and the body,
#                     then `--- comment <k> by <login> at <time> ---` per
#                     Conversation comment and `--- review <k> by <login> at
#                     <time>: <state> ---` per review with a body, oldest
#                     first. Inline review comments are not read.
#            list:    KIND=issues|prs, COUNT=<n>, then one
#                     `#<N> | <STATE> | <yyyy-mm-dd> | <title>` line per item.
#            file:    REPO=, PATH=, REF= (empty: default branch), `--- file ---`
#                     and the raw content (a directory comes back as gh's
#                     JSON listing).
#            release: TAG=, NAME=, PUBLISHED=, URL=, `--- body ---` and the
#                     release notes.
#   exit   : 0 with the block; 1 with one `ERROR` line on stderr when gh is
#            not on PATH or gh failed (no auth, not found, no network) or
#            printed an unparsable block; 2 on bad arguments, gh never called.
#
set -u

me=gh-read.sh
bad() { echo "ERROR $me: $1" >&2; exit 2; }
fail() { echo "ERROR $me: $1" >&2; exit 1; }

repo_ok() {
  case $1 in
    */*/*|/*|*/|'') return 1 ;;
    */*) return 0 ;;
    *) return 1 ;;
  esac
}

[ $# -ge 1 ] || bad "need a subcommand: issue, pr, list, file or release"
sub=$1
shift

if [ "$sub" = issue ]; then
  [ $# -eq 1 ] || bad "issue needs exactly one <issue number or url>"
  exec sh "$(dirname "$0")/issue-facts.sh" "$1"
fi

case $sub in
  pr)
    [ $# -eq 1 ] || bad "pr needs exactly one <pull request number or url>"
    ref=${1#\#}
    case $ref in
      ''|*[!0-9]*)
        case $ref in https://*/pull/*) ;; *) bad "not a pull request number or url: $1" ;; esac
        ref=${ref%%[#?]*}
        n=${ref##*/pull/}
        mid=${ref#https://}
        mid=${mid%/pull/*}
        case $n in ''|*[!0-9]*) bad "not a pull request number or url: $1" ;; esac
        case $mid in /*|*/|*//*|*/*/*/*) bad "not a pull request number or url: $1" ;; */*/*) ;; *) bad "not a pull request number or url: $1" ;; esac
        ;;
    esac
    set -- pr view "$ref" --json number,url,title,state,author,labels,baseRefName,headRefName,body,comments,reviews --jq '"NUMBER=\(.number)\nURL=\(.url)\nTITLE=\(.title)\nSTATE=\(.state)\nAUTHOR=\(.author.login)\nLABELS=\([.labels[].name] | join(", "))\nBASE=\(.baseRefName)\nHEAD=\(.headRefName)\nCOMMENTS=\(.comments | length)\nREVIEWS=\([.reviews[] | select(.body != "")] | length)\n--- body ---\n\(.body)\n" + ([.comments | to_entries[] | "--- comment \(.key + 1) by \(.value.author.login) at \(.value.createdAt) ---\n\(.value.body)\n"] | join("")) + ([.reviews | map(select(.body != "")) | to_entries[] | "--- review \(.key + 1) by \(.value.author.login) at \(.value.submittedAt): \(.value.state) ---\n\(.value.body)\n"] | join(""))'
    head=NUMBER=
    ;;
  list)
    [ $# -eq 2 ] || [ $# -eq 3 ] || bad "list needs issues|prs, a <query> and an optional <owner>/<repo>"
    case $1 in issues) noun=issue ;; prs) noun=pr ;; *) bad "list takes issues or prs, not: $1" ;; esac
    kind=$1
    query=$2
    lrepo=${3:-}
    [ -z "$lrepo" ] || repo_ok "$lrepo" || bad "not an <owner>/<repo>: $lrepo"
    set -- "$noun" list --state all --limit 30 --search "$query"
    [ -z "$lrepo" ] || set -- "$@" -R "$lrepo"
    set -- "$@" --json number,state,updatedAt,title --jq '.[] | "#\(.number) | \(.state) | \(.updatedAt[:10]) | \(.title)"'
    head=
    ;;
  file)
    [ $# -eq 2 ] || [ $# -eq 3 ] || bad "file needs <owner>/<repo>, a <path> and an optional <git ref>"
    repo_ok "$1" || bad "not an <owner>/<repo>: $1"
    fpath=${2#/}
    [ -n "$fpath" ] || bad "file needs a non-empty <path>"
    fref=${3:-}
    frepo=$1
    url="repos/$frepo/contents/$fpath"
    [ -z "$fref" ] || url="$url?ref=$fref"
    set -- api "$url" -H 'Accept: application/vnd.github.raw'
    head=
    ;;
  release)
    [ $# -eq 1 ] || [ $# -eq 2 ] || bad "release needs <owner>/<repo> and an optional <tag>"
    repo_ok "$1" || bad "not an <owner>/<repo>: $1"
    rrepo=$1
    if [ -n "${2:-}" ]; then set -- release view "$2"; else set -- release view; fi
    set -- "$@" -R "$rrepo" --json tagName,name,publishedAt,url,body --jq '"TAG=\(.tagName)\nNAME=\(.name)\nPUBLISHED=\(.publishedAt)\nURL=\(.url)\n--- body ---\n\(.body)\n"'
    head=TAG=
    ;;
  *)
    bad "unknown subcommand: $sub"
    ;;
esac

command -v gh >/dev/null 2>&1 || fail "gh not found on PATH"

errf=$(mktemp 2>/dev/null) || errf=""
if [ -n "$errf" ]; then
  trap 'rm -f "$errf"' EXIT
  out=$(gh "$@" 2>"$errf")
  st=$?
  err=$(tr '\n\r' '  ' < "$errf")
else
  out=$(gh "$@" 2>/dev/null)
  st=$?
  err="(stderr not captured)"
fi
[ $st -eq 0 ] || fail "gh $1 failed: $err"

out=$(printf '%s\n' "$out" | tr -d '\r')
if [ -n "$head" ]; then
  first=$(printf '%s\n' "$out" | sed -n '1p')
  case $first in "$head"?*) ;; *) fail "gh $1 printed no $head line" ;; esac
fi

case $sub in
  list)
    if [ -n "$out" ]; then count=$(printf '%s\n' "$out" | grep -c '^#[0-9]'); else count=0; fi
    printf 'KIND=%s\nCOUNT=%s\n' "$kind" "$count"
    [ -z "$out" ] || printf '%s\n' "$out"
    ;;
  file)
    printf 'REPO=%s\nPATH=%s\nREF=%s\n--- file ---\n%s\n' "$frepo" "$fpath" "$fref" "$out"
    ;;
  *)
    printf '%s\n' "$out"
    ;;
esac
exit 0

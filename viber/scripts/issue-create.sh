#!/bin/sh
# viber - scripts/issue-create.sh
#
# Creates a GitHub issue and, when a type was requested, applies it through
# the REST API in one deterministic step: `gh issue create` -> parse the
# printed URL -> REST PATCH the type (no `--type` flag exists on `gh issue
# create`). Ported from the retired supergh `create-issue` skill's
# `scripts/create.sh` (git history before commit 6e9b1004) so an intent
# interview or a triage diagnosis that did not start from an issue can save
# its conclusion as a new one, built from the project's own issue templates.
# Self-verifying: ISSUE_URL is printed only after gh returned a well-formed
# issue URL - the caller trusts the block without re-checking. Generalized
# past github.com so the PATCH resolves through `gh api --hostname <host>`
# against the issue's own host, GitHub Enterprise included.
#
# Contract:
#   argv : $1 = body file path, $2 = title, then in any order:
#            --type <T>       issue type to PATCH after creation (optional)
#            --parent <N>     positive issue number of the same repository to
#                             attach the created issue under as a sub-issue
#                             (optional)
#            --label <L>      repeatable, passed to gh verbatim
#            --assignee <A>   repeatable, passed to gh verbatim
#            --project <P>    repeatable; <owner>/<number> is resolved to the
#                             project's title (`gh project view <number>
#                             --owner <owner> --format json --jq .title`),
#                             any other value is passed to gh verbatim
#   cwd  : gh resolves the repository from the cwd.
#   env  : none of its own; gh reads its usual auth and host config.
#   file : $1, sent verbatim as the issue body, then removed once the issue
#          exists (exit 0); every other exit leaves it in place.
#   stdout, exit 0:
#            ISSUE_URL=https://<host>/<owner>/<repo>/issues/<N>
#            ISSUE_NUMBER=<N>
#            TYPE=applied|dropped|error|none
#            TYPE_ERROR=<one line>        (only with dropped or error)
#            PARENT=applied|error|none
#            PARENT_ERROR=<one line>      (only with error)
#          TYPE: none = no --type; applied = the PATCH on
#          repos/<owner>/<repo>/issues/<N> via `gh api --hostname <host>`
#          succeeded; dropped = that PATCH failed on a benign reason (types
#          not enabled / not found / issue types / validation failed / 403 /
#          404); error = any other PATCH failure. Either way the issue is
#          never removed.
#          PARENT: none = no --parent; applied = the issue id lookup
#          (`gh api --hostname <host> repos/<owner>/<repo>/issues/<N> --jq .id`)
#          and the POST of that id to repos/<owner>/<repo>/issues/<parent>/
#          sub_issues both succeeded; error = either failed. Either way the
#          issue is never removed and the exit stays 0.
#   exit 1: one ERROR line on stderr, nothing on stdout - gh missing, a
#           --project <owner>/<number> whose lookup failed or answered no
#           title (`project <owner>/<number> not found`, before any issue is
#           created), `gh issue create` failed or printed no parsable issue
#           URL.
#   exit 2: missing body file or title, body file not found, an unknown or
#           valueless flag, or a --parent that is not a positive integer - gh
#           is never invoked.
set -u

body=${1:-}; title=${2:-}
if [ -z "$body" ] || [ -z "$title" ]; then
  echo "ERROR issue-create.sh: need <body file> <title> [flags]" >&2
  exit 2
fi
if [ ! -f "$body" ]; then
  echo "ERROR issue-create.sh: body file not found: $body" >&2
  exit 2
fi
shift 2

# Split off --type; keep --label/--assignee/--project pairs verbatim for gh,
# in the order they arrived.
type=""
parent=""
i=$#
while [ $i -gt 0 ]; do
  a=$1; shift; i=$((i-1))
  case $a in
    --type)
      [ $i -gt 0 ] || { echo "ERROR issue-create.sh: --type needs a value" >&2; exit 2; }
      type=$1; shift; i=$((i-1)) ;;
    --parent)
      [ $i -gt 0 ] || { echo "ERROR issue-create.sh: --parent needs an issue number" >&2; exit 2; }
      case $1 in
        ''|*[!0-9]*|0|0[0-9]*) echo "ERROR issue-create.sh: --parent needs an issue number" >&2; exit 2 ;;
      esac
      parent=$1; shift; i=$((i-1)) ;;
    --label|--assignee|--project)
      [ $i -gt 0 ] || { echo "ERROR issue-create.sh: $a needs a value" >&2; exit 2; }
      set -- "$@" "$a" "$1"; shift; i=$((i-1)) ;;
    *)
      echo "ERROR issue-create.sh: unknown flag $a" >&2; exit 2 ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR issue-create.sh: gh not found on PATH" >&2
  exit 1
fi

# Resolve each `--project <owner>/<number>` to the project's title, which is
# what `gh issue create --project` takes; any other value passes unchanged.
n=$#
while [ $n -gt 0 ]; do
  flag=$1; val=$2; shift 2; n=$((n-2))
  if [ "$flag" = "--project" ]; then
    case $val in
      */*/*|/*|*/) ;;
      */*)
        pnum=${val#*/}
        case $pnum in
          ''|*[!0-9]*) ;;
          *)
            ptitle=$(gh project view "$pnum" --owner "${val%%/*}" --format json --jq .title 2>/dev/null | tr -d '\r' | tail -n 1)
            if [ -z "$ptitle" ]; then
              echo "ERROR issue-create.sh: project $val not found" >&2
              exit 1
            fi
            val=$ptitle ;;
        esac ;;
    esac
  fi
  set -- "$@" "$flag" "$val"
done

out=$(gh issue create --title "$title" --body-file "$body" "$@" 2>&1)
st=$?
url=$(printf '%s\n' "$out" | tr -d '\r' \
  | sed -n 's#^\(https://[^/][^/]*/[^/][^/]*/[^/][^/]*/issues/[0-9][0-9]*\)$#\1#p' | tail -n 1)
if [ $st -ne 0 ] || [ -z "$url" ]; then
  echo "ERROR issue-create.sh: gh issue create failed: $(printf '%s' "$out" | tr '\n\r' '  ')" >&2
  exit 1
fi
rm -f "$body"

number=${url##*/}
rest=${url#https://}
host=${rest%%/*}
ownerrepo=${rest#*/}
ownerrepo=${ownerrepo%/issues/*}
echo "ISSUE_URL=$url"
echo "ISSUE_NUMBER=$number"

if [ -z "$type" ]; then
  echo "TYPE=none"
elif perr=$(gh api --hostname "$host" -X PATCH "repos/$ownerrepo/issues/$number" -f type="$type" 2>&1 >/dev/null); then
  echo "TYPE=applied"
else
  line=$(printf '%s' "$perr" | tr '\n\r' '  ')
  low=$(printf '%s' "$line" | tr 'A-Z' 'a-z')
  case $low in
    *"not enabled"*|*"not found"*|*"issue types"*|*"validation failed"*|*403*|*404*)
      echo "TYPE=dropped" ;;
    *)
      echo "TYPE=error" ;;
  esac
  echo "TYPE_ERROR=$line"
fi

if [ -z "$parent" ]; then
  echo "PARENT=none"
  exit 0
fi
if pout=$(gh api --hostname "$host" "repos/$ownerrepo/issues/$number" --jq .id 2>&1); then
  subid=$(printf '%s\n' "$pout" | tr -d '\r' | tail -n 1)
  if pout=$(gh api --hostname "$host" -X POST "repos/$ownerrepo/issues/$parent/sub_issues" -F sub_issue_id="$subid" 2>&1); then
    echo "PARENT=applied"
    exit 0
  fi
fi
echo "PARENT=error"
echo "PARENT_ERROR=$(printf '%s' "$pout" | tr '\n\r' '  ')"
exit 0

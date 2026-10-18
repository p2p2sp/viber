#!/bin/sh
#
# pr-reply.sh - posts one prepared markdown file as a reply into the review
# thread of one pull request comment, at most once per comment, and reports the
# reply's URL.
#
# It exists so `viber:pr-feedback` publishes through ONE pre-approved command and
# so a second run never answers a thread twice: the posted body opens with the
# marker `<!-- viber:pr-feedback <comment-id> -->`, and a newest reply to that
# comment already opening with the same marker yields `STATUS=skip`. Self-verifying:
# REPLY_URL is printed only after gh exited 0 AND returned a well-formed
# `.../pull/<N>#discussion_r<id>` URL - the caller trusts it and never re-posts.
#
# Contract:
#   argv   : $1 = the pull request, as `<N>`, `#<N>` or
#            `https://<host>/<owner>/<repo>/pull/<N>` (a `#...` fragment or `?...`
#            query dropped); $2 = the comment id, digits only: the first comment
#            of the thread; $3 = path of the reply file, which must exist.
#            Exactly three arguments, else exit 2.
#   cwd    : any directory inside the host repository. It resolves a relative $3
#            and, for a bare `<N>`, the repository gh talks to (the literal
#            `{owner}/{repo}` placeholders of its endpoints). A URL names its
#            repository and host itself, and every gh call then carries
#            `--hostname <host>`.
#   env    : none of its own; gh reads its usual auth and host config.
#   file   : $3, appended verbatim to the marker; never modified or removed. The
#            body is written to <repo root>/.temp/viber/pr-feedback/<N>/posted/
#            <comment-id>.md and left there:
#              line 1  <!-- viber:pr-feedback <comment-id> -->
#              line 2  empty
#              then    the reply file verbatim
#   gh     : `gh api --paginate repos/<owner>/<repo>/pulls/<N>/comments` (the
#            replies to <comment-id> are read out of it), then
#            `gh api -X POST repos/<owner>/<repo>/pulls/<N>/comments/<comment-id>/replies
#            -F body=@<body file>`. No other endpoint is called.
#   stdout : exit 0, one block:
#              STATUS=posted
#              REPLY_URL=https://<host>/<owner>/<repo>/pull/<N>#discussion_r<id>
#            or
#              STATUS=skip
#              REASON=exists
#            exists = the newest reply to <comment-id> (the comments come oldest
#            first) has the marker as its first line; a reviewer reply after the
#            viber one is a follow-up and gets answered, the rule pr-threads.sh
#            lists threads by.
#   exit   : 0 with either block; 1 with one `ERROR pr-reply.sh: ...` line on
#            stderr and nothing on stdout when gh is not on PATH, the cwd is not
#            inside a git repository, gh failed reading the comments or posting,
#            or returned no well-formed reply URL - whether a reply landed is then
#            unknown, so the caller reports and never retries; 2 on bad arguments
#            or a missing reply file.
#
set -u

usage() {
  echo "ERROR pr-reply.sh: usage: pr-reply.sh <pull request number or url> <comment id> <reply file>" >&2
  exit 2
}
fail() {
  echo "ERROR pr-reply.sh: $1" >&2
  exit 1
}

[ $# -eq 3 ] || usage
ref=${1#\#}
host=""
slug="{owner}/{repo}"
case $ref in
  ''|*[!0-9]*)
    case $ref in https://*/pull/*) ;; *) usage ;; esac
    ref=${ref%%[#?]*}
    n=${ref##*/pull/}
    mid=${ref#https://}
    mid=${mid%/pull/*}
    case $n in ''|*[!0-9]*) usage ;; esac
    case $mid in /*|*/|*//*|*/*/*/*) usage ;; */*/*) ;; *) usage ;; esac
    host=${mid%%/*}
    slug=${mid#*/}
    ;;
  *) n=$ref ;;
esac
id=$2
case $id in ''|*[!0-9]*) usage ;; esac
file=$3
if [ ! -f "$file" ]; then
  echo "ERROR pr-reply.sh: reply file not found: $file" >&2
  exit 2
fi

command -v gh >/dev/null 2>&1 || fail "gh not found on PATH"
root=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$root" ] || fail "not inside a git repository"

# gh api, on the URL's host when the pull request came as a URL.
ghapi() {
  if [ -n "$host" ]; then gh api --hostname "$host" "$@"; else gh api "$@"; fi
}

marker="<!-- viber:pr-feedback $id -->"
comments=$(ghapi --paginate --jq '.[] | "\(.in_reply_to_id) \(.body | split("\n") | .[0])"' \
  "repos/$slug/pulls/$n/comments" 2>&1) \
  || fail "gh api comments failed: $(printf '%s' "$comments" | tr '\n\r' '  ')"
newest=$(printf '%s\n' "$comments" | tr -d '\r' | grep -- "^$id " | tail -n 1)
if [ "$newest" = "$id $marker" ]; then
  printf 'STATUS=skip\nREASON=exists\n'
  exit 0
fi

dir="$root/.temp/viber/pr-feedback/$n/posted"
mkdir -p "$dir" 2>/dev/null || fail "cannot create $dir"
body="$dir/$id.md"
{
  printf '%s\n\n' "$marker"
  cat "$file"
} > "$body" || fail "cannot write $body"

out=$(ghapi -X POST --jq .html_url "repos/$slug/pulls/$n/comments/$id/replies" -F "body=@$body" 2>&1)
st=$?
url=$(printf '%s\n' "$out" | tr -d '\r' \
  | sed -n "s#^\(https://[^/]*/[^/]*/[^/]*/pull/$n\#discussion_r[0-9][0-9]*\)\$#\1#p" | tail -n 1)
if [ $st -ne 0 ] || [ -z "$url" ]; then
  fail "gh api reply failed: $(printf '%s' "$out" | tr '\n\r' '  ')"
fi

printf 'STATUS=posted\nREPLY_URL=%s\n' "$url"
exit 0

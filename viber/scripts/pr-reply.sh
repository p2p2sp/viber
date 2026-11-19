#!/bin/sh
#
# pr-reply.sh - posts one prepared markdown file as the reply to one remark of a
# pull request, at most once per remark, and reports the reply's URL. A remark is
# a review thread (a reply inside the thread) or a Conversation comment or a
# review body (a new pull request comment quoting it).
#
# It exists so `viber:pr-feedback-reply` publishes through ONE pre-approved command
# and so a second run never answers a remark twice: the posted body opens with the
# marker `<!-- viber:pr-feedback <key> -->`. For a thread, a newest reply to its
# first comment already opening with the marker yields `STATUS=skip`; for a
# Conversation comment or a review body, a pull request comment whose first line is
# the marker does. Self-verifying: REPLY_URL is printed only after gh exited 0 AND
# returned a well-formed `.../pull/<N>#discussion_r<id>` (thread) or
# `.../pull/<N>#issuecomment-<id>` (other remark) URL - the caller trusts it and
# never re-posts.
#
# Contract:
#   argv   : $1 = the pull request, as `<N>`, `#<N>` or
#            `https://<host>/<owner>/<repo>/pull/<N>` (a `#...` fragment or `?...`
#            query dropped); $2 = the remark key, `<id>` (digits: the first comment
#            of a review thread), `comment-<id>` (a Conversation comment) or
#            `review-<id>` (a review body), `<id>` digits only; $3 = path of the
#            reply file, which must exist.
#            Exactly three arguments (or the two of --list and --all below), else
#            exit 2.
#   cwd    : any directory inside the host repository. It resolves a relative $3
#            and, for a bare `<N>`, the repository gh talks to (the literal
#            `{owner}/{repo}` placeholders of its endpoints). A URL names its
#            repository and host itself, and every gh call then carries
#            `--hostname <host>`.
#   env    : none of its own; gh reads its usual auth and host config.
#   file   : $3, appended verbatim to the head; never modified or removed. The
#            body is written to <repo root>/.temp/viber/pr-feedback/<N>/posted/
#            <key>.md and left there. A thread:
#              line 1  <!-- viber:pr-feedback <id> -->
#              line 2  empty
#              then    the reply file verbatim
#            a Conversation comment or a review body:
#              line 1  <!-- viber:pr-feedback <key> -->
#              line 2  empty
#              line 3  > <first non-blank line of the original>
#              line 4  empty
#              line 5  <html_url of the original>
#              line 6  empty
#              then    the reply file verbatim
#   gh     : a thread: `gh api --paginate repos/<owner>/<repo>/pulls/<N>/comments`
#            (the replies to <id> are read out of it), then
#            `gh api -X POST repos/<owner>/<repo>/pulls/<N>/comments/<id>/replies
#            -F body=@<body file>`.
#            Another remark: `gh api --paginate repos/<owner>/<repo>/issues/<N>/comments`
#            (the first body line of each), then the original
#            (`repos/<owner>/<repo>/issues/comments/<id>` or
#            `repos/<owner>/<repo>/pulls/<N>/reviews/<id>`), then
#            `gh api -X POST repos/<owner>/<repo>/issues/<N>/comments -F body=@<body file>`.
#            No other endpoint is called.
#   stdout : exit 0, one block:
#              STATUS=posted
#              REPLY_URL=https://<host>/<owner>/<repo>/pull/<N>#discussion_r<id>
#            (a thread) or `...#issuecomment-<id>` (another remark), or
#              STATUS=skip
#              REASON=exists
#              SAY=The item already holds a viber reply.
#            the caller states the SAY sentence and never rewords it.
#            exists = for a thread, the newest reply to <id> (the comments come
#            oldest first) has the marker as its first line; a reviewer reply after
#            the viber one is a follow-up and gets answered, the rule pr-threads.sh
#            lists threads by. For another remark, a pull request comment has the
#            marker as its first line.
#   exit   : 0 with either block; 1 with one `ERROR pr-reply.sh: ...` line on
#            stderr and nothing on stdout when gh is not on PATH, the cwd is not
#            inside a git repository, gh failed reading the comments or the
#            original, or posting, or returned no well-formed reply URL - whether a
#            reply landed is then unknown, so the caller reports and never retries;
#            2 on bad arguments or a missing reply file.
#
#   --list : `pr-reply.sh --list <pull request>` (exactly two arguments, the pull
#            request spelled as above) reads <cwd>/.temp/viber/pr-feedback/<N>/
#            review.md, the file `viber:pr-feedback` writes, and calls no gh. A
#            section is `## <k> - <problem|question> - <where>` with a
#            `- Comment: <key>` and a `- Reply file: <path>` line; a heading
#            without a `Comment:` is no item. stdout, exit 0:
#              STATUS=ready|skip
#              READY=<k> - <where> - <key>     each item whose reply file exists
#              MISSING=<k> - <where> - <key>   each item whose reply file is absent
#              RUN="<plugin root>/scripts/pr-reply.sh" --all "<pull request>"
#              REASON=no-review|none-ready     STATUS=skip only
#              SAY=<sentence>                  STATUS=skip only, stated as is
#            READY and MISSING lines keep section order; RUN is printed with
#            STATUS=ready only. <plugin root> is the invoked path cut before
#            `/scripts/`, never resolved. Exit 2 with the usage on a malformed
#            pull request; exit 1 with one ERROR line outside a git repository.
#
#   --all  : `pr-reply.sh --all <pull request>` (exactly two arguments) reads the
#            same review.md and posts the reply of each ready item in section
#            order exactly as the three-argument form does, once per key: an item
#            whose post failed is reported and never posted again, and the next
#            one is still posted. stdout, exit 0, one line per ready reply, then
#            the count:
#              POSTED=<key> <reply url>
#              SKIPPED=<key> <the SAY sentence of exists>
#              FAILED=<key> <the error text after "ERROR pr-reply.sh: ">
#              MISSING_COUNT=<n>               the items whose reply file is absent
#            Exit 1 with one ERROR line when gh is not on PATH or the cwd is not
#            inside a git repository, before any post; exit 2 with the usage on a
#            malformed pull request and with one ERROR line when no review.md
#            exists. A FAILED item may or may not have landed: the caller reports
#            it and never retries.
#
set -u

usage() {
  echo "ERROR pr-reply.sh: usage: pr-reply.sh <pull request number or url> <remark key> <reply file> | --list <pull request> | --all <pull request>" >&2
  exit 2
}
fail() {
  echo "ERROR pr-reply.sh: $1" >&2
  exit 1
}

list=""
all=""
if [ $# -eq 2 ] && [ "$1" = --list ]; then
  list=yes
  pr=$2
elif [ $# -eq 2 ] && [ "$1" = --all ]; then
  all=yes
  pr=$2
else
  [ $# -eq 3 ] || usage
  pr=$1
fi
ref=${pr#\#}
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

# gh api, on the URL's host when the pull request came as a URL.
ghapi() {
  if [ -n "$host" ]; then gh api --hostname "$host" "$@"; else gh api "$@"; fi
}

say_exists="The item already holds a viber reply."

# Posts one reply as the three-argument form does: $1 the remark key, $2 the reply
# file. Prints the STATUS block and returns 0, or prints one ERROR line on stderr
# and exits 1 or 2; a caller needing to go on runs it in a command substitution.
reply_one() {
  key=$1
  case $key in
    ''|*[!0-9]*)
      case $key in
        comment-*|review-*) ;;
        *) usage ;;
      esac
      kind=${key%%-*}
      id=${key#*-}
      case $id in ''|*[!0-9]*) usage ;; esac
      ;;
    *) kind=thread; id=$key ;;
  esac
  file=$2
  if [ ! -f "$file" ]; then
    echo "ERROR pr-reply.sh: reply file not found: $file" >&2
    exit 2
  fi

  command -v gh >/dev/null 2>&1 || fail "gh not found on PATH"
  root=$(git rev-parse --show-toplevel 2>/dev/null)
  [ -n "$root" ] || fail "not inside a git repository"

  marker="<!-- viber:pr-feedback $key -->"
  quote=""
  orig_url=""
  if [ "$kind" = thread ]; then
    comments=$(ghapi --paginate --jq '.[] | "\(.in_reply_to_id) \(.body | split("\n") | .[0])"' \
      "repos/$slug/pulls/$n/comments" 2>&1) \
      || fail "gh api comments failed: $(printf '%s' "$comments" | tr '\n\r' '  ')"
    newest=$(printf '%s\n' "$comments" | tr -d '\r' | grep -- "^$id " | tail -n 1)
    if [ "$newest" = "$id $marker" ]; then
      printf 'STATUS=skip\nREASON=exists\nSAY=%s\n' "$say_exists"
      return 0
    fi
    post_to="repos/$slug/pulls/$n/comments/$id/replies"
    anchor="discussion_r"
  else
    comments=$(ghapi --paginate --jq '.[] | .body | split("\n") | .[0]' \
      "repos/$slug/issues/$n/comments" 2>&1) \
      || fail "gh api comments failed: $(printf '%s' "$comments" | tr '\n\r' '  ')"
    if printf '%s\n' "$comments" | tr -d '\r' | grep -Fxq -- "$marker"; then
      printf 'STATUS=skip\nREASON=exists\nSAY=%s\n' "$say_exists"
      return 0
    fi
    if [ "$kind" = comment ]; then
      original="repos/$slug/issues/comments/$id"
    else
      original="repos/$slug/pulls/$n/reviews/$id"
    fi
    orig=$(ghapi --jq '.html_url, (.body // "" | split("\n") | map(select(test("[^ \t\r]"))) | .[0] // "")' \
      "$original" 2>&1) \
      || fail "gh api original failed: $(printf '%s' "$orig" | tr '\n\r' '  ')"
    orig=$(printf '%s\n' "$orig" | tr -d '\r')
    orig_url=$(printf '%s\n' "$orig" | sed -n 1p)
    quote=$(printf '%s\n' "$orig" | sed -n 2p)
    case $orig_url in
      https://*) ;;
      *) fail "gh api original returned no link: $(printf '%s' "$orig" | tr '\n' ' ')" ;;
    esac
    post_to="repos/$slug/issues/$n/comments"
    anchor="issuecomment-"
  fi

  dir="$root/.temp/viber/pr-feedback/$n/posted"
  mkdir -p "$dir" 2>/dev/null || fail "cannot create $dir"
  body="$dir/$key.md"
  {
    printf '%s\n\n' "$marker"
    if [ "$kind" != thread ]; then
      printf '> %s\n\n%s\n\n' "$quote" "$orig_url"
    fi
    cat "$file"
  } > "$body" || fail "cannot write $body"

  out=$(ghapi -X POST --jq .html_url "$post_to" -F "body=@$body" 2>&1)
  st=$?
  url=$(printf '%s\n' "$out" | tr -d '\r' \
    | sed -n "s#^\(https://[^/]*/[^/]*/[^/]*/pull/$n\#$anchor[0-9][0-9]*\)\$#\1#p" | tail -n 1)
  if [ $st -ne 0 ] || [ -z "$url" ]; then
    fail "gh api reply failed: $(printf '%s' "$out" | tr '\n\r' '  ')"
  fi

  printf 'STATUS=posted\nREPLY_URL=%s\n' "$url"
  return 0
}

if [ -z "$list" ] && [ -z "$all" ]; then
  reply_one "$2" "$3"
  exit $?
fi

git rev-parse --show-toplevel >/dev/null 2>&1 || fail "not inside a git repository"
review=".temp/viber/pr-feedback/$n/review.md"
if [ -n "$all" ]; then
  command -v gh >/dev/null 2>&1 || fail "gh not found on PATH"
  if [ ! -f "$review" ]; then
    echo "ERROR pr-reply.sh: no review file for pull request $n: $review" >&2
    exit 2
  fi
fi
if [ -n "$list" ]; then
  self=$(printf '%s' "$0" | tr '\\' '/')
  if [ ! -f "$review" ]; then
    printf 'STATUS=skip\nREASON=no-review\nSAY=%s\n' "No /viber:pr-feedback run wrote a review file for this pull request."
    exit 0
  fi
fi
tab=$(printf '\t')
# One line per item, `<k> - <where> - <key>`, a tab, the reply file path; a
# sentinel heading closes the last section, since the awk block defines no function.
items=$(tr -d '\r' < "$review" | { cat; printf '## end\n'; } | awk '
  /^## / {
    if (key != "") print k " - " where " - " key "\t" rfile
    head = substr($0, 4)
    i = index(head, " - ")
    k = head
    if (i > 0) k = substr(head, 1, i - 1)
    where = head
    rest = head
    while (1) {
      j = index(rest, " - ")
      if (j == 0) break
      rest = substr(rest, j + 3)
      where = rest
    }
    key = ""
    rfile = ""
    next
  }
  /^- Comment:/ { v = $0; sub(/^- Comment:[ \t]*/, "", v); sub(/[ \t]+$/, "", v); key = v; next }
  /^- Reply file:/ { v = $0; sub(/^- Reply file:[ \t]*/, "", v); sub(/[ \t]+$/, "", v); rfile = v; next }
')
classified=$(printf '%s\n' "$items" | while IFS=$tab read -r line file; do
  [ -n "$line" ] || continue
  if [ -n "$file" ] && [ -f "$file" ]; then
    printf 'READY=%s\n' "$line"
  else
    printf 'MISSING=%s\n' "$line"
  fi
done)
ready=$(printf '%s\n' "$classified" | grep '^READY=')
missing=$(printf '%s\n' "$classified" | grep '^MISSING=')

if [ -n "$list" ]; then
  if [ -n "$ready" ]; then
    printf 'STATUS=ready\n%s\n' "$ready"
    [ -z "$missing" ] || printf '%s\n' "$missing"
    printf 'RUN="%s/scripts/pr-reply.sh" --all "%s"\n' "${self%/scripts/pr-reply.sh}" "$pr"
  else
    printf 'STATUS=skip\n'
    [ -z "$missing" ] || printf '%s\n' "$missing"
    printf 'REASON=none-ready\nSAY=%s\n' "No reply file is written yet."
  fi
  exit 0
fi

# --all: each ready item once, in section order; a failed one never stops the next.
seen="
"
printf '%s\n' "$items" | while IFS=$tab read -r line file; do
  [ -n "$line" ] || continue
  [ -n "$file" ] && [ -f "$file" ] || continue
  key=${line##* - }
  case $seen in *"
$key
"*) continue ;; esac
  seen="$seen$key
"
  out=$(reply_one "$key" "$file" 2>&1 </dev/null)
  st=$?
  if [ $st -ne 0 ]; then
    printf 'FAILED=%s %s\n' "$key" "$(printf '%s\n' "$out" | tr -d '\r' | sed -n '1s/^ERROR pr-reply\.sh: //p')"
  else
    case $out in
      *STATUS=posted*)
        printf 'POSTED=%s %s\n' "$key" "$(printf '%s\n' "$out" | tr -d '\r' | sed -n 's/^REPLY_URL=//p')"
        ;;
      *)
        printf 'SKIPPED=%s %s\n' "$key" "$say_exists"
        ;;
    esac
  fi
done
count=0
if [ -n "$missing" ]; then
  count=$(printf '%s\n' "$missing" | grep -c '^MISSING=')
fi
printf 'MISSING_COUNT=%s\n' "$count"
exit 0

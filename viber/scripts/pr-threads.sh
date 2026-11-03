#!/bin/sh
#
# pr-threads.sh - resolves the branch facts of one pull request for the skill
# that turns its review threads into plan tasks: the pull request's number,
# url and head branch, the branch checked out here and whether the local HEAD
# is the commit the pull request head points at, then, when the checked-out
# branch is the head branch, its unresolved review threads and the remarks
# left outside them (the Conversation comments and the submitted review
# bodies), as one fixed text block plus a threads file holding every listed
# thread's comments and every listed remark.
#
# It exists so the skill reads a pull request through ONE pre-approved command
# with a fixed output shape: a hand-composed `gh api graphql` differs per run
# in query and flags, and each variant is a new, unapproved command. The
# filter runs through gh's own `--jq`, so no external `jq` is needed.
# Self-verifying: the block is printed only after gh exited 0 AND returned the
# url, the head branch and the head commit - the caller trusts it and never
# re-fetches. Nothing is checked out or pushed here; the only write is the
# threads file.
#
# Contract:
#   argv   : exactly one: <N> | #<N> | https://<host>/<owner>/<repo>/pull/<N>
#            (a URL's #... fragment or ?... query is dropped). Anything else ->
#            exit 2 with one ERROR line on stderr and nothing on stdout, gh not
#            called.
#   cwd    : any directory inside the host repository - the script resolves the
#            repository root itself. Outside one, the answer is `no-repo`. A
#            bare number is resolved against the repository of the cwd.
#   env    : none of its own; gh reads its usual auth and host config.
#   gh     : `gh api graphql` for pullRequest(number) { url headRefName
#            headRefOid author { login } comments(first: 100) { pageInfo {
#            hasNextPage } nodes { databaseId author { login __typename }
#            createdAt body } } reviews(first: 100) { pageInfo { hasNextPage }
#            nodes { databaseId author { login __typename } createdAt body
#            state } } reviewThreads(first: 100) { pageInfo { hasNextPage }
#            nodes { isResolved isOutdated path line originalLine
#            comments(first: 100) { nodes { databaseId author { login }
#            createdAt body } } } } }. A URL gives owner, name and
#            `--hostname <host>`; a bare number the {owner}/{repo}
#            placeholders of the cwd repository.
#   git    : read-only: the root, the current branch, the HEAD commit.
#   stdout : exit 0, lines in this order:
#              STATUS=ready|stop
#              REASON=no-gh|no-repo|wrong-branch   (stop only)
#              PR=<N>
#              PR_URL=<url>
#              HEAD_BRANCH=<headRefName>
#              BRANCH=<current branch, empty when HEAD is detached>
#              PUSHED=yes|no                       (local HEAD equals headRefOid)
#              THREADS_FILE=<repo-relative path>   (ready only)
#              SKIPPED=<count>                     (ready only)
#              TRUNCATED=yes|no                    (ready only)
#              THREAD=<k> | <comment-id> | <path>:<line> | <author> | outdated|current
#                                                  (0+, ready only, k from 1)
#              REMARK=<k> | <key> | <author> | conversation|review
#                                                  (0+, ready only, after the
#                                                  last THREAD=, k continues the
#                                                  thread numbering)
#            A no-gh or no-repo stop prints only STATUS= and REASON=. A
#            wrong-branch stop (BRANCH differs from HEAD_BRANCH) prints the
#            block up to PUSHED=. A THREAD= line lists an unresolved thread:
#            <comment-id> is its first comment databaseId, <author> that
#            comment author, <line> its line, else originalLine, else ?, and
#            `outdated` its isOutdated. A thread whose latest comment opens with
#            the line `<!-- viber:pr-feedback <comment-id> -->` (a viber reply)
#            is left out and counted in SKIPPED=. A thread opened by the pull
#            request author or a bot is listed all the same.
#            A REMARK= line lists one Conversation comment (Conversation comments
#            first) or one review with a non-empty body, each oldest first; <key>
#            is `comment-<databaseId>` or `review-<databaseId>` and <author> the
#            login, `ghost` when the account is gone. A remark with an empty or
#            whitespace-only body, or a Conversation comment whose first line
#            opens with `<!-- viber:pr-feedback `, is left out and not counted.
#            A remark by the pull request author (logins compared only when both
#            are non-null), by an author whose __typename is Bot, or answered (a
#            Conversation comment of the pull request has the first line
#            `<!-- viber:pr-feedback <key> -->`) is left out and counted in
#            SKIPPED=. TRUNCATED=yes when the query reports a further page of
#            threads, Conversation comments or reviews (only the first 100 of
#            each are read).
#   file   : <repo root>/.temp/viber/pr-feedback/<N>/threads.md, replaced on
#            every ready run (empty when nothing is listed):
#              ## <k> - <path>:<line> (<outdated|current>)
#              comment-id: <comment-id>
#              then per comment, oldest first: ### <author> - <createdAt>, a
#              blank line, the body (carriage returns dropped)
#            then, one section per listed remark:
#              ## <k> - conversation          or  ## <k> - review (<state>)
#              comment-id: <key>
#              then ### <author> - <createdAt>, a blank line, the body
#            a blank line separates each heading from what precedes it.
#   exit   : 0 with the block (a stop included); 1 with one `ERROR
#            pr-threads.sh: ...` line on stderr and nothing on stdout when gh
#            failed, its output did not parse or the threads file could not be
#            written; 2 on bad arguments.
#
set -u

usage() {
  echo "ERROR pr-threads.sh: need exactly one <pull request number or url>: $1" >&2
  exit 2
}

[ $# -eq 1 ] || usage "got $#"
ref=${1#\#}
host=""
owner_name=""
case $ref in
  ''|*[!0-9]*)
    case $ref in https://*/pull/*) ;; *) usage "$1" ;; esac
    ref=${ref%%[#?]*}
    n=${ref##*/pull/}
    mid=${ref#https://}
    mid=${mid%/pull/*}
    case $n in ''|*[!0-9]*) usage "$1" ;; esac
    case $mid in /*|*/|*//*|*/*/*/*) usage "$1" ;; */*/*) ;; *) usage "$1" ;; esac
    host=${mid%%/*}
    owner_name=${mid#*/}
    ;;
  *) n=$ref ;;
esac

stop() {
  printf 'STATUS=stop\nREASON=%s\n' "$1"
  exit 0
}

command -v gh >/dev/null 2>&1 || stop no-gh
root=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$root" ] && cd "$root" 2>/dev/null || stop no-repo

query='query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { url headRefName headRefOid author { login } comments(first: 100) { pageInfo { hasNextPage } nodes { databaseId author { login __typename } createdAt body } } reviews(first: 100) { pageInfo { hasNextPage } nodes { databaseId author { login __typename } createdAt body state } } reviewThreads(first: 100) { pageInfo { hasNextPage } nodes { isResolved isOutdated path line originalLine comments(first: 100) { nodes { databaseId author { login } createdAt body } } } } } } }'
filter='.data.repository.pullRequest | "URL=\(.url)\nHEAD=\(.headRefName)\nOID=\(.headRefOid)\nMORE=\(.reviewThreads.pageInfo.hasNextPage)\nCMORE=\(.comments.pageInfo.hasNextPage)\nRMORE=\(.reviews.pageInfo.hasNextPage)\nAUTH=\(.author.login // "")", (.comments.nodes[] | "R\tconversation\t\(.databaseId)\t\(.author.login // "")\t\(.author.__typename == "Bot")\t\(.createdAt)\t", (.body // "" | split("\n")[] | "Q\t\(.)")), (.reviews.nodes[] | "R\treview\t\(.databaseId)\t\(.author.login // "")\t\(.author.__typename == "Bot")\t\(.createdAt)\t\(.state)", (.body // "" | split("\n")[] | "Q\t\(.)")), (.reviewThreads.nodes[] | "T\t\(.isResolved)\t\(.isOutdated)\t\(.line // "")\t\(.originalLine // "")\t\(.path)", (.comments.nodes[] | "C\t\(.databaseId)\t\(.author.login // "ghost")\t\(.createdAt)", (.body // "" | split("\n")[] | "B\t\(.)")))'

set -- api graphql
if [ -n "$host" ]; then
  set -- "$@" --hostname "$host" -f "owner=${owner_name%%/*}" -f "name=${owner_name#*/}"
else
  set -- "$@" -F 'owner={owner}' -F 'name={repo}'
fi
set -- "$@" -F "number=$n" -f "query=$query" --jq "$filter"

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

out=$(printf '%s\n' "$out" | tr -d '\r')
pr_url=$(printf '%s\n' "$out" | sed -n 's/^URL=//p' | sed -n 1p)
head_branch=$(printf '%s\n' "$out" | sed -n 's/^HEAD=//p' | sed -n 1p)
head_oid=$(printf '%s\n' "$out" | sed -n 's/^OID=//p' | sed -n 1p)
if [ $st -ne 0 ] || [ -z "$pr_url" ] || [ -z "$head_branch" ] || [ -z "$head_oid" ]; then
  echo "ERROR pr-threads.sh: gh api graphql failed: $err" >&2
  exit 1
fi

branch=$(git symbolic-ref --short -q HEAD 2>/dev/null)
local_oid=$(git rev-parse -q --verify HEAD 2>/dev/null)
pushed=no
if [ -n "$local_oid" ] && [ "$local_oid" = "$head_oid" ]; then pushed=yes; fi

if [ "$branch" = "$head_branch" ]; then status=ready; else status=stop; fi

if [ "$status" = ready ]; then
  tdir=".temp/viber/pr-feedback/$n"
  tfile="$tdir/threads.md"
  if ! mkdir -p "$tdir" 2>/dev/null || ! printf '' 2>/dev/null >"$tfile"; then
    echo "ERROR pr-threads.sh: cannot write $root/$tfile" >&2
    exit 1
  fi
  more=$(printf '%s\n' "$out" | sed -n 's/^MORE=//p' | sed -n 1p)
  cmore=$(printf '%s\n' "$out" | sed -n 's/^CMORE=//p' | sed -n 1p)
  rmore=$(printf '%s\n' "$out" | sed -n 's/^RMORE=//p' | sed -n 1p)
  pr_author=$(printf '%s\n' "$out" | sed -n 's/^AUTH=//p' | sed -n 1p)
  truncated=no
  if [ "$more" = true ] || [ "$cmore" = true ] || [ "$rmore" = true ]; then truncated=yes; fi
  # No apostrophe anywhere in here: this program sits INSIDE single quotes.
  # Input: R/Q lines (remarks), then T/C/B lines (threads) of the gh filter.
  # Writes the threads file, prints SKIPPED= then one THREAD= line per listed
  # thread, then one REMARK= line per listed remark.
  # A final bare T line closes the last thread.
  list=$(printf '%s\nT\t\n' "$out" | THREADS_OUT="$tfile" PR_AUTHOR="$pr_author" awk '
    BEGIN { f = ENVIRON["THREADS_OUT"]; pra = ENVIRON["PR_AUTHOR"] }
    substr($0, 1, 2) == "R\t" {
      split($0, p, "\t")
      rn++
      rk[rn] = p[2]; rid[rn] = p[3]; rau[rn] = p[4]; rbot[rn] = p[5]; rcr[rn] = p[6]; rst[rn] = p[7]
      rbody[rn] = ""; rfl[rn] = ""; rbc[rn] = 0; rnb[rn] = 0
      next
    }
    substr($0, 1, 2) == "Q\t" && rn > 0 {
      text = substr($0, 3)
      if (rbc[rn] == 0) { rbody[rn] = text; rfl[rn] = text } else rbody[rn] = rbody[rn] "\n" text
      rbc[rn]++
      if (text ~ /[^[:space:]]/) rnb[rn] = 1
      next
    }
    substr($0, 1, 2) == "T\t" {
      keep = have && res != "true" && nc > 0
      if (keep && fl[nc] == "<!-- viber:pr-feedback " cid[1] " -->") { skipped++; keep = 0 }
      if (keep) {
        k++
        loc = "?"
        if (oln != "") loc = oln
        if (ln != "") loc = ln
        state = "current"
        if (outd == "true") state = "outdated"
        if (k > 1) print "" > f
        print "## " k " - " path ":" loc " (" state ")" > f
        print "comment-id: " cid[1] > f
        for (i = 1; i <= nc; i++) {
          print "" > f
          print "### " au[i] " - " cr[i] > f
          print "" > f
          print body[i] > f
        }
        tl[k] = "THREAD=" k " | " cid[1] " | " path ":" loc " | " au[1] " | " state
      }
      m = split($0, p, "\t")
      res = p[2]; outd = p[3]; ln = p[4]; oln = p[5]; path = p[6]
      for (i = 7; i <= m; i++) path = path "\t" p[i]
      have = 1; nc = 0
      next
    }
    substr($0, 1, 2) == "C\t" && have {
      split($0, p, "\t")
      nc++
      cid[nc] = p[2]; au[nc] = p[3]; cr[nc] = p[4]
      body[nc] = ""; bc[nc] = 0; fl[nc] = ""
      next
    }
    substr($0, 1, 2) == "B\t" && have && nc > 0 {
      text = substr($0, 3)
      if (bc[nc] == 0) { body[nc] = text; fl[nc] = text } else body[nc] = body[nc] "\n" text
      bc[nc]++
    }
    END {
      for (i = 1; i <= rn; i++) if (rk[i] == "conversation") answered[rfl[i]] = 1
      for (i = 1; i <= rn; i++) {
        if (!rnb[i]) continue
        if (rk[i] == "conversation" && index(rfl[i], "<!-- viber:pr-feedback ") == 1) continue
        key = "review-" rid[i]
        if (rk[i] == "conversation") key = "comment-" rid[i]
        if (rau[i] != "" && pra != "" && rau[i] == pra) { skipped++; continue }
        if (rbot[i] == "true") { skipped++; continue }
        mark = "<!-- viber:pr-feedback " key " -->"
        if (mark in answered) { skipped++; continue }
        k++
        who = rau[i]
        if (who == "") who = "ghost"
        if (k > 1) print "" > f
        if (rk[i] == "conversation") print "## " k " - conversation" > f
        else print "## " k " - review (" rst[i] ")" > f
        print "comment-id: " key > f
        print "" > f
        print "### " who " - " rcr[i] > f
        print "" > f
        print rbody[i] > f
        tl[k] = "REMARK=" k " | " key " | " who " | " rk[i]
      }
      print "SKIPPED=" skipped + 0
      for (i = 1; i <= k; i++) print tl[i]
    }
  ')
  if [ -z "$list" ]; then
    echo "ERROR pr-threads.sh: could not read the review threads" >&2
    exit 1
  fi
fi

echo "STATUS=$status"
if [ "$status" = stop ]; then echo "REASON=wrong-branch"; fi
echo "PR=$n"
echo "PR_URL=$pr_url"
echo "HEAD_BRANCH=$head_branch"
echo "BRANCH=$branch"
echo "PUSHED=$pushed"
if [ "$status" = ready ]; then
  echo "THREADS_FILE=$tfile"
  printf '%s\n' "$list" | sed -n 1p
  echo "TRUNCATED=$truncated"
  printf '%s\n' "$list" | sed 1d
fi
exit 0

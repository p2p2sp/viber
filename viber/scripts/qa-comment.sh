#!/bin/sh
#
# qa-comment.sh - posts one build's qa.md as a comment on the run's issue, or on
# a pull request when the run has no issue, at most once per run.
#
# It exists so the build close and `pr-create` publish through ONE
# pre-approved command, and so a run reaching its target from both never
# posts twice: the body carries a marker naming the qa file, and a comment
# already holding a marker of the same run key - whether it named the run
# directory or its archive - skips the post. Self-verifying: COMMENT_URL is
# printed only after gh exited 0 AND printed a well-formed
# `.../issues/<N>#issuecomment-<id>` (issue target) or
# `.../pull/<N>#issuecomment-<id>` (pull request target) URL - the caller
# trusts it and never re-posts.
#
# Contract:
#   argv   : $1 = the qa file path; optionally `--pr <pull request URL>`
#            (`https://<host>/<owner>/<repo>/pull/<N>`, a `#...` fragment or
#            `?...` query dropped). Any other count, flag or URL shape -> exit 2.
#   cwd    : any directory inside the host repository - the script resolves the
#            repository root itself and a relative qa file path resolves from
#            that root, never from the cwd. Outside one, the answer is no-repo.
#   env    : none of its own; gh reads its usual auth and host config.
#   file   : the qa file, read verbatim, never modified. The spec.md beside it
#            (the open run and the archive both carry one), read for its
#            frontmatter "issue:" value in the issue reference grammar (<N>,
#            #<N>, or `https://<host>/<owner>/<repo>/issues/<N>`, a `#...`
#            fragment or `?...` query dropped); a missing file, frontmatter or
#            valid value means the run has no issue. The body is written to
#            <repo root>/.temp/viber/qa-comment/<run key>.md and left there,
#            gh's stderr of the comments read beside it in <run key>.err:
#              line 1  <!-- viber:qa <repo-relative path of the qa file> -->
#              line 2  QA document: `<that path>`
#              line 3  empty
#              then    the qa file verbatim
#   run key: the name of the qa file's parent directory.
#   target : the run's issue whenever it has one, --pr then ignored; else the
#            --pr pull request; else the open pull request whose head is the
#            current branch.
#   gh     : `gh pr list --head <branch> --state open` (no issue and no --pr
#            only; a cross-repository pull request is never the target), then `gh issue|pr view <target> --json comments` and
#            `gh issue|pr comment <target> --body-file`.
#   stdout : exit 0, one block:
#              STATUS=posted
#              COMMENT_URL=https://<host>/<owner>/<repo>/issues/<N>#issuecomment-<id>
#                          (or .../pull/<N>#issuecomment-<id> on a pull request)
#            or
#              STATUS=skip
#              REASON=no-gh | no-repo | no-pr | exists
#            Checks, in order: no-repo (not inside a repository), the qa file
#            (exit 2 when missing), no-gh (gh not on PATH), no-pr (no issue, no
#            --pr and a detached HEAD, or no open same-repository pull request
#            whose head is the current branch), exists (a comment of the target holds
#            "<!-- viber:qa " with a path ending in "/<run key>/qa.md").
#   exit   : 0 with either block; 1 with one ERROR line on stderr and nothing on
#            stdout when gh failed reading the comments or posting, or printed no
#            comment URL - whether a comment landed is then unknown, so the
#            caller reports and never retries; 2 on bad arguments or a missing
#            qa file.
#
set -u

usage() {
  echo "ERROR qa-comment.sh: usage: qa-comment.sh <qa file path> [--pr <pull request URL>]" >&2
  exit 2
}
fail() {
  echo "ERROR qa-comment.sh: $1" >&2
  exit 1
}
skip() {
  printf 'STATUS=skip\nREASON=%s\n' "$1"
  exit 0
}
# The issue of the frontmatter "issue:" of file $1 in the issue reference
# grammar - a bare number, or the URL with its fragment and query dropped - and
# nothing for a missing file, frontmatter or valid value.
issue_of() {
  [ -f "$1" ] || return 0
  v=$(tr -d '\r' < "$1" | awk '
NR == 1 { if ($0 !~ /^---[[:space:]]*$/) exit; next }
/^---[[:space:]]*$/ { exit }
/^issue:/ { sub(/^issue:[[:space:]]*/, ""); sub(/[[:space:]]+$/, ""); print; exit }
')
  v=${v#\#}
  case $v in
    '') return 0 ;;
    *[!0-9]*) ;;
    *) printf '%s\n' "$v"; return 0 ;;
  esac
  v=${v%%[#?]*}
  case $v in https://*/issues/*) ;; *) return 0 ;; esac
  n=${v##*/issues/}
  mid=${v#https://}
  mid=${mid%/issues/*}
  case $n in ''|*[!0-9]*) return 0 ;; esac
  case $mid in /*|*/|*//*|*/*/*/*) return 0 ;; */*/*) printf '%s\n' "$v" ;; esac
}

pr=""
case $# in
  1) ;;
  3)
    [ "$2" = --pr ] || usage
    pr=${3%%[#?]*}
    case $pr in https://*/pull/*) ;; *) usage ;; esac
    n=${pr##*/pull/}
    mid=${pr#https://}
    mid=${mid%/pull/*}
    case $n in ''|*[!0-9]*) usage ;; esac
    case $mid in /*|*/|*//*|*/*/*/*) usage ;; */*/*) ;; *) usage ;; esac
    ;;
  *) usage ;;
esac
file=$1
[ -n "$file" ] || usage

root=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$root" ] && cd "$root" 2>/dev/null || skip no-repo

if [ ! -f "$file" ]; then
  echo "ERROR qa-comment.sh: qa file not found: $file" >&2
  exit 2
fi
command -v gh >/dev/null 2>&1 || skip no-gh

dir=$(dirname -- "$file")
prefix=$(cd "$dir" 2>/dev/null && git rev-parse --show-prefix 2>/dev/null)
rel=$prefix$(basename -- "$file")
key=$(basename -- "$dir")

target=$(issue_of "$dir/spec.md")
if [ -n "$target" ]; then
  kind=issue
  seg=issues
else
  kind=pr
  seg=pull
  target=$pr
  if [ -z "$target" ]; then
    branch=$(git symbolic-ref --short -q HEAD 2>/dev/null)
    [ -n "$branch" ] || skip no-pr
    # `--head` matches a fork branch of the same name too: keep a row whose
    # isCrossRepository is false only.
    target=$(gh pr list --head "$branch" --state open --json url,isCrossRepository --jq '.[] | "\(.isCrossRepository) \(.url)"' 2>/dev/null | tr -d '\r' | awk '$1 == "false" { print $2; exit }')
    [ -n "$target" ] || skip no-pr
  fi
fi

tmp="$root/.temp/viber/qa-comment"
mkdir -p "$tmp" 2>/dev/null || fail "cannot create $tmp"
err="$tmp/$key.err"
comments=$(gh "$kind" view "$target" --json comments --jq '.comments[].body' 2>"$err") \
  || fail "gh $kind view failed: $(tr '\n\r' '  ' < "$err" 2>/dev/null)"
# A marker path, cut at its closing " -->", ending in /<key>/qa.md: the run was
# posted already, whether the marker named the run directory or the archive.
exists=$(printf '%s\n' "$comments" | tr -d '\r' | TAIL="/$key/qa.md" awk '
{
  i = index($0, "<!-- viber:qa ")
  if (i == 0) next
  p = substr($0, i + 14)
  j = index(p, " -->")
  if (j > 0) p = substr(p, 1, j - 1)
  t = ENVIRON["TAIL"]
  if (length(p) >= length(t) && substr(p, length(p) - length(t) + 1) == t) { print "yes"; exit }
}')
[ -z "$exists" ] || skip exists

body="$tmp/$key.md"
{
  printf '<!-- viber:qa %s -->\n' "$rel"
  printf 'QA document: `%s`\n\n' "$rel"
  cat "$file"
} > "$body" || fail "cannot write $body"

out=$(gh "$kind" comment "$target" --body-file "$body" 2>&1)
st=$?
url=$(printf '%s\n' "$out" | tr -d '\r' \
  | sed -n "s#^\(https://[^/]*/[^/]*/[^/]*/$seg/[0-9][0-9]*\#issuecomment-[0-9][0-9]*\)\$#\1#p" | tail -n 1)
if [ $st -ne 0 ] || [ -z "$url" ]; then
  fail "gh $kind comment failed: $(printf '%s' "$out" | tr '\n\r' '  ')"
fi

echo "STATUS=posted"
echo "COMMENT_URL=$url"
exit 0

#!/bin/sh
# viber - scripts/artifact-create.sh
#
# Attaches files and links to a GitHub issue as issue artifacts (`gh issue
# artifact create`, gh 2.103 and later, a GitHub private preview) in one
# deterministic step: resolve the issue URL, pick the gh call each argument's
# type needs, parse gh's one result line per call. It exists so the prototype
# and the attach skill share one place that knows the file types, the image and
# video wrapping document and the failure shapes, instead of each re-deriving
# them. Self-verifying: CREATED= is printed only for a `created` result line,
# so the caller reports the blocks without re-checking.
#
# Contract:
#   argv : $1 = the issue: <N>, #<N> or https://<host>/<owner>/<repo>/issues/<N>
#          (a #... fragment or ?... query dropped); a .../pull/<N> URL is a
#          pull request. $2... = one or more files or http(s) links; a file is
#          a path resolved from the cwd and must exist.
#   cwd  : gh resolves the repository from it, and a relative file path
#          resolves against it.
#   env  : none of its own; gh reads its usual auth and host config.
#   gh   : `gh issue view <issue> --json url --jq .url` gives the issue URL (a
#          URL holding /pull/ is a pull request). Then, per argument in order,
#          one `gh issue artifact create` on that URL, whose non-TTY output is
#          one result line <status> TAB <number> TAB <name> TAB <source> TAB
#          <reason> (status created or failed):
#            .md .markdown .txt, .html .htm, an http(s) link
#                -> create <issue URL> <file or link>
#            .png .jpg .jpeg .gif .mp4 .mov .webm
#                -> create <issue URL> --name <base name> --body <base name>
#                   --attach <file>
#            any other extension -> no gh call
#   stdout, one block per argument, in argument order, printed once all are
#          processed:
#            CREATED=<issue URL>/artifacts/<number>   status created
#            REASON=<reason>        after CREATED= when the reason is not empty
#            REFUSED=<file>         an extension outside the table
#            FAILED=<file>          status failed, or no result line
#            REASON=<reason>        after FAILED=: gh's reason, or its output on
#                                   one line when there is none
#   exit 0: every argument CREATED with an empty reason.
#   exit 1: any REFUSED, FAILED or CREATED with a reason; or the issue lookup
#           failed (ERROR line, empty stdout).
#   exit 2: bad arguments, a missing file or a pull request (ERROR line, empty
#           stdout, no create call).
#   exit 3: the first create call printed the unknown-command output of a gh
#           before 2.103 (ERROR line, empty stdout, no further call).
set -u

if [ $# -lt 2 ]; then
  echo "ERROR artifact-create.sh: need <issue> <file or link>..." >&2
  exit 2
fi
issue=$1
shift

case $issue in
  '#'*) issue=${issue#\#} ;;
  https://*) issue=${issue%%\?*}; issue=${issue%%#*} ;;
esac
case $issue in
  https://*/*/*/pull/[0-9]*)
    echo "ERROR artifact-create.sh: $issue is a pull request; artifacts exist on issues only" >&2
    exit 2 ;;
  https://*/*/*/issues/*)
    case ${issue##*/} in
      ''|*[!0-9]*) echo "ERROR artifact-create.sh: not an issue reference: $issue" >&2; exit 2 ;;
    esac ;;
  ''|*[!0-9]*)
    echo "ERROR artifact-create.sh: not an issue reference: $issue" >&2
    exit 2 ;;
esac

for a in "$@"; do
  case $a in
    http://*|https://*) ;;
    *)
      if [ ! -f "$a" ]; then
        echo "ERROR artifact-create.sh: file not found: $a" >&2
        exit 2
      fi ;;
  esac
done

lookup=$(gh issue view "$issue" --json url --jq .url 2>&1 </dev/null)
st=$?
url=$(printf '%s\n' "$lookup" | tr -d '\r' | tail -n 1)
if [ $st -ne 0 ] || [ -z "$url" ]; then
  echo "ERROR artifact-create.sh: issue lookup failed: $(printf '%s' "$lookup" | tr '\n\r' '  ')" >&2
  exit 1
fi
case $url in
  */pull/*)
    echo "ERROR artifact-create.sh: $issue is a pull request; artifacts exist on issues only" >&2
    exit 2 ;;
esac

nl='
'
out=""
bad=0
calls=0
for a in "$@"; do
  kind=plain
  case $a in
    http://*|https://*) ;;
    *)
      base=${a##*/}
      ext=""
      case $base in
        *.*) ext=$(printf '%s' "${base##*.}" | tr 'A-Z' 'a-z') ;;
      esac
      case $ext in
        md|markdown|txt|html|htm) ;;
        png|jpg|jpeg|gif|mp4|mov|webm) kind=media ;;
        *) kind=none ;;
      esac ;;
  esac
  if [ $kind = none ]; then
    out="${out}REFUSED=$a$nl"
    bad=1
    continue
  fi

  calls=$((calls+1))
  if [ $kind = media ]; then
    res=$(gh issue artifact create "$url" --name "$base" --body "$base" --attach "$a" 2>&1 </dev/null)
  else
    res=$(gh issue artifact create "$url" "$a" 2>&1 </dev/null)
  fi
  st=$?
  if [ $st -ne 0 ] && [ $calls -eq 1 ] && printf '%s' "$res" | grep -F -q 'unknown command "artifact" for "gh issue"'; then
    echo "ERROR artifact-create.sh: gh has no issue artifact command; it needs gh 2.103 or later" >&2
    exit 3
  fi

  line=$(printf '%s\n' "$res" | tr -d '\r' | awk -F'\t' '($1 == "created" || $1 == "failed") && NF >= 4 { print; exit }')
  oneline=$(printf '%s' "$res" | tr '\n\r' '  ')
  if [ -z "$line" ]; then
    out="${out}FAILED=$a${nl}REASON=$oneline$nl"
    bad=1
    continue
  fi
  status=$(printf '%s' "$line" | cut -f1)
  number=$(printf '%s' "$line" | cut -f2)
  reason=$(printf '%s' "$line" | cut -f5)
  if [ "$status" = created ]; then
    out="${out}CREATED=$url/artifacts/$number$nl"
    if [ -n "$reason" ]; then
      out="${out}REASON=$reason$nl"
      bad=1
    fi
  else
    [ -n "$reason" ] || reason=$oneline
    out="${out}FAILED=$a${nl}REASON=$reason$nl"
    bad=1
  fi
done

printf '%s' "$out"
exit $bad

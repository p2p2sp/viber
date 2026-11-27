#!/usr/bin/env bash
# spec-paths.sh <slug> [<mockup>]
#
# Names the files of one spec run. Creates nothing but, when <mockup> is given,
# its copy beside the spec, so the mockup is committed and archived with the run.
#   reads  : <root>/.claude/viber.yml, `runs` of its `directories:` group
#            alone: the directory under docs/ holding the open runs. No file,
#            no group, or a value that is empty, `.`, `..` or holds a slash:
#            `_specs`. lib/build-config.ts of the spec-implementor skill reads the
#            group by the same rules.
#   stdout : spec: <root>/docs/<runs>/<stamp>_<slug>/spec.md
#            intent: <root>/.temp/viber/<stamp>_<slug>/intent.md
#            review: <root>/.temp/viber/<stamp>_<slug>/spec-review.md
#            prototype: <root>/docs/<runs>/<stamp>_<slug>/prototype.html
#              with <mockup> only. lib/build-cut.ts of the spec-implementor skill
#              looks for the file under that name.
#            spec-parts.sh takes the spec: and intent: paths of a call
#            without <mockup> and names each part beside them as
#            <stamp>_<slug>-p<n>-of-<N>; it copies the mockup itself.
#   exit  : 0 ok, 1 the copy failed, 2 bad usage or an unreadable <mockup>
# Dependencies: bash 3.2+, date, awk, mkdir, cp; git when the working directory
# is a repository.

set -u

slug="${1:-}"
slug_re='^[a-z0-9]+(-[a-z0-9]+)*$'
if [ $# -lt 1 ] || [ $# -gt 2 ] || ! [[ "$slug" =~ $slug_re ]]; then
  echo "usage: spec-paths.sh <slug> [<mockup>]   (slug: lowercase words and digits joined by single hyphens)" >&2
  exit 2
fi
if [ $# -eq 2 ] && [ ! -r "$2" -o ! -f "$2" ]; then
  echo "spec-paths.sh: cannot read the mockup $2" >&2
  exit 2
fi

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# Stamp down to the second: two runs on one topic never share a directory.
name="$(date +%Y-%m-%d-%H-%M-%S)_$slug"

runs="_specs"
if [ -f "$root/.claude/viber.yml" ]; then
  runs="$(awk -v runs="$runs" '
    { sub(/\r$/, ""); sub(/[ \t]+#.*$/, "") }
    /^[ \t]*(#|$)/ { next }
    /^[^ \t]/ { inside = ($0 ~ /^directories[ \t]*:/); next }
    inside && /^[ \t]+runs[ \t]*:/ {
      sub(/^[ \t]+runs[ \t]*:[ \t]*/, ""); sub(/[ \t]+$/, "")
      if ($0 ~ /^".*"$/ || $0 ~ /^\047.*\047$/) $0 = substr($0, 2, length($0) - 2)
      if ($0 != "" && $0 != "." && $0 != ".." && $0 !~ /[\/\\]/) runs = $0
    }
    END { print runs }
  ' "$root/.claude/viber.yml")"
fi

echo "spec: $root/docs/$runs/$name/spec.md"
echo "intent: $root/.temp/viber/$name/intent.md"
echo "review: $root/.temp/viber/$name/spec-review.md"
if [ $# -eq 2 ]; then
  if ! mkdir -p "$root/docs/$runs/$name" || ! cp "$2" "$root/docs/$runs/$name/prototype.html"; then
    echo "spec-paths.sh: cannot copy the mockup to $root/docs/$runs/$name/prototype.html" >&2
    exit 1
  fi
  echo "prototype: $root/docs/$runs/$name/prototype.html"
fi

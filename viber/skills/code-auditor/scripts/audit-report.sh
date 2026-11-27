#!/bin/sh
#
# audit-report.sh - joins the part files the lens-auditor agents wrote into one
# report file and prints its path.
#
# It exists so `viber:code-auditor` builds the report through ONE
# pre-approved command and never reads a part file itself.
#
# Contract:
#   argv   : $1 = the parts directory; $2 = the audited path, printed in the
#            report heading; $3... = the lens names, in report order. Fewer than
#            three arguments: exit 2. A lens name is not validated.
#   cwd    : the project root; the report path is relative to it.
#   file   : creates docs/code-auditor/ and writes
#            docs/code-auditor/<yyyyMMdd-HHmmss>-<lenses>.md (local time,
#            <lenses> the lens names in argument order joined by `-`):
#              line 1  # Code audit: <path>
#              then    <parts dir>/<lens>.md of each lens, in argument order,
#                      each after one empty line
#            A part file is never modified or removed; an absent one is skipped.
#   stdout : `MISSING=<lens>` for each absent part file, in argument order, then
#            `REPORT=<report path>` as the last line.
#   exit   : 0 with REPORT=; 1 with one `error: audit-report.sh: ...` line on
#            stderr and no REPORT= line when the directory or the report cannot
#            be written; 2 with the usage on stderr on fewer than three arguments.
#
set -u

fail() {
  echo "error: audit-report.sh: $1" >&2
  exit 1
}

if [ $# -lt 3 ]; then
  echo "error: audit-report.sh: usage: audit-report.sh <parts dir> <path> <lens>..." >&2
  exit 2
fi
parts=$1
path=$2
shift 2

dir=docs/code-auditor
mkdir -p "$dir" 2>/dev/null || fail "cannot create $dir"
lenses=$(printf '%s-' "$@")
report="$dir/$(date +%Y%m%d-%H%M%S)-${lenses%-}.md"
{ printf '# Code audit: %s\n' "$path" > "$report"; } 2>/dev/null || fail "cannot write $report"

for lens in "$@"; do
  part="$parts/$lens.md"
  if [ ! -f "$part" ]; then
    printf 'MISSING=%s\n' "$lens"
    continue
  fi
  {
    printf '\n'
    cat "$part" || exit 1
    # A part with no final newline still ends its last line.
    [ -z "$(tail -c 1 "$part")" ] || printf '\n'
  } >> "$report" 2>/dev/null || fail "cannot write $report"
done

printf 'REPORT=%s\n' "$report"

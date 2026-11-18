#!/bin/sh
# viber - skills/code-auditor/scripts/strip-tag.sh
# Deletes the write-call artefact at the end of a file an agent wrote: a last
# line that is nothing but a closing tag.
#
# Why it exists: a writer agent sometimes leaks the closing tag of its own Write
# call (`</content>`, `</parameter>`) into the value as a last line. A hunter
# report, a claim sidecar or a findings file carrying it breaks every script that
# reads the file, and a model re-reading its own file to catch it spends tokens
# on a check one script does the same way every run. Every other auditor script
# calls this one first.
#
# Contract:
#   argv   : <file>... - the files to clean. A path that is not a regular file
#            (missing, a directory) is skipped; no argument at all does nothing.
#   cwd    : irrelevant: every path comes from argv, so cwd only resolves a
#            relative one.
#   env    : TMPDIR, when set, holds the scratch copy; /tmp otherwise.
#   files  : each file whose last line is a bare closing tag (`</name>` with
#            optional spaces or tabs around it and an optional carriage return
#            at the end) is rewritten without that line, every byte before it
#            unchanged. Any other file is not opened for writing, so it stays
#            byte-identical. A tag inside a line, text before it on its line, or
#            a tag on a line that is not the last one never counts.
#   stdout : nothing.
#   exit   : 0 always, whatever the files hold.
set -u

cr=$(printf '\r')
tmp=""
cleanup() {
  if [ -n "$tmp" ]; then
    rm -f "$tmp"
  fi
}
trap cleanup EXIT

for file in "$@"; do
  [ -f "$file" ] || continue
  last=$(tail -n 1 "$file" 2>/dev/null) || continue
  last=${last%"$cr"}
  printf '%s\n' "$last" | grep -Eq '^[[:blank:]]*</[A-Za-z][A-Za-z0-9_.:-]*>[[:blank:]]*$' || continue
  tmp=$(mktemp "${TMPDIR:-/tmp}/strip-tag.XXXXXX") || { tmp=""; continue; }
  if sed '$d' "$file" > "$tmp" 2>/dev/null; then
    cat "$tmp" > "$file" 2>/dev/null
  fi
  rm -f "$tmp"
  tmp=""
done

exit 0

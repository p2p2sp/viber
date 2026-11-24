#!/bin/sh
# viber - skills/code-auditor/scripts/strip-tag.sh
# Deletes the write-call artefact at the end of a file an agent wrote, a last
# line that is nothing but a closing tag: the wrapper that runs strip-tag.ts
# beside it.
#
# Why it exists: a writer agent sometimes leaks the closing tag of its own Write
# call (`</content>`, `</parameter>`) into the value as a last line, which breaks
# every script that reads the file. The keep-units and hunt-return cores cut it in
# process, through the same core. What counts as such a line and how it is cut live in strip-tag.ts and
# viber/lib/strip-tag.ts, never here, so every caller keeps this call line while
# the cut is tested in process.
#
# Contract:
#   argv   : <file>... - the files to clean. Handed to strip-tag.ts as given;
#            what is cut is defined in the header of strip-tag.ts.
#   cwd    : irrelevant: every path comes from argv, so cwd only resolves a
#            relative one.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : strip-tag.ts beside it and viber/lib/ three directories up.
#   files  : strip-tag.ts rewrites each file whose last line is a bare closing
#            tag without that line, and leaves every other file byte-identical.
#            No file is touched when node is absent or fails.
#   stdout : nothing.
#   exit   : 0 always, whatever the files hold and whether or not node ran.
set -u

command -v node >/dev/null 2>&1 || exit 0
node "${0%[/\\]*}/strip-tag.ts" "$@" >/dev/null 2>&1 || true

exit 0

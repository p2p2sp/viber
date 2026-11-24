#!/usr/bin/env bash
#
# switch-text.sh - prints the skill fragment matching one .claude/viber.yml
# switch value, so a loaded skill holds only the instructions of the
# configuration the project turned on: the wrapper that runs switch-text.ts
# beside it.
#
# It exists because a skill body branching on a switch makes the model read and
# track the text of every feature the project turned off. Each switch-dependent
# passage lives in its own fragment file, and the skill preloads it through this
# script at the place the text belongs. The key list and the placeholder
# expansion live in switch-text.ts and viber/lib/switch-text.ts, never here, so
# every caller keeps this call line while the selection is tested in process.
#
# Contract:
#   argv   : <key> <skill dir> <name>. Handed to switch-text.ts as given; the
#            keys, the name pattern and the stdout are defined in the header of
#            switch-text.ts.
#   cwd    : any directory inside the host project - switch-text.ts resolves the
#            repository root itself, so the caller's cwd is irrelevant.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : switch-text.ts and viber/lib/ beside it; the config files and the
#            fragment are read by switch-text.ts alone.
#   stdout : what switch-text.ts prints: the fragment, or nothing. Nothing when
#            node is absent or fails: a missing Node never breaks a preload.
#   exit   : ALWAYS 0 - it runs as a `!` preload, where a non-zero exit aborts
#            the whole skill load.
#
set -u

command -v node >/dev/null 2>&1 || exit 0
node "${0%/*}/switch-text.ts" "$@" 2>/dev/null || true

exit 0

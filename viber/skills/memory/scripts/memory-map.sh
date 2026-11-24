#!/usr/bin/env bash
#
# memory-map.sh - maps the host project's CLAUDE.md cascade, and on --reset
# deletes the nodes and sections it is handed: the wrapper that runs
# memory-map.ts beside it.
#
# It exists because the map is a `!` preload, permission-checked as ONE command,
# and because the model is handed a map instead of walking the tree itself. The
# map lines, the reset gate, the targets and the reconcile wave live in
# memory-map.ts and viber/lib/memory-map.ts, never here, so the skill keeps this
# call line while the rules are tested in process.
#
# Contract:
#   argv   : none, or --reset <path> [...], --targets <mode> [...] or
#            --reconcile --planned <nodes> [...]. Handed to memory-map.ts as
#            given; how they are read is defined in the header of memory-map.ts.
#   cwd    : any directory inside the host project - memory-map.ts resolves the
#            repository root itself; outside a repository the cwd is the root.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : memory-map.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and viber/lib/ three
#            directories up.
#   writes : what memory-map.ts writes: the deletions of a --reset that passed.
#   stdout : what memory-map.ts prints. With no argument, nothing when node is
#            absent or fails: a missing Node never breaks a preload.
#   exit   : with no argument ALWAYS 0: a non-zero exit in a `!` preload aborts
#            the skill load. With one, that of memory-map.ts (0, 2 or 3), and 127
#            with no `node` on PATH, so a reset that never ran is no deletion.
#
set -u

if [ "$#" -gt 0 ]; then
  exec node "${0%[/\\]*}/memory-map.ts" "$@"
fi
command -v node >/dev/null 2>&1 || exit 0
node "${0%[/\\]*}/memory-map.ts" 2>/dev/null || true

exit 0

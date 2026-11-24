#!/usr/bin/env bash
#
# rules-map.sh - every deterministic fact about the host project's
# `.claude/rules/` directory, and the one gate in front of deleting a rule
# file: the wrapper that runs rules-map.ts beside it.
#
# It exists because `/viber:rules` has to know what the layer IS before it asks
# the user anything, and because the map is a `!` preload, permission-checked as
# ONE command. The map lines, the reset gate and the brief and confirm blocks
# live in rules-map.ts and viber/lib/rules-map.ts, never here, so the skill
# keeps this call line while the rules are tested in process.
#
# Contract:
#   argv   : none, or --reset <path> [...], --brief <id> <target> [...] or
#            --confirm <id> <target> [...]. Handed to rules-map.ts as given; how
#            they are read is defined in the header of rules-map.ts.
#   cwd    : any directory inside the host project - rules-map.ts resolves the
#            repository root itself; outside a repository the cwd is the root.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : rules-map.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and viber/lib/ three
#            directories up.
#   writes : what rules-map.ts writes: nothing with no argument or under
#            --confirm, the deletions of a --reset that passed, the findings
#            files of a --brief.
#   stdout : what rules-map.ts prints. With no argument, nothing when node is
#            absent or fails: a missing Node never breaks a preload.
#   exit   : with no argument ALWAYS 0: a non-zero exit in a `!` preload aborts
#            the skill load. With one, that of rules-map.ts (0, 2 or 3), and 127
#            with no `node` on PATH, so a reset that never ran is no deletion.
#
set -u

if [ "$#" -gt 0 ]; then
  exec node "${0%[/\\]*}/rules-map.ts" "$@"
fi
command -v node >/dev/null 2>&1 || exit 0
node "${0%[/\\]*}/rules-map.ts" 2>/dev/null || true

exit 0

#!/usr/bin/env bash
#
# reach.sh - collects the reference candidates of the planner's reach targets
# into one file, so `impact-mapper` classifies a list instead of searching the
# repository itself, and prints the dispatch block of the mapper: the wrapper
# that runs reach.ts beside it.
#
# It exists because the mapper's own searching (one grep per target, per
# spelling of the target) is the bulk of its tokens, and the search is
# mechanical. The terms of a target, the files searched, the caps and every
# stdout line live in reach.ts and viber/lib/reach.ts, never here, so the
# planner keeps this call line while the rules are tested in process.
#
# Contract:
#   argv   : --plan <plan path> then one or more targets. Handed to reach.ts as
#            given; how they are read is defined in the header of reach.ts.
#            Under Git Bash the MSYS runtime hands node a `/c/...` plan path as
#            `C:/...`, and the `plan:` line then names that spelling.
#   cwd    : any directory; inside a repository reach.ts resolves its root from
#            it.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : reach.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and viber/lib/ three
#            directories up.
#   writes : what reach.ts writes: .temp/viber/planner/reach-<stamp>.md under
#            the repository root.
#   stdout : what reach.ts prints: the `candidates:` and `hits:` lines and the
#            `NEXT: dispatch` block.
#   stderr : one error: line when the exit is 2.
#   exit   : that of reach.ts: 0; 2 with a missing or empty --plan, no target or
#            an empty target path (stdout empty). 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/reach.ts" "$@"

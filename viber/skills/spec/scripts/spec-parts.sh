#!/usr/bin/env bash
#
# spec-parts.sh - cuts the intent file of a change split into parts into one
# intent file per part: the wrapper that runs spec-parts.ts beside it.
#
# Contract:
#   argv   : handed to spec-parts.ts as given; its header defines them.
#   cwd    : any directory.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : spec-parts.ts beside it and lib/ beside it.
#   writes : what spec-parts.ts writes.
#   stdout : what spec-parts.ts prints.
#   stderr : what spec-parts.ts prints.
#   exit   : that of spec-parts.ts: 0, 1 or 2. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/spec-parts.ts" "$@"

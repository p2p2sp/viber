#!/usr/bin/env bash
#
# memory.sh - prepares the briefs of the memory-editor agents: the wrapper
# that runs memory.ts beside it.
#
# Every rule and every stdout line live in memory.ts and lib/, never here, so the
# memory skill keeps this call line.
#
# Contract:
#   argv   : handed to memory.ts as given; its header defines the call forms.
#   cwd    : any directory inside the host project, a git repository.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file)
#            and `git`.
#   file   : memory.ts beside it and lib/ beside memory.ts.
#   writes : what memory.ts writes.
#   stdout : what memory.ts prints.
#   stderr : what memory.ts prints when the exit is 2.
#   exit   : that of memory.ts: 0 or 2. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/memory.ts" "$@"

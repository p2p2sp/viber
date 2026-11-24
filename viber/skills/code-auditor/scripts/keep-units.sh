#!/bin/sh
# viber - skills/code-auditor/scripts/keep-units.sh
# Gates the mapper's map of an audit run, prints the scout batches of a scope whose
# units exceed its budget and the hunter blocks of the kept units, recording each
# printed hunt in the ledger: the wrapper that runs keep-units.ts beside it.
#
# Why it exists: checking the map, retrying the mapper and assembling every scout
# and hunter brief by hand is mechanical work a model repeats differently every run
# and pays tokens for. The gate, the budgets, the kept order and every stdout line
# live in keep-units.ts and viber/lib/keep-units.ts, never here, so the skill keeps
# this call line while the rules are tested in process.
#
# Contract:
#   argv   : <ws>, then optionally --wave. Handed to keep-units.ts as given; how
#            they are read is defined in the header of keep-units.ts. Under Git
#            Bash the MSYS runtime hands node a `/c/...` <ws> as `C:/...`, and
#            every printed path then names that spelling.
#   cwd    : irrelevant: every path derives from <ws>, so cwd only resolves a
#            relative one.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : keep-units.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and viber/lib/ three
#            directories up.
#   files  : what keep-units.ts reads and writes under <ws>: map.md, the score
#            files, run.md and the ledger.
#   stdout : what keep-units.ts prints: exactly one answer in the auditor
#            directive format.
#   exit   : that of keep-units.ts: 0, or 2 with one error: line on stderr and
#            nothing on stdout. 127 with no `node` on PATH.
set -u

exec node "${0%[/\\]*}/keep-units.ts" "$@"

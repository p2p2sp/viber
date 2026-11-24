#!/bin/sh
# viber - skills/code-auditor/scripts/hunt-return.sh
# Answers the return of a hunter or a critic of an audit run: one critic block per
# claim the hunt filed, the one retry of a hunter that filed no report or of a critic
# that left no verdict, or `NEXT: none`: the wrapper that runs hunt-return.ts
# beside it.
#
# Why it exists: listing the reports of one hunt, building a critic brief per claim
# and rebuilding a brief for a retry is mechanical work a model repeats differently
# every run and pays tokens for. The id rules, the retries and every stdout line live
# in hunt-return.ts and viber/lib/hunt-return.ts, never here, so the skill keeps this
# call line while the rules are tested in process.
#
# Contract:
#   argv   : <ws> hunter <hunt id>, or <ws> critic <hunt id>-<k>. Handed to
#            hunt-return.ts as given; how they are read is defined in the header of
#            hunt-return.ts. Under Git Bash the MSYS runtime hands node a `/c/...`
#            <ws> as `C:/...`, and every printed path then names that spelling.
#   cwd    : irrelevant: every path derives from <ws>, so cwd only resolves a
#            relative one.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : hunt-return.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and viber/lib/ three
#            directories up.
#   files  : what hunt-return.ts reads and writes under <ws>: the reports, the
#            verdict files and the ledger.
#   stdout : what hunt-return.ts prints: exactly one answer in the auditor
#            directive format.
#   exit   : that of hunt-return.ts: 0, or 2 with one error: line on stderr and
#            nothing on stdout. 127 with no `node` on PATH.
set -u

exec node "${0%[/\\]*}/hunt-return.ts" "$@"

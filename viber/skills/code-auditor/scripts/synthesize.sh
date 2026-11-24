#!/bin/sh
# viber - skills/code-auditor/scripts/synthesize.sh
# Writes the run's findings.md from its ledger, the head lines of its reports and
# the verdict files of its critics, and prints the summary line and the fill
# block: the wrapper that runs synthesize.ts beside it.
#
# Why it exists: folding a verdict into a finding, ranking the pool by severity,
# verdict, confidence and hunt order, applying the cap of ten and the 4.0 floor of
# a full entry, and counting units, hunts and coverage were rules the model applied
# by hand on every run, each one a chance to change an entry or a count. The
# folding, the order, the merge pairs and every stdout line live in synthesize.ts
# and viber/lib/synthesize.ts, never here, so the skill keeps this call line while
# the rules are tested in process.
#
# Contract:
#   argv   : <ws> then any number of --merge <id>,<id>[,<id>]... or one
#            --merge none. Handed to synthesize.ts as given; how they are read
#            is defined in the header of synthesize.ts. Under Git Bash the MSYS
#            runtime hands node a `/c/...` <ws> as `C:/...`, and every printed
#            path then names that spelling.
#   cwd    : irrelevant: every path derives from <ws>, so cwd only resolves a
#            relative one.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : synthesize.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and viber/lib/ three
#            directories up.
#   files  : what synthesize.ts reads and writes under <ws>: findings.md, the
#            ledger and seeds.md.
#   stdout : what synthesize.ts prints: the `NEXT: merge` block, or the
#            `summary:` line with its directive block.
#   exit   : that of synthesize.ts: 0 on success; 2 with one error: line on
#            stderr and nothing on stdout. 127 with no `node` on PATH.
set -u

exec node "${0%[/\\]*}/synthesize.ts" "$@"

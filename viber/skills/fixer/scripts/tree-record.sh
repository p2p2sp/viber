#!/usr/bin/env bash
#
# tree-record.sh - records the paths the working tree has changed before the fixer's first edit and
# names, at the handoff, every path changed since: the wrapper that runs tree-record.ts beside it.
#
# It exists because the fixer's two `git status` steps were prose a model applied by eye, and a
# path missed in the comparison reached the planner as an edit the fixer never owned. What counts
# as a changed path, the record and every stdout line live in tree-record.ts and
# viber/lib/tree-record.ts, never here, so the fixer skill keeps this call line while both steps
# are tested in process.
#
# Contract:
#   argv   : --save | --check [<reproduction test path>]. Handed to tree-record.ts as given; the
#            modes and how the path is read are defined in the header of tree-record.ts. Under
#            Git Bash the MSYS runtime hands node a `/c/...` argument as `C:/...`.
#   cwd    : any directory inside the repository (tree-record.ts resolves the repository root
#            from it and reads a relative --check argument against it).
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : tree-record.ts beside it, found from the invoked path with either separator (a C:\
#            spelling included), and viber/lib/ three directories up.
#   writes : tree-record.ts writes .temp/viber/fixer/tree-record under the repository root, by
#            --save only.
#   stdout : what tree-record.ts prints: NEXT: trace and the recorded: lines of --save, NEXT:
#            handoff or the STOP: line and its path: lines of --check.
#   stderr : one error: line when the exit is 2.
#   exit   : that of tree-record.ts: 0; 2 with an empty stdout on a refusal. 127 with no `node`
#            on PATH.
#
set -u

exec node "${0%[/\\]*}/tree-record.ts" "$@"

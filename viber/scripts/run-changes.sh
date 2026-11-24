#!/usr/bin/env bash
#
# run-changes.sh - prints the paths a run changed in the working tree: the base
# commit the run started from and one line per path that differs from it: the
# wrapper that runs run-changes.ts beside it.
#
# It exists because `test-runner` used to work the changed set out itself and
# drifted: the wrong base commit, the untracked files forgotten, a path listed
# twice. How the base is found and every stdout line live in run-changes.ts and
# viber/lib/run-changes.ts, never here, so `test-runner` keeps this call line
# while the set is tested in process.
#
# Contract:
#   argv   : $1 run directory (OPTIONAL, at most one). Handed to run-changes.ts
#            as given; how it is read is defined in the header of
#            run-changes.ts. Under Git Bash the MSYS runtime hands node a
#            `/c/...` argument as `C:/...`.
#   cwd    : any directory inside the host repository (run-changes.ts resolves
#            the repository root from it).
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : run-changes.ts and viber/lib/ beside it, found from the invoked
#            path with either separator (a C:\ spelling included).
#   writes : nothing.
#   stdout : what run-changes.ts prints: the `base:` line, then one
#            `changed: <path>` line per changed or untracked path.
#   stderr : one `error: ...` line on exit 2.
#   exit   : that of run-changes.ts: 0 the lines were printed; 2 with an empty
#            stdout on more than one argument or outside a git repository. 127
#            with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/run-changes.ts" "$@"

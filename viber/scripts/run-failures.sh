#!/usr/bin/env bash
#
# run-failures.sh - writes a run's failure trail, `failures.md`, from the reports
# its agents left in `work/`, and prints how many failures each cause holds; with
# `--lessons` it prints the test-strategy rules the failed task reviews named:
# the wrapper that runs run-failures.ts beside it.
#
# A build deletes its `work/` directory when the run is archived, and with it the
# only record of what an agent actually got wrong. The trail copies that record
# into one file that survives the archive. Which line is an entry, how a repeated
# finding is merged and every stdout line live in run-failures.ts and
# viber/lib/run-failures.ts, never here, so `implementor` and `task-step.sh` keep
# this call line while the rules are tested in process.
#
# Contract:
#   argv   : <run-dir>, or --lessons <run-dir>. Handed to run-failures.ts as
#            given; how they are read is defined in the header of
#            run-failures.ts. Under Git Bash the MSYS runtime hands node a
#            `/c/...` argument as `C:/...`, and an error: line then names that
#            spelling.
#   cwd    : any directory inside the host repository (run-failures.ts resolves
#            the repository root from it); outside a repository the base a
#            relative argument resolves against.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : run-failures.ts and viber/lib/ beside it, found from the invoked
#            path with either separator (a C:\ spelling included).
#   writes : what run-failures.ts writes: <run-dir>/failures.md alone, or
#            nothing under --lessons.
#   stdout : what run-failures.ts prints: the one `failures:` line, or the one
#            `lessons:` line.
#   stderr : one `error: ...` line on exit 2 or 3.
#   exit   : that of run-failures.ts: 0 the line was printed; 2 unusable argv; 3
#            failures.md could not be written or removed. 127 with no `node` on
#            PATH.
#
set -u

exec node "${0%[/\\]*}/run-failures.ts" "$@"

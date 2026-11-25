#!/usr/bin/env bash
#
# run-notes.sh - prints what became of every open item the plan review left in a
# landed plan and of every ruling the build made, then every path a task commit
# refused and every pair of tasks put in sequence, one line each: the wrapper
# that runs run-notes.ts beside it.
#
# The notes of a plan review reach the coders through the task files, and what
# each coder did with its notes sits under work/, which the archive of the run
# drops. This list is what survives in outcome.md. Which line is an item, how a
# note is numbered and every stdout line live in run-notes.ts and
# viber/lib/run-notes.ts, never here, so commit-task.sh keeps this call line
# while the rules are tested in process.
#
# Contract:
#   argv   : <plan-file>, the landed <run>/plan.md. Handed to run-notes.ts as
#            given; how it is read is defined in the header of run-notes.ts.
#            Under Git Bash the MSYS runtime hands node a `/c/...` argument as
#            `C:/...`, and an error: line then names that spelling.
#   cwd    : the repository root: a relative plan path resolves against it.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : run-notes.ts and viber/lib/ beside it, found from the invoked path
#            with either separator (a C:\ spelling included).
#   writes : nothing.
#   stdout : what run-notes.ts prints: the `- critical |`, `- note |`,
#            `- ruling |`, `- refused |` and `- sequenced |` lines, or nothing
#            when the run holds none.
#   stderr : one `error: ...` line on exit 2.
#   exit   : that of run-notes.ts: 0 the list was printed, an empty one
#            included; 2 unusable argv or a missing plan. 127 with no `node` on
#            PATH.
#
set -u

exec node "${0%[/\\]*}/run-notes.ts" "$@"

#!/usr/bin/env bash
#
# plan-index.sh - compact task index for the orchestrator, plus plan structure
# validation and, on demand, the decomposition the per-task agents read: the wrapper
# that runs plan-index.ts beside it.
#
# It exists as a script because the orchestrator and the planner read no plan: what
# it prints is their whole view of one, and a plan defect it lets through is seen by
# nothing else. The checks, the modes and the writes live in plan-index.ts and
# viber/lib/plan-index/, never here, so every caller keeps this call line while they
# are tested in process.
#
# Contract:
#   argv   : the plan file, then the mode and its arguments, handed to
#            plan-index.ts as given; how they are read is defined in its header.
#            Under Git Bash the MSYS runtime hands node a `/c/...` path as
#            `C:/...`, and the printed lines then name that spelling.
#   cwd    : the repository root: the plan path and every path in the index are
#            relative to it.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : plan-index.ts and viber/lib/ beside it, found from the invoked path
#            with either separator (a C:\ spelling included).
#   writes : what plan-index.ts writes: under --split the decomposition beside the
#            plan and its commit, else nothing.
#   stdout : what plan-index.ts prints; git's own output goes to stderr.
#   stderr : what plan-index.ts prints: FIX:, SPLIT: or error: lines.
#   exit   : that of plan-index.ts: 0; 1 a file of --split could not be written; 2
#            unusable argv, plan or input file; 3 no task blocks; 4 a broken task
#            contract. 127 with no `node` on PATH, nothing touched.
#
set -u

exec node "${0%[/\\]*}/plan-index.ts" "$@"

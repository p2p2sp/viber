#!/usr/bin/env bash
#
# plan.sh - names the work files of a plan, checks a plan draft, lands it as
# the plan and orders its tasks: the wrapper that runs plan.ts beside it.
#
# Every rule and every stdout line live in plan.ts and lib/, never here, so the
# planner skill and the plan gate keep this call line.
#
# Contract:
#   argv   : handed to plan.ts as given; its header defines the call forms.
#   cwd    : any directory inside the host project.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : plan.ts beside it and lib/ beside it.
#   writes : what plan.ts writes: the plan file of `land`; `paths` removes the
#            staged decision records of the spec's run.
#   stdout : what plan.ts prints.
#   stderr : what plan.ts prints when the exit is 2.
#   exit   : that of plan.ts: 0, 1 or 2. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/plan.ts" "$@"

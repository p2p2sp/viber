#!/usr/bin/env bash
#
# direct.sh - closes a build of the direct flow: the wrapper that runs
# direct.ts beside it.
#
# Every rule and every stdout line live in direct.ts and lib/, never here, so the
# implementor skill keeps this call line.
#
# Contract:
#   argv   : handed to direct.ts as given; its header defines the call forms.
#   cwd    : any directory inside the host project.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file)
#            and `git`.
#   file   : direct.ts beside it, lib/ beside it, and the planner,
#            spec-implementor and simple-implementor skills' scripts/lib/ beside
#            this skill.
#   writes : what direct.ts writes.
#   stdout : what direct.ts prints.
#   stderr : what direct.ts prints when the exit is 2.
#   exit   : that of direct.ts: 0 or 2. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/direct.ts" "$@"

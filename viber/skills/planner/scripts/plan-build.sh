#!/usr/bin/env bash
#
# plan-build.sh - prints the dispatch blocks of the planner's writing agents and
# moves what they wrote, file to file, into the plan: the wrapper that runs
# plan-build.ts beside it.
#
# It exists because the plan text, the reach lines, the fixes and the findings
# used to travel through the planner's session, typed again at every hop. The
# commands, the files and every stdout line live in plan-build.ts and
# viber/lib/plan-build.ts, never here, so the planner keeps this call line while
# the rules are tested in process.
#
# Contract:
#   argv   : <command> <plan> and the command's arguments, handed to
#            plan-build.ts as given; how they are read is defined in its header.
#            Under Git Bash the MSYS runtime hands node a `/c/...` path as
#            `C:/...`, and the printed lines then name that spelling.
#   cwd    : any directory inside the repository; plan-build.ts resolves its
#            root from it.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : plan-build.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and viber/lib/ three
#            directories up.
#   writes : what plan-build.ts writes: the work files under
#            .temp/viber/planner/ of the repository root and the plan file.
#   stdout : what plan-build.ts prints.
#   stderr : what plan-build.ts prints: error: or FIX: lines.
#   exit   : that of plan-build.ts: 0, 2, 4 or 5. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/plan-build.ts" "$@"

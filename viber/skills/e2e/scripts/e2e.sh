#!/usr/bin/env bash
#
# e2e.sh - the steps of the e2e skill around its e2e-writer agents: the wrapper
# that runs e2e.ts beside it.
#
# Every rule and every stdout line live in e2e.ts and lib/, never here, so the
# e2e skill and the briefs keep this call line.
#
# Contract:
#   argv   : handed to e2e.ts as given; its header defines the call forms.
#   cwd    : any directory inside the host project.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file)
#            and `git`; `run` needs `npx` too.
#   file   : e2e.ts beside it, lib/ beside e2e.ts and the spec-implementor
#            skill's scripts/lib/ beside this skill.
#   writes : what e2e.ts writes.
#   stdout : what e2e.ts prints.
#   stderr : what e2e.ts prints when the exit is 2.
#   exit   : that of e2e.ts: 0 or 2. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/e2e.ts" "$@"

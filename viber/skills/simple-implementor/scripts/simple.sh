#!/usr/bin/env bash
#
# simple.sh - drives the simple flow of a settled plan one event at a time: the
# wrapper that runs simple.ts beside it.
#
# Every rule and every stdout line live in simple.ts and lib/, never here, so the
# simple-implementor skill keeps this call line.
#
# Contract:
#   argv   : handed to simple.ts as given; its header defines the call forms.
#   cwd    : any directory inside the host project.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file)
#            and `git`.
#   file   : simple.ts beside it, lib/ beside it, and the planner and
#            spec-implementor skills' scripts/lib/ beside this skill.
#   writes : what simple.ts writes.
#   stdout : what simple.ts prints.
#   stderr : what simple.ts prints when the exit is 2.
#   exit   : that of simple.ts: 0 or 2. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/simple.ts" "$@"

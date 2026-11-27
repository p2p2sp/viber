#!/usr/bin/env bash
#
# build.sh - drives the build of an approved plan one event at a time: the
# wrapper that runs build.ts beside it.
#
# Every rule and every stdout line live in build.ts and lib/, never here, so the
# spec-implementor skill keeps this call line.
#
# Contract:
#   argv   : handed to build.ts as given; its header defines the call forms.
#   cwd    : any directory inside the host project.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file)
#            and `git`.
#   file   : build.ts and build-commit.ts beside it, lib/ beside it, and the
#            planner, commit and memory skills' scripts/lib/ beside this skill.
#   writes : what build.ts writes.
#   stdout : what build.ts prints.
#   stderr : what build.ts prints when the exit is 2.
#   exit   : that of build.ts: 0 or 2. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/build.ts" "$@"

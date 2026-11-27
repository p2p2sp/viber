#!/usr/bin/env bash
#
# rules.sh - lists the user's own rules, prepares the briefs of the
# rules-editor agents, checks what they wrote and prints the report: the
# wrapper that runs rules.ts beside it.
#
# Every rule and every stdout line live in rules.ts and lib/, never here, so the
# rules skill keeps this call line.
#
# Contract:
#   argv   : handed to rules.ts as given; its header defines the call forms.
#   cwd    : any directory inside the host project, a git repository.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file)
#            and `git`.
#   file   : rules.ts beside it, lib/ beside it, and the spec-implementor and
#            planner skills' scripts/lib/ beside this skill.
#   writes : what rules.ts writes.
#   stdout : what rules.ts prints.
#   stderr : what rules.ts prints when the exit is 2.
#   exit   : that of rules.ts: 0, 2 or 3. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/rules.ts" "$@"

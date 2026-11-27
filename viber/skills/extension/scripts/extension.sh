#!/usr/bin/env bash
#
# extension.sh - the state the extension skill starts from and its one write:
# the wrapper that runs extension.ts beside it.
#
# Every rule and every stdout line live in extension.ts, never here, so the
# skill keeps this call line.
#
# Contract:
#   argv   : handed to extension.ts as given; its header defines the call forms.
#   cwd    : any directory inside the host project.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : extension.ts beside it, and the spec-implementor skill's
#            scripts/lib/ beside this skill.
#   writes : what extension.ts writes.
#   stdout : what extension.ts prints.
#   exit   : 0. 127 with no `node` on PATH, which stops the skill's preload.
#
set -u

exec node "${0%[/\\]*}/extension.ts" "$@"

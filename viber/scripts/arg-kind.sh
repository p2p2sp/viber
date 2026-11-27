#!/bin/sh
#
# arg-kind.sh - classifies the first word of a skill's argument as a GitHub
# issue reference or a pull request reference: the wrapper that runs
# arg-kind.ts beside it.
#
# It exists because `intent`, `fixer` and `pr-feedback` decided from prose
# whether their argument was an issue or pull request reference, and a wrong
# call sent pasted text to `gh` or dropped a real reference into the free text.
# The shape rules live in arg-kind.ts and lib/arg-kind.ts, never here, so
# every caller keeps this call line while the classifier is tested in process.
#
# Contract:
#   argv   : handed to arg-kind.ts as given; its header defines the call forms.
#   cwd    : irrelevant: arg-kind.ts touches no file and runs no other command.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : arg-kind.ts and lib/ beside it.
#   stdout : what arg-kind.ts prints: one `NEXT:` or `STOP:` line.
#   exit   : that of arg-kind.ts: 0 with the line, 2 with one
#            `error: arg-kind.sh: ...` line on stderr and an empty stdout for a
#            malformed call. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/arg-kind.ts" "$@"

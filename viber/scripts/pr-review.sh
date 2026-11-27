#!/bin/sh
#
# pr-review.sh - names the pull request the `pr-review` skill reviews and posts
# the findings of that review into it: the wrapper that runs pr-review.ts beside
# it.
#
# It exists so the skill keeps one call line, pre-approved once, while the
# steps live in pr-review.ts and lib/pr-review.ts.
#
# Contract:
#   argv   : handed to pr-review.ts as given; its header defines the call forms.
#   cwd    : any directory inside the host repository.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file),
#            `gh` and `git`.
#   file   : pr-review.ts and lib/ beside it.
#   stdout : what pr-review.ts prints.
#   exit   : that of pr-review.ts. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/pr-review.ts" "$@"

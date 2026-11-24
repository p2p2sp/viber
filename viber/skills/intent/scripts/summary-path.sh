#!/usr/bin/env bash
#
# summary-path.sh - names the file `intent` writes its confirmed summary to, so
# the hand-off runs no `date` and spells no path pattern itself: the wrapper
# that runs summary-path.ts beside it.
#
# It exists because the hand-off used to make the model read the clock, build
# `<project root>/.temp/viber/intent/summary-<stamp>.md` by hand and normalise
# the slashes of a Windows drive. The stamp, the root and the slashes are built
# in summary-path.ts and viber/lib/summary-path.ts, never here, so the hand-off
# keeps this call line while the path is tested in process.
#
# Contract:
#   argv   : none. Any argument is an error, reported by summary-path.ts.
#   cwd    : any directory; inside a git repository summary-path.ts resolves the
#            repository root, outside one the cwd stands for it.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : summary-path.ts beside it and viber/lib/ three directories up.
#   writes : summary-path.ts creates <root>/.temp/viber/intent/ when absent;
#            nothing else is written.
#   stdout : what summary-path.ts prints:
#            NEXT: write | path: <root>/.temp/viber/intent/summary-<YYYY-MM-DD-HH-MM-SS>.md
#   stderr : one error: line when the exit is 2.
#   exit   : that of summary-path.ts: 0; 2 with any argument or when the
#            directory cannot be created (stdout empty). 127 with no `node` on
#            PATH.
#
set -u

exec node "${0%/*}/summary-path.ts" "$@"

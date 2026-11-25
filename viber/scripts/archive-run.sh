#!/usr/bin/env bash
#
# archive-run.sh - moves a finished run's lasting work out of the runs directory
# and into the archive, and commits the move: the wrapper that runs
# archive-run.ts beside it.
#
# It exists as a script rather than as a few lines in an agent because the
# operation is fixed, and a hand-composed `git mv` plus `git rm` deletes the wrong
# tree when the run is not shaped the way the caller assumed. The gates, the move
# and the commit live in archive-run.ts and viber/lib/archive-run.ts, never here,
# so `closeout` keeps this call line while they are tested in process.
#
# Contract:
#   argv   : $1 run directory (REQUIRED). Handed to archive-run.ts as given; how it
#            is read is defined in its header. Under Git Bash the MSYS runtime
#            hands node a `/c/...` argument as `C:/...`.
#   cwd    : any directory inside the host repository (archive-run.ts resolves the
#            root, which the argument is relative to); outside a repository the
#            cwd is the base.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : archive-run.ts and viber/lib/ beside it, found from the invoked path
#            with either separator (a C:\ spelling included).
#   writes : what archive-run.ts writes: the move, the removals and the commit.
#   stdout : what archive-run.ts prints: the one ARCHIVED: line, nothing on a
#            refusal; git's own output goes to stderr.
#   exit   : that of archive-run.ts: 0; 1 a file step failed; 2 unusable argv; 3
#            the destination exists; 4 the run is unfinished; 5 a git step failed.
#            127 with no `node` on PATH, nothing touched.
#
set -u

exec node "${0%[/\\]*}/archive-run.ts" "$@"

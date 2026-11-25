#!/bin/sh
# viber - skills/code-auditor/scripts/worktree.sh
# Clean-checkout verification worktree lifecycle for hunter / critic runs: the
# wrapper that runs worktree.ts beside it, which holds every guard but one and
# every recovery (core in viber/lib/worktree.ts).
#
# The one guard kept here is the path "/": under Git Bash the MSYS runtime would
# hand node the directory Git is installed in, which no later guard can tell from
# a worktree path, and `remove` would delete it.
#
# IN : add|remove <target-root> <worktree-path>, handed to worktree.ts as given;
#      how they are read is defined in its header. Under Git Bash the MSYS runtime
#      hands node a `/c/...` argument as `C:/...`, which the printed line then
#      carries. The cwd is irrelevant. env: PATH must resolve `node` (22.18 or
#      newer, which runs a .ts file).
# OUT: exactly one line on stdout -
#        WORKTREE_READY <worktree-path>     add succeeded and was verified
#        WORKTREE_REMOVED <worktree-path>   remove succeeded and was verified
#        WORKTREE_FAILED <reason>           neither could be achieved
#      exit 0 on READY / REMOVED, 1 on FAILED. git's own stderr is relayed on
#      stderr for diagnosis. With no `node` on PATH nothing on stdout, exit 127.
set -u

case "${3:-}" in
  /*[!/.]*) ;;
  /*)
    printf 'WORKTREE_FAILED refusing to operate on a filesystem root: %s\n' "$3"
    exit 1
    ;;
esac

exec node "${0%[/\\]*}/worktree.ts" "$@"

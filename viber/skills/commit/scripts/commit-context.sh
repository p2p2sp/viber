#!/usr/bin/env bash
#
# commit-context.sh - prints the context the commit fork composes its message
# from: the wrapper that runs commit-context.ts beside it.
#
# It exists so the fork gets everything in one `!` preload instead of composing
# git calls itself, and so the set it measures is read by the same module
# (lib/commit-args.ts) commit.ts stages with. Every printed line lives in
# commit-context.ts and lib/commit-context.ts, never here.
#
# Usage:
#   commit-context.sh [selector]
#
# Contract:
#   argv   : $1 selector (optional) - the skill's whole raw argument string,
#            handed to commit-context.ts as given. SKILL.md passes it
#            single-quoted ('$ARGUMENTS'): Claude Code substitutes the text before
#            the shell runs, so only single quotes keep $, backticks and
#            backslashes literal - an apostrophe in the arguments breaks the
#            preload.
#   cwd    : any directory inside the repository to commit in; commit-context.ts
#            moves to its root.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : commit-context.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and lib/ beside
#            it.
#   writes : nothing.
#   stdout : what commit-context.ts prints: the RUN: or STOP: line, then the
#            context sections. When node is absent or fails, one STOP: line
#            saying so: the fork commits nothing without a directive.
#   exit   : ALWAYS 0: a non-zero exit in a `!` preload aborts the skill load.
#
set -u

node "${0%[/\\]*}/commit-context.ts" "$@" 2>/dev/null || echo "STOP: Nothing committed - node 22.18 or newer is not on PATH"

exit 0

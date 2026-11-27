#!/usr/bin/env bash
#
# commit.sh - runs the git commit with the message it is handed: the wrapper that
# runs commit.ts beside it.
#
# It exists so the commit skill's one write to history is a single command to
# the permission engine rather than an add-then-commit pair the model composes
# per call, and so a model never decides whether its commit landed. How the
# selector is read, what is staged and the result line live in commit.ts and
# lib/commit.ts, never here, so the skill keeps this call line while they
# are tested in process.
#
# Usage:
#   commit.sh <message> [selector...]
#
# Contract:
#   argv   : $1 message (REQUIRED), $2.. selector (optional). Handed to commit.ts
#            as given; how they are read is defined in its header. Under Git Bash
#            the MSYS runtime hands node an argument that is one `/c/...` path as
#            `C:/...`.
#   cwd    : any directory inside the repository the commit lands in: the cwd IS
#            the contract. commit.ts moves to its root and reads every relative
#            path from there, never from the cwd.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : commit.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and lib/ beside
#            it.
#   writes : what commit.ts writes: the index, the commit and staged exec bits.
#   stdout : what commit.ts prints: one line, the result, or nothing on a git
#            failure, whose own output goes to stderr.
#   exit   : that of commit.ts: 0 on a commit and on "Nothing to commit"; 1 on a
#            missing message; 3 when none of the named paths exists; otherwise
#            git's own non-zero status. 127 with no `node` on PATH, nothing
#            committed.
#
set -u

exec node "${0%[/\\]*}/commit.ts" "$@"

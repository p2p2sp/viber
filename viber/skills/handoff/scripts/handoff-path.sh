#!/usr/bin/env bash
#
# handoff-path.sh - resolves where the handoff skill writes its file, and on
# which branch the conversation stands: the wrapper that runs handoff-path.ts
# beside it.
#
# It exists because the model does not know the current time to the second,
# and the stamp, the repository root and the path forms are a fixed format, not
# a judgement. It is the skill's `!` preload, so it resolves once, before the
# model reads a word of the body. The target rules and the four lines live in
# handoff-path.ts and lib/handoff-path.ts, never here, so the skill keeps
# this call line while the path is tested in process.
#
# Contract:
#   argv   : $1 optional, the first word of the skill arguments (`$0`). Handed
#            to handoff-path.ts as given; which word names a path and how it is
#            resolved are defined in the header of handoff-path.ts. Under Git
#            Bash the MSYS runtime hands node an MSYS form (`/c/x`) as `C:/x`.
#   cwd    : any directory inside the host project - handoff-path.ts resolves
#            the repository root itself; outside a repository the cwd is the
#            root.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : handoff-path.ts beside it and lib/ beside it.
#   writes : nothing.
#   stdout : what handoff-path.ts prints: the four lines FILE=, EXISTS=,
#            BRANCH= and TARGET=. Nothing when node is absent or fails: a
#            missing Node never breaks a preload.
#   stderr : always empty.
#   exit   : ALWAYS 0. A non-zero exit in a `!` preload aborts the skill load.
#
set -u

command -v node >/dev/null 2>&1 || exit 0
node "${0%[/\\]*}/handoff-path.ts" "$@" 2>/dev/null || true

exit 0

#!/usr/bin/env bash
#
# extension.sh - the facts and the one write the `extension` skill needs: which
# agents the host project has, which of them carry the extension marker, what
# `build.extensions` lists, and the registration of one more name: the wrapper
# that runs extension.ts beside it.
#
# It exists because the skill must not parse `.claude/viber.yml` or read every
# agent file itself. The map rule, the report lines and the insertion live in
# extension.ts and viber/lib/extension.ts, never here, so the skill keeps this
# call line while the rules are tested in process.
#
# Contract:
#   argv   : none, or `--add <name>`. Handed to extension.ts as given; how they
#            are read is defined in the header of extension.ts.
#   cwd    : any directory inside the host project - extension.ts resolves the
#            repository root itself; outside a repository the cwd is the base.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : extension.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and viber/lib/ three
#            directories up.
#   writes : what extension.ts writes: under `--add`, two lines into
#            <root>/.claude/viber.yml.
#   stdout : what extension.ts prints: the CONFIG=, LISTED=, MISSING= and AGENT=
#            lines, or one STATUS= line under `--add`. Nothing when node is
#            absent or fails: a missing Node never breaks a preload.
#   stderr : always empty.
#   exit   : ALWAYS 0. A non-zero exit in a `!` preload aborts the skill load.
#
set -u

command -v node >/dev/null 2>&1 || exit 0
node "${0%[/\\]*}/extension.ts" "$@" 2>/dev/null || true

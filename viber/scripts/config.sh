#!/usr/bin/env bash
#
# config.sh - resolves the .claude/viber.yml switches into the block a skill
# preloads when it loads: the wrapper that runs config.ts beside it.
#
# It exists because a grep|sed YAML parser is a compound command, and Claude
# Code asks for approval on every member of one - which stalls the step on any
# permission mode that does not auto-accept everything. One script is ONE
# command to the permission engine, and `implementor` can read the file no other
# way: that skill's body forbids it to open a file. The key grammar lives in
# the header of config.ts, never here, so every caller keeps this call line
# while the parser is tested in process.
#
# Contract:
#   argv   : none -> the block. `--branching`, `--red-check`, `--questions` or
#            `--specifications` -> that report in place of the block. Handed to
#            config.ts as given; the grammar and every stdout line are defined
#            in the header of config.ts.
#   cwd    : any directory inside the host project - config.ts resolves the
#            repository root itself, so the caller's cwd is irrelevant.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : config.ts and viber/lib/ beside it; the config files are read by
#            config.ts alone.
#   stdout : what config.ts prints. Nothing when node is absent or fails: a
#            missing Node never breaks a preload.
#   exit   : ALWAYS 0 (fail-open - a non-zero exit in a `!` preload would abort
#            the whole skill load).
#
set -u

command -v node >/dev/null 2>&1 || exit 0
node "${0%[/\\]*}/config.ts" "$@" 2>/dev/null || true

exit 0

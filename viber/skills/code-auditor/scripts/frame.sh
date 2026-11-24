#!/bin/sh
# viber - skills/code-auditor/scripts/frame.sh
# Frames a code-auditor run: reads the argument tokens, settles the lens and the
# scope, runs every check of the Frame phase and, on a framed run, writes the
# run workspace and run.md: the wrapper that runs frame.ts beside it.
#
# Why it exists: classifying the tokens, resolving a directory against the
# repository root, reading the lens's `Worktree:` line and writing run.md were
# prose the model re-derived on every run. The token rules, every check and
# every stdout line live in frame.ts and viber/lib/frame.ts, never here, so the
# skill keeps this call line while the rules are tested in process.
#
# Contract:
#   argv   : the tokens of $ARGUMENTS. Handed to frame.ts as given; how each is
#            read is defined in the header of frame.ts. Under Git Bash the MSYS
#            runtime hands node a `/c/...` directory token as `C:/...`, and a
#            stop line then names that spelling.
#   cwd    : the session's directory; frame.ts resolves the repository root
#            from it.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : frame.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and viber/lib/ three
#            directories up.
#   files  : what frame.ts writes: on a framed run <ws>/reports/,
#            <ws>/worktrees/ and <ws>/run.md under
#            <root>/.temp/viber/code-auditor/.
#   stdout : what frame.ts prints: exactly one `NEXT:`, `ASK:`, `STOP:` or
#            `RUN:` answer.
#   exit   : that of frame.ts: 0 in every case. 127 with no `node` on PATH.
set -u

exec node "${0%[/\\]*}/frame.ts" "$@"

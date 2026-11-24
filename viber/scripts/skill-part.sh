#!/usr/bin/env bash
#
# skill-part.sh - prints one part file of a skill, each switch fragment block in
# it replaced by the fragment of the configured switch value: the wrapper that
# runs skill-part.ts beside it.
#
# It exists because a `!` preload runs only when the skill loads, so text a
# skill needs late (and sometimes never) was held in every turn before it. That
# text lives in <skill dir>/parts/<part>.md, and the skill prints it with one
# call when it reaches the step. The block shape, the fragment selection and the
# placeholder expansion live in skill-part.ts and viber/lib/skill-part.ts, never
# here, so every caller keeps this call line while the part is tested in process.
#
# Contract:
#   argv   : <skill dir> <part>. Handed to skill-part.ts as given; the part name
#            pattern, the block shape and the stdout are defined in the header of
#            skill-part.ts. Under Git Bash the MSYS runtime hands node a `/c/...`
#            skill dir as `C:/...`, and the placeholders expand to that spelling.
#   cwd    : any directory inside the host project (skill-part.ts resolves the
#            config from it).
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : skill-part.ts and viber/lib/ beside it; the part, the config files
#            and the fragments are read by skill-part.ts alone.
#   stdout : what skill-part.ts prints: the part with its fragment blocks
#            resolved and both root placeholders expanded.
#   stderr : error: <reason>, one line, on exit 1 only.
#   exit   : that of skill-part.ts: 0 printed; 1 on a missing argument, a name
#            outside its pattern or an absent part file, nothing on stdout. 127
#            with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/skill-part.ts" "$@"

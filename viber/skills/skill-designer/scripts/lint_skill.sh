#!/usr/bin/env bash
#
# lint_skill.sh - lints a skill directory (one holding SKILL.md) or a single
# agent or skill .md file: the wrapper that runs lint_skill.ts beside it.
#
# It exists because the platform caps and the style rules of skill-designer are
# mechanical, and one linter reports each break the same way. Every rule and
# every stdout line live in lint_skill.ts and lib/lint_skill.ts, never
# here, so the skill and the lint job keep this call line while the rules are
# tested in process.
#
# Contract:
#   argv   : <skill-dir | file.md>. Handed to lint_skill.ts as given; what each
#            form lints is defined in the header of lint_skill.ts. Under Git
#            Bash the MSYS runtime hands node a `/c/...` path as `C:/...`, and
#            the printed paths then carry that spelling.
#   cwd    : irrelevant beyond resolving a relative argument.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : lint_skill.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and lib/ beside it.
#   writes : nothing.
#   stdout : what lint_skill.ts prints: the `FAIL` and `WARN` lines, then
#            `FAIL=<n> WARN=<m>`.
#   stderr : the usage line when the exit is 2.
#   exit   : that of lint_skill.ts: 0 with no FAIL line, 1 with at least one,
#            2 on a missing argument. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/lint_skill.ts" "$@"

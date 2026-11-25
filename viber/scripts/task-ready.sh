#!/usr/bin/env bash
#
# task-ready.sh - says which tasks of a landed plan may run now, and remembers
# which task waited on which path of which other task: the wrapper that runs
# task-ready.ts beside it.
#
# The session that builds a plan opens no file and judges nothing about the
# order of its tasks: task-step.sh asks this script on its behalf. When a task
# may start, what a collision of two tasks becomes and every stdout line live in
# task-ready.ts and viber/lib/task-ready.ts, never here, so task-step.sh keeps
# this call line while the rules are tested in process.
#
# Contract:
#   argv   : <plan-file> ready --started <mark> [--flight <id>,..]
#            [--held <id>,..] [--waiting <id>,..], or <plan-file> wait <id>
#            --started <mark> <path>[,<path>]. Handed to task-ready.ts as given;
#            how they are read is defined in the header of task-ready.ts. Under
#            Git Bash the MSYS runtime hands node a `/c/...` argument as
#            `C:/...`, and an error: line then names that spelling.
#   cwd    : any directory inside the repository: a relative plan path resolves
#            against it, and the waits file lives under the repository root.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : task-ready.ts and viber/lib/ beside it, found from the invoked path
#            with either separator (a C:\ spelling included).
#   writes : what task-ready.ts writes: under "wait" the file
#            <root>/.temp/viber/waits, else nothing.
#   stdout : what task-ready.ts prints: the `start:` and `retry:` lines or
#            `none` under "ready"; the `wait:`, `sequence:`, `blocked:` and
#            `unclaimed:` lines under "wait".
#   stderr : one `error: ...` line on exit 2.
#   exit   : that of task-ready.ts: 0 the answer was printed; 2 unusable argv, a
#            missing plan, an id the plan does not hold or a waits file that
#            could not be written. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/task-ready.ts" "$@"

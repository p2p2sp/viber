#!/bin/sh
#
# attach-lines.sh - turns the paths a skill received into the `Attachment:` lines
# of its hand-off: the wrapper that runs attach-lines.ts beside it.
#
# It exists because `intent` and `fixer` decided from prose which of the paths
# their input names sat under `.temp/`, and spelled each absolute path with
# forward slashes and a Windows drive by hand; a wrong call dropped an attachment
# or wrote a path the planner could not land. The check lives in attach-lines.ts
# and viber/lib/attach-lines.ts, never here, so every caller keeps this call line
# while the check is tested in process.
#
# Contract:
#   argv   : one or more paths, each a file or a directory, absolute or relative.
#            Handed to attach-lines.ts as given; how a path is read and every
#            stdout line are defined in the header of attach-lines.ts. Under Git
#            Bash the MSYS runtime hands node a `/c/...` argument as `C:/...`.
#   cwd    : resolves a relative argument and locates the repository; any
#            subdirectory of the repository works.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : attach-lines.ts and viber/lib/ beside it.
#   stdout : what attach-lines.ts prints: one `Attachment: <absolute path>` line
#            per argument under <repository root>/.temp/, or nothing.
#   exit   : that of attach-lines.ts: 0 with the lines, none included; 2 with one
#            `error: attach-lines.sh: ...` line on stderr and an empty stdout with
#            no argument or outside a git repository. 127 with no `node` on PATH.
#
set -u

exec node "${0%[/\\]*}/attach-lines.ts" "$@"

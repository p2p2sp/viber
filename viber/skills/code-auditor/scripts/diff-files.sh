#!/bin/sh
# viber - skills/code-auditor/scripts/diff-files.sh
# Prints the diff base and the changed files of the "current diff" audit scope:
# the wrapper that runs diff-files.ts beside it.
#
# Why it exists: the audit scope "the current diff" has edge cases a model gets
# wrong when it improvises them (the default branch, unpushed commits on it, a
# detached HEAD, an orphan branch, a repository with no commit, deleted files).
# The base rules and every stdout line live in diff-files.ts and
# viber/lib/diff-files.ts, never here, so a shell caller keeps this call line
# while the rules are tested in process. The frame core calls that core in
# process, never through this wrapper.
#
# Contract:
#   argv   : <repo-root> [<base>]. Handed to diff-files.ts as given; the base
#            rules and how both are read are defined in the header of
#            diff-files.ts. Under Git Bash the MSYS runtime hands node a `/c/...`
#            <repo-root> as `C:/...`, and `NOT_A_REPO` then names that spelling.
#   cwd    : irrelevant: it only ever resolves a relative <repo-root>.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   file   : diff-files.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and viber/lib/ three
#            directories up.
#   files  : none written.
#   stdout : what diff-files.ts prints: the `BASE` line and the changed paths,
#            or the single line `NOT_A_REPO <repo-root>` or `BAD_BASE <base>`.
#   exit   : that of diff-files.ts: 0 on success; 1 with the `NOT_A_REPO` or
#            `BAD_BASE` line; 2 on a missing <repo-root>, the usage on stderr.
#            127 with no `node` on PATH.
set -u

exec node "${0%[/\\]*}/diff-files.ts" "$@"

The 5 failures were test-environment faults on Windows, not commit.sh/commit-context.sh bugs (both already export GIT_LITERAL_PATHSPECS).
- Bracket/glob cases: Git Bash's MSYS runtime expands '*', '?', '[...]' in argv from a native parent (node), so the script got 'app/i/page.tsx'. Fixed in tests/harness/run.ts with MSYS=noglob, only when an arg has a glob char and no double quote (noglob breaks the P2P2_ARGV -c preamble: 'exec: $P2P2_ARGV_SHELL : not found').
- core.fileMode=true exec-bit cases: NTFS has no exec bit, chmod is a no-op, so they now skip on win32 like the matching commit-task.test.ts cases.
- The uncommitted `Shell` type edits in the commit*/issue-create tests were already in the tree, left as they were.

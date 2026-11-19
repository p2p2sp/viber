run-branch.sh is sourced, so decide_root reads the spelling from its own sourced path (run_branch_dir, taken from plan-path.sh's BASH_SOURCE), not from `$0`: both carry the invoked spelling.
A plan-path.sh invoked by a relative path now prints a relative root (C1: "." / "./.."), where the old pwd form printed an absolute one.
The two new AC1 tests per file skip off Windows: the /c/ and C:\ spellings only exist under Git Bash. Red run: only the /c/ cases failed, the C:\ cases already passed through cygpath -m / pwd -W.

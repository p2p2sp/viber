---
paths:
  - "viber/scripts/*.sh"
  - "viber/hooks/scripts/*.sh"
  - "viber/skills/*/scripts/*.sh"
  - ".github/scripts/*.sh"
---

# Git exec bit on a new shell script

- `core.fileMode` is per checkout: `false` on Windows (Git for Windows sets it at init), usually
  `true` on macOS and Linux. Under `false`, `git add` stages a brand-new `.sh` file 100644 whatever
  the filesystem bit; under `true`, `git add` or `git add -u` reads the mode from disk and drops a
  100755 the index held over a 0644 file. Right after creating a script that must ship 100755, run
  `git update-index --add --chmod=+x <path>`; `viber/scripts/commit-task.sh` (`sync_tree_modes`)
  then gives the file on disk that exec bit before it stages, so its commit keeps 100755 under
  either value; `tests/viber/commit-task.test.ts` runs every commit form under both.
- Verify the recorded mode, not the filesystem: `git ls-files -s <path>` must read `100755`. The
  filesystem bit means nothing on a Windows checkout either way.
- If another in-flight task's `git add -A` sweeps an in-progress copy of the file into ITS commit
  first, that commit lands the file at 100644; the exec bit then only shows up once the script's
  own commit lands as a modification on top. Check `git ls-files -s` after the commit that is
  meant to own the file, not an earlier one that happened to include it.

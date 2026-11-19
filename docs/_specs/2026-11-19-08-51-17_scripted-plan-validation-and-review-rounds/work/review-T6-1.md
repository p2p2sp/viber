- Blocking [task] viber/skills/planner/scripts/review-round.sh:1 - the working-tree file is mode 100644 (`ls -l` shows `-rw-r--r--`, `git diff` shows `old mode 100755 / new mode 100644` against the index), so committing it records 100644 while `Delivers` requires mode 100755
  Restore the exec bit on the working-tree file (`chmod +x`, plus `git update-index --chmod=+x` on Windows) so the committed mode is 100755.
- Blocking [task] docs/_specs/2026-11-19-08-51-17_scripted-plan-validation-and-review-rounds/work/T6-notes.md:1 - untracked scratch file left in the tree by this task's coder (holds only `placeholder`; the notes say it was created by mistake)
  Report it on the coder's `SCRATCH:` line.
- Minor viber/skills/planner/scripts/review-round.sh:247 - a failing `config.sh` is swallowed (`2>/dev/null || true`) and the block silently prints `memory: false`
  Consider failing with an `error:` line when `config.sh` exits non-zero, instead of defaulting the memory value.

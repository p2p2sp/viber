VERDICT: RULED
RULING: leave uncommitted
WHY: It is the only option. repair-2-coder.md says the T1 fix for viber/scripts/skill-part.sh is a mode-only change (to 100755) staged with git update-index --chmod=+x under core.fileMode false, and commit-task.sh found no changes twice, so (inference) it does not see an index-only mode change.
COST: skill-part.sh stays at 100644 in HEAD, so the portability exec-bit test keeps failing until someone commits the staged mode change by hand.

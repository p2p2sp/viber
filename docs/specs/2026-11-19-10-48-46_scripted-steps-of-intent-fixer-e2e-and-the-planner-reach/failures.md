# Failures

- task | review-T9-1 | viber/scripts/arg-kind.sh:1 - the working-tree file has mode 100644 while the index holds 100755 (`git diff` shows `old mode 100755 / new mode 100644`), so committing the working tree drops the exec bit that Verification (`git ls-files -s` -> 100755) and every other script require; the check passes only on the stale staged mode

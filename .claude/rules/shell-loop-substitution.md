---
paths:
  - "viber/scripts/*.sh"
  - "viber/hooks/scripts/*.sh"
  - "viber/skills/*/scripts/*.sh"
---

# Shell loop over command output

- Feed a `while read` loop through process substitution (`done < <(cmd)`), never a piped
  `cmd | while read` and never a heredoc. A pipe forks the loop body into a subshell, so any
  variable it sets is gone once the loop exits; a heredoc is forbidden outright (root
  `CLAUDE.md`). `viber/scripts/commit-task.sh:503` runs
  `done < <(git_paths ls-files -z -- "$@")` so the array (`tracked`) it fills inside the loop
  still holds once it exits; the same shape covers `viber/scripts/check-playwright.sh` and
  `viber/skills/commit/scripts/commit.sh`.

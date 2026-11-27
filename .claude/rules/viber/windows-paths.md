---
paths:
  - "viber/**/*.ts"
---

# Paths from outside

- Turn every `\` to `/` in a path from argv, cwd, git, a plan line or an agent's `FILES:`, and test absolute as `/` or `^[A-Za-z]:`, never `path.isAbsolute`: the scripts run under Git Bash on Windows and compare paths as text.

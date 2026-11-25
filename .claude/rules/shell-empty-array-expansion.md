---
paths:
  - "viber/scripts/*.sh"
  - "viber/hooks/scripts/*.sh"
  - "viber/skills/*/scripts/*.sh"
---

# Expand a possibly-empty array under set -u

- Expand a bash array that may be empty or unset as `${arr[@]+"${arr[@]}"}`, never a bare
  `"${arr[@]}"`: under `set -u`, bash 3.2 (macOS's shipped `/bin/bash`) treats an empty array as
  an unbound variable and aborts, where bash 5.x does not. `viber/scripts/run-branch.sh:134`
  (`for b in ${br_bases[@]+"${br_bases[@]}"}; do`, with the same shape at its other array loops)
  matches `viber/scripts/commit-task.sh:431`.
- The break only shows up under bash 3.2, and CI runs no macOS leg, so a bare `"${arr[@]}"`
  that passes on the Linux/Windows legs can still ship broken.

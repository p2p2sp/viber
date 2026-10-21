---
paths:
  - "viber/scripts/*.sh"
  - "viber/hooks/scripts/*.sh"
  - "viber/skills/*/scripts/*.sh"
---

# No apostrophe inside a single-quoted awk block

- An awk program embedded as a single-quoted bash argument cannot contain an apostrophe
  anywhere inside it, comments included: the apostrophe closes the shell's own quoting early, so
  the rest of the block reads as loose shell text - a cryptic `syntax error near unexpected
  token` far below the real cause, or a silently truncated program. `viber/scripts/plan-index.sh:1202`
  inline-documents the trap ("No apostrophe anywhere in here: this comment sits INSIDE the
  single-quoted awk program, where one would close the quote."); the same constraint holds in
  `viber/hooks/scripts/plan-gate.sh`'s `pair_raw` awk block and in `viber/scripts/plan-path.sh`'s
  `awk '...'` blocks. Reword around the possessive ("a task Verification text", not "a task's
  Verification text") rather than trying to escape the quote (`'\''`) inside the block, and
  confirm with `bash -n <script>` after every edit to one of these blocks.

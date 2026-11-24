#!/usr/bin/env bash
# lint-skills.sh - run the skill lint over every skill and agent of viber, failing on a new FAIL line.
#
# Runs viber/skills/skill-designer/scripts/lint_skill.sh on each directory of viber/skills/ and each
# file of viber/agents/, drops every output line naming a CLAUDE memory file, and compares each
# remaining FAIL line with the exceptions file.
#
# Why: the lint was run by hand, so a new violation reached main unseen. CI runs this script in the
# lint job; a FAIL the project accepts is recorded, with its reason, in the exceptions file instead
# of weakening the lint.
#
# Contract:
#   argv:   $1 optional, the exceptions file; default tools/lint/skill-exceptions.txt under the
#           repository root. An unreadable path counts as an empty file (so /dev/null holds none).
#   cwd:    irrelevant, the script moves to the repository root (two levels above its own
#           directory) so every printed path is repo-relative.
#   env:    none read.
#   file:   the exceptions file holds `#` comment lines, blank lines and exact `FAIL <path>: <text>`
#           lines; only a FAIL line equal to one of them is an exception.
#   stdout: each FAIL line not in the exceptions file, then one last line
#           `lint-skills: <n> known exceptions, <m> new failures`.
#   exit:   0 when there is no new failure, 1 when there is at least one, 2 when the lint script
#           is missing.

set -u

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root" || exit 2
lint="viber/skills/skill-designer/scripts/lint_skill.sh"
[ -f "$lint" ] || { echo "lint-skills: $lint missing" >&2; exit 2; }

exceptions="${1:-tools/lint/skill-exceptions.txt}"
[ -r "$exceptions" ] || exceptions="/dev/null"

known=0
new=0

check_target() {
  out="$(bash "$lint" "$1" 2>&1 || true)"
  while IFS= read -r line; do
    case "$line" in
      "FAIL "*) ;;
      *) continue ;;
    esac
    case "$line" in *CLAUDE*) continue ;; esac
    if grep -Fxq -- "$line" "$exceptions"; then
      known=$((known + 1))
    else
      echo "$line"
      new=$((new + 1))
    fi
  done < <(printf '%s\n' "$out")
}

for d in viber/skills/*/; do
  [ -d "$d" ] && check_target "${d%/}"
done
for f in viber/agents/*.md; do
  [ -f "$f" ] && check_target "$f"
done

echo "lint-skills: $known known exceptions, $new new failures"
[ "$new" -eq 0 ]

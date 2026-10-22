#!/usr/bin/env bash
#
# switch-text.sh - prints the skill fragment matching one .claude/viber.yml
# switch value, so a loaded skill holds only the instructions of the
# configuration the project turned on.
#
# It exists because a skill body branching on a switch makes the model read and
# track the text of every feature the project turned off. Each switch-dependent
# passage lives in its own fragment file, one per state that does something, and
# the skill preloads it through this script at the place the text belongs. The
# script only SELECTS the file; it never composes text. The value comes from
# config.sh, the one parser of viber.yml, so a fragment follows exactly the value
# every other preload sees.
#
# A preload's output is never substituted by Claude Code, so the two root
# placeholders a fragment may carry are expanded here: the skill directory is
# handed in, and the plugin root is derived from it (a skill lives at
# <plugin root>/skills/<name>).
#
# Contract:
#   argv   : <key> <skill dir> <name>.
#            key  : planning.adr | planning.outside-plan-review |
#                   build.baseline-tests | build.final-review |
#                   build.memory | build.rules | build.qa | build.cleanup |
#                   build.red-check | github.issues
#                   (value true | false, except build.baseline-tests: off |
#                   fast | full) or
#                   branching.mode (value off | allowed | required) - the
#                   value config.sh prints for it - or
#                   build.extensions (value off | on, derived from two
#                   config.sh lines: off when `build.extensions` and
#                   `build.extensions-missing` both read none; otherwise on, so
#                   a list of missing names alone never reads off).
#                   A flat key (`memory`) is an unknown key.
#            name : [a-z0-9-]+.
#            A missing or empty argument, an unknown key or a name outside its
#            pattern -> nothing printed.
#   cwd    : any directory inside the host project - config.sh resolves the
#            repository root itself, so a session started in a subdirectory
#            still reads the repository's config.
#   env    : none.
#   file   : <skill dir>/fragments/<name>.<value>.md (optional; absent ->
#            nothing printed).
#   stdout : that file's content, every literal ${CLAUDE_SKILL_DIR} replaced by
#            <skill dir> and every literal ${CLAUDE_PLUGIN_ROOT} by <skill dir>
#            without its last two path segments (separator / or \, a trailing
#            separator ignored). Nothing else, ever.
#   exit   : ALWAYS 0 - it runs as a `!` preload, where a non-zero exit aborts
#            the whole skill load.
#
set -u

key="${1:-}"
skill_dir="${2:-}"
name="${3:-}"

case "$key" in
  planning.adr|planning.outside-plan-review) ;;
  build.baseline-tests|build.final-review|build.memory|build.rules|build.qa|build.cleanup|build.red-check) ;;
  github.issues|branching.mode|build.extensions) ;;
  *) exit 0 ;;
esac
case "$name" in
  ''|*[!a-z0-9-]*) exit 0 ;;
esac
[ -n "$skill_dir" ] || exit 0

here="$(dirname -- "${BASH_SOURCE[0]}")"
block="$(bash "$here/config.sh" 2>/dev/null || true)"
if [ "$key" = build.extensions ]; then
  found="$(printf '%s\n' "$block" | grep -E '^build\.extensions: ' || true)"
  missing="$(printf '%s\n' "$block" | grep -E '^build\.extensions-missing: ' || true)"
  [ -n "$found" ] && [ -n "$missing" ] || exit 0
  if [ "${found#build.extensions: }" = none ] && [ "${missing#build.extensions-missing: }" = none ]; then
    value=off
  else
    value=on
  fi
else
  line="$(printf '%s\n' "$block" | grep -E "^${key}: " || true)"
  value="${line#"$key: "}"
fi
case "$value" in
  ''|*[!a-z]*) exit 0 ;;
esac

file="$skill_dir/fragments/$name.$value.md"
[ -f "$file" ] || exit 0

# The trailing `x` keeps the file's own trailing newlines, which a command
# substitution would otherwise strip.
content="$(cat -- "$file" 2>/dev/null; printf x)"
content="${content%x}"

# Both sides of each replacement are quoted: the pattern then matches literally,
# and bash 5.2 leaves an `&` in the path alone instead of reading it as the
# matched text. A trailing separator is dropped before the two segments are.
plugin_root="${skill_dir%[/\\]}"
plugin_root="${plugin_root%[/\\]*}"
plugin_root="${plugin_root%[/\\]*}"
skill_token='${CLAUDE_SKILL_DIR}'
root_token='${CLAUDE_PLUGIN_ROOT}'
content=${content//"$skill_token"/"$skill_dir"}
content=${content//"$root_token"/"$plugin_root"}

printf '%s' "$content"
exit 0

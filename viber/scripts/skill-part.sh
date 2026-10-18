#!/usr/bin/env bash
#
# skill-part.sh - prints one part file of a skill, each switch fragment block in
# it replaced by the fragment `switch-text.sh` selects, so a skill loads a long
# stretch of its instructions on demand instead of holding it in context from
# the start.
#
# It exists because a `!` preload runs only when the skill loads, so text a
# skill needs late (and sometimes never) was held in every turn before it. That
# text now lives in <skill dir>/parts/<part>.md, and the skill prints it with
# one call when it reaches the step. A part keeps the fenced `switch-text.sh`
# calls it would have carried as preloads; this script runs them in place, so
# the part reaches the model exactly as the preloads would have produced it.
# Only the call shape below is ever run: any other fenced block is plain text.
# Placeholders are expanded here for the reason switch-text.sh states: nothing
# substitutes the output of a command.
#
# Contract:
#   argv   : <skill dir> <part>
#            skill dir : the skill's directory as passed, never canonicalised.
#            part      : [a-z0-9-]+.
#            <plugin root> is <skill dir> without its last two path segments
#            (separator / or \, a trailing separator ignored), as switch-text.sh
#            derives it.
#   cwd    : any directory inside the host project (switch-text.sh resolves the
#            config).
#   env    : none.
#   file   : <skill dir>/parts/<part>.md.
#   stdout : that file's content, where every fenced block whose opening line is
#            ```! and whose only body line is
#            "${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" <key> "${CLAUDE_SKILL_DIR}" <name>
#            is replaced, fence lines included, by the stdout of
#            switch-text.sh <key, quotes stripped> <skill dir> <name>;
#            every other line verbatim; then every literal ${CLAUDE_SKILL_DIR}
#            replaced by <skill dir> and every literal ${CLAUDE_PLUGIN_ROOT} by
#            <plugin root>. A trailing carriage return is ignored when matching
#            a line.
#   stderr : error: <reason>, one line, on exit 1 only.
#   exit   : 0 printed; 1 on a missing argument, a name outside its pattern or
#            an absent part file, nothing on stdout.
#
set -u

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

skill_dir="${1:-}"
part="${2:-}"
[ -n "$skill_dir" ] || fail "usage: skill-part.sh <skill dir> <part>"
[ -n "$part" ] || fail "usage: skill-part.sh <skill dir> <part>"
case "$part" in
  *[!a-z0-9-]*) fail "part name must match [a-z0-9-]+: $part" ;;
esac
file="$skill_dir/parts/$part.md"
[ -f "$file" ] || fail "no such part file: $file"

here="$(dirname -- "${BASH_SOURCE[0]}")"

# Both sides of each replacement are quoted: the pattern then matches literally,
# and bash 5.2 leaves an `&` in the path alone instead of reading it as the
# matched text. A trailing separator is dropped before the two segments are.
plugin_root="${skill_dir%[/\\]}"
plugin_root="${plugin_root%[/\\]*}"
plugin_root="${plugin_root%[/\\]*}"
skill_token='${CLAUDE_SKILL_DIR}'
root_token='${CLAUDE_PLUGIN_ROOT}'

open_fence='```!'
close_fence='```'
call_re='^"\$\{CLAUDE_PLUGIN_ROOT\}/scripts/switch-text\.sh" ([A-Za-z0-9._"-]+) "\$\{CLAUDE_SKILL_DIR\}" ([a-z0-9-]+)$'
cr=$'\r'
nl=$'\n'

out=''
in_block=0
block_raw=''
block_body=''
block_lines=0

# Appends text to the output with both placeholders expanded.
emit() {
  local text="$1"
  text=${text//"$skill_token"/"$skill_dir"}
  text=${text//"$root_token"/"$plugin_root"}
  out+="$text"
}

# A block that is not exactly one switch-text.sh call stays as it was written.
flush_block() {
  emit "$block_raw"
  in_block=0
  block_raw=''
}

while :; do
  if IFS= read -r line; then
    eol="$nl"
  else
    [ -n "$line" ] || break
    eol=''
  fi
  bare="${line%"$cr"}"
  if [ "$in_block" = 0 ]; then
    if [ "$bare" = "$open_fence" ]; then
      in_block=1
      block_raw="$line$eol"
      block_body=''
      block_lines=0
    else
      emit "$line$eol"
    fi
  elif [ "$bare" = "$close_fence" ]; then
    if [ "$block_lines" = 1 ] && [[ "$block_body" =~ $call_re ]]; then
      key="${BASH_REMATCH[1]//\"/}"
      name="${BASH_REMATCH[2]}"
      # The trailing `x` keeps the fragment's own trailing newlines, which a
      # command substitution would otherwise strip.
      fragment="$(bash "$here/switch-text.sh" "$key" "$skill_dir" "$name" 2>/dev/null </dev/null; printf x)"
      out+="${fragment%x}"
      in_block=0
      block_raw=''
    else
      block_raw+="$line$eol"
      flush_block
    fi
  else
    block_raw+="$line$eol"
    block_body="$bare"
    block_lines=$((block_lines + 1))
  fi
done < "$file"

# A block still open at the end of the file was never closed: plain text.
if [ "$in_block" = 1 ]; then
  flush_block
fi

printf '%s' "$out"
exit 0

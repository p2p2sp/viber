#!/usr/bin/env bash
#
# rules-map.sh - every deterministic fact about the host project's
# `.claude/rules/` directory, and the one gate in front of deleting a rule
# file.
#
# It exists because `/viber:rules` has to know what the layer IS before it asks
# the user anything: which rule is past its budget, which one declares a scope
# that matches nothing, which one is frozen, and what the whole directory costs
# a reader. Measured in the model that is character counting done in prose,
# which is how a budget report ends up wrong. The map is also a `!` preload,
# and a preload is permission-checked as ONE command: a compound `ls | wc |
# git` would ask for approval per member and stall the skill load on any mode
# that does not auto-accept.
#
# The delete lives here for the opposite reason - it has to be able to REFUSE.
# A reset is judged as a whole, one unfit target leaving every file in place,
# because a half-deleted layer is a state neither the user nor the command that
# printed them the list can describe afterwards.
#
# Contract:
#   argv   : none                  -> map mode.
#            --reset <path> [...]   -> reset mode, repo-relative paths.
#            anything else          -> refused, exit 2.
#   cwd    : any directory inside the host project - the repository root is
#            resolved here and every printed path is relative to it. Outside a
#            repository the cwd IS the root and nothing is tracked there.
#   env    : none.
#   reads  : <root>/.claude/rules/**/*.md - every file at any depth, the root
#            holding the shared rules and each subdirectory one area's, its
#            frontmatter and its size; the git index - which of them are tracked, modified or
#            untracked, and how many tracked paths a rule's globs match.
#   writes : nothing at all in map mode. In reset mode, and only once every
#            target has passed, the given files are deleted from the working
#            tree, and a subdirectory left empty by them is removed with it.
#            Nothing is ever staged and nothing is ever committed.
#   stdout : map mode, in this order. A section with nothing to report prints
#            no line at all; `total:` always prints.
#              # viber rules map
#              id: <yyyy-mm-dd-HH-mm-ss>
#              state: none | partial | complete
#              rule: <path> <chars> paths <glob>[,<glob>] matches <n> ok
#              frozen: <path> <chars>
#              dead: <path>
#              dirty: <path> modified | untracked
#              total: <chars> ok | OVER-DIR
#            `id` is this run's stamp, which the caller spends as
#            `.temp/viber/<id>/`; it reads `unknown` only when the clock cannot
#            be read at all.
#            `state` is `none` when the directory is absent or holds no
#            non-frozen `.md`, `complete` when every non-frozen rule declares a
#            frontmatter `paths:` key, `partial` otherwise.
#            `rule:` is one line per non-frozen `.md`, alphabetical by full
#            path, so an area's rules print together. `paths`
#            carries the declared globs comma-separated, or `none` when the key
#            is absent or declares nothing usable - a rule Claude Code loads
#            everywhere. Then `matches <n>`, the tracked files those globs
#            really match, a `{a,b}` group matching either branch. The line
#            closes on `ok`, or `OVER-FILE` past 4000 bytes.
#            `frozen:` is one line per `_*.md`: reported, never scored, never
#            dead, never deleted.
#            `dead:` is a non-frozen rule whose globs match no tracked file -
#            never one that declares no scope, and never
#            printed at all when the repository tracks nothing, where every
#            rule would read dead and the count would say nothing about the
#            rule.
#            `dirty:` covers every `.md` in the directory, frozen included:
#            uncommitted work is a fact about the file, not a score.
#            `total:` sums every `.md`, frozen included, and closes on `ok` or
#            `OVER-DIR` past 40000 bytes.
#
#            reset mode prints one of two blocks. Refused, nothing deleted:
#              refused: <path> not-a-rule | frozen | missing | untracked | modified
#              refused: - no-target
#              refused: <arg> unknown-mode
#            or, only once every target passed:
#              removed: <path>
#              removed: <n>
#   exit   : 0 - map mode, ALWAYS, whatever it finds: it is called as a `!`
#                preload, where a non-zero exit aborts the whole skill load.
#                Also a reset that deleted every target it was given.
#            2 - unusable argv: a first argument that is not `--reset`, or
#                `--reset` with no target at all.
#            3 - the reset was refused. Nothing was deleted.
#
set -u

rules_dir=".claude/rules"
file_cap=4000
dir_cap=40000

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$root" ] || [ ! -d "$root" ]; then
  root="$(pwd)"
fi
cd "$root" || exit 0

# The globs one rule declares, one per line, empty when the file declares no
# usable `paths:` key. Only the frontmatter block is read: the first line has
# to be the opening `---` and the scan stops at the closing one, so a `paths:`
# line in the prose below is never taken for a declaration. Three spellings are
# accepted - a block sequence, a flow sequence and a comma-separated scalar -
# because Claude Code reads all three and a user writes whichever they know.
globs_of() {
  awk '
    function clean(s,   q, n) {
      gsub(/\r/, "", s)
      sub(/^[ \t]+/, "", s)
      sub(/[ \t]+$/, "", s)
      n = length(s)
      q = substr(s, 1, 1)
      if (n >= 2 && (q == "\"" || q == "\047") && substr(s, n, 1) == q) s = substr(s, 2, n - 2)
      return s
    }
    function emit(s) { s = clean(s); if (s != "") print s }
    # A comma inside a `{a,b}` group belongs to the glob, not to the list.
    function emit_list(s,   i, c, d, cur) {
      d = 0
      cur = ""
      for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (c == "{") d++
        else if (c == "}" && d > 0) d--
        else if (c == "," && d == 0) { emit(cur); cur = ""; continue }
        cur = cur c
      }
      emit(cur)
    }
    NR == 1 { if ($0 !~ /^---[ \t\r]*$/) exit; next }
    /^---[ \t\r]*$/ { exit }
    collecting {
      if ($0 ~ /^[ \t]*-[ \t]+/) { item = $0; sub(/^[ \t]*-[ \t]+/, "", item); emit(item); next }
      collecting = 0
    }
    /^paths[ \t]*:/ {
      val = $0
      sub(/^paths[ \t]*:[ \t]*/, "", val)
      val = clean(val)
      if (val == "") { collecting = 1; next }
      if (substr(val, 1, 1) == "[") {
        sub(/^\[/, "", val)
        sub(/\]$/, "", val)
      }
      emit_list(val)
      next
    }
  ' "$1"
}

# How many of the tracked paths on stdin match any of the globs in $1. The
# glob is translated to an ERE rather than handed to `case`, because a shell
# pattern lets `*` cross a `/` and would count `src/deep/c.ts` as a match for
# `src/*.ts` - which would hide a dead rule behind a file it never applies to.
# A `[` or `]` is passed through as a literal: a rule's scope is a path glob,
# not a character class. A `{a,b}` group becomes an alternation, the brace
# expansion Claude Code applies to `paths:`. The globs travel through ENVIRON,
# never `awk -v`: they are one per line, and BSD/macOS awk aborts on a `-v`
# value holding a newline ("newline in string"), which left a rule with two or
# more globs printing an empty `matches` count.
count_matches() {
  RULES_MAP_GLOBS="$1" awk '
    # Whether the `{` at position i has its closing `}`: a group without one
    # is a literal brace.
    function closes(g, i,   d, n, c) {
      d = 0
      n = length(g)
      for (; i <= n; i++) {
        c = substr(g, i, 1)
        if (c == "{") d++
        else if (c == "}" && --d == 0) return 1
      }
      return 0
    }
    function glob2re(g,   i, c, n, out, depth) {
      out = "^"
      n = length(g)
      i = 1
      depth = 0
      while (i <= n) {
        c = substr(g, i, 1)
        if (c == "{" && closes(g, i)) { out = out "("; depth++; i = i + 1; continue }
        if (c == "}" && depth > 0) { out = out ")"; depth--; i = i + 1; continue }
        if (c == "," && depth > 0) { out = out "|"; i = i + 1; continue }
        if (c == "*") {
          if (substr(g, i + 1, 1) == "*") {
            if (substr(g, i + 2, 1) == "/") { out = out "([^/]+/)*"; i = i + 3; continue }
            out = out ".*"
            i = i + 2
            continue
          }
          out = out "[^/]*"
          i = i + 1
          continue
        }
        if (c == "?") { out = out "[^/]"; i = i + 1; continue }
        if (c == "[") { out = out "[[]"; i = i + 1; continue }
        if (c == "]") { out = out "[]]"; i = i + 1; continue }
        if (index(".^$+(){}|\\", c) > 0) { out = out "\\" c; i = i + 1; continue }
        out = out c
        i = i + 1
      }
      return out "$"
    }
    BEGIN {
      n = split(ENVIRON["RULES_MAP_GLOBS"], g, "\n")
      for (i = 1; i <= n; i++) if (g[i] != "") re[++m] = glob2re(g[i])
    }
    { for (i = 1; i <= m; i++) if ($0 ~ re[i]) { c = c + 1; break } }
    END { print c + 0 }
  '
}

chars_of() {
  wc -c < "$1" 2>/dev/null | tr -dc '0-9'
}

# Whether the newline-separated list $1 holds the whole line $2. It is a `case`
# rather than a `grep` because the needle is a path: a `.` or a `*` in it would
# be a regex metacharacter, and the map would name the wrong file.
contains_line() {
  case "
$1
" in
    *"
$2
"*) return 0 ;;
  esac
  return 1
}

stamp="$(date +%Y-%m-%d-%H-%M-%S 2>/dev/null || true)"
[ -n "$stamp" ] || stamp="unknown"

# -z: without it git wraps a path holding `"` or `\` in quotes and escapes it,
# so it never equals the raw path. A bash variable cannot hold a NUL, so the
# records are turned into the newline-separated list `contains_line` reads.
tracked="$(git ls-files -z 2>/dev/null | tr '\0' '\n' || true)"
# Outside a repository both of these come back empty, which is the honest
# answer: nothing is tracked, so every rule file is untracked and no reset can
# be allowed to touch one.
# -z: without it a path holding a space comes back quoted and never matches.
# A rename's second record is the old path with no status code in front,
# recognised by the missing separator space and skipped.
modified=""
while IFS= read -r -d '' record; do
  [ "${record:2:1}" = " " ] || continue
  [ "${record:0:2}" = "??" ] && continue
  modified="$modified${record:3}
"
done < <(git status --porcelain -z --untracked-files=all -- "$rules_dir" 2>/dev/null || true)

# Reset mode. The whole call is judged before a single file is deleted: a
# partial delete would leave the layer in a state neither the user nor the
# command that showed them the list can describe.
if [ "$#" -gt 0 ]; then
  if [ "$1" != "--reset" ]; then
    printf 'refused: %s unknown-mode\n' "$1"
    exit 2
  fi
  shift
  if [ "$#" -eq 0 ]; then
    printf 'refused: - no-target\n'
    exit 2
  fi
  refusals=""
  for target in "$@"; do
    reason=""
    case "$target" in
      "$rules_dir"/*) rest="${target#"$rules_dir"/}" ;;
      *) rest=""; reason="not-a-rule" ;;
    esac
    # `rest` has to be a relative path ending in `.md`, subdirectories allowed:
    # a `..` segment or an empty one means the path only looks like a rule and
    # lands somewhere else entirely.
    if [ -z "$reason" ]; then
      case "$rest" in
        "" | /* | ..* | */..* | *//*) reason="not-a-rule" ;;
        *.md) ;;
        *) reason="not-a-rule" ;;
      esac
    fi
    if [ -z "$reason" ]; then
      base="${target##*/}"
      if [ "${base#_}" != "$base" ]; then
        reason="frozen"
      elif ! contains_line "$tracked" "$target"; then
        if [ -e "$target" ]; then
          reason="untracked"
        else
          reason="missing"
        fi
      elif contains_line "$modified" "$target"; then
        reason="modified"
      fi
    fi
    if [ -n "$reason" ]; then
      refusals="$refusals"'refused: '"$target $reason"'
'
    fi
  done
  if [ -n "$refusals" ]; then
    printf '%s' "$refusals"
    exit 3
  fi
  removed=0
  for target in "$@"; do
    rm -f "$target"
    # An area whose last rule just went is no area any more. `rmdir` refuses
    # a directory still holding anything, and the rules root itself is kept.
    parent="${target%/*}"
    if [ "$parent" != "$rules_dir" ]; then
      rmdir "$parent" 2>/dev/null || true
    fi
    printf 'removed: %s\n' "$target"
    removed=$(( removed + 1 ))
  done
  printf 'removed: %s\n' "$removed"
  exit 0
fi

# Recursive: Claude Code loads every `.md` under the rules directory at any
# depth, so a rule the map skipped would still cost every reader it loads for.
# A symlink is listed like a file when it resolves to one.
listing=""
if [ -d "$rules_dir" ]; then
  listing="$(find "$rules_dir" \( -type f -o -type l \) -name '*.md' 2>/dev/null |
    while IFS= read -r candidate; do [ -f "$candidate" ] && printf '%s\n' "$candidate"; done |
    LC_ALL=C sort || true)"
fi

rule_lines=""
frozen_lines=""
dead_lines=""
dirty_lines=""
total=0
rules_seen=0
undeclared=0

while IFS= read -r file; do
  [ -n "$file" ] || continue
  size="$(chars_of "$file")"
  [ -n "$size" ] || size=0
  total=$(( total + size ))
  # Uncommitted work is a fact about the file, not a score, so it is reported
  # for a frozen rule too: it is what tells the user their own edit is not
  # committed yet.
  if ! contains_line "$tracked" "$file"; then
    dirty_lines="$dirty_lines"'dirty: '"$file untracked"'
'
  elif contains_line "$modified" "$file"; then
    dirty_lines="$dirty_lines"'dirty: '"$file modified"'
'
  fi
  base="${file##*/}"
  # A frozen rule is the user's own file: it is reported, and that is all. No
  # budget is held against it, no writer rewrites it and no reset deletes it.
  if [ "${base#_}" != "$base" ]; then
    frozen_lines="$frozen_lines"'frozen: '"$file $size"'
'
    continue
  fi
  globs="$(globs_of "$file")"
  rules_seen=$(( rules_seen + 1 ))
  if [ -z "$globs" ]; then
    undeclared=$(( undeclared + 1 ))
    shown="none"
    scope="matches 0"
  else
    shown="$(printf '%s' "$globs" | tr '\n' ',')"
    matched="$(printf '%s\n' "$tracked" | count_matches "$globs")"
    scope="matches $matched"
    # A rule is dead only when its OWN scope is empty. With no tracked file at
    # all - no repository, or one with nothing committed - every rule would
    # match zero and the whole layer would read as deletable, which says
    # nothing about any rule, so the section stays silent instead. A rule that
    # declares no scope is not dead either: it is what `state: partial`
    # reports, and it is still loaded everywhere.
    if [ "$matched" -eq 0 ] && [ -n "$tracked" ]; then
      dead_lines="$dead_lines"'dead: '"$file"'
'
    fi
  fi
  verdict="ok"
  [ "$size" -gt "$file_cap" ] && verdict="OVER-FILE"
  rule_lines="$rule_lines"'rule: '"$file $size paths $shown $scope $verdict"'
'
done < <(printf '%s\n' "$listing")

if [ "$rules_seen" -eq 0 ]; then
  state="none"
elif [ "$undeclared" -eq 0 ]; then
  state="complete"
else
  state="partial"
fi

printf '# viber rules map\n'
printf 'id: %s\n' "$stamp"
printf 'state: %s\n' "$state"
printf '%s' "$rule_lines"
printf '%s' "$frozen_lines"
printf '%s' "$dead_lines"
printf '%s' "$dirty_lines"
dir_verdict="ok"
[ "$total" -gt "$dir_cap" ] && dir_verdict="OVER-DIR"
printf 'total: %s %s\n' "$total" "$dir_verdict"
exit 0

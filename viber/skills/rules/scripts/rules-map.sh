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
#            --brief <id> <target> [...]
#                                   -> brief mode: <id> is the map id of the
#                                      run (letters, digits, `.`, `_`, `-`),
#                                      <target> a rule path under
#                                      .claude/rules/, a repo-relative directory
#                                      (`.` for the root) or the word `trail`.
#            --confirm <id> <target> [...]
#                                   -> confirm mode: <id> and <target> as in
#                                      brief mode; the targets given are the
#                                      kept ones.
#            anything else          -> refused, exit 2.
#   cwd    : any directory inside the host project - the repository root is
#            resolved here and every printed path is relative to it. Outside a
#            repository the cwd IS the root and nothing is tracked there.
#   env    : none.
#   reads  : <root>/.claude/rules/**/*.md - every file at any depth, the root
#            holding the shared rules and each subdirectory one area's, its
#            frontmatter and its size; the git index - which of them are tracked, modified or
#            untracked, and how many tracked paths a rule's globs match;
#            <root>/docs/<directories.specifications>/*/failures.md - the
#            archived failure trails, whose `- <cause> | ...` lines one awk
#            process counts; and the one line `scripts/config.sh
#            --specifications` prints, reached through a path relative to this
#            script (`../../../scripts/config.sh`) and taken as the directory
#            name as it stands. When that call fails or prints nothing the
#            directory is `specs`.
#   writes : nothing at all in map mode. In reset mode, and only once every
#            target has passed, the given files are deleted from the working
#            tree, and a subdirectory left empty by them is removed with it. In
#            brief mode, once every target has passed, one findings file
#            `.temp/viber/<id>/<slug>-audit.md` per rule matching no tracked
#            file. Nothing is ever staged and nothing is ever committed. In
#            confirm mode nothing at all.
#   stdout : map mode, in this order. A section with nothing to report prints
#            no line at all; `total:` always prints.
#              # viber rules map
#              id: <yyyy-mm-dd-HH-mm-ss>
#              state: none | partial | complete
#              rule: <path> <chars> paths <glob>[,<glob>] matches <n> ok
#              frozen: <path> <chars>
#              dead: <path>
#              misplaced: <rule path> <area>
#              dirty: <path> modified | untracked
#              trail: <repo-relative path of one archived failures.md> convention <n> other <n>
#              waiting: convention <n> place <n> plan <n> task <n> test <n> unknown <n>
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
#            `misplaced:` is one line per non-frozen rule that sits outside the
#            area it belongs to, alphabetical by path, after the `dead:` lines:
#            a rule directly under the rules directory whose globs each hold a
#            `/` and all open on one first segment holding none of `*`, `?`,
#            `[` or `{` (that segment is the area), else one declaring no such
#            segment, a rule with no scope included, whose basename opens on
#            `<area>-` for an existing subdirectory of the rules directory; and
#            a rule inside `<area>/` whose basename opens on `<area>-`.
#            `dirty:` covers every `.md` in the directory, frozen included:
#            uncommitted work is a fact about the file, not a score.
#            `trail:` is one line per archived `failures.md` holding at least
#            one entry of any cause, alphabetical by path, with that file's
#            count of `convention` entries and of all its other causes (place,
#            plan, task, test, unknown). `waiting:` is one line summing the entries of every
#            archived `failures.md` by cause; it prints when at least one such
#            file exists, a cause with no entry reading 0, and neither line
#            prints when none exists.
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
#            brief mode prints, in this order, the `AUDIT:` lines first, then
#            one block per target in the order given, or `NEXT: none` alone
#            when no block was printed. A block is the directive line and five
#            labelled lines:
#              NEXT: rules-auditor
#              target: <rule path> | none | trail
#              scope: <globs, comma-separated> | ** | <directory> | <trail paths>
#              matches: <n> | none
#              out: .temp/viber/<id>/
#              refs: <plugin root>/references
#            `<plugin root>` is the invoked path cut three directories above this
#            script's own (`scripts/plugin-root.sh`), read as text and never
#            resolved against the cwd: invoked by `C:\...` or `C:/...` it prints
#            `C:/...`, invoked by `/c/...` it prints `/c/...`. The same root ends
#            the `refs:` line of the confirm mode's writer block.
#
#            confirm mode reads the findings file of each target under
#            `.temp/viber/<id>/` (`<slug>-audit.md` of a rule, `new--<slug>-audit.md`
#            of a directory, `new--root` for `.`, `_trail-audit.md` of the trail)
#            and counts its lines opening on `STALE:`, `GONE:`, `DROP:` and
#            `MISS:` (rule, directory) or `MISS:`, `IGNORED:` and `REJECTED:`
#            (trail); a missing file reads 0 everywhere. When every counter is 0,
#            no kept rule is misplaced or `OVER-FILE`, `total:` carries no
#            `OVER-DIR` and no kept `trail:` line has an `other` count above 0,
#            stdout is the one line
#              STOP: rules: the layer already holds, no writer dispatched
#            otherwise, in this order:
#              confirm: <target> stale <n> gone <n> drop <n> miss <n>
#              confirm: trail miss <n> ignored <n> rejected <n>
#              confirm: <rule path> misplaced <area>
#              confirm: <rule path> OVER-FILE
#              confirm: total OVER-DIR
#              confirm: <trail path> other <n>
#              ASK: fold in -> write | stop -> stop
#              NEXT: rules-writer
#              map:
#              id: <id>
#              state: <state>
#              rule: / dead: lines of the kept rule targets, verbatim
#              trail: lines, only with the trail kept, verbatim
#              total: <chars> ok | OVER-DIR
#              notes: .temp/viber/<id>/
#              refs: <plugin root>/references
#            a `confirm:` line prints only for a counter above 0.
#            `scope: **` and `matches: none` mark a rule declaring no scope; a
#            directory target is `target: none` with the directory (no trailing
#            slash) as scope; the trail target lists every `trail:` path with a
#            `convention` count above 0 and prints no block when none has one.
#            A rule whose globs match no tracked file - judged only when the
#            repository tracks something - prints no block, its findings file
#            holding the one line `GONE: the rule's globs match no tracked file`
#            and its line being
#              AUDIT: <rule path> stale 0 gone 1 unverifiable 0 drop 0 miss 0 -> .temp/viber/<id>/<slug>-audit.md
#            where <slug> is the rule path below .claude/rules/ without `.md`,
#            each `/` as `--`.
#   exit   : 0 - map mode, ALWAYS, whatever it finds: it is called as a `!`
#                preload, where a non-zero exit aborts the whole skill load.
#                Also a reset that deleted every target it was given, and a
#                brief or a confirm that answered.
#            2 - unusable argv: a first argument that is not `--reset`,
#                `--brief` or `--confirm`, or `--reset` with no target at all. A
#                brief or confirm with an unusable id, no target, a frozen rule
#                or a target that is
#                neither a rule, a directory nor `trail` exits 2 as well, with
#                one `error: <reason>` line on stderr and an empty stdout.
#            3 - the reset was refused. Nothing was deleted.
#
set -u

# plugin_root_of prints the plugin root of the `refs:` lines from the path this
# script was invoked by, so a `C:\...` or `C:/...` call prints `C:/...` and a
# `/c/...` call prints `/c/...`.
. "$(dirname -- "$0")/../../../scripts/plugin-root.sh"

rules_dir=".claude/rules"
file_cap=4000
dir_cap=40000

script_dir="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"

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

# The literal first path segment every glob of the list $1 (one per line) opens
# on, printed alone, or nothing at all: a glob holding no `/`, a first segment
# that is empty or holds `*`, `?`, `[` or `{`, two globs opening on different
# segments, and an empty list each give none.
shared_segment() {
  seg=""
  while IFS= read -r glob; do
    [ -n "$glob" ] || continue
    case "$glob" in
      */*) ;;
      *) return 0 ;;
    esac
    first="${glob%%/*}"
    case "$first" in
      "" | *[*?[{]*) return 0 ;;
    esac
    if [ -z "$seg" ]; then
      seg="$first"
    elif [ "$seg" != "$first" ]; then
      return 0
    fi
  done < <(printf '%s\n' "$1")
  printf '%s' "$seg"
}

# The first of the area names in $1 (one per line) that the basename $2 opens
# on as `<area>-`, printed alone, or nothing at all.
area_prefix() {
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    case "$2" in
      "$candidate"-*) printf '%s' "$candidate"; return 0 ;;
    esac
  done < <(printf '%s\n' "$1")
  return 0
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
if [ "$#" -gt 0 ] && [ "$1" != "--brief" ] && [ "$1" != "--confirm" ]; then
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

# The area directories: the direct subdirectories of the rules directory.
areas=""
if [ -d "$rules_dir" ]; then
  areas="$(find "$rules_dir" -mindepth 1 -maxdepth 1 -type d 2>/dev/null |
    while IFS= read -r candidate; do printf '%s\n' "${candidate##*/}"; done |
    LC_ALL=C sort || true)"
fi

rule_lines=""
frozen_lines=""
dead_lines=""
misplaced_lines=""
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
  # Misplaced: a root rule whose globs all open on one literal directory, or
  # failing that whose name opens on an area, or an area rule whose name opens
  # on its own area - each belongs with the other rules of that area.
  rel="${file#"$rules_dir"/}"
  where=""
  case "$rel" in
    */*)
      top="${rel%%/*}"
      case "$base" in
        "$top"-*) where="$top" ;;
      esac
      ;;
    *)
      where="$(shared_segment "$globs")"
      [ -n "$where" ] || where="$(area_prefix "$areas" "$base")"
      ;;
  esac
  if [ -n "$where" ]; then
    misplaced_lines="$misplaced_lines"'misplaced: '"$file $where"'
'
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

# The archive directory is whatever `config.sh --specifications` prints, which
# has already validated the name; a failed call or an empty answer leaves the
# default. Never an error: this is a preload.
specs_dir=""
if [ -n "$script_dir" ] && [ -f "$script_dir/../../../scripts/config.sh" ]; then
  specs_dir="$("$script_dir/../../../scripts/config.sh" --specifications 2>/dev/null || true)"
fi
specs_dir="${specs_dir%%$'\n'*}"
specs_dir="${specs_dir%$'\r'}"
[ -n "$specs_dir" ] || specs_dir="specs"

# The archived failure trails: `- <cause> | <source> | <text>` entries. One awk
# process reads every trail and prints, per file, the six counts and then the
# path; `trail:` names each file holding an entry of any cause, `waiting:` sums
# the causes of all of them.
trail_lines=""
waiting_line=""
sum_convention=0
sum_place=0
sum_plan=0
sum_task=0
sum_test=0
sum_unknown=0
trail_files=()
if [ -d "docs/$specs_dir" ]; then
  while IFS= read -r trail; do
    [ -n "$trail" ] && trail_files+=("$trail")
  done < <(find "docs/$specs_dir" -mindepth 2 -maxdepth 2 -type f -name failures.md 2>/dev/null |
    LC_ALL=C sort || true)
fi
if [ "${#trail_files[@]}" -gt 0 ]; then
  while read -r c_convention c_place c_plan c_task c_test c_unknown trail; do
    sum_convention=$(( sum_convention + c_convention ))
    sum_place=$(( sum_place + c_place ))
    sum_plan=$(( sum_plan + c_plan ))
    sum_task=$(( sum_task + c_task ))
    sum_test=$(( sum_test + c_test ))
    sum_unknown=$(( sum_unknown + c_unknown ))
    c_other=$(( c_place + c_plan + c_task + c_test + c_unknown ))
    if [ $(( c_convention + c_other )) -gt 0 ]; then
      trail_lines="$trail_lines"'trail: '"$trail convention $c_convention other $c_other"'
'
    fi
  done < <(awk '
    function flush() {
      if (cur != "") print n["convention"] + 0, n["place"] + 0, n["plan"] + 0, n["task"] + 0, n["test"] + 0, n["unknown"] + 0, cur
    }
    FNR == 1 { flush(); cur = FILENAME; split("", n) }
    { sub(/\r$/, "") }
    /^- (convention|place|plan|task|test|unknown) [|]/ { n[$2]++ }
    END { flush() }
  ' "${trail_files[@]}" 2>/dev/null || true)
  waiting_line="waiting: convention $sum_convention place $sum_place plan $sum_plan task $sum_task test $sum_test unknown $sum_unknown"
fi

# Brief mode. Every target is judged before anything is written or printed, so
# an unusable one leaves stdout empty and the layer untouched. Nothing prints
# until the end: the `AUDIT:` lines of the rules that match nothing first, then
# one block per target, in the order given.
if [ "${1:-}" = "--brief" ] || [ "${1:-}" = "--confirm" ]; then
  mode="$1"
  brief_fail() {
    printf 'error: %s\n' "$1" >&2
    exit 2
  }
  [ "$#" -ge 3 ] || brief_fail "$mode takes a map id and at least one target"
  brief_id="$2"
  case "$brief_id" in
    "" | . | .. | *[!A-Za-z0-9._-]*) brief_fail "$brief_id is not a usable map id" ;;
  esac
  shift 2

  # Sets `kind` to rule, dir or trail and `dir` to the directory without its
  # trailing slash, or sets `err` to the reason the target is unusable.
  brief_kind() {
    kind=""
    err=""
    dir=""
    if [ "$1" = "trail" ]; then
      kind="trail"
      return 0
    fi
    case "$1" in
      "$rules_dir"/*.md)
        case "${1#"$rules_dir"/}" in
          "" | /* | ..* | */..* | *//*) err="$1 is not a rule" ;;
          *)
            base="${1##*/}"
            if [ "${base#_}" != "$base" ]; then
              err="$1 is frozen"
            elif [ -f "$1" ]; then
              kind="rule"
            else
              err="$1 is not a rule file"
            fi
            ;;
        esac
        return 0
        ;;
    esac
    dir="${1%/}"
    case "$dir" in
      "" | /* | .. | ../* | */.. | */../*) err="$1 is neither a rule, a directory nor trail" ;;
      *)
        if [ -d "$dir" ]; then
          kind="dir"
        else
          err="$1 is neither a rule, a directory nor trail"
        fi
        ;;
    esac
    return 0
  }

  for target in "$@"; do
    brief_kind "$target"
    [ -z "$err" ] || brief_fail "$err"
  done

  plugin_root="$(plugin_root_of "$0" 3)"
  brief_out_dir=".temp/viber/$brief_id"

  # Confirm mode: the counters of each target's findings file decide whether
  # the layer already holds. A findings file a target never wrote reads as 0
  # on every counter. The targets given are the kept ones.
  if [ "$mode" = "--confirm" ]; then
    count_of() {
      c_found="$(grep -c "^$2" "$1" 2>/dev/null || true)"
      printf '%s' "${c_found:-0}"
    }
    confirm_stop=1
    counter_out=""
    misplaced_out=""
    over_file_out=""
    other_out=""
    kept_set=""
    trail_kept=0
    for target in "$@"; do
      brief_kind "$target"
      case "$kind" in
        rule | dir)
          if [ "$kind" = "rule" ]; then
            kept_set="$kept_set$target
"
            rel="${target#"$rules_dir"/}"
            slug="${rel%.md}"
          else
            slug="${dir#./}"
            [ "$slug" != "." ] || slug="root"
            slug="new--$slug"
          fi
          slug="${slug//\//--}"
          n_stale="$(count_of "$brief_out_dir/$slug-audit.md" "STALE:")"
          n_gone="$(count_of "$brief_out_dir/$slug-audit.md" "GONE:")"
          n_drop="$(count_of "$brief_out_dir/$slug-audit.md" "DROP:")"
          n_miss="$(count_of "$brief_out_dir/$slug-audit.md" "MISS:")"
          if [ $(( n_stale + n_gone + n_drop + n_miss )) -gt 0 ]; then
            confirm_stop=0
            counter_out="$counter_out"'confirm: '"$target stale $n_stale gone $n_gone drop $n_drop miss $n_miss"'
'
          fi
          ;;
        trail)
          trail_kept=1
          n_miss="$(count_of "$brief_out_dir/_trail-audit.md" "MISS:")"
          n_ignored="$(count_of "$brief_out_dir/_trail-audit.md" "IGNORED:")"
          n_rejected="$(count_of "$brief_out_dir/_trail-audit.md" "REJECTED:")"
          if [ $(( n_miss + n_ignored + n_rejected )) -gt 0 ]; then
            confirm_stop=0
            counter_out="$counter_out"'confirm: '"trail miss $n_miss ignored $n_ignored rejected $n_rejected"'
'
          fi
          ;;
      esac
    done

    # The map lines of the kept rules, in the map's own order.
    # The kept path a map line body belongs to, printed alone, or nothing at all.
    # The body opens on the longest rule path of the listing followed by one
    # space - never on the text up to its first space, which would cut `my
    # rule.md` to `my` - and that path has to be a kept one: a kept `my.md`
    # claims nothing of `my rule.md` or `my.md rule.md`. With `size` as $2 the
    # rest has to open on a digit, the char count of a `rule:` line.
    kept_prefix() {
      best=""
      while IFS= read -r candidate; do
        [ -n "$candidate" ] || continue
        case "$1" in
          "$candidate "*)
            if [ "${2:-}" = "size" ]; then
              case "${1#"$candidate "}" in
                [0-9]*) ;;
                *) continue ;;
              esac
            fi
            [ "${#candidate}" -gt "${#best}" ] && best="$candidate"
            ;;
        esac
      done < <(printf '%s\n' "$listing")
      if [ -n "$best" ] && contains_line "$kept_set" "$best"; then
        printf '%s' "$best"
      fi
      return 0
    }

    kept_rules=""
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      line_path="$(kept_prefix "${line#rule: }" size)"
      [ -n "$line_path" ] || continue
      kept_rules="$kept_rules$line
"
      case "$line" in
        *" OVER-FILE")
          confirm_stop=0
          over_file_out="$over_file_out"'confirm: '"$line_path OVER-FILE"'
'
          ;;
      esac
    done < <(printf '%s' "$rule_lines")
    kept_dead=""
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      contains_line "$kept_set" "${line#dead: }" || continue
      kept_dead="$kept_dead$line
"
    done < <(printf '%s' "$dead_lines")
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      line_path="$(kept_prefix "${line#misplaced: }")"
      [ -n "$line_path" ] || continue
      confirm_stop=0
      misplaced_out="$misplaced_out"'confirm: '"$line_path misplaced ${line#misplaced: "$line_path" }"'
'
    done < <(printf '%s' "$misplaced_lines")

    total_out=""
    total_verdict="ok"
    if [ "$total" -gt "$dir_cap" ]; then
      confirm_stop=0
      total_verdict="OVER-DIR"
      total_out='confirm: total OVER-DIR
'
    fi
    kept_trails=""
    if [ "$trail_kept" -eq 1 ]; then
      kept_trails="$trail_lines"
      while IFS= read -r line; do
        [ -n "$line" ] || continue
        n_other="${line##* other }"
        [ "$n_other" -gt 0 ] || continue
        confirm_stop=0
        line_path="${line#trail: }"
        other_out="$other_out"'confirm: '"${line_path%% convention *} other $n_other"'
'
      done < <(printf '%s' "$trail_lines")
    fi

    if [ "$confirm_stop" -eq 1 ]; then
      printf 'STOP: rules: the layer already holds, no writer dispatched\n'
      exit 0
    fi
    printf '%s' "$counter_out"
    printf '%s' "$misplaced_out"
    printf '%s' "$over_file_out"
    printf '%s' "$total_out"
    printf '%s' "$other_out"
    printf 'ASK: fold in -> write | stop -> stop\n'
    printf 'NEXT: rules-writer\nmap:\nid: %s\nstate: %s\n' "$brief_id" "$state"
    printf '%s' "$kept_rules"
    printf '%s' "$kept_dead"
    printf '%s' "$kept_trails"
    printf 'total: %s %s\n' "$total" "$total_verdict"
    printf 'notes: %s/\nrefs: %s/references\n' "$brief_out_dir" "$plugin_root"
    exit 0
  fi

  audit_out=""
  block_out=""
  for target in "$@"; do
    brief_kind "$target"
    blocked=0
    b_target="none"
    b_scope=""
    b_matches="none"
    case "$kind" in
      rule)
        b_target="$target"
        globs="$(globs_of "$target")"
        if [ -z "$globs" ]; then
          b_scope="**"
        else
          b_scope="$(printf '%s' "$globs" | tr '\n' ',')"
          matched="$(printf '%s\n' "$tracked" | count_matches "$globs")"
          b_matches="$matched"
          # Nothing tracked at all would read every rule as gone, which says
          # nothing about the rule: the map prints no `dead:` line then either.
          if [ "$matched" -eq 0 ] && [ -n "$tracked" ]; then
            rel="${target#"$rules_dir"/}"
            rel="${rel%.md}"
            slug="${rel//\//--}"
            mkdir -p "$brief_out_dir" 2>/dev/null || brief_fail "cannot create $brief_out_dir"
            printf "GONE: the rule's globs match no tracked file\n" > "$brief_out_dir/$slug-audit.md" ||
              brief_fail "cannot write $brief_out_dir/$slug-audit.md"
            audit_out="$audit_out"'AUDIT: '"$target"' stale 0 gone 1 unverifiable 0 drop 0 miss 0 -> '"$brief_out_dir/$slug-audit.md"'
'
            continue
          fi
        fi
        ;;
      dir)
        b_scope="$dir"
        ;;
      trail)
        b_target="trail"
        while IFS= read -r entry; do
          [ -n "$entry" ] || continue
          rest="${entry#trail: }"
          after="${rest##* convention }"
          [ "${after%% *}" -gt 0 ] || continue
          b_scope="$b_scope${b_scope:+,}${rest%% convention *}"
        done < <(printf '%s' "$trail_lines")
        [ -n "$b_scope" ] || continue
        ;;
    esac
    block_out="$block_out"'NEXT: rules-auditor
target: '"$b_target"'
scope: '"$b_scope"'
matches: '"$b_matches"'
out: '"$brief_out_dir"'/
refs: '"$plugin_root"'/references
'
  done
  printf '%s' "$audit_out"
  if [ -z "$block_out" ]; then
    printf 'NEXT: none\n'
  else
    printf '%s' "$block_out"
  fi
  exit 0
fi

printf '# viber rules map\n'
printf 'id: %s\n' "$stamp"
printf 'state: %s\n' "$state"
printf '%s' "$rule_lines"
printf '%s' "$frozen_lines"
printf '%s' "$dead_lines"
printf '%s' "$misplaced_lines"
printf '%s' "$dirty_lines"
printf '%s' "$trail_lines"
[ -z "$waiting_line" ] || printf '%s\n' "$waiting_line"
dir_verdict="ok"
[ "$total" -gt "$dir_cap" ] && dir_verdict="OVER-DIR"
printf 'total: %s %s\n' "$total" "$dir_verdict"
exit 0

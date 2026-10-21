#!/usr/bin/env bash
#
# config.sh - resolves the .claude/viber.yml switches into the block a skill
# preloads when it loads.
#
# It exists because a grep|sed YAML parser is a compound command, and Claude
# Code asks for approval on every member of one - which stalls the step on any
# permission mode that does not auto-accept everything. One script is ONE
# command to the permission engine. It is also the only way `implementor` can
# read the file at all: that skill's body forbids it to open a file.
#
# The file is resolved against the REPOSITORY ROOT, not the caller's cwd: a `!`
# preload runs wherever the session started, and a session started in a
# subdirectory would otherwise find no file and fail open with every switch
# false - silently turning off every layer the user configured.
#
# Every key lives INSIDE its group, and the group is the disambiguation: `runs`
# on its own reads like a count and `memory` like anything, where
# `directories.runs` and `build.memory` cannot be read as anything else, so a
# key of that name outside its group is not this key and is ignored - a legacy
# flat switch included, until /viber:setup moves it. A directory value is
# sanitized because "docs/ is the one home for persisted knowledge" rests on
# it: a slash, a traversal or an absolute path is a configuration error, so the
# default stands and the run is unaffected.
#
# Contract:
#   argv   : none -> the block below. `--branching` -> the branching report,
#            `--red-check` -> the red-check report (see their own stdout
#            paragraphs) in place of the block. Anything else -> the block.
#   cwd    : any directory inside the host project - the repository root is
#            resolved here. Outside a repository, the cwd is the base.
#   env    : none.
#   file   : <repo root>/.claude/viber.yml (optional). No file -> every switch
#            false, every other key at its default.
#   keys   : A group is `<group>:` at column 0; its children are the indented
#            key lines below it, the group ending at the next column-0 key (a
#            blank line or a column-0 comment leaves it open). The first
#            assignment of a child wins; a CR is never part of a value.
#            planning.adr, planning.plain-plan-review, planning.fast-path,
#            build.baseline-tests, build.final-review, build.memory,
#            build.rules, build.qa, build.cleanup, build.red-check,
#            github.issues - switches.
#            One is `true` ONLY as a child of its own group, spelled exactly
#            (case-sensitive), whose value is `true` in any letter case (ended
#            by a space, a comment or the end of the line). A column-0 key of
#            the same name, the key under another group, or an absent key ->
#            false.
#            build.baseline-tests is the one three-valued switch, read the same
#            group-bound way: `full` or `true` (any letter case) -> full, `fast`
#            (any letter case) -> fast, `false`, any other value, an absent key,
#            a column-0 key or the key under another group -> off.
#            github.issue-title (default `{summary}`) and
#            github.pr-title (default `[{issue-number}] {summary}`) - title patterns,
#            children of `github:`. A value opening on a quote with its
#            closing pair -> everything between the two, kept whole; otherwise
#            cut at the first blank followed by `#`, trailing blanks dropped.
#            Empty, a comment alone or absent -> the default.
#            build.extensions - a map of agent entries, owned by the first
#            `extensions:` key line among the indented lines of `build:`:
#              build:
#                extensions:          # empty or a comment after the colon
#                  <name>:            # an entry
#                    parallel: true   # an option of that entry
#            A value after the key other than a comment -> no entry. Map lines
#            run from the line after the key up to the first line that is
#            neither blank nor a comment and is indented no deeper than the key
#            (a column-0 line included); no map line is a child of `build:` for
#            any other key. The first key line of the map sets the entry depth:
#            a key line there is an entry named by its trimmed key, any inline
#            value ignored; a deeper key line is an option of the entry above,
#            a shallower one is ignored. `parallel` reading `true` in any letter
#            case (cut at a blank or a `#`) makes the entry parallel; any other
#            value, an absent option or another option key -> not parallel, and
#            the first `parallel` of an entry wins. A name counts once, at its
#            first entry, with that entry's option. A name matching
#            `^[a-z0-9][a-z0-9-]*$` whose file <repo root>/.claude/agents/<name>.md
#            exists is found; every other name (no such file, or an invalid
#            name) is missing. A CR is never part of a key or a value. Absent,
#            an empty map or a map outside `build:` -> no name.
#            directories.runs (default `_specs`) and
#            directories.specifications (default `specs`) - the directory names
#            under docs/ holding the open runs and the archived ones. Read ONLY
#            from inside the `directories:` group: `directories:` at column 0,
#            its keys indented under it, the group ending at the next top-level
#            key. A same-named key outside the group is ignored. The value is
#            the first such assignment, cut at the first space or `#`, and must
#            match `[A-Za-z0-9._-]+` and be neither `.` nor `..`; anything else
#            -> the default, silently.
#            tiers.min (default `haiku`) and tiers.max (default `opus`) - the
#            model range implementor clamps its dispatches into. Read the same
#            group-bound way; the value is one of haiku, sonnet, opus, fable (any
#            case). The default max stays opus: fable is reached only when a
#            project names it. Anything else -> that key's default; min above
#            max -> both defaults.
#            branching.mode (default `off`) - whether a run works on its own
#            branch. Taken from the first line of the `--branching` report, so
#            both read it by indentation: off, allowed or required (any case,
#            printed lowercase), anything else -> off. The branch
#            bases and name patterns live in `branching.work` entries, read by
#            `--branching` alone.
#            build.red-check-tests and build.red-check-links - lists, children
#            of `build:` read the same group-bound way by `--red-check` alone.
#            The value is cut at the first blank followed by `#` (a value
#            opening on `#` is a comment alone); its entries are separated by
#            blanks, no quoting. Empty, a comment alone or absent -> the
#            default: tests `__tests__/ tests/ test/ *.Tests/ *.UnitTests/
#            *.IntegrationTests/ *.test.* *.spec.* test_*.py *_test.py
#            *_test.go *Test.java *Test.kt conftest.py testdata/ __mocks__/
#            __fixtures__/ fixtures/ jest.config.* vitest.config.*`, links
#            `node_modules`.
#   file   : <repo root>/.claude/viber.local.yml (optional, the same layout and
#            key grammar, personal and git-ignored; outside a repository
#            .claude/viber.local.yml under the cwd). It overrides exactly four
#            keys: tiers.min and tiers.max (haiku, sonnet, opus or fable, any
#            case), build.baseline-tests (off, fast, full, true -> full,
#            false -> off) and github.issues (true or false). A valid local
#            value replaces that one key; an empty or invalid one leaves the
#            shared value. The min-above-max reset runs on the merged range.
#            Every other direct child of any group, and every column-0 key
#            carrying a value, is ignored. A direct child is a key line at the
#            indentation of the first key line inside its group; a deeper line
#            is neither read nor named. The first assignment of a key wins, and
#            a key is named once however often the file repeats it.
#            `--branching` and `--red-check` never read this file.
#   stdout : a header line, then one `<group>.<key>: <true|false>` line per
#            switch (`build.baseline-tests: <off|fast|full>`), one `github.<key>: <pattern>` line per title,
#            the two extension lines, one
#            `directories.<key>: <name>` line per directory key, one
#            `tiers.<key>: <tier>` line per tier key and the
#            `branching.mode: <mode>` line - dotted, so the block reads the
#            way the file does - in a fixed order:
#              # viber config (resolved)
#              planning.adr: true
#              planning.plain-plan-review: true
#              planning.fast-path: true
#              build.baseline-tests: off
#              build.final-review: true
#              build.memory: true
#              build.rules: true
#              build.qa: false
#              build.cleanup: true
#              build.red-check: true
#              github.issues: false
#              github.issue-title: {summary}
#              github.pr-title: [{issue-number}] {summary}
#              build.extensions: <step>, <step> | none
#              build.extensions-missing: <name>, <name> | none
#              directories.runs: _specs
#              directories.specifications: specs
#              tiers.min: haiku
#              tiers.max: opus
#              branching.mode: off
#            Missing names are dropped before the found ones are grouped, so a
#            missing name never splits a run. A <step> is a run of consecutive
#            found parallel entries joined by ` + `, or one found entry that is
#            not parallel, alone (a parallel entry with no parallel neighbour is
#            a step of one name). build.extensions holds the steps,
#            build.extensions-missing the missing names, each in listed order
#            joined by `, `, `none` when there is none. Example: `a` and `b`
#            parallel, `c`, `d` parallel, `ghost` missing, `e` parallel ->
#            `build.extensions: a + b, c, d + e` and
#            `build.extensions-missing: ghost`.
#            When the local file exists, one line follows the header:
#              # local: <overridden> | ignored: <ignored>
#            <overridden> is the keys that took a local value, in block order,
#            joined by `, ` (`none` when empty); <ignored> the ignored keys in
#            file order (a group child as <group>.<key>, a column-0 key as
#            <key>), joined by `, ` (`none` when empty). Every other line is
#            unchanged. An unreadable local file reads as `none` twice.
#   stdout (--branching): the `branching:` group read by indentation - its
#            direct children are `mode`, `work` and `issue-type-mappings`; a
#            child of `work` is one work entry, its own `base`, `name` and
#            `target` fields below it; a child of `issue-type-mappings` maps an
#            issue type to an entry key. Values are cut at the first space or
#            `#`. Lines, in this order:
#              mode: off|allowed|required
#              entry: <key> | base: <branch> | name: <pattern> | target: <branch>
#              map: <issue type> | <entry key>
#              error: <reason>
#            mode: off unless the direct child `mode` (a quoted key allowed)
#            reads off, allowed or required in any case, printed lowercase; the
#            block's branching.mode is this line. `entry:` once per valid work entry, `map:`
#            once per mapping naming a valid entry, each in file order. Entry
#            key `[A-Za-z0-9._-]+`; base and target `[A-Za-z0-9._/-]+`, not
#            starting with `-` or `/`, no `..`; name with one surrounding quote
#            pair stripped, `[A-Za-z0-9._/{}-]+`; an issue type with one
#            surrounding quote pair stripped, kept verbatim. `error:` lines, in
#            this order, zero or more:
#              branching.base and branching.name are no longer read - move them into a branching.work entry
#                (a `base:` or `name:` directly under `branching:`)
#              work entry <key>: invalid key: <key>
#              work entry <key>: missing <base|name|target>
#              work entry <key>: invalid <base|name|target>: <value>
#              work entry <key>: {issue} is now {issue-number}
#                (each of these drops the entry; one entry may print several,
#                its fields checked in base, name, target order)
#              issue-type-mappings: <type> names no work entry: <key>
#                (the mapping is dropped)
#              no valid branching.work entry
#                (a mode other than off only)
#            No file or no group -> `mode: off` alone.
#   stdout (--red-check): exactly two lines, each list's entries joined by one
#            space:
#              red-check.tests: <pattern> <pattern> ...
#              red-check.links: <directory name> ...
#            No file -> both defaults.
#   exit  : ALWAYS 0 (fail-open - a missing file or key never breaks a run, and
#            a non-zero exit in a `!` preload would abort the whole skill load).
#
set -u

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$repo_root" ] && [ -d "$repo_root" ]; then
  cfg="$repo_root/.claude/viber.yml"
else
  cfg=".claude/viber.yml"
fi
local_cfg="$(dirname "$cfg")/viber.local.yml"

# The extension map lines, told apart by one function both passes share, fed
# every line with its CR dropped. It returns 2 for the first `extensions:` key
# line among the indented lines of `build:`, 1 for a map line below it (up to the
# first line neither blank nor a comment indented no deeper than that key line)
# and 0 for any other line.
map_prog='
function mapline(line) {
  if (mapstate == 1) {
    if (line ~ /^[[:space:]]*(#|$)/) return 1
    match(line, /^[[:space:]]*/)
    if (RLENGTH > mapind) return 1
    mapstate = 2
  }
  if (line ~ /^[^[:space:]#]/) { mapgrp = (line ~ /^build[[:space:]]*:/); return 0 }
  if (mapstate == 0 && mapgrp && line ~ /^[[:space:]]+extensions[[:space:]]*:/) {
    match(line, /^[[:space:]]*/)
    mapind = RLENGTH
    mapstate = 1
    return 2
  }
  return 0
}
'

# The raw value of every group child, `raw["<group>.<key>"]`, from one pass over
# the file. A column-0 key opens its group; a blank line or a column-0 comment
# leaves it open. The first assignment of each child wins; a map line is no
# child. The block and the --red-check report each add their own END.
collect_prog='
{
  line = $0
  sub(/\r$/, "", line)
  if (mapline(line) == 1) next
}
/^[^[:space:]#]/ {
  grp = ""
  if (match($0, /^[A-Za-z0-9_-]+[[:space:]]*:/)) { grp = substr($0, 1, RLENGTH); sub(/[[:space:]]*:$/, "", grp) }
  next
}
grp != "" && /^[[:space:]]+[A-Za-z]/ {
  line = $0
  sub(/\r$/, "", line)
  sub(/^[[:space:]]+/, "", line)
  if (line !~ /^[A-Za-z0-9_-]+[[:space:]]*:/) next
  key = line
  sub(/[[:space:]]*:.*$/, "", key)
  val = line
  sub(/^[^:]*:[[:space:]]*/, "", val)
  id = grp "." key
  if (!(id in raw)) raw[id] = val
}
'

# The switch and title lines of the block, in their fixed order.
switches_prog='
function title(v, dflt,  q, end) {
  q = substr(v, 1, 1)
  end = 0
  if (q == sq || q == "\"") end = index(substr(v, 2), q)
  if (end > 0) v = substr(v, 2, end - 1)
  else {
    if (v ~ /^#/) v = ""
    if (match(v, /[[:space:]]#/)) v = substr(v, 1, RSTART - 1)
    sub(/[[:space:]]+$/, "", v)
  }
  return v == "" ? dflt : v
}
END {
  n = split("planning.adr planning.plain-plan-review planning.fast-path build.baseline-tests build.final-review build.memory build.rules build.qa build.cleanup build.red-check github.issues", ids, " ")
  for (i = 1; i <= n; i++) {
    v = raw[ids[i]]
    sub(/[[:space:]#].*$/, "", v)
    v = tolower(v)
    if (ids[i] == "build.baseline-tests") print ids[i] ": " (v == "full" || v == "true" ? "full" : v == "fast" ? "fast" : "off")
    else print ids[i] ": " (v == "true" ? "true" : "false")
  }
  print "github.issue-title: " title(raw["github.issue-title"], "{summary}")
  print "github.pr-title: " title(raw["github.pr-title"], "[{issue-number}] {summary}")
}
'

# The two lines of the --red-check report. A list value is cut at the first
# blank followed by `#` (a value opening on `#` is a comment alone), its
# entries split on blanks and joined by one space; no entry -> the default.
redcheck_prog='
function list(v, dflt,  n, e, i, out) {
  if (v ~ /^#/) v = ""
  if (match(v, /[[:space:]]#/)) v = substr(v, 1, RSTART - 1)
  n = split(v, e, /[[:space:]]+/)
  out = ""
  for (i = 1; i <= n; i++) if (e[i] != "") out = (out == "" ? e[i] : out " " e[i])
  return out == "" ? dflt : out
}
END {
  print "red-check.tests: " list(raw["build.red-check-tests"], "__tests__/ tests/ test/ *.Tests/ *.UnitTests/ *.IntegrationTests/ *.test.* *.spec.* test_*.py *_test.py *_test.go *Test.java *Test.kt conftest.py testdata/ __mocks__/ __fixtures__/ fixtures/ jest.config.* vitest.config.*")
  print "red-check.links: " list(raw["build.red-check-links"], "node_modules")
}
'

# The build.extensions entries, one line each in listed order, each once at its
# first entry: `<V|X> <P|S> <name>`, V for a valid name and X for any other, P
# for an entry whose first `parallel` option reads `true` in any letter case and
# S for any other. A value after the map key other than a comment empties the
# map; a key line shallower than the entry depth is ignored.
ext_prog='
{
  line = $0
  sub(/\r$/, "", line)
  m = mapline(line)
}
m == 2 {
  v = line
  sub(/^[^:]*:/, "", v)
  sub(/^[[:space:]]+/, "", v)
  noentry = (v != "" && v !~ /^#/)
  next
}
m != 1 || noentry || line ~ /^[[:space:]]*(#|$)/ { next }
{
  match(line, /^[[:space:]]*/)
  ind = RLENGTH
  rest = substr(line, ind + 1)
  c = index(rest, ":")
  if (c == 0) next
  key = substr(rest, 1, c - 1)
  sub(/[[:space:]]+$/, "", key)
  if (key == "") next
  if (entind == 0) entind = ind
  if (ind == entind) {
    cur = 0
    if (key in seen) next
    seen[key] = 1
    nm[++n] = key
    cur = n
    next
  }
  if (ind < entind || !cur || key != "parallel" || (cur in parset)) next
  parset[cur] = 1
  v = substr(rest, c + 1)
  sub(/^[[:space:]]+/, "", v)
  sub(/[[:space:]#].*$/, "", v)
  par[cur] = (tolower(v) == "true")
}
END {
  for (i = 1; i <= n; i++) print (nm[i] ~ /^[a-z0-9][a-z0-9-]*$/ ? "V " : "X ") (par[i] ? "P " : "S ") nm[i]
}
'

# The local overrides, one line each, in file order: `V <group.key> <value>` for
# one of the four overridable keys holding a valid value (baseline-tests
# normalized to off, fast or full), `I <name>` for an ignored key. A group child
# counts only at the indentation of the first key line inside its group.
local_prog='
function clean(v) {
  sub(/^[[:space:]]+/, "", v)
  sub(/[[:space:]#].*$/, "", v)
  return tolower(v)
}
/^[^[:space:]#]/ {
  grp = ""
  l1 = 0
  line = $0
  sub(/\r$/, "", line)
  if (line !~ /^[A-Za-z0-9_-]+[[:space:]]*:/) next
  key = line
  sub(/[[:space:]]*:.*$/, "", key)
  val = line
  sub(/^[^:]*:/, "", val)
  if (clean(val) == "") grp = key
  else if (!(key in seen)) { seen[key] = 1; print "I " key }
  next
}
grp != "" {
  line = $0
  sub(/\r$/, "", line)
  if (!match(line, /^[[:space:]]+/)) next
  ind = RLENGTH
  rest = substr(line, ind + 1)
  if (rest !~ /^[A-Za-z0-9_-]+[[:space:]]*:/) next
  if (l1 == 0) l1 = ind
  if (ind != l1) next
  key = rest
  sub(/[[:space:]]*:.*$/, "", key)
  val = rest
  sub(/^[^:]*:/, "", val)
  val = clean(val)
  id = grp "." key
  if (id in seen) next
  seen[id] = 1
  ok = 0
  if (id == "tiers.min" || id == "tiers.max") ok = (val == "haiku" || val == "sonnet" || val == "opus" || val == "fable")
  else if (id == "build.baseline-tests") {
    ok = (val == "off" || val == "fast" || val == "full" || val == "true" || val == "false")
    if (val == "true") val = "full"
    if (val == "false") val = "off"
  } else if (id == "github.issues") ok = (val == "true" || val == "false")
  if (ok) print "V " id " " val
  else print "I " id
}
'

# The raw value of one key inside one group, empty when the file gives none. The
# awk tracks the group rather than matching the key anywhere: a top-level line
# that is not the group's own closes it, while a blank line and a comment at
# column 0 leave it open, which is how a group is written.
group_value() {
  group="$1"
  key="$2"
  [ -f "$cfg" ] || return 0
  awk -v group="$group" -v key="$key" '
/^[^[:space:]#]/ { ingroup = ($0 ~ "^" group "[[:space:]]*:"); next }
ingroup && $0 ~ "^[[:space:]]+" key "[[:space:]]*:" {
  sub(/^[^:]*:[[:space:]]*/, "")
  sub(/[[:space:]#\r].*$/, "")
  print
  exit
}
' "$cfg"
}

# A directory name, or the fallback. The value is one path SEGMENT, and the
# rejection list is what stops a slash, a traversal or an absolute path from
# turning a docs/ layer into somewhere else.
resolve_dir() {
  value="$(group_value directories "$1" || true)"
  case "$value" in
    ''|.|..|*[!A-Za-z0-9._-]*) value="$2" ;;
  esac
  echo "$value"
}

# A tier's rank, 0 for anything that is not one of the four tiers.
tier_rank() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    haiku) echo 1 ;;
    sonnet) echo 2 ;;
    opus) echo 3 ;;
    fable) echo 4 ;;
    *) echo 0 ;;
  esac
}

tier_name() {
  case "$1" in
    1) echo haiku ;;
    2) echo sonnet ;;
    4) echo fable ;;
    *) echo opus ;;
  esac
}

# The --branching report. Nesting is told by indentation alone: the first line
# inside the group fixes the depth of its direct children, the first line under
# `work` or `issue-type-mappings` the depth of theirs. Everything is collected
# first, so a mapping written above the entries it names still resolves.
branching_report() {
  out=""
  if [ -f "$cfg" ]; then
    out="$(awk -v sq="'" '
function unquote(s,  q) {
  q = substr(s, 1, 1)
  if (length(s) >= 3 && (q == sq || q == "\"") && substr(s, length(s)) == q) s = substr(s, 2, length(s) - 2)
  return s
}
/^[^[:space:]#]/ { ingroup = ($0 ~ /^branching[[:space:]]*:/); sec = ""; next }
!ingroup { next }
/^[[:space:]]*(#|$)/ { next }
{
  match($0, /^[[:space:]]*/)
  ind = RLENGTH
  line = substr($0, ind + 1)
  q = substr(line, 1, 1)
  close_at = 0
  if (q == sq || q == "\"") close_at = index(substr(line, 2), q)
  if (close_at > 0) {
    key = substr(line, 2, close_at - 1)
    rest = substr(line, close_at + 2)
  } else {
    key = line
    sub(/[[:space:]]*:.*$/, "", key)
    rest = substr(line, length(key) + 1)
  }
  val = rest
  sub(/^[[:space:]]*:[[:space:]]*/, "", val)
  sub(/[[:space:]#].*$/, "", val)

  if (l1 == 0 || ind <= l1) {
    if (l1 == 0) l1 = ind
    sec = key
    l2 = 0
    if (key == "mode" && !modeset) { mode = tolower(val); modeset = 1 }
    if (key == "base" || key == "name") legacy = 1
    next
  }
  if (sec == "work") {
    if (l2 == 0 || ind <= l2) {
      if (l2 == 0) l2 = ind
      cur = ++n
      ekey[cur] = key
      next
    }
    if ((key == "base" || key == "name" || key == "target") && !((cur, key) in field)) field[cur, key] = val
    next
  }
  if (sec == "issue-type-mappings") {
    if (l2 == 0) l2 = ind
    if (ind > l2) next
    m++
    mtype[m] = key
    mkey[m] = unquote(val)
  }
}
END {
  if (mode != "allowed" && mode != "required") mode = "off"
  print "mode: " mode
  if (legacy) err[++e] = "branching.base and branching.name are no longer read - move them into a branching.work entry"
  split("base name target", fields, " ")
  for (i = 1; i <= n; i++) {
    bad = 0
    if (ekey[i] !~ /^[A-Za-z0-9._-]+$/) { err[++e] = "work entry " ekey[i] ": invalid key: " ekey[i]; bad = 1 }
    for (j = 1; j <= 3; j++) {
      f = fields[j]
      v = field[i, f]
      if (f == "name") v = unquote(v)
      if (v == "") { err[++e] = "work entry " ekey[i] ": missing " f; bad = 1; continue }
      if (f == "name") ok = (v ~ /^[A-Za-z0-9._\/{}-]+$/)
      else ok = (v ~ /^[A-Za-z0-9._\/-]+$/ && v !~ /^[-\/]/ && index(v, "..") == 0)
      if (!ok) { err[++e] = "work entry " ekey[i] ": invalid " f ": " v; bad = 1; continue }
      if (f == "name" && index(v, "{issue}")) { err[++e] = "work entry " ekey[i] ": {issue} is now {issue-number}"; bad = 1 }
      value[f] = v
    }
    if (bad) continue
    valid[ekey[i]] = 1
    nvalid++
    print "entry: " ekey[i] " | base: " value["base"] " | name: " value["name"] " | target: " value["target"]
  }
  for (i = 1; i <= m; i++) {
    if (mkey[i] in valid) print "map: " mtype[i] " | " mkey[i]
    else err[++e] = "issue-type-mappings: " mtype[i] " names no work entry: " mkey[i]
  }
  if (mode != "off" && !nvalid) err[++e] = "no valid branching.work entry"
  for (i = 1; i <= e; i++) print "error: " err[i]
}
' "$cfg" 2>/dev/null || true)"
  fi
  [ -n "$out" ] || out="mode: off"
  printf '%s\n' "$out"
}

if [ "${1:-}" = "--branching" ]; then
  branching_report
  exit 0
fi

src="$cfg"
[ -f "$src" ] || src=/dev/null

if [ "${1:-}" = "--red-check" ]; then
  report="$(awk "$map_prog$collect_prog$redcheck_prog" "$src" 2>/dev/null || true)"
  [ -n "$report" ] || report="$(awk "$map_prog$collect_prog$redcheck_prog" /dev/null)"
  printf '%s\n' "$report"
  exit 0
fi

block="$(awk -v sq="'" "$map_prog$collect_prog$switches_prog" "$src" 2>/dev/null || true)"
[ -n "$block" ] || block="$(awk -v sq="'" "$map_prog$collect_prog$switches_prog" /dev/null)"

loc_bt=""
loc_gi=""
loc_min=""
loc_max=""
loc_ignored=""
overridden=""
if [ -f "$local_cfg" ]; then
  while IFS=' ' read -r tag id val; do
    case "$tag" in
      V)
        case "$id" in
          build.baseline-tests) loc_bt="$val" ;;
          github.issues) loc_gi="$val" ;;
          tiers.min) loc_min="$val" ;;
          tiers.max) loc_max="$val" ;;
        esac
        ;;
      I) loc_ignored="${loc_ignored:+$loc_ignored, }$id" ;;
    esac
  done < <(awk "$local_prog" "$local_cfg" 2>/dev/null || true)
  [ -z "$loc_bt" ] || overridden="${overridden:+$overridden, }build.baseline-tests"
  [ -z "$loc_gi" ] || overridden="${overridden:+$overridden, }github.issues"
  [ -z "$loc_min" ] || overridden="${overridden:+$overridden, }tiers.min"
  [ -z "$loc_max" ] || overridden="${overridden:+$overridden, }tiers.max"
fi

echo "# viber config (resolved)"
if [ -f "$local_cfg" ]; then
  printf '# local: %s | ignored: %s\n' "${overridden:-none}" "${loc_ignored:-none}"
fi
if [ -n "$loc_bt$loc_gi" ]; then
  while IFS= read -r line; do
    case "$line" in
      "build.baseline-tests: "*) [ -z "$loc_bt" ] || line="build.baseline-tests: $loc_bt" ;;
      "github.issues: "*) [ -z "$loc_gi" ] || line="github.issues: $loc_gi" ;;
    esac
    printf '%s\n' "$line"
  done < <(printf '%s\n' "$block")
else
  printf '%s\n' "$block"
fi

agents_dir="$(dirname "$cfg")/agents"
ext_found=""
ext_missing=""
ext_run=""
while IFS=' ' read -r tag par name; do
  if [ "$tag" = V ] && [ -f "$agents_dir/$name.md" ]; then
    if [ "$par" = P ]; then
      ext_run="${ext_run:+$ext_run + }$name"
    else
      [ -z "$ext_run" ] || ext_found="${ext_found:+$ext_found, }$ext_run"
      ext_run=""
      ext_found="${ext_found:+$ext_found, }$name"
    fi
  else
    ext_missing="${ext_missing:+$ext_missing, }$name"
  fi
done < <(awk "$map_prog$ext_prog" "$src" 2>/dev/null || true)
[ -z "$ext_run" ] || ext_found="${ext_found:+$ext_found, }$ext_run"
printf 'build.extensions: %s\n' "${ext_found:-none}"
printf 'build.extensions-missing: %s\n' "${ext_missing:-none}"

printf 'directories.runs: %s\n' "$(resolve_dir runs _specs)"
printf 'directories.specifications: %s\n' "$(resolve_dir specifications specs)"

min="$(tier_rank "$(group_value tiers min || true)")"
max="$(tier_rank "$(group_value tiers max || true)")"
[ "$min" -eq 0 ] && min=1
[ "$max" -eq 0 ] && max=3
[ -z "$loc_min" ] || min="$(tier_rank "$loc_min")"
[ -z "$loc_max" ] || max="$(tier_rank "$loc_max")"
if [ "$min" -gt "$max" ]; then
  min=1
  max=3
fi
printf 'tiers.min: %s\n' "$(tier_name "$min")"
printf 'tiers.max: %s\n' "$(tier_name "$max")"

branching_lines="$(branching_report)"
mode="${branching_lines%%
*}"
mode="${mode#mode: }"

printf 'branching.mode: %s\n' "$mode"

exit 0

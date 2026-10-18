#!/usr/bin/env bash
#
# memory-map.sh - maps the host project's CLAUDE.md cascade, and on --reset
# deletes the nodes and sections it is handed. It is what the memory command loads before
# it decides anything: the routing, the budgets and the uncommitted-work check
# are deterministic, so the model is handed a map instead of walking the tree
# itself and guessing at sizes.
#
# Contract:
#   argv   : none                       -> the map.
#            --reset <path> [<path>...] -> delete those nodes and sections,
#                                          all or none.
#   cwd    : any directory inside the host project - the repository root is
#            resolved here, every path printed is relative to it, and every
#            path handed to --reset is read relative to it. Outside a
#            repository the cwd IS the root and nothing is tracked there.
#   env    : none.
#   stdout : map mode, in this order, one line each:
#              # viber memory map
#              id: 2026-09-22-17-06-39
#              state: none | partial | complete
#              node: docs/CLAUDE.md 4210 chain 11880 ok | OVER-NODE | OVER-CHAIN
#              section: docs/CLAUDE.tests.md 3100 ok | OVER-NODE
#              unlinked: docs/CLAUDE.tests.md
#              orphan: docs/legacy/CLAUDE.md
#              cand: src/api files 37 bytes 91204 toolchain | plain
#              dirty: CLAUDE.md modified | untracked
#              total: nodes 7
#            --reset, one line per file deleted, a node followed by its
#            sections, targets in the order given, then the count:
#              removed: docs/CLAUDE.md
#              removed: docs/CLAUDE.tests.md
#              removed: 2
#            or, when the call is refused and NOTHING was deleted:
#              refused: docs/CLAUDE.md modified | untracked | not-a-node
#   exit   : map mode ALWAYS 0. It is a `!` preload, where a non-zero exit
#            aborts the whole skill load, so a directory that is no repository
#            at all is the empty map rather than an error.
#            --reset: 0 once every target is deleted; 2 on unusable argv (no
#            path, or an unknown first argument - usage on stderr, nothing
#            printed on stdout); 3 when the call was refused.
#
# excluded - memory never maps a path below a directory whose name starts
#            with ".", nor a file the host repository's own ignore rules
#            (.gitignore, .git/info/exclude, core.excludesFile) exclude, even
#            a tracked one: no line of any kind names one, none counts toward
#            a candidate or an orphan, and --reset refuses one as not-a-node.
#            A file whose own name starts with "." is mapped like any other.
# id      - this run's stamp, which the caller spends as .temp/viber/<id>/.
# state   - "none" when no CLAUDE.md is tracked anywhere, "complete" when a
#           root node exists and every candidate directory carries its own
#           node, "partial" otherwise.
# node    - one line per tracked CLAUDE.md still present in the working tree,
#           root first then depth order. The first count is `wc -c` on the
#           file, "chain" that plus every ancestor node up to the root - what
#           a reader loads by the time it reaches this one. OVER-NODE past
#           4000 bytes for the root node CLAUDE.md, which every session
#           loads first, and past 12000 bytes for every other node,
#           OVER-CHAIN past 32000 on the chain, OVER-NODE
#           winning when both hold. A node deleted but not yet committed -
#           staged with `git rm` or plainly `rm`'d - is no node at all: no
#           line here, no dirty line, not counted toward total or state, and
#           its directory is a plain candidate again once it qualifies.
# section - one line per tracked CLAUDE.<topic>.md still present, in the same
#           order: a block of its node moved beside it, read on demand, so it
#           never counts toward any chain. <topic> is lowercase letters,
#           digits and hyphens; CLAUDE.local.md is the user's own auto-loaded
#           file and never a section. OVER-NODE past 12000 bytes.
# unlinked - a section no reader can reach: no node sits beside it, or the
#            text of that node never names its file.
# orphan  - a node with no other tracked file anywhere beneath its directory,
#           its own sections not counted: it documents nothing.
# cand    - a directory that deserves a node and has none: tracked, not
#           excluded, and at depth 1 or 2 at least three
#           tracked files beneath it. Deeper, it directly holds a build
#           manifest (below), or at least twenty tracked files beneath it
#           while it is no passthrough - a directory holding no file of its
#           own and exactly one subdirectory, whose node would only repeat
#           that subdirectory's. The deeper bar is higher because a deep tree
#           carries many small directories a node would not pay for, and the
#           map is read whole on every run. "toolchain" when it directly
#           holds one of package.json, pyproject.toml, setup.py,
#           requirements.txt, go.mod, Cargo.toml, pom.xml, build.gradle,
#           build.gradle.kts, Gemfile, composer.json, mix.exs, pubspec.yaml,
#           CMakeLists.txt, Makefile, or any *.csproj / *.sln; "plain"
#           otherwise. "files" and "bytes" count every tracked file beneath it.
# dirty   - one line per node or section the git index reports modified, or
#           present in the tree and untracked. An untracked node or section
#           is none anywhere else in the map: it is neither counted nor sized.
#           One deleted but not yet committed carries no working-tree file
#           either way, so it is absent rather than dirty - `--reset` alone
#           still treats its uncommitted deletion as "modified" and refuses to
#           touch it again.
#
# A kind of line with nothing to report prints none at all; "total:" always
# prints, counting nodes only. --reset takes a node or a section; a node
# takes every tracked section beside it along. It judges every file it would
# delete before deleting the first one, so one modified or untracked file
# leaves the whole cascade untouched - a user never loses half a layer.
#
set -u

NL='
'
ROOT_BUDGET=4000
NODE_BUDGET=12000
CHAIN_BUDGET=32000
MANIFESTS='package.json pyproject.toml setup.py requirements.txt go.mod Cargo.toml pom.xml build.gradle build.gradle.kts Gemfile composer.json mix.exs pubspec.yaml CMakeLists.txt Makefile'

mode="map"
if [ "$#" -gt 0 ]; then
  case "$1" in
    --reset) mode="reset"; shift ;;
    *) printf 'usage: memory-map.sh [--reset <path> [<path>...]]\n' >&2; exit 2 ;;
  esac
fi

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$root" ] || [ ! -d "$root" ]; then
  root="$(pwd)"
fi
cd "$root" || exit 0

# --- the tracked tree ------------------------------------------------------
# Read with -z: without it git C-quotes and octal-escapes any path carrying a
# non-ASCII character, which would hide that path behind an opening quote.
# One tr pass rather than a read loop appending entry by entry: every append
# copies the whole string, which bash 3.2 (the macOS system shell) turns into
# seconds on a repository of a few thousand files. The command substitution
# strips the final newline, so it is put back: every entry ends in $NL.
# Memory never maps a path below a directory whose name starts with "." nor
# a tracked file the host's own ignore rules exclude (force-added, or tracked
# before its rule): both are cut here, once, so no node, section, candidate
# or orphan is ever drawn from them. The ignored list comes first in the
# stream, ended by one empty record - git never prints an empty path.
tracked="$(
  { git ls-files -z -c -i --exclude-standard 2>/dev/null; printf '\0'; git ls-files -z 2>/dev/null; } | tr '\0' '\n' | awk '
    !list && $0 == "" { list = 1; next }
    !list { ignored[$0] = 1; next }
    $0 == "" || ($0 in ignored) { next }
    {
      n = split($0, seg, "/")
      for (i = 1; i < n; i++) if (substr(seg[i], 1, 1) == ".") next
      print
    }'
)"
[ -z "$tracked" ] || tracked="$tracked$NL"

# True for a path memory never maps, tracked or not: one below a directory
# whose name starts with ".", or one the host's own ignore rules exclude.
is_excluded() {
  case "/$1" in
    */.*/*) return 0 ;;
  esac
  git check-ignore -q --no-index -- "$1" 2>/dev/null
}

is_tracked() {
  case "$NL$tracked" in
    *"$NL$1$NL"*) return 0 ;;
  esac
  return 1
}

is_node() {
  case "$1" in
    CLAUDE.md | */CLAUDE.md) return 0 ;;
  esac
  return 1
}

# True for a section: CLAUDE.<topic>.md, <topic> lowercase letters, digits and
# hyphens, never "local". The letters are spelled out rather than written as
# a range: a range follows the locale in bash 3.2 and can take in capitals.
is_section() {
  base="${1##*/}"
  case "$base" in
    CLAUDE.local.md) return 1 ;;
    CLAUDE.?*.md) ;;
    *) return 1 ;;
  esac
  topic="${base#CLAUDE.}"
  topic="${topic%.md}"
  case "$topic" in
    '' | *[!abcdefghijklmnopqrstuvwxyz0123456789-]*) return 1 ;;
  esac
  return 0
}

# The node a section belongs to: CLAUDE.md in the section's own directory.
node_of() {
  case "$1" in
    */*) printf '%s/CLAUDE.md' "${1%/*}" ;;
    *) printf 'CLAUDE.md' ;;
  esac
}

# True for a node that is both tracked and still present in the working
# tree - a deleted-but-uncommitted node (staged with `git rm` or plainly
# `rm`'d) is neither: measuring it would read a missing file.
is_present_node() {
  is_tracked "$1" && [ -e "$1" ]
}

# The bytes of one file, 0 when it cannot be read.
chars_of() {
  size="$(wc -c < "$1" 2>/dev/null | tr -d '[:space:]')"
  case "$size" in
    '' | *[!0-9]*) printf '0' ;;
    *) printf '%s' "$size" ;;
  esac
}

# True when some tracked file other than $2 lives under the prefix $1 ("" is
# the repository root). A node is an orphan when nothing does: it documents
# no subtree, not even one held in a directory below it. A section directly
# under the prefix belongs to the node itself and is no other file.
holds_other() {
  # One awk pass over the list rather than a shell substitution on it: a host
  # repository holds thousands of tracked files, and bash 3.2 (the macOS
  # system shell) takes seconds to minutes for one ${var/pattern/} over a blob
  # that size, once per node. The prefix is compared with substr() because
  # index() with an empty needle (the root node) answers 1 in BWK awk and 0 in
  # gawk. A prefix ends in "/", so no tracked file ever equals it. awk reads
  # to the end instead of exiting on the first match: an early exit breaks the
  # pipe under printf, which can then print a write error on stderr. The prefix
  # and the node path reach awk through ENVIRON: -v runs escape processing, so
  # a backslash in a directory name would be read as an escape sequence.
  printf '%s' "$tracked" | HOLDS_PREFIX="$1" HOLDS_NODE="$2" awk '
    BEGIN { p = ENVIRON["HOLDS_PREFIX"]; n = ENVIRON["HOLDS_NODE"] }
    !found && $0 != "" && $0 != n && substr($0, 1, length(p)) == p {
      rest = substr($0, length(p) + 1)
      if (rest != "CLAUDE.local.md" && rest ~ /^CLAUDE\.[abcdefghijklmnopqrstuvwxyz0123456789-]+\.md$/) next
      found = 1
    }
    END { exit !found }'
}

# Every tracked section, whether present or not. grep narrows the index to
# the few CLAUDE.*.md paths first, so is_section runs on those alone.
sections="$(
  printf '%s' "$tracked" | grep -E '(^|/)CLAUDE\.[^/]+\.md$' 2>/dev/null | while IFS= read -r entry; do
    is_section "$entry" && printf '%s\n' "$entry"
  done
)"

# The nodes and sections carrying uncommitted work, as "<path> modified" /
# "<path> untracked" lines.
# -uall: the default collapses an untracked directory to its name alone, and
# an untracked node would never be seen. A rename's second record is the old
# path with no status code in front, recognised by the missing separator
# space and skipped.
dirty_nodes=""
while IFS= read -r -d '' record; do
  [ -n "$record" ] || continue
  [ "${record:2:1}" = " " ] || continue
  code="${record:0:2}"
  path="${record:3}"
  is_node "$path" || is_section "$path" || continue
  ! is_excluded "$path" || continue
  if [ "$code" = "??" ]; then
    dirty_nodes="$dirty_nodes$path untracked$NL"
  else
    dirty_nodes="$dirty_nodes$path modified$NL"
  fi
done < <(git status --porcelain -z -uall 2>/dev/null || true)

# --- reset mode ------------------------------------------------------------
# The reason a node cannot be reset, out of the dirty list; nothing at all
# when it carries no uncommitted work.
dirty_reason() {
  while IFS= read -r entry; do
    case "$entry" in
      "$1 "*) printf '%s' "${entry#* }"; return 0 ;;
    esac
  done < <(printf '%s\n' "$dirty_nodes")
  return 1
}

# Queues one file for deletion, once however often it is named, and records
# why it cannot go: $2 when given, else its uncommitted work, else not being
# tracked at all.
queue() {
  case "$NL$targets" in
    *"$NL$1$NL"*) return 0 ;;
  esac
  targets="$targets$1$NL"
  reason="${2:-}"
  [ -n "$reason" ] || reason="$(dirty_reason "$1" || true)"
  if [ -z "$reason" ] && ! is_tracked "$1"; then
    reason="not-a-node"
  fi
  [ -z "$reason" ] || refused="$refused$(printf 'refused: %s %s' "$1" "$reason")$NL"
}

# All or nothing: every file is judged before the first one is deleted, so a
# refused call leaves the cascade exactly as it was. A node takes every
# tracked section beside it along: a section left behind would be
# unreachable.
if [ "$mode" = "reset" ]; then
  if [ "$#" -eq 0 ]; then
    printf 'usage: memory-map.sh --reset <path> [<path>...]\n' >&2
    exit 2
  fi
  targets=""
  refused=""
  for target in "$@"; do
    norm="${target#./}"
    if is_node "$norm"; then
      queue "$norm"
      while IFS= read -r section; do
        [ -n "$section" ] || continue
        [ "$(node_of "$section")" = "$norm" ] || continue
        queue "$section"
      done < <(printf '%s\n' "$sections")
    elif is_section "$norm"; then
      queue "$norm"
    else
      queue "$norm" "not-a-node"
    fi
  done
  if [ -n "$refused" ]; then
    printf '%s' "$refused"
    exit 3
  fi
  removed=0
  while IFS= read -r target; do
    [ -n "$target" ] || continue
    rm -f "$target"
    printf 'removed: %s\n' "$target"
    removed=$(( removed + 1 ))
  done < <(printf '%s\n' "$targets")
  printf 'removed: %d\n' "$removed"
  exit 0
fi

# Every tracked CLAUDE.md still present in the working tree, prefixed with
# its zero-padded depth so a plain `sort` puts the root node first and the
# rest in depth order. One deleted but not yet committed - staged with
# `git rm` or plainly `rm`'d - is skipped here: it is no node at all.
node_lines="$(
  printf '%s' "$tracked" | while IFS= read -r entry; do
    is_node "$entry" || continue
    [ -e "$entry" ] || continue
    slashes="${entry//[!\/]/}"
    printf '%03d %s\n' "${#slashes}" "$entry"
  done | sort
)"

# --- the cascade -----------------------------------------------------------
nodes=0
node_out=""
orphan_out=""
while IFS= read -r line; do
  [ -n "$line" ] || continue
  node="${line#* }"
  nodes=$(( nodes + 1 ))
  own="$(chars_of "$node")"
  chain="$own"
  # Walk up from the node's own directory, adding every ancestor node a
  # reader would already have loaded before reaching this one.
  parent="${node%CLAUDE.md}"
  parent="${parent%/}"
  while [ -n "$parent" ]; do
    case "$parent" in
      */*) parent="${parent%/*}"; ancestor="$parent/CLAUDE.md" ;;
      *) parent=""; ancestor="CLAUDE.md" ;;
    esac
    if is_present_node "$ancestor"; then
      chain=$(( chain + $(chars_of "$ancestor") ))
    fi
  done
  # The root is read by every session before anything else, so it gets the
  # smallest budget; every other node keeps the node budget.
  own_budget="$NODE_BUDGET"
  [ "$node" != "CLAUDE.md" ] || own_budget="$ROOT_BUDGET"
  # The node's own budget wins when both are past: it is the one the reader
  # can act on, and shrinking it shortens every chain below it too.
  budget="ok"
  if [ "$chain" -gt "$CHAIN_BUDGET" ]; then
    budget="OVER-CHAIN"
  fi
  if [ "$own" -gt "$own_budget" ]; then
    budget="OVER-NODE"
  fi
  node_out="$node_out$(printf 'node: %s %s chain %s %s' "$node" "$own" "$chain" "$budget")$NL"
  if ! holds_other "${node%CLAUDE.md}" "$node"; then
    orphan_out="$orphan_out$(printf 'orphan: %s' "$node")$NL"
  fi
done < <(printf '%s\n' "$node_lines")

# --- the sections ----------------------------------------------------------
# Every tracked section still present, in the same depth order as the nodes.
# The owner is judged by its text alone: a section named nowhere in it is
# out of reach, since nothing ever loads a section on its own.
section_out=""
unlinked_out=""
while IFS= read -r line; do
  [ -n "$line" ] || continue
  section="${line#* }"
  own="$(chars_of "$section")"
  budget="ok"
  if [ "$own" -gt "$NODE_BUDGET" ]; then
    budget="OVER-NODE"
  fi
  section_out="$section_out$(printf 'section: %s %s %s' "$section" "$own" "$budget")$NL"
  owner="$(node_of "$section")"
  if ! is_present_node "$owner" || ! grep -qF -- "${section##*/}" "$owner" 2>/dev/null; then
    unlinked_out="$unlinked_out$(printf 'unlinked: %s' "$section")$NL"
  fi
done < <(
  printf '%s\n' "$sections" | while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    [ -e "$entry" ] || continue
    slashes="${entry//[!\/]/}"
    printf '%03d %s\n' "${#slashes}" "$entry"
  done | sort
)

# --- the directories that deserve a node -----------------------------------
# One `wc -c` pass over the mapped tree, attributed to every directory above
# each file inside awk: a host repository holds thousands of tracked files,
# and a `wc` per file would be thousands of processes.
cand_out=""
if [ -n "$tracked" ]; then
  cand_out="$(
    printf '%s' "$tracked" | tr '\n' '\0' | xargs -0 wc -c 2>/dev/null | MANIFEST_LIST="$MANIFESTS" awk '
      function is_manifest(base,   i, n, list) {
        n = split(ENVIRON["MANIFEST_LIST"], list, " ")
        for (i = 1; i <= n; i++) if (base == list[i]) return 1
        return (base ~ /\.csproj$/ || base ~ /\.sln$/)
      }
      function add(dir, size, base, direct) {
        files[dir] += 1
        bytes[dir] += size
        if (direct && base == "CLAUDE.md") node[dir] = 1
        if (direct && is_manifest(base)) tool[dir] = 1
      }
      {
        size = $1 + 0
        sub(/^[ \t]*[0-9]+[ \t]+/, "")
        path = $0
        n = split(path, seg, "/")
        if (n < 2) next
        dir = ""
        for (i = 1; i < n; i++) {
          dir = (i == 1) ? seg[1] : dir "/" seg[i]
          add(dir, size, seg[n], i == n - 1)
          if (i == n - 1) {
            own[dir] = 1
          } else if (!((dir SUBSEP seg[i + 1]) in seen)) {
            seen[dir, seg[i + 1]] = 1
            kids[dir] += 1
          }
        }
      }
      # Depth 1 and 2 need three files. Deeper, a directory needs a manifest
      # of its own, or twenty files while it is no passthrough: no file of
      # its own and a single subdirectory.
      END {
        for (dir in files) {
          if (dir in node) continue
          if (split(dir, part, "/") <= 2) {
            if (files[dir] < 3) continue
          } else if (!(dir in tool)) {
            if (files[dir] < 20 || (!(dir in own) && kids[dir] == 1)) continue
          }
          printf "cand: %s files %d bytes %d %s\n", dir, files[dir], bytes[dir], (dir in tool) ? "toolchain" : "plain"
        }
      }
    ' | sort
  )"
  [ -z "$cand_out" ] || cand_out="$cand_out$NL"
fi

# A node deleted but not yet committed carries no working-tree file either
# way - staged with `git rm` or plainly `rm`'d - so it is no dirty entry: it
# is absent, not modified. --reset still judges it through $dirty_nodes
# itself, unfiltered, so its own refusal is unchanged.
dirty_out=""
while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  path="${entry% *}"
  [ -e "$path" ] || continue
  dirty_out="$dirty_out$(printf 'dirty: %s' "$entry")$NL"
done < <(printf '%s\n' "$dirty_nodes")

# --- the state of the layer ------------------------------------------------
# "complete" is the root node plus a node on every directory that deserves
# one - which is exactly "no candidate left".
state="none"
if [ "$nodes" -gt 0 ]; then
  state="partial"
  if is_present_node "CLAUDE.md" && [ -z "$cand_out" ]; then
    state="complete"
  fi
fi

# --- output ----------------------------------------------------------------
# A kind of line with nothing to report prints none at all.
printf '# viber memory map\n'
printf 'id: %s\n' "$(date +%Y-%m-%d-%H-%M-%S)"
printf 'state: %s\n' "$state"
printf '%s' "$node_out"
printf '%s' "$section_out"
printf '%s' "$unlinked_out"
printf '%s' "$orphan_out"
printf '%s' "$cand_out"
printf '%s' "$dirty_out"
printf 'total: nodes %d\n' "$nodes"
exit 0

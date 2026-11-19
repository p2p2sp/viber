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
#            --targets review|extend|both
#            --targets reset --removed <path> [--removed <path>...]
#                                       -> the target list of a mode, derived
#                                          from the map (see "targets" below).
#            any --targets call + --id <map id> --keep <node path>
#            [--keep <node path>...]    -> the kept targets, briefed (see "keep"
#                                          below).
#            --reconcile --planned <node>,<node>,...
#            [--fix <node> --files <path>,<path>,...]...
#            [--create <node> --files <path>,<path>,...]...
#            [--done <node> --files <path>,...|""]...
#                                       -> the reconcile wave of the nodes the
#                                          write waves left off (see
#                                          "reconcile" below).
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
#            --targets, the target lines, fix lines first, then create lines,
#            then the directive line:
#              target: fix <node> <own> chain <chain> ok | OVER-NODE | OVER-CHAIN
#              target: create <dir>/CLAUDE.md files <n> bytes <n> toolchain | plain
#              target: create <dir>/CLAUDE.md unlinked <section path>
#              target: create <dir>/CLAUDE.md removed
#              target: create CLAUDE.md root
#              NEXT: approve          (or NEXT: none alone, when no target line)
#            --targets with --id and --keep, in place of the target lines:
#              planned: <node>,<node>,...
#              NEXT: memory-auditor   (one block per kept fix target)
#              target: <node>
#              scope: <the directory holding it, . for the root node>
#              out: .temp/viber/<map id>/
#              refs: <plugin root>/references
#              shape: <file>: heading outside the template: <heading>
#              shape: <file>: out of order: <heading>
#              shape: <file>: empty heading: <heading>
#              NEXT: none             (alone after planned:, when no kept target
#                                      is a fix target)
#            --reconcile, one block per off node of the deepest depth no --done
#            flag names, or NEXT: none alone when no such node remains:
#              NEXT: memory-node-writer | wave: <depth>
#              mode: fix
#              node: <node>
#              findings: none
#              planned: <the existing nodes, root first, then by depth>
#              refs: <plugin root>/references
#   exit   : map mode ALWAYS 0. It is a `!` preload, where a non-zero exit
#            aborts the whole skill load, so a directory that is no repository
#            at all is the empty map rather than an error.
#            --reset: 0 once every target is deleted; 2 on unusable argv (no
#            path, or an unknown first argument - usage on stderr, nothing
#            printed on stdout); 3 when the call was refused.
#            --targets: 0; 2 on unusable argv (an unknown mode, a --removed
#            path outside reset, reset with no --removed path, --keep without
#            --id, --id without --keep, any other argument) or a --keep path
#            that is no target of the mode, with one "error: <reason>" line on
#            stderr and nothing on stdout.
#            --reconcile: 0; 2 on unusable argv (no --planned, --planned twice,
#            a --files with no --fix, --create or --done before it, --files
#            twice for one dispatch, any other argument), with one
#            "error: <reason>" line on stderr and nothing on stdout.
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
# targets - what the memory command audits or writes, derived from the map as
#           it stands, so --targets reset runs on the map taken after the
#           deletion. review: one fix line per node line. extend: the create
#           lines. both: the fix lines, then the create lines. reset: the
#           create lines of candidates and of --removed paths alone.
#           A create line is one of four forms, one line per directory and the
#           first form to claim the directory keeping it: a candidate; the
#           directory of an unlinked section with no node beside it; a
#           directory a --removed node or section emptied (the root among
#           them), none when a node still stands there; the repository root
#           when no root node stands (extend and both only). A directory
#           holding a section on a dirty line gets no create line.
# keep    - the targets the user kept, each named by its node path (a fix
#           target is a node line, a create target the CLAUDE.md of its
#           directory). planned: is every node line of the map plus the node of
#           every kept create target, root first then by depth. A kept fix
#           target gets one memory-auditor block, in that order. Its shape lines
#           are the form departures of the node and of each tracked section
#           beside it, the node first and its sections alphabetically, within a
#           file in line order, judged against the template list below: a
#           ## heading outside it, a listed one followed later by one the list
#           puts ahead of it, and one with nothing but blank lines before the
#           next # or ## line (a ### line is content). A ## line inside a
#           fenced block is no heading. The root node and the sections beside
#           it are outside the template and get none. The list, in order:
#           Terms, Relationships, Contracts, Commands, Change together, Traps,
#           Sections - the last one only in a node, never in a section.
#
# reconcile - judges the nodes the write waves left off, from the tree as it
#           stands: it reads the working tree alone (a node is there or not,
#           tracked or not) and never the map. A --fix or --create dispatch is
#           a write wave one that returned VERDICT: UPDATED, a --done one a
#           reconcile dispatch that returned, any verdict; --files names the
#           paths its return listed, only the CLAUDE.md among them counting.
#           Each dispatch created every CLAUDE.md of its --files present in
#           the tree that is its own node on --create or lies outside
#           --planned, deleted every one absent from it, and wrote every one
#           present. The existing nodes are the --planned paths present plus
#           the present CLAUDE.md of a write wave --files outside --planned;
#           the root is never off, and only an existing node is. An existing
#           node a write wave dispatch wrote is off when the existing nodes
#           below its directory differ from the --planned ones below it plus
#           the ones that dispatch created; one no write wave dispatch wrote
#           is off when any write wave dispatch created or deleted a node below
#           its directory. A --done return never changes which nodes are off,
#           judged from the tree as the write waves left it (a node a --done
#           dispatch deleted counted, one it created not): it only keeps its
#           node out of the next call, and planned: counts the nodes it
#           created and drops the ones it deleted. The call prints the off nodes of the deepest
#           depth no --done flag names, a block each; the depth of a node is
#           the number of path segments of its directory, the root being 0.
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
    --targets) mode="targets"; shift ;;
    --reconcile) mode="reconcile"; shift ;;
    *) printf 'usage: memory-map.sh [--reset <path> [<path>...]]\n' >&2; exit 2 ;;
  esac
fi

usage_error() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

# The --targets and --reconcile argv are judged before anything else, so a
# refused call prints nothing on stdout.
tmode=""
removed_paths=""
map_id=""
keep_paths=""
plugin_root=""
rc_planned=""
rc_have_planned=0
rc_raw=""
rc_open=0
rc_kind=""
rc_node=""
rc_files=""
rc_files_given=0

# Closes the dispatch being read: one raw record of kind, node and files, the
# fields joined by the unit separator, a byte no path holds.
US="$(printf '\037')"
rc_flush() {
  [ "$rc_open" = "1" ] || return 0
  rc_raw="$rc_raw$rc_kind$US$rc_node$US$rc_files$NL"
  rc_open=0
}

if [ "$mode" = "reconcile" ]; then
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --planned)
        [ "$#" -ge 2 ] && [ -n "$2" ] || usage_error "--planned needs a node list"
        [ "$rc_have_planned" = "0" ] || usage_error "--planned given twice"
        rc_have_planned=1
        rc_planned="$2"
        shift 2
        ;;
      --fix | --create | --done)
        [ "$#" -ge 2 ] && [ -n "$2" ] || usage_error "$1 needs a node path"
        rc_flush
        rc_open=1
        rc_kind="${1#--}"
        rc_node="${2#./}"
        rc_files=""
        rc_files_given=0
        shift 2
        ;;
      --files)
        [ "$rc_open" = "1" ] || usage_error "--files needs a --fix, --create or --done before it"
        [ "$rc_files_given" = "0" ] || usage_error "--files given twice for $rc_node"
        [ "$#" -ge 2 ] || usage_error "--files needs a path list, \"\" for none"
        rc_files="$2"
        rc_files_given=1
        shift 2
        ;;
      *) usage_error "unknown argument $1" ;;
    esac
  done
  rc_flush
  [ "$rc_have_planned" = "1" ] || usage_error "--reconcile needs --planned"
  plugin_root="$(cd "$(dirname "$0")/../../.." 2>/dev/null && pwd)"
fi

if [ "$mode" = "targets" ]; then
  [ "$#" -gt 0 ] || usage_error "--targets needs a mode: review, extend, both or reset"
  tmode="$1"
  shift
  case "$tmode" in
    review | extend | both | reset) ;;
    *) usage_error "unknown mode $tmode: review, extend, both or reset" ;;
  esac
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --removed)
        [ "$#" -ge 2 ] && [ -n "$2" ] || usage_error "--removed needs a path"
        [ "$tmode" = "reset" ] || usage_error "--removed belongs to the reset mode alone"
        removed_paths="$removed_paths${2#./}$NL"
        shift 2
        ;;
      --id)
        [ "$#" -ge 2 ] && [ -n "$2" ] || usage_error "--id needs a map id"
        [ -z "$map_id" ] || usage_error "--id given twice"
        map_id="$2"
        shift 2
        ;;
      --keep)
        [ "$#" -ge 2 ] && [ -n "$2" ] || usage_error "--keep needs a node path"
        keep_paths="$keep_paths${2#./}$NL"
        shift 2
        ;;
      *) usage_error "unknown argument $1" ;;
    esac
  done
  if [ "$tmode" = "reset" ] && [ -z "$removed_paths" ]; then
    usage_error "reset needs at least one --removed path"
  fi
  if [ -n "$keep_paths" ] && [ -z "$map_id" ]; then
    usage_error "--keep needs --id"
  fi
  if [ -n "$map_id" ] && [ -z "$keep_paths" ]; then
    usage_error "--id needs at least one --keep path"
  fi
  # The plugin root is three directories above this script's own, resolved
  # before the cd to the repository root below.
  plugin_root="$(cd "$(dirname "$0")/../../.." 2>/dev/null && pwd)"
fi

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$root" ] || [ ! -d "$root" ]; then
  root="$(pwd)"
fi
cd "$root" || exit 0

is_node() {
  case "$1" in
    CLAUDE.md | */CLAUDE.md) return 0 ;;
  esac
  return 1
}

# --- reconcile mode --------------------------------------------------------
# Every set is a comma-joined list of paths, which hold no comma: --files and
# --planned arrive that way, and a node is told from another by its path alone.
# The helpers answer in $rc_out, never by a command substitution, so they run
# in this shell. Each loop is fed through a process substitution, one item per
# line, the final newline kept so that read returns the last item too.
csv_has() {
  case ",$1," in
    *",$2,"*) return 0 ;;
  esac
  return 1
}

# $1 with the item $2 added once.
csv_add() {
  if [ -z "$1" ]; then
    rc_out="$2"
  elif csv_has "$1" "$2"; then
    rc_out="$1"
  else
    rc_out="$1,$2"
  fi
}

# $1 with every item of $2 added once.
csv_merge() {
  rc_acc="$1"
  while IFS= read -r rc_item; do
    [ -n "$rc_item" ] || continue
    csv_add "$rc_acc" "$rc_item"
    rc_acc="$rc_out"
  done < <(printf '%s\n' "$2" | tr ',' '\n')
  rc_out="$rc_acc"
}

# The items of $1 strictly below the directory prefix $2 (ending in "/"), the
# node $3 left out.
csv_below() {
  rc_acc=""
  while IFS= read -r rc_item; do
    [ -n "$rc_item" ] || continue
    [ "$rc_item" != "$3" ] || continue
    case "$rc_item" in
      "$2"*) csv_add "$rc_acc" "$rc_item"; rc_acc="$rc_out" ;;
    esac
  done < <(printf '%s\n' "$1" | tr ',' '\n')
  rc_out="$rc_acc"
}

# True when every item of $1 is an item of $2.
csv_within() {
  while IFS= read -r rc_item; do
    [ -n "$rc_item" ] || continue
    csv_has "$2" "$rc_item" || return 1
  done < <(printf '%s\n' "$1" | tr ',' '\n')
  return 0
}

# The items of $1 as one comma-joined list, root first then by depth, each
# depth in path order.
csv_by_depth() {
  rc_sorted=""
  while IFS= read -r rc_line; do
    [ -n "$rc_line" ] || continue
    rc_sorted="$rc_sorted${rc_line#* },"
  done < <(
    while IFS= read -r rc_item; do
      [ -n "$rc_item" ] || continue
      rc_slashes="${rc_item//[!\/]/}"
      printf '%03d %s\n' "${#rc_slashes}" "$rc_item"
    done < <(printf '%s\n' "$1" | tr ',' '\n') | LC_ALL=C sort
  )
  rc_out="${rc_sorted%,}"
}

if [ "$mode" = "reconcile" ]; then
  planned=""
  while IFS= read -r rc_item; do
    [ -n "${rc_item#./}" ] || continue
    csv_add "$planned" "${rc_item#./}"
    planned="$rc_out"
  done < <(printf '%s\n' "$rc_planned" | tr ',' '\n')

  # The --done dispatches first: the nodes they name, the CLAUDE.md of their
  # --files they created (present, outside the plan) and the ones they
  # deleted (absent). The write wave records below read the tree as the write
  # waves left it, a node a --done dispatch deleted counting as present.
  done_nodes=""
  done_made=""
  done_gone=""
  while IFS="$US" read -r kind dnode files; do
    [ "$kind" = "done" ] || continue
    csv_add "$done_nodes" "$dnode"
    done_nodes="$rc_out"
    while IFS= read -r file; do
      file="${file#./}"
      [ -n "$file" ] || continue
      is_node "$file" || continue
      if [ ! -e "$file" ]; then
        csv_add "$done_gone" "$file"
        done_gone="$rc_out"
      elif ! csv_has "$planned" "$file"; then
        csv_add "$done_made" "$file"
        done_made="$rc_out"
      fi
    done < <(printf '%s\n' "$files" | tr ',' '\n')
  done < <(printf '%s' "$rc_raw")

  # One record per write wave dispatch: kind, node, then the CLAUDE.md of its
  # --files present (written), the ones it created and the ones it deleted.
  records=""
  extra=""
  while IFS="$US" read -r kind dnode files; do
    [ -n "$kind" ] || continue
    [ "$kind" != "done" ] || continue
    written=""
    created=""
    deleted=""
    while IFS= read -r file; do
      file="${file#./}"
      [ -n "$file" ] || continue
      is_node "$file" || continue
      if [ -e "$file" ] || csv_has "$done_gone" "$file"; then
        csv_add "$written" "$file"
        written="$rc_out"
        if { [ "$kind" = "create" ] && [ "$file" = "$dnode" ]; } || ! csv_has "$planned" "$file"; then
          csv_add "$created" "$file"
          created="$rc_out"
        fi
      else
        csv_add "$deleted" "$file"
        deleted="$rc_out"
      fi
    done < <(printf '%s\n' "$files" | tr ',' '\n')
    records="$records$kind$US$dnode$US$written$US$created$US$deleted$NL"
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      csv_has "$planned" "$file" || { csv_add "$extra" "$file"; extra="$rc_out"; }
    done < <(printf '%s\n' "$written" | tr ',' '\n')
  done < <(printf '%s' "$rc_raw")

  # The existing nodes the off judgement reads: the planned paths plus the
  # write wave ones outside the plan, present as the write waves left the
  # tree. The planned: line of the next wave counts the tree as it stands:
  # those present now plus the nodes a --done dispatch created.
  existing=""
  now=""
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if [ -e "$file" ]; then
      csv_add "$now" "$file"
      now="$rc_out"
    elif ! csv_has "$done_gone" "$file"; then
      continue
    fi
    csv_add "$existing" "$file"
    existing="$rc_out"
  done < <(printf '%s\n' "$planned,$extra" | tr ',' '\n')
  csv_merge "$now" "$done_made"
  csv_by_depth "$rc_out"
  next_planned="$rc_out"

  off=""
  while IFS= read -r target; do
    [ -n "$target" ] || continue
    [ "$target" != "CLAUDE.md" ] || continue
    dir="${target%CLAUDE.md}"
    csv_below "$existing" "$dir" "$target"
    below_now="$rc_out"
    wrote=0
    touched=0
    made_below=""
    while IFS="$US" read -r kind dnode written created deleted; do
      [ -n "$kind" ] || continue
      csv_below "$created" "$dir" "$target"
      made="$rc_out"
      csv_below "$deleted" "$dir" "$target"
      [ -z "$made$rc_out" ] || touched=1
      if csv_has "$written" "$target"; then
        wrote=1
        csv_merge "$made_below" "$made"
        made_below="$rc_out"
      fi
    done < <(printf '%s' "$records")
    if [ "$wrote" = "1" ]; then
      csv_below "$planned" "$dir" "$target"
      csv_merge "$rc_out" "$made_below"
      if csv_within "$below_now" "$rc_out" && csv_within "$rc_out" "$below_now"; then
        continue
      fi
      csv_add "$off" "$target"
      off="$rc_out"
    elif [ "$touched" = "1" ]; then
      csv_add "$off" "$target"
      off="$rc_out"
    fi
  done < <(printf '%s\n' "$existing" | tr ',' '\n')

  # The off nodes no --done flag names, the deepest depth of them alone.
  pending=""
  while IFS= read -r target; do
    [ -n "$target" ] || continue
    csv_has "$done_nodes" "$target" || { csv_add "$pending" "$target"; pending="$rc_out"; }
  done < <(printf '%s\n' "$off" | tr ',' '\n')
  csv_by_depth "$pending"
  pending="$rc_out"
  deepest=-1
  while IFS= read -r target; do
    [ -n "$target" ] || continue
    slashes="${target//[!\/]/}"
    deepest="${#slashes}"
  done < <(printf '%s\n' "$pending" | tr ',' '\n')
  if [ "$deepest" -lt 0 ]; then
    printf 'NEXT: none\n'
    exit 0
  fi
  while IFS= read -r target; do
    [ -n "$target" ] || continue
    slashes="${target//[!\/]/}"
    [ "${#slashes}" = "$deepest" ] || continue
    printf 'NEXT: memory-node-writer | wave: %s\nmode: fix\nnode: %s\nfindings: none\nplanned: %s\nrefs: %s/references\n' "$deepest" "$target" "$next_planned" "$plugin_root"
  done < <(printf '%s\n' "$pending" | tr ',' '\n')
  exit 0
fi

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

# --- the targets of a mode -------------------------------------------------
# Fix targets are the node lines, create targets the other four forms. Each
# directory gets one create line, and the form that claims it first keeps it:
# candidate, then unlinked section, then removed, then root. $create_seen holds
# the node path of every directory claimed, and a directory holding a section
# on a dirty line is claimed up front: that section is the user's own work.
create_seen=""
while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  path="${entry#dirty: }"
  path="${path% *}"
  is_section "$path" || continue
  create_seen="$create_seen$(node_of "$path")$NL"
done < <(printf '%s' "$dirty_out")

# One create line for the node path $1, its text after the path being $2.
create_target() {
  case "$NL$create_seen" in
    *"$NL$1$NL"*) return 0 ;;
  esac
  create_seen="$create_seen$1$NL"
  create_out="$create_out$(printf 'target: create %s %s' "$1" "$2")$NL"
}

# The shape lines of one file, $2 being node or section: its ## headings
# outside the template list, listed ones followed later by one the list puts
# ahead of them, and empty ones. A ## line inside a fenced block is no heading,
# and a fence line is content. The file label and kind reach awk through
# ENVIRON, and the file as ./<path> so that a name holding "=" is no assignment.
shape_lines() {
  SHAPE_LABEL="${1##*/}" SHAPE_KIND="$2" awk '
    BEGIN {
      n = split("Terms|Relationships|Contracts|Commands|Change together|Traps|Sections", names, "|")
      for (i = 1; i <= n; i++) {
        if (i == n && ENVIRON["SHAPE_KIND"] != "node") continue
        rank[names[i]] = i
      }
      label = ENVIRON["SHAPE_LABEL"]
      fence = ""
      flen = 0
      cur = 0
      count = 0
    }
    {
      line = $0
      sub(/\r$/, "", line)
      probe = line
      sub(/^ */, "", probe)
      if (fence != "") {
        if (cur > 0) empty[cur] = 0
        if (match(probe, /^(```+|~~~+)/) && substr(probe, 1, 1) == fence && RLENGTH >= flen && substr(probe, RLENGTH + 1) ~ /^[ \t]*$/) fence = ""
        next
      }
      if (match(probe, /^(```+|~~~+)/)) {
        fence = substr(probe, 1, 1)
        flen = RLENGTH
        if (cur > 0) empty[cur] = 0
        next
      }
      if (line ~ /^## /) {
        count++
        text = substr(line, 4)
        sub(/[ \t]+$/, "", text)
        head[count] = text
        empty[count] = 1
        cur = count
        next
      }
      if (line ~ /^# /) {
        cur = 0
        next
      }
      if (cur > 0 && line !~ /^[ \t]*$/) empty[cur] = 0
    }
    END {
      for (i = 1; i <= count; i++) {
        h = head[i]
        if (!(h in rank)) {
          printf "shape: %s: heading outside the template: %s\n", label, h
        } else {
          ahead = 0
          for (j = i + 1; j <= count; j++) if ((head[j] in rank) && rank[head[j]] < rank[h]) ahead = 1
          if (ahead) printf "shape: %s: out of order: %s\n", label, h
        }
        if (empty[i]) printf "shape: %s: empty heading: %s\n", label, h
      }
    }
  ' "./$1" 2>/dev/null
}

append_shape() {
  shapes="$(shape_lines "$1" "$2")"
  [ -z "$shapes" ] || keep_out="$keep_out$shapes$NL"
}

if [ "$mode" = "targets" ]; then
  fix_out=""
  create_out=""
  if [ "$tmode" = "review" ] || [ "$tmode" = "both" ]; then
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue
      fix_out="$fix_out$(printf 'target: fix %s' "${entry#node: }")$NL"
    done < <(printf '%s' "$node_out")
  fi
  if [ "$tmode" != "review" ]; then
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue
      rest="${entry#cand: }"
      create_target "${rest%% *}/CLAUDE.md" "${rest#* }"
    done < <(printf '%s' "$cand_out")
  fi
  if [ "$tmode" = "extend" ] || [ "$tmode" = "both" ]; then
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue
      section="${entry#unlinked: }"
      is_present_node "$(node_of "$section")" && continue
      create_target "$(node_of "$section")" "unlinked $section"
    done < <(printf '%s' "$unlinked_out")
  fi
  if [ "$tmode" = "reset" ]; then
    # A removed node or section empties its directory only when no node is
    # left there: the removed section of a surviving node empties nothing.
    while IFS= read -r removed; do
      [ -n "$removed" ] || continue
      if is_node "$removed"; then
        owner="$removed"
      elif is_section "$removed"; then
        owner="$(node_of "$removed")"
      else
        continue
      fi
      ! is_excluded "$removed" || continue
      ! is_present_node "$owner" || continue
      create_target "$owner" "removed"
    done < <(printf '%s' "$removed_paths")
  fi
  if [ "$tmode" = "extend" ] || [ "$tmode" = "both" ]; then
    is_present_node "CLAUDE.md" || create_target "CLAUDE.md" "root"
  fi
  if [ -n "$keep_paths" ]; then
    # Every kept path must be the node of a target line, or nothing is printed.
    valid=""
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue
      rest="${entry#target: * }"
      valid="$valid${rest%% *}$NL"
    done < <(printf '%s%s' "$fix_out" "$create_out")
    while IFS= read -r keep; do
      [ -n "$keep" ] || continue
      case "$NL$valid" in
        *"$NL$keep$NL"*) ;;
        *) usage_error "--keep $keep is no target of the $tmode mode" ;;
      esac
    done < <(printf '%s' "$keep_paths")

    # The planned set: every node of the map plus the node of each kept create
    # target, each prefixed with its zero-padded depth for a plain sort.
    planned_src="$node_lines$NL"
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue
      case "$entry" in
        "target: create "*) ;;
        *) continue ;;
      esac
      rest="${entry#target: create }"
      created="${rest%% *}"
      case "$NL$keep_paths" in
        *"$NL$created$NL"*) ;;
        *) continue ;;
      esac
      slashes="${created//[!\/]/}"
      planned_src="$planned_src$(printf '%03d %s' "${#slashes}" "$created")$NL"
    done < <(printf '%s' "$create_out")
    planned=""
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue
      planned="$planned${entry#* },"
    done < <(printf '%s\n' "$planned_src" | sort)
    keep_out="planned: ${planned%,}$NL"

    # One memory-auditor block per kept fix target, in the order of the fix lines.
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue
      rest="${entry#target: fix }"
      fix="${rest%% *}"
      case "$NL$keep_paths" in
        *"$NL$fix$NL"*) ;;
        *) continue ;;
      esac
      scope="${fix%CLAUDE.md}"
      scope="${scope%/}"
      [ -n "$scope" ] || scope="."
      keep_out="$keep_out$(printf 'NEXT: memory-auditor\ntarget: %s\nscope: %s\nout: .temp/viber/%s/\nrefs: %s/references' "$fix" "$scope" "$map_id" "$plugin_root")$NL"
      # The root node and its sections are outside the template.
      if [ "$fix" != "CLAUDE.md" ]; then
        append_shape "$fix" node
        while IFS= read -r section; do
          [ -n "$section" ] || continue
          [ "$(node_of "$section")" = "$fix" ] || continue
          [ -e "$section" ] || continue
          append_shape "$section" section
        done < <(printf '%s\n' "$sections" | LC_ALL=C sort)
      fi
      has_block=1
    done < <(printf '%s' "$fix_out")
    [ "${has_block:-0}" = "1" ] || keep_out="${keep_out}NEXT: none$NL"
    printf '%s' "$keep_out"
    exit 0
  fi
  if [ -z "$fix_out$create_out" ]; then
    printf 'NEXT: none\n'
  else
    printf '%s%sNEXT: approve\n' "$fix_out" "$create_out"
  fi
  exit 0
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

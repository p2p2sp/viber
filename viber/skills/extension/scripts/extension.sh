#!/usr/bin/env bash
#
# extension.sh - the facts and the one write the `extension` skill needs: which
# agents the host project has, which of them carry the extension marker, what
# `build.extensions` lists, and the registration of one more name.
#
# It exists because the skill must not parse `.claude/viber.yml` or read every
# agent file itself: the list state comes from config.sh, the one parser of
# that file, and the one insertion of a map entry is a deterministic text
# change, so a model never rewrites the configuration by hand.
#
# The file is resolved against the REPOSITORY ROOT, like config.sh: a session
# started in a subdirectory still finds the project's own `.claude/`. Outside a
# repository the cwd is the base.
#
# Contract:
#   argv   : none -> the report below. `--add <name>` -> register <name>.
#            Anything else -> the report.
#   cwd    : any directory inside the host project - the repository root is
#            resolved here. Outside a repository, the cwd is the base.
#   env    : none.
#   file   : <root>/.claude/viber.yml (read; `--add` inserts two lines into its
#            `extensions:` map), <root>/.claude/agents/*.md (read). No other
#            file is read or written.
#   stdout : no argument -> these lines, in this order:
#              CONFIG=ok | no-config | stale
#              LISTED=<name>, <name> | none
#              MISSING=<name>, <name> | none
#              AGENT=<name> | contract | plain
#            CONFIG is `no-config` without a viber.yml, `stale` when the file
#            has no `extensions:` key directly under `build:` or that key
#            carries an inline value (`extensions: {}`), else `ok`.
#            LISTED is config.sh's `build.extensions` steps with every ` + `
#            written as `, `: a plain list of the entries with an agent file in
#            run order. MISSING is `build.extensions-missing`: the entries
#            without one (or invalid), `none` when empty. AGENT is one
#            line per .claude/agents/*.md, sorted by name (byte order), the name
#            being the file name without `.md`; `contract` when the file holds a
#            line that is exactly `<!-- viber:extension -->` (trailing blanks
#            allowed), else `plain`.
#            `--add <name>` -> one line:
#              STATUS=added | present | no-config | stale | invalid-name
#            invalid-name: <name> does not match `^[a-z0-9][a-z0-9-]*$`. Then
#            no-config, then stale (as CONFIG). present: the name is already an
#            entry of the `extensions:` map, wherever its agent file stands and
#            whatever its option - nothing is written. added: two lines go in
#            after the last map line that is neither blank nor a comment (right
#            after the `extensions:` line when the map holds none): the entry
#            `<name>:` at the map's entry depth (the `extensions:` line's
#            indentation plus two spaces for an empty map) and, two spaces
#            deeper, `parallel: false`. Both lines end in CR LF when the
#            `extensions:` line does; every other line, a comment on the
#            `extensions:` line included, stays byte-identical. Every refusal
#            leaves every file untouched.
#   exit   : ALWAYS 0 (a refusal is a STATUS= line; the caller reads stdout only).
#
set -u

script_dir="$(dirname "${BASH_SOURCE[0]}")"
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$repo_root" ] && [ -d "$repo_root" ]; then
  cfg="$repo_root/.claude/viber.yml"
else
  cfg=".claude/viber.yml"
fi
agents_dir="$(dirname "$cfg")/agents"

# The extension map under `build:`, found by the same rule as config.sh (the
# mapline function below is a copy of its one): the first `extensions:` key line
# among the indented lines of `build:` owns the map, whose lines run up to the
# first line neither blank nor a comment indented no deeper than that key line.
# The first key line of the map sets the entry depth; a key line at that depth
# is an entry named by the key. The name arrives as ENVIRON["EXT_NAME"], the
# mode as ENVIRON["EXT_WRITE"]. Mode 0 prints `P` when the name is an entry,
# `A` when the key is there without it, nothing when there is no key or the key
# line carries an inline value other than a comment. Mode 1
# prints three lines: the number of the line the new entry goes after (the last
# map line that is neither blank nor a comment, else the key line), the number
# of the key line, and the entry indentation followed by a `|`. The splice
# itself is done by the shell, because some awk builds read a CR LF file in text
# mode and drop its CR.
ext_prog='
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
BEGIN { name = ENVIRON["EXT_NAME"]; write = (ENVIRON["EXT_WRITE"] == "1") }
{
  line = $0
  sub(/\r$/, "", line)
  m = mapline(line)
  if (m == 2) {
    haskey = 1
    extline = NR
    match(line, /^[[:space:]]*/)
    extpre = substr(line, 1, RLENGTH)
    v = line
    sub(/^[^:]*:/, "", v)
    sub(/^[[:space:]]+/, "", v)
    noentry = (v != "" && v !~ /^#/)
    next
  }
  if (m != 1 || line ~ /^[[:space:]]*(#|$)/) next
  lastkeep = NR
  if (noentry) next
  match(line, /^[[:space:]]*/)
  ind = RLENGTH
  rest = substr(line, ind + 1)
  c = index(rest, ":")
  if (c == 0) next
  key = substr(rest, 1, c - 1)
  sub(/[[:space:]]+$/, "", key)
  if (key == "") next
  if (entind == 0) { entind = ind; entpre = substr(line, 1, ind) }
  if (ind == entind && key == name) found = 1
}
END {
  if (!write) { if (haskey && !noentry) print (found ? "P" : "A"); exit }
  print (lastkeep ? lastkeep : extline)
  print extline
  print (entind ? entpre : extpre "  ") "|"
}
'

state() {
  [ -f "$cfg" ] || { echo no-config; return 0; }
  probe="$(EXT_NAME="$1" EXT_WRITE=0 awk "$ext_prog" "$cfg" 2>/dev/null || true)"
  case "$probe" in
    P) echo present ;;
    A) echo ok ;;
    *) echo stale ;;
  esac
}

add_name() {
  name="${1:-}"
  case "$name" in
    ''|-*|*[!a-z0-9-]*) echo "STATUS=invalid-name"; return 0 ;;
  esac
  st="$(state "$name")"
  case "$st" in
    no-config) echo "STATUS=no-config" ;;
    stale) echo "STATUS=stale" ;;
    present) echo "STATUS=present" ;;
    *)
      tmp="$(mktemp 2>/dev/null || true)"
      info="$(EXT_NAME="$name" EXT_WRITE=1 awk "$ext_prog" "$cfg" 2>/dev/null || true)"
      at=""
      extl=""
      pre=""
      { IFS= read -r at; IFS= read -r extl; IFS= read -r pre; } < <(printf '%s\n' "$info")
      pre="${pre%|}"
      cr=""
      if [ "$(( $(head -n "${extl:-0}" "$cfg" 2>/dev/null | tail -n 1 | tr -cd '\r' | wc -c) ))" -gt 0 ]; then
        cr=$'\r'
      fi
      total=$(( $(wc -l < "$cfg" 2>/dev/null || echo 0) ))
      if [ -n "$tmp" ] && [ -n "$at" ] && [ -n "$extl" ] && {
        head -n "$at" "$cfg"
        [ "$at" -le "$total" ] || printf '%s\n' "$cr"
        printf '%s\n' "$pre$name:$cr" "$pre  parallel: false$cr"
        tail -n +"$((at + 1))" "$cfg"
      } > "$tmp" 2>/dev/null; then
        cat "$tmp" > "$cfg"
        echo "STATUS=added"
      else
        echo "STATUS=stale"
      fi
      [ -z "$tmp" ] || rm -f "$tmp"
      ;;
  esac
}

report() {
  st="$(state "")"
  case "$st" in
    no-config|stale) echo "CONFIG=$st" ;;
    *) echo "CONFIG=ok" ;;
  esac
  listed=none
  missing=none
  while IFS= read -r line; do
    case "$line" in
      "build.extensions: "*) listed="${line#build.extensions: }" ;;
      "build.extensions-missing: "*) missing="${line#build.extensions-missing: }" ;;
    esac
  done < <(bash "$script_dir/../../../scripts/config.sh" 2>/dev/null || true)
  echo "LISTED=${listed// + /, }"
  echo "MISSING=$missing"
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    if grep -q '^<!-- viber:extension -->[[:space:]]*$' "$agents_dir/$name.md" 2>/dev/null; then
      echo "AGENT=$name | contract"
    else
      echo "AGENT=$name | plain"
    fi
  done < <(
    for f in "$agents_dir"/*.md; do
      [ -f "$f" ] || continue
      b="${f##*/}"
      printf '%s\n' "${b%.md}"
    done | LC_ALL=C sort
  )
}

if [ "${1:-}" = "--add" ]; then
  add_name "${2:-}"
else
  report
fi

exit 0

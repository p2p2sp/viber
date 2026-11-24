#!/usr/bin/env bash
#
# merge-settings.sh - merges the bundled permissions template into the host
# project's .claude/settings.json: the wrapper that runs merge-settings.ts beside
# it, and the plain copies that need no node when PATH holds none.
#
# The merge rules, the create and the reset live in merge-settings.ts and
# viber/lib/merge-settings.ts. The part below the node call repeats the create
# and the reset as plain copies, so a host without node still gets its settings;
# a change to either goes to both.
#
# Contract:
#   argv   : [--reset] <template> [<target>], handed to merge-settings.ts as
#            given; how they are read is defined in its header.
#   cwd    : any directory inside the host project; the default target is
#            .claude/settings.json at the repository root, the cwd itself outside
#            a repository.
#   env    : PATH; a `node` on it (22.18 or newer, which runs a .ts file) does
#            everything.
#   file   : merge-settings.ts beside it, found from the invoked path with either
#            separator (a C:\ spelling included), and viber/lib/ three
#            directories up.
#   writes : the target; on --reset of an existing one also
#            <root>/.temp/viber/setup/settings.json.bak.
#   stdout : what merge-settings.ts prints. Without node the same lines for a
#            created, a reset and a missing template, and for a target that
#            exists, never merged without node:
#              settings.json: node not found - merge skipped, recommended block:
#            followed by the template, the block a user merges by hand.
#   exit   : that of merge-settings.ts. Without node 0 created, reset or skipped;
#            1 template missing or a wrong argument count; 2 the backup or the
#            write failed.
#
set -u

if command -v node >/dev/null 2>&1; then
  exec node "${0%[/\\]*}/merge-settings.ts" "$@"
fi

reset=0
if [ "${1:-}" = "--reset" ]; then
  reset=1
  shift
fi
template="${1:-}"
root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$root" ] || [ ! -d "$root" ]; then
  root="$(pwd)"
fi
target="${2:-$root/.claude/settings.json}"

if [ -z "$template" ] || [ "$#" -gt 2 ]; then
  echo "usage: merge-settings.sh [--reset] <template> [<target>]" >&2
  exit 1
fi

if [ ! -r "$template" ]; then
  echo "settings.json: template missing at $template - skipped"
  exit 1
fi

# A target that does not exist yet is simply created: there is nothing to back up.
if [ "$reset" = 1 ]; then
  note=""
  if [ -f "$target" ]; then
    backup_dir="$root/.temp/viber/setup"
    if ! err="$(mkdir -p "$backup_dir" 2>&1 && cp "$target" "$backup_dir/settings.json.bak" 2>&1)"; then
      echo "settings.json: backup failed - left untouched ($(printf '%s' "$err" | tr '\n' ' '))"
      exit 2
    fi
    note=" (previous file saved to .temp/viber/setup/settings.json.bak)"
  fi
  mkdir -p "$(dirname "$target")" 2>/dev/null
  if cp "$template" "$target.tmp" 2>/dev/null && mv -f "$target.tmp" "$target" 2>/dev/null; then
    if [ -n "$note" ]; then
      echo "settings.json: reset from template$note"
    else
      echo "settings.json: created from template"
    fi
    exit 0
  fi
  rm -f "$target.tmp" 2>/dev/null
  echo "settings.json: write failed (cannot write $target)"
  exit 2
fi

if [ ! -f "$target" ]; then
  mkdir -p "$(dirname "$target")" 2>/dev/null
  if cp "$template" "$target" 2>/dev/null; then
    echo "settings.json: created from template"
    exit 0
  fi
  echo "settings.json: write failed (cannot create $target)"
  exit 2
fi

# JSON is never merged with a text editor: the block is printed instead.
echo "settings.json: node not found - merge skipped, recommended block:"
cat "$template"
exit 0

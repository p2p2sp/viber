#!/usr/bin/env bash
#
# bootstrap.sh - seeds the host project for a viber run. Idempotent: it
# never overwrites a file the project already carries, so a second run is a
# no-op that still reports the truth.
#
# It is one script rather than a handful of inline commands because a `!` preload
# is permission-checked as ONE command: a compound `test && cp && grep` would ask
# for approval per member and stall the skill load on any mode that does not
# auto-accept.
#
# Contract:
#   argv   : none.
#   cwd    : any directory inside the host project - the repository root is
#            resolved here. Outside a repository, the cwd is the base (`pwd -W`
#            in Git Bash, so the printed path is the C:/ form a Windows reader
#            opens as written).
#   env    : none.
#   writes : <root>/.claude/viber.yml (copied from templates/viber.yml
#                                      only when absent; an existing one is
#                                      never read or changed)
#            <root>/.gitignore        (seeded from templates/gitignore.txt when the
#                                      project has none, otherwise ".temp/" is
#                                      appended only when no rule ignores it)
#   reads  : <root>/.claude/settings.json (never written - compared byte for
#                                      byte with templates/settings.json; the
#                                      skill asks reset or merge only when it
#                                      differs)
#            <root>/CLAUDE.md         (existence only, never read, never written -
#                                      the skill reads its content through the
#                                      absolute path printed below)
#            gh on PATH               (existence only - never run, never
#                                      installed; viber talks to GitHub
#                                      through it)
#   stdout : one result line per item - the skill carries them into its report
#            verbatim and never re-verifies them. The settings line is
#            exactly "settings.json: absent", "settings.json: matches the template
#            (left untouched)" (byte-identical to the template) or
#            "settings.json: present" (any difference, or the template missing).
#            The CLAUDE.md line is exactly
#            "CLAUDE.md: present - <root>/CLAUDE.md" (<root> as
#            `git rev-parse --show-toplevel` prints it, or the cwd base outside a
#            repository) or "CLAUDE.md: missing".
#            After the gh line, at most one directive line, <plugin root> being
#            the directory three levels above this script's own, spelled as the
#            script was invoked (plugin-root.sh: `C:/...` for `C:\...` or
#            `C:/...`, `/c/...` for `/c/...`): for "settings.json: present",
#            `ASK: merge -> "<plugin
#            root>/skills/setup/scripts/merge-settings.sh" "<plugin
#            root>/skills/setup/templates/settings.json" | reset -> "<plugin
#            root>/skills/setup/scripts/merge-settings.sh" --reset "<plugin
#            root>/skills/setup/templates/settings.json"`; for "settings.json:
#            absent", the merge command alone as `RUN: ...`; none for a settings
#            file matching the template.
#   exit   : ALWAYS 0. A preload that exits non-zero aborts the whole skill load,
#            and a project that refuses one of these files is not a broken setup.
#
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template="$here/../templates/viber.yml"
template_gitignore="$here/../templates/gitignore.txt"
template_settings="$here/../templates/settings.json"

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$root" ] || [ ! -d "$root" ]; then
  root="$(pwd -W 2>/dev/null || pwd)"
fi

cfg="$root/.claude/viber.yml"
if [ -f "$cfg" ]; then
  echo "viber.yml: already present (left untouched)"
elif [ ! -f "$template" ]; then
  echo "viber.yml: template missing at $template - nothing written"
else
  mkdir -p "$root/.claude" 2>/dev/null
  if cp "$template" "$cfg" 2>/dev/null; then
    echo "viber.yml: seeded from template"
  else
    echo "viber.yml: could not write $cfg"
  fi
fi

# A project with no .gitignore gets the bundled one, which already carries
# .temp/. One that has its own keeps it: the only edit is the .temp/ rule the
# run needs, appended on its own line even when the file ends without one.
ignore="$root/.gitignore"
if [ ! -f "$ignore" ]; then
  if [ ! -f "$template_gitignore" ]; then
    if printf '.temp/\n' > "$ignore" 2>/dev/null; then
      echo ".gitignore: created with .temp/ - template missing at $template_gitignore"
    else
      echo ".gitignore: could not write $ignore"
    fi
  elif cp "$template_gitignore" "$ignore" 2>/dev/null; then
    echo ".gitignore: created from template (ignores .temp/)"
  else
    echo ".gitignore: could not write $ignore"
  fi
elif grep -qE '^[[:space:]]*(\*\*/|/)?\.temp(/(\*\*?)?)?[[:space:]]*$' "$ignore"; then
  echo ".gitignore: already ignores .temp/"
else
  if [ -s "$ignore" ] && [ -n "$(tail -c1 "$ignore")" ]; then
    printf '\n' >> "$ignore" 2>/dev/null
  fi
  if printf '.temp/\n' >> "$ignore" 2>/dev/null; then
    echo ".gitignore: .temp/ appended"
  else
    echo ".gitignore: could not write $ignore"
  fi
fi

# Reported, never written: merge-settings.sh owns this file, and an existing one
# that differs from the template makes the skill ask whether to reset it or
# merge into it. A byte-identical one has nothing to merge or reset, so the
# question is skipped. A byte compare needs no node; a file that differs only in
# formatting is reported present and asked about, never silently passed.
settings="absent"
if [ -f "$root/.claude/settings.json" ]; then
  if [ -f "$template_settings" ] && cmp -s "$template_settings" "$root/.claude/settings.json"; then
    settings="matches"
    echo "settings.json: matches the template (left untouched)"
  else
    settings="present"
    echo "settings.json: present"
  fi
else
  echo "settings.json: absent"
fi

# Reported, never created: a skeleton written by a script would name no build
# or test command, the very thing every agent reads here. The skill, not the
# script, judges what the file says, hence the absolute path in the line.
if [ -f "$root/CLAUDE.md" ]; then
  echo "CLAUDE.md: present - $root/CLAUDE.md"
else
  echo "CLAUDE.md: missing"
fi

# Reported, never installed: a missing gh is a note, not a failed setup.
if command -v gh >/dev/null 2>&1; then
  echo "gh: present"
else
  echo "gh: missing - install the GitHub CLI (https://cli.github.com), then run gh auth login"
fi

# The directive line the skill acts on as printed. Every command path is the
# plugin root, three directories above this script's own, in the spelling the
# script was invoked by (plugin-root.sh).
. "$here/../../../scripts/plugin-root.sh"
plugin_root="$(plugin_root_of "$0" 3)"
merge_cmd="\"$plugin_root/skills/setup/scripts/merge-settings.sh\""
settings_tpl="\"$plugin_root/skills/setup/templates/settings.json\""
case $settings in
  present) echo "ASK: merge -> $merge_cmd $settings_tpl | reset -> $merge_cmd --reset $settings_tpl" ;;
  absent) echo "RUN: $merge_cmd $settings_tpl" ;;
esac

exit 0

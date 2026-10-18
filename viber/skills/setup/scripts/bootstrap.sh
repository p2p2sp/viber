#!/usr/bin/env bash
#
# bootstrap.sh - seeds the host project for a viber run, and brings a config
# seeded by an older version up to the current template. Idempotent: it never
# overwrites a value the project already carries, so a second run is a no-op
# that still reports the truth.
#
# It is one script rather than a handful of inline commands because a `!` preload
# is permission-checked as ONE command: a compound `test && cp && grep` would ask
# for approval per member and stall the skill load on any mode that does not
# auto-accept.
#
# The config is MERGED rather than left alone, because a new version ships new
# switches: a file seeded once by an older one would never see them, and a user
# reading the README for a switch their own file does not carry has no way to
# turn it on. The merge is additive in one direction only - a key the template
# has and the file lacks is appended with the template's own comment and default
# value; every key the file already declares keeps its value, its comment and
# its position, and a key the template dropped is left standing. Hence `false`
# is the one way to turn a switch off: a deleted or commented-out top-level key,
# or a child of `planning:`, `build:`, `github:` or `directories:`, is restored
# at the template's default the next run. A child of `tiers:` or `branching:` is
# the exception: the merge only appends one of those groups whole when it is
# missing entirely, never extends one already present, so a deleted child there
# is not restored - it just resolves to its default in config.sh.
#
# The one edit that is not additive is the layout migration: a legacy flat
# switch (written at column 0 before the switches were grouped) is moved into
# its group with its own value, and the `schema:` line is added or raised to the
# template's number - never lowered, so a file written by a newer viber keeps
# its number. config.sh reads a switch only inside its group, so a flat line
# left standing would silently count as off.
#
# `build.baseline-tests` takes off, fast or full. A legacy `true` becomes `full`
# and `false` becomes `off` (any letter case, a trailing comment kept) in a moved
# flat line, and in a grouped one only when the file sits below the template's
# schema: a file already at it keeps whatever value it carries.
#
# Contract:
#   argv   : none.
#   cwd    : any directory inside the host project - the repository root is
#            resolved here. Outside a repository, the cwd is the base (`pwd -W`
#            in Git Bash, so the printed path is the C:/ form a Windows reader
#            opens as written).
#   env    : none.
#   writes : <root>/.claude/viber.yml (copied from templates/viber.yml when
#                                      absent; otherwise merged as above, the
#                                      merged text staged in a sibling temp file
#                                      and moved over the config in one step, so
#                                      a failed merge leaves the original)
#            <root>/.gitignore        (seeded from templates/gitignore.txt when the
#                                      project has none, otherwise ".temp/" is
#                                      appended only when no rule ignores it;
#                                      then ".claude/viber.local.yml", the
#                                      personal overrides file, is appended on
#                                      its own line only when it is not ignored
#                                      yet: `git check-ignore` run at the
#                                      repository root decides inside a
#                                      repository, a line reading exactly that
#                                      path outside one)
#   reads  : <root>/.claude/settings.json (never written - compared byte for
#                                      byte with templates/settings.json; the
#                                      skill asks reset or merge only when it
#                                      differs)
#            <root>/CLAUDE.md         (existence only, never read, never written -
#                                      the skill reads its content through the
#                                      absolute path printed below)
#            gh on PATH               (existence only - never run, never
#                                      installed; viber talks to GitHub through it)
#   stdout : one result line per item - the skill carries them into its report
#            verbatim and never re-verifies them. A changed viber.yml prints
#            "migrated to schema <n>: <keys> moved into their groups (your own
#            values kept)" when a flat switch moved, else "schema set to <n>"
#            when only the schema line was added or raised, then
#            "build.baseline-tests <old> -> <new> (the switch takes off, fast or
#            full)" when that value was rewritten, then "merged from
#            the template: <keys> (your own values kept)" for every group
#            appended or child restored at its default. The settings line is
#            exactly "settings.json: absent", "settings.json: matches the template
#            (left untouched)" (byte-identical to the template) or
#            "settings.json: present" (any difference, or the template missing).
#            Right after the .temp/ ".gitignore:" line, when the file exists and
#            does not ignore the overrides file yet, exactly one of
#            ".gitignore: .claude/viber.local.yml appended" or ".gitignore:
#            could not write <root>/.gitignore"; nothing when it is ignored.
#            The CLAUDE.md line is exactly
#            "CLAUDE.md: present - <root>/CLAUDE.md" (<root> as
#            `git rev-parse --show-toplevel` prints it, or the cwd base outside a
#            repository) or "CLAUDE.md: missing".
#   exit   : ALWAYS 0. A preload that exits non-zero aborts the whole skill load,
#            and a project that refuses one of these files is not a broken setup.
#
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template="$here/../templates/viber.yml"
template_gitignore="$here/../templates/gitignore.txt"
template_settings="$here/../templates/settings.json"

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
git_root="$root"
if [ -z "$root" ] || [ ! -d "$root" ]; then
  root="$(pwd -W 2>/dev/null || pwd)"
  git_root=""
fi

# The merge reads the template first and the config second. A key is read with
# config.sh's own grammar - blanks allowed before the colon - so a key the
# resolver sees is never taken for a missing one and appended a second time,
# which would override the user's value there. In one pass it:
#  - moves every legacy flat switch (a column-0 key the template now keeps in
#    a group) into its group with its value: the key line and the comment
#    block directly above it go, and a blank line left doubled by the removal
#    goes with them. A grouped twin already in the file wins and the flat line
#    is only dropped. A flat key whose group carries a value rather than a
#    group is left where it is: there is nowhere safe to move it. A group
#    header may carry a trailing comment (`build: # mine`), as config.sh reads it.
#  - adds the template's `schema:` block when the config has none (above the
#    first top-level key it keeps, else first among the appended blocks), and
#    raises a lower or non-numeric number in place; a higher one stands.
#  - appends the block of every other top-level key the config does not
#    declare - the key line plus the comment lines directly above it - a moved
#    value replacing the template default of its child.
#  - inserts the missing children of the `planning:`, `build:`, `github:` and
#    `directories:` groups inside that group, after its last child, with the
#    child's own comment: a moved value where there is one, else the default.
#    A group carrying a value rather than children is left untouched: only the
#    shape the template ships can be extended safely. The lines of the
#    `build.extensions` map (every line below its key up to the first one that is
#    neither blank nor a comment and sits no deeper than the key, config.sh's own
#    rule) are no children of `build:`: an entry named like a switch never
#    counts as that switch, and a restored child lands after the map.
#    `tiers:` and `branching:`
#    are appended whole when absent and never extended: a missing child
#    resolves to its default in config.sh.
# A config written with CRLF endings comes back with one ending throughout,
# never a mix: an awk that hands the merge its CR keeps CRLF, one reading in
# text mode (Git-Bash) rewrites the file LF. A mixed file is the one outcome
# that would corrupt it, since a line-based reader takes a stray CR as part of
# the value. It always writes the result to `out`, and prints one report line
# per kind of change only when it changed something: the moved keys, else the
# schema it set, then the keys it added at their default.
merge_config() {
  awk -v out="$2" '
    function emit(x) { print x > out; np++; lb = (x ~ /^[ \t\r]*$/) }
    function rw(s,   val, tail) {
      rn = ""
      val = s; sub(/[ \t\r]*(#.*)?$/, "", val)
      tail = substr(s, length(val) + 1)
      ro = tolower(val)
      if (ro == "true") rn = "full"
      else if (ro == "false") rn = "off"
      else return s
      bts = "build.baseline-tests " ro " -> " rn " (the switch takes off, fast or full)"
      return rn tail
    }
    BEGIN {
      n = split("adr planning plain-plan-review planning fast-path planning baseline-tests build final-review build memory build rules build qa build cleanup build issues github", m, " ")
      for (i = 1; i < n; i += 2) legacy[m[i]] = m[i + 1]
      ext["planning"] = 1; ext["build"] = 1; ext["github"] = 1; ext["directories"] = 1
    }
    FNR == NR { t[FNR] = $0; tn = FNR; next }
    { h[FNR] = $0; hn = FNR; if ($0 ~ /\r$/) crlf = 1 }
    END {
      eol = (crlf ? "\r" : "")
      for (i = 1; i <= tn; i++) {
        if (t[i] !~ /^schema[ \t]*:/) continue
        ts = t[i]; sub(/^schema[ \t]*:[ \t]*/, "", ts); sub(/[^0-9].*$/, "", ts)
        break
      }
      for (i = 1; i <= hn; i++) {
        if (h[i] !~ /^[A-Za-z_][A-Za-z0-9_-]*[ \t]*:/) continue
        k = h[i]; sub(/[ \t]*:.*$/, "", k)
        if (k in legacy) { flat[++nf] = i; continue }
        if (!(k in have) && k == "schema") hs = i
        have[k] = 1
        if (first == 0) first = i
        if (!(k in ext) || h[i] !~ /^[A-Za-z_][A-Za-z0-9_-]*[ \t]*:[ \t\r]*(#.*)?$/ || (k in last)) continue
        last[k] = i
        ms = 0
        for (j = i + 1; j <= hn; j++) {
          if (ms == 1) {
            if (h[j] ~ /^[ \t]*#/ || h[j] ~ /^[ \t\r]*$/) continue
            match(h[j], /^[ \t]*/)
            if (RLENGTH > mind) { last[k] = j; continue }
            ms = 2
          }
          if (h[j] ~ /^[ \t]+[A-Za-z_][A-Za-z0-9_-]*[ \t]*:/) {
            c = h[j]; sub(/^[ \t]+/, "", c); sub(/[ \t]*:.*$/, "", c)
            have[k "." c] = 1
            if (k == "build" && c == "baseline-tests" && bt == 0) bt = j
            last[k] = j
            if (k == "build" && c == "extensions" && ms == 0) { match(h[j], /^[ \t]*/); mind = RLENGTH; ms = 1 }
          } else if (h[j] !~ /^[ \t]*#/ && h[j] !~ /^[ \t\r]*$/) {
            break
          }
        }
      }
      for (x = 1; x <= nf; x++) {
        i = flat[x]
        k = h[i]; sub(/[ \t]*:.*$/, "", k)
        g = legacy[k]
        if ((g in have) && !(g in last)) continue
        drop[i] = 1
        for (j = i - 1; j >= 1 && h[j] ~ /^#/ && !(j in drop); j--) drop[j] = 1
        if (!(k in seen)) { seen[k] = 1; moved = (moved == "" ? k : moved ", " k) }
        if (((g "." k) in have) || ((g "." k) in mv)) continue
        v = h[i]; sub(/^[^:]*:[ \t]*/, "", v); sub(/[ \t\r]+$/, "", v)
        if (k == "baseline-tests") v = rw(v)
        mv[g "." k] = (v == "" ? ":" : ": " v)
      }
      if (ts != "" && hs > 0) {
        v = h[hs]; sub(/^schema[ \t]*:[ \t]*/, "", v); sub(/[ \t\r]*(#.*)?$/, "", v)
        if (v !~ /^[0-9]+$/ || v + 0 < ts + 0) { raise = hs; sset = 1 }
      }
      if (bt > 0 && ts != "" && (hs == 0 || raise > 0)) {
        match(h[bt], /^[ \t]+baseline-tests[ \t]*:[ \t]*/)
        pre = substr(h[bt], 1, RLENGTH)
        nv = rw(substr(h[bt], RLENGTH + 1))
        if (rn != "") btline = pre nv
      }
      for (i = 1; i <= tn; i++) {
        if (t[i] !~ /^[A-Za-z_][A-Za-z0-9_-]*[ \t]*:/) continue
        k = t[i]; sub(/[ \t]*:.*$/, "", k)
        start = i
        while (start > 1 && t[start - 1] ~ /^#/) start--
        end = i
        while (end < tn && t[end + 1] ~ /^[ \t]+[^ \t]/) end++
        if (k == "schema" && !(k in have)) {
          sset = 1
          if (first > 0) {
            for (j = start; j <= end; j++) sb[++nsb] = t[j]
            sb[++nsb] = ""
            at = first
            while (at > 1 && h[at - 1] ~ /^#/) at--
          } else {
            for (j = start; j <= end; j++) add[++na] = t[j]
          }
        } else if (!(k in have)) {
          added = (added == "" ? k : added ", " k)
          add[++na] = ""
          for (j = start; j <= end; j++) {
            line = t[j]
            if (line ~ /^[ \t]+[A-Za-z_][A-Za-z0-9_-]*[ \t]*:/) {
              c = line; sub(/^[ \t]+/, "", c); sub(/[ \t]*:.*$/, "", c)
              match(line, /^[ \t]+/)
              if ((k "." c) in mv) line = substr(line, 1, RLENGTH) c mv[k "." c]
            }
            add[++na] = line
          }
        } else if (k in last) {
          for (j = i + 1; j <= end; j++) {
            if (t[j] !~ /^[ \t]+[A-Za-z_][A-Za-z0-9_-]*[ \t]*:/) continue
            c = t[j]; sub(/^[ \t]+/, "", c); sub(/[ \t]*:.*$/, "", c)
            if ((k "." c) in have) continue
            cs = j
            while (cs > i + 1 && t[cs - 1] ~ /^[ \t]+#/) cs--
            for (q = cs; q < j; q++) ins[k, ++ni[k]] = t[q]
            if ((k "." c) in mv) {
              match(t[j], /^[ \t]+/)
              ins[k, ++ni[k]] = substr(t[j], 1, RLENGTH) c mv[k "." c]
            } else {
              ins[k, ++ni[k]] = t[j]
              added = (added == "" ? k "." c : added ", " k "." c)
            }
          }
        }
        i = end
      }
      pd = 0
      for (i = 1; i <= hn; i++) {
        if (i == at) for (j = 1; j <= nsb; j++) emit(sb[j] eol)
        if (i in drop) { pd = 1; continue }
        if (pd && h[i] ~ /^[ \t\r]*$/ && (np == 0 || lb)) continue
        pd = 0
        emit(i == raise ? "schema: " ts eol : (i == bt && btline != "") ? btline : h[i])
        for (g in ext) if (last[g] == i) for (j = 1; j <= ni[g]; j++) emit(ins[g, j] eol)
      }
      for (j = 1; j <= na; j++) if (add[j] != "" || np > 0) emit(add[j] eol)
      close(out)
      if (moved != "") print "migrated to schema " ts ": " moved " moved into their groups (your own values kept)"
      else if (sset) print "schema set to " ts
      if (bts != "") print bts
      if (added != "") print "merged from the template: " added " (your own values kept)"
    }
  ' "$1" "$3" 2>/dev/null
}

cfg="$root/.claude/viber.yml"
if [ ! -f "$template" ]; then
  echo "viber.yml: template missing at $template - nothing written"
elif [ ! -f "$cfg" ]; then
  mkdir -p "$root/.claude" 2>/dev/null
  if cp "$template" "$cfg" 2>/dev/null; then
    echo "viber.yml: seeded from template - every switch is commented in it"
  else
    echo "viber.yml: could not write $cfg"
  fi
else
  staged="$cfg.viber-merge.$$"
  report="$(merge_config "$template" "$staged" "$cfg" || true)"
  if [ ! -s "$staged" ]; then
    rm -f "$staged" 2>/dev/null
    echo "viber.yml: could not merge the template into $cfg (left untouched)"
  elif [ -z "$report" ]; then
    rm -f "$staged" 2>/dev/null
    echo "viber.yml: already present and complete (left untouched)"
  elif mv "$staged" "$cfg" 2>/dev/null; then
    while IFS= read -r line; do
      echo "viber.yml: $line"
    done < <(printf '%s\n' "$report")
  else
    rm -f "$staged" 2>/dev/null
    echo "viber.yml: could not merge the template into $cfg (left untouched)"
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

# The personal overrides file is never committed: an existing .gitignore with no
# rule for it gets the entry. Inside a repository git itself answers whether the
# file is ignored (any pattern, any ignore source), asked at the repository root
# whatever the cwd; outside one only a line reading exactly the path counts.
# Nothing is printed when it is already ignored.
local_entry=".claude/viber.local.yml"
if [ -f "$ignore" ]; then
  if [ -n "$git_root" ]; then
    git -C "$root" check-ignore -q "$local_entry" >/dev/null 2>&1 && local_ignored=1 || local_ignored=0
  else
    grep -qE '^[[:space:]]*\.claude/viber\.local\.yml[[:space:]]*$' "$ignore" 2>/dev/null && local_ignored=1 || local_ignored=0
  fi
  if [ "$local_ignored" = 0 ]; then
    if [ -s "$ignore" ] && [ -n "$(tail -c1 "$ignore")" ]; then
      printf '\n' >> "$ignore" 2>/dev/null
    fi
    if printf '%s\n' "$local_entry" >> "$ignore" 2>/dev/null; then
      echo ".gitignore: $local_entry appended"
    else
      echo ".gitignore: could not write $ignore"
    fi
  fi
fi

# Reported, never written: merge-settings.sh owns this file, and an existing one
# that differs from the template makes the skill ask whether to reset it or
# merge into it. A byte-identical one has nothing to merge or reset, so the
# question is skipped. A byte compare needs no node; a file that differs only in
# formatting is reported present and asked about, never silently passed.
if [ -f "$root/.claude/settings.json" ]; then
  if [ -f "$template_settings" ] && cmp -s "$template_settings" "$root/.claude/settings.json"; then
    echo "settings.json: matches the template (left untouched)"
  else
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

exit 0

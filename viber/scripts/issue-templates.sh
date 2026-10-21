#!/bin/sh
#
# issue-templates.sh - decides whether this repository can save an interview's
# or a triage's conclusions as a new GitHub issue and, when it can, lists
# every issue form template with the fields a caller needs to pick one and
# build a `gh issue create` call.
#
# It exists so a caller makes that decision, and reads every template's
# fields, through ONE pre-approved command with a fixed output shape: a
# hand-composed `find` + `gh repo view` + YAML read is several unapproved
# commands, and an issue form's YAML (labels/assignees/projects each
# writable as an inline list, a block of `- item` lines, or one comma
# string) is exactly the kind of deterministic, fixed-format parsing a
# script does once rather than a fork re-deriving it on every run.
#
# Contract:
#   argv   : none. Any argument -> exit 2, nothing on stdout, gh never called.
#   cwd    : anywhere inside the repository. The repository root is resolved
#            here (`git rev-parse --show-toplevel`); outside a repository
#            (or with no `git` on PATH) the cwd itself is used as the root,
#            so the templates lookup below simply finds none there.
#   env    : none of its own; gh reads its usual auth and host config.
#   file   : <repo root>/.claude/viber.yml, only through the sibling
#            config.sh run by `bash` (its `github.issue-title` line). No file,
#            no bash or no line -> `{summary}`.
#   temp   : one temp file from mktemp in system temp, falls back to $TMPDIR
#            or /tmp, cleaned by EXIT trap.
#   stdout : the three checks below run in order and the first one that
#            fails ends the run right there:
#              1. <repo root>/.github/ISSUE_TEMPLATE/*.yml or *.yaml exist,
#                 other than config.yml/config.yaml (a `.md` template or any
#                 other file in that directory is not one of these and is
#                 never counted or listed);
#              2. gh is on PATH;
#              3. `gh repo view` resolves a repository.
#            On any failing check:
#              STATUS=skip
#              REASON=no-templates|no-gh|no-repo
#            On every check passing, in file name order:
#              STATUS=ready
#              REPO=<repository url>
#              TITLE_PATTERN=<github.issue-title as config.sh prints it>
#              --- template <repo-relative path> ---
#              NAME=<name>
#              DESCRIPTION=<description>
#              TYPE=<type or empty>
#              TITLE=<title or empty>
#              LABELS=<name>, <name>        (empty when none)
#              ASSIGNEES=<login>, <login>   (empty when none)
#              PROJECTS=<project>, <project> (empty when none)
#            the `--- template` block repeated per template. Only these seven top-level keys (column 0
#            in the template file) are read; a same-named key nested under
#            `body:` or anywhere else indented is not top-level and is
#            ignored. A value's surrounding quotes are stripped and its CR is
#            stripped either way it is written: inline (`[a, "b"]`), across
#            lines from a `[` to a later `]`, as a block of `- a` lines under
#            the key (full-line comments between the items are skipped), or as
#            one comma-separated string. A YAML comment (a `#` at the line
#            start or after a blank, outside quotes) is cut from every line.
#   exit   : 0 on both STATUS=ready and STATUS=skip; 2 on any argument.
#
set -u

if [ $# -ne 0 ]; then
  echo "ERROR issue-templates.sh: takes no arguments" >&2
  exit 2
fi

root=$(git rev-parse --show-toplevel 2>/dev/null) || root=""
[ -n "$root" ] || root="."
dir="$root/.github/ISSUE_TEMPLATE"

listf=$(mktemp 2>/dev/null) || listf="${TMPDIR:-/tmp}/p2p2-issue-templates.$$"
: > "$listf" 2>/dev/null || true
trap 'rm -f "$listf"' EXIT

found=0
for f in "$dir"/*.yml "$dir"/*.yaml; do
  [ -e "$f" ] || continue
  base=$(basename "$f")
  case "$base" in
    config.yml | config.yaml) continue ;;
  esac
  printf '%s\n' "$f" >>"$listf"
  found=1
done

if [ "$found" -eq 0 ]; then
  echo "STATUS=skip"
  echo "REASON=no-templates"
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "STATUS=skip"
  echo "REASON=no-gh"
  exit 0
fi

repo_url=$(gh repo view --json url --jq .url 2>/dev/null)
repo_url=$(printf '%s' "$repo_url" | tr -d '\r\n')
if [ -z "$repo_url" ]; then
  echo "STATUS=skip"
  echo "REASON=no-repo"
  exit 0
fi

sort -o "$listf" "$listf"

here=$(dirname -- "$0")
title_pattern=$(bash "$here/config.sh" 2>/dev/null | sed -n 's/^github\.issue-title: //p')
[ -n "$title_pattern" ] || title_pattern="{summary}"

echo "STATUS=ready"
echo "REPO=$repo_url"
echo "TITLE_PATTERN=$title_pattern"

while IFS= read -r f; do
  [ -n "$f" ] || continue
  rel=${f#"$root"/}
  echo "--- template $rel ---"
  # No awk user-defined functions and no doubled parenthesis anywhere below:
  # both read as bash-only syntax to the repo's static #!/bin/sh sweep, which
  # cannot tell an awk `function` keyword or an `if ((a) && (b))` from the
  # bash constructs of the same shape, so the quote-stripping and list-item
  # logic is repeated inline (three top-level keys hold a list) rather than
  # factored into a helper.
  tr -d '\r' <"$f" | awk '
    BEGIN {
      SQ = sprintf("%c", 39)
      islist["labels"] = 1
      islist["assignees"] = 1
      islist["projects"] = 1
      curlist = ""
      inflow = ""
    }
    {
      # Cut a YAML comment: a hash at the line start or after a blank, outside
      # quotes. A quote opens only at the line start or after a blank, bracket,
      # comma or colon, so an apostrophe inside a word opens nothing.
      src = $0
      line = ""
      q = ""
      srcn = length(src)
      for (p = 1; p <= srcn; p++) {
        ch = substr(src, p, 1)
        if (p > 1) prev = substr(src, p - 1, 1)
        else prev = " "
        if (q != "") {
          if (ch == q) q = ""
        } else {
          if (ch == "#" && (prev == " " || prev == "\t")) break
          isq = 0
          if (ch == "\"" || ch == SQ) isq = 1
          if (isq == 1 && index(" \t[,:", prev) > 0) q = ch
        }
        line = line ch
      }
      mode = ""
      if (inflow != "") {
        content = line
        sub(/^[[:space:]]+/, "", content)
        sub(/[[:space:]]+$/, "", content)
        if (substr(content, length(content), 1) == "]") {
          content = substr(content, 1, length(content) - 1)
          target = inflow
          inflow = ""
        } else {
          target = inflow
        }
        mode = "items"
      } else if (match(line, /^[A-Za-z_][A-Za-z0-9_-]*:/)) {
        key = substr(line, 1, RLENGTH - 1)
        rest = substr(line, RLENGTH + 1)
        curlist = ""
        if (key == "name" || key == "description" || key == "type" || key == "title") {
          v = rest
          sub(/^[[:space:]]+/, "", v)
          sub(/[[:space:]]+$/, "", v)
          n = length(v)
          if (n >= 2) {
            c = substr(v, 1, 1)
            e = substr(v, n, 1)
            if (c == e && (c == "\"" || c == SQ)) v = substr(v, 2, n - 2)
          }
          scalar[key] = v
        } else if (key in islist) {
          rest2 = rest
          sub(/^[[:space:]]+/, "", rest2)
          sub(/[[:space:]]+$/, "", rest2)
          if (rest2 == "") {
            curlist = key
          } else {
            content = rest2
            target = key
            if (substr(content, 1, 1) == "[") {
              sub(/^\[/, "", content)
              if (substr(content, length(content), 1) == "]") content = substr(content, 1, length(content) - 1)
              else inflow = key
            }
            mode = "items"
          }
        }
      } else if (curlist != "") {
        if (match(line, /^[[:space:]]*-[[:space:]]*/)) {
          content = substr(line, RLENGTH + 1)
          sub(/^[[:space:]]+/, "", content)
          sub(/[[:space:]]+$/, "", content)
          target = curlist
          mode = "one"
        } else {
          trimmed = line
          sub(/^[[:space:]]+/, "", trimmed)
          sub(/[[:space:]]+$/, "", trimmed)
          if (trimmed != "") curlist = ""
        }
      }
      if (mode == "") next
      if (mode == "one") {
        nitems = 1
        arr[1] = content
      } else {
        nitems = split(content, arr, ",")
      }
      for (ii = 1; ii <= nitems; ii++) {
        item = arr[ii]
        sub(/^[[:space:]]+/, "", item)
        sub(/[[:space:]]+$/, "", item)
        m = length(item)
        if (m >= 2) {
          cc = substr(item, 1, 1)
          ee = substr(item, m, 1)
          if (cc == ee && (cc == "\"" || cc == SQ)) item = substr(item, 2, m - 2)
        }
        if (item != "") {
          if (listn[target] > 0) list[target] = list[target] ", " item
          else list[target] = item
          listn[target]++
        }
      }
    }
    END {
      printf "NAME=%s\n", scalar["name"]
      printf "DESCRIPTION=%s\n", scalar["description"]
      printf "TYPE=%s\n", scalar["type"]
      printf "TITLE=%s\n", scalar["title"]
      printf "LABELS=%s\n", list["labels"]
      printf "ASSIGNEES=%s\n", list["assignees"]
      printf "PROJECTS=%s\n", list["projects"]
    }
  '
done <"$listf"

exit 0

#!/bin/sh
#
# qa-ledger.sh - lists the scenarios of one run's qa.e2e.md handoff file with their
# automation state, and prints the e2e-writer dispatch block of the next one to handle,
# answering in directive lines the e2e skill acts on.
#
# It exists because the ID list, the not automatable exclusion, the state read off the
# "## Automation" section and the six labelled lines of every dispatch were prose the model
# had to apply by hand, and a missed ID, a skipped retry or a mistyped line sent the writer
# a wrong or incomplete payload. The script reads the handoff and never writes it: the
# e2e-writer alone writes the "## Automation" lines.
#
# Contract:
#   argv   : <handoff> list
#            <handoff> next --spec-dir <dir> --base-url <url> --accounts <value> [--after QA-<nn>]
#            <handoff> is the path of a qa.e2e.md. Each option takes one non-empty value that
#            does not start with "--"; a repeated option keeps its last value.
#   cwd    : any directory: every path derives from argv (a relative <handoff> resolves
#            against it).
#   env    : none.
#   file   : <handoff>, read only. Scenarios are the "### QA-<nn> <title>" headings under
#            "## UI scenarios" and "## API scenarios", in file order; an ID named by a
#            "- QA-<nn>" line under "## Not automatable" is no scenario here; the state is
#            the last "- QA-<nn>: file ..." or "- QA-<nn>: blocked ..." line of
#            "## Automation", pending without one.
#   stdout : list ->
#              id: QA-<nn> | file | <title>       (or blocked, or pending; one per scenario)
#              counts: <f> file, <b> blocked, <p> pending
#            next -> the first scenario, after the --after one when given, whose state is
#            blocked or pending:
#              NEXT: dispatch | id: QA-<nn> | agent: viber:e2e-writer
#              handoff: <absolute handoff path, forward slashes>
#              id: QA-<nn>
#              spec-dir: <as given>
#              base-url: <as given>
#              accounts: <as given>
#              refs: <plugin root, three directories above this script>/references
#            and, with none left:
#              NEXT: commit
#            The lines below the NEXT: line are the prompt of the dispatch, sent as printed.
#   stderr : one "error: ..." line on exit 2.
#   exit   : 0 on every answer above; 2 with an empty stdout for a missing or unreadable
#            handoff, an unknown mode or option, a missing --spec-dir, --base-url or
#            --accounts, a missing option value, or an --after naming no listed scenario.
#
set -u

fail() {
  echo "error: $1" >&2
  exit 2
}

if [ "$#" -lt 2 ]; then
  fail "usage: qa-ledger.sh <handoff> list | <handoff> next --spec-dir <dir> --base-url <url> --accounts <value> [--after QA-<nn>]"
fi

handoff="$1"
mode="$2"
shift 2

if [ ! -f "$handoff" ] || [ ! -r "$handoff" ]; then
  fail "no handoff file at ${handoff}"
fi

spec_dir=""
base_url=""
accounts=""
after=""

case "$mode" in
  list)
    if [ "$#" -gt 0 ]; then
      fail "unknown option $1 for list"
    fi
    ;;
  next)
    while [ "$#" -gt 0 ]; do
      opt="$1"
      case "$opt" in
        --spec-dir | --base-url | --accounts | --after) ;;
        *) fail "unknown option ${opt}" ;;
      esac
      if [ "$#" -lt 2 ]; then
        fail "option ${opt} needs a value"
      fi
      val="$2"
      case "$val" in
        '' | --*) fail "option ${opt} needs a value" ;;
      esac
      case "$opt" in
        --spec-dir) spec_dir="$val" ;;
        --base-url) base_url="$val" ;;
        --accounts) accounts="$val" ;;
        --after) after="$val" ;;
      esac
      shift 2
    done
    if [ -z "$spec_dir" ]; then
      fail "next needs --spec-dir"
    fi
    if [ -z "$base_url" ]; then
      fail "next needs --base-url"
    fi
    if [ -z "$accounts" ]; then
      fail "next needs --accounts"
    fi
    ;;
  *)
    fail "unknown mode ${mode}: use list or next"
    ;;
esac

list="$(awk '
{ sub(/\r$/, ""); sub(/[ \t]+$/, "") }
/^## / {
  sec = substr($0, 4)
  sub(/^[ \t]+/, "", sec)
  next
}
sec == "UI scenarios" || sec == "API scenarios" {
  if ($0 ~ /^### QA-[0-9]+([ \t]|$)/) {
    rest = substr($0, 5)
    id = rest
    sub(/[ \t].*$/, "", id)
    n++
    ids[n] = id
    title = substr(rest, length(id) + 1)
    sub(/^[ \t]+/, "", title)
    titles[n] = title
  }
  next
}
sec == "Not automatable" {
  if ($0 ~ /^- QA-[0-9]+/) {
    t = substr($0, 3)
    sub(/[^A-Za-z0-9-].*$/, "", t)
    skip[t] = 1
  }
  next
}
sec == "Automation" {
  if ($0 ~ /^- QA-[0-9]+:[ \t]*(file|blocked)([ \t]|$)/) {
    t = substr($0, 3)
    sub(/:.*$/, "", t)
    st = $0
    sub(/^- QA-[0-9]+:[ \t]*/, "", st)
    state[t] = (st ~ /^file/) ? "file" : "blocked"
  }
  next
}
END {
  for (i = 1; i <= n; i++) {
    if (ids[i] in skip) continue
    s = (ids[i] in state) ? state[ids[i]] : "pending"
    count[s]++
    print "id: " ids[i] " | " s " | " titles[i]
  }
  print "counts: " count["file"] + 0 " file, " count["blocked"] + 0 " blocked, " count["pending"] + 0 " pending"
}
' "$handoff")"

if [ "$mode" = "list" ]; then
  printf '%s\n' "$list"
  exit 0
fi

pick="$(printf '%s\n' "$list" | AFTER="$after" awk -F ' [|] ' '
BEGIN { after = ENVIRON["AFTER"]; seen = (after == ""); found = (after == ""); out = "" }
/^id: / {
  id = substr($1, 5)
  if (after != "" && id == after) { seen = 1; found = 1; next }
  if (seen && $2 != "file" && out == "") out = id
}
END {
  if (!found) print "ERR"
  else if (out == "") print "NONE"
  else print "ID " out
}
')"

case "$pick" in
  ERR)
    fail "--after ${after} names no listed scenario"
    ;;
  NONE)
    echo "NEXT: commit"
    exit 0
    ;;
esac
id="${pick#ID }"

abs_dir() {
  (cd "$1" 2>/dev/null && { pwd -W 2>/dev/null || pwd; }) | sed 's|\\|/|g'
}

hdir="$(abs_dir "$(dirname "$handoff")")"
root="$(abs_dir "$(dirname "$0")/../../..")"

echo "NEXT: dispatch | id: ${id} | agent: viber:e2e-writer"
echo "handoff: ${hdir}/$(basename "$handoff")"
echo "id: ${id}"
printf '%s\n' "spec-dir: ${spec_dir}"
printf '%s\n' "base-url: ${base_url}"
printf '%s\n' "accounts: ${accounts}"
echo "refs: ${root}/references"
exit 0

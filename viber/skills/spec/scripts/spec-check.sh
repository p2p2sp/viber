#!/usr/bin/env bash
# spec-check.sh <spec.md>
#
# Structural check of one specification file, no model involved.
#   stdout : "PASS", or one line per problem:
#              "FAIL: line <n>: <problem>"   a structural defect
#              "OPEN: line <n>: <text>"      a line carrying the gap marker [?]
#   exit   : 0 pass, 1 problems found, 2 bad usage or unreadable file
# Dependencies: bash 3.2+ only.

set -u
set -f # a token of a spec line must never glob against the filesystem

# Section headings in template order.
SECTIONS=("Goal" "Requirements" "Out of scope" "Must not change" "Decisions" "Contracts" "Constraints" "Tests" "Root cause")
# The first MANDATORY entries of SECTIONS must exist in every spec.
MANDATORY=3

if [ $# -ne 1 ]; then
  echo "usage: spec-check.sh <spec.md>" >&2
  exit 2
fi
file="$1"
if [ ! -r "$file" ]; then
  echo "spec-check.sh: cannot read $file" >&2
  exit 2
fi

# Patterns live in variables: bash 3.2 mishandles quoted or escaped regex literals.
fence_re='^[[:space:]]*```'
blank_re='^[[:space:]]*$'
title_re='^# [^[:space:]]'
h2_re='^## +(.*[^[:space:]])[[:space:]]*$'
item_re='^- '
indent_re='^[[:space:]]'
req_re='^- R([0-9]+): [^[:space:]]'
dec_re='^- D([0-9]+): [^[:space:]]'
# directory/.../name.ext, the extension starting with a letter so "1/2.5" passes.
path_re='^(~|\.{1,2})?/?([A-Za-z0-9_.@-]+/)+[A-Za-z0-9_.-]*\.[A-Za-z][A-Za-z0-9]*$'

problems=0
fail() {
  echo "FAIL: line $1: $2"
  problems=$((problems + 1))
}

n=0
title_seen=0
section=""
section_line=0
section_has_content=1
last_index=-1
seen="" # "|Goal||Requirements|..."
in_fence=0
next_r=1
next_d=1
req_line=0
dec_line=0

close_section() {
  if [ -n "$section" ] && [ "$section_has_content" -eq 0 ]; then
    fail "$section_line" "section '$section' is empty: fill it or remove its heading"
  fi
}

# check_item <letter> <regex> <expected number>: sets `next` to the number the following item must carry.
check_item() {
  if [[ "$line" =~ $2 ]]; then
    local found="${BASH_REMATCH[1]}"
    [ "$found" = "$3" ] || fail "$n" "expected $1$3, found $1$found: number from 1 without gaps"
    next=$((10#$found + 1)) # 10#: a leading zero is not octal
  else
    fail "$n" "item must start with '- $1<n>: '"
    next=$3
  fi
}

while IFS= read -r line || [ -n "$line" ]; do
  n=$((n + 1))
  line="${line%$'\r'}"

  if [[ "$line" =~ $fence_re ]]; then
    if [ "$in_fence" -eq 0 ]; then
      in_fence=1
      [ "$section" = "Contracts" ] || fail "$n" "code block outside Contracts"
    else
      in_fence=0
    fi
    section_has_content=1
    continue
  fi
  # A code block's content is a contract shape, not spec prose: nothing below applies.
  [ "$in_fence" -eq 1 ] && continue

  [[ "$line" =~ $blank_re ]] && continue

  if [ "$title_seen" -eq 0 ]; then
    title_seen=1
    if [[ "$line" =~ $title_re ]]; then
      case "$line" in *"{{"* | *"}}"*) fail "$n" "template placeholder left in the title" ;; esac
      continue
    fi
    fail "$n" "first line must be the title: '# <title>'"
  fi

  if [[ "$line" =~ $h2_re ]]; then
    name="${BASH_REMATCH[1]}"
    close_section
    section="$name"
    section_line=$n
    section_has_content=0
    idx=-1
    for i in "${!SECTIONS[@]}"; do
      [ "${SECTIONS[$i]}" = "$name" ] && idx=$i
    done
    if [ "$idx" -lt 0 ]; then
      fail "$n" "unknown section '$name'"
    else
      case "$seen" in
      *"|$name|"*) fail "$n" "section '$name' appears twice" ;;
      *)
        [ "$idx" -gt "$last_index" ] || fail "$n" "section '$name' is out of template order"
        ;;
      esac
      last_index=$idx
      seen="$seen|$name|"
      [ "$name" = "Requirements" ] && req_line=$n
      [ "$name" = "Decisions" ] && dec_line=$n
    fi
    continue
  fi

  section_has_content=1

  case "$line" in *"{{"* | *"}}"*) fail "$n" "template placeholder left" ;; esac

  case "$line" in
  *"[?]"*)
    echo "OPEN: line $n: $line"
    problems=$((problems + 1))
    ;;
  esac

  if [[ "$line" =~ $item_re ]]; then
    if [ "$section" = "Requirements" ]; then
      check_item R "$req_re" "$next_r"
      next_r=$next
    elif [ "$section" = "Decisions" ]; then
      check_item D "$dec_re" "$next_d"
      next_d=$next
    fi
  elif [[ ! "$line" =~ $indent_re ]]; then
    # The plan and the build read these two sections by item: any other line reaches no task.
    case "$section" in
    Requirements) fail "$n" "line is no '- R<n>: ' item: make it one, or indent it under its item" ;;
    Decisions) fail "$n" "line is no '- D<n>: ' item: make it one, or indent it under its item" ;;
    esac
  fi

  if [ "$section" != "Contracts" ]; then
    for tok in $line; do
      case "$tok" in *"://"*) continue ;; esac
      # Strip the punctuation and markdown wrapped around a token.
      while :; do
        case "$tok" in
        [\`\"\'\(\[\<\*]*) tok="${tok#?}" ;;
        *[\`\"\'\)\]\>\*,\;:.!?]) tok="${tok%?}" ;;
        *) break ;;
        esac
      done
      if [[ "$tok" =~ $path_re ]]; then
        fail "$n" "file path '$tok': a spec names no files"
        break
      fi
    done
  fi
done <"$file"

close_section
[ "$in_fence" -eq 0 ] || fail "$n" "code block never closed"
[ "$title_seen" -eq 1 ] || fail 1 "file is empty"

i=0
while [ "$i" -lt "$MANDATORY" ]; do
  case "$seen" in
  *"|${SECTIONS[$i]}|"*) ;;
  *) fail 1 "mandatory section '${SECTIONS[$i]}' is missing" ;;
  esac
  i=$((i + 1))
done
if [ "$req_line" -gt 0 ] && [ "$next_r" -eq 1 ]; then
  fail "$req_line" "Requirements holds no '- R1: ' item"
fi
if [ "$dec_line" -gt 0 ] && [ "$next_d" -eq 1 ]; then
  fail "$dec_line" "Decisions holds no '- D1: ' item"
fi

if [ "$problems" -eq 0 ]; then
  echo "PASS"
  exit 0
fi
exit 1

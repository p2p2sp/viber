#!/usr/bin/env bash
#
# reach.sh - collects the reference candidates of the planner's reach targets
# into one file, so `impact-mapper` classifies a list instead of searching the
# repository itself.
#
# It exists because the mapper's own searching (one grep per target, per
# spelling of the target) is the bulk of its tokens, and the search is
# mechanical: the candidates are every line naming a target, the judgement is
# which of them really reference it. The script does the first, the mapper the
# second, and searches itself only where the file says the script could not.
#
# Contract:
#   argv   : one or more targets, each one of
#              <repo-relative path>            the path, its file name, the file
#                                              name without its last extension
#                                              (which covers ./x, ../x and x.ts
#                                              imports); for an index file its
#                                              directory too
#              <repo-relative path> | <symbol> the symbol, as a whole word
#              <repo-relative path> | new      the parent directory path (the
#                                              file does not exist yet)
#            A leading ./ of the path is dropped once. No target, or a target
#            with an empty path, is an error.
#   cwd    : any directory inside the repository; the script moves to its root.
#   env    : none.
#   reads  : tracked files and untracked files the repository does not ignore
#            (git grep, fixed strings); binary files, each target's own file and
#            everything under .temp/ are left out. A term shorter than 3
#            characters is not searched, it is named on the skipped: line.
#   writes : .temp/viber/planner/reach-<yyyy-mm-dd-HH-MM-SS>.md, one section per
#            target in argument order:
#              ## <target as written>
#              terms: <term>[, <term>...]
#              skipped: <term>[, <term>...]       (only when a term was too short)
#              <path>:<line>: <line text, cut at 200 characters>
#              truncated: past 200 lines - search this target yourself
#            At most 200 hit lines are kept per target; the truncated: line
#            follows them only past that cap. Nothing is written on an error.
#   stdout : candidates: <absolute path of that file, forward slashes>
#            hits: <n> lines in <m> files        (the hit lines kept, all targets)
#   stderr : one error: line when the exit is 2.
#   exit   : 0; 2 with no target, an empty target path or outside a git
#            repository.
#
set -u

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

[ "$#" -ge 1 ] || fail "no target: reach.sh \"<path>\" [\"<path> | <symbol>\" | \"<path> | new\" ...]"

for target in "$@"; do
  case "$target" in
    *"|"*) probe="${target%%|*}" ;;
    *) probe="$target" ;;
  esac
  [ -n "$(trim "$probe")" ] || fail "empty path in target: $target"
done

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$root" ] || fail "not inside a git repository"
cd "$root" || fail "cannot enter the repository root: $root"

stamp="$(date +%Y-%m-%d-%H-%M-%S)"
outdir=".temp/viber/planner"
out="$outdir/reach-$stamp.md"
mkdir -p "$outdir" || fail "cannot create $outdir"
: > "$out" || fail "cannot write $out"

# Reads git grep output (path:line:text) on stdin: drops the target's own file
# (OWN) and anything under a .temp directory, reshapes each hit to
# "path:line: text" with the text cut at 200 characters, keeps 200 hits and ends
# on the truncated line when there were more. No apostrophe in this program: it
# sits inside a single-quoted shell argument.
filter_hits() {
  awk '
    {
      p = index($0, ":")
      if (p == 0) next
      path = substr($0, 1, p - 1)
      rest = substr($0, p + 1)
      q = index(rest, ":")
      if (q == 0) next
      if (path == ENVIRON["OWN"]) next
      if (index("/" path, "/.temp/") > 0) next
      text = substr(rest, q + 1)
      sub(/^[ \t]+/, "", text)
      sub(/\r$/, "", text)
      if (length(text) > 200) text = substr(text, 1, 200)
      n++
      if (n <= 200) print path ":" substr(rest, 1, q - 1) ": " text
    }
    END {
      if (n > 200) print "truncated: past 200 lines - search this target yourself"
    }
  '
}

for target in "$@"; do
  case "$target" in
    *"|"*)
      path="$(trim "${target%%|*}")"
      mode="$(trim "${target#*|}")"
      ;;
    *)
      path="$(trim "$target")"
      mode=""
      ;;
  esac
  path="${path#./}"

  base="${path##*/}"
  dir=""
  case "$path" in
    */*) dir="${path%/*}" ;;
  esac
  stem="$base"
  case "$base" in
    ?*.*) stem="${base%.*}" ;;
  esac

  candidates=""
  whole_word=0
  if [ -z "$mode" ]; then
    candidates="$path
$base
$stem"
    if [ "$stem" = "index" ] && [ -n "$dir" ]; then
      candidates="$candidates
$dir"
    fi
  elif [ "$mode" = "new" ]; then
    candidates="${dir:-.}"
  else
    candidates="$mode"
    whole_word=1
  fi

  gargs=(-n -I -F --untracked --exclude-standard)
  if [ "$whole_word" -eq 1 ]; then
    gargs=("${gargs[@]}" -w)
  fi

  seen=""
  terms_txt=""
  skipped_txt=""
  while IFS= read -r term; do
    [ -n "$term" ] || continue
    case "
$seen
" in
      *"
$term
"*) continue ;;
    esac
    seen="$seen
$term"
    if [ "${#term}" -lt 3 ]; then
      skipped_txt="${skipped_txt:+$skipped_txt, }$term"
    else
      terms_txt="${terms_txt:+$terms_txt, }$term"
      gargs=("${gargs[@]}" -e "$term")
    fi
  done < <(printf '%s\n' "$candidates")

  {
    printf '## %s\n' "$target"
    printf 'terms: %s\n' "$terms_txt"
    if [ -n "$skipped_txt" ]; then
      printf 'skipped: %s\n' "$skipped_txt"
    fi
  } >> "$out"

  if [ -n "$terms_txt" ]; then
    hits="$(git grep "${gargs[@]}" 2>/dev/null | OWN="$path" filter_hits || true)"
    if [ -n "$hits" ]; then
      printf '%s\n' "$hits" >> "$out"
    fi
  fi
done

counts="$(awk '
  /^[^:]+:[0-9]+: / {
    n++
    split($0, a, ":")
    files[a[1]] = 1
  }
  END {
    for (f in files) m++
    print n + 0, m + 0
  }
' "$out")"
n="${counts% *}"
m="${counts#* }"

printf 'candidates: %s/%s\n' "$root" "$out"
printf 'hits: %s lines in %s files\n' "$n" "$m"
exit 0

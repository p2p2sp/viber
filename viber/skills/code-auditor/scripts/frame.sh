#!/bin/sh
# viber - skills/code-auditor/scripts/frame.sh
# Frames a code-auditor run: reads the argument tokens, settles the lens and the
# scope, runs every check of the Frame phase and, on a framed run, writes the
# run workspace and run.md.
#
# Why it exists: classifying up to two tokens (a lens name beats a directory of
# that name, `./<name>` is the directory, `diff:<sha>`, group tokens), resolving
# a directory against the repository root, reading the lens's `Worktree:` line,
# interpreting diff-files.sh and writing run.md were prose the model re-derived
# on every run, each time reading the whole Frame section. One script answers
# every argument form the same way and the skill acts on one directive.
#
# Contract:
#   argv   : the tokens of $ARGUMENTS, each read on its own: a lens name (bugs,
#            security, web-performance, runtime-performance, tests, design), the
#            group `performance` or `quality`, `diff`, `diff:<sha>`, `repo`, or
#            anything else as a directory. `--apostrophe` stands for a token that
#            held an apostrophe (read as a directory, never found). An empty token
#            is ignored. No token is valid.
#   cwd    : the session's directory. <root> is `git rev-parse --show-toplevel`
#            there, else the cwd. Nothing else depends on the cwd.
#   env    : none read beyond what git itself reads. On the diff scope PATH must
#            resolve `node` for diff-files.sh, which prints nothing without it,
#            read here as nothing changed.
#   paths  : <skill dir> (printed, and written as `Lens file:`) is spelled from the
#            path the script was invoked by, through scripts/plugin-root.sh: `C:/...`
#            for a `C:\...` or `C:/...` call, `/c/...` for a `/c/...` call.
#   files  : read: the lens file of ../references/lenses/ (its `Worktree:` line).
#            Written only on a framed run: <ws>/reports/, <ws>/worktrees/ and
#            <ws>/run.md, <ws> = <root>/.temp/viber/code-auditor/<date +%Y%m%d-%H%M%S>.
#            run.md holds `Lens:`, `Lens file:`, `Scope:` (diff, repo or a
#            root-relative directory: an absolute one is rewritten, a leading `./`
#            dropped, `diff` and `repo` recorded as `./diff` and `./repo`; an
#            absolute token read with `\` as `/`, a `/c/` or `C:/` form and the
#            case of its drive letter folded to the root's own form first),
#            `Target root:` and, on the diff scope, `Base:` and `## Changed files`.
#   stdout : exactly one answer:
#              NEXT: ask-lens | numbers: 1-6|3,4|5,6    no lens given, then the
#                scope token given, if any, as the body line `scope: <token>`
#              ASK: changes -> diff | directory -> directory | whole repository -> repo
#                a lens and no scope, then the body line `lens: <lens>`
#              STOP: <stop line>    an argument, directory, clean checkout or diff
#                refusal; nothing is written
#              RUN: sh "<skill dir>/scripts/map-signals.sh" "<ws>"    a framed run
#   exit   : 0 in every case.
set -u

. "$(dirname -- "$0")/../../../scripts/plugin-root.sh"
script_dir=$(cd "$(dirname "$0")" && pwd)
skill_dir=$(plugin_root_of "$0" 1)

stop() {
  printf 'STOP: code-auditor: %s\n' "$1"
  exit 0
}

lens=""
group=""
scope_kind=""
scope_tok=""
sha=""
n_tok=0
n_lens=0
n_group=0
n_scope=0

for tok in "$@"; do
  [ -n "$tok" ] || continue
  n_tok=$((n_tok + 1))
  case $tok in
    bugs|security|web-performance|runtime-performance|tests|design)
      lens=$tok
      n_lens=$((n_lens + 1)) ;;
    performance|quality)
      group=$tok
      n_group=$((n_group + 1)) ;;
    diff)
      scope_kind=diff
      scope_tok=$tok
      n_scope=$((n_scope + 1)) ;;
    diff:*)
      scope_kind=diff
      scope_tok=$tok
      sha=${tok#diff:}
      n_scope=$((n_scope + 1)) ;;
    repo)
      scope_kind=repo
      scope_tok=$tok
      n_scope=$((n_scope + 1)) ;;
    *)
      scope_kind=dir
      scope_tok=$tok
      n_scope=$((n_scope + 1)) ;;
  esac
done

if [ "$n_tok" -gt 2 ] || [ $((n_lens + n_group)) -gt 1 ] || [ "$n_scope" -gt 1 ]; then
  stop "give at most one lens and one scope: [<lens>] [diff | diff:<sha> | <directory> | repo]"
fi

if [ -z "$lens" ]; then
  case $group in
    performance) numbers=3,4 ;;
    quality) numbers=5,6 ;;
    *) numbers=1-6 ;;
  esac
  printf 'NEXT: ask-lens | numbers: %s\n' "$numbers"
  [ -z "$scope_tok" ] || printf 'scope: %s\n' "$scope_tok"
  exit 0
fi

if [ -z "$scope_kind" ]; then
  printf 'ASK: changes -> diff | directory -> directory | whole repository -> repo\n'
  printf 'lens: %s\n' "$lens"
  exit 0
fi

root=$(git rev-parse --show-toplevel 2>/dev/null) || root=""
[ -n "$root" ] || root=$(pwd)

lens_file="$skill_dir/references/lenses/$lens.md"

needs_clean() {
  grep -q '^Worktree: required' "$lens_file"
}

# same_drive_form <absolute token> prints the token spelled as the root is: a
# `/c/...` token under a `C:/...` root becomes `C:/...`, a `C:/...` token under
# a `/c/...` root becomes `/c/...`, and the drive letter of a token on the
# root's own drive takes the root's case. Any other token prints unchanged.
same_drive_form() {
  sd_t=$1
  sd_rest=
  sd_drive=
  case $root in
    [A-Za-z]:|[A-Za-z]:/*) sd_rootform=win; sd_root=${root%"${root#?}"} ;;
    /[A-Za-z]|/[A-Za-z]/*) sd_rootform=msys; sd_root=${root#/}; sd_root=${sd_root%"${sd_root#?}"} ;;
    *) printf '%s\n' "$sd_t"; return 0 ;;
  esac
  case $sd_t in
    [A-Za-z]:|[A-Za-z]:/*)
      sd_drive=${sd_t%"${sd_t#?}"}
      sd_rest=${sd_t#??} ;;
    /[A-Za-z]|/[A-Za-z]/*)
      [ "$sd_rootform" = win ] || { printf '%s\n' "$sd_t"; return 0; }
      sd_drive=${sd_t#/}
      sd_drive=${sd_drive%"${sd_drive#?}"}
      sd_rest=${sd_t#??} ;;
    *) printf '%s\n' "$sd_t"; return 0 ;;
  esac
  sd_lower_a=$(printf '%s' "$sd_drive" | tr 'A-Z' 'a-z')
  sd_lower_b=$(printf '%s' "$sd_root" | tr 'A-Z' 'a-z')
  [ "$sd_lower_a" != "$sd_lower_b" ] || sd_drive=$sd_root
  case $sd_rootform in
    win) printf '%s:%s\n' "$sd_drive" "$sd_rest" ;;
    msys) printf '/%s%s\n' "$sd_drive" "$sd_rest" ;;
  esac
}

# resolve_dir <token> -> sets rel to the root-relative directory, status 1 when
# the token holds an apostrophe or a .. segment, lies outside the root or names
# no directory.
resolve_dir() {
  t=$1
  case $t in
    *\'*) return 1 ;;
  esac
  case $t in
    [A-Za-z]:[/\\]*) t=$(printf '%s' "$t" | tr '\\' '/') ;;
  esac
  case "/$t/" in
    */../*) return 1 ;;
  esac
  case $t in
    /*|[A-Za-z]:/*)
      t=$(same_drive_form "$t")
      abs=${t%/}
      case $abs in
        "$root") rel="" ;;
        "$root"/*) rel=${abs#"$root"/} ;;
        *)
          [ -d "$abs" ] || return 1
          phys=$(cd "$abs" 2>/dev/null && pwd -P) || return 1
          case $phys in
            "$root") rel="" ;;
            "$root"/*) rel=${phys#"$root"/} ;;
            *) return 1 ;;
          esac ;;
      esac ;;
    *)
      rel=${t#./}
      rel=${rel%/} ;;
  esac
  [ -n "$rel" ] || rel=.
  [ -d "$root/$rel" ] || return 1
  case $rel in
    diff) rel=./diff ;;
    repo) rel=./repo ;;
  esac
  return 0
}

scope=$scope_kind
if [ "$scope_kind" = dir ]; then
  if ! resolve_dir "$scope_tok"; then
    value=$scope_tok
    [ "$scope_tok" != "--apostrophe" ] || value="<token>"
    stop "area directory not found under $root: $value (lenses: bugs, security, web-performance, runtime-performance, tests, design)"
  fi
  scope=$rel
fi

if [ "$scope_kind" != diff ] && needs_clean; then
  head_sha=$(git -C "$root" rev-parse --verify -q HEAD 2>/dev/null)
  if [ -z "$head_sha" ]; then
    stop "$lens verifies on a clean checkout and $root holds no git commit: commit first, or pick the design lens"
  fi
fi

base=""
changed=""
if [ "$scope_kind" = diff ]; then
  if [ -n "$sha" ]; then
    out=$(sh "$script_dir/diff-files.sh" "$root" "$sha")
  else
    out=$(sh "$script_dir/diff-files.sh" "$root")
  fi
  first=$(printf '%s\n' "$out" | sed -n 1p)
  case $first in
    BAD_BASE*) stop "diff base not found: $sha" ;;
    NOT_A_REPO*) stop "the diff scope needs a git repository" ;;
  esac
  base=${first#BASE }
  changed=$(printf '%s\n' "$out" | sed 1d)
  [ -n "$changed" ] || stop "nothing changed against $base"
  if [ "$base" = none ] && needs_clean; then
    stop "$lens verifies on a clean checkout and this repository has no commit yet: commit first, or pick the design lens"
  fi
fi

ws="$root/.temp/viber/code-auditor/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ws/reports" "$ws/worktrees"

{
  printf 'Lens: %s\n' "$lens"
  printf 'Lens file: %s\n' "$lens_file"
  printf 'Scope: %s\n' "$scope"
  printf 'Target root: %s\n' "$root"
  if [ "$scope_kind" = diff ]; then
    printf 'Base: %s\n' "$base"
    printf '\n## Changed files\n'
    printf '%s\n' "$changed"
  fi
} > "$ws/run.md"

printf 'RUN: sh "%s/scripts/map-signals.sh" "%s"\n' "$skill_dir" "$ws"
exit 0

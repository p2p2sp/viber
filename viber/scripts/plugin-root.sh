#!/bin/sh
#
# plugin-root.sh - a sourced library: plugin_root_of prints the plugin root of
# the script that calls it, from the path the script was invoked by.
#
# It exists because the scripts that print a command for the model to run
# (`<plugin root>/scripts/<name>.sh ...`) each cut the plugin root out of their
# own `$0` with their own sed, and on Windows a `C:\...` spelling reached the
# printed command with its backslashes, which the `allowed-tools` prefixes never
# match. One library reads every spelling the same way, so a script prints the
# root as `C:/...` when it was invoked by `C:\...` or `C:/...`, and as `/c/...`
# when it was invoked by `/c/...`.
#
# It is sourced, never run: it sets no shell option, defines one function, and
# its working variables all start with `pr_` and are unset before it returns.
# It touches no file and runs no command but `tr`.
#
# Contract:
#   usage  : `. "$(dirname -- "$0")/plugin-root.sh"` from viber/scripts/<name>.sh,
#            `. "$(dirname -- "$0")/../../../scripts/plugin-root.sh"` from
#            viber/skills/<skill>/scripts/<name>.sh, then
#            `plugin_root_of <invoked path> <levels>`.
#   argv   : <invoked path> is the script's `$0` as given; <levels> is how many
#            directories the plugin root lies above the script's own directory:
#            1 for viber/scripts/<name>.sh, 3 for viber/skills/<skill>/scripts/<name>.sh.
#   cwd    : irrelevant: the path is read as text and never resolved.
#   env    : none.
#   stdout : one line, the plugin root:
#              every "\" of the path read as "/";
#              D = the path without its last "/<file>" ("." when it holds no "/");
#              D loses its last <levels> segments, from the end, as text;
#              each level left over once D runs out of segments adds "/..",
#              from "." ("./.." for one);
#              "." when exactly nothing is left.
#   exit   : 0.

plugin_root_of() {
  pr_p=$(printf '%s' "$1" | tr '\\' '/')
  case $pr_p in
    */*) pr_d=${pr_p%/*} ;;
    *) pr_d=. ;;
  esac
  pr_n=${2:-1}
  pr_up=
  while [ "$pr_n" -gt 0 ]; do
    case $pr_d in
      .) pr_up=$pr_up/.. ;;
      */*) pr_d=${pr_d%/*} ;;
      *) pr_d=. ;;
    esac
    pr_n=$((pr_n - 1))
  done
  printf '%s\n' "$pr_d$pr_up"
  unset pr_p pr_d pr_n pr_up
}

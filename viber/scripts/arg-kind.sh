#!/bin/sh
#
# arg-kind.sh - classifies the first word of a skill's argument as a GitHub
# issue reference or a pull request reference, by exactly the shapes
# `issue-facts.sh` (issue) and `pr-threads.sh` (pr) accept.
#
# It exists because `intent`, `fixer` and `pr-feedback` decided from prose
# whether their argument was an issue or pull request reference, and a wrong
# call sent pasted text to `gh` or dropped a real reference into the free text.
# This script applies the shape check, so the model only runs it and acts on
# the directive it prints. It never calls gh and never reads the repository.
#
# Contract:
#   argv   : `arg-kind.sh issue <first word> [--more]` or
#            `arg-kind.sh pr <first word>`. The word is passed as given, an empty
#            word included. `--more` (issue only) says the argument holds more
#            words after the first. Nothing else is accepted.
#   cwd    : irrelevant: the script touches no file and runs no other command.
#   env    : none.
#   stdout : exit 0, one line:
#              NEXT: issue | ref: <first word as given>   (issue) the word is <N>,
#                  #<N> or https://<host>/<owner>/<repo>/issues/<N>, optionally
#                  followed by a #... or ?... suffix, and `--more` was not given
#              NEXT: text                                 (issue) anything else, an
#                  empty word and any word given with `--more` included
#              NEXT: pr | ref: <first word as given>      (pr) the word is <N>, #<N>
#                  or https://<host>/<owner>/<repo>/pull/<N>, optionally followed
#                  by a #... or ?... suffix
#              STOP: usage                                (pr) anything else, an
#                  empty word included
#            The accepted shapes are those of issue-facts.sh and pr-threads.sh,
#            including a URL behind one leading #.
#   exit   : 0 with the line above; 2 with one `error: arg-kind.sh: ...` line on
#            stderr and an empty stdout for an unknown kind, no word, `--more`
#            under pr, or any further argument.
#
set -u

fail() {
  echo "error: arg-kind.sh: $1" >&2
  exit 2
}

[ $# -ge 2 ] || fail "usage: arg-kind.sh issue <first word> [--more] | arg-kind.sh pr <first word>"
kind=$1
word=$2
more=no
case $kind in
  issue)
    if [ $# -eq 3 ]; then
      [ "$3" = "--more" ] || fail "unknown argument: $3"
      more=yes
    elif [ $# -gt 3 ]; then
      fail "too many arguments"
    fi
    seg=issues
    ;;
  pr)
    [ $# -eq 2 ] || fail "too many arguments"
    seg=pull
    ;;
  *) fail "unknown kind: $kind" ;;
esac

# Same shape rules as issue-facts.sh and pr-threads.sh: <N>, #<N>, or an https
# URL with <host>/<owner>/<repo>/<seg>/<N> and an optional #... or ?... suffix.
valid=no
ref=${word#\#}
case $ref in
  ''|*[!0-9]*)
    case $ref in
      https://*/"$seg"/*)
        ref=${ref%%[#?]*}
        n=${ref##*/"$seg"/}
        mid=${ref#https://}
        mid=${mid%/"$seg"/*}
        case $n in
          ''|*[!0-9]*) ;;
          *)
            case $mid in
              /*|*/|*//*|*/*/*/*) ;;
              */*/*) valid=yes ;;
            esac
            ;;
        esac
        ;;
    esac
    ;;
  *) valid=yes ;;
esac

if [ "$kind" = issue ]; then
  if [ "$valid" = yes ] && [ "$more" = no ]; then
    printf 'NEXT: issue | ref: %s\n' "$word"
  else
    echo "NEXT: text"
  fi
else
  if [ "$valid" = yes ]; then
    printf 'NEXT: pr | ref: %s\n' "$word"
  else
    echo "STOP: usage"
  fi
fi
exit 0

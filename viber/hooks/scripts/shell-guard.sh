#!/usr/bin/env bash
#
# shell-guard.sh - viber / PreToolUse hook on Bash: refuses the coder's and the reviewers' forbidden shell and git commands.
#
# Inside viber:task-coder, refuses a Bash command that chains parts (R1), runs
# git stash, checkout, restore or clean (R2), runs rm (R3) or writes a file
# through Bash (R4). Inside viber:task-reviewer and viber:final-reviewer, refuses
# R2 only. Every refusal tells the model the fix, so it carries on instead of
# halting the build.
#
# Why each rule exists:
#   R1 chain - one refused part refuses a whole chained call: a permission
#      prompt or a guard deny on any one part of `a && b` stops the lot and, in an
#      unattended build, ends the agent's run. One command per Bash call keeps a
#      refusal local to the command that earned it.
#   R2 git   - one stash stack serves every coder sharing the tree, and a pop can
#      restore another coder's entry. checkout, restore and clean discard
#      uncommitted work that may belong to another coder or reviewer working in
#      the same tree, even with a path list naming only the caller's own files.
#      Reading the committed state needs none of them: git show HEAD:<path> and
#      git diff do it.
#   R3 rm    - a removal goes through git rm -r -q -- <path>, which refuses a path
#      git does not track; rm removes anything, including another coder's file.
#   R4 write - a file changes through Edit or Write, which fail loudly when they
#      do not apply. Bash never rewrites a file, because
#      a scripted substitution missing its pattern exits 0 on unchanged code,
#      so sed -i and perl -pi report success for an edit that never happened,
#      and a redirect or tee onto a path in the working tree skips the same
#      check. Scratch output belongs under .temp/. An absolute target
#      (/dev/null, /tmp/x) is not refused: the rule guards the working tree,
#      where the coder's cwd is.
#
# Rule scope: an unquoted newline is deliberately not refused. R1 names the three
# operators ; && || only, because a newline inside one Bash call is how a
# multi-line argument is written and the harness already shows such a call whole.
#
# Contract:
#   argv   : none - every input arrives on stdin.
#   cwd    : irrelevant; no path is read or written.
#   env    : none read; LC_ALL=C is set so the command is scanned by byte, in linear
#            time (a UTF-8 locale makes each character lookup scan from the start).
#   reads  : nothing but stdin. A call whose input does not name one of the three
#            guarded viber: agents returns before any external command runs (bash
#            builtins only).
#   stdin  : PreToolUse JSON. Read: the top-level "agent_type" (present only
#            inside a subagent) and "tool_input.command" (JSON-unescaped as
#            kill-guard.sh does). Empty, malformed or truncated input, no
#            agent_type, any other agent_type, or no command -> nothing printed.
#   quoting: operators and words count only outside quotes: '...' is literal,
#            "..." honours backslash escapes, a backslash outside quotes escapes
#            the next character, and a # opening a word starts a comment.
#   command position: the start of the command or right after an unquoted | ; &
#            ( $( a backtick or a newline, whitespace allowed.
#   stdout : nothing, or exactly one line, the first matching rule's:
#            {"hookSpecificOutput":{"hookEventName":"PreToolUse",
#             "permissionDecision":"deny","permissionDecisionReason":"viber guard: <text>"}}
#            R1 (coder): an unquoted ;, && or ||.
#            R2 (coder and both reviewers): git in command position, any global
#               options (-C <arg>, -c <arg>, --git-dir=..., --work-tree=..., other
#               -options), then the subcommand stash, checkout, restore or clean.
#            R3 (coder): rm in command position, or xargs in command position whose
#               command word, after its options, is rm (git rm and rmdir are not rm).
#            R4 (coder): sed in command position with an argument -i... or
#               --in-place...; perl in command position with an option cluster
#               holding i (-i, -pi); an unquoted >, >>, &> or <digit>> whose target
#               is a relative path (not opening with /, ~ or $, not &<digit>) that
#               does not start .temp/ or ./.temp/; tee in command position with
#               such a file argument.
#            Rules are tried in the order R1, R2, R3, R4.
#   exit 0 : always (fail-open: a broken guard must never block a command).
#            JSON is read with bash regexes; jq is not assumed.
set -u
LC_ALL=C

IFS= read -r -d '' input || true

type_re='"agent_type"[[:space:]]*:[[:space:]]*"(viber:[^"\\]*)"'
[[ "$input" =~ $type_re ]] || exit 0
agent="${BASH_REMATCH[1]}"
case "$agent" in
  viber:task-coder) coder=1 ;;
  viber:task-reviewer | viber:final-reviewer) coder=0 ;;
  *) exit 0 ;;
esac

command_re='"command"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)"'
[[ "$input" =~ $command_re ]] || exit 0
cmd="${BASH_REMATCH[1]}"

# JSON-unescape the command: \\ goes through a placeholder so that \\n stays a
# backslash followed by n.
sep=$'\001'
nl=$'\n'
cr=$'\r'
tab=$'\t'
bs='\'
dq='"'
sq="'"
sl='/'
amp='&'
lt='<'
gt='>'
cmd="${cmd//\\\\/$sep}"
cmd="${cmd//\\\"/$dq}"
cmd="${cmd//\\n/$nl}"
cmd="${cmd//\\r/$cr}"
cmd="${cmd//\\t/$tab}"
cmd="${cmd//\\\//$sl}"
cmd="${cmd//\\u0026/$amp}"
cmd="${cmd//\\u003c/$lt}"
cmd="${cmd//\\u003e/$gt}"
cmd="${cmd//\\u0027/$sq}"
cmd="${cmd//$sep/$bs}"

# Tokenize outside quotes into parallel arrays: kind (W word, X separator that
# opens a command position, R output redirect, L input redirect, E closing
# parenthesis) and value (a word has its quotes removed).
tk=()
tv=()
n=0
word=''
inword=0

add() {
  tk[n]="$1"
  tv[n]="$2"
  n=$((n + 1))
}

flush() {
  if ((inword)); then
    add W "$word"
    word=''
    inword=0
  fi
}

len=${#cmd}
i=0
while ((i < len)); do
  c="${cmd:i:1}"
  case "$c" in
    "'")
      rest="${cmd:i+1}"
      if [[ "$rest" == *"'"* ]]; then
        lit="${rest%%"'"*}"
        i=$((i + ${#lit} + 2))
      else
        lit="$rest"
        i=$len
      fi
      word+="$lit"
      inword=1
      ;;
    '"')
      i=$((i + 1))
      inword=1
      while ((i < len)); do
        c="${cmd:i:1}"
        if [[ "$c" == '\' ]]; then
          word+="${cmd:i+1:1}"
          i=$((i + 2))
        elif [[ "$c" == '"' ]]; then
          i=$((i + 1))
          break
        else
          word+="$c"
          i=$((i + 1))
        fi
      done
      ;;
    '\')
      nc="${cmd:i+1:1}"
      if [[ "$nc" != "$nl" ]]; then
        word+="$nc"
        inword=1
      fi
      i=$((i + 2))
      ;;
    ' ' | "$tab" | "$cr")
      flush
      i=$((i + 1))
      ;;
    "$nl")
      flush
      add X "$nl"
      i=$((i + 1))
      ;;
    '#')
      if ((inword)); then
        word+="$c"
        i=$((i + 1))
      else
        rest="${cmd:i}"
        if [[ "$rest" == *"$nl"* ]]; then
          lit="${rest%%"$nl"*}"
          i=$((i + ${#lit}))
        else
          i=$len
        fi
      fi
      ;;
    '$')
      if [[ "${cmd:i+1:1}" == '(' ]]; then
        flush
        add X '$('
        i=$((i + 2))
      else
        word+="$c"
        inword=1
        i=$((i + 1))
      fi
      ;;
    '`')
      flush
      add X '`'
      i=$((i + 1))
      ;;
    '(')
      flush
      add X '('
      i=$((i + 1))
      ;;
    ')')
      flush
      add E ')'
      i=$((i + 1))
      ;;
    ';')
      flush
      add X ';'
      i=$((i + 1))
      ;;
    '|')
      flush
      if [[ "${cmd:i+1:1}" == '|' ]]; then
        add X '||'
        i=$((i + 2))
      else
        add X '|'
        i=$((i + 1))
      fi
      ;;
    '&')
      flush
      nc="${cmd:i+1:1}"
      if [[ "$nc" == '&' ]]; then
        add X '&&'
        i=$((i + 2))
      elif [[ "$nc" == '>' ]]; then
        add R '&>'
        i=$((i + 2))
        [[ "${cmd:i:1}" == '>' ]] && i=$((i + 1))
      else
        add X '&'
        i=$((i + 1))
      fi
      ;;
    '>')
      if ((inword)) && [[ "$word" =~ ^[0-9]+$ ]]; then
        word=''
        inword=0
      else
        flush
      fi
      i=$((i + 1))
      [[ "${cmd:i:1}" == '>' ]] && i=$((i + 1))
      [[ "${cmd:i:1}" == '|' ]] && i=$((i + 1))
      if [[ "${cmd:i:1}" == '&' && "${cmd:i+1:1}" =~ ^[0-9-]$ ]]; then
        # A descriptor duplication (2>&1, >&2, >&-) names no file.
        i=$((i + 2))
        while [[ "${cmd:i:1}" =~ ^[0-9]$ ]]; do i=$((i + 1)); done
      else
        # >&word with a non-descriptor word duplicates into a file: skip the &
        # so the word is the redirect target.
        [[ "${cmd:i:1}" == '&' ]] && i=$((i + 1))
        add R '>'
      fi
      ;;
    '<')
      flush
      add L '<'
      i=$((i + 1))
      ;;
    *)
      word+="$c"
      inword=1
      i=$((i + 1))
      ;;
  esac
done
flush

# A redirect target is relative (a working-tree path) unless it opens with /, ~
# or $, or sits under .temp/.
is_tree_path() {
  case "$1" in
    '' | /* | '~'* | '$'* | .temp/* | ./.temp/*) return 1 ;;
  esac
  return 0
}

r1=0
r2=0
r3=0
r4=0
cmdpos=1
pend=0
args=()
na=0
j=0
while ((j < n)); do
  k="${tk[j]}"
  v="${tv[j]}"
  j=$((j + 1))
  case "$k" in
    X)
      cmdpos=1
      pend=0
      case "$v" in ';' | '&&' | '||') r1=1 ;; esac
      ;;
    E)
      cmdpos=0
      pend=0
      ;;
    R) pend=2 ;;
    L) pend=1 ;;
    W)
      if ((pend)); then
        ((pend == 2)) && is_tree_path "$v" && r4=1
        pend=0
        continue
      fi
      ((cmdpos)) || continue
      cmdpos=0
      # Collect the arguments of this command up to the next separator.
      args=()
      na=0
      m=$j
      p=0
      while ((m < n)); do
        kk="${tk[m]}"
        case "$kk" in
          X | E) break ;;
          R | L) p=1 ;;
          W)
            if ((p)); then
              p=0
            else
              args[na]="${tv[m]}"
              na=$((na + 1))
            fi
            ;;
        esac
        m=$((m + 1))
      done
      x=0
      case "$v" in
        git)
          while ((x < na)); do
            o="${args[x]}"
            case "$o" in
              -C | -c | --git-dir | --work-tree | --namespace | --super-prefix | --config-env) x=$((x + 2)) ;;
              -*) x=$((x + 1)) ;;
              stash | checkout | restore | clean)
                r2=1
                break
                ;;
              *) break ;;
            esac
          done
          ;;
        rm) r3=1 ;;
        xargs)
          while ((x < na)); do
            o="${args[x]}"
            case "$o" in
              -n | -P | -I | -L | -s | -d | -E | -a | -J | --max-args | --max-procs | --max-lines | --max-chars | --delimiter | --arg-file | --eof) x=$((x + 2)) ;;
              -*) x=$((x + 1)) ;;
              rm)
                r3=1
                break
                ;;
              *) break ;;
            esac
          done
          ;;
        sed)
          while ((x < na)); do
            case "${args[x]}" in -i* | --in-place*) r4=1 ;; esac
            x=$((x + 1))
          done
          ;;
        perl)
          while ((x < na)); do
            [[ "${args[x]}" =~ ^-[0-9pnlaFsStTuUvwWcA]*i ]] && r4=1
            x=$((x + 1))
          done
          ;;
        tee)
          while ((x < na)); do
            o="${args[x]}"
            case "$o" in -*) ;; *) is_tree_path "$o" && r4=1 ;; esac
            x=$((x + 1))
          done
          ;;
      esac
      ;;
  esac
done

reason=''
if ((coder && r1)); then
  reason='one command per Bash call - run each part of the chain as its own Bash call.'
elif ((r2)); then
  reason='git is read-only here (status, diff, log, show) - compare with git show HEAD:<path> or git diff instead.'
elif ((coder && r3)); then
  reason='remove a file or directory with git rm -r -q -- <path>, never rm.'
elif ((coder && r4)); then
  reason='Bash never writes a file - change it with Edit or Write, and redirect scratch output only under .temp/.'
fi

if [[ -n "$reason" ]]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"viber guard: '"$reason"'"}}'
fi
exit 0

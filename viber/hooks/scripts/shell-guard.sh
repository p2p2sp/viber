#!/usr/bin/env bash
#
# shell-guard.sh - viber / PreToolUse hook on Bash: refuses the coder's and the reviewers' forbidden shell and git commands.
#
# Inside viber:task-coder, refuses a Bash command that chains parts (R1), runs
# git stash, checkout, restore or clean (R2), runs rm (R3), writes a file
# through Bash (R4) or runs inline or scratch interpreter code (R5). Inside
# viber:task-reviewer and viber:final-reviewer, refuses
# R2 only. Every refusal tells the model the fix, so it carries on instead of
# halting the build.
#
# Why each rule exists:
#   R1 chain - one refused part refuses a whole chained call: a permission
#      prompt or a guard deny on any one part of `a && b` stops the lot and, in an
#      unattended build, ends the agent's run. One command per Bash call keeps a
#      refusal local to the command that earned it. A chain whose split would change
#      what runs gets no suggested split: one holding ||, whose later part runs only
#      when an earlier one fails, or one whose earlier part is cd, pushd, export,
#      source, . or a NAME=value word, whose effect on the shell no separate call keeps.
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
#   R5 interpreter - inline code (python -c, node -e, ruby -e, perl -e) and a
#      script written under .temp/ then run through an interpreter are
#      a file edit by another route: they skip the check Edit and Write make, and
#      a scratch script outside the plan's files is one nobody can delete (R3). A large
#      rewrite is one Write of the whole file; tests and project scripts run by
#      their own command (python -m pytest, node --test, node scripts/x.js).
#      Interpreter code fed through bash -c, sh -c or standard input is not
#      refused.
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
#            R1 (coder): an unquoted ;, && or ||. The reason ends, after one space,
#               on `Run instead, one call each: `<part 1>` then `<part 2>`[ then ...].`:
#               the parts split at each unquoted ;, && and ||, trimmed, empty ones
#               dropped, a " or \ JSON-escaped. No such ending when fewer than two
#               parts remain, an operator sits inside (, $( or backticks, a part
#               holds a control character (a newline, a tab), the chain holds a ||
#               (the second part runs only on the first one's failure), or a part
#               before the last opens with cd, pushd, export, source, . or a
#               NAME=value word (it sets state the later parts need).
#            R2 (coder and both reviewers): git in command position, any global
#               options (-C <arg>, -c <arg>, --git-dir=..., --work-tree=..., other
#               -options), then the subcommand stash, checkout, restore or clean.
#            R3 (coder): rm in command position, or xargs in command position whose
#               command word, after its options, is rm (git rm and rmdir are not rm).
#               The reason ends, after one space, on `Run instead: `git rm -r -q --
#               <operands>`.` only when the command is one rm word and plain words (no
#               separator, redirect, quote, backslash, $, backtick, *, ? or [), its
#               operands every word not opening with - (words after -- included), at
#               least one.
#            R4 (coder): sed in command position with an argument -i... or
#               --in-place...; perl in command position with an option cluster
#               holding i (-i, -pi); an unquoted >, >>, &> or <digit>> whose target
#               is a relative path (not opening with /, ~ or $, not &<digit>) that
#               does not start .temp/ or ./.temp/; tee in command position with
#               such a file argument. The reason ends, after one space, on `Run instead:
#               `<command>`.` only when the write is one redirect (>, >>, >|, &> or N>)
#               onto an unquoted file name and nothing else writes: the command with that
#               target written .temp/<target>, a leading ./ dropped once, a " or \
#               JSON-escaped. No such ending for a target still holding a /, a quoted
#               or $-, *-, ?- or [-holding target, a second redirect, any >& form (2>&1),
#               sed -i, perl -pi or tee, or a command holding a control character.
#            R5 (coder): python, python2 or python3 with -c (alone or ending an
#               option cluster, -Bc); node with -e, --eval, -p, --print or a cluster
#               holding e or p; ruby with a cluster holding e; perl with a cluster
#               holding e or E; and python, python2, python3, node, ruby, perl, bash
#               or sh whose script (first argument that is no option) opens .temp/ or
#               ./.temp/. A cluster ends at the first letter taking an attached
#               argument (python -m -W -X -Q, node -r, ruby -I -r -C -x, perl -I -M
#               -m -x), so -I, -r, -M and the like never read as code; python -m
#               and bash -c or -s end the scan. perl -pi stays R4.
#            Rules are tried in the order R1, R2, R3, R4, R5.
#   exit 0 : always (fail-open: a broken guard must never block a command).
#            JSON is read with bash regexes; jq is not assumed. patsub_replacement is
#            switched off so a backslash in a replacement string stays literal.
set -u
LC_ALL=C
# bash 5.2 reads a backslash or & in a ${var//pat/rep} replacement as an escape or the
# matched text; every replacement below is literal. Older bash has no such option.
shopt -u patsub_replacement 2>/dev/null || true

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

# Chain operators for the R1 suffix: start and end offsets in cmd of each unquoted
# ;, && or ||, nested set once one sits inside (, $( or backticks, depth and bt
# the nesting seen so far, endpos the start of a trailing comment (-1 when none).
ops_s=()
ops_e=()
nops=0
nested=0
depth=0
bt=0
endpos=-1

rec_op() {
  ops_s[nops]="$1"
  ops_e[nops]="$2"
  nops=$((nops + 1))
  if ((depth > 0 || bt)); then nested=1; fi
}

# Raw offsets of each word in cmd (start, end) and whether it held a quote or a
# backslash, for the R4 suffix; wst, wq follow the word being built, dup is set by
# any >& form (a descriptor duplication or >&word).
tws=()
twe=()
twq=()
wst=0
wq=0
dup=0

wstart() {
  if ((!inword)); then
    wst=$i
    wq=0
  fi
}

flush() {
  if ((inword)); then
    add W "$word"
    tws[n - 1]=$wst
    twe[n - 1]=$i
    twq[n - 1]=$wq
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
      wstart
      wq=1
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
      wstart
      wq=1
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
        wstart
        wq=1
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
          endpos=$i
          i=$len
        fi
      fi
      ;;
    '$')
      if [[ "${cmd:i+1:1}" == '(' ]]; then
        flush
        add X '$('
        depth=$((depth + 1))
        i=$((i + 2))
      else
        wstart
        word+="$c"
        inword=1
        i=$((i + 1))
      fi
      ;;
    '`')
      flush
      add X '`'
      bt=$((1 - bt))
      i=$((i + 1))
      ;;
    '(')
      flush
      add X '('
      depth=$((depth + 1))
      i=$((i + 1))
      ;;
    ')')
      flush
      add E ')'
      ((depth > 0)) && depth=$((depth - 1))
      i=$((i + 1))
      ;;
    ';')
      flush
      add X ';'
      rec_op "$i" $((i + 1))
      i=$((i + 1))
      ;;
    '|')
      flush
      if [[ "${cmd:i+1:1}" == '|' ]]; then
        add X '||'
        rec_op "$i" $((i + 2))
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
        rec_op "$i" $((i + 2))
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
      [[ "${cmd:i:1}" == '&' ]] && dup=1
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
      wstart
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

# scan_interp <kind>: walks the options of an interpreter command held in args[0..na-1]
# and sets r5 when one carries inline code or the script opens .temp/. An option
# cluster is read letter by letter: a target letter is inline code, a stop letter
# takes the rest of the cluster (or, last in it, the next argument) as its value, and
# a bail letter hands the rest of the command to a module, string or stdin.
scan_interp() {
  local kind="$1" tgt='' stp='' bail='' x=0 a q ch
  case "$kind" in
    python) tgt='c' stp='WXQ' bail='m' ;;
    node) tgt='ep' stp='r' ;;
    ruby) tgt='e' stp='IrCx' ;;
    perl) tgt='eE' stp='IMmx' ;;
    shell) stp='oO' bail='cs' ;;
  esac
  while ((x < na)); do
    a="${args[x]}"
    x=$((x + 1))
    case "$a" in
      -) return ;;
      --)
        if ((x < na)); then
          case "${args[x]}" in .temp/* | ./.temp/*) r5=1 ;; esac
        fi
        return
        ;;
      --eval | --eval=* | --print | --print=*)
        [[ "$kind" == node ]] && r5=1
        ;;
      --require | --import | --loader | --experimental-loader | --env-file | --conditions | --rcfile | --init-file)
        x=$((x + 1))
        ;;
      --*) ;;
      -?*)
        q=1
        while ((q < ${#a})); do
          ch="${a:q:1}"
          if [[ -n "$tgt" && "$tgt" == *"$ch"* ]]; then
            r5=1
            return
          fi
          [[ -n "$bail" && "$bail" == *"$ch"* ]] && return
          if [[ -n "$stp" && "$stp" == *"$ch"* ]]; then
            ((q == ${#a} - 1)) && x=$((x + 1))
            break
          fi
          q=$((q + 1))
        done
        ;;
      .temp/* | ./.temp/*)
        r5=1
        return
        ;;
      *) return ;;
    esac
  done
}

r1=0
r2=0
r3=0
r4=0
r5=0
nr=0
rt=-1
r4o=0
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
    R)
      pend=2
      nr=$((nr + 1))
      ;;
    L) pend=1 ;;
    W)
      if ((pend)); then
        if ((pend == 2)) && is_tree_path "$v"; then
          r4=1
          rt=$((j - 1))
        fi
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
            case "${args[x]}" in -i* | --in-place*) r4=1 r4o=1 ;; esac
            x=$((x + 1))
          done
          ;;
        perl)
          while ((x < na)); do
            [[ "${args[x]}" =~ ^-[0-9pnlaFsStTuUvwWcA]*i ]] && r4=1 r4o=1
            x=$((x + 1))
          done
          scan_interp perl
          ;;
        python | python2 | python3) scan_interp python ;;
        node) scan_interp node ;;
        ruby) scan_interp ruby ;;
        bash | sh) scan_interp shell ;;
        tee)
          while ((x < na)); do
            o="${args[x]}"
            case "$o" in -*) ;; *) is_tree_path "$o" && r4=1 r4o=1 ;; esac
            x=$((x + 1))
          done
          ;;
      esac
      ;;
  esac
done

# chain_suffix: sets suffix to the parts of the chain as separate calls, left empty
# when an operator sits inside (, $( or backticks, fewer than two parts remain, a part
# holds a control character, the chain holds a ||, or a part before the last opens with
# cd, pushd, export, source, . or a NAME=value word (a split would change what runs).
suffix=''
chain_suffix() {
  ((nested)) && return
  local prev=0 k=0 end stop=$len part list='' count=0 fw lead=0
  ((endpos >= 0)) && stop=$endpos
  while ((k <= nops)); do
    if ((k < nops)); then
      end="${ops_s[k]}"
      [[ "${cmd:end:2}" == '||' ]] && return
    else
      end=$stop
    fi
    ((end < prev)) && end=$prev
    part="${cmd:prev:end-prev}"
    prev="${ops_e[k]-0}"
    k=$((k + 1))
    part="${part#"${part%%[![:blank:]]*}"}"
    part="${part%"${part##*[![:blank:]]}"}"
    [[ -z "$part" ]] && continue
    [[ "$part" == *[[:cntrl:]]* ]] && return
    ((lead)) && return
    fw="${part%%[[:blank:]]*}"
    case "$fw" in
      cd | pushd | export | source | .) lead=1 ;;
      *) [[ "$fw" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && lead=1 ;;
    esac
    part="${part//\\/$sep}"
    part="${part//$dq/$bs$dq}"
    part="${part//$sep/$bs$bs}"
    if ((count)); then list+=" then \`$part\`"; else list="\`$part\`"; fi
    count=$((count + 1))
  done
  ((count >= 2)) && suffix=" Run instead, one call each: $list."
}

# rm_suffix: sets suffix to the git rm form of a plain rm, left empty unless the whole
# command is one rm word followed by plain words (no separator, redirect, quote,
# backslash, $, backtick, *, ? or [) with at least one operand.
rm_suffix() {
  local x=1 ops='' w dd=0 count=0
  ((n >= 2)) || return
  [[ "${tk[0]}" == W && "${tv[0]}" == rm ]] || return
  case "$cmd" in *"'"* | *'"'* | *'\'*) return ;; esac
  while ((x < n)); do
    [[ "${tk[x]}" == W ]] || return
    w="${tv[x]}"
    x=$((x + 1))
    if ((dd == 0)); then
      if [[ "$w" == -- ]]; then
        dd=1
        continue
      fi
      [[ "$w" == -* ]] && continue
    fi
    case "$w" in *'$'* | *'*'* | *'?'* | *'['* | *'`'*) return ;; esac
    ops+=" $w"
    count=$((count + 1))
  done
  ((count)) || return
  [[ "$ops" == *[[:cntrl:]]* ]] && return
  suffix=" Run instead: \`git rm -r -q --$ops\`."
}

# redirect_suffix: sets suffix to the command with its one redirect target written
# under .temp/, left empty unless the command holds exactly one redirect, the write
# comes from that redirect alone, no >& form is present and the target is an unquoted
# plain file name with no / left once a leading ./ is dropped.
redirect_suffix() {
  local name fixed
  ((nr == 1 && rt >= 0 && !r4o && !dup)) || return
  ((twq[rt])) && return
  name="${tv[rt]#./}"
  case "$name" in '' | . | .. | */* | *'$'* | *'*'* | *'?'* | *'['*) return ;; esac
  fixed="${cmd:0:tws[rt]}.temp/$name${cmd:twe[rt]}"
  fixed="${fixed#"${fixed%%[![:blank:]]*}"}"
  fixed="${fixed%"${fixed##*[![:blank:]]}"}"
  [[ "$fixed" == *[[:cntrl:]]* ]] && return
  fixed="${fixed//\\/$sep}"
  fixed="${fixed//$dq/$bs$dq}"
  fixed="${fixed//$sep/$bs$bs}"
  suffix=" Run instead: \`$fixed\`."
}

reason=''
if ((coder && r1)); then
  reason='one command per Bash call - run each part of the chain as its own Bash call.'
  chain_suffix
elif ((r2)); then
  reason='git is read-only here (status, diff, log, show) - compare with git show HEAD:<path> or git diff instead.'
elif ((coder && r3)); then
  reason='remove a file or directory with git rm -r -q -- <path>, never rm.'
  rm_suffix
elif ((coder && r4)); then
  reason='Bash never writes a file - change it with Edit or Write, and redirect scratch output only under .temp/.'
  redirect_suffix
elif ((coder && r5)); then
  reason='Bash never runs inline or scratch interpreter code - change a file with Edit or Write, and run tests and project scripts by their own command.'
fi

if [[ -n "$reason" ]]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"viber guard: '"$reason$suffix"'"}}'
fi
exit 0

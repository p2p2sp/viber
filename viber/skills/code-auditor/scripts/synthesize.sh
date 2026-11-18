#!/bin/sh
# viber - skills/code-auditor/scripts/synthesize.sh
# Writes the run's findings.md from its ledger, the head lines of its reports and
# the verdict files of its critics, and prints the summary line and the fill block.
#
# Why it exists: folding a verdict into a finding, ranking the pool by severity,
# verdict, confidence and hunt order, applying the cap of ten and the 4.0 floor of
# a full entry, and counting units, hunts and coverage were rules the model applied
# by hand on every run, each one a chance to change an entry or a count. One script
# applies them the same way every time; the model keeps only the prose of each
# entry, which it fills in afterwards.
#
# Folding, per finding (a report <hunt id>-<k>.md with k 1 to 9):
#   REFUTED               dropped, as if it never existed.
#   VERIFIED, PARTIALLY   confidence as filed; the critic SEVERITY becomes the
#   VERIFIED              severity of the entry, noted beside the filed one.
#   INCONCLUSIVE, no      filed severity; confidence one step lower (high to
#   verdict line, no      medium, medium to low, low stays); the verdict reads
#   verdict file          INCONCLUSIVE and the STATUS line names the missing oracle
#                         (a fill-in marker) or says the critic returned no verdict.
# Order: higher severity, then VERIFIED before PARTIALLY VERIFIED before
# INCONCLUSIVE, then higher confidence, then hunt order (U<n> by n, A-<slug> in the
# lens angle order, V-<n> by n, then k). The first ten findings of severity 4.0 or
# more get a full entry; every other one goes to the further findings.
#
# Merging: two surviving findings of one file whose LOCATION ranges overlap or have
# at most 5 lines between them (any CLASS) are a merge pair for the model to judge.
# Every pair not decided by the ledger is printed before anything is written. A
# --merge group becomes one finding: the title, CLASS and name of its first member
# in hunt order, every member LOCATION joined on one line, the highest severity, the
# strongest verdict and the highest confidence, one slot against the cap.
#
# Contract:
#   argv   : <ws> - the run workspace, <root>/.temp/viber/code-auditor/<run-id> -
#            then any number of --merge <id>,<id>[,<id>]... (a group of two or
#            more distinct finding ids, each <hunt id>-<k>), or one --merge none,
#            never both. Nothing else is accepted.
#   cwd    : irrelevant: every path derives from <ws>, so cwd only resolves a
#            relative one.
#   env    : none read beyond what the shell itself reads.
#   files  : reads <ws>/run.md (Lens:, Lens file:, Scope: and the units of its
#            ## Units section), <ws>/ledger.md (the hunt:, merge: and apart:
#            lines), the first five lines of each <ws>/reports/<hunt id>-<k>.md,
#            each <ws>/verdicts/<hunt id>-<k>.md and the ## Hunts angle headings of
#            the lens file, and the wave-offered line of the ledger. A report of
#            another hunt never counts: hunt A-x owns A-x-<digit>.md only, never
#            A-x-y-1.md. Writes <ws>/findings.md whole; an entry whose
#            <!-- finding: <id> --> marker already holds paragraphs there keeps
#            them and its STATUS: line, whatever its new number. A call with --merge
#            also appends to <ws>/ledger.md one merge: line per group, then one
#            apart: line per pair it printed that no group joins (--merge none:
#            every printed pair). When it offers the variant wave it writes
#            <ws>/seeds.md (one Seed: line per distinct CLASS of a confirmed
#            finding, in rank order) and appends wave-offered to the ledger. Nothing
#            else is written, and nothing at all while a pair is undecided and no
#            --merge came.
#   stdout : with an undecided pair and no --merge, only:
#              NEXT: merge
#              merge?: <id> <id>
#              finding: <id> | <LOCATION> | <CLASS> | <OBSERVED or none>
#              finding: <id> | <LOCATION> | <CLASS> | <OBSERVED or none>
#            one merge?: line and its two finding: lines per pair. Otherwise
#            report lines, then one directive block:
#              summary: units <U> | hunts <H> | confirmed <K> | not investigated <J>
#              last-line: /viber:intent <ws>/findings.md
#              NEXT: fill | findings: <ws>/findings.md
#              entry: <n> | reports: <path>[, <path>] | verdict: <VERDICT> | observed: <OBSERVED or none>
#              ASK: run the variant wave -> wave | end the run -> end
#            last-line: only with K of 1 or more. One entry: line per full entry not
#            filled yet, <n> its heading number, the reports of every member of a
#            merged entry listed. With none the block is the single line NEXT: none.
#            ASK: only with K of 1 or more, no wave-offered line in the ledger, and
#            the diff scope or J of 1 or more; it follows the fill block.
#            U counts the map units, H the distinct hunts of the ledger, K the
#            findings left after folding whose verdict is VERIFIED or PARTIALLY
#            VERIFIED, J the mapped units no hunt left a report for (0 on the diff
#            scope, where the angle hunts take on every unit).
#   exit   : 0 on success. 2 with one error: line on stderr and nothing on stdout
#            when <ws> is missing or names no run.md or ledger.md, on any
#            argument other than <ws> and --merge, on --merge none beside a group,
#            on a group of fewer than two distinct ids, or on a --merge id naming
#            no surviving finding; nothing is written then.
set -u
set -f

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

nl='
'
ws=""
merges=""
none=""
while [ $# -gt 0 ]; do
  case $1 in
    --merge)
      [ $# -ge 2 ] || fail "--merge needs a value"
      if [ "$2" = none ]; then
        none=1
      else
        merges="$merges$2$nl"
      fi
      shift 2
      ;;
    *)
      if [ -n "$ws" ]; then
        fail "unexpected argument: $1"
      fi
      ws=$1
      shift
      ;;
  esac
done
[ -n "$ws" ] || fail "usage: synthesize.sh <ws> [--merge <id>,<id>[,<id>]...]... | [--merge none]"
if [ -n "$none" ] && [ -n "$merges" ]; then
  fail "--merge none cannot join merge groups"
fi
case $ws in
  */) ws=${ws%/} ;;
esac
[ -f "$ws/run.md" ] || fail "run file not found: $ws/run.md"
[ -f "$ws/ledger.md" ] || fail "ledger not found: $ws/ledger.md"

dot=$(printf '\302\267')
runid=${ws##*/}

# The portability sweep reads a line holding the word function and a name as the
# bash keyword, so each awk function below breaks its line after the word, and a
# getline condition opens with a spaced parenthesis for the same reason.
WS=$ws RUNID=$runid DOT=$dot MERGES=$merges NONE=$none awk '
function \
trim(s) {
  sub(/^[ \t]+/, "", s)
  sub(/[ \t]+$/, "", s)
  return s
}
function \
after(line, key) {
  return trim(substr(line, length(key) + 1))
}
function \
tenths(x) {
  return int(x * 10 + 0.5)
}
function \
fmt(t) {
  return sprintf("%.1f", t / 10)
}
function \
crank(c) {
  c = tolower(c)
  if (c == "high") return 0
  if (c == "medium") return 1
  return 2
}
function \
cname(r) {
  if (r == 0) return "high"
  if (r == 1) return "medium"
  return "low"
}
function \
isort(n, keys, ord,    i, j, x) {
  for (i = 1; i <= n; i++) ord[i] = i
  for (i = 2; i <= n; i++) {
    x = ord[i]
    for (j = i - 1; j >= 1 && keys[ord[j]] > keys[x]; j--) ord[j + 1] = ord[j]
    ord[j + 1] = x
  }
}
function \
joined(list) {
  return list == "" ? "none" : list
}
function \
die(msg,    cmd) {
  cmd = "cat 1>&2"
  print "error: " msg | cmd
  close(cmd)
  exit 2
}
function \
fline(i) {
  return sid[i] " | " sloc[i] " | " sclass[i] " | " (sobs[i] == "" ? "none" : sobs[i])
}
function \
parseloc(i,    loc, f, rng, n, q) {
  pok[i] = 0
  loc = sloc[i]
  if (!match(loc, /:L[0-9]+(-L[0-9]+)?$/)) return
  f = substr(loc, 1, RSTART - 1)
  sub(/^\.\//, "", f)
  if (f == "") return
  rng = substr(loc, RSTART + 2)
  n = split(rng, q, "-L")
  ps[i] = q[1] + 0
  pe[i] = (n > 1) ? q[2] + 0 : ps[i]
  if (ps[i] > pe[i]) return
  pfile[i] = f
  pok[i] = 1
}
function \
near(a, b,    hi, lo) {
  if (!pok[a] || !pok[b] || pfile[a] != pfile[b]) return 0
  hi = (ps[a] > ps[b]) ? ps[a] : ps[b]
  lo = (pe[a] < pe[b]) ? pe[a] : pe[b]
  return hi - lo <= 6
}
function \
samegroup(a, b) {
  if (!(sid[a] in grp) || !(sid[b] in grp)) return 0
  return grp[sid[a]] == grp[sid[b]]
}
function \
keepflush(    a, b, i) {
  if (curid != "" && !hasfill) {
    a = 1
    b = bn
    while (a <= b && bl[a] == "") a++
    while (b >= a && bl[b] == "") b--
    if (a <= b) {
      keepn[curid] = b - a + 1
      for (i = a; i <= b; i++) keepl[curid, i - a + 1] = bl[i]
      keepstat[curid] = stat
    }
  }
  curid = ""
  bn = 0
  hasfill = 0
}
function \
readkept(file,    line) {
  inent = 0
  stat = ""
  curid = ""
  bn = 0
  hasfill = 0
  while ( (getline line < file) > 0) {
    sub(/\r$/, "", line)
    if (line ~ /^## /) {
      keepflush()
      inent = (line ~ /^## [0-9]+\. /)
      stat = ""
      continue
    }
    if (!inent) continue
    if (curid == "") {
      if (line ~ /^STATUS: /) stat = line
      else if (line ~ /^<!-- finding: .* -->$/) {
        curid = substr(line, 15, length(line) - 18)
        skipsev = 1
      }
      continue
    }
    if (skipsev && line ~ /^Severity adopted from the critic:/) {
      skipsev = 0
      continue
    }
    if (line != "") skipsev = 0
    if (line == "<!-- fill -->") hasfill = 1
    bl[++bn] = line
  }
  close(file)
  keepflush()
}
function \
addgroup(n, ids,    i, j, lab, old) {
  lab = ++nlab
  for (i = 1; i <= n; i++) if (ids[i] in grp) old[grp[ids[i]]] = 1
  for (j in grp) if (grp[j] in old) grp[j] = lab
  for (i = 1; i <= n; i++) grp[ids[i]] = lab
}

BEGIN {
  ws = ENVIRON["WS"]
  runid = ENVIRON["RUNID"]
  dot = ENVIRON["DOT"]
  hdr = 1
  inunits = 0
  nu = 0
  rf = ws "/run.md"
  while ( (getline line < rf) > 0) {
    sub(/\r$/, "", line)
    if (line ~ /^## /) hdr = 0
    if (hdr) {
      if (line ~ /^Lens: / && lens == "") lens = after(line, "Lens:")
      else if (line ~ /^Lens file: / && lensfile == "") lensfile = after(line, "Lens file:")
      else if (line ~ /^Scope: / && scope == "") scope = after(line, "Scope:")
    }
    if (line ~ /^## Units[ \t]*$/) inunits = 1
    else if (line ~ /^## /) inunits = 0
    else if (inunits && match(line, /^- U[0-9]+/)) unitid[++nu] = substr(line, 3, RLENGTH - 2)
  }
  close(rf)
  na = 0
  inh = 0
  if (lensfile != "") {
    while ( (getline line < lensfile) > 0) {
      sub(/\r$/, "", line)
      if (line ~ /^## /) inh = (line ~ /^## Hunts[ \t]*$/)
      else if (inh && line ~ /^### /) {
        slug = trim(substr(line, 5))
        if (!(slug in angle)) angle[slug] = ++na
      }
    }
    close(lensfile)
  }
}

/^hunt: / {
  sub(/\r$/, "")
  n = split($0, p, "|")
  id = trim(substr(trim(p[1]), 7))
  unit = ""
  for (i = 2; i <= n; i++) {
    q = trim(p[i])
    if (q ~ /^unit: /) unit = trim(substr(q, 7))
  }
  if (id == "" || (id in seen)) next
  seen[id] = 1
  nh++
  hid[nh] = id
  hunit[nh] = unit
}

/^merge: / {
  sub(/\r$/, "")
  mgl[++nmg] = trim(substr($0, 8))
}

/^apart: / {
  sub(/\r$/, "")
  if (split(trim(substr($0, 8)), aq, " ") == 2) {
    apart[aq[1] " " aq[2]] = 1
    apart[aq[2] " " aq[1]] = 1
  }
}

/^wave-offered[ \t]*$/ {
  waveoffered = 1
}

END {
  ns = 0
  for (h = 1; h <= nh; h++) {
    id = hid[h]
    if (id ~ /^U[0-9]+$/) {
      cl = 0
      num = substr(id, 2) + 0
    } else if (id ~ /^A-/) {
      cl = 1
      slug = substr(id, 3)
      num = (slug in angle) ? angle[slug] : 999999
    } else if (id ~ /^V-[0-9]+$/) {
      cl = 2
      num = substr(id, 3) + 0
    } else {
      cl = 3
      num = 0
    }
    hk[h] = sprintf("k%d%06d%06d", cl, num, h)
    unit = hunit[h]
    if (unit !~ /^U[0-9]+$/) unit = (id ~ /^U[0-9]+$/) ? id : ""
    nfiles = 0
    nfind = 0
    for (k = 0; k <= 9; k++) {
      f = ws "/reports/" id "-" k ".md"
      if ( (getline line < f) <= 0) {
        close(f)
        continue
      }
      nfiles++
      if (k == 0) {
        close(f)
        continue
      }
      nfind++
      title = ""; loc = ""; klass = ""; sev = ""; conf = ""
      c = 1
      while (1) {
        sub(/\r$/, "", line)
        if (title == "" && line ~ /^# /) title = trim(substr(line, 3))
        else if (line ~ /^LOCATION:/) loc = after(line, "LOCATION:")
        else if (line ~ /^CLASS:/) klass = after(line, "CLASS:")
        else if (line ~ /^SEVERITY:/) sev = after(line, "SEVERITY:")
        else if (line ~ /^CONFIDENCE:/) conf = after(line, "CONFIDENCE:")
        if (c >= 5 || (getline line < f) <= 0) break
        c++
      }
      close(f)
      verdict = "none"
      crit = ""
      obs = ""
      oseen = 0
      sseen = 0
      vf = ws "/verdicts/" id "-" k ".md"
      while ( (getline line < vf) > 0) {
        sub(/\r$/, "", line)
        if (verdict == "none" && line ~ /^VERDICT:/) {
          v = after(line, "VERDICT:")
          if (v == "VERIFIED" || v == "REFUTED" || v == "PARTIALLY VERIFIED" || v == "INCONCLUSIVE") verdict = v
        } else if (!oseen && line ~ /^OBSERVED:/) {
          oseen = 1
          obs = after(line, "OBSERVED:")
        } else if (!sseen && line ~ /^SEVERITY:/) {
          sseen = 1
          s = after(line, "SEVERITY:")
          if (s ~ /^[0-9]+(\.[0-9]+)?$/) crit = s
        }
      }
      close(vf)
      if (verdict == "REFUTED") continue
      if (sev !~ /^[0-9]+(\.[0-9]+)?$/) sev = "0"
      ns++
      sid[ns] = id "-" k
      stitle[ns] = title
      sloc[ns] = loc
      sclass[ns] = klass
      sobs[ns] = obs
      sfiled[ns] = tenths(sev)
      if (verdict == "VERIFIED") sv[ns] = 0
      else if (verdict == "PARTIALLY VERIFIED") sv[ns] = 1
      else sv[ns] = 2
      seff[ns] = (sv[ns] < 2 && crit != "") ? tenths(crit) : sfiled[ns]
      if (seff[ns] > 1000) seff[ns] = 1000
      sconf[ns] = crank(conf)
      if (sv[ns] == 2 && sconf[ns] < 2) sconf[ns]++
      sstat[ns] = (verdict == "none") ? "critic returned no verdict" : "<!-- oracle -->"
      sreps[ns] = ws "/reports/" sid[ns] ".md"
      stail[ns] = hk[h] k
      skey[ns] = sprintf("k%06d%d%d", 100000 - seff[ns], sv[ns], sconf[ns]) stail[ns]
      sidx[sid[ns]] = ns
      parseloc(ns)
    }
    if (nfiles == 0) hstate[h] = "none"
    else if (nfind == 0) hstate[h] = "nofinding"
    else hstate[h] = "found"
    if (hstate[h] != "none" && unit != "") inv[unit] = 1
  }

  isort(ns, stail, horder)
  for (m = 1; m <= nmg; m++) {
    n = split(mgl[m], mid, ",")
    c = 0
    for (x = 1; x <= n; x++) {
      v = trim(mid[x])
      if (v in sidx) lid[++c] = v
    }
    if (c >= 2) addgroup(c, lid)
  }

  npair = 0
  for (r = 1; r <= ns; r++) {
    for (t = r + 1; t <= ns; t++) {
      a = horder[r]
      b = horder[t]
      if (!near(a, b)) continue
      if (samegroup(a, b)) continue
      pk = sid[a] " " sid[b]
      if (pk in apart) continue
      npair++
      pa[npair] = a
      pb[npair] = b
    }
  }

  nargs = 0
  hasarg = (ENVIRON["NONE"] != "" || ENVIRON["MERGES"] != "")
  ng = split(ENVIRON["MERGES"], mline, "\n")
  for (x = 1; x <= ng; x++) {
    if (mline[x] == "") continue
    n = split(mline[x], mid, ",")
    c = 0
    split("", uniq)
    for (y = 1; y <= n; y++) {
      v = trim(mid[y])
      if (!(v in sidx)) die("merge id names no finding: " v)
      if (v in uniq) continue
      uniq[v] = 1
      c++
      argid[nargs + 1, c] = v
    }
    if (c < 2) die("merge group needs two findings: " trim(mline[x]))
    argn[++nargs] = c
  }

  if (!hasarg && npair > 0) {
    print "NEXT: merge"
    for (pp = 1; pp <= npair; pp++) {
      print "merge?: " sid[pa[pp]] " " sid[pb[pp]]
      print "finding: " fline(pa[pp])
      print "finding: " fline(pb[pp])
    }
    exit 0
  }

  if (hasarg) {
    ledger = ws "/ledger.md"
    for (x = 1; x <= nargs; x++) {
      for (y = 1; y <= argn[x]; y++) lid[y] = argid[x, y]
      addgroup(argn[x], lid)
      line = argid[x, 1]
      for (y = 2; y <= argn[x]; y++) line = line "," argid[x, y]
      print "merge: " line >> ledger
    }
    for (pp = 1; pp <= npair; pp++) {
      if (!samegroup(pa[pp], pb[pp])) print "apart: " sid[pa[pp]] " " sid[pb[pp]] >> ledger
    }
    close(ledger)
  }

  for (r = 1; r <= ns; r++) {
    i = horder[r]
    if (!(sid[i] in grp)) continue
    g = grp[sid[i]]
    if (!(g in lead)) {
      lead[g] = i
      continue
    }
    f = lead[g]
    dead[i] = 1
    sloc[f] = sloc[f] ", " sloc[i]
    sreps[f] = sreps[f] ", " sreps[i]
    if (seff[i] > seff[f]) seff[f] = seff[i]
    if (sfiled[i] > sfiled[f]) sfiled[f] = sfiled[i]
    if (sconf[i] < sconf[f]) sconf[f] = sconf[i]
    if (sv[i] < sv[f] || (sv[i] == sv[f] && sobs[f] == "")) sobs[f] = sobs[i]
    if (sv[i] < sv[f]) sv[f] = sv[i]
    skey[f] = sprintf("k%06d%d%d", 100000 - seff[f], sv[f], sconf[f]) stail[f]
  }

  isort(ns, skey, ord)
  vname[0] = "VERIFIED"
  vname[1] = "PARTIALLY VERIFIED"
  vname[2] = "INCONCLUSIVE"
  confirmed = 0
  nfull = 0
  nfurther = 0
  for (r = 1; r <= ns; r++) {
    i = ord[r]
    if (i in dead) continue
    if (sv[i] < 2) confirmed++
    if (seff[i] >= 40 && nfull < 10) full[++nfull] = i
    else further[++nfurther] = i
  }

  diff = (scope == "diff" || scope == "./diff")
  jn = 0
  jlist = ""
  if (!diff) {
    for (u = 1; u <= nu; u++) {
      if (!(unitid[u] in inv)) {
        jn++
        jlist = jlist (jlist == "" ? "" : ", ") unitid[u]
      }
    }
  }

  isort(nh, hk, hord)
  nofind = ""
  noreport = ""
  for (r = 1; r <= nh; r++) {
    h = hord[r]
    if (hstate[h] == "nofinding") nofind = nofind (nofind == "" ? "" : ", ") hid[h]
    else if (hstate[h] == "none") noreport = noreport (noreport == "" ? "" : ", ") hid[h]
  }

  out = ws "/findings.md"
  readkept(out)
  print "# Findings - " runid " (" lens ", " scope ")" > out
  print lens " " dot " " scope " " dot " " nu " units mapped " dot " " nh " hunts " dot " " confirmed " confirmed findings " dot " " jn " units not investigated." > out
  print "" > out
  for (e = 1; e <= nfull; e++) {
    i = full[e]
    print "## " e ". " stitle[i] > out
    print "SEVERITY: " fmt(seff[i]) > out
    print "CONFIDENCE: " cname(sconf[i]) > out
    print "VERDICT: " vname[sv[i]] > out
    kept = (sid[i] in keepn)
    if (sv[i] == 2) {
      if (kept && keepstat[sid[i]] != "") print keepstat[sid[i]] > out
      else print "STATUS: INCONCLUSIVE - " sstat[i] > out
    }
    print "LOCATION: " sloc[i] > out
    print "CLASS: " sclass[i] > out
    print "<!-- finding: " sid[i] " -->" > out
    if (sv[i] < 2) print "Severity adopted from the critic: " fmt(seff[i]) " (filed " fmt(sfiled[i]) ")" > out
    if (kept) {
      for (y = 1; y <= keepn[sid[i]]; y++) print keepl[sid[i], y] > out
    } else {
      print "<!-- fill -->" > out
      tofill[++ntofill] = e
    }
    print "" > out
  }
  print "## Further findings (" nfurther ")" > out
  for (r = 1; r <= nfurther; r++) {
    i = further[r]
    print fmt(seff[i]) " " dot " " sloc[i] " " dot " " sclass[i] " " dot " " stitle[i] " " dot " " sreps[i] > out
  }
  print "" > out
  print "## Coverage notes" > out
  print "- Units not investigated: " joined(jlist) > out
  print "- Hunts with no finding: " joined(nofind) > out
  print "- Hunts with no report: " joined(noreport) > out
  close(out)

  print "summary: units " nu " | hunts " nh " | confirmed " confirmed " | not investigated " jn
  if (confirmed >= 1) print "last-line: /viber:intent " out
  if (ntofill == 0) {
    print "NEXT: none"
  } else {
    print "NEXT: fill | findings: " out
    for (t = 1; t <= ntofill; t++) {
      e = tofill[t]
      i = full[e]
      print "entry: " e " | reports: " sreps[i] " | verdict: " vname[sv[i]] " | observed: " (sobs[i] == "" ? "none" : sobs[i])
    }
  }

  if (confirmed >= 1 && !waveoffered && (diff || jn > 0)) {
    seeds = ws "/seeds.md"
    printf "" > seeds
    for (r = 1; r <= ns; r++) {
      i = ord[r]
      if (i in dead) continue
      if (sv[i] >= 2 || sclass[i] == "" || (sclass[i] in seeded)) continue
      seeded[sclass[i]] = 1
      print "Seed: " sclass[i] > seeds
    }
    close(seeds)
    ledger = ws "/ledger.md"
    print "wave-offered" >> ledger
    close(ledger)
    print "ASK: run the variant wave -> wave | end the run -> end"
  }
}
' "$ws/ledger.md"
status=$?

exit $status

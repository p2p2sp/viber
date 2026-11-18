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
# Contract:
#   argv   : <ws> - the run workspace, <root>/.temp/viber/code-auditor/<run-id>.
#            Nothing else is accepted.
#   cwd    : irrelevant: every path derives from <ws>, so cwd only resolves a
#            relative one.
#   env    : none read beyond what the shell itself reads.
#   files  : reads <ws>/run.md (Lens:, Lens file:, Scope: and the units of its
#            ## Units section), <ws>/ledger.md (the hunt: lines), the first five
#            lines of each <ws>/reports/<hunt id>-<k>.md, each
#            <ws>/verdicts/<hunt id>-<k>.md and the ## Hunts angle headings of the
#            lens file. A report of another hunt never counts: hunt A-x owns
#            A-x-<digit>.md only, never A-x-y-1.md. Writes <ws>/findings.md whole,
#            nothing else.
#   stdout : report lines, then one directive block:
#              summary: units <U> | hunts <H> | confirmed <K> | not investigated <J>
#              NEXT: fill | findings: <ws>/findings.md
#              entry: <n> | reports: <path> | verdict: <VERDICT> | observed: <OBSERVED or none>
#            one entry: line per full entry, <n> its heading number. With no full
#            entry the block is the single line NEXT: none.
#            U counts the map units, H the distinct hunts of the ledger, K the
#            findings left after folding whose verdict is VERIFIED or PARTIALLY
#            VERIFIED, J the mapped units no hunt left a report for (0 on the diff
#            scope, where the angle hunts take on every unit).
#   exit   : 0 on success. 2 with one error: line on stderr and nothing on stdout
#            when <ws> is missing or names no run.md or ledger.md, or on any
#            argument other than <ws>.
set -u
set -f

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 2
}

ws=""
while [ $# -gt 0 ]; do
  if [ -n "$ws" ]; then
    fail "unexpected argument: $1"
  fi
  ws=$1
  shift
done
[ -n "$ws" ] || fail "usage: synthesize.sh <ws>"
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
WS=$ws RUNID=$runid DOT=$dot awk '
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
      skey[ns] = sprintf("k%06d%d%d", 100000 - seff[ns], sv[ns], sconf[ns]) hk[h] k
    }
    if (nfiles == 0) hstate[h] = "none"
    else if (nfind == 0) hstate[h] = "nofinding"
    else hstate[h] = "found"
    if (hstate[h] != "none" && unit != "") inv[unit] = 1
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
  print "# Findings - " runid " (" lens ", " scope ")" > out
  print lens " " dot " " scope " " dot " " nu " units mapped " dot " " nh " hunts " dot " " confirmed " confirmed findings " dot " " jn " units not investigated." > out
  print "" > out
  for (e = 1; e <= nfull; e++) {
    i = full[e]
    print "## " e ". " stitle[i] > out
    print "SEVERITY: " fmt(seff[i]) > out
    print "CONFIDENCE: " cname(sconf[i]) > out
    print "VERDICT: " vname[sv[i]] > out
    if (sv[i] == 2) print "STATUS: INCONCLUSIVE - " sstat[i] > out
    print "LOCATION: " sloc[i] > out
    print "CLASS: " sclass[i] > out
    print "<!-- finding: " sid[i] " -->" > out
    if (sv[i] < 2) print "Severity adopted from the critic: " fmt(seff[i]) " (filed " fmt(sfiled[i]) ")" > out
    print "<!-- fill -->" > out
    print "" > out
  }
  print "## Further findings (" nfurther ")" > out
  for (r = 1; r <= nfurther; r++) {
    i = further[r]
    print fmt(seff[i]) " " dot " " sloc[i] " " dot " " sclass[i] " " dot " " stitle[i] " " dot " " ws "/reports/" sid[i] ".md" > out
  }
  print "" > out
  print "## Coverage notes" > out
  print "- Units not investigated: " joined(jlist) > out
  print "- Hunts with no finding: " joined(nofind) > out
  print "- Hunts with no report: " joined(noreport) > out
  close(out)

  print "summary: units " nu " | hunts " nh " | confirmed " confirmed " | not investigated " jn
  if (nfull == 0) {
    print "NEXT: none"
  } else {
    print "NEXT: fill | findings: " out
    for (e = 1; e <= nfull; e++) {
      i = full[e]
      print "entry: " e " | reports: " ws "/reports/" sid[i] ".md | verdict: " vname[sv[i]] " | observed: " (sobs[i] == "" ? "none" : sobs[i])
    }
  }
}
' "$ws/ledger.md"

exit 0

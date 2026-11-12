# Design lens map signals
Rank a unit higher the more signals it carries. Pairs in different directories with no import between them rank highest; a test paired with its source, or a doc or memory file paired with the code it describes, is expected and does not count. A dependency-cruiser, import-linter, ArchUnit or eslint-plugin-boundaries config names the declared layers; record it under Conventions.

Co-change pairs of the last 12 months, shared commits, coupling degree and pair (shared commits first, at least 3):
```bash
git -c core.quotePath=false log --since='12 months ago' --no-merges --invert-grep -i -E --grep='^(chore|build)(\([^)]*\))?: *(bump|release)|^(bump|release)' --name-only --format=format:@ -- '<scope>' | awk 'function e(){if(n>1&&n<=30)for(i=1;i<n;i++)for(j=i+1;j<=n;j++){k=f[i]" | "f[j];c[k]++;a[k]=f[i];b[k]=f[j]};n=0} /^@$/{e();next} NF{f[++n]=$0;r[$0]++} END{e();for(k in c)if(c[k]>=3)print c[k],int(200*c[k]/(r[a[k]]+r[b[k]]))"%",k}' | sort -nr | head -30
```

Churn times size hotspots, product first, then churn count, then path:
```bash
git -c core.quotePath=false log --since='12 months ago' --no-merges --invert-grep -i -E --grep='^(chore|build)(\([^)]*\))?: *(bump|release)|^(bump|release)' --name-only --format= -- '<scope>' | grep -v '^$' | sort | uniq -c | sort -rn | head -50 | while read -r c f; do [ -f "$f" ] && echo "$((c * $(wc -l < "$f"))) $c $f"; done | sort -rn | head -30
```

Copy-pasted blocks: shared 6-line windows of normalized code per file pair, with the first matching lines:
```bash
git -c core.quotePath=false ls-files -- '<scope>' | grep -E '\.(c|cc|cpp|cs|go|h|java|js|jsx|kt|mjs|php|py|rb|rs|scala|sh|swift|ts|tsx)$' | grep -vE '(^|/)(vendor|node_modules|dist|build|generated|tests?|__tests__|spec)/|[._-](test|spec)\.|\.min\.' | awk '{f=$0;n=0;r=0;while((getline l<f)>0){r++;gsub(/^[ \t]+|[ \t\r]+$/,"",l);if(length(l)<12||l~/^(import|from|#include|using|package|require)[ (]/)continue;w[++n]=l;at[n]=r;if(n<6)continue;k=w[n-5];for(i=n-4;i<=n;i++)k=k SUBSEP w[i];if(k in s){split(s[k],p,SUBSEP);if(p[1]!=f||r-p[2]>6){q=p[1]" | "f;c[q]++;if(!(q in o))o[q]=p[2]" ~ "at[n-5]}}else s[k]=f SUBSEP at[n-5]}close(f)} END{for(q in c)print c[q],q,"(lines",o[q]")"}' | sort -rn | head -20
```

Repeated literals outside tests and import lines, a candidate for knowledge duplication (a literal found in 3 or more places); `git log -S` on a literal shows commits that touched only some copies:
```bash
git -c core.quotePath=false grep -hE "[\"'][A-Za-z0-9_./:-]{12,}[\"']" -- '<scope>' ':(exclude,glob)**/test/**' ':(exclude,glob)**/tests/**' ':(exclude,glob)**/__tests__/**' ':(exclude,glob)**/spec/**' ':(exclude,glob)**/specs/**' ':(exclude,glob)**/e2e/**' ':(exclude,glob)**/cypress/**' ':(exclude,glob)**/test_*' ':!*[._-]test.*' ':!*[._-]spec.*' ':!*[._-]cy.*' ':!*Test.*' ':!*Tests.*' ':!*Spec.*' | grep -vE '^[[:space:]]*(import|from|#include|using)[[:space:]]|require\(' | grep -ohE "[\"'][A-Za-z0-9_./:-]{12,}[\"']" | sort | uniq -c | sort -rn | awk '$1>=3' | head -30
```

Import fan-in across JS, TS, Python, Java, Kotlin, C#, Rust and Go, project modules ranked by dependents (a relative specifier such as `./util` from different directories is a different module; resolve it before ranking):
```bash
git grep -hoE "^[[:space:]]*(from|import|use|using)([[:space:]]+static)?[[:space:]]+[A-Za-z_.][A-Za-z0-9_.:]*|(from|require\(|import)[[:space:]]*['\"][^'\"]+['\"]|^	\"[^\"]+\"$" -- '<scope>' | sed -E "s/^.*[[:space:](]//; s/['\";]//g" | grep -E '[./:]' | grep -v '^node:' | sort | uniq -c | sort -rn | head -20
```

Import fan-out, the files depending on most others:
```bash
git -c core.quotePath=false grep -cE "^[[:space:]]*(from|import|use|using)([[:space:]]+static)?[[:space:]]+[A-Za-z_.][A-Za-z0-9_.:]*|(from|require\(|import)[[:space:]]*['\"][^'\"]+['\"]|^	\"[^\"]+\"$" -- '<scope>' | sort -t: -k2 -rn | head -20
```

Dead export candidates: an exported name that `git grep -lw` finds in one file only, searched over the whole repository because callers live outside a directory scope. These are leads, not findings:
```bash
git grep -hoE '^(export (default )?(async )?(function|class|const|let|interface|type|enum)|def|class|func( \([^)]*\))?) [A-Za-z_][A-Za-z0-9_]*' -- '<scope>' | awk '{print $NF}' | sort -u | head -150 | while read -r n; do [ -z "$(git grep -lw -e "$n" | sed -n 2p)" ] && echo "$n"; done | head -30
```

Mock density per test file; the source a mock-heavy test covers is an untestable-decisions lead:
```bash
git -c core.quotePath=false grep -c -E 'jest[.]mock|vi[.]mock|mock[.]patch|@patch[(]|MagicMock|mocker[.]|Mockito|sinon[.]|toHaveBeenCalled|gomock|[.]On[(]|new Mock<|Substitute[.]For|mockk|every [{]|instance_double|allow[(]|createMock[(]|page[.]route|cy[.]intercept' -- '<scope>' | sort -t: -k2 -nr | head -30
```

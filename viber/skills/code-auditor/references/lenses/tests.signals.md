# Tests lens map signals
Rank a source unit higher the more of these signals it carries: critical code with no test, fixed often while its test rarely changed, a fix that changed no test, tests skipped, hollow, mock-heavy, wasteful or flaky. Compare each source file's churn with its test's churn in the second list, and rank by fixes relative to size (`wc -l`). On the diff scope, rank first a changed source file of `## Changed files` whose test file did not change.

Source files with no test file mentioning their name (a Rust file holding `#[cfg(test)]` counts as tested):
```bash
t='(^|/)(tests?|__tests__|specs?|e2e|cypress)/|[._-](test|spec|cy)[.]|(^|/)test_|(Test|Tests|Spec)[.][A-Za-z]+$'; git -c core.quotePath=false ls-files -- '<scope>' | grep -v -E "$t" | grep -E '\.(js|jsx|ts|tsx|py|go|rs|java|kt|cs|php|swift|rb|sh)$' | while read -r f; do b=$(basename "$f"); b=${b%.*}; { git -c core.quotePath=false grep -l -F -e "$b" | grep -q -E "$t" || grep -q -F '#[cfg(test)]' "$f"; } || echo "$f"; done | head -40
```

Churn of the last 12 months, source and test files together:
```bash
git -c core.quotePath=false log --no-merges --since='12 months ago' --name-only --format= -- '<scope>' | grep -v '^$' | sort | uniq -c | sort -nr | head -60
```

Fix hotspots, source files only:
```bash
git -c core.quotePath=false log --no-merges -i -E --grep='fix|bug|regress|revert' --since='12 months ago' --name-only --format= -- '<scope>' | grep -v '^$' | grep -v -E '(^|/)(tests?|__tests__|specs?|e2e|cypress)/|[._-](test|spec|cy)[.]|(^|/)test_|(Test|Tests|Spec)[.][A-Za-z]+$' | sort | uniq -c | sort -nr | head -30
```

Fixes of the last 12 months whose commit changed no test file, anywhere in the repository; the missing regression test is the lead, the fix's reverted lines its mutant:
```bash
git -c core.quotePath=false log --no-merges --full-diff -i -E --grep='fix|bug|regress' --since='12 months ago' --name-only --format='@%h %s' -- '<scope>' | awk '/^@/{if(h!=""&&!t)print h;h=$0;t=0;next} tolower($0)~/(^|\/)(tests?|__tests__|specs?)\/|[._-](test|spec)[.]|(^|\/)test_/{t=1} END{if(h!=""&&!t)print h}' | head -30
```

Skipped, focused and pending tests:
```bash
git -c core.quotePath=false grep -n -E '(it|test|describe)[.](skip|only|todo)|[^a-z][fx](it|describe|test)[(]|[.](skip|only|todo|fixme)[(]|[{,] *(skip|only|todo): *true|@Disabled|@Ignore|\[Ignore|Skip *=|#\[ignore|pytest[.]mark[.](skip|xfail)|unittest[.]skip|skipTest[(]|markTest(Skipped|Incomplete)|t[.]Skip(Now|f)?[(]' -- '<scope>' | head -40
```

Hollow assertions, unawaited async matchers and error tests any exception passes:
```bash
git -c core.quotePath=false grep -n -E 'expect[(]true[)]|assert[(]true[)]|assert[.]ok[(]true[)]|assertTrue[(]true[)]|assert True|toBeDefined[(][)]|toBeTruthy[(][)]|^[[:space:]]*expect[(].*[)][.](resolves|rejects)|toThrow[(][)]|pytest[.]raises[(]Exception[)]|assertRaises[(]Exception[)]' -- '<scope>' | head -40
```

Mock density per file:
```bash
git -c core.quotePath=false grep -c -E 'jest[.]mock|vi[.]mock|mock[.]patch|@patch[(]|MagicMock|mocker[.]|Mockito|sinon[.]|toHaveBeenCalled|gomock|[.]On[(]|new Mock<|Substitute[.]For|mockk|every [{]|instance_double|allow[(]|createMock[(]|page[.]route|cy[.]intercept' -- '<scope>' | sort -t: -k2 -nr | head -30
```

Flake risk inside test files, the test file decided by its path alone:
```bash
git -c core.quotePath=false grep -n -E 'sleep[(]|setTimeout|waitForTimeout|Thread[.]sleep|Date[.]now|new Date[(][)]|Math[.]random|time[.]time[(]|datetime[.]now|time[.]Now[(]|System[.]currentTimeMillis|LocalDate[.]now|random[.]|rand[.]|process[.]env|os[.]environ|retryTimes|--reruns|@flaky|retries:' -- '<scope>' | grep -E '^[^:]*((^|/)(tests?|__tests__|specs?|e2e|cypress)/|[._-](test|spec|cy)[.][^:/]*:|(^|/)test_[^:/]*:|(Test|Tests|Spec)[.][A-Za-z]+:)' | head -40
```

Test declarations per test file; far more tests than the source has branches is a duplication lead:
```bash
git -c core.quotePath=false grep -c -E '^[[:space:]]*(it|test)[(]|^[[:space:]]*def test_|^func Test|@Test|\[(Fact|Theory|Test|TestMethod)\]|#\[test\]' -- '<scope>' | sort -t: -k2 -nr | head -30
```

Integration test files per directory, told by path alone; a directory rich in them is a misplaced-layer lead:
```bash
git -c core.quotePath=false ls-files -- '<scope>' | grep -E '(^|/)(tests?|__tests__|specs?|e2e|cypress)/|[._-](test|spec|cy)[.]|(^|/)test_|(Test|Tests|Spec)[.][A-Za-z]+$' | grep -i -E '(^|/)(integration|integ)[^/]*/|[._-](integration|integ|it)[._-]|integration(tests?|spec)?[.]|[.]integrationtests/' | sed 's|/[^/]*$||' | sort | uniq -c | sort -nr | head -30
```

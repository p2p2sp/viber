# Tests lens
Audits whether the tests would catch a real regression: code that runs under test but is never checked, assertions that pass whatever the code does, mocks that replace the behaviour under test, untested error paths and boundaries, flaky tests, and tests that are skipped or never run; and whether they cost more than they prove. A defect in the production code belongs to the bugs lens, an exploitable flaw to the security lens and a slow path to a performance lens. A flake rooted in a production race is filed here naming the race, which the bugs lens owns.

## Hunts
### pseudo-tested
Critical code no test reaches, or reaches without checking: emptying a function body, returning the type's default or flipping one condition leaves every test green. A `## History` fix whose commit changed no test is a candidate: the missing test is the finding, never the fixed bug, and the fix's reverted lines are the mutant. The core angle, and a finding only when a mutant survives.

### hollow-assertions
Tests that pass whatever the code does: no assertion, `assert true`, `toBeDefined` or `toBeTruthy` on an always-set value, a snapshot standing in for logic, assertions only on mocks (`toHaveBeenCalled`) instead of outputs or state. An assertion that never runs: inside a `catch`, a callback, an `if` or a loop over a possibly empty list, or an unawaited `expect(...).resolves`, `expect.poll` or Playwright call. An error test any exception satisfies: `toThrow()`, `pytest.raises(Exception)`, several statements inside the `raises` block. An expected value computed by the code under test.

### over-mocking
The code under test mocked away, a double for a module of the code's own (Boundary), or a test asserting only interactions or repeating the implementation's call sequence (State): it breaks on a harmless refactor and survives a real behaviour change. A finding names the rule and the behaviour change that would pass. A double whose shape the real collaborator no longer has, or an assertion reading back the stub's own canned value: swapping in the real collaborator fails the test.

### untested-error-paths
Catch blocks, error returns, validation rejections and off-by-one limits on a critical flow that no test reaches. The reachability probe tells a path no test reaches from one a test reaches without checking it.

### flaky-tests
Async waits, sleeps, the real clock, timezone or locale, randomness, unordered collections, the network; state a test leaves for the next (env vars, globals, fake timers, spies or patches never restored) or parallel workers share (ports, files, database rows); a retry setting masking any of these. A finding needs a reproduced mixed result.

### dead-tests
Tests that never run: `skip`, `only`, `todo`, `xfail`, `@Disabled` or `#[ignore]` hiding a regression, a stray `.only` silently running nothing else; a test the runner never collects: outside the discovery pattern, a name the runner ignores, a duplicate name shadowing an earlier test, an `async` test under a synchronous runner, a JUnit 4 `@Test` on the JUnit 5 platform.

### wasteful-tests
Redundant: two tests failing on exactly the same regressions, or variants of one input outside a parameterised form. Trivial: what Public, Source or Earned rule out. Misplaced: a decision only an integration test asserts, though a unit or component test could reach it; where integration tests, counted by the host's layer marker, exceed about a tenth of a suite, hunt their decisions first.

## Excluded
- Coverage percentage, and anything argued only from it.
- Generated, vendored, migration-snapshot and fixture code.
- A missing test for a trivial getter, setter, DTO or constant.
- Test style, structure, naming, repeated set-up code and readability.
- Arid production code: logging, metrics and tracing, caching and memoization, timeouts and deadlines, capacity hints, feature-flag plumbing.
- Gaps in unreachable, dead or non-critical code.
- A gap already closed by a test at a higher layer, unless filed as misplaced: the mutant is killed there.
- Golden-file tests whose snapshot is the deliberate contract (CLI output).
- A decision no fast test can reach as written: the design lens.

## Verify
Worktree: required

The oracle is a surviving mutant for a coverage or assertion finding, a reproduced failure for a flakiness finding, the dead-test procedure for a dead-test finding and the waste procedure for a `wasteful-tests` finding. Apply each mutant inside the clean checkout, run the test, and restore the line before the next mutant.

Mutation procedure:
1. Run the target test unchanged; it must pass. A failing baseline goes to the flake procedure, or INCONCLUSIVE.
2. Hollow-assertion claim: first break the cited assertion (wrong expected value, or the matcher negated); a still-green test means it never runs or cannot fail, VERIFIED. Reachability probe: replace the cited line with a throw or panic and run again. The test still passes: it never reaches the line, VERIFIED as a coverage gap. It fails: continue.
3. One mutant per line, in this order: extreme mutation (empty body, or the type's default), relational operator flip or boundary move, `&&` and `||` swapped, statement or call deleted, arithmetic change last. For a `## History` fix, the mutant is the fix's reverted hunk.
4. Equivalence check before running: skip arid nodes and equivalent forms (`size() == 0` to `<= 0`, null-check rewrites, cache removal), and write one sentence on the observable behaviour the mutant changes. Not writable: the mutant is equivalent, REFUTED.
5. Run only the affected test, with the single-test command of the run file's `## Conventions`, else the framework's own single-test filter. A mutant that hangs past the test timeout is killed. A mutant that survived the cited test is run once on the whole fast tier; killed there gives REFUTED.

Flake procedure:
1. Run the test 20 times unchanged, with retries off (`--retries=0`, `-p no:rerunfailures`); for Playwright `--repeat-each=20` replaces the loop, and for Go add `-race`. Any mixed result is VERIFIED.
2. Shuffle the order with `node --test --test-random-seed=<S>` (Node 26.1 or newer), `jest --randomize --seed <S>` (Jest 29.2 or newer), `vitest --sequence.shuffle.tests`, `pytest -p randomly --randomly-seed=<S>`, `rspec --order rand:<S>`, `phpunit --order-by=random --random-order-seed=<S>` and `go test -run <NAME> -shuffle=on -count=20` (Go 1.17 or newer).
3. Run it alone and inside the whole suite; a different result is order dependence, VERIFIED.

Dead-test procedure: remove the cited `skip` or `.only` and run the file; a failure is a hidden regression, VERIFIED; a pass is REFUTED unless a mutant the re-enabled test kills survives the rest of the suite. A never-collected claim is VERIFIED when the test is absent from the runner's own listing (`pytest --collect-only -q`, `go test -list .`, `vitest list`, `jest --listTests` for files, `rspec --dry-run`).

Waste procedure:
1. Redundant: run the mutants of mutation step 3 with the cited test removed; every mutant it kills is still killed, VERIFIED; one survives, REFUTED.
2. Trivial: apply a change keeping the observed behaviour (a rename, a reorder); the cited test fails and alone kills no behaviour mutant, VERIFIED; else REFUTED.
3. Misplaced: an integration test asserts the decision; mutate it and run the fast tier alone, never the integration test; the mutant survives, VERIFIED; a unit or component test kills it, REFUTED.

Verdicts:
- VERIFIED: the mutant survives, the throw probe passes, the flake reproduces, the broken assertion stays green, the un-skipped test fails, or the test is missing from the runner's listing.
- PARTIALLY VERIFIED: the gap is real but narrower than claimed: the mutant survives the full suite on fewer lines or branches than cited.
- REFUTED: the cited test kills the mutant, or another test the hunter missed does, or the mutant is equivalent.
- INCONCLUSIVE: the test needs a database, external service, credentials, Docker or a GPU, or runs only in CI; the baseline fails in the worktree; the build exceeds the time budget; no mutant compiles; judging the mutant needs domain knowledge; a flake does not reproduce within 20 runs.

## Severity
Set by how critical the behaviour escaping the tests is, not by the kind of smell. A `wasteful-tests` finding scores by the tests' cost.
- 9-10: a mutant survives or a flake hides in auth, security, money, data loss, migrations or concurrency safety; a stray `.only` or skip disables a critical suite.
- 7-8: a mutant survives in core business logic that would cause user-facing errors; a flaky test gates merges on the main branch.
- 4-6: an untested error path or boundary with limited impact; a skip hides a known regression in non-critical code; a core decision proven only in the integration layer, or redundant integration tests.
- 1-3: a finding with none of the VERIFIED evidence scores at most 3. Redundant or trivial tests in the fast tier.

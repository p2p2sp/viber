# tests

Whether the tests would catch a real regression, and whether they cost more than they prove: code run under test but never checked, assertions that pass whatever the code does, mocks replacing the behaviour under test, untested error paths and boundaries, flaky tests, tests skipped or never run. Elsewhere: a defect in the production code (bugs), an exploitable flaw (security), a slow path (runtime-performance, web-performance), a decision no fast test can reach as written (design). A flake rooted in a production race stays here, naming the race.

## Hunts

- `pseudo-tested`: critical code no test reaches, or reaches without checking: emptying a function body, returning the type's default or flipping one condition leaves every test green. A bug-fix commit (`git log`) that changed no test is a candidate: the missing test is the finding, never the fixed bug, and the fix's reverted lines are the mutant.
- `hollow-assertions`: a test that passes whatever the code does: no assertion, `assert true`, `toBeDefined` or `toBeTruthy` on an always-set value, a snapshot standing in for logic, assertions only on mocks (`toHaveBeenCalled`) instead of outputs or state. An assertion that never runs: inside a `catch`, a callback, an `if` or a loop over a possibly empty list, or an unawaited `expect(...).resolves`, `expect.poll` or Playwright call. An error test any exception satisfies: `toThrow()`, `pytest.raises(Exception)`, several statements inside the `raises` block. An expected value computed by the code under test.
- `over-mocking`: the code under test mocked away; a double standing for another module of the code's own, not for the outside world or a collaborator too slow for a fast test (hashing, key derivation, retry backoff, rendering); a test asserting only a call, a call count or a call order on a collaborator, or repeating the implementation's call sequence, where the call leaves state to observe. Name the behaviour change that would pass. A double whose shape the real collaborator no longer has, or an assertion reading back the stub's own canned value.
- `untested-error-paths`: catch blocks, error returns, validation rejections and off-by-one limits on a critical flow that no test reaches.
- `flaky-tests`: async waits, sleeps, the real clock, timezone or locale, randomness, unordered collections, the network; state a test leaves for the next (env vars, globals, fake timers, spies or patches never restored) or parallel workers share (ports, files, database rows); a retry setting masking any of these.
- `dead-tests`: `skip`, `only`, `todo`, `xfail`, `@Disabled` or `#[ignore]` hiding a regression; a stray `.only` silently running nothing else; a test the runner never collects: outside the discovery pattern, a name the runner ignores, a duplicate name shadowing an earlier test, an `async` test under a synchronous runner, a JUnit 4 `@Test` on the JUnit 5 platform.
- `wasteful-tests`: redundant: two tests failing on exactly the same regressions, or variants of one input outside a parameterised form. Trivial: a test that fails on a refactor keeping the observed behaviour, or catches no bug: it reaches a private member, uses reflection or tests an internal class on its own; it matches the source text of the code under test; it asserts what the compiler, type checker, linter or schema rejects, framework or third-party library behaviour, a value true by construction, the shape of data, a count of fields, members or entries, an export, a registration, a constant, default or name, or the markup a user interface renders. Misplaced: a decision only an integration test asserts, though a unit or component test could reach it; where integration tests exceed about a tenth of a suite, hunt their decisions first.

## Excluded

- Coverage percentage, and anything argued only from it.
- Generated, vendored, migration-snapshot and fixture code.
- A missing test for code holding no decision: a constant, default, name, data shape, export or registration, what the compiler, type checker, linter or schema rejects, or a null, empty or missing input that flips no decision's outcome.
- Test style, structure, naming, repeated set-up code and readability.
- Arid production code: logging, metrics and tracing, caching and memoization, timeouts and deadlines, capacity hints, feature-flag plumbing.
- Gaps in unreachable, dead or non-critical code.
- A gap a test at a higher layer already closes, unless reported as misplaced.
- Golden-file tests whose snapshot is the deliberate contract (CLI output).

## Proof

- `pseudo-tested`, `over-mocking`, `untested-error-paths`: one mutant, a change to one quoted production line (an emptied body, the type's default, a flipped relational operator or moved boundary, `&&` and `||` swapped, a deleted statement or call), the quoted tests it leaves green, and why no assertion sees it.
- Name the observable behaviour the mutant changes. None: the mutant is equivalent, drop the finding.
- `Grep` the whole suite for every test reaching the mutated line. One whose assertion sees the mutant: drop the finding.
- `hollow-assertions`: the assertion quoted, and why it never runs or cannot fail.
- `flaky-tests`: the source of nondeterminism, quoted with its line.
- `dead-tests`: the skip marker, or the runner's collection rule quoted from its config and the reason the test falls outside it.
- `wasteful-tests`: redundant: the second test, quoted, and why both fail on the same regressions. Trivial: a change keeping the observed behaviour that fails the test. Misplaced: the integration test's assertion quoted, and no unit or component test asserting the decision.
- Never claim a test result: no test was run.

## Severity

Set by how critical the behaviour escaping the tests is, not by the kind of smell. A `wasteful-tests` finding scores by the tests' cost.

- 9-10: a mutant survives or a flake hides in auth, security, money, data loss, migrations or concurrency safety; a stray `.only` or skip disables a critical suite.
- 7-8: a mutant survives in core business logic that would cause user-facing errors; a flaky test gates merges on the main branch.
- 4-6: an untested error path or boundary with limited impact; a skip hides a known regression in non-critical code; a core decision proven only in the integration layer, or redundant integration tests.
- 1-3: redundant or trivial tests in the fast tier.

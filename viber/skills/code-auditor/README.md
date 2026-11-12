# code-auditor lenses

`viber:code-auditor` audits one scope (the current diff, one directory or the whole repository) through one lens. This page is for people: no agent loads it. Each lens lives in `references/lenses/<lens>.md`, and the map-signal commands for it in `references/lenses/<lens>.signals.md`. Every finding is verified by an independent agent before it is reported.

The sections below follow the order bugs, security, web-performance, runtime-performance, tests, design. Each names what the lens audits, its angles by slug, how its claims are verified (the oracle and the `Worktree:` value of its lens file) and the classes it hands to another lens. The ownership table at the end lists every hand-off with the angle of the receiving lens that covers it.

## bugs

Audits: correctness. Wrong results, lost failures, crashes and hangs, races and inconsistent state, producers and consumers that disagree, and variants of mistakes already fixed once. A crash, hang or handle, lock, port or process exhaustion that any input triggers stays here, attacker input included.

Angles:
- `wrong-result`: a concrete input that produces a wrong output (off-by-one, units, rounding, equality, time zones, shared state).
- `silent-failure`: a failure that gets lost (empty or broad catch, hiding fallbacks, ignored exit codes and rejections, success reported after a partial failure).
- `crash-hang`: null dereferences, unchecked casts, parsing that throws, endless loops and waits, resources, listeners, timers or subscriptions not released on the error path or on unmount.
- `race-state`: check-then-act, lost updates, missing awaits, non-idempotent retries, half-done multi-step writes, stale caches.
- `contract-mismatch`: a producer and a consumer that each look right alone but disagree on keys, formats, enums, units or persisted data.
- `past-fix-variant`: the root cause of a recent fix, the paths the fix missed and the same mistake elsewhere.

Verified by: an outside expectation (spec, doc, test, other side of a contract or a self-evident symptom), then a failing test, failing command, growing resource count or quoted contract lines run in a clean worktree; a race is forced with a delay or barrier. `Worktree: required`.

Hands off: other exploitable flaws to security; memory growth and missing timeouts to runtime-performance; a slow path to runtime-performance or web-performance; a weak or missing test to tests; structure or duplication without a wrong behaviour to design.

## security

Audits: exploitable flaws. An attacker-controlled input that reaches a sink, a missing or wrong authorization, a credential check an attacker can guess or fail past, a leaked secret, broken cryptography, and untrusted text steering a model or agent that holds tools.

Angles:
- `injection`: SQL, command, `eval`, template, header, XXE and XSS sinks traced back to an attacker-controlled source.
- `access-control`: missing or wrong authorization, CSRF, CORS, mass assignment and business rules the server takes from the client.
- `authentication`: login, OTP, reset, token and signature checks an attacker beats by guessing or by a failure that opens the check.
- `untrusted-data-to-machinery`: path traversal, upload, SSRF, unsafe deserialization and attacker-controlled lengths in native code.
- `secrets-crypto-and-supply-chain`: committed credentials, weak cryptography, secrets in logs, and CI workflows or install scripts that run untrusted input.
- `llm-and-agents`: untrusted text reaching a model with side-effect tools or data, model output reaching a sink, and unsafe agent, hook or CI configs.

Verified by: the claimed security property observably violated by attacker-controlled input at a real trust boundary, shown by a payload run in a clean worktree; a claim that cannot run must pass six cited gates. `Worktree: required`.

Hands off: a wrong result or logic error without an attacker to bugs; a slow path to runtime-performance or web-performance; a weak test to tests; structure without an exploit to design. Denial of service splits by symptom: a crash or hang to bugs, time and memory growth (ReDoS included) to runtime-performance.

## web-performance

Audits: what changes the bytes, their order or their timing in the browser. Initial JavaScript weight, the largest-contentful-paint path, layout stability, hydration and interaction cost, asset weight and delivery headers. Every finding names a route, a byte count or an element, and the metric it affects.

Angles:
- `initial-js-weight`: a heavy dependency reaching the entry chunk of a primary route.
- `lcp-critical-path`: an LCP element the HTML does not reveal early, fetch waterfalls and HTML that could be static but renders per request.
- `layout-stability`: unsized media, late injected content, font swap and animations of layout properties.
- `interaction-hydration`: needless hydration, oversized serialized props, hydration mismatches and costly handlers or re-renders.
- `asset-and-delivery`: eager third-party tags, fonts and images, cache headers and back/forward cache blockers.

Verified by: static evidence plus measurement from the production build in a clean worktree (gzip size per route chunk, module attribution, repository headers); no browser and no dev server. `Worktree: required`.

Hands off: server data-access latency to runtime-performance; a wrong result, or a listener, timer or subscription never removed on unmount, to bugs; an exploitable flaw to security; structure without a measurable cost to design.

## runtime-performance

Audits: code that runs as a process (servers, workers, CLIs, scripts, hooks). Work that grows faster than its input, I/O repeated per item, memory that never comes back, blocked event loops, overload amplifiers and per-invocation cost.

Angles:
- `complexity-cliff`: work growing faster than linear in data size.
- `io-per-item`: queries, fetches or processes inside a loop, serial independent awaits and uncapped retries.
- `unbounded-growth`: caches and queues with no bound, concurrency equal to N and request bodies read whole.
- `blocking-hot-path`: blocking calls on the event loop or request thread, catastrophic regexes, locks held across I/O and calls with no timeout.
- `repeated-setup`: clients, pools, compiled patterns and config rebuilt per call instead of once.
- `query-shape`: queries whose rows or bytes grow with the table, and filter or sort columns with no index.

Verified by: a measured growth curve or a call count from a harness built in a clean worktree; reasoning alone never counts. `Worktree: required`.

Hands off: render, bundle and Core Web Vitals problems to web-performance; a data race or wrong result to bugs; structure without a measured cost to design.

## tests

Audits: whether the tests would catch a real regression. Code that runs under test but is never checked, assertions that pass whatever the code does, mocks that replace the behaviour under test, untested error paths and boundaries, flaky tests, tests that are skipped or never run, and wasteful tests (redundant, trivial or misplaced in a slower layer).

Angles:
- `pseudo-tested`: critical code whose mutant (empty body, flipped condition) leaves every test green.
- `hollow-assertions`: tests that pass whatever the code does, or whose assertion never runs.
- `over-mocking`: the code under test mocked away, or a test that repeats the implementation's call sequence.
- `untested-error-paths`: catch blocks, rejections and limits on a critical flow that no test reaches.
- `flaky-tests`: timing, clock, randomness, order and shared state that give a mixed result.
- `dead-tests`: tests that are skipped, focused with `.only` or never collected by the runner.
- `wasteful-tests`: redundant tests, trivial tests and a decision asserted only by an integration test.

Verified by: a surviving mutant for a coverage or assertion finding, a reproduced mixed result for a flake, the dead-test procedure for a dead test and the waste procedure for a wasteful test, each run in a clean worktree. `Worktree: required`.

Hands off: a defect in the production code to bugs; an exploitable flaw to security; a slow path to runtime-performance or web-performance. A flake rooted in a production race is filed here naming the race, which bugs owns.

## design

Audits: structure that makes change expensive. One piece of knowledge kept in several places, code that must change together but lives apart, abstractions that grew wrong, dependencies pointing the wrong way, dead or drifted code, and breaks of the project's own written rules. Every finding needs a concrete change scenario plus history evidence.

Angles:
- `knowledge-duplication`: one fact written in two or more places that must change together.
- `change-preventers`: shotgun surgery, divergent change, god modules and complex hotspot functions.
- `wrong-abstraction`: helpers with per-caller flags, pass-through modules and invariants that live only in a comment.
- `boundary-coupling`: imports against a declared boundary, import cycles, reaching into internals and shared mutable state.
- `dead-and-drifted`: unreferenced exports, unset flags, unreachable branches and comments that contradict the code.
- `rule-drift`: a written rule in `CLAUDE.md`, rules, an ADR or CONTRIBUTING that the code breaks in several places.

Verified by: gates refuted one by one from the repository and its git history (existence, same knowledge, change scenario, pain evidence, not deliberate, fix economics); nothing is run. `Worktree: none`.

Hands off: a wrong result, crash or lost failure to bugs; an exploitable flaw to security; a slow path to runtime-performance or web-performance; a weak or missing test to tests.

## Ownership table

One row per hand-off clause in the intros and `## Excluded` sections of the six lens files. Both lens columns hold the lens file slug, and the angle is the receiving lens's angle that covers the class.

| Class | From | Owner | Angle |
| --- | --- | --- | --- |
| exploitable flaw | bugs | security | `injection` |
| memory growth | bugs | runtime-performance | `unbounded-growth` |
| missing timeouts | bugs | runtime-performance | `blocking-hot-path` |
| slow server path | bugs | runtime-performance | `complexity-cliff` |
| slow browser path | bugs | web-performance | `interaction-hydration` |
| weak or missing test | bugs | tests | `pseudo-tested` |
| structure or duplication without a wrong behaviour | bugs | design | `knowledge-duplication` |
| wrong result or logic error without an attacker | security | bugs | `wrong-result` |
| slow server path | security | runtime-performance | `complexity-cliff` |
| slow browser path | security | web-performance | `interaction-hydration` |
| weak test | security | tests | `hollow-assertions` |
| structure without an exploit | security | design | `change-preventers` |
| crash or hang from denial of service | security | bugs | `crash-hang` |
| resource leak that crashes or hangs | security | bugs | `crash-hang` |
| time and memory growth | security | runtime-performance | `unbounded-growth` |
| ReDoS | security | runtime-performance | `blocking-hot-path` |
| server data-access latency | web-performance | runtime-performance | `query-shape` |
| wrong result | web-performance | bugs | `wrong-result` |
| listener, timer or subscription never removed on unmount | web-performance | bugs | `crash-hang` |
| exploitable flaw | web-performance | security | `injection` |
| structure without a measurable cost | web-performance | design | `change-preventers` |
| render problem | runtime-performance | web-performance | `interaction-hydration` |
| bundle problem | runtime-performance | web-performance | `initial-js-weight` |
| Core Web Vitals and layout problem | runtime-performance | web-performance | `layout-stability` |
| data race | runtime-performance | bugs | `race-state` |
| wrong result | runtime-performance | bugs | `wrong-result` |
| structure without a measured cost | runtime-performance | design | `change-preventers` |
| defect in the production code | tests | bugs | `wrong-result` |
| exploitable flaw | tests | security | `injection` |
| slow server path | tests | runtime-performance | `complexity-cliff` |
| slow browser path | tests | web-performance | `interaction-hydration` |
| flake rooted in a production race | tests | bugs | `race-state` |
| wrong result | design | bugs | `wrong-result` |
| crash | design | bugs | `crash-hang` |
| lost failure | design | bugs | `silent-failure` |
| exploitable flaw | design | security | `injection` |
| slow server path | design | runtime-performance | `complexity-cliff` |
| slow browser path | design | web-performance | `interaction-hydration` |
| weak or missing test | design | tests | `pseudo-tested` |

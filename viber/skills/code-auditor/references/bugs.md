# bugs

Correctness: wrong results, lost failures, crashes, hangs, races, producer and consumer mismatches, variants of a mistake already fixed once. A crash, a hang or an exhaustion of handles, locks, ports or processes any input triggers stays here, attacker input included. Elsewhere: any other exploitable flaw (security), memory growth or a missing timeout (runtime-performance), a slow path (runtime-performance, web-performance), a weak or missing test (tests), structure with no wrong behaviour (design).

## Hunts

- `wrong-result`: off-by-one, inverted or short-circuited condition, wrong operator or precedence, integer overflow, float rounding on money, mixed unit or scale (ms and s, cents and units), reference versus value equality, NaN, sort without a comparator, empty input, unicode and encoding, timezone, DST and calendar, closure over a loop variable or stale state, aliased state, mutable default, shallow copy.
- `silent-failure`: empty, log-only or TODO catch; a catch broad enough to turn a recoverable error into an abort or the wrong branch; a `finally` that returns over the error; a fallback or default hiding a failure; an ignored return code, exit status or promise rejection; success reported after a partial failure (exit 0, HTTP 2xx, `ok: true`); a `?.` or `|| default` chain skipping required work; missing `set -e` or `pipefail` in a script. Report the failure that gets lost, never the pattern alone.
- `crash-hang`: null or undefined dereference; unchecked indexing, cast, type assertion, `unwrap` or `!`; parsing that throws on a real input; division by zero; recursion or a loop that never ends; a wait or lock that never returns; a `default` branch assumed unreachable that a real input reaches; a handle, process, temp directory, lock, listener, timer or subscription not released on the error path or on unmount.
- `race-state`: check-then-act on files, rows or state; a read-modify-write losing an update; an order that holds only by timing (a use before an async init completes); a missing `await`, or a promise, task or goroutine never awaited, stored or joined; a lock held across `await` or taken in inconsistent order; a retry or redelivery repeating a non-idempotent side effect; a multi-step write an error or kill leaves half done; a cache or derived copy not invalidated when its source changes; a state transition allowed from the wrong state.
- `contract-mismatch`: a producer and a consumer each correct alone but disagreeing: a config key written versus read, JSON field names or nesting, a route versus its caller, a file format or delimiter, enum values, the meaning of an exit code, an env var name, a path relative to a different working directory; data an earlier version persisted read by the current one (a migration versus its model); units or time zone across the boundary; a library call used against its documented semantics (a dropped result of a non-mutating call, a `replace` changing only the first match, swapped arguments).
- `past-fix-variant`: for each recent bug-fix commit (`git log`), find the root cause, check the fix covers every path reaching it, then search for the same mistake elsewhere. Widen one element at a time; stop once more than half the matches are noise.

## Excluded

- Style, naming, formatting, missing comments or docs, general quality or refactor advice ("could be cleaner"), anything a linter, type checker or compiler in the repository already reports.
- An issue with no concrete triggering input, or needing a precondition the code rules out: validated upstream, enforced by a type the runtime checks, an unreachable caller.
- A race with no shared state. Files, database rows and external services are shared state.
- A violation silenced on purpose: a suppression comment, or a reason documented in a `CLAUDE.md`.
- Missing input validation on a trusted, internal-only input. A config file, CLI argument or environment variable a user edits is not internal.
- An empty catch whose skipped work is optional and documented as best-effort.

## Proof

- A concrete input and the wrong output, crash or hang it produces.
- Every caller traced: quote the lines showing no guard stops that input. A cast or an unvalidated parse is no guard.
- The expected behaviour, from a source outside the audited code: a spec, doc or docstring, a test, the other side of a contract, or a self-evident symptom (crash, hang, data loss, an error escaping). Name, docs, tests and callers all agreeing with the current behaviour: drop the finding.
- `contract-mismatch`: both sides quoted, plus one input showing the disagreement.
- `race-state`: the shared state named, and the interleaving that breaks it.

## Severity

- 9-10: data loss or corruption on any reachable path, or a silently wrong result on a main path.
- 7-8: a crash, hang or wrong result on a common reachable path, or a contract mismatch breaking a feature end to end.
- 4-6: wrong behaviour only on edge-case input, a leak only under sustained use, a mishandled error with a visible but recoverable symptom.
- 1-3: lost error context or diagnostics only, or a wrong value only in output nobody consumes (a log line, a debug view).

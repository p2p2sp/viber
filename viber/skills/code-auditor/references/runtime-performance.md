# runtime-performance

Code that runs as a process (servers, workers, CLIs, scripts, hooks): work growing faster than its input, I/O repeated per item, memory that never comes back, blocked event loops, overload amplifiers, per-invocation cost. Elsewhere: a render, bundle or Core Web Vitals problem (web-performance), a data race or wrong result (bugs), structure with no runtime cost (design).

## Hunts

- `complexity-cliff`: work growing faster than linear in data size: a list `includes`, `indexOf`, `in`, `find` or `sort`, string `+=` or `[...acc, x]` inside a loop over a growing collection.
- `io-per-item`: a DB query, HTTP fetch, file read, `exec`, `spawn` or `$(git ...)` inside a loop, a resolver or a per-record callback: ORM lazy loading, a shell loop starting one process per file, a write per row where a bulk call exists, independent awaits run in series in an API handler or job (loaders and server components are web-performance). Calls multiplied per failure: a retry with no cap, no backoff or no jitter, or retries at more than one layer.
- `unbounded-growth`, only in a long-running process: module-level maps or caches with no eviction, `lru_cache(maxsize=None)`, queues with no backpressure, listeners, intervals, goroutines or tasks never released, buffers holding a whole stream. Concurrency equal to N: `Promise.all(xs.map(...))`, `asyncio.gather` over an input list, a goroutine or task per item with no semaphore or pool. A request body, upload, archive or decompressed stream read whole with no size cap.
- `blocking-hot-path`: `*Sync` calls, `time.sleep`, a blocking client or a sync DB driver inside `async def` or an async handler; `.Result` or `.Wait()` on a request thread; CPU-heavy work on the event loop (hashing, compression, a large sort or `JSON.parse`); a regex that backtracks catastrophically on untrusted input; a lock, transaction or pooled connection held across I/O; an outbound HTTP, DB or RPC call on a request path with no timeout or deadline (`requests` without `timeout=`, Go `http.DefaultClient`, `fetch` with no `signal`).
- `repeated-setup`: setup redone per call that could run once: a client, pool or connection built per request or job (`new PrismaClient()`, `new HttpClient()`, `requests.get` with no `Session`, `sql.Open`); a regex, schema, template or serializer compiled per call or iteration (`new RegExp`, `re.compile`, `Pattern.compile`, `ajv.compile`); heavy imports or config parsed again on every run of a frequent CLI or hook.
- `query-shape`: a query whose rows or bytes grow with the table, not the answer: a list query with no limit, whole rows fetched for one field, rows loaded to count, filter, sort or page in code (`len(qs)`, `.all()` then filter, `ToList()` then `Where`), OFFSET paging a growing table, eager loads that multiply rows. A filter, join or sort column with no index in the migrations, or one wrapped in a function or a leading-wildcard `LIKE`. Django `ForeignKey`, Rails `references` and MySQL foreign keys index themselves.

## Excluded

- Micro-optimizations: a constant-factor gain under 2x, "use a faster library", "add a cache".
- Cold paths: one-shot migrations, setup, test code, dev tooling (unless the tooling is the product).
- N bounded by the code or a cited limit: a page cap, a config maximum, a schema constraint.
- A finding with no stated input dimension, no estimate of how often the path runs, or only "could be slow".
- Cost-based query-plan claims (planner choice, selectivity) that need real optimizer statistics.
- Browser-side findings: render, bundle size, Core Web Vitals, layout (web-performance).
- Data races (bugs); a backtracking regex only on trusted or length-capped input.
- Calls the framework provably batches: Prisma `findUnique` issued concurrently in one tick, a DataLoader. Never a sequential `await` loop.

## Proof

- The input dimension N, and the quoted lines showing nothing bounds it.
- How often the path runs, and every caller, quoted.
- The growth (calls per item, order of complexity), derived from the quoted loop.
- Never claim a measured time, call count or memory size.

## Severity

- 9-10: a hot per-request or per-item path with superlinear or unbounded growth reachable at realistic N, ending in timeout, OOM or outage.
- 7-8: a hot path with N+1 or I/O per item, or more than 10x slower at realistic N; a dependency call with no timeout, retries that multiply load, or concurrency equal to N; a client built per request on a server; a leak in a long-running worker under normal load.
- 4-6: a warm path (per job, batch or CLI run) with a derived 2-10x cost; setup repeated on a frequent CLI or hook; one process per file in a script over a large repository.
- 1-3: proven but cold, small N in practice, or a small constant factor.

Adjust 1 up when untrusted input controls N, 2 down when N needs unusual input. Cap at 6 when N or the frequency is not shown realistic.

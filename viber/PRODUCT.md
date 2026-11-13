# Product assumptions

- The `viber` is a coding assistant that gives the agent greater freedom when performing tasks, enabling the highest quality and speed of work.

- The `viber` plugin must work correctly on projects of every kind. Where the tasks are not programming tasks, or the code is not testable, the plan and the implementation process have to account for that.

- The plan proves a task's behaviour across four named layers: `unit`, `component`, `integration`, `e2e`.

- A coder proves a decision correct without requiring the outside world (a database, the network, the file system, the clock, randomness, a subprocess): a `unit` test covers the behaviour of one entity through its public API; a `component` test calls several entities assembled into a component through its public entry (a facade, a handler, a use case), domain objects real, every output port replaced by its in-memory fake holding its own state.

- An `integration` test covers exactly one adapter against its real dependency, started disposably for the test run; it is never the base proof that a function works, and it never stands in for a `unit` or `component` test.

- An adapter's `integration` test lives in the task that creates or changes that adapter, not in a task of its own, and is never run there: the task's verification lists or type-checks it, and the build's final test run runs it once.

- A domain rule, a value object or an algorithm is proven by a `unit` test; a use case's decisions and error paths are proven by a `component` test on fakes, and a decision gets a function and a unit test of its own only when it is complex enough to be an entity with its own contract. An `integration` test proves only what the real dependency reveals.

- Every external dependency is reached through a port in the domain's language, with one authoritative in-memory fake and a contract test written against the port alone, which the fake passes as a unit test and the adapter passes as its integration test.

- A test goes through the public contract alone, as a real caller does: no private member, no reflection, no method added for a test. A double stands only for the outside world, never for another module of the code's own.

- A build writes one test per regression, and none for a name or a data shape: two tests failing on exactly the same regressions are one test too many, whatever their layer.

- Unit and component tests must outnumber integration tests by a wide margin.

- The build's final test run runs once and only once: the host's fast command plus the integration tests of the change. The whole integration layer and the end-to-end layer belong to continuous integration. Tests overlapping each other are costly.

- Every test a build writes or edits carries its layer's marker in the host's layer marker convention, so a layer is selected by the test tool's own filter.

- Integration tests should use disposable test containers wherever possible.

- End-to-end tests belong to CI and `/viber:e2e`. A plan carries a task that writes them only when the user explicitly asks for them, in the request, the interview or its issue - never on the planner's or the interview's own initiative - and that task runs them only when the user separately asked for it to be run.

- `implementor` is entered from an approved plan that `planner` names as the next step. Its description deliberately carries no resume or continue trigger, although step 1 resumes the most recent run once it runs: a request to continue a build in a new session may not reach it.

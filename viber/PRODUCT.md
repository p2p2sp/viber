# Product assumptions

- The `viber` is a coding assistant that gives the agent greater freedom when performing tasks, enabling the highest quality and speed of work.

- The `viber` plugin must work correctly on projects of every kind. Where the tasks are not programming tasks, or the code is not testable, the plan and the implementation process have to account for that.

- The plan proves a task's behaviour across four named layers: `unit`, `component`, `integration`, `e2e`.

- A coder proves a decision correct without requiring a real external dependency such as a database: a `unit` test isolates one unit or a few collaborating units with only their input and output boundaries substituted; a `component` test runs the whole application in the test process from its entry point, internal layers real, external adapters replaced by in-memory fakes holding their own state.

- An `integration` test covers exactly one adapter against its real dependency, started disposably for the test run; it is never the base proof that a function works, and it never stands in for a `unit` or `component` test.

- An adapter's `integration` test lives in the task that creates or changes that adapter, not in a task of its own, and is never run there: the task's verification lists or type-checks it, and the build's final test run runs it once.

- Every decision in the code is proven by a unit test, and a decision is shaped as a function over plain values, so a double is allowed only at a boundary. A `component` test proves only what the assembled application shows; an `integration` test proves only what the real dependency reveals.

- A build writes one test per regression, and none for a name or a data shape: two tests failing on exactly the same regressions are one test too many, whatever their layer.

- Unit and component tests must outnumber integration tests by a wide margin.

- The build's final test run runs once and only once: the host's fast command plus the integration tests of the change. The whole integration layer and the end-to-end layer belong to continuous integration. Tests overlapping each other are costly.

- Every test a build writes or edits carries its layer's marker in the host's layer marker convention, so a layer is selected by the test tool's own filter.

- Integration tests should use disposable test containers wherever possible.

- End-to-end tests belong to CI and `/viber:e2e`. A plan carries a task that writes them only when the user explicitly asks for them, in the request, the interview or its issue - never on the planner's or the interview's own initiative - and that task runs them only when the user separately asked for it to be run.

- `implementor` is entered from an approved plan that `planner` names as the next step. Its description deliberately carries no resume or continue trigger, although step 1 resumes the most recent run once it runs: a request to continue a build in a new session may not reach it.

# Integration tests

What an integration test runs against and how the layer stays fast. A rule ending in `(blocking)` is a blocking finding for a reviewer.

## What it runs against

- An integration test covers one adapter - the code that talks to one external dependency - against that real dependency, started disposable for the run, never against an in-process substitute; an entry point that calls data access directly counts as the adapter for that data access alone, never for a decision inside it. (blocking)
- Real only at the boundary under test. Every other collaborator the path drags in is substituted by its cheapest honest stand-in. An integration test pays for the wiring it asserts and nothing else. (blocking)
- An integration test proves only what the real dependency alone reveals (a query's result, a mapping, a constraint, a transaction), and the done clause it proves names that. One asserting a decision, or a case a unit or component test proves or could prove, is a finding, and so is a second test of a behaviour another integration test covers: one test per adapter behaviour. (blocking)
- An adapter passes the contract test of its port, written against the port alone and shared with its fake, as an integration test; an adapter a task creates or changes with no integration test is a finding. (blocking)

## Time matters

- An integration test is written in the task that creates or changes its adapter and never run there, a `Repro:` test excepted: the task's `Verification` lists or type-checks it, the build's final test run runs it once, and the whole layer belongs to continuous integration.
- The layer's wall-clock is a design constraint: a slow layer is a missing strategy, never the price of real dependencies.
- Start each dependency once per run, on a random port, and apply its schema once, then reuse it across every test it fits; never restart it between tests. (blocking)
- Reset state between tests by the cheapest honest means - a rolled-back transaction, a truncate, a namespace of its own per test - so reuse costs no test its independence: each run's own disposable instance keeps the sharing safe.
- Wait for a dependency on its readiness signal, never on a fixed delay.
- Run the tests in parallel wherever the reset keeps them independent.

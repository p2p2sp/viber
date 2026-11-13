# Test strategy

How a test is written. Where two rules pull against each other, catching a real regression and surviving a refactor win over speed and convenience. A rule ending in `(blocking)` is a blocking finding for a reviewer. The integration layer has its own rules in `integration-tests.md`.

## Layers

- Outside: the outside world is whatever leaves the test process or is not deterministic: a database (a containerised one too), the network, the file system, the system clock, randomness, a sleep or background thread, the environment, a subprocess.
- Unit: the behaviour of one entity (a class, function, aggregate or value object, with its own helper types) through its public API. Never the outside world.
- Component: several entities assembled into a component and called through its public entry (a module's facade, a command or query handler, a use case), domain objects real, every output port replaced by its fake. Never the outside world, never an in-memory database dialect or an object-relational mapper's in-memory provider. The whole application run in the test process from its own entry point with those fakes is a component test too, kept to a few per entry point: routing, input validation, error mapping, serialisation.
- Integration: one adapter against its real dependency, under integration-tests.md.
- E2E: the deployed application driven from outside, written and run only on the user's own request.
- Proof: a domain rule, a value object or an algorithm is proven by a unit test; a use case's decisions and error paths by a component test on fakes; only what the real dependency alone reveals by an integration test, written once a unit or component test covers the logic using that adapter. A decision gets a function and a unit test of its own only when it is complex enough to be an entity with its own contract. Unit and component tests far outnumber integration tests. A reproduction test on a `Repro:` line is exempt: where the diverging code has no port, it may reach the real dependency. (blocking)

## Proves

- A test exists only for an important path or a decision in the logic: name the regression in behaviour a caller observes that it would catch; no answer means no test. Never tested: accessors, trivial constructors, data holders without behaviour, 1:1 mappings, framework behaviour, third-party library internals, an assertion true by construction, a name, the presence of a field, the shape of data. A test that fails on a refactor keeping the observed behaviour is a finding. (blocking)
- Assert on what a caller observes: the returned value, the public state, the side effect through its own surface, the raised error. Never on log output, and never on data the test did not arrange itself. (blocking)
- A test never reads the source of the code under test as text to assert its shape: no regular expression, substring or line match over a source file. The one exception is a file the host declares as its product (a document, a configuration, a prompt), whose text is the behaviour. (blocking)

## Ports

- Ported: an external dependency is reached through a port in the domain's language, with one authoritative fake in the shared test fixtures (in memory, holding its own state, test-only controls allowed) and a contract test written against the port alone, which the fake passes as a unit test and the adapter passes as its integration test. A new dependency gets all three. Code reaching a dependency with no port gets them at the seam the task touches, for the operations the task uses only. Behaviour a fake cannot hold in memory belongs to the adapter's integration tests. (blocking)

## Writing

- Never introduce a test framework the project does not have.
- An end-to-end test - a browser, or the running application driven from outside - is written only by a task whose acceptance criterion states that the user asked for one in their own words, and run only by a task whose acceptance criterion states that the user asked for it to be run. A coder updates, without the user's request, an existing end-to-end spec its task lists in `Files`, and a reviewer raises no finding for it. (blocking)
- Every test written or edited carries its layer's marker in the host's declared layer marker convention, or in the one the plan's harness task designed. (blocking)
- One regression, one test: two tests failing on exactly the same regressions are one test too many, whatever their layer, and variants of one input belong in the framework's parameterised form, one row each. A test whose deletion leaves every regression still caught is a duplicate. (blocking)
- Every test can fail on a regression, asserts something and carries one act: several actions in one body means several tests. (blocking)
- Isolation: no sleep, no fixture or other mutable state shared across tests, no dependence on execution order, no fixed port or other machine-wide resource, no database shared with another task's run. Several coders verify in the same tree at once. (blocking)
- A unit test may keep its real collaborators; only the input and output boundaries are substituted. Never pay for a collaborator the scenario does not assert: one whose work is slow or heavy - hashing, key derivation, retry backoff, waits, rendering, a large computation - gets a stub or fake returning what the scenario needs, or a cheap configuration of the real one where it offers one: a login test stubs the password hasher. Only that collaborator's own tests use the real thing. (blocking)
- No control flow in a test body - no branch, no loop, no switch. Cases belong in the framework's parameterised form, one row each. (blocking)
- Construct whatever can be constructed. A double for a value, a record or a single config lookup hides the real shape. A test needing a double to reach a decision points at the code's shape: extract the decision into a function over plain values and test that, before adding the double.

Three shapes raise none of the blocking findings except the end-to-end rule: an end-to-end scenario whose steps model one user flow, a snapshot assertion, and a loop inside a property-based generator - control flow in the property body still counts. A test taking one of these carries a comment naming which; an undocumented one is a finding.

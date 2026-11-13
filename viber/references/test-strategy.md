# Test strategy

Where two rules pull against each other, catching a real regression and surviving a refactor win over speed and convenience. A rule ending in `(blocking)` is a blocking finding for a reviewer. The integration layer has its own rules in `integration-tests.md`.

## Layers

- Outside: the outside world is whatever leaves the test process or is not deterministic: a database (a containerised one too), the network, the file system, the system clock, randomness, a sleep or background thread, the environment, a subprocess.
- Unit: the behaviour of one entity (a class, function, aggregate or value object, with its own helper types) through its public API. Never the outside world.
- Component: several entities assembled into a component and called through its public entry (a module's facade, a command or query handler, a use case), domain objects real, every output port replaced by its fake. Never the outside world, never an in-memory database dialect or an object-relational mapper's in-memory provider. The whole application run in the test process from its own entry point with those fakes is a component test too, kept to a few per entry point: routing, input validation, error mapping, serialisation.
- Integration: one adapter against its real dependency, under integration-tests.md.
- E2E: the deployed application driven from outside, written and run only on the user's own request.
- Proof: a domain rule, a value object or an algorithm is proven by a unit test; a use case's decisions and error paths by a component test on fakes; only what the real dependency alone reveals by an integration test, written once a unit or component test covers the logic using that adapter. A decision gets a function and a unit test of its own only when it is complex enough to be an entity with its own contract. Unit and component tests far outnumber integration tests. A reproduction test on a `Repro:` line is exempt: where the diverging code has no port, it may reach the real dependency. (blocking)

## Proves

- Public: a test goes through the public contract alone, as a real caller does: no private member, no reflection, no visibility widened and no method added for a test, no test of an internal class on its own. (blocking)
- State: Assert on what a caller observes: the returned value, the public state, the state a fake holds, a published event, the raised error. Never a call, a call count or a call order on a collaborator, unless the call is the behaviour and leaves no state to observe. Never on log output, and never on data the test did not arrange itself. (blocking)
- Source: A test never reads the source of the code under test as text to assert its shape: no regular expression, substring or line match over a source file. The one exception is a file the host declares as its product, whose text is the behaviour. (blocking)
- Earned: A test exists only for an important path or a decision in the logic: name the regression in behaviour a caller observes that it would catch; no answer means no test. Never tested: accessors, trivial constructors, data holders without behaviour, 1:1 mappings, framework behaviour, third-party library internals, an assertion true by construction, a name, the presence of a field, the shape of data, a count of fields, members or entries, a type's visibility or modifiers, an export, a registration. A test that fails on a refactor keeping the observed behaviour is a finding. (blocking)
- Architecture: one test per rule over the whole codebase (the direction of dependencies between modules, the fast tests staying off the outside world) is allowed; a test of one type's structure is never that.

## Ports

- Ported: an external dependency is reached through a port in the domain's language, with one authoritative fake in the shared test fixtures (in memory, holding its own state, test-only controls allowed) and a contract test written against the port alone, which the fake passes as a unit test and the adapter passes as its integration test. A new dependency gets all three. Code reaching a dependency with no port gets them at the seam the task touches, for the operations the task uses only. Behaviour a fake cannot hold in memory belongs to the adapter's integration tests. (blocking)

## Writing

- Framework: Never introduce a test framework the project does not have.
- Requested: An end-to-end test - a browser, or the running application driven from outside - is written only by a task whose acceptance criterion states that the user asked for one in their own words, and run only by a task whose acceptance criterion states that the user asked for it to be run. A coder updates, without the user's request, an existing end-to-end spec its task lists in `Files`, and a reviewer raises no finding for it. (blocking)
- Marked: Every test written or edited carries its layer's marker in the host's declared layer marker convention, or in the one the plan's harness task designed. A test the task leaves otherwise unchanged keeps the marker it has. (blocking)
- Single: One regression, one test: two tests failing on exactly the same regressions are one test too many, and variants of one input belong in the framework's parameterised form, one row each. A test whose deletion leaves every regression still caught is a duplicate. (blocking)
- Act: Every test can fail on a regression, asserts something and carries one act: several actions in one body means several tests. (blocking)
- Isolated: no sleep, no fixture or other mutable state shared across tests, no dependence on execution order, no fixed port or other machine-wide resource, no database shared with another task's run. The clock, randomness and identifiers are injected. (blocking)
- Boundary: A double stands only for the outside world, or for a collaborator too slow for a fast test (hashing, key derivation, retry backoff, rendering), never for another module of the code's own. Order of choice: the real implementation, a fake, a stub, a mock. A type the project does not own is never mocked: it is wrapped in a port and the port is faked. (blocking)
- Flat: No control flow in a test body - no branch, no loop, no switch. Cases go in the parameterised form. (blocking)
- Literal: An expected value is written as a literal, never computed by the algorithm under test. (blocking)
- Built: Construct whatever can be constructed. A double for a value, a record or a config lookup hides the real shape.

Three shapes raise none of the blocking findings except the end-to-end rule: an end-to-end scenario whose steps model one user flow, a snapshot assertion, and a loop inside a property-based generator - control flow in the property body still counts. A test taking one of these carries a comment naming which; an undocumented one is a finding.

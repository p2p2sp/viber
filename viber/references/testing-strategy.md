# Testing strategy

Which tests a change earns and at which layer. Unit tests carry the logic; each layer above only fills what the layers below cannot show.

## Layers

- Outside world: whatever leaves the test process or is not deterministic: a database, the network, the file system, the clock, randomness, a subprocess. Foreign: the part of it this repository does not control, such as a third-party API.
- Unit: one function or class through its public interface, never the outside world. The base and the most numerous: every decision in the logic is proven here.
- Composite: several units assembled and called through their public entry, in memory, every reach to the outside world replaced by a mock. Only for what no unit test shows: the wiring, the flow across units, error mapping.
- Integration: the code against the real dependencies this repository controls. Slow, so the fewest. Before writing or editing one, read `integration-tests.md` beside this file.
- End-to-end: never write one.

## Layer choice

- Seams you were given fix where a test lives. Otherwise pick the lowest layer that shows the behaviour.
- Never repeat at a higher layer a case a lower layer proves or could prove.

## Earned

- Write a test only for a decision in the logic: a branch, a validation, a derivation, a side effect. Name the bug it would catch: none means no test.
- An edge case earns a test only where it flips a decision's outcome.
- A bug fix earns one test that fails without the fix.
- Never test what the compiler, type checker or linter rejects, framework or library behaviour, a constant, a default, a name, the shape of data, or what a user interface renders.
- One regression, one test: variants of one input go in the framework's parameterised form.

## Tests worth keeping

- Assert behaviour a caller cares about, through the public interface, and name the test for what the system does, not how.
- A test must survive a refactor that keeps the behaviour: never test a private method, never assert on call counts or call order, never verify through a side channel (a direct database query) what the interface can show.
- Take every expected value from an independent source: a known literal, a worked example, the spec. Never recompute it the way the code does: such a test passes by construction.

## Mocks

- Mock the outside world.
- Mock code the project owns only where all three hold: it is a dependency of the tested path, not the behaviour under test; running it for real slows the test; the test does not prove it correct. Example: a password hasher in a registration test.
- Run every other piece of owned code for real, and prove the mocked component in its own tests, unmocked.
- At a boundary, pass the external dependency in instead of creating it inside, and give each external operation its own function: one mock then returns one shape.

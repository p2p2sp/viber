# Integration tests

Slow by nature: write only the fewest that fill what unit and composite tests cannot show.

- Write one only for what the real dependency alone reveals: a query's result, a mapping, a constraint, a transaction, the wiring. Never for a decision in the logic: that is proven by a unit test first.
- A case a unit or composite test proves or could prove gets no integration test.
- Run against the real dependencies this repository controls. Mock every foreign one.
- One test covers many cases: assert every outcome of one act together, and chain acts that depend on each other into one scenario. Never one test per small case.
- Extend an existing integration test that already makes the arrangement before writing a new one.

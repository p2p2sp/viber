# TDD

Build the behaviour test-first, in a red -> green loop, at the seams you were given.

## Loop

- One slice per cycle: one behaviour, one failing test, the least code that passes it. Shape the next slice by what the last one taught.
- Red before green: run the new test and see it fail on an assertion about the missing behaviour before you write the code. A typo, import or harness failure is not red: fix it and rerun.
- Green comes from the code: never weaken, skip or delete a test to make it pass.
- Never write the tests in bulk and the code after: bulk tests check imagined behaviour and lock the structure before you understand the implementation.
- Write no code for a test that does not exist yet, and refactor nothing inside the loop.

## Seams

- A seam is the public boundary where behaviour is observed without reaching inside. Tests live at seams, never against internals.
- Test only at the seams you were given. A behaviour none of them reaches gets no test: name it in your return.

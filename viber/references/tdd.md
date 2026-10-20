# Test-Driven Development

## Iron law

New behavior gets no production code before a failing test for it exists and has been watched to fail. `TDD: required` on the task is the authorization, decided before this file is read: nothing reopens it here. Production code this cycle wrote before its failing test is deleted, then rewritten from that test. A test never watched failing on an assertion backs no `DoD` clause.

On `resume`, `reason` or `report` input, the code already in the tree is existing work, not a violation: keep it. For each of its behaviors that no existing test covers, write that test, see it fail on an assertion once by temporarily reverting the behavior it covers, never the test, confirm the failure names the gap, then restore that code so the test passes. Leave every test already in the tree as it is. A behavior new to this cycle still goes through red before green.

## Red-Green-Refactor cycle

### Red - write one failing test
One behavior, one test, named after the behavior ("user can checkout with valid cart", never "constructor returns instance"). Public interface only.

### Verify red - watch it fail
Run it. A run counts as red only when the test fails on an assertion about the missing behavior, never on a typo, import miss or harness error. A compile, import or missing-symbol failure gets a signature-only skeleton with no logic, then a rerun, until the test fails on an assertion. Passes immediately? Sharpen the assertion and restart red. The first run, before any production edit, goes to `<out>/red.log`.

### Green - simplest code that passes
Only enough to pass this test. No anticipating future tests, no opportunistic refactor of surrounding code.

### Verify green - the cycle's own file, pristine
The target test and every test already in that file pass. No new warnings, no stray prints, no flaky failures hidden behind a retry. A red here is fixed in the code, never by weakening, skipping or deleting a test.

### Refactor - only on green, only for real duplication
Only code this task wrote. Never refactor while red; the file stays green through it.

## Anti-patterns

- Horizontal slicing - all tests first, then all implementation. Work vertical: one test, one implementation, repeat.
- Mocking internal collaborators - couples a test to implementation so it breaks on a refactor that changed no behavior.
- Testing implementation details - private methods, call counts, call order.

## Workflow

Decide the public interface before coding. The behaviors are the plan task's numbered `DoD` clauses, one failing test each, worked in their numbered order: never start a clause before the one above it is green. Where the task leaves a choice open, take it; where it leaves the behavior under test unnameable, stop and report the task failed with that reason.

- Blocking [task] tests/viber/plan-index.test.ts:4298 - test-strategy `Flat`: the "run-lessons is absent with ..." test body branches (`if (content !== null) write(...)`), so the test (DoD.4, absent case) carries control flow
  Split the two rows into two separate tests, one with no lessons file and one writing `started: 100\n\n` to `.temp/viber/lessons`, each with no branch in its body

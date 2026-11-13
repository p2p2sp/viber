# Failures

- task | review-T1-1 | tests/viber/test-pyramid-prose.unit.test.ts:161 - the new `KEPT_ROWS` rows "the Never tested rule" (Proves) and "the one regression rule" (Writing) assert the same full bullet text as the existing tests at lines 161 and 166, plus the section placement, so deleting either older test leaves every regression still caught: two duplicates, against the `One regression, one test` rule of test-strategy.md (blocking). The edit to the line 166 test removed its adjacency assertion, which is what made it a duplicate.

# Failures

- plan | review-T10-1 | tests/viber/verdict-nudge.test.ts:219 - test-strategy `Single`: the new `markedEndings` row "bold markers around the whole line" (`work done\n**VERDICT: PASS**`) duplicates the existing row at line 205 ("a listed value after an unlisted one", ending on `**VERDICT: DENIED**`). Both feed a whole-line-bold listed value to the same agent file and expect a pass, so they fail on exactly the same regressions in reading that form. Deleting the new row leaves every regression still caught. The red log agrees: this row already passed before the change.

## Blocking

None.

## Minor

1. viber/scripts/commit-task.sh:50-52 - the header contract for the extras files says lines are cleaned by "a carriage return and a leading "./" stripped". T10 and T11 made the reader (`extras_paths()`, line 799) also fold backslashes to "/" and trim surrounding whitespace, and the comment at line 1377 already says so. Proof: `extras_paths()` at line 799-808 and the T10/T11 tests in tests/viber/commit-task.test.ts. Fix: reword the header line to "a carriage return, surrounding whitespace and a leading "./" cut, backslashes read as "/"".
2. viber/scripts/commit-task.sh:50-56 - the extras paragraph is one run-on sentence: the added clause "a path that an extras file of ANOTHER task lists ... for a --with path as well" splits "same ownership rules ... taken once -" from "and stages both files with the task's trail". Fix: move the other-task-extras sentence out as its own sentence after the staging clause, so the header reads cleanly.

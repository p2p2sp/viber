- Blocking [plan] tests/viber/plan-index.test.ts:3453 - test-strategy Single: "a fresh plan whose tasks are T1 and T2 exits 0" seeds planBody(TWO_TASKS) on a plain call and asserts status 0, which the existing index test at line 296 already does on the same plan (it also checks the full stdout). Deleting the new test leaves every regression caught. DoD.1's "T1, T2 exits 0" half asked for this behaviour, and that existing test already proves it.
  Drop the new test and cite the existing index test ("the index carries one row per task ...") as the proof of the second half of DoD.1.
- Blocking [task] viber/scripts/plan-index.sh:1046 - the comment "# Blocks: the ids run C1, C2, ... in block order. Skipped under --split." appears twice, on lines 1046 and 1047. It is an editing leftover.
  Delete one of the two lines.
- Minor viber/scripts/plan-index.sh:852 - the `id[i] != ""` guard can never be false: line 835 already does `continue` when a task has no id.
  Drop the guard and keep `id[i] != "T" i`.

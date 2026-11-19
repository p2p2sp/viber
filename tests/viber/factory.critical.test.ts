/*
 * factory.critical.test.ts - the critical tier of
 * viber/skills/factory/scripts/factory.sh: answer moves the cursor to the
 * label and sends ENTER, and sends no ENTER when the cursor did not land on
 * the label.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by factory.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/factory.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { PENDING, HEAD, SCREEN_ON_1, SCREEN_ON_3, SCREEN_CLOSED, drive } from "./factory-fixture.ts";

const SCREEN_ON_2 = `${HEAD}   1. Postgres\n ❯ 2. SQLite\n   3. MySQL\n   4. Type something.`;

test("answer on a label below the cursor sends DOWN for each row, then ENTER, and prints NEXT: done with the keys and the last screen", async () => {
  const run = await drive(["answer", "s1", "MySQL"], {
    "pending.txt": PENDING,
    "screen.txt": SCREEN_ON_1,
    "after-1.txt": SCREEN_ON_3,
    "after-2.txt": SCREEN_CLOSED,
  });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  assert.equal(run.stdout, `NEXT: done | sent: DOWN,DOWN,ENTER\n${SCREEN_CLOSED}\n`);
  assert.deepEqual(run.calls, ["pending:s1", "screen:s1|40", "keys:s1|DOWN,DOWN", "keys:s1|ENTER"]);
});

test("answer whose cursor did not land on the label after the moves prints NEXT: keys | mismatch: cursor-moved with the screen read and sends no ENTER", async () => {
  const run = await drive(["answer", "s1", "MySQL"], {
    "pending.txt": PENDING,
    "screen.txt": SCREEN_ON_1,
    "after-1.txt": SCREEN_ON_2,
  });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  assert.equal(run.stdout, `NEXT: keys | mismatch: cursor-moved\n${SCREEN_ON_2}\n`);
  assert.deepEqual(run.calls, ["pending:s1", "screen:s1|40", "keys:s1|DOWN,DOWN"]);
});

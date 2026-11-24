/*
 * arg-kind.critical.test.ts - the critical tier of viber/scripts/arg-kind.sh,
 * the wrapper of the arg-kind.ts entry: an issue reference in each of its
 * spellings is answered with the issue directive and the word as given.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the
 * classification itself is proven in process by
 * tests/viber/lib/arg-kind.unit.test.ts. This file runs on every operating
 * system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/arg-kind.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { ISSUE_URL, assertPosix, run } from "./arg-kind-fixture.ts";

const ISSUE_REFS: { name: string; word: string }[] = [
  { name: "a bare number", word: "42" },
  { name: "a #number", word: "#42" },
  { name: "an issues url", word: ISSUE_URL },
  { name: "an issues url with a # fragment", word: `${ISSUE_URL}#issuecomment-1` },
  { name: "an issues url with a ? query", word: `${ISSUE_URL}?notification_referrer_id=1` },
  { name: "an issues url behind one leading #", word: `#${ISSUE_URL}` },
];

for (const row of ISSUE_REFS) {
  test(`issue ${row.name}: NEXT: issue with the word as given as ref`, async () => {
    await assertPosix(async (shell) => {
      const result = await run(shell, ["issue", row.word]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `NEXT: issue | ref: ${row.word}\n`);
    });
  });
}

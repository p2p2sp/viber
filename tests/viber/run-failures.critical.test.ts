/*
 * run-failures.critical.test.ts - the critical tier of
 * viber/scripts/run-failures.sh: a Blocking review line becomes a failure
 * entry, the call replaces an existing failures.md whole, and it changes no
 * other file of the run directory.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by run-failures.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/run-failures.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withTempDir } from "../harness/tmp.ts";
import { seedRun, lines, run, failuresFile, readFailures } from "./run-failures-fixture.ts";

test("a Blocking first line of a review report becomes one entry carrying its cause, its source and the text after the bracket", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, {
      "review-T1-1.md": lines("VERDICT: FAIL", "", "- Blocking [convention] src/a.ts:12 - reads the file twice", "  read it once"),
    });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFailures(dir), lines("# Failures", "", "- convention | review-T1-1 | src/a.ts:12 - reads the file twice"));
  });
});

test("with entries the call replaces an existing failures.md whole", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - fresh") });
    fs.writeFileSync(failuresFile(dir), lines("# Failures", "", "- task | review-T1-1 | stale", "- plan | review-T9-1 | gone"));
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFailures(dir), lines("# Failures", "", "- task | review-T1-1 | a.ts:1 - fresh"));
  });
});

test("the call writes failures.md alone: no other file of the run directory changes", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") });
    await run(tmp, [dir]);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["failures.md", "status.md", "work"]);
    assert.deepEqual(fs.readdirSync(path.join(dir, "work")), ["review-T1-1.md"]);
  });
});

/*
 * check-playwright.critical.test.ts - the critical tier of
 * viber/scripts/check-playwright.sh: an installed playwright-cli and a root
 * package.json naming @playwright/test are both reported found.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by check-playwright.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/check-playwright.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withTempDir } from "../harness/tmp.ts";
import { withStub } from "../harness/stub.ts";
import { STUB_VERSION_1_2_3, run } from "./check-playwright-fixture.ts";

test("playwright-cli resolving and --version printing a line reports found with that version", async () => {
  await withStub("playwright-cli", STUB_VERSION_1_2_3, async (stubDir) => {
    await withTempDir("p2p2-viber-playwright-", async (dir) => {
      const result = await run(dir, [stubDir]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "playwright-cli: found 1.2.3\n@playwright/test: not found\n");
    });
  });
});

test("a root package.json naming @playwright/test under devDependencies reports it found", async () => {
  await withTempDir("p2p2-viber-playwright-", async (dir) => {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "fixture", devDependencies: { "@playwright/test": "^1.40.0" } }, null, 2),
    );
    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "playwright-cli: not found\n@playwright/test: found\n");
  });
});

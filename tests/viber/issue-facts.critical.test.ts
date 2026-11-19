/*
 * issue-facts.critical.test.ts - the critical tier of
 * viber/scripts/issue-facts.sh: a bare issue number reaches gh issue view with
 * the fixed field list and the block is relayed verbatim.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by issue-facts.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/issue-facts.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { BLOCK, assertPosix, withType, runStubbed } from "./issue-facts-fixture.ts";

const FIELDS = "number,url,title,state,author,labels,body,comments";

test("a bare number reaches gh issue view with the fixed field list and a --jq filter, and the block is relayed verbatim", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["42"], { GH_STDOUT: BLOCK.join("\n") + "\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(result.stdout.split("\n").filter((l) => l.length > 0), withType(""));
    assert.deepEqual(calls[0].slice(0, 6), ["issue", "view", "42", "--json", FIELDS, "--jq"]);
    assert.equal(calls[0].length, 7, "the --jq filter is one argument");
    assert.match(calls[0][6], /^"NUMBER=/);
  });
});

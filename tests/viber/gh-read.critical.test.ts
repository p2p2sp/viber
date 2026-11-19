/*
 * gh-read.critical.test.ts - the critical tier of viber/scripts/gh-read.sh: a
 * pull request read relays the gh block with CR stripped, and a file read goes
 * through gh api GET with no write flag, so the wrapper stays read-only.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by gh-read.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/gh-read.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { assertPosix, runStubbed, lines, PR_BLOCK } from "./gh-read-fixture.ts";

test("pr #N reaches gh pr view with N, the fixed field list and one --jq filter, and the block is relayed with CR stripped", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["pr", "#7"], { GH_STDOUT: PR_BLOCK.join("\r\n") + "\r\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), PR_BLOCK);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(0, 5), ["pr", "view", "7", "--json", "number,url,title,state,author,labels,baseRefName,headRefName,body,comments,reviews"]);
    assert.equal(calls[0][5], "--jq");
    assert.equal(calls[0].length, 7, "the --jq filter is one argument");
  });
});

test("file reads through gh api GET with the raw media type and the ref as a query", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["file", "acme/w", "/src/a.ts", "v1"], { GH_STDOUT: "line 1\r\nline 2\r\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), ["REPO=acme/w", "PATH=src/a.ts", "REF=v1", "--- file ---", "line 1", "line 2"]);
    assert.deepEqual(calls[0], ["api", "repos/acme/w/contents/src/a.ts?ref=v1", "-H", "Accept: application/vnd.github.raw"]);
    for (const flag of ["-X", "--method", "-f", "-F", "--field", "--raw-field"]) assert.ok(!calls[0].includes(flag), `gh api must never get ${flag}`);
  });
});

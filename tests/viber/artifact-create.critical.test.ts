/*
 * artifact-create.critical.test.ts - the critical tier of
 * viber/scripts/artifact-create.sh: a Markdown file, an HTML file and a link
 * each become one artifact on the issue URL, reported as one CREATED= line each
 * in argument order.
 *
 * A case lives here when the script no longer starts or the happy path breaks;
 * the rest of the contract is proven by artifact-create.test.ts. This file runs
 * on every operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/artifact-create.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { assertPosix, createCalls, ISSUE_URL, resultLine, runStubbed } from "./artifact-create-fixture.ts";

test("a Markdown file, an HTML file and a link create one artifact each on the issue URL, CREATED= lines in argument order, exit 0", async () => {
  await assertPosix(async (shell) => {
    const link = "https://example.com/spec";
    const { result, calls } = await runStubbed(shell, ["7", "notes.md", "page.html", link], {
      files: { "notes.md": "# n\n", "page.html": "<p>x</p>" },
      replies: [
        { out: resultLine("created", "11", "notes.md", "notes.md") },
        { out: resultLine("created", "12", "page.html", "page.html") },
        { out: resultLine("created", "13", "spec", link) },
      ],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      `CREATED=${ISSUE_URL}/artifacts/11\nCREATED=${ISSUE_URL}/artifacts/12\nCREATED=${ISSUE_URL}/artifacts/13\n`,
    );
    assert.deepEqual(calls[0], ["issue", "view", "7", "--json", "url", "--jq", ".url"]);
    assert.deepEqual(createCalls(calls), [
      ["issue", "artifact", "create", ISSUE_URL, "notes.md"],
      ["issue", "artifact", "create", ISSUE_URL, "page.html"],
      ["issue", "artifact", "create", ISSUE_URL, link],
    ]);
  });
});

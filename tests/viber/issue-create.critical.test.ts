/*
 * issue-create.critical.test.ts - the critical tier of
 * viber/scripts/issue-create.sh: an issue is created from the body file with
 * forwarded flags, a failed gh call exits 1 with nothing on stdout, and a
 * failed type PATCH reports the error without removing the issue.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by issue-create.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/issue-create.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { assertPosix, ISSUE_URL, runStubbed } from "./issue-create-fixture.ts";

test("gh issue create fails: exit 1, one ERROR line carrying gh's message, nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    const { result, calls, bodyKept } = await runStubbed(shell, ["<body>", "A title"], { CREATE_EXIT: "1", CREATE_STDERR: "HTTP 401: Bad credentials\n" });
    assert.equal(result.status, 1);
    assert.ok(bodyKept, "a failed create keeps the body file");
    assert.equal(result.stdout, "");
    const lines = result.stderr.split("\n").filter((l) => l.length > 0);
    assert.equal(lines.length, 1, `expected a single ERROR line, got:\n${result.stderr}`);
    assert.match(lines[0], /^ERROR issue-create\.sh: gh issue create failed: .*Bad credentials/);
    assert.equal(calls.length, 1);
  });
});

test("no --type: the body reaches gh issue create through --body-file, flags forward verbatim and in order, TYPE=none, and gh api is never called", async () => {
  await assertPosix(async (shell) => {
    const { result, calls, body, bodyKept } = await runStubbed(
      shell,
      ["<body>", "A title", "--label", "bug", "--assignee", "octocat", "--label", "triage", "--project", "Roadmap"],
      { CREATE_STDOUT: ISSUE_URL + "\n" },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(bodyKept, false, "the body file is removed once the issue exists");
    assert.equal(result.stdout, `ISSUE_URL=${ISSUE_URL}\nISSUE_NUMBER=42\nTYPE=none\nPARENT=none\n`);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [
      "issue", "create", "--title", "A title", "--body-file", body,
      "--label", "bug", "--assignee", "octocat", "--label", "triage", "--project", "Roadmap",
    ]);
  });
});

test("--type PATCH fails on an unrecognized reason: TYPE=error, TYPE_ERROR carries the message, and the issue is never removed", async () => {
  await assertPosix(async (shell) => {
    const msg = "HTTP 500: Internal Server Error";
    const { result, calls } = await runStubbed(shell, ["<body>", "A title", "--type", "bug"], {
      CREATE_STDOUT: ISSUE_URL + "\n",
      API_EXIT: "1",
      API_STDERR: msg,
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `ISSUE_URL=${ISSUE_URL}\nISSUE_NUMBER=42\nTYPE=error\nTYPE_ERROR=${msg}\nPARENT=none\n`);
    assert.ok(!calls.some((c) => c.includes("delete")), "the created issue must never be deleted");
  });
});

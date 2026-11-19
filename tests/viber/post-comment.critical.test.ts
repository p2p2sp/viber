/*
 * post-comment.critical.test.ts - the critical tier of
 * viber/scripts/post-comment.sh: a comment reaches gh through a body file and
 * prints exactly one comment URL, while a gh failure or a missing comment URL
 * exits 1 with nothing on stdout.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by post-comment.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/post-comment.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { COMMENT_URL, assertPosix, runStubbed } from "./post-comment-fixture.ts";

test("a bare number and a file reach gh issue comment through --body-file, and exactly one COMMENT_URL= line is printed", async () => {
  await assertPosix(async (shell) => {
    const { result, calls, file } = await runStubbed(shell, ["42", "<file>"], { GH_STDOUT: COMMENT_URL + "\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `COMMENT_URL=${COMMENT_URL}\n`);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ["issue", "comment", "42", "--body-file", file]);
  });
});

test("gh fails: exit 1, one ERROR line carrying gh's message, nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["42", "<file>"], { GH_EXIT: "1", GH_STDERR: "HTTP 401: Bad credentials\n" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    const lines = result.stderr.split("\n").filter((l) => l.length > 0);
    assert.equal(lines.length, 1, `expected a single ERROR line, got:\n${result.stderr}`);
    assert.match(lines[0], /^ERROR post-comment\.sh: gh issue comment failed: .*Bad credentials/);
  });
});

test("gh exits 0 but prints no comment URL: exit 1, nothing on stdout (an issue URL alone is not proof a comment landed)", async () => {
  await assertPosix(async (shell) => {
    for (const out of ["", "https://github.com/acme/widgets/issues/42\n", "https://github.com/acme/widgets/issues/42#issuecomment-abc\n"]) {
      const { result } = await runStubbed(shell, ["42", "<file>"], { GH_STDOUT: out });
      assert.equal(result.status, 1, `gh stdout ${JSON.stringify(out)}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^ERROR post-comment\.sh: gh issue comment failed:/);
    }
  });
});

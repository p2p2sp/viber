/*
 * qa-comment.critical.test.ts - the critical tier of
 * viber/scripts/qa-comment.sh: the qa comment is posted once with its marker
 * and body verbatim, a run already posted is skipped without a post, and a
 * post that prints no comment URL exits 1 with empty stdout.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by qa-comment.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/qa-comment.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import {
  assertPosix,
  QA_REL,
  PR_URL,
  COMMENT_URL,
  runInRepo,
  posts,
  specWith,
  SPEC_WITH_ISSUE,
  EXPECTED_BODY,
  assertOneError,
} from "./qa-comment-fixture.ts";

test("with --pr, the body is the marker line, the header line, an empty line and the qa file verbatim, and stdout is STATUS=posted plus the comment URL", async () => {
  await assertPosix(async (shell) => {
    const { result, calls, body } = await runInRepo(shell, [QA_REL, "--pr", PR_URL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `STATUS=posted\nCOMMENT_URL=${COMMENT_URL}\n`);
    assert.equal(body, EXPECTED_BODY);
    assert.equal(posts(calls)[0][2], PR_URL);
  });
});

test("an issue comment holding a marker of the same run key: STATUS=skip REASON=exists and no post", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL], {
      env: { COMMENTS: `<!-- viber:qa ${QA_REL} -->\nQA document\n` },
      setup: specWith(SPEC_WITH_ISSUE),
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "STATUS=skip\nREASON=exists\nSAY=the QA document of this run is already posted\n");
    assert.equal(posts(calls).length, 0);
  });
});

test("gh posting but printing no comment URL: exit 1, one ERROR line, empty stdout (a pull request URL alone is not proof a comment landed)", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runInRepo(shell, [QA_REL, "--pr", PR_URL], { env: { POST_OUT: PR_URL } });
    assertOneError(result);
  });
});

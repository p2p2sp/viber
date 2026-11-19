/*
 * pr-create.critical.test.ts - the critical tier of
 * viber/scripts/pr-create.sh: a branch is pushed and its pull request opened
 * and assigned, while a failed push, a failed gh call or a missing pull
 * request URL exits 1 without being reported as done.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by pr-create.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/pr-create.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { assertPosix, PR_URL, withScene, runPr, remoteHeads } from "./pr-create-fixture.ts";

test("a branch pushed to a bare remote gets its upstream set, gh pr create is called with base, head, title and the body file, then the new pull request is assigned to its author", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const { result, calls } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main"], { env: { PR_STDOUT: PR_URL + "\n" } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(await remoteHeads(scene), "refs/heads/feature/x");
      const upstream = await scene.work.git("rev-parse", "--abbrev-ref", "feature/x@{upstream}");
      assert.equal(upstream.stdout.trim(), "origin/feature/x");
      assert.deepEqual(calls, [
        ["pr", "create", "--base", "main", "--head", "feature/x", "--title", "Add x", "--body-file", scene.body],
        ["pr", "edit", PR_URL, "--add-assignee", "@me"],
      ]);
      assert.equal(fs.existsSync(scene.body), false, "the body file is removed once the pull request exists");
    });
  });
});

test("a failed push exits 1 with one ERROR line before gh runs, and prints nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await scene.work.git("remote", "set-url", "origin", path.join(scene.remote.dir, "does-not-exist"));
      const { result, calls } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main"], { env: { PR_STDOUT: PR_URL + "\n" } });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      const lines = result.stderr.split("\n").filter((l) => l.length > 0);
      assert.equal(lines.length, 1, `expected a single ERROR line, got:\n${result.stderr}`);
      assert.match(lines[0], /^ERROR pr-create\.sh: git push failed/);
      assert.equal(calls.length, 0);
    });
  });
});

test("a gh failure exits 1 with one ERROR line naming the branch as pushed", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const { result } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main"], { env: { PR_EXIT: "1", PR_STDERR: "HTTP 401: Bad credentials\n" } });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      const lines = result.stderr.split("\n").filter((l) => l.length > 0);
      assert.equal(lines.length, 1, `expected a single ERROR line, got:\n${result.stderr}`);
      assert.match(lines[0], /^ERROR pr-create\.sh: gh pr create failed.*origin\/feature\/x is pushed.*Bad credentials/);
      assert.equal(await remoteHeads(scene), "refs/heads/feature/x");
      assert.ok(fs.existsSync(scene.body), "a failed create keeps the body file");
    });
  });
});

test("gh exits 0 but prints no pull request URL: exit 1 naming the branch as pushed, nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const { result } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main"], { env: { PR_STDOUT: "https://github.com/acme/widgets/issues/17\n" } });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^ERROR pr-create\.sh: gh pr create failed.*origin\/feature\/x is pushed/);
    });
  });
});

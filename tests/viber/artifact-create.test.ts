/*
 * artifact-create.test.ts - proves viber/scripts/artifact-create.sh's
 * `artifact-create.sh <issue> <file or link>...` contract against a stubbed
 * `gh`: an image or video travels as one named Markdown document through
 * --attach, a created result carrying a reason prints REASON= and exits 1, a
 * file of another type is REFUSED= with no gh call, a failed or result-less
 * call is FAILED= with the next argument still processed, and the
 * unknown-command output of an old gh exits 3.
 *
 * artifact-create.sh is `#!/bin/sh`, so every case runs through
 * forEachShell("posix", ...). `gh` is always a withStub - this test never shells
 * out to the real gh.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/artifact-create.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";

import { assertPosix, createCalls, ISSUE_URL, resultLine, runStubbed, UNKNOWN_COMMAND } from "./artifact-create-fixture.ts";

test("an image and a video each create one Markdown document named after the file, carrying it through --attach", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["42", "shots/Home.PNG", "demo.mp4"], {
      files: { "shots/Home.PNG": "png", "demo.mp4": "mp4" },
      replies: [
        { out: resultLine("created", "1", "Home.PNG", "shots/Home.PNG") },
        { out: resultLine("created", "2", "demo.mp4", "demo.mp4") },
      ],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `CREATED=${ISSUE_URL}/artifacts/1\nCREATED=${ISSUE_URL}/artifacts/2\n`);
    assert.deepEqual(createCalls(calls), [
      ["issue", "artifact", "create", ISSUE_URL, "--name", "Home.PNG", "--body", "Home.PNG", "--attach", "shots/Home.PNG"],
      ["issue", "artifact", "create", ISSUE_URL, "--name", "demo.mp4", "--body", "demo.mp4", "--attach", "demo.mp4"],
    ]);
  });
});

test("a created result with a reason prints CREATED= then REASON= and exits 1 (the document exists but its file did not upload)", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["42", "a.png"], {
      files: { "a.png": "png" },
      replies: [{ out: resultLine("created", "5", "a.png", "a.png", "file too large") }],
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, `CREATED=${ISSUE_URL}/artifacts/5\nREASON=file too large\n`);
  });
});

test("a file of another type prints REFUSED=, reaches no gh call and the other arguments are still processed, exit 1", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["42", "data.zip", "noext", "b.md"], {
      files: { "data.zip": "z", noext: "n", "b.md": "# b" },
      replies: [{ out: resultLine("created", "9", "b.md", "b.md") }],
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, `REFUSED=data.zip\nREFUSED=noext\nCREATED=${ISSUE_URL}/artifacts/9\n`);
    assert.equal(createCalls(calls).length, 1);
  });
});

test("a failed result line prints FAILED= then gh's REASON= and the next argument is still processed, exit 1", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["42", "a.md", "b.md"], {
      files: { "a.md": "a", "b.md": "b" },
      replies: [
        { out: resultLine("failed", "", "a.md", "a.md", "content rejected") },
        { out: resultLine("created", "3", "b.md", "b.md") },
      ],
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, `FAILED=a.md\nREASON=content rejected\nCREATED=${ISSUE_URL}/artifacts/3\n`);
  });
});

test("a create call printing no result line prints FAILED= with its output as REASON=, exit 1", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["42", "a.md"], {
      files: { "a.md": "a" },
      replies: [{ out: "HTTP 500: boom\nretry later\n", exit: 1 }],
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "FAILED=a.md\nREASON=HTTP 500: boom retry later\n");
  });
});

test("the unknown-command output on the first create call exits 3 with one ERROR line, empty stdout and no further call", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["42", "a.md", "b.md"], {
      files: { "a.md": "a", "b.md": "b" },
      replies: [{ out: UNKNOWN_COMMAND, exit: 1 }],
    });
    assert.equal(result.status, 3);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "ERROR artifact-create.sh: gh has no issue artifact command; it needs gh 2.103 or later\n");
    assert.equal(createCalls(calls).length, 1);
  });
});

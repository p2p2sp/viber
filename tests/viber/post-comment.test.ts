/*
 * post-comment.test.ts - proves viber/scripts/post-comment.sh's
 * `post-comment.sh <N | #N | issue url> <comment file>` contract against a
 * stubbed `gh`: the reference and the file reach `gh issue comment` through
 * `--body-file`, `#N` is normalized to `N`, exactly one COMMENT_URL= line is
 * printed once gh returned a well-formed issuecomment URL (CRLF and stderr
 * noise tolerated), exit 1 with one ERROR line and an empty stdout when gh
 * fails, prints no comment URL or is not on PATH at all, and exit 2 with gh
 * never called on a wrong argument count, a malformed reference or a missing
 * comment file.
 *
 * post-comment.sh is `#!/bin/sh`, so every case runs through
 * forEachShell("posix", ...) via opts.shell, never executed directly. `gh` is
 * always a withStub, or absent - this test never shells out to the real gh.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/post-comment.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { coreUtilsPath } from "../harness/stub.ts";
import { SUT, COMMENT_URL, assertPosix, runStubbed } from "./post-comment-fixture.ts";

// --- success --------------------------------------------------------------------

test("#42 is passed to gh as 42, an issue url verbatim, and one carrying a comment fragment or a query as the bare issue url", async () => {
  await assertPosix(async (shell) => {
    const url = "https://github.com/acme/widgets/issues/42";
    for (const [ref, expected] of [["#42", "42"], [url, url], [`${url}#issuecomment-1`, url], [`${url}?foo=1`, url]]) {
      const { result, calls } = await runStubbed(shell, [ref, "<file>"], { GH_STDOUT: COMMENT_URL + "\n" });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(calls[0][2], expected);
    }
  });
});

test("a comment URL followed by CRLF and a stderr warning still parses cleanly", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["42", "<file>"], {
      GH_STDOUT: COMMENT_URL + "\r\n\r\n",
      GH_STDERR: "warning: some non-fatal notice\n",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `COMMENT_URL=${COMMENT_URL}\n`);
  });
});

// --- gh failure -------------------------------------------------------------------

const ghOnCorePath = coreUtilsPath()
  .split(path.delimiter)
  .some((dir) => ["gh", "gh.exe"].some((n) => fs.existsSync(path.join(dir, n))));

test(
  "gh not on PATH: exit 1 with one ERROR line naming gh",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await assertPosix(async (shell) => {
      await withTempDir("p2p2-post-comment-", async (cwd) => {
        const file = path.join(cwd, "comment.md");
        fs.writeFileSync(file, "body\n");
        const result = await runScript(SUT, ["42", file], { shell, cwd, env: { PATH: coreUtilsPath() } });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /^ERROR post-comment\.sh: gh not found on PATH$/m);
      });
    });
  },
);

// --- bad arguments ----------------------------------------------------------------

test("a wrong argument count: exit 2 and gh is never called", async () => {
  await assertPosix(async (shell) => {
    for (const args of [[], ["42"], ["42", "<file>", "extra"]]) {
      const { result, calls } = await runStubbed(shell, args);
      assert.equal(result.status, 2, `args ${JSON.stringify(args)}`);
      assert.match(result.stderr, /need <issue number or url> <comment file>/);
      assert.equal(calls.length, 0);
    }
  });
});

test("a reference that is neither a number nor an issue url: exit 2 and gh is never called", async () => {
  await assertPosix(async (shell) => {
    for (const ref of ["", "login is broken", "https://github.com/acme/widgets/pull/42", "https://github.com/acme/issues/42"]) {
      const { result, calls } = await runStubbed(shell, [ref, "<file>"]);
      assert.equal(result.status, 2, `ref ${JSON.stringify(ref)}: ${result.stderr}`);
      assert.match(result.stderr, /not an issue number or url/);
      assert.equal(calls.length, 0);
    }
  });
});

test("a comment file that does not exist: exit 2 and gh is never called (nothing half-posted)", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["42", "does-not-exist.md"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^ERROR post-comment\.sh: comment file not found: does-not-exist\.md$/m);
    assert.equal(calls.length, 0);
  });
});

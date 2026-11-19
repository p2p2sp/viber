/*
 * gh-read.test.ts - proves viber/scripts/gh-read.sh's read-only contract
 * against a stubbed `gh`: each subcommand (`pr`, `list`, `file`, `release`)
 * reaches gh with its fixed argv, `gh api` never with `-X`, `-f` or `-F`,
 * gh's stdout is relayed with CR stripped inside the fixed block, exit 1 with
 * one ERROR line and an empty stdout when gh fails, prints no head line or is
 * not on PATH, and exit 2 with gh never called on bad arguments. `issue`
 * delegates to issue-facts.sh, whose own test holds its block.
 *
 * gh-read.sh is `#!/bin/sh`, so every case runs through
 * forEachShell("posix", ...) via opts.shell. `gh` is always a withStub, or
 * absent - this test never shells out to the real gh.
 *
 *   node --test tests/viber/gh-read.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { coreUtilsPath } from "../harness/stub.ts";
import { SUT, assertPosix, runStubbed, lines, PR_BLOCK } from "./gh-read-fixture.ts";

// --- issue -----------------------------------------------------------------------

test("issue #N delegates to issue-facts.sh, which calls gh issue view with N", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["issue", "#42"], { GH_STDOUT: "NUMBER=42\nURL=u\n--- body ---\nx\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^NUMBER=42\n/);
    assert.deepEqual(calls[0].slice(0, 3), ["issue", "view", "42"]);
  });
});

// --- pr --------------------------------------------------------------------------

test("a pull request url reaches gh with its #fragment and ?query dropped", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["pr", "https://github.com/acme/w/pull/7?x=1#issuecomment-9"], { GH_STDOUT: PR_BLOCK.join("\n") + "\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(calls[0][2], "https://github.com/acme/w/pull/7");
  });
});

test("pr exits 1 with one ERROR line and no stdout when gh prints no NUMBER= first line", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["pr", "7"], { GH_STDOUT: "garbage\n" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^ERROR gh-read\.sh: /);
  });
});

// --- list ------------------------------------------------------------------------

test("list issues passes the query, open and closed, a limit and -R, and prints KIND= and COUNT= before the items", async () => {
  await assertPosix(async (shell) => {
    const items = ["#3 | OPEN | 2026-10-01 | First", "#2 | CLOSED | 2026-09-01 | Second"];
    const { result, calls } = await runStubbed(shell, ["list", "issues", "label:bug login", "acme/w"], { GH_STDOUT: items.join("\n") + "\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), ["KIND=issues", "COUNT=2", ...items]);
    assert.deepEqual(calls[0].slice(0, 10), ["issue", "list", "--state", "all", "--limit", "30", "--search", "label:bug login", "-R", "acme/w"]);
  });
});

test("list prs with an empty result prints COUNT=0 and no -R without a repository", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["list", "prs", ""], { GH_STDOUT: "" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), ["KIND=prs", "COUNT=0"]);
    assert.deepEqual(calls[0].slice(0, 2), ["pr", "list"]);
    assert.ok(!calls[0].includes("-R"));
  });
});

// --- release ---------------------------------------------------------------------

test("release without a tag reads the latest, with a tag reads that one", async () => {
  await assertPosix(async (shell) => {
    const block = ["TAG=v1", "NAME=One", "PUBLISHED=2026-01-01T00:00:00Z", "URL=https://github.com/acme/w/releases/tag/v1", "--- body ---", "Notes."];
    const latest = await runStubbed(shell, ["release", "acme/w"], { GH_STDOUT: block.join("\n") + "\n" });
    assert.equal(latest.result.status, 0, `stderr: ${latest.result.stderr}`);
    assert.deepEqual(lines(latest.result.stdout), block);
    assert.deepEqual(latest.calls[0].slice(0, 4), ["release", "view", "-R", "acme/w"]);
    const tagged = await runStubbed(shell, ["release", "acme/w", "v1"], { GH_STDOUT: block.join("\n") + "\n" });
    assert.deepEqual(tagged.calls[0].slice(0, 5), ["release", "view", "v1", "-R", "acme/w"]);
  });
});

// --- failures --------------------------------------------------------------------

test("a failing gh exits 1 with one ERROR line carrying its stderr and nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["release", "acme/w"], { GH_EXIT: "1", GH_STDERR: "release not found\n", GH_STDOUT: "partial" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^ERROR gh-read\.sh: gh release failed: release not found/);
  });
});

const ghOnCorePath = coreUtilsPath()
  .split(path.delimiter)
  .some((dir) => ["gh", "gh.exe"].some((n) => fs.existsSync(path.join(dir, n))));

test(
  "gh not on PATH: exit 1 with one ERROR line naming gh",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await assertPosix(async (shell) => {
      await withTempDir("p2p2-gh-read-", async (cwd) => {
        const result = await runScript(SUT, ["list", "issues", "x"], { shell, cwd, env: { PATH: coreUtilsPath() } });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /^ERROR gh-read\.sh: gh not found on PATH$/m);
      });
    });
  },
);

for (const args of [[], ["bogus"], ["pr"], ["pr", "abc"], ["pr", "https://github.com/acme/w/issues/7"], ["list", "commits", "x"], ["list", "issues"], ["list", "issues", "x", "noslash"], ["file", "acme", "a.ts"], ["file", "acme/w", ""], ["release", "a/b/c"], ["issue"]]) {
  test(`bad arguments ${JSON.stringify(args)} exit 2 with gh never called`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runStubbed(shell, args);
      assert.equal(result.status, 2, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.equal(calls.length, 0);
    });
  });
}

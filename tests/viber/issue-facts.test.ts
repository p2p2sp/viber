/*
 * issue-facts.test.ts - proves viber/scripts/issue-facts.sh's
 * `issue-facts.sh <N | #N | issue url>` contract against a stubbed `gh`: the
 * issue reference reaches `gh issue view` with the fixed `--json` field list
 * and a `--jq` filter, `#N` is normalized to `N`, a URL passes verbatim, gh's
 * stdout is relayed with CR stripped and nothing from its stderr, a `TYPE=`
 * line from the `gh api` type lookup follows `LABELS=` (empty when the issue
 * has no type or the lookup fails, owner/repo/host taken from a URL), exit 1 with
 * one ERROR line and an empty stdout when gh fails, prints no `NUMBER=` first
 * line or is not on PATH at all, and exit 2 with gh never called on a wrong
 * argument count or a reference that is neither a number nor an issue url.
 *
 * issue-facts.sh is `#!/bin/sh`, so every case runs through
 * forEachShell("posix", ...) via opts.shell, never executed directly. `gh` is
 * always a withStub, or absent - this test never shells out to the real gh.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/issue-facts.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { coreUtilsPath } from "../harness/stub.ts";
import { SUT, BLOCK, assertPosix, withType, runStubbed } from "./issue-facts-fixture.ts";

// --- issue type -------------------------------------------------------------------

test("a typed issue prints TYPE=<name> right after LABELS= (the planner picks the branching entry from it)", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["42"], { GH_STDOUT: BLOCK.join("\n") + "\n", GH_TYPE_STDOUT: "Bug\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(result.stdout.split("\n").filter((l) => l.length > 0), withType("Bug"));
  });
});

test("an untyped issue prints an empty TYPE= line (the planner refuses it once mappings exist)", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["42"], { GH_STDOUT: BLOCK.join("\n") + "\n", GH_TYPE_STDOUT: "\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(result.stdout.split("\n").filter((l) => l.length > 0), withType(""));
  });
});

test("a failing type lookup still exits 0 with an empty TYPE= line and none of its output (an old gh or GHES without issue types must not lose the issue)", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["42"], {
      GH_STDOUT: BLOCK.join("\n") + "\n",
      GH_TYPE_STDOUT: '{"message":"Not Found"}',
      GH_TYPE_STDERR: "gh: Not Found (HTTP 404)\n",
      GH_TYPE_EXIT: "1",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(result.stdout.split("\n").filter((l) => l.length > 0), withType(""));
  });
});

const TYPE_JQ = '.type.name // ""';

test("a bare number looks the type up in the cwd repository through gh's {owner}/{repo} placeholders", async () => {
  await assertPosix(async (shell) => {
    const { calls } = await runStubbed(shell, ["42"], { GH_STDOUT: BLOCK.join("\n") + "\n" });
    assert.deepEqual(
      calls.find((c) => c[0] === "api"),
      ["api", "repos/{owner}/{repo}/issues/42", "--jq", TYPE_JQ],
    );
  });
});

test("a github.com issue url looks the type up in that url's owner and repository, with no --hostname", async () => {
  await assertPosix(async (shell) => {
    const { calls } = await runStubbed(shell, ["https://github.com/acme/widgets/issues/42#issuecomment-1"], {
      GH_STDOUT: BLOCK.join("\n") + "\n",
    });
    assert.deepEqual(calls.find((c) => c[0] === "api"), ["api", "repos/acme/widgets/issues/42", "--jq", TYPE_JQ]);
  });
});

test("an enterprise host url passes that host through --hostname (gh api would otherwise ask github.com)", async () => {
  await assertPosix(async (shell) => {
    const { calls } = await runStubbed(shell, ["https://ghe.example.com/acme/widgets/issues/42"], {
      GH_STDOUT: BLOCK.join("\n") + "\n",
    });
    assert.deepEqual(calls.find((c) => c[0] === "api"), [
      "api",
      "repos/acme/widgets/issues/42",
      "--hostname",
      "ghe.example.com",
      "--jq",
      TYPE_JQ,
    ]);
  });
});

test("#42 is passed to gh as 42 (a user typing the GitHub reference form)", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["#42"], { GH_STDOUT: BLOCK.join("\n") + "\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(calls[0][2], "42");
  });
});

test("an issue url is passed to gh verbatim", async () => {
  await assertPosix(async (shell) => {
    const url = "https://github.com/acme/widgets/issues/42";
    const { result, calls } = await runStubbed(shell, [url], { GH_STDOUT: BLOCK.join("\n") + "\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(calls[0][2], url);
  });
});

test("an issue url carrying a comment fragment or a query reaches gh as the bare issue url (the \"Copy link\" form of a comment must not be refused)", async () => {
  await assertPosix(async (shell) => {
    const url = "https://github.com/acme/widgets/issues/42";
    for (const ref of [`${url}#issuecomment-1`, `${url}?foo=1`, `${url}?foo=1#issuecomment-1`]) {
      const { result, calls } = await runStubbed(shell, [ref], { GH_STDOUT: BLOCK.join("\n") + "\n" });
      assert.equal(result.status, 0, `ref ${JSON.stringify(ref)}: ${result.stderr}`);
      assert.equal(calls[0][2], url);
    }
  });
});

test("CR in gh's output is stripped (issue bodies written on the web carry CRLF)", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["42"], { GH_STDOUT: BLOCK.join("\r\n") + "\r\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(!result.stdout.includes("\r"), "no CR may survive");
    assert.deepEqual(result.stdout.split("\n").filter((l) => l.length > 0), withType(""));
  });
});

test("a warning gh writes to stderr on success never reaches stdout (it would corrupt the block)", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["42"], {
      GH_STDOUT: BLOCK.join("\n") + "\n",
      GH_STDERR: "A new release of gh is available\n",
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(!result.stdout.includes("new release"));
    assert.match(result.stdout, /^NUMBER=42$/m);
  });
});

// --- gh failure -------------------------------------------------------------------

test("gh fails: exit 1, one ERROR line carrying gh's message, nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["99999"], {
      GH_EXIT: "1",
      GH_STDERR: "GraphQL: Could not resolve to an issue\n",
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    const lines = result.stderr.split("\n").filter((l) => l.length > 0);
    assert.equal(lines.length, 1, `expected a single ERROR line, got:\n${result.stderr}`);
    assert.match(lines[0], /^ERROR issue-facts\.sh: gh issue view failed: .*Could not resolve/);
  });
});

test("gh exits 0 but prints no NUMBER= first line: exit 1, nothing on stdout (the block is trusted unchecked)", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runStubbed(shell, ["42"], { GH_STDOUT: "something else\nNUMBER=42\n" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^ERROR issue-facts\.sh: gh issue view failed:/);
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
      await withTempDir("p2p2-issue-facts-", async (cwd) => {
        const result = await runScript(SUT, ["42"], { shell, cwd, env: { PATH: coreUtilsPath() } });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /^ERROR issue-facts\.sh: gh not found on PATH$/m);
      });
    });
  },
);

// --- bad arguments ----------------------------------------------------------------

test("no argument or two arguments: exit 2 and gh is never called", async () => {
  await assertPosix(async (shell) => {
    for (const args of [[], ["42", "43"]]) {
      const { result, calls } = await runStubbed(shell, args);
      assert.equal(result.status, 2, `args ${JSON.stringify(args)}`);
      assert.match(result.stderr, /need exactly one/);
      assert.equal(calls.length, 0);
    }
  });
});

test("a reference that is neither a number nor an issue url: exit 2 and gh is never called (pasted text must not reach gh)", async () => {
  const bad = [
    "",
    "#",
    "login is broken",
    "42a",
    "http://github.com/acme/widgets/issues/42",
    "https://github.com/acme/widgets/pull/42",
    "https://github.com/acme/widgets/issues/",
    "https://github.com/acme/widgets/issues/#issuecomment-1",
    "https://github.com/acme/issues/42",
    "https://github.com/a/b/c/issues/42",
    "https://github.com//widgets/issues/42",
  ];
  await assertPosix(async (shell) => {
    for (const ref of bad) {
      const { result, calls } = await runStubbed(shell, [ref]);
      assert.equal(result.status, 2, `ref ${JSON.stringify(ref)}: ${result.stderr}`);
      assert.match(result.stderr, /not an issue number or url/);
      assert.equal(calls.length, 0);
    }
  });
});

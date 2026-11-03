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

import { runScript, type RunResult } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/gh-read.sh");

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

/** A `gh` stub logging its argv one-arg-per-line (a "===" separator after
 *  each call) into `$ARGV_FILE`; stdout, stderr and exit come from env. */
const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
if [ -n "\${GH_STDERR:-}" ]; then printf '%s' "$GH_STDERR" >&2; fi
printf '%s' "\${GH_STDOUT:-}"
exit "\${GH_EXIT:-0}"
`;

async function runStubbed(shell: Shell, args: string[], env: Record<string, string> = {}): Promise<{ result: RunResult; calls: string[][] }> {
  return await withTempDir("p2p2-gh-read-", (cwd) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      const argvFile = path.join(cwd, "argv.log");
      fs.writeFileSync(argvFile, "");
      const result = await runScript(SUT, args, { shell, cwd, env: { ARGV_FILE: argvFile, ...env }, stubDirs: [stubDir] });
      const calls = fs
        .readFileSync(argvFile, "utf-8")
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      return { result, calls };
    }),
  );
}

const lines = (s: string) => s.split("\n").filter((l) => l.length > 0);

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

const PR_BLOCK = ["NUMBER=7", "URL=https://github.com/acme/w/pull/7", "TITLE=Fix", "STATE=OPEN", "AUTHOR=octocat", "LABELS=", "BASE=main", "HEAD=fix", "COMMENTS=0", "REVIEWS=0", "--- body ---", "Body."];

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

// --- file ------------------------------------------------------------------------

test("file reads through gh api GET with the raw media type and the ref as a query", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runStubbed(shell, ["file", "acme/w", "/src/a.ts", "v1"], { GH_STDOUT: "line 1\r\nline 2\r\n" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(lines(result.stdout), ["REPO=acme/w", "PATH=src/a.ts", "REF=v1", "--- file ---", "line 1", "line 2"]);
    assert.deepEqual(calls[0], ["api", "repos/acme/w/contents/src/a.ts?ref=v1", "-H", "Accept: application/vnd.github.raw"]);
    for (const flag of ["-X", "--method", "-f", "-F", "--field", "--raw-field"]) assert.ok(!calls[0].includes(flag), `gh api must never get ${flag}`);
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

/*
 * pr-reply.test.ts - proves viber/scripts/pr-reply.sh's
 * `pr-reply.sh <pull request> <comment-id> <reply file>` contract against a
 * throwaway git repo and a stubbed `gh`: exit 2 with gh never called on a wrong
 * argument count, a malformed pull request reference, a non-numeric comment id
 * or a missing reply file; STATUS=skip / REASON=exists with no POST when a reply
 * to that comment already opens with the viber marker for that id; otherwise the
 * marker line, a blank line and the reply file verbatim posted to the comment's
 * replies endpoint only (`--hostname` on every call for a URL, the
 * {owner}/{repo} placeholders for a bare number), STATUS=posted / REPLY_URL=,
 * the body file left under .temp; exit 1 with one ERROR line and an empty
 * stdout when gh fails, returns no well-formed review comment URL or is absent.
 *
 * pr-reply.sh is `#!/bin/sh`, so every case runs through forEachShell("posix",
 * ...) via opts.shell, never executed directly. `gh` is always a withStub, or
 * absent - this test never shells out to the real gh. The stub answers the
 * comments read with the lines `<in_reply_to_id> <first line of the body>`,
 * the shape the script asks gh's own --jq for, and the POST with a URL.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/pr-reply.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo } from "../harness/tmp.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/pr-reply.sh");

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

const PR_URL = "https://github.com/acme/widgets/pull/42";
const GHE_URL = "https://ghe.example.com/acme/widgets/pull/42";
const REPLY_URL = `${PR_URL}#discussion_r777`;
const MARKER = "<!-- viber:pr-feedback 101 -->";
const REPLY_TEXT = "Fixed in abc123.\n\nThe guard now runs first.\r\nNo trailing newline";

/** A `gh` stub logging its argv one-arg-per-line (a "===" separator after each
 *  call) into `$ARGV_FILE`. A call with `-X` is the POST: it copies the file of
 *  its `-F body=@<file>` into `$BODY_LOG`, then fails on POST_FAIL or prints
 *  POST_OUT (default: a review comment URL). Any other call is the comments
 *  read: it prints COMMENTS or fails on READ_FAIL. */
const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
post=""
for a in "$@"; do
  if [ "$a" = "-X" ]; then post=yes; fi
  case $a in body=@*) cat "\${a#body=@}" > "$BODY_LOG" ;; esac
done
if [ -n "$post" ]; then
  if [ -n "\${POST_FAIL:-}" ]; then echo "HTTP 500: server error" >&2; exit 1; fi
  printf '%s' "\${POST_OUT-${REPLY_URL}
}"
  exit 0
fi
if [ -n "\${READ_FAIL:-}" ]; then echo "HTTP 401: Bad credentials" >&2; exit 1; fi
printf '%s' "\${COMMENTS:-}"
exit 0
`;

interface Outcome {
  result: RunResult;
  calls: string[][];
  body: string | null;
  /** The content of .temp/viber/pr-feedback/42/posted/101.md after the run (null when absent). */
  kept: string | null;
}

interface RunOpts {
  env?: Record<string, string>;
  /** Write no reply file. */
  noFile?: boolean;
}

/** Runs pr-reply.sh inside a fresh repo holding reply.md (REPLY_TEXT), with the
 *  gh stub first on PATH. The token "<file>" in `args` becomes "reply.md". */
async function runInRepo(shell: Shell, args: string[], opts: RunOpts = {}): Promise<Outcome> {
  return await withGitRepo((repo) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      if (!opts.noFile) fs.writeFileSync(path.join(repo.dir, "reply.md"), REPLY_TEXT);
      const argvFile = path.join(repo.dir, "argv.log");
      const bodyLog = path.join(repo.dir, "body.log");
      fs.writeFileSync(argvFile, "");
      const real = args.map((a) => (a === "<file>" ? "reply.md" : a));
      const env = { ...repo.env, ARGV_FILE: argvFile, BODY_LOG: bodyLog, ...opts.env };
      const result = await runScript(SUT, real, { shell, cwd: repo.dir, env, stubDirs: [stubDir] });
      const calls = fs
        .readFileSync(argvFile, "utf-8")
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      const body = fs.existsSync(bodyLog) ? fs.readFileSync(bodyLog, "utf-8") : null;
      const keptFile = path.join(repo.dir, ".temp/viber/pr-feedback/42/posted/101.md");
      const kept = fs.existsSync(keptFile) ? fs.readFileSync(keptFile, "utf-8") : null;
      return { result, calls, body, kept };
    }),
  );
}

const endpointOf = (call: string[]) => call.find((a) => a.startsWith("repos/"));
const posts = (calls: string[][]) => calls.filter((c) => c.includes("-X"));
const reads = (calls: string[][]) => calls.filter((c) => !c.includes("-X"));
const EXPECTED_BODY = `${MARKER}\n\n${REPLY_TEXT}`;

// --- bad arguments ----------------------------------------------------------------

const BAD_ARGS: Array<[string, string[]]> = [
  ["no arguments", []],
  ["two arguments", ["42", "101"]],
  ["four arguments", ["42", "101", "<file>", "extra"]],
  ["an empty pull request", ["", "101", "<file>"]],
  ["a word as pull request", ["login", "101", "<file>"]],
  ["an issue url as pull request", ["https://github.com/acme/widgets/issues/42", "101", "<file>"]],
  ["a pull request url without a repository", ["https://github.com/acme/pull/42", "101", "<file>"]],
  ["a pull request url with a non-numeric number", ["https://github.com/acme/widgets/pull/x", "101", "<file>"]],
  ["a word as comment id", ["42", "abc", "<file>"]],
  ["a comment id with a suffix", ["42", "101x", "<file>"]],
  ["an empty comment id", ["42", "", "<file>"]],
  ["a reply file that does not exist", ["42", "101", "missing.md"]],
];

for (const [name, args] of BAD_ARGS) {
  test(`${name}: exit 2 and gh is never called`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runInRepo(shell, args);
      assert.equal(result.status, 2, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^ERROR pr-reply\.sh: /m);
      assert.equal(calls.length, 0);
    });
  });
}

// --- skip: a viber reply already exists ---------------------------------------------

test("a reply to the comment opening with its marker prints STATUS=skip and REASON=exists and posts nothing", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, ["42", "101", "<file>"], {
      env: { COMMENTS: `300 Looks good\r\n101 ${MARKER}\r\n` },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "STATUS=skip\nREASON=exists\n");
    assert.equal(posts(calls).length, 0);
  });
});

test("a thread whose newest reply is the marker, after an older reviewer follow-up, still prints STATUS=skip and REASON=exists and posts nothing", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, ["42", "101", "<file>"], {
      env: { COMMENTS: `null Please fix\n101 ${MARKER}\n101 One more thing\n101 ${MARKER}\n` },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "STATUS=skip\nREASON=exists\n");
    assert.equal(posts(calls).length, 0);
  });
});

test("a reviewer follow-up newer than the viber reply is answered: the reply is posted once and STATUS=posted is printed", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, ["42", "101", "<file>"], {
      env: { COMMENTS: `null Please fix\n101 ${MARKER}\n101 One more thing\n` },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `STATUS=posted\nREPLY_URL=${REPLY_URL}\n`);
    assert.equal(posts(calls).length, 1);
  });
});

const NOT_A_SKIP: Array<[string, string]> = [
  ["the marker is the first line of a reply to another comment", `202 ${MARKER}\n`],
  ["a reply to the comment opens with another line", `101 I disagree, see ${MARKER}\n`],
  ["the marker names another comment", "101 <!-- viber:pr-feedback 102 -->\n"],
  ["the comment has no reply", ""],
];

for (const [name, comments] of NOT_A_SKIP) {
  test(`${name}: the reply is posted`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runInRepo(shell, ["42", "101", "<file>"], { env: { COMMENTS: comments } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(posts(calls).length, 1);
    });
  });
}

// --- posting ----------------------------------------------------------------------

test("the posted body is the marker line, a blank line and the reply file verbatim, and stdout is STATUS=posted plus the reply url", async () => {
  await assertPosix(async (shell) => {
    const { result, body } = await runInRepo(shell, ["42", "101", "<file>"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `STATUS=posted\nREPLY_URL=${REPLY_URL}\n`);
    assert.equal(body, EXPECTED_BODY);
  });
});

test("a bare number reads the comments and posts to the replies endpoint of the comment through the repository placeholders, with no hostname", async () => {
  await assertPosix(async (shell) => {
    const { calls } = await runInRepo(shell, ["42", "101", "<file>"]);
    assert.deepEqual(reads(calls).map(endpointOf), ["repos/{owner}/{repo}/pulls/42/comments"]);
    assert.deepEqual(posts(calls).map(endpointOf), ["repos/{owner}/{repo}/pulls/42/comments/101/replies"]);
    assert.equal(calls.flat().includes("--hostname"), false);
  });
});

test("#42 is the pull request 42", async () => {
  await assertPosix(async (shell) => {
    const { calls } = await runInRepo(shell, ["#42", "101", "<file>"]);
    assert.deepEqual(posts(calls).map(endpointOf), ["repos/{owner}/{repo}/pulls/42/comments/101/replies"]);
  });
});

test("a pull request url names the repository in both endpoints and puts its hostname on every gh call", async () => {
  await assertPosix(async (shell) => {
    const { calls } = await runInRepo(shell, [`${GHE_URL}#discussion_r5`, "101", "<file>"]);
    assert.deepEqual(calls.map(endpointOf), [
      "repos/acme/widgets/pulls/42/comments",
      "repos/acme/widgets/pulls/42/comments/101/replies",
    ]);
    assert.deepEqual(
      calls.map((c) => c[c.indexOf("--hostname") + 1]),
      ["ghe.example.com", "ghe.example.com"],
    );
  });
});

test("the body file stays under .temp/viber/pr-feedback/<N>/posted/<comment-id>.md after the post", async () => {
  await assertPosix(async (shell) => {
    const { kept } = await runInRepo(shell, ["42", "101", "<file>"]);
    assert.equal(kept, EXPECTED_BODY);
  });
});

// --- gh failure -------------------------------------------------------------------

function assertOneError(result: RunResult) {
  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, "");
  const lines = result.stderr.split("\n").filter((l) => l.length > 0);
  assert.equal(lines.length, 1, `expected a single ERROR line, got:\n${result.stderr}`);
  assert.match(lines[0], /^ERROR pr-reply\.sh: /);
}

test("gh failing on the comments read: exit 1, one ERROR line carrying gh's message, nothing on stdout, nothing posted", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, ["42", "101", "<file>"], { env: { READ_FAIL: "1" } });
    assertOneError(result);
    assert.match(result.stderr, /Bad credentials/);
    assert.equal(posts(calls).length, 0);
  });
});

test("gh failing on the post: exit 1, one ERROR line carrying gh's message, nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runInRepo(shell, ["42", "101", "<file>"], { env: { POST_FAIL: "1" } });
    assertOneError(result);
    assert.match(result.stderr, /server error/);
  });
});

const NO_URL: Array<[string, string]> = [
  ["nothing", ""],
  ["a pull request url without a discussion fragment", `${PR_URL}\n`],
  ["a non-numeric discussion id", `${PR_URL}#discussion_rabc\n`],
  ["the url of another pull request", "https://github.com/acme/widgets/pull/43#discussion_r777\n"],
];

for (const [name, out] of NO_URL) {
  test(`gh printing ${name} after the post: exit 1, one ERROR line, nothing on stdout`, async () => {
    await assertPosix(async (shell) => {
      const { result } = await runInRepo(shell, ["42", "101", "<file>"], { env: { POST_OUT: out } });
      assertOneError(result);
    });
  });
}

const ghOnCorePath = coreUtilsPath()
  .split(path.delimiter)
  .some((dir) => ["gh", "gh.exe"].some((n) => fs.existsSync(path.join(dir, n))));

test(
  "gh not on PATH: exit 1 with one ERROR line naming gh",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        fs.writeFileSync(path.join(repo.dir, "reply.md"), REPLY_TEXT);
        const result = await runScript(SUT, ["42", "101", "reply.md"], {
          shell,
          cwd: repo.dir,
          env: { ...repo.env, PATH: coreUtilsPath() },
        });
        assertOneError(result);
        assert.match(result.stderr, /gh not found on PATH/);
      });
    });
  },
);

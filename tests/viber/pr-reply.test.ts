/*
 * pr-reply.test.ts - proves viber/scripts/pr-reply.sh's
 * `pr-reply.sh <pull request> <remark key> <reply file>` contract against a
 * throwaway git repo and a stubbed `gh`: exit 2 with gh never called on a wrong
 * argument count, a malformed pull request reference, a key other than digits,
 * `comment-<digits>` or `review-<digits>`, or a missing reply file;
 * STATUS=skip / REASON=exists with no POST when a reply to that thread already
 * opens with the viber marker for that id (a thread), or when a pull request
 * comment has the marker as its first line (a Conversation comment or a review
 * body); otherwise the marker line, a blank line and the reply file verbatim
 * posted to the comment's replies endpoint only (a thread), or the marker, the
 * quoted original, its link and the reply file posted to the issue comments
 * endpoint (another remark) - `--hostname` on every call for a URL, the
 * {owner}/{repo} placeholders for a bare number - STATUS=posted / REPLY_URL=,
 * the body file left under .temp; exit 1 with one ERROR line and an empty
 * stdout when gh fails, returns no well-formed comment URL or is absent.
 *
 * `pr-reply.sh --list <pull request>` reads the pr-feedback review.md of the cwd
 * and prints the ready and missing replies, the RUN line of the `--all` call and
 * the skip reasons no-review and none-ready with their SAY sentences, calling no
 * gh; exit 2 on a malformed pull request, exit 1 outside a git repository.
 *
 * `pr-reply.sh --all <pull request>` posts each ready reply of that review.md in
 * section order, once per key, and prints a POSTED=, SKIPPED= or FAILED= line each
 * (a failed post never repeated, the next reply still posted) and MISSING_COUNT=;
 * exit 1 with nothing posted when gh is absent, exit 2 on a malformed pull request
 * or with no review.md.
 *
 * pr-reply.sh is `#!/bin/sh`, so every case runs through forEachShell("posix",
 * ...) via opts.shell, never executed directly. `gh` is always a withStub, or
 * absent - this test never shells out to the real gh. The stub answers a thread
 * comments read with the lines `<in_reply_to_id> <first line of the body>`, an
 * issue comments read with the first body line of each comment, the original
 * remark read with its html_url and its first non-blank body line, the shapes
 * the script asks gh's own --jq for, and the POST with a URL.
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
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
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
const ISSUE_REPLY_URL = `${PR_URL}#issuecomment-888`;
const MARKER = "<!-- viber:pr-feedback 101 -->";
const REPLY_TEXT = "Fixed in abc123.\n\nThe guard now runs first.\r\nNo trailing newline";
const ORIGINAL_URL = `${PR_URL}#issuecomment-55`;
const ORIGINAL_QUOTE = "Please rename this helper";

/** A `gh` stub logging its argv one-arg-per-line (a "===" separator after each
 *  call) into `$ARGV_FILE`. A call with `-X` is the POST: it copies the file of
 *  its `-F body=@<file>` into `$BODY_LOG`, then fails on POST_FAIL or prints
 *  POST_OUT (default: a review comment URL, or an issue comment URL when the POST
 *  goes to the issue comments endpoint). A read of an issue comment or a review
 *  prints ORIGINAL or fails on ORIGINAL_FAIL. Any other call is the comments
 *  read: it prints COMMENTS or fails on READ_FAIL. */
const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
post=""
kind=""
endpoint=""
for a in "$@"; do
  if [ "$a" = "-X" ]; then post=yes; fi
  case $a in repos/*) endpoint=$a ;; esac
  case $a in
    body=@*) cat "\${a#body=@}" > "$BODY_LOG" ;;
    repos/*/issues/comments/*|repos/*/pulls/*/reviews/*) kind=original ;;
    repos/*/issues/*/comments) kind=issues ;;
  esac
done
if [ -n "$post" ]; then
  if [ -n "\${POST_FAIL:-}" ]; then echo "HTTP 500: server error" >&2; exit 1; fi
  if [ -n "\${POST_FAIL_ON:-}" ]; then
    case $endpoint in *"$POST_FAIL_ON"*) echo "HTTP 500: server error" >&2; exit 1 ;; esac
  fi
  if [ "\${POST_OUT+set}" = set ]; then printf '%s' "$POST_OUT"; exit 0; fi
  if [ "$kind" = issues ]; then printf '%s\\n' "${ISSUE_REPLY_URL}"; else printf '%s\\n' "${REPLY_URL}"; fi
  exit 0
fi
if [ "$kind" = original ]; then
  if [ -n "\${ORIGINAL_FAIL:-}" ]; then echo "HTTP 404: Not Found" >&2; exit 1; fi
  printf '%s' "\${ORIGINAL:-}"
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
  /** The content of .temp/viber/pr-feedback/42/posted/<key>.md after the run (null when absent). */
  kept: string | null;
}

interface RunOpts {
  env?: Record<string, string>;
  /** Write no reply file. */
  noFile?: boolean;
  /** The remark key whose kept body file is read back (default: the thread 101). */
  key?: string;
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
      const original = `${ORIGINAL_URL}\n${ORIGINAL_QUOTE}\n`;
      const env = { ...repo.env, ARGV_FILE: argvFile, BODY_LOG: bodyLog, ORIGINAL: original, ...opts.env };
      const result = await runScript(SUT, real, { shell, cwd: repo.dir, env, stubDirs: [stubDir] });
      const calls = fs
        .readFileSync(argvFile, "utf-8")
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      const body = fs.existsSync(bodyLog) ? fs.readFileSync(bodyLog, "utf-8") : null;
      const keptFile = path.join(repo.dir, `.temp/viber/pr-feedback/42/posted/${opts.key ?? "101"}.md`);
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
  ["a comment key without an id", ["42", "comment-", "<file>"]],
  ["a review key without an id", ["42", "review-", "<file>"]],
  ["a comment key with a non-numeric id", ["42", "comment-12x", "<file>"]],
  ["a comment key with two ids", ["42", "comment-12-3", "<file>"]],
  ["an unknown key prefix", ["42", "comments-12", "<file>"]],
  ["a capitalised key prefix", ["42", "Review-12", "<file>"]],
  ["a key with only a dash and an id", ["42", "-12", "<file>"]],
  ["a reply file that does not exist", ["42", "101", "missing.md"]],
  ["a reply file that does not exist for a remark key", ["42", "comment-55", "missing.md"]],
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
    assert.equal(result.stdout, "STATUS=skip\nREASON=exists\nSAY=The item already holds a viber reply.\n");
    assert.equal(posts(calls).length, 0);
  });
});

test("a thread whose newest reply is the marker, after an older reviewer follow-up, still prints STATUS=skip and REASON=exists and posts nothing", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, ["42", "101", "<file>"], {
      env: { COMMENTS: `null Please fix\n101 ${MARKER}\n101 One more thing\n101 ${MARKER}\n` },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "STATUS=skip\nREASON=exists\nSAY=The item already holds a viber reply.\n");
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

// --- remarks: a Conversation comment or a review body --------------------------------

const REMARKS: Array<[string, string, string]> = [
  ["comment-55", "repos/{owner}/{repo}/issues/comments/55", ORIGINAL_URL],
  ["review-9", "repos/{owner}/{repo}/pulls/42/reviews/9", `${PR_URL}#pullrequestreview-9`],
];

const remarkMarker = (key: string) => `<!-- viber:pr-feedback ${key} -->`;
const remarkBody = (key: string, url: string) =>
  `${remarkMarker(key)}\n\n> ${ORIGINAL_QUOTE}\n\n${url}\n\n${REPLY_TEXT}`;
const originalOf = (url: string) => `${url}\n${ORIGINAL_QUOTE}\n`;

for (const [key, originalEndpoint, url] of REMARKS) {
  test(`${key}: a pull request comment opening with its marker prints STATUS=skip and REASON=exists and posts nothing`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runInRepo(shell, ["42", key, "<file>"], {
        env: { COMMENTS: `Looks good\r\n${remarkMarker(key)}\r\n` },
      });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "STATUS=skip\nREASON=exists\nSAY=The item already holds a viber reply.\n");
      assert.equal(posts(calls).length, 0);
    });
  });

  test(`${key}: the posted body is the marker, the quoted first line of the original, its link and the reply file verbatim, kept under posted/${key}.md`, async () => {
    await assertPosix(async (shell) => {
      const { result, body, kept } = await runInRepo(shell, ["42", key, "<file>"], {
        key,
        env: { ORIGINAL: originalOf(url) },
      });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(body, remarkBody(key, url));
      assert.equal(kept, remarkBody(key, url));
    });
  });

  test(`${key}: stdout is STATUS=posted plus a reply url ending in #issuecomment-<digits>`, async () => {
    await assertPosix(async (shell) => {
      const { result } = await runInRepo(shell, ["42", key, "<file>"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `STATUS=posted\nREPLY_URL=${ISSUE_REPLY_URL}\n`);
    });
  });

  test(`${key}: reads the pull request comments and the original, then posts one comment to the issue comments endpoint, through the repository placeholders with no hostname`, async () => {
    await assertPosix(async (shell) => {
      const { calls } = await runInRepo(shell, ["42", key, "<file>"]);
      assert.deepEqual(reads(calls).map(endpointOf), ["repos/{owner}/{repo}/issues/42/comments", originalEndpoint]);
      assert.deepEqual(posts(calls).map(endpointOf), ["repos/{owner}/{repo}/issues/42/comments"]);
      assert.equal(calls.flat().includes("--hostname"), false);
    });
  });

  test(`${key}: a pull request url names the repository in every endpoint and puts its hostname on every gh call`, async () => {
    await assertPosix(async (shell) => {
      const { calls } = await runInRepo(shell, [GHE_URL, key, "<file>"]);
      assert.deepEqual(
        calls.map(endpointOf),
        [
          "repos/acme/widgets/issues/42/comments",
          originalEndpoint.replace("{owner}/{repo}", "acme/widgets"),
          "repos/acme/widgets/issues/42/comments",
        ],
      );
      assert.deepEqual(
        calls.map((c) => c[c.indexOf("--hostname") + 1]),
        ["ghe.example.com", "ghe.example.com", "ghe.example.com"],
      );
    });
  });

  test(`${key}: a failed read of the original exits 1 with one ERROR line, nothing on stdout and nothing posted`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runInRepo(shell, ["42", key, "<file>"], { env: { ORIGINAL_FAIL: "1" } });
      assertOneError(result);
      assert.match(result.stderr, /Not Found/);
      assert.equal(posts(calls).length, 0);
    });
  });

  test(`${key}: a failed read of the pull request comments exits 1 with one ERROR line and nothing posted`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runInRepo(shell, ["42", key, "<file>"], { env: { READ_FAIL: "1" } });
      assertOneError(result);
      assert.match(result.stderr, /Bad credentials/);
      assert.equal(posts(calls).length, 0);
    });
  });

  test(`${key}: a failed post exits 1 with one ERROR line and nothing on stdout`, async () => {
    await assertPosix(async (shell) => {
      const { result } = await runInRepo(shell, ["42", key, "<file>"], { env: { POST_FAIL: "1" } });
      assertOneError(result);
      assert.match(result.stderr, /server error/);
    });
  });

  test(`${key}: an original read that returns no link exits 1 with one ERROR line and nothing posted`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runInRepo(shell, ["42", key, "<file>"], { env: { ORIGINAL: "" } });
      assertOneError(result);
      assert.equal(posts(calls).length, 0);
    });
  });
}

const REMARK_NOT_A_SKIP: Array<[string, string]> = [
  ["the marker names another remark", `${remarkMarker("comment-56")}\n`],
  ["the marker names the thread of the same number", `${remarkMarker("55")}\n`],
  ["a comment opens with another line before the marker", `I disagree, see ${remarkMarker("comment-55")}\n`],
  ["the pull request has no comment", ""],
];

for (const [name, comments] of REMARK_NOT_A_SKIP) {
  test(`comment-55: ${name}, so the reply is posted`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runInRepo(shell, ["42", "comment-55", "<file>"], { env: { COMMENTS: comments } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(posts(calls).length, 1);
    });
  });
}

const REMARK_NO_URL: Array<[string, string]> = [
  ["nothing", ""],
  ["a thread reply url", `${PR_URL}#discussion_r777\n`],
  ["a non-numeric comment id", `${PR_URL}#issuecomment-abc\n`],
  ["the url of another pull request", "https://github.com/acme/widgets/pull/43#issuecomment-888\n"],
];

for (const [name, out] of REMARK_NO_URL) {
  test(`comment-55: gh printing ${name} after the post: exit 1, one ERROR line, nothing on stdout`, async () => {
    await assertPosix(async (shell) => {
      const { result } = await runInRepo(shell, ["42", "comment-55", "<file>"], { env: { POST_OUT: out } });
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

// --- --list: the ready and missing replies of a review.md ----------------------------

interface Item {
  k: number;
  where: string;
  key: string;
  /** Whether the section's reply file exists. */
  ready: boolean;
}

interface ListOpts {
  /** The items of the review.md; absent writes no review.md. */
  items?: Item[];
  /** The pull request number whose pr-feedback directory holds the review. */
  n?: number;
  /** The script to run (default: the shipped one). */
  script?: string;
  /** The mode flag (default: --list). */
  flag?: string;
  /** Extra environment of the run (the gh stub's controls). */
  env?: Record<string, string>;
}

interface ListOutcome {
  result: RunResult;
  /** The length of the gh stub's argv log: 0 when gh was never called. */
  calls: number;
  /** The gh calls of the run, one argv per call. */
  argv: string[][];
}

const sectionOf = (dir: string, n: number, item: Item) =>
  [
    `## ${item.k} - problem - ${item.where}`,
    `- Kind: ${item.key.startsWith("comment-") ? "conversation" : "thread"}`,
    `- Comment: ${item.key}`,
    `- Reply file: ${dir}/.temp/viber/pr-feedback/${n}/replies/${item.key}.md`,
    "- Expected: rename the helper",
    "",
    "> Please rename this helper",
    "",
  ].join("\n");

/** Runs `pr-reply.sh --list <pr>` in a fresh repo whose review.md holds `items`
 *  (a reply file written for each ready one), the gh stub first on PATH. */
async function runList(shell: Shell, pr: string, opts: ListOpts = {}): Promise<ListOutcome> {
  const n = opts.n ?? 42;
  return await withGitRepo((repo) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      const dir = slash(repo.dir);
      const argvFile = path.join(repo.dir, "argv.log");
      fs.writeFileSync(argvFile, "");
      if (opts.items) {
        const feedback = path.join(repo.dir, `.temp/viber/pr-feedback/${n}`);
        fs.mkdirSync(path.join(feedback, "replies"), { recursive: true });
        fs.writeFileSync(
          path.join(feedback, "review.md"),
          `# Review of pull request ${n}\n\n${opts.items.map((item) => sectionOf(dir, n, item)).join("\n")}`,
        );
        for (const item of opts.items) {
          if (item.ready) fs.writeFileSync(path.join(feedback, `replies/${item.key}.md`), "Done.\n");
        }
      }
      const env = {
        ...repo.env,
        ARGV_FILE: argvFile,
        BODY_LOG: path.join(repo.dir, "body.log"),
        ORIGINAL: `${ORIGINAL_URL}\n${ORIGINAL_QUOTE}\n`,
        ...opts.env,
      };
      const result = await runScript(opts.script ?? SUT, [opts.flag ?? "--list", pr], {
        shell,
        cwd: repo.dir,
        env,
        stubDirs: [stubDir],
      });
      const logged = fs.readFileSync(argvFile, "utf-8");
      const argv = logged
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      return { result, calls: logged.length, argv };
    }),
  );
}

const PLUGIN_ROOT = slash(path.resolve(import.meta.dirname, "../../viber"));
const THREE_ITEMS: Item[] = [
  { k: 1, where: "src/a.ts:10", key: "101", ready: true },
  { k: 2, where: "review", key: "review-9", ready: false },
  { k: 3, where: "conversation", key: "comment-55", ready: true },
];

test("--list of a review.md with three items, two holding a reply file, prints STATUS=ready, the two READY lines, the MISSING line and the RUN line, in section order", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runList(shell, "42", { items: THREE_ITEMS });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      slash(result.stdout),
      [
        "STATUS=ready",
        "READY=1 - src/a.ts:10 - 101",
        "READY=3 - conversation - comment-55",
        "MISSING=2 - review - review-9",
        `RUN="${PLUGIN_ROOT}/scripts/pr-reply.sh" --all "42"`,
        "",
      ].join("\n"),
    );
  });
});

test("--list calls no gh", async () => {
  await assertPosix(async (shell) => {
    const { calls } = await runList(shell, "42", { items: THREE_ITEMS });
    assert.equal(calls, 0);
  });
});

test("--list of a review.md with no reply file prints the MISSING lines, REASON=none-ready and its SAY, and no RUN line", async () => {
  await assertPosix(async (shell) => {
    const items = THREE_ITEMS.map((item) => ({ ...item, ready: false }));
    const { result } = await runList(shell, "42", { items });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      [
        "STATUS=skip",
        "MISSING=1 - src/a.ts:10 - 101",
        "MISSING=2 - review - review-9",
        "MISSING=3 - conversation - comment-55",
        "REASON=none-ready",
        "SAY=No reply file is written yet.",
        "",
      ].join("\n"),
    );
  });
});

test("--list with no review.md prints REASON=no-review and its SAY", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runList(shell, "42");
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      "STATUS=skip\nREASON=no-review\nSAY=No /viber:pr-feedback run wrote a review file for this pull request.\n",
    );
  });
});

test("--list of a pull request url reads the review of its number, and the RUN line repeats the argument as given", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runList(shell, GHE_URL, { items: [THREE_ITEMS[0]] });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      slash(result.stdout),
      `STATUS=ready\nREADY=1 - src/a.ts:10 - 101\nRUN="${PLUGIN_ROOT}/scripts/pr-reply.sh" --all "${GHE_URL}"\n`,
    );
  });
});

const BAD_LIST_ARGS: Array<[string, string]> = [
  ["an empty pull request", ""],
  ["a word", "login"],
  ["an issue url", "https://github.com/acme/widgets/issues/42"],
  ["a pull request url with a non-numeric number", "https://github.com/acme/widgets/pull/x"],
];

for (const [name, pr] of BAD_LIST_ARGS) {
  test(`--list of ${name} exits 2 with the usage and nothing on stdout`, async () => {
    await assertPosix(async (shell) => {
      const { result } = await runList(shell, pr, { items: THREE_ITEMS });
      assert.equal(result.status, 2, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^ERROR pr-reply\.sh: usage: /m);
    });
  });
}

test("--list with no pull request exits 2 with the usage", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      const result = await runScript(SUT, ["--list"], { shell, cwd: repo.dir, env: repo.env });
      assert.equal(result.status, 2, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^ERROR pr-reply\.sh: usage: /m);
    });
  });
});

test("--list outside a git repository exits 1 with one ERROR line and nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("p2p2-pr-reply-", async (cwd) => {
      const result = await runScript(SUT, ["--list", "42"], { shell, cwd });
      assertOneError(result);
      assert.match(result.stderr, /not inside a git repository/);
    });
  });
});

test("--list prints the RUN path as the invoked path cut before /scripts/", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("p2p2-pr-reply-", async (plugin) => {
      fs.mkdirSync(path.join(plugin, "scripts"));
      const copy = path.join(plugin, "scripts/pr-reply.sh");
      fs.copyFileSync(SUT, copy);
      fs.copyFileSync(path.join(path.dirname(SUT), "plugin-root.sh"), path.join(plugin, "scripts/plugin-root.sh"));
      const { result } = await runList(shell, "42", { items: [THREE_ITEMS[0]], script: copy });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        slash(result.stdout),
        `STATUS=ready\nREADY=1 - src/a.ts:10 - 101\nRUN="${slash(plugin)}/scripts/pr-reply.sh" --all "42"\n`,
      );
    });
  });
});

// The invoked spelling is the contract: a C:\ or C:/ path is printed as C:/, a /c/ path as /c/.
// Neither spelling names a file outside Windows, so the cases skip there.
const WINDOWS_ONLY = process.platform === "win32" ? false : "a C:\\ or /c/ spelling names a file only on Windows";
const MSYS = (p: string) => slash(p).replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

const SPELLINGS: Array<{ label: string; invoked: string; root: string }> = [
  { label: "a C:\\ path", invoked: SUT, root: PLUGIN_ROOT },
  { label: "a C:/ path", invoked: slash(SUT), root: PLUGIN_ROOT },
  { label: "a /c/ path", invoked: MSYS(SUT), root: MSYS(PLUGIN_ROOT) },
];

for (const row of SPELLINGS) {
  test(`--list invoked by ${row.label} prints RUN= under the plugin root in that spelling (AC1)`, { skip: WINDOWS_ONLY }, async () => {
    await assertPosix(async (shell) => {
      const { result } = await runList(shell, "42", { items: [THREE_ITEMS[0]], script: row.invoked });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        `STATUS=ready\nREADY=1 - src/a.ts:10 - 101\nRUN="${row.root}/scripts/pr-reply.sh" --all "42"\n`,
      );
    });
  });
}

// --- --all: every ready reply of a review.md ---------------------------------------------

const SAY_EXISTS = "The item already holds a viber reply.";

test("--all with two ready replies and one missing prints a POSTED line each in section order and MISSING_COUNT=1", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runList(shell, "42", { items: THREE_ITEMS, flag: "--all" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      `POSTED=101 ${REPLY_URL}\nPOSTED=comment-55 ${ISSUE_REPLY_URL}\nMISSING_COUNT=1\n`,
    );
  });
});

test("--all of an item already replied prints its SKIPPED line with the exists sentence and posts nothing", async () => {
  await assertPosix(async (shell) => {
    const { result, argv } = await runList(shell, "42", {
      items: [THREE_ITEMS[0]],
      flag: "--all",
      env: { COMMENTS: `101 ${MARKER}\n` },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `SKIPPED=101 ${SAY_EXISTS}\nMISSING_COUNT=0\n`);
    assert.equal(posts(argv).length, 0);
  });
});

test("--all of a failed post prints its FAILED line with the error text, posts it once and still posts the next reply", async () => {
  await assertPosix(async (shell) => {
    const { result, argv } = await runList(shell, "42", {
      items: THREE_ITEMS,
      flag: "--all",
      env: { POST_FAIL_ON: "comments/101/replies" },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      `FAILED=101 gh api reply failed: HTTP 500: server error\nPOSTED=comment-55 ${ISSUE_REPLY_URL}\nMISSING_COUNT=1\n`,
    );
    assert.deepEqual(posts(argv).map(endpointOf), [
      "repos/{owner}/{repo}/pulls/42/comments/101/replies",
      "repos/{owner}/{repo}/issues/42/comments",
    ]);
  });
});

test(
  "--all with no gh on PATH exits 1 with one ERROR line naming gh and nothing on stdout, and posts nothing",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        const feedback = path.join(repo.dir, ".temp/viber/pr-feedback/42");
        fs.mkdirSync(path.join(feedback, "replies"), { recursive: true });
        fs.writeFileSync(path.join(feedback, "replies/101.md"), "Done.\n");
        fs.writeFileSync(path.join(feedback, "review.md"), sectionOf(slash(repo.dir), 42, THREE_ITEMS[0]));
        const result = await runScript(SUT, ["--all", "42"], {
          shell,
          cwd: repo.dir,
          env: { ...repo.env, PATH: coreUtilsPath() },
        });
        assertOneError(result);
        assert.match(result.stderr, /gh not found on PATH/);
        assert.equal(fs.existsSync(path.join(feedback, "posted")), false);
      });
    });
  },
);

test(
  "--all with no gh on PATH outside a git repository exits 1 with the gh ERROR line, not the repository one, and nothing on stdout (gh is checked before the repository)",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await assertPosix(async (shell) => {
      await withTempDir("p2p2-pr-reply-", async (cwd) => {
        const result = await runScript(SUT, ["--all", "42"], { shell, cwd, env: { PATH: coreUtilsPath() } });
        assertOneError(result);
        assert.match(result.stderr, /^ERROR pr-reply\.sh: gh not found on PATH$/m);
      });
    });
  },
);

test("--all with gh on PATH outside a git repository exits 1 with the not-inside-a-git-repository ERROR line and nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    await withStub("gh", GH_STUB, async (stubDir) => {
      await withTempDir("p2p2-pr-reply-", async (cwd) => {
        const result = await runScript(SUT, ["--all", "42"], { shell, cwd, stubDirs: [stubDir] });
        assertOneError(result);
        assert.match(result.stderr, /not inside a git repository/);
      });
    });
  });
});

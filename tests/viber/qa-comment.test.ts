/*
 * qa-comment.test.ts - proves viber/scripts/qa-comment.sh's
 * `qa-comment.sh <qa file path> [--pr <pull request URL>]` contract against a
 * throwaway git repo and a stubbed `gh`: the posted body (marker line, header
 * line, empty line, the file verbatim) and the STATUS=posted / COMMENT_URL=
 * block, the target taken from the `issue:` of the spec.md beside the qa
 * file whenever it names one (--pr then ignored), else from --pr, else from
 * the open pull request of the current branch, every STATUS=skip reason
 * (no-gh, no-repo, no-pr, exists),
 * exit 1 with one ERROR line and an empty stdout when gh fails reading the
 * comments or posting, or prints no comment URL, a relative path resolved
 * from the repository root, and exit 2 on bad arguments or a missing file.
 *
 * qa-comment.sh is `#!/bin/sh`, so every case runs through
 * forEachShell("posix", ...) via opts.shell, never executed directly. `gh` is
 * always a withStub (`pr list`, `pr|issue view` and `pr|issue comment`
 * answered from env),
 * or absent - this test never shells out to the real gh.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/qa-comment.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/qa-comment.sh");

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

const KEY = "2026-01-01-00-00-00_thing";
const QA_REL = `docs/_specs/${KEY}/qa.md`;
const QA_TEXT = "# Thing\n\n## What changed\nA person can now post.\n\n| # | Step | Expected result |\n| --- | --- | --- |\n";
const PR_URL = "https://github.com/acme/widgets/pull/7";
const COMMENT_URL = `${PR_URL}#issuecomment-99`;
const ISSUE_URL = "https://github.com/acme/widgets/issues/12";
const ISSUE_COMMENT_URL = `${ISSUE_URL}#issuecomment-55`;

/** A `gh` stub logging its argv one-arg-per-line (a "===" separator after
 *  each call) into `$ARGV_FILE`. `pr list` prints the raw `--jq` rows the script
 *  asks for, `<isCrossRepository> <url>`: one `true` row per URL of
 *  PR_FORK_LIST, then one `false` row per URL of PR_LIST; `pr|issue view`
 *  prints COMMENTS or fails on VIEW_FAIL; `pr|issue comment` copies its
 *  --body-file into `$BODY_LOG`, then fails on POST_FAIL or prints POST_OUT
 *  (default: a pull request comment URL). */
const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
case "$1 $2" in
  "pr list")
    for u in \${PR_FORK_LIST:-}; do printf 'true %s\\n' "$u"; done
    for u in \${PR_LIST:-}; do printf 'false %s\\n' "$u"; done ;;
  "pr view"|"issue view")
    if [ -n "\${VIEW_FAIL:-}" ]; then echo "HTTP 401: Bad credentials" >&2; exit 1; fi
    printf '%s' "\${COMMENTS:-}" ;;
  "pr comment"|"issue comment")
    prev=""
    for a in "$@"; do
      if [ "$prev" = "--body-file" ]; then cat "$a" > "$BODY_LOG"; fi
      prev=$a
    done
    if [ -n "\${POST_FAIL:-}" ]; then echo "HTTP 500: server error" >&2; exit 1; fi
    printf '%s\\n' "\${POST_OUT-${COMMENT_URL}}" ;;
esac
exit 0
`;

interface Outcome {
  result: RunResult;
  calls: string[][];
  body: string | null;
}

interface RunOpts {
  env?: Record<string, string>;
  /** Repo-relative directory the script runs in (default: the repo root). */
  cwd?: string;
  /** Runs after the qa file is written, before the script. */
  setup?: (repo: GitRepo) => Promise<void>;
  /** Write no qa file. */
  noFile?: boolean;
}

/** Runs qa-comment.sh inside a fresh repo holding QA_REL, with the gh stub
 *  first on PATH. Returns the result, every logged gh call and the body gh
 *  was handed (null when nothing was posted). */
async function runInRepo(shell: Shell, args: string[], opts: RunOpts = {}): Promise<Outcome> {
  return await withGitRepo((repo) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      if (!opts.noFile) {
        fs.mkdirSync(path.join(repo.dir, path.dirname(QA_REL)), { recursive: true });
        fs.writeFileSync(path.join(repo.dir, QA_REL), QA_TEXT);
      }
      if (opts.setup) await opts.setup(repo);
      const argvFile = path.join(repo.dir, "argv.log");
      const bodyLog = path.join(repo.dir, "body.log");
      fs.writeFileSync(argvFile, "");
      const cwd = path.join(repo.dir, opts.cwd ?? "");
      fs.mkdirSync(cwd, { recursive: true });
      const env = { ...repo.env, ARGV_FILE: argvFile, BODY_LOG: bodyLog, ...opts.env };
      const result = await runScript(SUT, args, { shell, cwd, env, stubDirs: [stubDir] });
      const calls = fs
        .readFileSync(argvFile, "utf-8")
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      const body = fs.existsSync(bodyLog) ? fs.readFileSync(bodyLog, "utf-8") : null;
      return { result, calls, body };
    }),
  );
}

function posts(calls: string[][]): string[][] {
  return calls.filter((c) => c[1] === "comment");
}

/** A setup writing the run's spec.md beside the qa file with `text` as its content. */
function specWith(text: string): (repo: GitRepo) => Promise<void> {
  return async (repo) => {
    fs.writeFileSync(path.join(repo.dir, path.dirname(QA_REL), "spec.md"), text);
  };
}

const SPEC_WITH_ISSUE = `---\r\nissue: ${ISSUE_URL}\r\n---\r\n\r\n# Thing\n`;

const EXPECTED_BODY = `<!-- viber:qa ${QA_REL} -->\nQA document: \`${QA_REL}\`\n\n${QA_TEXT}`;

// --- posting ----------------------------------------------------------------------

test("with --pr, the body is the marker line, the header line, an empty line and the qa file verbatim, and stdout is STATUS=posted plus the comment URL", async () => {
  await assertPosix(async (shell) => {
    const { result, calls, body } = await runInRepo(shell, [QA_REL, "--pr", PR_URL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `STATUS=posted\nCOMMENT_URL=${COMMENT_URL}\n`);
    assert.equal(body, EXPECTED_BODY);
    assert.equal(posts(calls)[0][2], PR_URL);
  });
});

test("a relative qa file path resolves from the repository root when the script runs in a subdirectory", async () => {
  await assertPosix(async (shell) => {
    const { result, body } = await runInRepo(shell, [QA_REL, "--pr", PR_URL], { cwd: "src/deep" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(body, EXPECTED_BODY);
  });
});

// --- target -----------------------------------------------------------------------

test("a run whose spec.md names an issue posts on that issue, never asking for a pull request, and stdout carries the issue comment URL", async () => {
  await assertPosix(async (shell) => {
    const { result, calls, body } = await runInRepo(shell, [QA_REL], {
      env: { PR_LIST: `${PR_URL}\n`, POST_OUT: ISSUE_COMMENT_URL },
      setup: specWith(SPEC_WITH_ISSUE),
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `STATUS=posted\nCOMMENT_URL=${ISSUE_COMMENT_URL}\n`);
    assert.equal(body, EXPECTED_BODY);
    assert.deepEqual(posts(calls).map((c) => c.slice(0, 3)), [["issue", "comment", ISSUE_URL]]);
    assert.ok(!calls.some((c) => c[0] === "pr"), "no pull request call when the run has an issue");
  });
});

test("a run with an issue ignores --pr and posts on the issue (pr-create and the build close reach the same target)", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL, "--pr", PR_URL], {
      env: { POST_OUT: ISSUE_COMMENT_URL },
      setup: specWith(SPEC_WITH_ISSUE),
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `STATUS=posted\nCOMMENT_URL=${ISSUE_COMMENT_URL}\n`);
    assert.deepEqual(posts(calls).map((c) => c.slice(0, 3)), [["issue", "comment", ISSUE_URL]]);
  });
});

test("an issue: written as #<N> targets issue <N>, and a URL fragment is dropped", async () => {
  await assertPosix(async (shell) => {
    for (const [value, expected] of [["#12", "12"], [`${ISSUE_URL}#top`, ISSUE_URL]]) {
      const { result, calls } = await runInRepo(shell, [QA_REL], {
        env: { POST_OUT: ISSUE_COMMENT_URL },
        setup: specWith(`---\nissue: ${value}\n---\n`),
      });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(posts(calls)[0]?.[2], expected);
    }
  });
});

test("a spec.md with no issue: in its frontmatter falls back to the pull request (an issue: in the body is not the run's issue)", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL, "--pr", PR_URL], {
      setup: specWith(`# Thing\n\nissue: ${ISSUE_URL}\n`),
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `STATUS=posted\nCOMMENT_URL=${COMMENT_URL}\n`);
    assert.deepEqual(posts(calls).map((c) => c.slice(0, 3)), [["pr", "comment", PR_URL]]);
  });
});

test("an issue comment holding a marker of the same run key: STATUS=skip REASON=exists and no post", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL], {
      env: { COMMENTS: `<!-- viber:qa ${QA_REL} -->\nQA document\n` },
      setup: specWith(SPEC_WITH_ISSUE),
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "STATUS=skip\nREASON=exists\n");
    assert.equal(posts(calls).length, 0);
  });
});

test("posting on an issue but gh printing a pull request comment URL: exit 1, one ERROR line, empty stdout (the URL must name the target)", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runInRepo(shell, [QA_REL], { setup: specWith(SPEC_WITH_ISSUE) });
    assertOneError(result);
  });
});

test("without --pr, the open pull request whose head is the current branch is the target", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL], {
      env: { PR_LIST: `${PR_URL}\n` },
      setup: async (repo) => {
        await repo.git("checkout", "-q", "-b", "feature/x");
      },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `STATUS=posted\nCOMMENT_URL=${COMMENT_URL}\n`);
    const list = calls.find((c) => c[0] === "pr" && c[1] === "list");
    assert.deepEqual(list?.slice(2, 6), ["--head", "feature/x", "--state", "open"]);
    assert.equal(posts(calls)[0][2], PR_URL);
  });
});

test("without --pr, a fork pull request whose head is the current branch name alone: STATUS=skip REASON=no-pr and no post (a cross-repository head of the same name is not this branch)", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL], {
      env: { PR_FORK_LIST: "https://github.com/acme/widgets/pull/3" },
      setup: async (repo) => {
        await repo.git("checkout", "-q", "-b", "feature/x");
      },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "STATUS=skip\nREASON=no-pr\n");
    assert.equal(posts(calls).length, 0);
  });
});

test("without --pr, a fork pull request listed before a same-repository one: the comment goes to the same-repository one", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL], {
      env: { PR_FORK_LIST: "https://github.com/acme/widgets/pull/3", PR_LIST: PR_URL },
      setup: async (repo) => {
        await repo.git("checkout", "-q", "-b", "feature/x");
      },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `STATUS=posted\nCOMMENT_URL=${COMMENT_URL}\n`);
    assert.deepEqual(posts(calls).map((c) => c.slice(0, 3)), [["pr", "comment", PR_URL]]);
  });
});

test("without --pr and no open pull request for the current branch: STATUS=skip REASON=no-pr and no post", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "STATUS=skip\nREASON=no-pr\n");
    assert.equal(posts(calls).length, 0);
  });
});

test("without --pr on a detached HEAD: STATUS=skip REASON=no-pr and gh is never asked for a pull request", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL], {
      env: { PR_LIST: `${PR_URL}\n` },
      setup: async (repo) => {
        await repo.git("commit", "-q", "--allow-empty", "-m", "init");
        await repo.git("checkout", "-q", "--detach");
      },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "STATUS=skip\nREASON=no-pr\n");
    assert.equal(calls.length, 0);
  });
});

// --- one comment per run ----------------------------------------------------------

test("a comment holding a marker of the same run key under the archive directory: STATUS=skip REASON=exists and no post (the run was already posted before it was archived)", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL, "--pr", PR_URL], {
      env: { COMMENTS: `Looks good.\n<!-- viber:qa docs/specs/${KEY}/qa.md -->\nQA document: \`docs/specs/${KEY}/qa.md\`\n\n# Thing\n` },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "STATUS=skip\nREASON=exists\n");
    assert.equal(posts(calls).length, 0);
  });
});

test("a comment holding a marker of another run key, even one ending in this key, still posts", async () => {
  await assertPosix(async (shell) => {
    const { result, body } = await runInRepo(shell, [QA_REL, "--pr", PR_URL], {
      env: { COMMENTS: `<!-- viber:qa docs/_specs/old_${KEY}/qa.md -->\nQA document\n` },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `STATUS=posted\nCOMMENT_URL=${COMMENT_URL}\n`);
    assert.equal(body, EXPECTED_BODY);
  });
});

// --- no gh, no repository ---------------------------------------------------------

/** coreUtilsPath() plus the directory that resolves the real `git` binary:
 *  Git for Windows keeps git.exe apart from grep and bash, and the script
 *  must find the repository before it looks for gh. */
function pathWithGit(): string {
  const exe = (name: string) => (process.platform === "win32" ? [`${name}.exe`, name] : [name]);
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const gitDir = dirs.find((dir) => exe("git").some((n) => fs.existsSync(path.join(dir, n))));
  if (!gitDir) throw new Error("qa-comment.test.ts: no directory on PATH resolves git");
  return [coreUtilsPath(), gitDir].join(path.delimiter);
}

const NO_GH_PATH = pathWithGit();
const ghOnCorePath = NO_GH_PATH
  .split(path.delimiter)
  .some((dir) => ["gh", "gh.exe"].some((n) => fs.existsSync(path.join(dir, n))));

test(
  "gh not on PATH: STATUS=skip REASON=no-gh",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        fs.mkdirSync(path.join(repo.dir, path.dirname(QA_REL)), { recursive: true });
        fs.writeFileSync(path.join(repo.dir, QA_REL), QA_TEXT);
        const result = await runScript(SUT, [QA_REL, "--pr", PR_URL], { shell, cwd: repo.dir, env: { ...repo.env, PATH: NO_GH_PATH } });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(result.stdout, "STATUS=skip\nREASON=no-gh\n");
      });
    });
  },
);

test("run outside any repository: STATUS=skip REASON=no-repo and gh is never called", async () => {
  await assertPosix(async (shell) => {
    await withTempDir("p2p2-qa-comment-", (cwd) =>
      withStub("gh", GH_STUB, async (stubDir) => {
        const argvFile = path.join(cwd, "argv.log");
        fs.writeFileSync(argvFile, "");
        fs.writeFileSync(path.join(cwd, "qa.md"), QA_TEXT);
        const result = await runScript(SUT, ["qa.md", "--pr", PR_URL], { shell, cwd, env: { ARGV_FILE: argvFile }, stubDirs: [stubDir] });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(result.stdout, "STATUS=skip\nREASON=no-repo\n");
        assert.equal(fs.readFileSync(argvFile, "utf-8"), "");
      }),
    );
  });
});

// --- gh failures ------------------------------------------------------------------

function assertOneError(result: RunResult) {
  assert.equal(result.status, 1, `stdout: ${result.stdout}`);
  assert.equal(result.stdout, "");
  const lines = result.stderr.split("\n").filter((l) => l.length > 0);
  assert.equal(lines.length, 1, `expected a single ERROR line, got:\n${result.stderr}`);
  assert.match(lines[0], /^ERROR qa-comment\.sh: /);
}

test("gh failing to read the comments: exit 1, one ERROR line, empty stdout and no post", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL, "--pr", PR_URL], { env: { VIEW_FAIL: "1" } });
    assertOneError(result);
    assert.equal(posts(calls).length, 0);
  });
});

test("gh failing to post: exit 1, one ERROR line, empty stdout", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runInRepo(shell, [QA_REL, "--pr", PR_URL], { env: { POST_FAIL: "1" } });
    assertOneError(result);
  });
});

test("gh posting but printing no comment URL: exit 1, one ERROR line, empty stdout (a pull request URL alone is not proof a comment landed)", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runInRepo(shell, [QA_REL, "--pr", PR_URL], { env: { POST_OUT: PR_URL } });
    assertOneError(result);
  });
});

// --- bad arguments ----------------------------------------------------------------

test("a qa file that does not exist: exit 2 and nothing is posted", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, [QA_REL, "--pr", PR_URL], { noFile: true });
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /^ERROR qa-comment\.sh: qa file not found: /);
    assert.equal(result.stdout, "");
    assert.equal(posts(calls).length, 0);
  });
});

test(
  "a qa file that does not exist with gh not on PATH: exit 2, not STATUS=skip REASON=no-gh (a wrong path must not hide behind a normal skip)",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        const result = await runScript(SUT, [QA_REL, "--pr", PR_URL], { shell, cwd: repo.dir, env: { ...repo.env, PATH: NO_GH_PATH } });
        assert.equal(result.status, 2, `stdout: ${result.stdout}`);
        assert.match(result.stderr, /^ERROR qa-comment\.sh: qa file not found: /);
        assert.equal(result.stdout, "");
      });
    });
  },
);

const BAD_ARGS: [string, string[]][] = [
  ["no argument", []],
  ["--pr with no value", [QA_REL, "--pr"]],
  ["an unknown flag", [QA_REL, "--issue", PR_URL]],
  ["an extra argument", [QA_REL, "--pr", PR_URL, "extra"]],
  ["--pr naming an issue, not a pull request", [QA_REL, "--pr", "https://github.com/acme/widgets/issues/7"]],
  ["--pr naming no repository", [QA_REL, "--pr", "https://github.com/acme/pull/7"]],
];

for (const [label, args] of BAD_ARGS) {
  test(`bad arguments (${label}): exit 2 and gh is never called`, async () => {
    await assertPosix(async (shell) => {
      const { result, calls } = await runInRepo(shell, args);
      assert.equal(result.status, 2, `stderr: ${result.stderr}`);
      assert.match(result.stderr, /^ERROR qa-comment\.sh: usage: /);
      assert.equal(result.stdout, "");
      assert.equal(calls.length, 0);
    });
  });
}

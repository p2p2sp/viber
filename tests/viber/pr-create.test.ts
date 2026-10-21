/*
 * pr-create.test.ts - proves viber/scripts/pr-create.sh's
 * `pr-create.sh <body file> <title> --base <branch> [--draft]` contract
 * against a real throwaway work repo pushing to a real bare remote and a
 * stubbed `gh`: the branch is pushed with its upstream set (to
 * `branch.<branch>.remote`, else origin) before `gh pr create` runs with base,
 * head, title and `--body-file` (plus `--draft` on request), the new pull
 * request is assigned to `@me` (a refusal reads ASSIGNEE=dropped, still exit
 * 0), a success prints PR_URL/PR_NUMBER/PUSHED/ASSIGNEE and removes the body file, a failed push exits 1 before gh runs, a gh failure
 * exits 1 naming the branch as pushed and keeps the body file, and bad arguments, a detached HEAD or
 * a missing gh exit 2 with nothing pushed.
 *
 * pr-create.sh is `#!/bin/sh`, so every case runs through
 * forEachShell("posix", ...) via opts.shell, never executed directly. `gh` is
 * always a withStub, or absent - this test never shells out to the real gh.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/pr-create.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/pr-create.sh");

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

const PR_URL = "https://github.com/acme/widgets/pull/17";

/** A `gh` stub logging every call's argv one-arg-per-line (a "===" separator
 *  after each) into `$ARGV_FILE`, answering `pr edit` with EDIT_EXIT and
 *  `pr create` from PR_STDOUT/PR_STDERR/PR_EXIT. */
const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
if [ "$2" = edit ]; then exit "\${EDIT_EXIT:-0}"; fi
if [ -n "\${PR_STDERR:-}" ]; then printf '%s' "$PR_STDERR" >&2; fi
printf '%s' "\${PR_STDOUT:-}"
exit "\${PR_EXIT:-0}"
`;

interface Scene {
  work: GitRepo;
  remote: GitRepo;
  body: string;
  stubDir: string;
  argvFile: string;
}

/** A work repo on branch `feature/x` with one commit and `origin` pointing at
 *  an empty bare repo, plus a fresh gh stub dir. */
async function withScene<T>(fn: (scene: Scene) => Promise<T>): Promise<T> {
  return await withGitRepo(
    (remote) =>
      withGitRepo((work) =>
        withStub("gh", GH_STUB, async (stubDir) => {
          await work.git("remote", "add", "origin", remote.dir);
          await work.git("commit", "--allow-empty", "-m", "first");
          await work.git("checkout", "-b", "feature/x");
          const body = path.join(work.dir, "body.md");
          fs.writeFileSync(body, "## Summary\n\nLine one.\n");
          const argvFile = path.join(work.dir, "argv.log");
          fs.writeFileSync(argvFile, "");
          return await fn({ work, remote, body, stubDir, argvFile });
        }),
      ),
    { bare: true },
  );
}

async function runPr(
  shell: Shell,
  scene: Scene,
  args: string[],
  opts: { env?: Record<string, string>; noGh?: boolean } = {},
): Promise<{ result: RunResult; calls: string[][] }> {
  const real = args.map((a) => (a === "<body>" ? scene.body : a));
  const env = { ...scene.work.env, ARGV_FILE: scene.argvFile, ...(opts.noGh ? { PATH: coreUtilsPath() } : {}), ...opts.env };
  const result = await runScript(SUT, real, {
    shell,
    cwd: scene.work.dir,
    env,
    stubDirs: opts.noGh ? [] : [scene.stubDir],
  });
  const calls = fs
    .readFileSync(scene.argvFile, "utf-8")
    .split("===\n")
    .map((block) => block.split("\n").filter((line) => line.length > 0))
    .filter((call) => call.length > 0);
  return { result, calls };
}

async function remoteHeads(scene: Scene): Promise<string> {
  const heads = await scene.remote.git("for-each-ref", "--format=%(refname)", "refs/heads");
  return heads.stdout.trim();
}

// --- success ----------------------------------------------------------------------

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

test("--draft reaches gh pr create", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const { result, calls } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main", "--draft"], { env: { PR_STDOUT: PR_URL + "\n" } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].at(-1), "--draft");
    });
  });
});

test("the URL gh printed yields PR_URL and PR_NUMBER, the pushed remote branch follows as PUSHED and the assignment as ASSIGNEE", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const { result } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main"], {
        env: { PR_STDOUT: `Creating pull request for feature/x into main in acme/widgets\n\n${PR_URL}\n` },
      });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `PR_URL=${PR_URL}\nPR_NUMBER=17\nPUSHED=origin/feature/x\nASSIGNEE=@me\n`);
    });
  });
});

test("a refused assignment still exits 0 with ASSIGNEE=dropped (the pull request already exists and must not read as a failure)", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const { result } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main"], { env: { PR_STDOUT: PR_URL + "\n", EDIT_EXIT: "1" } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, `PR_URL=${PR_URL}\nPR_NUMBER=17\nPUSHED=origin/feature/x\nASSIGNEE=dropped\n`);
    });
  });
});

test("a branch whose branch.<name>.remote names another remote is pushed there and PUSHED names it", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await scene.work.git("remote", "rename", "origin", "upstream");
      await scene.work.git("config", "branch.feature/x.remote", "upstream");
      const { result } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main"], { env: { PR_STDOUT: PR_URL + "\n" } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `PR_URL=${PR_URL}\nPR_NUMBER=17\nPUSHED=upstream/feature/x\nASSIGNEE=@me\n`);
      assert.equal(await remoteHeads(scene), "refs/heads/feature/x");
    });
  });
});

test("a branch tracking a local branch (branch.<name>.remote is '.') is pushed to origin and PUSHED names origin", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await scene.work.git("checkout", "-b", "feat", "--track", "main");
      const { result } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main"], { env: { PR_STDOUT: PR_URL + "\n" } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `PR_URL=${PR_URL}\nPR_NUMBER=17\nPUSHED=origin/feat\nASSIGNEE=@me\n`);
      assert.equal(await remoteHeads(scene), "refs/heads/feat");
    });
  });
});

test("after a push of a branch that tracked a local branch, branch.<name>.remote reads origin and branch.<name>.merge its own ref", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await scene.work.git("checkout", "-b", "feat", "--track", "main");
      await runPr(shell, scene, ["<body>", "Add x", "--base", "main"], { env: { PR_STDOUT: PR_URL + "\n" } });
      const remote = await scene.work.git("config", "--get", "branch.feat.remote");
      const merge = await scene.work.git("config", "--get", "branch.feat.merge");
      assert.deepEqual([remote.stdout.trim(), merge.stdout.trim()], ["origin", "refs/heads/feat"]);
    });
  });
});

// --- failures after arguments are valid -------------------------------------------

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

// --- bad arguments, detached HEAD, gh missing: exit 2, nothing pushed ---------------

const BAD: { name: string; args: string[]; arrange?: (scene: Scene) => Promise<unknown>; error: RegExp }[] = [
  { name: "no arguments", args: [], error: /need <body file> <title>/ },
  { name: "a missing title", args: ["<body>"], error: /need <body file> <title>/ },
  { name: "a body file that does not exist", args: ["nope.md", "Add x", "--base", "main"], error: /body file not found: nope\.md$/ },
  { name: "no --base", args: ["<body>", "Add x"], error: /--base is required/ },
  { name: "a --base without a value", args: ["<body>", "Add x", "--base"], error: /--base needs a value/ },
  { name: "an unknown flag", args: ["<body>", "Add x", "--base", "main", "--bogus"], error: /unknown flag --bogus/ },
  {
    name: "a detached HEAD",
    args: ["<body>", "Add x", "--base", "main"],
    arrange: (scene) => scene.work.git("checkout", "--detach"),
    error: /detached HEAD/,
  },
];

for (const row of BAD) {
  test(`${row.name}: exit 2 with one ERROR line, gh never called and nothing pushed`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        await row.arrange?.(scene);
        const { result, calls } = await runPr(shell, scene, row.args);
        assert.equal(result.status, 2, `stderr: ${result.stderr}`);
        assert.equal(result.stdout, "");
        const lines = result.stderr.split("\n").filter((l) => l.length > 0);
        assert.equal(lines.length, 1, `expected a single ERROR line, got:\n${result.stderr}`);
        assert.match(lines[0], /^ERROR pr-create\.sh: /);
        assert.match(lines[0], row.error);
        assert.equal(calls.length, 0);
        assert.equal(await remoteHeads(scene), "");
      });
    });
  });
}

const ghOnCorePath = coreUtilsPath()
  .split(path.delimiter)
  .some((dir) => ["gh", "gh.exe"].some((n) => fs.existsSync(path.join(dir, n))));

test(
  "gh not on PATH: exit 2 with one ERROR line naming gh and nothing pushed",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        const { result } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main"], { noGh: true });
        assert.equal(result.status, 2, `stderr: ${result.stderr}`);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /^ERROR pr-create\.sh: gh not found on PATH$/m);
        assert.equal(await remoteHeads(scene), "");
      });
    });
  },
);

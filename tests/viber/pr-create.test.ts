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
 * a missing gh exit 2 with nothing pushed. With --issue the branch is created
 * linked to the issue (GraphQL createLinkedBranch at the merge base with
 * <remote>/<base>) before the push and LINK=linked follows; a branch already
 * on the remote or a failed link reads LINK=manual with LINK_REASON, the pull
 * request still created; no --issue reads LINK=none.
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
import { coreUtilsPath } from "../harness/stub.ts";
import { assertPosix, PR_URL, type Scene, withScene, runPr, remoteHeads } from "./pr-create-fixture.ts";

// --- success ----------------------------------------------------------------------

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
      assert.equal(result.stdout, `PR_URL=${PR_URL}\nPR_NUMBER=17\nPUSHED=origin/feature/x\nASSIGNEE=@me\nLINK=none\nLINK_REASON=\n`);
    });
  });
});

test("a refused assignment still exits 0 with ASSIGNEE=dropped (the pull request already exists and must not read as a failure)", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const { result } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main"], { env: { PR_STDOUT: PR_URL + "\n", EDIT_EXIT: "1" } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, `PR_URL=${PR_URL}\nPR_NUMBER=17\nPUSHED=origin/feature/x\nASSIGNEE=dropped\nLINK=none\nLINK_REASON=\n`);
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
      assert.equal(result.stdout, `PR_URL=${PR_URL}\nPR_NUMBER=17\nPUSHED=upstream/feature/x\nASSIGNEE=@me\nLINK=none\nLINK_REASON=\n`);
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
      assert.equal(result.stdout, `PR_URL=${PR_URL}\nPR_NUMBER=17\nPUSHED=origin/feat\nASSIGNEE=@me\nLINK=none\nLINK_REASON=\n`);
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

// --- --issue: the branch linked to its issue ----------------------------------------

const GRAPHQL_CALL = (sha: string) => [
  "api",
  "graphql",
  "-f",
  "query=mutation($r: ID!, $i: ID!, $o: GitObjectID!, $n: String!) { createLinkedBranch(input: {repositoryId: $r, issueId: $i, oid: $o, name: $n}) { linkedBranch { id } } }",
  "-f",
  "r=R_1",
  "-f",
  "i=I_1",
  "-f",
  `o=${sha}`,
  "-f",
  "n=feature/x",
  "--jq",
  ".data.createLinkedBranch.linkedBranch.id",
];

/** Pushes main so origin/main exists, then adds a commit on feature/x; returns main's sha. */
async function arrangeBase(scene: Scene): Promise<string> {
  await scene.work.git("push", "-q", "origin", "main");
  await scene.work.git("commit", "--allow-empty", "-m", "second");
  return (await scene.work.git("rev-parse", "main")).stdout.trim();
}

test("--issue on a branch not yet on the remote creates it linked to the issue at the merge base with <remote>/<base> before the push, and LINK=linked follows", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const sha = await arrangeBase(scene);
      const { result, calls } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main", "--issue", "7"], { env: { PR_STDOUT: PR_URL + "\n" } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(calls.slice(0, 3), [
        ["repo", "view", "--json", "id", "--jq", ".id"],
        ["issue", "view", "7", "--json", "id", "--jq", ".id"],
        GRAPHQL_CALL(sha),
      ]);
      assert.equal(calls[3][1], "create");
      assert.match(result.stdout, /\nLINK=linked\nLINK_REASON=\n$/);
    });
  });
});

test("--issue on a branch already on the remote skips the link, still opens the pull request and reads LINK=manual with the reason (an existing branch can no longer be linked)", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await arrangeBase(scene);
      await scene.work.git("push", "-q", "origin", "feature/x");
      const { result, calls } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main", "--issue", "7"], { env: { PR_STDOUT: PR_URL + "\n" } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(calls[0][1], "create");
      assert.match(result.stdout, /^PR_URL=/);
      assert.match(result.stdout, /\nLINK=manual\nLINK_REASON=branch feature\/x is already on origin\n$/);
    });
  });
});

const LINK_FAILURES: { name: string; env: Record<string, string> }[] = [
  { name: "a failed createLinkedBranch call", env: { LINK_EXIT: "1" } },
  { name: "a createLinkedBranch answer with no linked branch", env: { LINK_STDOUT: "" } },
];

for (const row of LINK_FAILURES) {
  test(`--issue with ${row.name} still pushes and opens the pull request, LINK=manual naming the issue`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        await arrangeBase(scene);
        const { result, calls } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main", "--issue", "7"], { env: { PR_STDOUT: PR_URL + "\n", ...row.env } });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(await remoteHeads(scene), "refs/heads/feature/x\nrefs/heads/main");
        assert.equal(calls[3][1], "create");
        assert.match(result.stdout, /\nLINK=manual\nLINK_REASON=createLinkedBranch linked no branch to issue #7\n$/);
      });
    });
  });
}

test("--issue with no <remote>/<base> tracking ref skips the link and reads LINK=manual naming the missing merge base", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const { result, calls } = await runPr(shell, scene, ["<body>", "Add x", "--base", "main", "--issue", "7"], { env: { PR_STDOUT: PR_URL + "\n" } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(calls[0][1], "create");
      assert.match(result.stdout, /\nLINK=manual\nLINK_REASON=no merge base with origin\/main\n$/);
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
  { name: "an --issue without a value", args: ["<body>", "Add x", "--base", "main", "--issue"], error: /--issue needs a value/ },
  { name: "an --issue that is not a number", args: ["<body>", "Add x", "--base", "main", "--issue", "#7"], error: /--issue is not a number: #7$/ },
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

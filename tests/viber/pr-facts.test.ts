/*
 * pr-facts.test.ts - proves viber/scripts/pr-facts.sh's
 * `pr-facts.sh [--entry <key> | --target <branch>]` contract against a real
 * throwaway work repo (with a real bare `origin`) and a stubbed `gh`: the stop
 * reasons in their order, the work entry resolved from an open run, one
 * matching branch name pattern, or a candidate list, the run (open, or the
 * archived one the commits touch), the template, TYPE, ISSUE, CLOSES,
 * TITLE_PATTERN and the commits ahead of the target.
 *
 * pr-facts.sh is `#!/bin/sh`, so every case runs through
 * forEachShell("posix", ...) via opts.shell, never executed directly. `gh` is
 * always a withStub (`repo view` and `pr list` answered from env), or absent -
 * this test never shells out to the real gh. Every fixture repo is built by
 * the case itself: `main` and `develop` at one commit, `origin` an empty bare
 * repo, the work branch cut from `main`.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/pr-facts.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/pr-facts.sh");

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

const REPO_URL = "https://github.com/acme/widgets";

/** A `gh` stub: `repo view` prints the repository URL then the default branch
 *  (or fails on REPO_FAIL), `pr list` prints PR_LIST. */
const GH_STUB = `
case "$1 $2" in
  "repo view")
    if [ -n "\${REPO_FAIL:-}" ]; then exit 1; fi
    printf '%s\\n' "${REPO_URL}" "\${DEFAULT_BRANCH:-main}" ;;
  "pr list")
    if [ -n "\${PR_FAIL:-}" ]; then exit 1; fi
    printf '%s' "\${PR_LIST:-}" ;;
esac
exit 0
`;

interface Scene {
  work: GitRepo;
  remote: GitRepo;
  stubDir: string;
}

async function commit(repo: GitRepo, files: Record<string, string>, message: string, ...more: string[]) {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo.dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, rel), content);
    await repo.git("add", "--", rel);
  }
  const msgs = [message, ...more].flatMap((m) => ["-m", m]);
  await repo.git("commit", "--allow-empty", ...msgs);
}

/** `main` and `develop` at one commit, `origin` an empty bare repo, HEAD on `main`. */
async function withScene<T>(fn: (scene: Scene) => Promise<T>): Promise<T> {
  return await withGitRepo(
    (remote) =>
      withGitRepo((work) =>
        withStub("gh", GH_STUB, async (stubDir) => {
          await work.git("remote", "add", "origin", remote.dir);
          await commit(work, { "README.md": "readme\n" }, "init");
          await work.git("branch", "develop");
          return await fn({ work, remote, stubDir });
        }),
      ),
    { bare: true },
  );
}

/** Cuts `name` from HEAD and commits one file on it. */
async function onBranch(scene: Scene, name: string, files: Record<string, string> = { "work.txt": "work\n" }, message = "work", ...more: string[]) {
  await scene.work.git("checkout", "-b", name);
  await commit(scene.work, files, message, ...more);
}

function writeConfig(scene: Scene, yaml: string | undefined) {
  if (yaml === undefined) return;
  fs.mkdirSync(path.join(scene.work.dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(scene.work.dir, ".claude", "viber.yml"), yaml);
}

/** A `branching:` group of the given mode with one work entry per row. */
function branching(mode: string, entries: { key: string; name: string; target: string; base?: string }[]): string {
  const rows = entries.flatMap((e) => [`    ${e.key}:`, `      base: ${e.base ?? "main"}`, `      name: "${e.name}"`, `      target: ${e.target}`]);
  return ["branching:", `  mode: ${mode}`, "  work:", ...rows, ""].join("\n");
}

const FEATURE = { key: "feature", name: "{type}/{issue-number}-{slug}", target: "develop" };
const HOTFIX = { key: "hotfix", name: "hotfix/{slug}", target: "main" };

interface PlanOpts {
  branch?: string;
  work?: string;
  issue?: string;
  repro?: boolean;
}

function planText(o: PlanOpts): string {
  const fm = [o.branch && `branch: ${o.branch}`, o.work && `work: ${o.work}`, o.issue && `issue: ${o.issue}`].filter(Boolean);
  const task = ["<!-- TASK -->", "### T1 - Do it", ...(o.repro ? ["- Repro: tests/it.test.ts"] : []), "- Files: a.ts", "<!-- /TASK -->"];
  return ["---", ...fm, "---", "", "# Plan", "", ...task, ""].join("\n");
}

const RUN = "docs/_specs/2026-01-01-00-00-00_thing";
const ARCHIVE = "docs/specs/2026-01-01-00-00-00_done";

async function runFacts(
  shell: Shell,
  scene: Scene,
  args: string[] = [],
  opts: { env?: Record<string, string>; noGh?: boolean } = {},
): Promise<RunResult> {
  const env = { ...scene.work.env, ...(opts.noGh ? { PATH: coreUtilsPath() } : {}), ...opts.env };
  return await runScript(SUT, args, { shell, cwd: scene.work.dir, env, stubDirs: opts.noGh ? [] : [scene.stubDir] });
}

function lines(result: RunResult): string[] {
  return result.stdout.split("\n").filter((l) => l.length > 0);
}

function value(result: RunResult, key: string): string | undefined {
  return lines(result)
    .find((l) => l.startsWith(`${key}=`))
    ?.slice(key.length + 1);
}

function values(result: RunResult, key: string): string[] {
  return lines(result)
    .filter((l) => l.startsWith(`${key}=`))
    .map((l) => l.slice(key.length + 1));
}

async function shortSha(repo: GitRepo, ref: string): Promise<string> {
  return (await repo.git("log", "-1", "--format=%h", ref)).stdout.trim();
}

// --- the whole block ----------------------------------------------------------------

test("a ready block prints every C9 line in order, QA= right after SPEC=, for a target given on the command line", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x");
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(lines(result), [
        "STATUS=ready",
        `REPO=${REPO_URL}`,
        "BRANCH=feature/x",
        "DEFAULT=main",
        "MODE=off",
        "ENTRY=",
        "TARGET=develop",
        "CLOSES=no",
        "TYPE=feat",
        "TEMPLATE=",
        "SPEC=",
        "QA=",
        "TITLE_PATTERN=[{issue-number}] {summary}",
        `COMMIT=${await shortSha(scene.work, "HEAD")} work`,
      ]);
    });
  });
});

// --- arguments -----------------------------------------------------------------------

const BAD_ARGS: { name: string; args: string[] }[] = [
  { name: "an unknown flag", args: ["--bogus"] },
  { name: "a bare word", args: ["develop"] },
  { name: "--entry without a value", args: ["--entry"] },
  { name: "--target without a value", args: ["--target"] },
  { name: "--entry and --target together", args: ["--entry", "feature", "--target", "develop"] },
  { name: "an empty --target value", args: ["--target", ""] },
];

for (const row of BAD_ARGS) {
  test(`${row.name}: exit 2 with nothing on stdout`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        await onBranch(scene, "feature/x");
        const result = await runFacts(shell, scene, row.args);
        assert.equal(result.status, 2, `stderr: ${result.stderr}`);
        assert.equal(result.stdout, "");
      });
    });
  });
}

// --- the entry -----------------------------------------------------------------------

test("an open run whose plan records the branch gives its work entry, that entry's target and its plan path (DoD 1)", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [FEATURE, HOTFIX]));
      await onBranch(scene, "wip/thing", { [`${RUN}/plan.md`]: planText({ branch: "wip/thing", work: "hotfix" }) });
      const result = await runFacts(shell, scene);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(value(result, "ENTRY"), "hotfix");
      assert.equal(value(result, "TARGET"), "main");
      assert.equal(value(result, "SPEC"), `${RUN}/plan.md`);
      assert.deepEqual(values(result, "CANDIDATE"), []);
    });
  });
});

test("an open run that has a spec.md names it as SPEC", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [FEATURE, HOTFIX]));
      await onBranch(scene, "wip/thing", {
        [`${RUN}/plan.md`]: planText({ branch: "wip/thing", work: "feature" }),
        [`${RUN}/spec.md`]: "# Spec\n",
      });
      const result = await runFacts(shell, scene);
      assert.equal(value(result, "SPEC"), `${RUN}/spec.md`);
    });
  });
});

test("an open run recording another branch is ignored", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [FEATURE, HOTFIX]));
      await onBranch(scene, "wip/thing", { [`${RUN}/plan.md`]: planText({ branch: "wip/other", work: "hotfix" }) });
      const result = await runFacts(shell, scene);
      assert.equal(value(result, "ENTRY"), "");
      assert.equal(value(result, "SPEC"), "");
    });
  });
});

test("one entry whose name pattern matches the branch is the entry, with its target", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [FEATURE, HOTFIX]));
      await onBranch(scene, "feature/7-add-thing");
      const result = await runFacts(shell, scene);
      assert.equal(value(result, "ENTRY"), "feature");
      assert.equal(value(result, "TARGET"), "develop");
      assert.deepEqual(values(result, "CANDIDATE"), []);
    });
  });
});

test("two entries whose patterns match give one CANDIDATE line each, an empty ENTRY and an empty TARGET and CLOSES", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(
        scene,
        branching("allowed", [
          { key: "feature", name: "{type}/{slug}", target: "develop" },
          { key: "other", name: "feature/{slug}", target: "main" },
        ]),
      );
      await onBranch(scene, "feature/x");
      const result = await runFacts(shell, scene);
      assert.equal(value(result, "ENTRY"), "");
      assert.equal(value(result, "TARGET"), "");
      assert.equal(value(result, "CLOSES"), "");
      assert.deepEqual(values(result, "CANDIDATE"), ["feature | target: develop", "other | target: main"]);
      assert.deepEqual(values(result, "COMMIT"), []);
    });
  });
});

test("no matching pattern gives one CANDIDATE line per entry", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [FEATURE, HOTFIX]));
      await onBranch(scene, "wip/x");
      const result = await runFacts(shell, scene);
      assert.equal(value(result, "ENTRY"), "");
      assert.deepEqual(values(result, "CANDIDATE"), ["feature | target: develop", "hotfix | target: main"]);
    });
  });
});

test("--entry overrides the entry an open run records", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [FEATURE, HOTFIX]));
      await onBranch(scene, "wip/thing", { [`${RUN}/plan.md`]: planText({ branch: "wip/thing", work: "feature" }) });
      const result = await runFacts(shell, scene, ["--entry", "hotfix"]);
      assert.equal(value(result, "ENTRY"), "hotfix");
      assert.equal(value(result, "TARGET"), "main");
    });
  });
});

test("--target sets TARGET and leaves ENTRY empty though an open run records an entry", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [FEATURE, HOTFIX]));
      await onBranch(scene, "wip/thing", { [`${RUN}/plan.md`]: planText({ branch: "wip/thing", work: "feature" }) });
      const result = await runFacts(shell, scene, ["--target", "release"]);
      assert.equal(value(result, "ENTRY"), "");
      assert.equal(value(result, "TARGET"), "release");
      assert.deepEqual(values(result, "CANDIDATE"), []);
    });
  });
});

test("mode off gives no entry and no candidate whatever the run and the patterns say", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("off", [FEATURE, HOTFIX]));
      await onBranch(scene, "feature/7-add-thing", { [`${RUN}/plan.md`]: planText({ branch: "feature/7-add-thing", work: "hotfix" }) });
      const result = await runFacts(shell, scene, ["--entry", "hotfix"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(value(result, "MODE"), "off");
      assert.equal(value(result, "ENTRY"), "");
      assert.equal(value(result, "TARGET"), "");
      assert.deepEqual(values(result, "CANDIDATE"), []);
    });
  });
});

test("mode off still honours --target", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("off", [FEATURE]));
      await onBranch(scene, "feature/x");
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(value(result, "TARGET"), "develop");
    });
  });
});

// --- the archived run ----------------------------------------------------------------

test("a branch whose run is archived gives the newest archived spec.md its commits touch and that spec's issue number", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x", { "docs/specs/old-run/spec.md": "---\nissue: https://github.com/acme/widgets/issues/5\n---\n# Old\n" }, "older");
      await commit(scene.work, { [`${ARCHIVE}/spec.md`]: "---\nissue: https://github.com/acme/widgets/issues/42\n---\n# Spec\n" }, "newer");
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(value(result, "SPEC"), `${ARCHIVE}/spec.md`);
      assert.deepEqual(values(result, "ISSUE"), ["42"]);
    });
  });
});

test("an archived spec.md no listed commit touches is not the run", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await commit(scene.work, { "docs/specs/before/spec.md": "---\nissue: https://github.com/acme/widgets/issues/8\n---\n" }, "before the branch");
      await scene.work.git("branch", "-f", "develop", "HEAD");
      await onBranch(scene, "feature/x");
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(value(result, "SPEC"), "");
      assert.deepEqual(values(result, "ISSUE"), []);
    });
  });
});

// --- QA= -----------------------------------------------------------------------------

test("QA= names the qa.md of the open run that sits beside its spec.md", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "wip/thing", {
        [`${RUN}/plan.md`]: planText({ branch: "wip/thing" }),
        [`${RUN}/spec.md`]: "# Spec\n",
        [`${RUN}/qa.md`]: "# QA\n",
      });
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(value(result, "QA"), `${RUN}/qa.md`);
    });
  });
});

test("QA= names the qa.md of an open run that has no spec.md, beside its plan.md", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "wip/thing", {
        [`${RUN}/plan.md`]: planText({ branch: "wip/thing" }),
        [`${RUN}/qa.md`]: "# QA\n",
      });
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(value(result, "QA"), `${RUN}/qa.md`);
    });
  });
});

test("QA= is empty when the open run has no qa.md", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "wip/thing", {
        [`${RUN}/plan.md`]: planText({ branch: "wip/thing" }),
        [`${RUN}/spec.md`]: "# Spec\n",
      });
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(value(result, "QA"), "");
    });
  });
});

test("QA= names the qa.md beside the archived spec.md when SPEC comes from the archive", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x", { [`${ARCHIVE}/spec.md`]: "# Spec\n", [`${ARCHIVE}/qa.md`]: "# QA\n" });
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(value(result, "SPEC"), `${ARCHIVE}/spec.md`);
      assert.equal(value(result, "QA"), `${ARCHIVE}/qa.md`);
    });
  });
});

test("QA= is empty when the archived run has no qa.md", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x", { [`${ARCHIVE}/spec.md`]: "# Spec\n" });
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(value(result, "QA"), "");
    });
  });
});

test("the pr-exists stop prints QA= after PR_URL= for the open run", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "wip/thing", {
        [`${RUN}/plan.md`]: planText({ branch: "wip/thing" }),
        [`${RUN}/qa.md`]: "# QA\n",
      });
      const result = await runFacts(shell, scene, [], { env: { PR_LIST: `${PR_URL}\ndevelop\n` } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `STATUS=stop\nREASON=pr-exists\nPR_URL=${PR_URL}\nQA=${RUN}/qa.md\n`);
    });
  });
});

test("the pr-exists stop prints QA= of the archived run its commits against the pull request base touch", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x", { [`${ARCHIVE}/spec.md`]: "# Spec\n", [`${ARCHIVE}/qa.md`]: "# QA\n" });
      const result = await runFacts(shell, scene, [], { env: { PR_LIST: `${PR_URL}\ndevelop\n` } });
      assert.equal(result.stdout, `STATUS=stop\nREASON=pr-exists\nPR_URL=${PR_URL}\nQA=${ARCHIVE}/qa.md\n`);
    });
  });
});

test("the pr-exists stop prints an empty QA= when no run resolves", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x");
      const result = await runFacts(shell, scene, [], { env: { PR_LIST: `${PR_URL}\ndevelop\n` } });
      assert.equal(result.stdout, `STATUS=stop\nREASON=pr-exists\nPR_URL=${PR_URL}\nQA=\n`);
    });
  });
});

test("the pr-exists stop stays pr-exists, not no-commits, when nothing is ahead of the pull request base (QA= resolution fires no other stop)", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x", { [`${ARCHIVE}/spec.md`]: "# Spec\n", [`${ARCHIVE}/qa.md`]: "# QA\n" });
      await scene.work.git("branch", "-f", "develop", "HEAD");
      const result = await runFacts(shell, scene, [], { env: { PR_LIST: `${PR_URL}\ndevelop\n` } });
      assert.equal(result.stdout, `STATUS=stop\nREASON=pr-exists\nPR_URL=${PR_URL}\nQA=\n`);
    });
  });
});

// --- a failed pull request lookup ----------------------------------------------------

test("a failing `gh pr list` prints the ERROR line on stderr, nothing on stdout, and exits 1 (no ready block from a lookup that did not run)", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x");
      const result = await runFacts(shell, scene, ["--target", "develop"], { env: { PR_FAIL: "1" } });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr.trim(), "ERROR pr-facts.sh: gh pr list failed");
    });
  });
});

test("an open pull request still gives STATUS=stop REASON=pr-exists", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x");
      const result = await runFacts(shell, scene, [], { env: { PR_LIST: `${PR_URL}\ndevelop\n` } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(value(result, "STATUS"), "stop");
      assert.equal(value(result, "REASON"), "pr-exists");
    });
  });
});

// --- the stops -----------------------------------------------------------------------

const ghOnCorePath = coreUtilsPath()
  .split(path.delimiter)
  .some((dir) => ["gh", "gh.exe"].some((n) => fs.existsSync(path.join(dir, n))));

interface StopRow {
  name: string;
  reason: string;
  args?: string[];
  env?: Record<string, string>;
  noGh?: boolean;
  config?: string;
  arrange?: (scene: Scene) => Promise<unknown> | void;
}

const PR_URL = `${REPO_URL}/pull/9`;

const STOPS: StopRow[] = [
  { name: "gh missing", reason: "no-gh", noGh: true },
  { name: "gh resolving no repository", reason: "no-repo", env: { REPO_FAIL: "1" } },
  { name: "a detached HEAD", reason: "detached", arrange: (s) => s.work.git("checkout", "--detach") },
  { name: "a tracked file changed", reason: "dirty", arrange: (s) => fs.writeFileSync(path.join(s.work.dir, "README.md"), "changed\n") },
  { name: "the branch is the default branch", reason: "on-base", arrange: (s) => s.work.git("checkout", "main") },
  {
    name: "the branch is an entry base",
    reason: "on-base",
    config: branching("allowed", [{ key: "feature", name: "{type}/{slug}", base: "develop", target: "main" }]),
    arrange: (s) => s.work.git("checkout", "develop"),
  },
  {
    name: "the branch is an entry target",
    reason: "on-base",
    config: branching("allowed", [{ key: "feature", name: "{type}/{slug}", base: "main", target: "develop" }]),
    arrange: (s) => s.work.git("checkout", "develop"),
  },
  { name: "--entry naming no entry", reason: "unknown-entry", config: branching("allowed", [FEATURE]), args: ["--entry", "nope"] },
  { name: "nothing ahead of the target", reason: "no-commits", args: ["--target", "develop"], arrange: (s) => s.work.git("branch", "-f", "develop", "HEAD") },
];

for (const row of STOPS) {
  test(
    `${row.name}: STATUS=stop REASON=${row.reason} and nothing else, no QA= line`,
    { skip: row.noGh && ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
    async () => {
      await assertPosix(async (shell) => {
        await withScene(async (scene) => {
          writeConfig(scene, row.config);
          await onBranch(scene, "feature/x");
          await row.arrange?.(scene);
          const result = await runFacts(shell, scene, row.args ?? [], { env: row.env, noGh: row.noGh });
          assert.equal(result.status, 0, `stderr: ${result.stderr}`);
          assert.equal(result.stdout, `STATUS=stop\nREASON=${row.reason}\n`);
        });
      });
    },
  );
}

test("outside a git repository: STATUS=stop REASON=no-repo", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await withTempDir("pr-facts-norepo-", async (dir) => {
        const result = await runScript(SUT, [], { shell, cwd: dir, env: { ...scene.work.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) }, stubDirs: [scene.stubDir] });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(result.stdout, "STATUS=stop\nREASON=no-repo\n");
      });
    });
  });
});

test("a dirty tree on the default branch is reported as dirty, the earlier check", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      fs.writeFileSync(path.join(scene.work.dir, "README.md"), "changed\n");
      const result = await runFacts(shell, scene);
      assert.equal(value(result, "REASON"), "dirty");
    });
  });
});

test("an untracked file does not make the tree dirty", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x");
      fs.writeFileSync(path.join(scene.work.dir, "scratch.txt"), "scratch\n");
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(value(result, "STATUS"), "ready");
    });
  });
});

test("a target known only through the remote-tracking ref with nothing ahead stops on no-commits", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await scene.work.git("push", "origin", "main:refs/heads/remote-only");
      await scene.work.git("fetch", "origin");
      await scene.work.git("checkout", "-b", "feature/x");
      const result = await runFacts(shell, scene, ["--target", "remote-only"]);
      assert.equal(result.stdout, "STATUS=stop\nREASON=no-commits\n");
    });
  });
});

test("a target known only through the remote-tracking ref lists the commits ahead of it", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await scene.work.git("push", "origin", "main:refs/heads/remote-only");
      await scene.work.git("fetch", "origin");
      await onBranch(scene, "feature/x");
      const result = await runFacts(shell, scene, ["--target", "remote-only"]);
      assert.deepEqual(values(result, "COMMIT"), [`${await shortSha(scene.work, "HEAD")} work`]);
    });
  });
});

/** Pushes `main` at its first commit, then commits five more on local `main` only and cuts and pushes `hotfix/x` from there. */
async function aheadOfStaleLocalMain(scene: Scene, files: Record<string, string> = {}) {
  await scene.work.git("push", "origin", "main");
  await commit(scene.work, files, "unpushed 1", "Refs: #7");
  for (const n of [2, 3, 4, 5]) await commit(scene.work, {}, `unpushed ${n}`);
  await scene.work.git("checkout", "-b", "hotfix/x");
  await scene.work.git("push", "-u", "origin", "hotfix/x");
}

test("a local target branch at HEAD is ignored for the remote one the pull request opens against, so the commits ahead of origin are listed (an unpushed local main must not give a false no-commits)", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [HOTFIX]));
      await aheadOfStaleLocalMain(scene);
      const result = await runFacts(shell, scene);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(value(result, "STATUS"), "ready");
      assert.equal(value(result, "TARGET"), "main");
      assert.equal(values(result, "COMMIT").length, 5);
      assert.deepEqual(values(result, "ISSUE"), ["7"]);
    });
  });
});

test("the pr-exists stop resolves the archived run from the commits ahead of the remote base, not of a local base at HEAD", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await aheadOfStaleLocalMain(scene, { [`${ARCHIVE}/spec.md`]: "# Spec\n", [`${ARCHIVE}/qa.md`]: "# QA\n" });
      const result = await runFacts(shell, scene, [], { env: { PR_LIST: `${PR_URL}\nmain\n` } });
      assert.equal(result.stdout, `STATUS=stop\nREASON=pr-exists\nPR_URL=${PR_URL}\nQA=${ARCHIVE}/qa.md\n`);
    });
  });
});

test("the local target's own upstream wins over the head branch's remote, so a stale fork copy of the target never widens the range (a fork workflow sets the head branch's remote to the fork)", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(
      async (fork) => {
        await withScene(async (scene) => {
          await scene.work.git("remote", "add", "fork", fork.dir);
          await scene.work.git("push", "fork", "main");
          await scene.work.git("fetch", "fork");
          for (const n of [1, 2, 3]) await commit(scene.work, {}, `upstream ${n}`);
          await scene.work.git("push", "-u", "origin", "main");
          await onBranch(scene, "feature/x");
          await scene.work.git("push", "-u", "fork", "feature/x");
          const result = await runFacts(shell, scene, ["--target", "main"]);
          assert.equal(result.status, 0, `stderr: ${result.stderr}`);
          assert.deepEqual(values(result, "COMMIT"), [`${await shortSha(scene.work, "HEAD")} work`]);
        });
      },
      { bare: true },
    );
  });
});

test("a head branch tracking a local branch (remote is a dot) compares against origin/<target>, so an unpushed local main is not a false no-commits", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await scene.work.git("push", "origin", "main");
      await commit(scene.work, {}, "unpushed 1");
      await scene.work.git("checkout", "-b", "feat", "--track", "main");
      const result = await runFacts(shell, scene, ["--target", "main"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(value(result, "STATUS"), "ready");
      assert.deepEqual(values(result, "COMMIT"), [`${await shortSha(scene.work, "HEAD")} unpushed 1`]);
    });
  });
});

test("a target with no remote-tracking ref falls back to the local branch and lists the commits ahead of it", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x");
      await commit(scene.work, {}, "more");
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(value(result, "STATUS"), "ready");
      assert.equal(values(result, "COMMIT").length, 2);
    });
  });
});

test("a target unknown locally and at the remote gives no COMMIT line and no stop (DoD 15)", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x");
      const result = await runFacts(shell, scene, ["--target", "nowhere"]);
      assert.equal(value(result, "STATUS"), "ready");
      assert.equal(value(result, "TARGET"), "nowhere");
      assert.deepEqual(values(result, "COMMIT"), []);
    });
  });
});

// --- the template --------------------------------------------------------------------

test("the entry's own template comes before the default template", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [FEATURE]));
      fs.mkdirSync(path.join(scene.work.dir, ".github/PULL_REQUEST_TEMPLATE"), { recursive: true });
      fs.writeFileSync(path.join(scene.work.dir, ".github/PULL_REQUEST_TEMPLATE/feature.md"), "entry\n");
      fs.writeFileSync(path.join(scene.work.dir, ".github/pull_request_template.md"), "default\n");
      await onBranch(scene, "feature/7-add-thing");
      const result = await runFacts(shell, scene);
      assert.equal(value(result, "TEMPLATE"), ".github/PULL_REQUEST_TEMPLATE/feature.md");
    });
  });
});

test("without an entry template the default template is used", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [FEATURE]));
      fs.mkdirSync(path.join(scene.work.dir, ".github"), { recursive: true });
      fs.writeFileSync(path.join(scene.work.dir, ".github/pull_request_template.md"), "default\n");
      await onBranch(scene, "feature/7-add-thing");
      const result = await runFacts(shell, scene);
      assert.equal(value(result, "TEMPLATE"), ".github/pull_request_template.md");
    });
  });
});

test("an entry template is never used while ENTRY is empty", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [FEATURE]));
      fs.mkdirSync(path.join(scene.work.dir, ".github/PULL_REQUEST_TEMPLATE"), { recursive: true });
      fs.writeFileSync(path.join(scene.work.dir, ".github/PULL_REQUEST_TEMPLATE/feature.md"), "entry\n");
      await onBranch(scene, "feature/7-add-thing");
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(value(result, "TEMPLATE"), "");
    });
  });
});

// --- CLOSES --------------------------------------------------------------------------

const CLOSES_ROWS = [
  { target: "main", closes: "yes" },
  { target: "develop", closes: "no" },
];

for (const row of CLOSES_ROWS) {
  test(`--target ${row.target} against the default branch main gives CLOSES=${row.closes}`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        await scene.work.git("branch", "-f", "develop", "HEAD");
        await onBranch(scene, "feature/x");
        const result = await runFacts(shell, scene, ["--target", row.target]);
        assert.equal(value(result, "CLOSES"), row.closes);
      });
    });
  });
}

// --- ISSUE, COMMIT, TYPE, TITLE_PATTERN -----------------------------------------------

test("ISSUE lists the Refs numbers of the commits ahead and the plan's issue, ascending and unique", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(
        scene,
        "wip/thing",
        { [`${RUN}/plan.md`]: planText({ branch: "wip/thing", issue: `${REPO_URL}/issues/5` }) },
        "first",
        "Refs: #9",
      );
      await commit(scene.work, { "b.txt": "b\n" }, "second", "Refs: #3");
      await commit(scene.work, { "c.txt": "c\n" }, "third", "Refs: #9", "Refs: docs/_specs/x task T1");
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.deepEqual(values(result, "ISSUE"), ["3", "5", "9"]);
    });
  });
});

test("a matched {issue-number} is an ISSUE", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, branching("allowed", [FEATURE]));
      await onBranch(scene, "feature/12-add-thing");
      const result = await runFacts(shell, scene);
      assert.deepEqual(values(result, "ISSUE"), ["12"]);
    });
  });
});

test("COMMIT lines list the commits ahead of the target oldest first as short sha and subject", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await onBranch(scene, "feature/x", { "a.txt": "a\n" }, "first work");
      const first = await shortSha(scene.work, "HEAD");
      await commit(scene.work, { "b.txt": "b\n" }, "second work");
      const second = await shortSha(scene.work, "HEAD");
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.deepEqual(values(result, "COMMIT"), [`${first} first work`, `${second} second work`]);
    });
  });
});

const TYPE_ROWS: { name: string; branch: string; config?: string; plan?: PlanOpts; type: string }[] = [
  { name: "a plan carrying a Repro line", branch: "wip/thing", plan: { branch: "wip/thing", repro: true }, type: "fix" },
  { name: "a matched {type} of fix", branch: "fix/7-a-bug", config: branching("allowed", [FEATURE]), type: "fix" },
  { name: "a fix/ branch", branch: "fix/a-bug", type: "fix" },
  { name: "a hotfix/ branch", branch: "hotfix/a-bug", type: "fix" },
  { name: "a matched {type} of feature", branch: "feature/7-a-thing", config: branching("allowed", [FEATURE]), type: "feat" },
  { name: "a plan without a Repro line", branch: "wip/thing", plan: { branch: "wip/thing" }, type: "feat" },
];

for (const row of TYPE_ROWS) {
  test(`${row.name} gives TYPE=${row.type}`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        writeConfig(scene, row.config);
        await onBranch(scene, row.branch, row.plan ? { [`${RUN}/plan.md`]: planText(row.plan) } : undefined);
        const result = await runFacts(shell, scene, ["--target", "develop"]);
        assert.equal(value(result, "TYPE"), row.type);
      });
    });
  });
}

test("TITLE_PATTERN carries github.pr-title", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      writeConfig(scene, 'github:\n  pr-title: "[{type}] {summary}"\n');
      await onBranch(scene, "feature/x");
      const result = await runFacts(shell, scene, ["--target", "develop"]);
      assert.equal(value(result, "TITLE_PATTERN"), "[{type}] {summary}");
    });
  });
});

/*
 * plan-path.critical.test.ts - the critical tier of
 * viber/scripts/plan-path.sh: landing copies a plan into a fresh run without
 * touching the source or overwriting a live run, a failed copy leaves nothing
 * behind, and branch creation or checkout works or is refused with HEAD, index
 * and tree untouched, including drive-letter forms.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by plan-path.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/plan-path.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withStub } from "../harness/stub.ts";
import { withTempDir, type GitRepo } from "../harness/tmp.ts";
import {
  SUT,
  KEY_SHAPE,
  run,
  parse,
  slugOf,
  landPlan,
  sourcePlan,
  planWithTasks,
  runDirs,
  PLAN_BODY,
  withAttachments,
  attachment,
  posixForm,
  withBranchRepo,
  ON_MAIN,
  runIn,
  headOf,
  commitOf,
  treeOf,
  branchAhead,
  withSource,
  branchLine,
  linesOf,
  SINGLE,
  twoEntries,
  workAhead,
  PLUGIN_ROOT,
} from "./plan-path-fixture.ts";

/** How long ago the key's stamp was, in milliseconds. The script stamps with
 *  `date`, i.e. LOCAL time, which is the clock Node reads here too. */
function stampAge(key: string): number {
  const match = KEY_SHAPE.exec(key);
  assert.ok(match, `key is not <stamp>_<slug>: ${key}`);
  const [y, mo, d, h, mi, s] = match[1].split("-").map(Number);
  return Date.now() - new Date(y, mo - 1, d, h, mi, s).getTime();
}

test("--land copies a plan from outside the repository into a freshly stamped directory and leaves the source untouched", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    await withTempDir("p2p2-plans-", async (plans) => {
      const src = sourcePlan(plans, "2026-09-20-fancy-name.md", PLAN_BODY);

      const result = await run(dir, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);

      const resolved = parse(result.stdout);
      assert.equal(resolved.state, "new");
      assert.equal(slugOf(resolved.key), "add-login");
      assert.equal(resolved.path, `docs/_specs/${resolved.key}/plan.md`);

      // The landed plan is the source, byte for byte - the orchestrator never
      // retypes it out of its context.
      assert.equal(fs.readFileSync(path.join(dir, resolved.path), "utf-8"), PLAN_BODY);
      // ... and the source is still where plan mode left it.
      assert.equal(fs.readFileSync(src, "utf-8"), PLAN_BODY);

      // The stamp is taken NOW, which is the whole reason a second run of one
      // slug cannot overwrite an earlier plan. The window is wide on purpose:
      // it has to catch a fixed or epoch-derived stamp (off by years), not to
      // measure the clock, and a DST-ambiguous local hour must never flip it.
      assert.ok(Math.abs(stampAge(resolved.key)) < 90 * 60_000, `the stamp must be the landing moment: ${resolved.key}`);
    });
  });
});

test("a run already open for that slug comes back existing, and its progress is not written over", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const inProgress = [planWithTasks("Add Login", ["T1", "T2"]), "<!-- done: T1 -->", ""].join("\n");
    landPlan(dir, "2026-09-19-17-30-00_add-login", "2026-09-19T17:30:00Z", inProgress);
    landPlan(dir, "2026-09-20-08-00-00_other-thing", "2026-09-20T08:00:00Z");

    // The same plan, edited after the build started: the landed copy is the
    // state, so the edit must NOT reach it.
    const src = sourcePlan(dir, "outside/add-login.md", PLAN_BODY);
    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(parse(result.stdout), {
      path: "docs/_specs/2026-09-19-17-30-00_add-login/plan.md",
      key: "2026-09-19-17-30-00_add-login",
      state: "existing",
    });
    assert.equal(
      fs.readFileSync(path.join(dir, "docs", "_specs", "2026-09-19-17-30-00_add-login", "plan.md"), "utf-8"),
      inProgress,
    );
  });
});

test("a copy the filesystem refuses: exit 4, nothing on stdout and no half-made run directory left behind", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const src = sourcePlan(dir, "outside/add-login.md", PLAN_BODY);

    await withStub("cp", "exit 1", async (stubDir) => {
      const result = await run(dir, ["--land", src], [stubDir]);
      assert.equal(result.status, 4, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /could not land the plan/);
      assert.deepEqual(runDirs(dir), [], "a failed copy must not leave an empty run directory");
    });
  });
});

for (const form of ["mixed", "native"] as const) {
  test(
    `an attachment source in the ${form === "mixed" ? "C:/" : "C:\\"} form lands too (cygpath normalizes it)`,
    { skip: process.platform === "win32" ? false : "a drive-letter path exists only on Windows" },
    async () => {
      await withTempDir("p2p2-viber-", async (dir) => {
        const file = attachment(dir, "login.html", `<p>${form}</p>\n`);
        const source = form === "mixed" ? slash(file) : path.win32.normalize(file);
        const src = sourcePlan(dir, "outside/add-login.md", withAttachments([`mockup.html: ${source}`], PLAN_BODY));

        const result = await run(dir, ["--land", src]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(result.stderr, "");
        const landed = path.join(dir, path.dirname(parse(result.stdout).path), "attachments", "mockup.html");
        assert.equal(fs.readFileSync(landed, "utf-8"), `<p>${form}</p>\n`);
      });
    },
  );
}

test("an unusable attachments map exits 6 before the run branch step: HEAD stays on main and the branch is not created", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await withSource(["branch: feature/login", "attachments:", "  a.png: /x/one", "  a.png: /x/two"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.equal(await headOf(repo), "main");
      assert.equal((await repo.git("branch", "--list", "feature/login")).stdout.trim(), "");
    });
  });
});

test("a plan naming a new branch while HEAD is on the base lands on it, created from the base, with the uncommitted files carried along", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    fs.writeFileSync(path.join(repo.dir, "README.md"), "changed\n");
    fs.writeFileSync(path.join(repo.dir, "repro.test.ts"), "red\n");
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const key = parse(result.stdout).key;
      assert.equal(
        slash(result.stdout),
        [`path: docs/_specs/${key}/plan.md`, `key: ${key}`, "state: new", "branch: feature/login (created)", "target: main", ""].join("\n"),
      );
      assert.equal(await headOf(repo), "feature/login");
      assert.equal(await commitOf(repo), await commitOf(repo, "main"));
      assert.equal(fs.readFileSync(path.join(repo.dir, "README.md"), "utf-8"), "changed\n");
      assert.ok(fs.existsSync(path.join(repo.dir, "repro.test.ts")));
    });
  });
});

test("a plan naming an existing branch at another commit switches to it on a clean tree, never recreating it", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await branchAhead(repo, "feature/login");
    const tip = await commitOf(repo, "feature/login");
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: feature/login (switched)");
      assert.equal(await headOf(repo), "feature/login");
      assert.equal(await commitOf(repo), tip);
    });
  });
});

test("required and a plan naming the base: exit 5, nothing on stdout, nothing landed and HEAD where it was", async () => {
  await withBranchRepo(["mode: required", ...ON_MAIN], async (repo) => {
    await repo.git("checkout", "-q", "-b", "work");
    await withSource(["branch: main"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 5, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /base/);
      assert.equal(await headOf(repo), "work");
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

test("a switch to a branch at another commit on a dirty tree: exit 5, no run directory, HEAD and the tree unchanged", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await branchAhead(repo, "feature/login");
    fs.writeFileSync(path.join(repo.dir, "README.md"), "changed\n");
    const tree = await treeOf(repo);
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 5, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /uncommitted/);
      assert.equal(await headOf(repo), "main");
      assert.equal(await treeOf(repo), tree);
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

test("creating the run branch from a base at another commit on a dirty tree: exit 5 and HEAD stays on its branch", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await branchAhead(repo, "work");
    await repo.git("checkout", "-q", "work");
    fs.writeFileSync(path.join(repo.dir, "README.md"), "changed\n");
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 5, `stdout: ${result.stdout}`);
      assert.equal(await headOf(repo), "work");
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

/** The spellings Git Bash is invoked by on Windows: the root each prints its commands under follows the invoked path. */
const INVOKED_SPELLINGS = [
  { name: "a /c/ path", script: posixForm(SUT), root: posixForm(PLUGIN_ROOT) },
  { name: "a C:\\ path", script: SUT, root: PLUGIN_ROOT },
];

/** Every `run:` command of the option: lines that run something, in the order printed. */
function runCommandsOf(stdout: string): string[] {
  return linesOf(stdout, "option: ").flatMap((line) => {
    const run = line.split(" | ").find((field) => field.startsWith("run: "));
    return run === undefined || run === "run: -" ? [] : [run.slice("run: ".length)];
  });
}

for (const spelling of INVOKED_SPELLINGS) {
  test(`start options: invoked by ${spelling.name}, every run: command opens on the plugin root in that spelling (AC1)`, { skip: process.platform === "win32" ? false : "the /c/ and C:\\ spellings are a Windows Git Bash matter" }, async () => {
    const opening = `"${spelling.root}/scripts/plan-path.sh" `;
    await withBranchRepo(twoEntries("allowed"), async (repo) => {
      const result = await runScript(spelling.script, ["--start"], { cwd: repo.dir, shell: "bash", env: repo.env });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const commands = runCommandsOf(result.stdout);
      assert.equal(commands.length, 2, result.stdout);
      for (const command of commands) assert.ok(command.startsWith(opening), `${command} does not open on ${opening}`);
    });
    await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
      await workAhead(repo);
      const result = await runScript(spelling.script, ["--start"], { cwd: repo.dir, shell: "bash", env: repo.env });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const commands = runCommandsOf(result.stdout);
      assert.equal(commands.length, 1, result.stdout);
      for (const command of commands) assert.ok(command.startsWith(opening), `${command} does not open on ${opening}`);
    });
  });
}

/** The index as git records it, so a test can assert a refusal left it alone. */
async function indexOf(repo: GitRepo): Promise<string> {
  return (await repo.git("ls-files", "-s")).stdout;
}

test("checkout form: a dirty tree and a branch at another commit exits 5 with HEAD, index and tree unchanged (DoD.5)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await branchAhead(repo, "feature/login");
    fs.writeFileSync(path.join(repo.dir, "README.md"), "changed\n");
    fs.writeFileSync(path.join(repo.dir, "staged.txt"), "staged\n");
    await repo.git("add", "staged.txt");
    const tree = await treeOf(repo);
    const index = await indexOf(repo);
    const result = await runIn(repo, ["--checkout", "feature/login"]);
    assert.equal(result.status, 5, `stdout: ${result.stdout}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /uncommitted changes and feature\/login is at another commit/);
    assert.equal(await headOf(repo), "main");
    assert.equal(await treeOf(repo), tree);
    assert.equal(await indexOf(repo), index);
  });
});

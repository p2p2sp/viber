/*
 * archive-run.critical.test.ts - the critical tier of
 * viber/scripts/archive-run.sh, the wrapper of the archive-run.ts entry: a finished run moves to the archive in one
 * commit with nothing lost, an unfinished or out-of-contract one is refused
 * with the tree untouched, and a failed git step leaves nothing committed.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven in process by
 * tests/viber/lib/archive-run.unit.test.ts. This file runs on every operating
 * system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/archive-run.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { slash } from "../harness/paths.ts";
import { KEY, run, withSeededRepo, filesUnder } from "./archive-run-fixture.ts";

test("a path outside docs/<runs>/ is refused, an absolute one inside the repository included, and nothing is touched", async () => {
  await withSeededRepo(async (repo, runDir) => {
    fs.mkdirSync(path.join(repo.dir, "docs", "other", "run"), { recursive: true });
    for (const bad of ["docs/other/run", "src/thing", path.join(repo.dir, "docs", "other", "run")]) {
      const result = await run(repo.dir, [bad], repo.env);
      assert.equal(result.status, 2, `expected a refusal for ${bad}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /lives under docs\/_specs\//);
    }
    assert.ok(fs.existsSync(path.join(repo.dir, runDir)), "the run directory must be untouched");
    assert.equal(filesUnder(repo.dir, "docs/specs").length, 0);
  });
});

test("an absolute path to the run inside the repository archives it as its relative form would", async () => {
  await withSeededRepo(async (repo, runDir) => {
    const result = await run(repo.dir, [path.join(repo.dir, "docs", "_specs", KEY)], repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/specs/${KEY} (3 files)`);
    assert.ok(!fs.existsSync(path.join(repo.dir, runDir)));
  });
});

test("a run with a task in neither done: nor skipped: is exit 4 and nothing is moved", async () => {
  await withSeededRepo(
    async (repo, runDir) => {
      const result = await run(repo.dir, [runDir], repo.env);
      assert.equal(result.status, 4);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /unfinished: 1 of 3 tasks settled/);
      assert.ok(fs.existsSync(path.join(repo.dir, runDir, "plan.md")));
      assert.equal(filesUnder(repo.dir, "docs/specs").length, 0);
    },
    { tasks: ["T1", "T2", "T3"], done: "T1" },
  );
});

test("the run moves to docs/specs/<same key>, keeps everything that is not scaffolding, and prints one line", async () => {
  await withSeededRepo(async (repo, runDir) => {
    const result = await run(repo.dir, [runDir], repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/specs/${KEY} (3 files)`);
    assert.equal(result.stdout.trim().split("\n").length, 1, "stdout is exactly one line");

    assert.ok(!fs.existsSync(path.join(repo.dir, runDir)), "the run directory is gone");
    assert.deepEqual(filesUnder(repo.dir, `docs/specs/${KEY}`), ["qa.e2e.md", "qa.md", "spec.md"]);
  });
});

test("the move is one commit, and a spec.md edited before the call lands as a rename plus a modification", async () => {
  await withSeededRepo(async (repo, runDir) => {
    // what closeout does just before calling: the drift, marked in place
    const spec = path.join(repo.dir, runDir, "spec.md");
    fs.writeFileSync(
      spec,
      fs
        .readFileSync(spec, "utf-8")
        .replace("on the next request.", "on the next request. [D1]")
        .concat("\n## Deviations\n\nD1 (AC2): a 5s cache holds the old role.\n"),
    );

    const before = (await repo.git("rev-parse", "HEAD")).stdout.trim();
    assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);

    const log = (await repo.git("log", "--format=%s", `${before}..HEAD`)).stdout.trim().split("\n");
    assert.deepEqual(log, [`docs(viber): archive run ${KEY}`]);

    // rename detection, read off --name-status rather than --stat: the stat
    // line abbreviates a long path to "..." and would hide the very thing
    // being asserted
    const shown = slash((await repo.git("show", "-M", "--name-status", "--format=", "HEAD")).stdout).trim().split("\n");
    assert.ok(
      shown.some((line) => /^R\d+\t/.test(line) && line.endsWith(`docs/specs/${KEY}/spec.md`)),
      `spec.md must be a rename, not an add plus a delete:\n${shown.join("\n")}`,
    );
    assert.ok(
      shown.some((line) => line === `D\tdocs/_specs/${KEY}/plan.md`),
      `the scaffolding must be deleted in the same commit:\n${shown.join("\n")}`,
    );

    // the working tree is clean: the removal rode in the same commit
    assert.equal((await repo.git("status", "--porcelain")).stdout.trim(), "");
    assert.match(fs.readFileSync(path.join(repo.dir, "docs", "specs", KEY, "spec.md"), "utf-8"), /\[D1\]/);
  });
});

test("a path staged beside the run stays in the index: the commit's pathspec is the archive and the run alone", async () => {
  await withSeededRepo(async (repo, runDir) => {
    fs.writeFileSync(path.join(repo.dir, "unrelated.ts"), "export const a = 1;\n");
    await repo.git("add", "unrelated.ts");

    assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
    assert.equal((await repo.git("status", "--porcelain")).stdout.trim(), "A  unrelated.ts");
  });
});

test("an existing destination is exit 3, and the run is left exactly where it was", async () => {
  await withSeededRepo(async (repo, runDir) => {
    fs.mkdirSync(path.join(repo.dir, "docs", "specs", KEY), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "docs", "specs", KEY, "spec.md"), "an earlier archive\n");

    const result = await run(repo.dir, [runDir], repo.env);
    assert.equal(result.status, 3);
    assert.equal(result.stdout, "");
    assert.match(slash(result.stderr), /docs\/specs\/.* already exists/);
    assert.ok(fs.existsSync(path.join(repo.dir, runDir, "plan.md")));
    assert.equal(fs.readFileSync(path.join(repo.dir, "docs", "specs", KEY, "spec.md"), "utf-8"), "an earlier archive\n");
  });
});

test("a commit a pre-commit hook refuses exits 5, leaving the move done, nothing committed and the scratch untouched", async () => {
  await withSeededRepo(async (repo, runDir) => {
    const hooks = path.join(repo.dir, ".git", "hooks");
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(path.join(hooks, "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const state = path.join(repo.dir, ".temp", "viber", "T1", "state");
    fs.mkdirSync(path.dirname(state), { recursive: true });
    fs.writeFileSync(state, "x\n");

    const result = await run(repo.dir, [runDir], repo.env);
    assert.equal(result.status, 5);
    assert.equal(result.stdout, "");
    assert.ok(!fs.existsSync(path.join(repo.dir, runDir)));
    assert.deepEqual(filesUnder(repo.dir, `docs/specs/${KEY}`), ["qa.e2e.md", "qa.md", "spec.md"]);
    assert.equal((await repo.git("log", "--format=%s", "-1")).stdout.trim(), "docs(viber): decomposition");
    assert.ok(fs.existsSync(state));
  });
});

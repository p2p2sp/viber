/*
 * app-wait.critical.test.ts - the critical tier of
 * viber/skills/e2e/scripts/app-wait.sh: with no answer the script prints NEXT:
 * launch with the launch log path, and a slow failing probe still ends the
 * wait within its time bound.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by app-wait.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/app-wait.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import { withStub } from "../harness/stub.ts";
import { SUT, withApp } from "./app-wait-fixture.ts";

test("no answer with 0 seconds prints NEXT: launch with the launch log path under the repository root and creates its directory", async () => {
  await withApp("000", async (stubDirs) => {
    await withGitRepo(async (repo) => {
      const root = slash(fs.realpathSync(repo.dir));
      const result = await runScript(SUT, ["http://localhost:3000", "0"], { cwd: repo.dir, stubDirs });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `NEXT: launch | log: ${root}/.temp/viber/e2e/launch.log\n`);
      assert.ok(fs.statSync(path.join(repo.dir, ".temp", "viber", "e2e")).isDirectory());
    });
  });
});

test("a probe that takes 2 seconds to fail still ends a 6 second wait within 12 seconds of wall time (probe time counts against the bound)", async () => {
  await withStub("curl", "sleep 2\nprintf '%s' 000", async (curlDir) => {
    await withGitRepo(async (repo) => {
      const started = Date.now();
      const result = await runScript(SUT, ["http://localhost:3000", "6"], { cwd: repo.dir, stubDirs: [curlDir] });
      const wallSeconds = (Date.now() - started) / 1000;
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "ASK: no answer after 6 s | wait -> 12 | abort -> abort\n");
      assert.ok(wallSeconds < 12, `took ${wallSeconds} s`);
    });
  });
});

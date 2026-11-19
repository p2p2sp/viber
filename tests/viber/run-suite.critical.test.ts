/*
 * run-suite.critical.test.ts - the critical tier of
 * viber/scripts/run-suite.sh: run executes the command file from the
 * repository root and ends the log on its exit code, and wait prints the log
 * path and exit line of a finished run.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by run-suite.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/run-suite.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withGitRepo } from "../harness/tmp.ts";
import { REPORT, CMD, LOG, writeCommand, run } from "./run-suite-fixture.ts";

test("run executes the command file from the repository root and ends the log on its exit code", async () => {
  await withGitRepo(async (repo) => {
    fs.writeFileSync(path.join(repo.dir, "marker.txt"), "at-root\n");
    fs.mkdirSync(path.join(repo.dir, "sub"));
    writeCommand(repo.dir, "cat marker.txt\necho out\necho err >&2\nexit 3\n");

    const result = await run(repo, ["run", REPORT, CMD], path.join(repo.dir, "sub"));

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^log: .*\/\.temp\/viber\/test-runner\/T11-report\.log\n$/);
    assert.equal(fs.readFileSync(path.join(repo.dir, LOG), "utf-8"), "at-root\nout\nerr\nexit=3\n");
  });
});

test("wait prints the log path and the exit line of a log that run just finished", async () => {
  await withGitRepo(async (repo) => {
    writeCommand(repo.dir, "echo out\nexit 3\n");
    const ran = await run(repo, ["run", REPORT, CMD]);
    assert.equal(ran.status, 0, `stderr: ${ran.stderr}`);

    const result = await run(repo, ["wait", REPORT]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^log: .*\/\.temp\/viber\/test-runner\/T11-report\.log\nexit=3\n$/);
  });
});

/*
 * config.critical.test.ts - the critical tier of viber/scripts/config.sh, the
 * wrapper of the config.ts entry: the block resolves to the fixed defaults with
 * no file, a full grouped file turns its switches on, the repository root is
 * used from a subdirectory, a local override file wins over the shared values,
 * a report flag reaches the entry, and a machine with no node prints nothing.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the config
 * behaviour itself is proven in process by tests/viber/config/. This file runs
 * on every operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/config.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { coreUtilsPath, shellUtilsPath } from "../harness/stub.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { SUT, OFF, run, writeConfig, group, inGroup, switches, dirs, writeLocal } from "./config-fixture.ts";

const nodeOnShellPath = shellUtilsPath()
  .split(path.delimiter)
  .some((dir) => ["node", "node.exe"].some((n) => fs.existsSync(path.join(dir, n))));

test("no config file: the block is every switch off, both title defaults, no extension, then the directory, tier and branching defaults, in the fixed order, and the exit is still 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "# viber config (resolved)",
      "planning.adr: false",
      "planning.outside-plan-review: false",
      "build.baseline-tests: off",
      "build.final-review: false",
      "build.memory: false",
      "build.rules: false",
      "build.qa: false",
      "build.cleanup: false",
      "build.red-check: false",
      "github.issues: false",
      "github.issue-title: {summary}",
      "github.pr-title: [{issue-number}] {summary}",
      "build.extensions: none",
      "build.extensions-missing: none",
      "directories.runs: _specs",
      "directories.specifications: specs",
      "tiers.min: haiku",
      "tiers.max: opus",
      "branching.mode: off",
    ]);
  });
});

test("a grouped config turns its switches on, comments, blank lines and case notwithstanding", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(
      dir,
      [
        "# viber switches",
        "planning:",
        "  adr: true  # the decisions worth keeping",
        "",
        "# a column-0 comment inside the group",
        "  outside-plan-review: true",
        "build:",
        "  # the close",
        "  memory: TRUE",
        "  rules: true",
        "  qa: true",
        "  cleanup: true",
        "github:",
        "  issues: true",
        "",
      ].join("\n"),
    );

    const result = await run(dir);
    assert.equal(result.status, 0);
    assert.deepEqual(switches(result.stdout), {
      ...OFF,
      "planning.adr": "true",
      "planning.outside-plan-review": "true",
      "build.memory": "true",
      "build.rules": "true",
      "build.qa": "true",
      "build.cleanup": "true",
      "github.issues": "true",
    });
  });
});

test("the file is resolved against the repository root, so a session started in a subdirectory reads the same config", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo.dir, inGroup("build", "memory: true") + group({ specifications: "archive" }));
    const nested = path.join(repo.dir, "src", "deep");
    fs.mkdirSync(nested, { recursive: true });

    const result = await runScript(SUT, [], { cwd: nested, env: repo.env, shell: "bash" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(switches(result.stdout), { ...OFF, "build.memory": "true" });
    assert.deepEqual(dirs(result.stdout), { runs: "_specs", specifications: "archive" });
  });
});

test("a local file setting all four keys prints the local value on those four lines and the shared value on every other line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(
      dir,
      inGroup("planning", "adr: true") + inGroup("build", "baseline-tests: full", "memory: true") + inGroup("github", "issues: false") + inGroup("tiers", "min: haiku", "max: opus"),
    );
    writeLocal(dir, inGroup("tiers", "min: Sonnet", "max: fable") + inGroup("build", "baseline-tests: fast") + inGroup("github", "issues: TRUE"));

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "# viber config (resolved)",
      "# local: build.baseline-tests, github.issues, tiers.min, tiers.max | ignored: none",
      "planning.adr: true",
      "planning.outside-plan-review: false",
      "build.baseline-tests: fast",
      "build.final-review: false",
      "build.memory: true",
      "build.rules: false",
      "build.qa: false",
      "build.cleanup: false",
      "build.red-check: false",
      "github.issues: true",
      "github.issue-title: {summary}",
      "github.pr-title: [{issue-number}] {summary}",
      "build.extensions: none",
      "build.extensions-missing: none",
      "directories.runs: _specs",
      "directories.specifications: specs",
      "tiers.min: sonnet",
      "tiers.max: fable",
      "branching.mode: off",
    ]);
  });
});

test("a report flag prints that report in place of the block", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, group({ specifications: "archive" }));

    const result = await run(dir, {}, ["--specifications"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "archive\n");
  });
});

test("under the shell utilities path, which holds no node, nothing is printed and the exit is 0 (a machine with no node never breaks a preload)", { skip: nodeOnShellPath ? "a real node sits in the shell utilities directory, so its absence cannot be staged" : false }, async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "memory: true"));

    const result = await run(dir, { PATH: shellUtilsPath() });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
  });
});

test("under the core utilities path the block is printed, which a legacy case pinning PATH to it relies on", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "memory: true"));

    const result = await run(dir, { PATH: coreUtilsPath() });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(switches(result.stdout), { ...OFF, "build.memory": "true" });
  });
});

/*
 * run.unit.test.ts - the config entry on fake ports: where it finds the file,
 * which arguments give the block, and the whole default block of an absent file.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runConfig } from "../../../viber/lib/config/run.ts";

const YML = "build:\n  memory: true\n";
const repo = { root: "/r", tracked: [] };

test("the file is read from the repository root when the cwd is a subdirectory of it", () => {
  const out = runConfig([], "/r/sub/deep", { fs: fakeFs({ "/r/.claude/viber.yml": YML }), git: fakeGit(repo) });
  assert.ok(out.split("\n").includes("build.memory: true"));
});

test("the file is read from the cwd outside a repository", () => {
  const out = runConfig([], "/w", { fs: fakeFs({ "/w/.claude/viber.yml": YML }), git: fakeGit(null) });
  assert.ok(out.split("\n").includes("build.memory: true"));
});

test("a file under the cwd is not read when the cwd sits in a repository whose root holds none", () => {
  const out = runConfig([], "/r/sub", { fs: fakeFs({ "/r/sub/.claude/viber.yml": YML }), git: fakeGit(repo) });
  assert.ok(out.split("\n").includes("build.memory: false"));
});

test("with no file, an argument other than the report flags gives the whole default block in its fixed order, every line ended by a newline", () => {
  const out = runConfig(["--unknown"], "/w", { fs: fakeFs({}), git: fakeGit(null) });
  assert.equal(
    out,
    "# viber config (resolved)\n" +
      "planning.adr: false\n" +
      "planning.outside-plan-review: false\n" +
      "build.baseline-tests: off\n" +
      "build.final-review: false\n" +
      "build.memory: false\n" +
      "build.rules: false\n" +
      "build.qa: false\n" +
      "build.cleanup: false\n" +
      "build.red-check: false\n" +
      "github.issues: false\n" +
      "github.issue-title: {summary}\n" +
      "github.pr-title: [{issue-number}] {summary}\n" +
      "build.extensions: none\n" +
      "build.extensions-missing: none\n" +
      "directories.runs: _specs\n" +
      "directories.specifications: specs\n" +
      "tiers.min: haiku\n" +
      "tiers.max: opus\n" +
      "branching.mode: off\n",
  );
});

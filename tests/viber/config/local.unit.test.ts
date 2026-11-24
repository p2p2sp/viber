/*
 * local.unit.test.ts - the five overrides of .claude/viber.local.yml and the
 * `# local:` line of the block, through runConfig on fake ports.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runConfig } from "../../../viber/lib/config/run.ts";

const SHARED =
  "planning:\n  questions-per-round: 7\nbuild:\n  baseline-tests: fast\ngithub:\n  issues: false\ntiers:\n  min: sonnet\n  max: opus\n";

const INVALID_LOCAL =
  "tiers:\n  min: huge\n  max:\ngithub:\n  issues: yes\nbuild:\n  baseline-tests: # none\nplanning:\n  questions-per-round: ALL\n";

function run(args: string[], shared: string | null, local: string | null, unreadable = false): string {
  const files: Record<string, string> = {};
  if (shared !== null) files["/w/.claude/viber.yml"] = shared;
  if (local !== null && !unreadable) files["/w/.claude/viber.local.yml"] = local;
  const opts = unreadable ? { unreadable: ["/w/.claude/viber.local.yml"] } : {};
  return runConfig(args, "/w", { fs: fakeFs(files, opts), git: fakeGit(null) });
}

function lines(args: string[], shared: string | null, local: string | null, unreadable = false): string[] {
  return run(args, shared, local, unreadable).split("\n");
}

test("a valid local value of each of the four block keys replaces the shared one, and the local line names them in block order", () => {
  const local = "tiers:\n  max: fable\n  min: haiku\ngithub:\n  issues: true\nbuild:\n  baseline-tests: FULL\n";
  const out = lines([], SHARED, local);
  assert.equal(out[1], "# local: build.baseline-tests, github.issues, tiers.min, tiers.max | ignored: none");
  assert.ok(out.includes("build.baseline-tests: full"));
  assert.ok(out.includes("github.issues: true"));
  assert.ok(out.includes("tiers.min: haiku"));
  assert.ok(out.includes("tiers.max: fable"));
});

test("a valid local questions-per-round replaces the shared value in --questions", () => {
  assert.equal(run(["--questions"], SHARED, "planning:\n  questions-per-round: all\n"), "all\n");
});

test("a local questions-per-round is named after tiers.max in the local line, and a local tiers.max leaves the shared tiers.min", () => {
  const out = lines([], SHARED, "planning:\n  questions-per-round: all\ntiers:\n  max: sonnet\n");
  assert.equal(out[1], "# local: tiers.max, planning.questions-per-round | ignored: none");
  assert.ok(out.includes("tiers.min: sonnet"));
  assert.ok(out.includes("tiers.max: sonnet"));
});

for (const [value, expected] of [
  ["true", "full"],
  ["false", "off"],
]) {
  test(`a local baseline-tests of ${value} reads as ${expected}`, () => {
    assert.ok(lines([], SHARED, `build:\n  baseline-tests: ${value}\n`).includes(`build.baseline-tests: ${expected}`));
  });
}

test("an empty or invalid local value leaves the shared value in the block and the key is ignored", () => {
  const out = lines([], SHARED, INVALID_LOCAL);
  assert.equal(out[1], "# local: none | ignored: tiers.min, tiers.max, github.issues, build.baseline-tests, planning.questions-per-round");
  assert.ok(out.includes("build.baseline-tests: fast"));
  assert.ok(out.includes("github.issues: false"));
  assert.ok(out.includes("tiers.min: sonnet"));
  assert.ok(out.includes("tiers.max: opus"));
});

for (const value of ["ALL", "11", "0"]) {
  test(`a local questions-per-round of ${value} leaves the shared value in --questions`, () => {
    assert.equal(run(["--questions"], SHARED, `planning:\n  questions-per-round: ${value}\n`), "7\n");
  });
}

test("the ignored keys are every other group child and every column-0 key with a value, in file order, each once", () => {
  const local = "name: x\nbuild:\n  memory: true\n  qa: true\n  memory: false\nname: y\nbranching:\n  mode: off\n";
  assert.equal(lines([], null, local)[1], "# local: none | ignored: name, build.memory, build.qa, branching.mode");
});

test("a deeper line, a group with no value alone and a comment are neither read nor named", () => {
  const local = "# note\nbuild:\n  memory: true\n    deep: 1\n  # c: 1\nempty:\n";
  assert.equal(lines([], null, local)[1], "# local: none | ignored: build.memory");
});

test("the first assignment of an overridable key wins, even when invalid", () => {
  const local = "tiers:\n  min: bad\n  min: opus\n";
  const out = lines([], SHARED, local);
  assert.equal(out[1], "# local: none | ignored: tiers.min");
  assert.ok(out.includes("tiers.min: sonnet"));
});

test("the min above max reset runs on the merged range (a local min above the shared max)", () => {
  const out = lines([], SHARED, "tiers:\n  min: fable\n");
  assert.ok(out.includes("tiers.min: haiku"));
  assert.ok(out.includes("tiers.max: opus"));
  assert.equal(out[1], "# local: tiers.min | ignored: none");
});

test("two local values valid on their own but inverted together reset to haiku and opus", () => {
  const out = lines([], null, "tiers:\n  min: fable\n  max: sonnet\n");
  assert.ok(out.includes("tiers.min: haiku"));
  assert.ok(out.includes("tiers.max: opus"));
});

test("a local file that exists and cannot be read prints none twice and leaves the shared values", () => {
  const out = lines([], SHARED, "tiers:\n  min: opus\n", true);
  assert.equal(out[1], "# local: none | ignored: none");
  assert.ok(out.includes("tiers.min: sonnet"));
});

test("no local file prints no local line", () => {
  assert.ok(!run([], SHARED, null).includes("# local:"));
});

const REPORT_SHARED = "branching:\n  mode: off\nbuild:\n  red-check-tests: a/\n  red-check-links: x y\n";
const REPORT_LOCAL = "branching:\n  mode: required\nbuild:\n  red-check-tests: q\n  red-check-links: z\n";

for (const [flag, expected] of [
  ["--branching", "mode: off\n"],
  ["--red-check", "red-check.tests: a/\nred-check.links: x y\n"],
]) {
  test(`${flag} prints the shared values with a local file setting other ones (the local file overrides only five keys)`, () => {
    assert.equal(run([flag], REPORT_SHARED, REPORT_LOCAL), expected);
  });
}

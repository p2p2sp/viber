/*
 * reports.unit.test.ts - the --red-check, --questions and --specifications
 * reports of the config, through runConfig on fake ports.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runConfig } from "../../../viber/lib/config/run.ts";

const TESTS =
  "__tests__/ tests/ test/ *.Tests/ *.UnitTests/ *.IntegrationTests/ *.test.* *.spec.* test_*.py *_test.py *_test.go *Test.java *Test.kt conftest.py testdata/ __mocks__/ __fixtures__/ fixtures/ jest.config.* vitest.config.*";

function report(flag: string, yml: string | null): string {
  const files: Record<string, string> = yml === null ? {} : { "/w/.claude/viber.yml": yml };
  return runConfig([flag], "/w", { fs: fakeFs(files), git: fakeGit(null) });
}

test("--red-check with no file prints the two default lists", () => {
  assert.equal(report("--red-check", null), `red-check.tests: ${TESTS}\nred-check.links: node_modules\n`);
});

test("a red-check list is cut at the first blank followed by #, its entries joined by one space", () => {
  const yml = "build:\n  red-check-tests:   a/   *.t.*  # note\n  red-check-links: x   y\n";
  assert.equal(report("--red-check", yml), "red-check.tests: a/ *.t.*\nred-check.links: x y\n");
});

test("a red-check list keeps a # with no blank before it as part of its entry (only a blank then # opens a comment)", () => {
  const yml = "build:\n  red-check-links: a#b c\n";
  assert.equal(report("--red-check", yml), `red-check.tests: ${TESTS}\nred-check.links: a#b c\n`);
});

test("an empty red-check value and a comment alone give the default list", () => {
  const yml = "build:\n  red-check-tests:\n  red-check-links: # none\n";
  assert.equal(report("--red-check", yml), `red-check.tests: ${TESTS}\nred-check.links: node_modules\n`);
});

for (const [value, expected] of [
  ["10", "10"],
  ["all", "all"],
  ["3 # few", "3"],
  ["3#x", "3"],
  ["3 x", "3"],
  ["0", "5"],
  ["11", "5"],
  ["ALL", "5"],
  ["", "5"],
] as const) {
  test(`--questions reads '${value}' as ${expected}`, () => {
    assert.equal(report("--questions", `planning:\n  questions-per-round: ${value}\n`), `${expected}\n`);
  });
}

test("--questions with no file prints 5", () => {
  assert.equal(report("--questions", null), "5\n");
});

test("--specifications prints the directory name the block resolves", () => {
  assert.equal(report("--specifications", "directories:\n  specifications: archive # x\n"), "archive\n");
});

test("--specifications prints specs for an invalid name", () => {
  assert.equal(report("--specifications", "directories:\n  specifications: ..\n"), "specs\n");
});

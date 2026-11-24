/*
 * block.unit.test.ts - the resolved block of viber.yml: the reading of each
 * switch, of build.baseline-tests and of the title, directory and tier lines.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { resolveBlock } from "../../../viber/lib/config/block.ts";

const switchCases: [string, string, string][] = [
  ["true as a child of its own group", "build:\n  memory: true\n", "true"],
  ["true in capitals", "build:\n  memory: TRUE\n", "true"],
  ["true ended by a comment", "build:\n  memory: true# on\n", "true"],
  ["true ended by a blank", "build:\n  memory: true on\n", "true"],
  ["true at the end of the last line with no newline", "build:\n  memory: true", "true"],
  ["a value running on from true", "build:\n  memory: trueish\n", "false"],
  ["a column-0 key", "memory: true\n", "false"],
  ["a child of another group", "planning:\n  memory: true\n", "false"],
  ["a group spelled in another case", "Build:\n  memory: true\n", "false"],
  ["the first assignment being false", "build:\n  memory: false\n  memory: true\n", "false"],
];
for (const [name, text, want] of switchCases) {
  test(`build.memory reads ${want} for ${name}`, () => {
    assert.ok(resolveBlock(text).includes(`build.memory: ${want}`));
  });
}

const baselineCases: [string, string][] = [
  ["full", "full"],
  ["FULL", "full"],
  ["true", "full"],
  ["True", "full"],
  ["fast", "fast"],
  ["Fast", "fast"],
  ["false", "off"],
  ["off", "off"],
  ["sometimes", "off"],
];
for (const [value, want] of baselineCases) {
  test(`build.baseline-tests reads ${want} for the value ${value}`, () => {
    assert.ok(resolveBlock(`build:\n  baseline-tests: ${value}\n`).includes(`build.baseline-tests: ${want}`));
  });
}

const titleCases: [string, string, string][] = [
  ["a double-quoted value kept whole", '"a # b"', "a # b"],
  ["a single-quoted value kept whole", "'[{issue-number}]  x'", "[{issue-number}]  x"],
  ["a quoted value followed by a comment", '"a b" # note', "a b"],
  ["an unterminated quote read as unquoted", '"abc  # note', '"abc'],
  ["an unquoted value cut at a blank and a hash", "fix {summary}   # note", "fix {summary}"],
  ["an unquoted value holding a hash with no blank before it", "a#b", "a#b"],
  ["a comment alone", "# note", "{summary}"],
  ["an empty quote pair", '""', "{summary}"],
];
for (const [name, value, want] of titleCases) {
  test(`github.issue-title reads ${want} for ${name}`, () => {
    const line = resolveBlock(`github:\n  issue-title: ${value}\n`).find((l) => l.startsWith("github.issue-title: "));
    assert.equal(line, `github.issue-title: ${want}`);
  });
}

test("github.pr-title reads its own key, not issue-title", () => {
  assert.ok(resolveBlock('github:\n  issue-title: a\n  pr-title: "[x] {summary}"\n').includes("github.pr-title: [x] {summary}"));
});

const directoryCases: [string, string, string][] = [
  ["a plain name", "directories:\n  runs: work\n", "work"],
  ["a name cut at a blank", "directories:\n  runs: work extra\n", "work"],
  ["a name cut at a hash", "directories:\n  runs: work#x\n", "work"],
  ["the first assignment", "directories:\n  runs: one\n  runs: two\n", "one"],
  ["a name with a character outside the set", "directories:\n  runs: a/b\n", "_specs"],
  ["a single dot", "directories:\n  runs: .\n", "_specs"],
  ["two dots", "directories:\n  runs: ..\n", "_specs"],
  ["a key outside the group", "runs: work\n", "_specs"],
  ["a key under another group", "build:\n  runs: work\n", "_specs"],
];
for (const [name, text, want] of directoryCases) {
  test(`directories.runs reads ${want} for ${name}`, () => {
    assert.ok(resolveBlock(text).includes(`directories.runs: ${want}`));
  });
}

test("directories.specifications reads its own key", () => {
  assert.ok(resolveBlock("directories:\n  specifications: archive\n").includes("directories.specifications: archive"));
});

const tierCases: [string, string, string][] = [
  ["lower case", "sonnet", "sonnet"],
  ["capitals", "SONNET", "sonnet"],
  ["mixed case", "Opus", "opus"],
  ["a value ended by a comment", "sonnet#x", "sonnet"],
  ["a value ended by a blank", "opus extra", "opus"],
  ["an unknown name", "gpt", "haiku"],
];
for (const [name, value, want] of tierCases) {
  test(`tiers.min reads ${want} for ${name}`, () => {
    assert.ok(resolveBlock(`tiers:\n  min: ${value}\n`).includes(`tiers.min: ${want}`));
  });
}

test("tiers.max gives opus for an unknown name", () => {
  assert.ok(resolveBlock("tiers:\n  max: gpt\n").includes("tiers.max: opus"));
});

test("tiers.max reads fable in capitals", () => {
  assert.ok(resolveBlock("tiers:\n  max: FABLE\n").includes("tiers.max: fable"));
});

test("tiers.min above tiers.max gives both defaults", () => {
  const lines = resolveBlock("tiers:\n  min: fable\n  max: sonnet\n");
  assert.deepEqual(
    lines.filter((l) => l.startsWith("tiers.")),
    ["tiers.min: haiku", "tiers.max: opus"],
  );
});

test("tiers.min equal to tiers.max is kept", () => {
  const lines = resolveBlock("tiers:\n  min: sonnet\n  max: sonnet\n");
  assert.deepEqual(
    lines.filter((l) => l.startsWith("tiers.")),
    ["tiers.min: sonnet", "tiers.max: sonnet"],
  );
});

test("build.baseline-tests reads off as a column-0 key", () => {
  assert.ok(resolveBlock("baseline-tests: full\n").includes("build.baseline-tests: off"));
});

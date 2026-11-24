/*
 * block.unit.test.ts - the resolved block of viber.yml: the reading of each
 * switch and of build.baseline-tests.
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

test("build.baseline-tests reads off as a column-0 key", () => {
  assert.ok(resolveBlock("baseline-tests: full\n").includes("build.baseline-tests: off"));
});

/*
 * branching.unit.test.ts - the --branching report: the mode line, the entry and
 * map lines, the error lines in their order, and the mode the block carries.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { resolveBranching } from "../../../viber/lib/config/branching.ts";
import { runConfig } from "../../../viber/lib/config/run.ts";

const ENTRY = "  work:\n    main:\n      base: main\n      name: feat/{issue-number}\n      target: main\n";
const MAIN_LINE = "entry: main | base: main | name: feat/{issue-number} | target: main";

const modeCases: [string, string, string][] = [
  ["REQUIRED in capitals", `branching:\n  mode: REQUIRED\n${ENTRY}`, "required"],
  ["a value ended by a comment", `branching:\n  mode: Allowed# c\n${ENTRY}`, "allowed"],
  ["an unknown value", "branching:\n  mode: always\n", "off"],
  ["a mode nested under work", "branching:\n  work:\n    mode: required\n", "off"],
  ["the first assignment winning", `branching:\n  mode: allowed\n  mode: off\n${ENTRY}`, "allowed"],
];
for (const [name, text, want] of modeCases) {
  test(`the mode reads ${want} for ${name}`, () => {
    assert.equal(resolveBranching(text)[0], `mode: ${want}`);
  });
}

const bareReportCases: [string, string | null, string[]][] = [
  ["no file", null, ["mode: off"]],
  ["no branching group", "planning:\n  adr: true\n", ["mode: off"]],
  ["mode off and no entry", "branching:\n  mode: off\n", ["mode: off"]],
  ["mode required and no entry", "branching:\n  mode: required\n", ["mode: required", "error: no valid branching.work entry"]],
];
for (const [name, text, want] of bareReportCases) {
  test(`with ${name} the report is ${JSON.stringify(want)} (only a mode other than off needs a valid entry)`, () => {
    assert.deepEqual(resolveBranching(text), want);
  });
}

test("one entry line per valid work entry, in file order, with a quoted name stripped and CRLF endings read", () => {
  const text =
    "branching:\r\n  mode: allowed\r\n  work:\r\n    b:\r\n      base: release/1.x\r\n      name: 'fix/{issue-number}'\r\n      target: dev\r\n" +
    "    a:\r\n      base: main # trunk\r\n      name: \"x\"\r\n      target: main\r\n";
  assert.deepEqual(resolveBranching(text), [
    "mode: allowed",
    "entry: b | base: release/1.x | name: fix/{issue-number} | target: dev",
    "entry: a | base: main | name: x | target: main",
  ]);
});

const entryCases: [string, string, string][] = [
  ["an invalid key", "    'a b':\n      base: main\n      name: n\n      target: main\n", "error: work entry a b: invalid key: a b"],
  ["a missing base", "    e:\n      name: n\n      target: main\n", "error: work entry e: missing base"],
  ["a missing target", "    e:\n      base: main\n      name: n\n", "error: work entry e: missing target"],
  ["an invalid base starting with a slash", "    e:\n      base: /main\n      name: n\n      target: main\n", "error: work entry e: invalid base: /main"],
  ["a target holding two dots", "    e:\n      base: main\n      name: n\n      target: a..b\n", "error: work entry e: invalid target: a..b"],
  ["a name holding a blank inside quotes", "    e:\n      base: main\n      name: \"a b\"\n      target: main\n", 'error: work entry e: invalid name: "a'],
  ["the {issue} placeholder", "    e:\n      base: main\n      name: f/{issue}\n      target: main\n", "error: work entry e: {issue} is now {issue-number}"],
];
for (const [name, body, want] of entryCases) {
  test(`a work entry with ${name} is dropped and prints its error`, () => {
    assert.deepEqual(resolveBranching(`branching:\n  work:\n${body}`), ["mode: off", want]);
  });
}

test("the errors of one entry come in base, name, target order", () => {
  const out = resolveBranching("branching:\n  work:\n    e:\n      target: -x\n      name: 'a b'\n      base: ../x\n");
  assert.deepEqual(out.slice(1), [
    "error: work entry e: invalid base: ../x",
    "error: work entry e: invalid name: 'a",
    "error: work entry e: invalid target: -x",
  ]);
});

test("a mapping naming a valid entry prints a map line, even written above the entries; one naming none prints its error after every entry and map line", () => {
  const text =
    "branching:\n  mode: allowed\n  issue-type-mappings:\n    Bug: main\n    \"Big Task\": 'main'\n    Feature: nope\n" + ENTRY;
  assert.deepEqual(resolveBranching(text), [
    "mode: allowed",
    MAIN_LINE,
    "map: Bug | main",
    "map: Big Task | main",
    "error: issue-type-mappings: Feature names no work entry: nope",
  ]);
});

test("a mapping naming a dropped entry prints its error and no map line, and a mode other than off whose every entry is dropped has no valid entry", () => {
  const text = "branching:\n  mode: required\n  issue-type-mappings:\n    Bug: e\n  work:\n    e:\n      base: main\n      name: n\n";
  assert.deepEqual(resolveBranching(text), [
    "mode: required",
    "error: work entry e: missing target",
    "error: issue-type-mappings: Bug names no work entry: e",
    "error: no valid branching.work entry",
  ]);
});

for (const key of ["base", "name"]) {
  test(`a ${key} directly under branching prints the legacy error before the entry errors`, () => {
    assert.deepEqual(resolveBranching(`branching:\n  ${key}: main\n  work:\n    e:\n      name: n\n`), [
      "mode: off",
      "error: branching.base and branching.name are no longer read - move them into a branching.work entry",
      "error: work entry e: missing base",
      "error: work entry e: missing target",
    ]);
  });
}

const requiredPorts = () => ({
  fs: fakeFs({ "/w/.claude/viber.yml": `branching:\n  mode: required\n${ENTRY}` }),
  git: fakeGit(null),
});

test("--branching prints the report, every line ended by a newline", () => {
  assert.equal(runConfig(["--branching"], "/w", requiredPorts()), `mode: required\n${MAIN_LINE}\n`);
});

test("the block carries the branching mode the report prints", () => {
  assert.ok(runConfig([], "/w", requiredPorts()).endsWith("\nbranching.mode: required\n"));
});

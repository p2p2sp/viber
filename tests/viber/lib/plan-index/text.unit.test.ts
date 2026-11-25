/*
 * text.unit.test.ts - how plan text is read: the fences a heading-looking line
 * hides in, the clauses of a DoD, the criteria of a Covers and the command of a
 * Verification.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { clausesOf, commandOf, criteriaOf, fenceReader } from "../../../../viber/lib/plan-index/text.ts";

// [label, lines, the ones inside a fence]
const FENCES: Array<[string, string[], string[]]> = [
  ["a fence runs to a bare line of its own character", ["```md", "## A", "~~~", "```", "## B"], ["```md", "## A", "~~~", "```"]],
  ["a tilde fence is not closed by backticks", ["~~~", "```", "## A", "~~~", "## B"], ["~~~", "```", "## A", "~~~"]],
  ["a four-backtick fence holds a three-backtick line", ["````md", "```", "## A", "````", "## B"], ["````md", "```", "## A", "````"]],
  ["a comment opened outside a fence runs to its arrow and opens no fence", ["<!-- guidance", "```", "-->", "## B"], []],
  ["a comment opener inside a fence is text", ["```", "<!-- slot", "```", "## B"], ["```", "<!-- slot", "```"]],
];
for (const [label, lines, inside] of FENCES) {
  test(`fenceReader: ${label}`, () => {
    const fenced = fenceReader();
    assert.deepEqual(lines.filter((line) => fenced(line)), inside);
  });
}

// [DoD value, clauses]
const CLAUSES: Array<[string, string[]]> = [
  ["it works", ["it works"]],
  ["the endpoint answers 200;  a bad password answers 401 ; ", ["the endpoint answers 200", "a bad password answers 401"]],
  ["the rule `color: red; font-weight: 600` is applied; the page renders", ["the rule `color: red; font-weight: 600` is applied", "the page renders"]],
  ["`a; b` holds; it's one backtick ` here; and done", ["`a; b` holds", "it's one backtick ` here", "and done"]],
];
for (const [value, clauses] of CLAUSES) {
  test(`clausesOf cuts "${value}" on each semicolon outside a backtick span, the empty clauses dropped`, () => {
    assert.deepEqual(clausesOf(value), clauses);
  });
}

// [Covers value, criteria]
const COVERS: Array<[string, string[]]> = [
  ["AC1, AC2", ["1", "2"]],
  ["AC1 (see S2)", ["1"]],
  ["#1 3", []],
];
for (const [value, criteria] of COVERS) {
  test(`criteriaOf counts only the AC<n> tokens of "${value}"`, () => {
    assert.deepEqual(criteriaOf(value), criteria);
  });
}

// [Verification value, command]
const COMMANDS: Array<[string, string]> = [
  ["npm test -> green", "npm test"],
  ["npm test", "npm test"],
  ["`cmd a` -> all pass", "cmd a"],
  ["` echo `x` y ` -> all pass", "echo `x` y"],
  ["echo `a` `b` -> all pass", "echo `a` `b`"],
];
for (const [value, command] of COMMANDS) {
  test(`commandOf reads "${value}" as ${command} (a wrapped command made red-check always fail)`, () => {
    assert.equal(commandOf(value), command);
  });
}

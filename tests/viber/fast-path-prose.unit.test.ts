/*
 * Root cause: intent's fast path (`fast-path.true.md`) skipped the plan for a small fix, so the build close never
 * recorded what a code-audit or pull-request-review fix taught.
 * Expected: the one "Never for ..." exclusion also names an input whose `Attachment:` line points to a
 * code-auditor `findings.md` or a pr-feedback `review.md`, extended in place, and keeps its earlier exclusions.
 * The fragment is the product text of the skill, so the tests read it as text.
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FRAGMENT = path.resolve(import.meta.dirname, "../../viber/skills/intent/fragments/fast-path.true.md");

function lines(): string[] {
  return fs.readFileSync(FRAGMENT, "utf8").split(/\r?\n/);
}

function neverBullets(): string[] {
  return lines().filter((line) => line.startsWith("- Never for"));
}

test("the single 'Never for' exclusion names a code-auditor findings.md under an Attachment: line", () => {
  const bullets = neverBullets();
  assert.equal(bullets.length, 1);
  assert.match(bullets[0], /`Attachment:`/);
  assert.match(bullets[0], /`findings\.md`/);
  assert.match(bullets[0], /\.temp\/viber\/code-auditor\//);
});

test("the single 'Never for' exclusion names a pr-feedback review.md under an Attachment: line", () => {
  const bullets = neverBullets();
  assert.equal(bullets.length, 1);
  assert.match(bullets[0], /`review\.md`/);
  assert.match(bullets[0], /\.temp\/viber\/pr-feedback\//);
});

test("the audit and review exclusion adds no bullet beside the existing exclusions (five bullets open the fragment)", () => {
  const head = lines().slice(0, lines().indexOf("The design:"));
  const bullets = head.filter((line) => line.startsWith("- "));
  assert.equal(bullets.length, 5);
});

test("the 'Never for' exclusion still names a returning draft and a roadmap.md", () => {
  const bullets = neverBullets();
  assert.equal(bullets.length, 1);
  assert.match(bullets[0], /returning draft/);
  assert.match(bullets[0], /`roadmap\.md`/);
});

test("the branching exclusion still keeps every settled entry but off, no branch and current: on the full road", () => {
  const bullet = lines().find((line) => line.startsWith("- Only under `branching.mode: off`")) ?? "";
  assert.match(bullet, /"no branch"/);
  assert.match(bullet, /"build on `current:`"/);
  assert.match(bullet, /keeps the full road/);
});

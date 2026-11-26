/*
 * ui-tells.unit.test.ts - holds the UI tells checklist the task agents read to its contract.
 *
 * `viber/references/ui-tells.md` is read by `task-coder` and `task-reviewer` instead of
 * `ui-designer`'s `anti-slop.md`. It must carry exactly the `##` headings of `anti-slop.md`,
 * stay within 4096 bytes and never carry a phrase written for ui-designer's context or an em
 * or en dash. The files read here are shipped reference markdown, whose text is the behaviour.
 * Every rule is a pure function with a case on a synthetic sample proving it fires.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/ui-tells.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

const MAX_BYTES = 4096;
const BANNED = ["SKILL.md", "Scope discipline", "this skill", "—", "–"];

function read(rel: string): string {
  return fs.readFileSync(path.join(VIBER, rel), "utf8");
}

function headings(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim());
}

function missingFrom(reference: string, checklist: string): string[] {
  const have = headings(checklist);
  return headings(reference).filter((heading) => !have.includes(heading));
}

function extraIn(reference: string, checklist: string): string[] {
  return missingFrom(checklist, reference);
}

function overBudget(text: string): boolean {
  return Buffer.byteLength(text, "utf8") > MAX_BYTES;
}

function bannedIn(text: string): string[] {
  return BANNED.filter((phrase) => text.includes(phrase));
}

const ANTI_SLOP = read("skills/ui-designer/references/anti-slop.md");
const CHECKLIST = read("references/ui-tells.md");
const CODER = read("agents/task-coder.md");
const REVIEWER = read("agents/task-reviewer.md");

const SAMPLE_REFERENCE = "# T\n\n## Layout tells\n\n- a\n\n## Hero discipline\n\n- b\n";

test("the checklist carries every ## heading of anti-slop.md", () => {
  assert.deepEqual(missingFrom(ANTI_SLOP, CHECKLIST), []);
});

test("the checklist carries no ## heading anti-slop.md lacks", () => {
  assert.deepEqual(extraIn(ANTI_SLOP, CHECKLIST), []);
});

test("the checklist is at most 4096 bytes", () => {
  assert.equal(overBudget(CHECKLIST), false);
});

test("the checklist contains no banned phrase and no em or en dash", () => {
  assert.deepEqual(bannedIn(CHECKLIST), []);
});

test("a checklist missing a heading of the reference is reported as missing it", () => {
  assert.deepEqual(missingFrom(SAMPLE_REFERENCE, "# T\n\n## Layout tells\n\n- a\n"), ["Hero discipline"]);
});

test("a checklist with a heading the reference lacks is reported as carrying it", () => {
  assert.deepEqual(extraIn(SAMPLE_REFERENCE, `${SAMPLE_REFERENCE}\n## Extra\n\n- c\n`), ["Extra"]);
});

test("a checklist of 4097 bytes is over budget and one of 4096 bytes is not", () => {
  assert.deepEqual([overBudget("a".repeat(4097)), overBudget("a".repeat(4096))], [true, false]);
});

test("a multi-byte character counts by its bytes toward the budget", () => {
  assert.equal(overBudget("é".repeat(2049)), true);
});

test("a sample naming SKILL.md, Scope discipline or this skill is reported", () => {
  assert.deepEqual(bannedIn("see SKILL.md, Scope discipline, this skill"), ["SKILL.md", "Scope discipline", "this skill"]);
});

test("a sample holding an em dash and an en dash is reported for both", () => {
  assert.deepEqual(bannedIn("a — b – c"), ["—", "–"]);
});

test("the dash line of the checklist binds visible interface copy only", () => {
  const line = CHECKLIST.split(/\r?\n/).find((l) => l.startsWith("- Em and en dashes")) ?? "";
  assert.ok(line.includes("visible interface copy"));
  assert.ok(line.includes("binds interface copy only"));
});

test("task-coder reads the checklist and names anti-slop.md nowhere", () => {
  assert.ok(CODER.includes("`<refs>/ui-tells.md`"));
  assert.equal(CODER.includes("anti-slop"), false);
});

test("task-reviewer judges a tell from the checklist and names anti-slop.md nowhere", () => {
  assert.ok(REVIEWER.includes("`<refs>/ui-tells.md`"));
  assert.equal(REVIEWER.includes("anti-slop"), false);
});

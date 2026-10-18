/*
 * root-cause-prose.unit.test.ts - pins the optional `## Root cause` section of both
 * planner spec templates and the `plan-rules.md` bullet that gates it.
 *
 * A plan built from a `viber:fixer` diagnosis or from code-auditor findings carries the
 * section so the build close can hand the root cause to `memory-writer`; any other plan
 * drops it. The files read here are shipped prompts and templates, whose text is the
 * behaviour. `plan-index.sh` reads four anchor lines from each template, so the new
 * section must leave them in place. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/root-cause-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../viber");
const LITE = fs.readFileSync(path.join(ROOT, "skills/planner/templates/spec-lite.md"), "utf8");
const FULL = fs.readFileSync(path.join(ROOT, "skills/planner/templates/spec-full.md"), "utf8");
const RULES = fs.readFileSync(path.join(ROOT, "references/plan-rules.md"), "utf8");

const HEADING = "## Root cause";
const ACCEPTANCE = "## Acceptance criteria";

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function section(text: string): string {
  const all = lines(text);
  const start = all.indexOf(HEADING);
  const rest = all.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return rest.slice(0, end).join("\n");
}

function rootCauseBullets(): string[] {
  return lines(RULES).filter((l) => l.startsWith("- Root cause:"));
}

test("spec-lite.md carries `## Root cause` above `## Acceptance criteria` (a fix plan has no place for its diagnosis otherwise)", () => {
  const all = lines(LITE);
  assert.ok(all.includes(HEADING));
  assert.ok(all.indexOf(HEADING) < all.indexOf(ACCEPTANCE));
});

test("spec-full.md carries `## Root cause` above `## Acceptance criteria` (a fix plan has no place for its diagnosis otherwise)", () => {
  const all = lines(FULL);
  assert.ok(all.includes(HEADING));
  assert.ok(all.indexOf(HEADING) < all.indexOf(ACCEPTANCE));
});

test("spec-lite.md's Root cause comment names viber:fixer, .temp/viber/code-auditor/ and the drop otherwise (the planner keeps the section only for those two inputs)", () => {
  const body = section(LITE);
  assert.ok(body.includes("`viber:fixer`"), body);
  assert.ok(body.includes("`.temp/viber/code-auditor/`"), body);
  assert.ok(body.includes("drop"), body);
});

test("spec-full.md's Root cause comment names viber:fixer, .temp/viber/code-auditor/ and the drop otherwise (the planner keeps the section only for those two inputs)", () => {
  const body = section(FULL);
  assert.ok(body.includes("`viber:fixer`"), body);
  assert.ok(body.includes("`.temp/viber/code-auditor/`"), body);
  assert.ok(body.includes("drop"), body);
});

test("spec-lite.md keeps the four anchor lines plan-index.sh reads (a missing one breaks the split)", () => {
  const all = lines(LITE);
  assert.deepEqual(
    ["## Goal", "## Acceptance criteria", "### File map", "### Out of scope"].filter((a) => !all.includes(a)),
    [],
  );
});

test("spec-full.md keeps the four anchor lines plan-index.sh reads (a missing one breaks the split)", () => {
  const all = lines(FULL);
  assert.deepEqual(
    ["## Goal", "## Acceptance criteria", "### File map", "### Out of scope"].filter((a) => !all.includes(a)),
    [],
  );
});

test("plan-rules.md carries exactly one Root cause bullet (a second would be paid on every planner round)", () => {
  assert.equal(rootCauseBullets().length, 1);
});

test("the Root cause bullet is tagged (review) (no script checks the section)", () => {
  assert.ok(rootCauseBullets()[0]?.endsWith("(review)"), rootCauseBullets()[0]);
});

test("the Root cause bullet requires the section for a viber:fixer diagnosis and for code-auditor findings (those are the inputs that know a cause)", () => {
  const bullet = rootCauseBullets()[0] ?? "";
  assert.ok(bullet.includes("`viber:fixer`"), bullet);
  assert.ok(bullet.includes("code-auditor"), bullet);
  assert.ok(bullet.includes("`## Root cause`"), bullet);
});

test("the Root cause bullet makes the section's presence a finding for any other input (a pr-feedback or feature plan has no diagnosed cause)", () => {
  const bullet = rootCauseBullets()[0] ?? "";
  assert.ok(bullet.includes("any other"), bullet);
});

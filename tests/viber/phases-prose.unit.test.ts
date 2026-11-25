/*
 * phases-prose.unit.test.ts - pins the prose that shows a finished build's next
 * phase on screen in both close forms of `implementor`.
 *
 * An archived build prints a fixed short close instead of its final summary, which
 * goes only into `outcome.md`: the next-phase line must be part of that printed close,
 * or a build with a later phase left ends without naming it. Both spec templates carry
 * the `## Phases` section the split cuts into phases.md, with room for a later phase's
 * settled decisions. The files read here are a shipped prompt and shipped templates,
 * whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/phases-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SKILL = fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/skills/implementor/parts/close.md"), "utf8");

const ARCHIVED_NEXT = "`/viber:intent <path>/phases.md`";
const SCREEN_NEXT = "`/viber:intent <dir>/phases.md`";

function line(prefix: string): string {
  return SKILL.split(/\r?\n/).find((l) => l.startsWith(prefix)) ?? "";
}

test("the archived close prints the next-phase line after its two lines when the index carries next: phase (the archived summary reaches only outcome.md, so the screen would never name the next phase)", () => {
  const close = line("- `closeout` returned `VERDICT: ARCHIVED` ->");
  assert.ok(close.includes("`next: phase`"), close);
  assert.ok(close.includes(ARCHIVED_NEXT), close);
});

test("the archived close no longer prints exactly two lines (that count left the next-phase line out)", () => {
  assert.ok(!line("- `closeout` returned `VERDICT: ARCHIVED` ->").includes("exactly two lines"));
});

const CONTINUE = "continue the work with the next phase by the command on the next line";

test("the archived close prints one continuation sentence after the rules line and right before the archived next-phase command (the reader must not take the build for the end of the work)", () => {
  const close = line("- `closeout` returned `VERDICT: ARCHIVED` ->");
  const rules = close.indexOf("`/viber:rules extend");
  const sentence = close.indexOf(CONTINUE);
  assert.ok(sentence > rules && rules > 0, close);
  assert.ok(close.indexOf("one sentence in the conversation's language") > rules, close);
  assert.ok(close.indexOf(ARCHIVED_NEXT) > sentence, close);
  assert.ok(!close.slice(sentence, close.indexOf(ARCHIVED_NEXT)).includes("`/viber:"), close);
});

test("the screen form ends on the continuation sentence followed by the screen next-phase command as its last line, with a build not ended on abort", () => {
  const next = line("With a `next: phase` index line");
  const sentence = next.indexOf(CONTINUE);
  assert.ok(next.includes("not ended on `abort`"), next);
  assert.ok(next.indexOf("one sentence in the conversation's language") > 0, next);
  assert.ok(sentence > 0, next);
  assert.ok(next.indexOf(SCREEN_NEXT) > sentence, next);
  assert.ok(next.endsWith("as the last line of the screen form."), next);
});

test("the continuation sentence appears only under a next: phase condition, once per close form", () => {
  const holders = SKILL.split(/\r?\n/).filter((l) => l.includes(CONTINUE));
  assert.equal(holders.length, 2);
  assert.ok(holders.every((l) => l.includes("`next: phase` index line")));
});

test("the final summary's next-phase line belongs to the screen form only (the archived summary is outcome.md, not the screen)", () => {
  const next = line("With a `next: phase` index line");
  assert.ok(next.includes(SCREEN_NEXT), next);
  assert.ok(next.includes("screen form"), next);
  assert.ok(!next.includes("archived form"), next);
});

/** A template's `## Phases` section, heading included, up to the line before the next `## ` heading. */
function phasesSection(template: string): string {
  const body = fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/skills/planner/templates", template), "utf8");
  return body.match(/^## Phases\n[\s\S]*?(?=^## )/m)?.[0] ?? "";
}

/** The entry this plan builds, then a later one carrying an indented decision line. */
const PHASES_SHAPE = /^\d+\. .+ \(this plan\)\n(?:[ \t]+- .*\n)*\d+\. .+\n[ \t]+- \S/m;

test("spec-lite.md carries a (this plan) phase and a later one with an indented decision line (a later phase's settled decisions would otherwise have no place to survive)", () => {
  assert.match(phasesSection("spec-lite.md"), PHASES_SHAPE);
});

test("both spec templates carry the same Phases section (one planner rule writes it, whichever shape the plan takes)", () => {
  assert.equal(phasesSection("spec-full.md"), phasesSection("spec-lite.md"));
});

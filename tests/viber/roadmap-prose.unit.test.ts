/*
 * roadmap-prose.unit.test.ts - pins the prose that shows a finished build's next
 * roadmap part on screen in both close forms of `implementor`.
 *
 * An archived build prints a fixed short close instead of its final summary, which
 * goes only into `outcome.md`: the next-part line must be part of that printed close,
 * or a build with a later part left ends without naming it. The file read here is a
 * shipped prompt, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/roadmap-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SKILL = fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/skills/implementor/parts/close.md"), "utf8");

const ARCHIVED_NEXT = "`/viber:intent <path>/roadmap.md`";
const SCREEN_NEXT = "`/viber:intent <dir>/roadmap.md`";

function line(prefix: string): string {
  return SKILL.split(/\r?\n/).find((l) => l.startsWith(prefix)) ?? "";
}

test("the archived close prints the next-part line after its two lines when the index carries next: part (the archived summary reaches only outcome.md, so the screen would never name the next part)", () => {
  const close = line("- `closeout` returned `VERDICT: ARCHIVED` ->");
  assert.ok(close.includes("`next: part`"), close);
  assert.ok(close.includes(ARCHIVED_NEXT), close);
});

test("the archived close no longer prints exactly two lines (that count left the next-part line out)", () => {
  assert.ok(!line("- `closeout` returned `VERDICT: ARCHIVED` ->").includes("exactly two lines"));
});

const CONTINUE = "continue the work with the next roadmap part by the command on the next line";

test("the archived close prints one continuation sentence after the rules line and right before the archived next-part command (the reader must not take the build for the end of the work)", () => {
  const close = line("- `closeout` returned `VERDICT: ARCHIVED` ->");
  const rules = close.indexOf("`/viber:rules extend");
  const sentence = close.indexOf(CONTINUE);
  assert.ok(sentence > rules && rules > 0, close);
  assert.ok(close.indexOf("one sentence in the conversation's language") > rules, close);
  assert.ok(close.indexOf(ARCHIVED_NEXT) > sentence, close);
  assert.ok(!close.slice(sentence, close.indexOf(ARCHIVED_NEXT)).includes("`/viber:"), close);
});

test("the screen form ends on the continuation sentence followed by the screen next-part command as its last line, with a build not ended on abort", () => {
  const next = line("With a `next: part` index line");
  const sentence = next.indexOf(CONTINUE);
  assert.ok(next.includes("not ended on `abort`"), next);
  assert.ok(next.indexOf("one sentence in the conversation's language") > 0, next);
  assert.ok(sentence > 0, next);
  assert.ok(next.indexOf(SCREEN_NEXT) > sentence, next);
  assert.ok(next.endsWith("as the last line of the screen form."), next);
});

test("the continuation sentence appears only under a next: part condition, once per close form", () => {
  const holders = SKILL.split(/\r?\n/).filter((l) => l.includes(CONTINUE));
  assert.equal(holders.length, 2);
  assert.ok(holders.every((l) => l.includes("`next: part` index line")));
});

test("the final summary's next-part line belongs to the screen form only (the archived summary is outcome.md, not the screen)", () => {
  const next = line("With a `next: part` index line");
  assert.ok(next.includes(SCREEN_NEXT), next);
  assert.ok(next.includes("screen form"), next);
  assert.ok(!next.includes("archived form"), next);
});

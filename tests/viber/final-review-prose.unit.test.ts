/*
 * final-review-prose.unit.test.ts - pins the prose that keeps every `CLAUDE.md` out of the
 * final review when `memory` is `true`, because the memory step owns those nodes.
 *
 * `final-reviewer` reports nothing living in a `CLAUDE.md`, through its notes-line rule
 * included; the `final-review.true.md` fragment hands the fix coder a `memory:` line carrying
 * the config block's `build.memory` value; `task-coder` declares that `memory` input (C3) and
 * edits no `CLAUDE.md` on a `review` dispatch when it reads `true`. The files read here are
 * shipped prompts, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/final-review-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(rel: string): string {
  return fs.readFileSync(path.join(VIBER, rel), "utf8");
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start);
  return text.slice(start, end);
}

const REVIEWER = read("agents/final-reviewer.md");
const FRAGMENT = read("skills/implementor/fragments/final-review.true.md");
const CODER = read("agents/task-coder.md");

const FIX_DISPATCH = between(FRAGMENT, "dispatch `viber:task-coder`", "Fix coder `VERDICT: DENIED`");
const MEMORY_LINE = "memory: <the config block's build.memory value>";

function reviewerBullet(start: string): string {
  return lines(REVIEWER).find((line) => line.startsWith(start)) ?? "";
}

function coderMemoryBullet(): string {
  return lines(CODER).find((line) => line.startsWith("- A `memory` line")) ?? "";
}

test("final-reviewer reports no notes line about something living in a CLAUDE.md when memory is true", () => {
  const bullet = reviewerBullet("- every notes line");
  assert.ok(bullet.includes("`CLAUDE.md`"));
  assert.ok(bullet.includes("`memory` is `true`"));
});

test("final-reviewer's CLAUDE.md exclusion names the notes line it covers", () => {
  const sentence = reviewerBullet("Report nothing that lives in a `CLAUDE.md`");
  assert.ok(sentence.includes("when `memory` is `true`"));
  assert.ok(sentence.includes("notes line"));
});

test("the fix coder dispatch of the final review carries a memory line with the build.memory value", () => {
  assert.ok(lines(FIX_DISPATCH).includes(MEMORY_LINE));
});

test("task-coder declares the memory input of a review dispatch, false when the line is missing", () => {
  const bullet = coderMemoryBullet();
  assert.ok(bullet.includes("`memory: <true|false>`"));
  assert.ok(bullet.includes("on a `review` dispatch only"));
  assert.ok(bullet.includes("`false` when the line is missing"));
});

test("task-coder edits no CLAUDE.md on a review dispatch with memory true", () => {
  const bullet = coderMemoryBullet();
  assert.ok(bullet.includes("on a `review` dispatch with `memory` `true`, edit no `CLAUDE.md`"));
});

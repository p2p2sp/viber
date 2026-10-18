/*
 * resume-prose.unit.test.ts - pins the prose that keeps a resumed build from
 * asking about, or dispatching, a task the user already dropped.
 *
 * `plan-index.sh` prints a `dirty:` line for a skipped task whose files carry
 * half-finished work. The `dirty:` bullet of `implementor/SKILL.md` then asks no
 * question and dispatches nothing for a task on the `skipped:` line, leaving its
 * files to the closeout. The file read here is a shipped prompt, whose text is
 * the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/resume-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SKILL = fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/skills/implementor/SKILL.md"), "utf8");

const DIRTY = SKILL.split(/\r?\n/).filter((line) => line.startsWith("- `dirty: <id> | <paths>`"));

test("implementor has exactly one dirty bullet on the index", () => {
  assert.equal(DIRTY.length, 1);
});

test("the dirty bullet gives a task on the skipped line no question and no dispatch, its files left for the closeout", () => {
  assert.ok(
    DIRTY[0].includes(
      "a task on the index's `skipped:` line gets no question and no dispatch, its files left for the closeout",
    ),
  );
});

const ORPHAN = SKILL.split(/\r?\n/).filter((line) => line.startsWith("- `orphan: <path>`"));

test("the orphan bullet of implementor gathers every orphan line into its one question", () => {
  assert.equal(ORPHAN.length, 1);
  assert.ok(ORPHAN[0].includes("every `orphan:` line, one path each"));
  assert.ok(ORPHAN[0].includes("one `AskUserQuestion`"));
});

const CLOSEOUT = fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/agents/closeout.md"), "utf8");

test("closeout reads one path per orphan line and keeps the dirty paths comma-separated", () => {
  assert.ok(CLOSEOUT.includes("`orphan: <path>` lines (one path each, a comma belongs to the path)"));
  assert.ok(CLOSEOUT.includes("the `dirty:` paths comma-separated"));
  assert.ok(!CLOSEOUT.includes("`orphan: <paths>`"));
});

test("the dirty bullet still asks the continue, start over or drop question for any other task", () => {
  assert.ok(DIRTY[0].includes("any other, before the first dispatch, `AskUserQuestion`"));
  assert.ok(DIRTY[0].includes("continue (its coder gets `resume: <paths>` added to its lines)"));
});

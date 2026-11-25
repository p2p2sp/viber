/*
 * final-review-prose.unit.test.ts - pins the prose that keeps every `CLAUDE.md` out of the
 * final review when `memory` is `true`, because the memory step owns those nodes.
 *
 * `final-reviewer` reports nothing living in a `CLAUDE.md`, through its notes-line rule
 * included; the `final-review.true.md` fragment hands the fix coder a `memory:` line carrying
 * the config block's `build.memory` value; `task-coder` declares that `memory` input (C3) and
 * edits no `CLAUDE.md` on a `review` dispatch when it reads `true`. It also holds the
 * rule of a plan note the three build agents share. The files read here are
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

test("final-reviewer holds the rule of a plan note task-coder and task-reviewer hold: advice of the plan review, never a requirement, never above a DoD clause or a Contracts block (an unfollowed note is no finding in itself)", () => {
  const SHARED = "a `DoD` clause or a `Contracts` block";
  const slice = lines(REVIEWER).find((line) => line.startsWith("Read in full: `<run>/spec.md`")) ?? "";
  assert.ok(slice.includes(`A note is advice of the plan review, never a requirement, and never outranks ${SHARED}: one no coder followed is no finding in itself.`));
  assert.ok(CODER.includes(`advice of the plan review that never outranks ${SHARED}`));
  assert.ok(read("agents/task-reviewer.md").includes(`is advice of the plan review, never a requirement: how the coder handled it is a finding only where the handling broke ${SHARED}`));
});

test("the fix coder dispatch of the final review carries a memory line with the build.memory value", () => {
  assert.ok(lines(FIX_DISPATCH).includes(MEMORY_LINE));
});

const SLICE_STEP = between(FRAGMENT, "Run `", "- `VERDICT: DENIED`");

test("the fragment runs plan-index.sh --final-review and sends each block as printed in one message", () => {
  assert.ok(SLICE_STEP.includes('"${CLAUDE_PLUGIN_ROOT}/scripts/plan-index.sh" "<plan>" --final-review'));
  assert.ok(SLICE_STEP.includes("all in one message"));
  assert.ok(SLICE_STEP.includes("as printed"));
});

test("the fragment skips the step on NEXT: skip or an abort, completing its Final review entry", () => {
  const skip = lines(SLICE_STEP).find((line) => line.includes("`NEXT: skip`")) ?? "";
  assert.ok(skip.includes("`abort`"));
  assert.ok(skip.includes("completing its `Final review` entry"));
});

test("the fragment holds no slicing rule and no slice dispatch template", () => {
  assert.equal(FRAGMENT.includes("groups of at most 8"), false);
  assert.equal(FRAGMENT.includes("<slice number>"), false);
  assert.equal(FRAGMENT.includes("<the slice's task ids"), false);
});

test("final-reviewer reads a scope line, runs it and reviews the commits and files it prints", () => {
  const input = between(REVIEWER, "## Input", "## Recheck a fix");
  assert.ok(lines(input).includes("scope: <the plan-index.sh --slice call>"));
  const slice = between(REVIEWER, "## Read your slice", "## What you search for");
  assert.ok(slice.includes("Run your `scope` line"));
  assert.ok(slice.includes("`commit:`"));
  assert.ok(slice.includes("`file:`"));
});

test("final-reviewer holds no rule finding a task's commits by subject", () => {
  assert.equal(REVIEWER.includes("by its subject"), false);
  assert.equal(REVIEWER.includes("<task id>(<n>) - <title>"), false);
});

const RUN_BAN =
  "Run no build, test, type checker or linter, not one file of them: the build's own test run proves those, and a red result on a tree other work shares says nothing about your slice.";

test("final-reviewer's opening paragraph bans every build, test, type checker and linter run right after its read-only git sentence", () => {
  const opening = lines(REVIEWER).find((line) => line.startsWith("You review one slice")) ?? "";
  assert.ok(opening.includes("or `clean`; `git show HEAD:<path>` or `git diff` is how you read a commit's change. " + RUN_BAN));
});

test("final-reviewer calls a finding Blocking on the code it read and states an inference as such, naming no command it ran", () => {
  const calibration = between(REVIEWER, "## Calibration", "An owner finding");
  assert.ok(calibration.includes("Blocking: the code you read shows it breaks behaviour, a test, the build or a consumer."));
  assert.ok(
    calibration.includes(
      "A finding resting on inference rather than on code you read or a search you ran says so in its first line, never stated as fact.",
    ),
  );
  assert.equal(REVIEWER.includes("command you ran"), false);
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

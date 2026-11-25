/*
 * nudge-prose.unit.test.ts - pins that the second-reply nudge for a viber agent
 * ending without its output line lives in the SubagentStop hook alone.
 *
 * `hooks/scripts/verdict-nudge.sh` sends the agent back; the skills and the
 * planner's ADR reference keep only their fallback for a second reply without
 * the line (`REASON: no verdict returned`) and, where they never use
 * `SendMessage` any more, do not list it among their tools. The files read here
 * are shipped prompts, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/nudge-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");
const HOOK = path.join(VIBER, "hooks/scripts/verdict-nudge.sh");

const NUDGE_REASON = "Finish your task, then return your output lines.";

const FIVE = [
  "skills/implementor/SKILL.md",
  "skills/planner/references/adr-tasks.md",
  "skills/memory/SKILL.md",
  "skills/rules/SKILL.md",
  "skills/e2e/SKILL.md",
];

function read(rel: string): string {
  return fs.readFileSync(path.join(VIBER, rel), "utf8");
}

function allowedTools(text: string): string {
  return text.split(/\r?\n/).find((line) => line.startsWith("allowed-tools:")) ?? "";
}

function toolSetSentence(text: string): string {
  return text.split(/\r?\n/).find((line) => line.startsWith("Your whole tool set is")) ?? "";
}

test("verdict-nudge.sh holds the nudge reason text", () => {
  assert.ok(fs.readFileSync(HOOK, "utf8").includes(NUDGE_REASON));
});

for (const rel of FIVE) {
  test(`${rel} does not hold the nudge reason text (the hook sends the agent back)`, () => {
    assert.ok(!read(rel).includes(NUDGE_REASON));
  });

  test(`${rel} keeps its fallback naming no verdict returned`, () => {
    assert.ok(read(rel).includes("no verdict returned"));
  });
}

for (const rel of ["skills/memory/SKILL.md", "skills/rules/SKILL.md"]) {
  test(`${rel} names SendMessage not in allowed-tools`, () => {
    assert.ok(!allowedTools(read(rel)).includes("SendMessage"));
  });

  test(`${rel} names SendMessage not in its whole tool set sentence`, () => {
    const sentence = toolSetSentence(read(rel));
    assert.ok(sentence.startsWith("Your whole tool set is"));
    assert.ok(!sentence.includes("SendMessage"));
  });
}

test("planner/SKILL.md keeps SendMessage in allowed-tools (it continues its plan writer)", () => {
  const line = allowedTools(read("skills/planner/SKILL.md"));
  assert.ok(line.startsWith("allowed-tools:"));
  assert.ok(line.includes("SendMessage"));
});

test("planner/SKILL.md keeps its sentence forbidding a SendMessage to an earlier judge", () => {
  assert.ok(read("skills/planner/SKILL.md").includes("never a `SendMessage` to an earlier judge"));
});

for (const rel of ["skills/implementor/SKILL.md", "skills/e2e/SKILL.md"]) {
  test(`${rel} keeps SendMessage in allowed-tools`, () => {
    assert.ok(allowedTools(read(rel)).includes("SendMessage"));
  });

  test(`${rel} keeps its background-process rule`, () => {
    assert.ok(read(rel).includes("stopped with background work of its own still running"));
  });
}

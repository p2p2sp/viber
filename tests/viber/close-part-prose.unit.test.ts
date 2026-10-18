/*
 * close-part-prose.unit.test.ts - pins the split of `implementor` into its body and
 * its `close` part.
 *
 * Steps 5 to 7 (the final test run, the close that records what the build taught, the
 * archive) and their switch fragments live in `parts/close.md`, which `skill-part.sh`
 * prints on demand, so the body held through step 4 carries none of that text. The body
 * keeps one pointer that fetches the part before the first action of step 5, 6 or 7,
 * and step 3 creates the close entries of the task list from the config block's lines,
 * never from text loaded later. The files read here are shipped prompts, whose text is
 * the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/close-part-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SKILL_DIR = path.resolve(import.meta.dirname, "../../viber/skills/implementor");

const SKILL = fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");
const PART = fs.readFileSync(path.join(SKILL_DIR, "parts/close.md"), "utf8");

const PART_CALL = '"${CLAUDE_PLUGIN_ROOT}/scripts/skill-part.sh" "${CLAUDE_SKILL_DIR}" "close"';
const POINTER_HEADING = "## 5 to 7. Close and archive";

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function allowedTools(): string {
  return lines(SKILL).find((line) => line.startsWith("allowed-tools:")) ?? "";
}

function stepThree(): string {
  const start = SKILL.indexOf("## 3. Profile the tasks");
  return SKILL.slice(start, SKILL.indexOf("## 4. Run the plan"));
}

function pointer(): string {
  return SKILL.slice(SKILL.indexOf(POINTER_HEADING));
}

test("the close part opens on the step 5 heading", () => {
  assert.ok(PART.startsWith("## 5. Close\n"));
});

test("the close part holds the step 6 and step 7 headings", () => {
  const headings = lines(PART).filter((line) => line.startsWith("## "));
  assert.deepEqual(headings, ["## 5. Close", "## 6. Record what the build taught", "## 7. Archive and close"]);
});

test("the close part keeps its seven switch fragment calls in order", () => {
  const calls = lines(PART).filter((line) => line.includes("/scripts/switch-text.sh"));
  const expected = [
    ["build.final-review", "final-review"],
    ["build.baseline-tests", "baseline-close"],
    ["build.memory", "memory"],
    ["build.rules", "rules"],
    ["build.qa", "qa"],
    ["build.extensions", "extensions"],
    ["build.cleanup", "cleanup"],
  ].map(([key, name]) => `"\${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" ${key} "\${CLAUDE_SKILL_DIR}" ${name}`);
  assert.deepEqual(calls, expected);
});

test("the body holds no heading of step 5, 6 or 7", () => {
  const headings = lines(SKILL).filter((line) => /^## [567]\./.test(line));
  assert.deepEqual(headings, []);
});

test("the body holds no closing sentence text", () => {
  assert.ok(!SKILL.includes("Closing sentence"));
});

test("the body calls no switch fragment of the close", () => {
  const names = ["final-review", "baseline-close", "memory", "rules", "qa", "extensions", "cleanup"];
  const calls = lines(SKILL).filter((line) => line.includes("/scripts/switch-text.sh"));
  assert.deepEqual(
    calls.filter((line) => names.some((name) => line.endsWith(` ${name}`))),
    [],
  );
});

test("the body keeps its baseline-run fragment call in step 4", () => {
  assert.ok(SKILL.includes('switch-text.sh" build.baseline-tests "${CLAUDE_SKILL_DIR}" baseline-run'));
});

test("the body holds exactly one skill-part call, the one for the close part", () => {
  const calls = lines(SKILL).filter((line) => line.includes("skill-part.sh") && !line.startsWith("allowed-tools:"));
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes(`\`${PART_CALL}\``));
});

test("the body holds one heading for the pointer, after step 4", () => {
  assert.equal(lines(SKILL).filter((line) => line === POINTER_HEADING).length, 1);
  assert.ok(SKILL.indexOf(POINTER_HEADING) > SKILL.indexOf("## 4. Run the plan"));
});

test("the pointer call sits under the pointer heading", () => {
  assert.ok(pointer().includes(PART_CALL));
});

test("the pointer runs the call before the first action of step 5, 6 or 7, an abort reaching step 7 included", () => {
  const text = pointer();
  assert.ok(text.includes("before the first action of step 5, 6 or 7"));
  assert.ok(text.includes("`abort`"));
});

test("the pointer stops on a non-zero exit and reports the stderr reason", () => {
  const text = pointer();
  assert.ok(text.includes("non-zero exit"));
  assert.ok(text.includes("stderr reason"));
});

test("allowed-tools lists the skill-part script", () => {
  assert.ok(allowedTools().includes("Bash(${CLAUDE_PLUGIN_ROOT}/scripts/skill-part.sh:*)"));
});

const ENTRIES = [
  ["Final review", "`build.final-review`"],
  ["Update project memory", "`build.memory`"],
  ["Update project rules", "`build.rules`"],
  ["Write QA and E2E scenarios", "`build.qa`"],
  ["Run extensions", "`build.extensions`"],
  ["Archive the run", "`build.cleanup`"],
];

for (const [entry, key] of ENTRIES) {
  test(`step 3 creates the ${entry} entry from the config block's ${key} line`, () => {
    const text = stepThree();
    assert.ok(text.includes(`\`${entry}\``));
    assert.ok(text.includes(key));
  });
}

test("step 3 creates the Run extensions entry with build.extensions-missing too", () => {
  assert.ok(stepThree().includes("`build.extensions-missing`"));
});

test("step 3 always creates the Final test run entry", () => {
  assert.ok(stepThree().includes("`Final test run` always"));
});

test("switch-fragments.md names parts/close.md as where implementor calls its seven close fragments", () => {
  const rule = fs.readFileSync(path.resolve(import.meta.dirname, "../../.claude/rules/viber/switch-fragments.md"), "utf8");
  const sentence = rule.replace(/\s+/g, " ");
  const start = sentence.indexOf("`parts/close.md`");
  assert.ok(start >= 0);
  const names = ["final-review", "baseline-close", "memory", "rules", "qa", "extensions", "cleanup"];
  const tail = sentence.slice(start);
  assert.ok(/calls (`[a-z-]+`(, | and )?)+/.test(tail));
  let at = 0;
  for (const name of names) {
    const found = tail.indexOf(`\`${name}\``, at);
    assert.ok(found >= at, `names ${name} after parts/close.md, in order`);
    at = found;
  }
});

test("step 3 no longer waits on a close part being loaded", () => {
  assert.ok(!stepThree().includes("loaded below"));
});

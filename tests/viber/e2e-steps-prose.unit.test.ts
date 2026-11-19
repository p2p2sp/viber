/*
 * e2e-steps-prose.unit.test.ts - pins the prose of steps 4 and 5 of viber/skills/e2e/SKILL.md:
 * step 4 runs the scripted wait `app-wait.sh` around the model's own launch of the application,
 * step 5 takes its task list and each e2e-writer dispatch block from `qa-ledger.sh`, and step 7
 * shows the table of its `report`.
 *
 * The file read is a shipped prompt, whose text is the behaviour. Nothing is spawned. Each
 * phrase is matched with any run of whitespace between its words, so rewrapping a line breaks
 * no test.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/e2e-steps-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SKILL = fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/skills/e2e/SKILL.md"), "utf8");

function has(text: string): boolean {
  const escaped = text.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("\\s+")).test(SKILL);
}

function step4(): string {
  const start = SKILL.indexOf("## 4. Start the application");
  const end = SKILL.indexOf("## 5.");
  return SKILL.slice(start, end);
}

test("step 4 probes with app-wait.sh and a seconds argument of 0 before any launch", () => {
  assert.ok(step4().includes('"${CLAUDE_SKILL_DIR}/scripts/app-wait.sh" "<base-url>" "0"'));
});

test("step 4 runs the launch command as one background Bash call writing to the printed log path on NEXT: launch", () => {
  assert.ok(has("`NEXT: launch` -> run the launch command as one background Bash call with its output redirected to the printed log path"));
});

test("step 4 waits with app-wait.sh and 120 seconds under a Bash timeout of 600000 milliseconds", () => {
  assert.ok(step4().includes('"${CLAUDE_SKILL_DIR}/scripts/app-wait.sh" "<base-url>" "120"'));
  assert.ok(has("with a Bash timeout of 600000 milliseconds"));
});

test("step 4 answers an ASK: line by asking wait or abort, quoting the log: lines and re-running with the wait value", () => {
  assert.ok(has("`ASK:` -> `AskUserQuestion` quoting its `log:` lines: wait or abort"));
  assert.ok(has("wait runs the script again with the `wait ->` value as the seconds"));
});

test("step 4 never edits the launch command, its config or its ports to make the probe answer", () => {
  assert.ok(has("This project's launch command, its config and its ports are never edited to make the probe answer."));
});

test("the bundled-script line covers the ${CLAUDE_SKILL_DIR}/scripts/ calls too", () => {
  assert.ok(has('`"${CLAUDE_SKILL_DIR}/scripts/<name>.sh" <args>`'));
});

test("allowed-tools lists the app-wait.sh call through ${CLAUDE_SKILL_DIR}", () => {
  const line = SKILL.split(/\r?\n/).find((candidate) => candidate.startsWith("allowed-tools:")) ?? "";
  assert.ok(line.includes("Bash(${CLAUDE_SKILL_DIR}/scripts/app-wait.sh:*)"));
});

test("the skill no longer tells the model to probe with a curl command of its own", () => {
  assert.ok(!SKILL.includes('curl -s -o /dev/null -w "%{http_code}"'));
});

function step5(): string {
  const start = SKILL.indexOf("## 5. Generate the tests");
  const end = SKILL.indexOf("## 6.");
  return SKILL.slice(start, end);
}

test("step 5 creates its tasks from the list call, the file ones completed at creation", () => {
  assert.ok(step5().includes('"${CLAUDE_SKILL_DIR}/scripts/qa-ledger.sh" "<dir>/qa.e2e.md" "list"'));
  assert.ok(has("`TaskCreate` one task per `id:` line, the `file` ones completed at creation"));
});

test("step 5 asks the next call for each dispatch with the spec directory, base URL and accounts, after the scenario just handled", () => {
  assert.ok(
    step5().includes(
      '"${CLAUDE_SKILL_DIR}/scripts/qa-ledger.sh" "<dir>/qa.e2e.md" "next" "--spec-dir" "<the e2e test directory>" "--base-url" "<the base URL>" "--accounts" "<the test accounts and where their credentials live>"',
    ),
  );
  assert.ok(has('adding `"--after" "QA-<nn>"` for the scenario just handled'));
  assert.ok(has("`NEXT: commit` -> go to step 6"));
});

test("step 5 dispatches viber:e2e-writer with the lines below NEXT: dispatch as printed and resends the same block on its one retry", () => {
  assert.ok(has("`Agent` with `subagent_type: viber:e2e-writer`, the lines below `NEXT: dispatch` as printed and nothing else"));
  assert.ok(has("dispatch once more with the same block"));
});

test("step 5 keeps no state reading rule of the Automation section and no labelled line list of its own", () => {
  assert.ok(!SKILL.includes("Read each one's state off the handoff"));
  assert.ok(!SKILL.includes("one labelled line each"));
  assert.ok(!SKILL.includes("`handoff: <dir>/qa.e2e.md`"));
});

function step7(): string {
  return SKILL.slice(SKILL.indexOf("## 7. Report"));
}

test("step 7 runs the report call and shows its table in a code block", () => {
  const text = step7();
  assert.ok(text.includes('"${CLAUDE_SKILL_DIR}/scripts/qa-ledger.sh" "<dir>/qa.e2e.md" "report"'));
  assert.match(text, /```\n\+-+\+[^\n]*\n[\s\S]*?```/);
});

test("step 7 ends on one skipped - <reason> line per scenario the user skipped this pass", () => {
  assert.ok(has("one `skipped - <reason>` line per scenario the user skipped this pass"));
});

test("step 7 keeps no per scenario line rule of its own for file and blocked scenarios", () => {
  assert.ok(!step7().includes("`file <path>`"));
  assert.ok(!step7().includes("`blocked - <reason>`"));
});

test("allowed-tools lists the qa-ledger.sh call through ${CLAUDE_SKILL_DIR}", () => {
  const line = SKILL.split(/\r?\n/).find((candidate) => candidate.startsWith("allowed-tools:")) ?? "";
  assert.ok(line.includes("Bash(${CLAUDE_SKILL_DIR}/scripts/qa-ledger.sh:*)"));
});

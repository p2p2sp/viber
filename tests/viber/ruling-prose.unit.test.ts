/*
 * ruling-prose.unit.test.ts - pins the prose that lets the arbiter write its
 * ruling file and the coder its options file, and `implementor` record rulings and
 * decisions from those files without escaping any text.
 *
 * `arbiter` carries `Write`, takes a `ruling` input line and writes its four output
 * lines to that file; `task-coder` writes its `DECIDE:` line to the file its
 * `decide-file` line names; `implementor` dispatches the arbiter's `ruling:` line
 * and reports each ruling through the `ruled` call of `task-step.sh`, whose RUN lines
 * record it through the `--from`, `--first-of` and fixed-words forms of `commit-task.sh`,
 * whose usage text carries each form. The files read here are shipped prompts and a script
 * usage line, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/ruling-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

const RULING_LINE = "ruling: <dir>/work/ruling-<subject>.md";
const RULED_CALL = '"${CLAUDE_PLUGIN_ROOT}/scripts/task-step.sh" "<plan>" "<subject>" "<started>" ruled --case <case>';

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

function inputBullet(text: string, label: string): string {
  return lines(text).find((line) => line.startsWith(`- A \`${label}\``) || line.startsWith(`- \`${label}:`)) ?? "";
}

const SKILL = `${read("skills/implementor/SKILL.md")}\n${read("skills/implementor/parts/close.md")}`;
const ARBITER = read("agents/arbiter.md");
const CODER = read("agents/task-coder.md");
const COMMIT_TASK = read("scripts/commit-task.sh");

const STEP_4 = between(SKILL, "## 4. Run the plan", "## 5 to 7. Close and archive");
const ARBITER_DISPATCH = between(SKILL, "Arbiter dispatch", "Commit outside a task:");

function recordingLines(): string[] {
  return lines(SKILL).filter((line) => /commit-task\.sh" --(rule|decide)/.test(line));
}

test("arbiter lists the tools Read, Grep, Glob, Write", () => {
  assert.ok(lines(ARBITER).includes("tools: Read, Grep, Glob, Write"));
});

test("arbiter's tools paragraph names Read, Grep, Glob and Write", () => {
  assert.ok(ARBITER.includes("Your tools are Read, Grep, Glob and Write: call each one directly"));
});

test("arbiter names the ruling input line and reads that path first when it exists", () => {
  const bullet = inputBullet(ARBITER, "ruling");
  assert.ok(bullet.startsWith("- `ruling: <path>`"));
  assert.ok(bullet.includes("when it exists, read it first"));
});

test("arbiter writes its four output lines whole to the ruling path before returning them", () => {
  assert.ok(ARBITER.includes("`Write` these four lines whole to your `ruling` path before you return them"));
  const output = between(ARBITER, "## Output", "A tool call the harness refuses");
  for (const prefix of ["`VERDICT: RULED`", "`RULING: ", "`WHY: ", "`COST: "]) {
    assert.ok(output.includes(`- ${prefix}`), prefix);
  }
});

test("arbiter writes no other file and no longer says it changes no files", () => {
  assert.ok(ARBITER.includes("and write no other file"));
  assert.ok(!ARBITER.includes("you change no files"));
  assert.ok(!ARBITER.includes("Read-only"));
});

test("task-coder names the decide-file input line", () => {
  assert.ok(inputBullet(CODER, "decide-file").startsWith("- A `decide-file` line"));
});

test("task-coder reads its options file first when it exists", () => {
  assert.ok(inputBullet(CODER, "decide-file").includes("when it exists, read it first"));
});

test("task-coder writes its DECIDE line to the options file whole whenever it returns one", () => {
  const bullet = inputBullet(CODER, "decide-file");
  assert.ok(bullet.includes("whenever you return a `DECIDE:` line, write that line there whole"));
});

test("task-coder requires every DECIDE option to be later coder work or a recorded ruling, never a step by hand or by the orchestrator", () => {
  const decide = lines(CODER).find((line) => line.startsWith("- on FAIL only: `DECIDE:")) ?? "";
  assert.ok(
    decide.includes(
      "every option is work a later coder attempt does or a ruling the build records, never a step by hand or by the orchestrator",
    ),
  );
});

test("arbiter states what the orchestrator and a coder can do and that nobody acts by hand", () => {
  const actors = between(ARBITER, "## Actors", "## Rule");
  assert.ok(actors.includes("The orchestrator writes and deletes no file and runs only viber's scripts."));
  assert.ok(
    actors.includes(
      "A coder changes files through `Edit` and `Write`, removes a tracked file through `git rm` and an untracked scratch file only through its `SCRATCH:` line.",
    ),
  );
  assert.ok(actors.includes("Nobody acts by hand during a build."));
});

test("arbiter never rules an option no actor can carry out while another option is listed", () => {
  const rule = between(ARBITER, "## Rule", "## Output");
  assert.ok(rule.includes("Never rule an option no actor can carry out while another option is listed"));
});

test("the arbiter dispatch of implementor carries the C7 ruling line", () => {
  assert.ok(ARBITER_DISPATCH.includes(`\`${RULING_LINE}\``));
  assert.equal(lines(SKILL).filter((line) => line.includes("viber:arbiter")).length, 1);
});

test("a refused arbiter the user accepts is reported as the ruled call with --refused, and implementor holds no fixed words of its own", () => {
  assert.ok(ARBITER_DISPATCH.includes("accept` -> the same `ruled` call with `--refused`"));
  assert.ok(!SKILL.includes("the arbiter was refused"));
});

test("the accept answer records an accepted refused arbiter through the ruled call with --refused", () => {
  const accept = lines(SKILL).find((line) => line.startsWith("- `accept`: the user overrides the gate.")) ?? "";
  assert.ok(accept.includes("recorded through the `ruled` call of step 4 with `--refused`"));
});

test("implementor reports every ruling through the ruled call of task-step.sh, adding --options for the four fixed cases", () => {
  assert.ok(ARBITER_DISPATCH.includes(`\`${RULED_CALL}\``));
  assert.ok(ARBITER_DISPATCH.includes('`--options "<a> | <b>"` for the cases `baseline`, `tests`, `final-review` and `commit`'));
});

test("implementor holds no commit-task.sh --rule or --decide call of its own (the RUN: lines of task-step.sh record them)", () => {
  assert.deepEqual(recordingLines(), []);
});

test("each recording form of implementor appears in the usage text of commit-task.sh", () => {
  const usage = lines(COMMIT_TASK).find((line) => line.startsWith('  echo "error: usage:')) ?? "";
  assert.ok(usage.includes("--decide <plan-file> <task-id> --from <ruling-file>"));
  assert.ok(usage.includes("--decide <plan-file> <task-id> --first-of <options-file>"));
  assert.ok(usage.includes("--rule <plan-file> <subject> --from <ruling-file>"));
  assert.ok(usage.includes("--rule <plan-file> <subject> <ruling> <why> <cost>"));
});

test("implementor holds no instruction to rewrite a quote, dollar sign, backtick or backslash", () => {
  assert.ok(!/dollar sign/i.test(SKILL));
  assert.ok(!/rewritten into words/i.test(SKILL));
  assert.ok(!/escaped as for/i.test(SKILL));
  assert.ok(!/\bescap/i.test(SKILL));
});

test("a decide ruling is reported without --options, the options file of the coder being the script's to read", () => {
  assert.ok(ARBITER_DISPATCH.includes("The cases `decide` and `cap` take no `--options`"));
});

const C4_CLOSING = "Continue the task under these decisions, then return your output lines again.";
const FLAT = (text: string): string => text.replace(/\s+/g, " ");
const README = FLAT(read("README.md"));
const HELP_FAILING_TASK = FLAT(between(read("skills/setup/assets/help.html"), 'id="ts-task-fails"', 'id="ts-denied"'));

function bullet(opening: string): string {
  return lines(STEP_4).find((line) => line.startsWith(opening)) ?? "";
}

test("a DECIDE line of the coder is reported as --decide, the arbiter routing being the script's", () => {
  assert.ok(STEP_4.includes("`--decide` for its `DECIDE:` line"));
  assert.ok(!STEP_4.includes("From attempt 2 on"));
});

test("the resume directive sends its lines to the same coder by SendMessage, closing sentence included, the attempt unchanged", () => {
  const resume = bullet("- `NEXT: resume`");
  assert.ok(resume.includes("`SendMessage` that same coder the body lines verbatim"));
  assert.ok(resume.includes("the attempt unchanged"));
});

test("a refused SendMessage is reported as resume-failed, which answers the next attempt with every decision line", () => {
  assert.ok(STEP_4.includes("A refused `SendMessage`: `resume-failed`"));
});

test("task-coder finishes every DoD clause the dispute does not touch before returning DECIDE", () => {
  assert.ok(CODER.includes("Finish every `DoD` clause the dispute does not touch before you return `DECIDE:`"));
});

test("task-coder applies the decision lines of a C4 message and returns its output lines again", () => {
  const bullet = lines(CODER).find((line) => line.includes(C4_CLOSING)) ?? "";
  assert.ok(bullet.startsWith("- A message of `decision:` lines"));
  assert.ok(bullet.includes("apply every `decision:` line"));
  assert.ok(bullet.includes("return your output lines again"));
});

test("arbiter states a decide option is work the continuing coder or a later attempt does", () => {
  const bullet = lines(ARBITER).find((line) => line.startsWith("- `decide`")) ?? "";
  assert.ok(bullet.includes("an option is work the continuing coder or a later attempt does"));
});

test("README says the arbiter rules on a coder's first DECIDE and the same coder continues", () => {
  assert.ok(README.includes("the arbiter rules on a coder's first `DECIDE:` and the same coder continues with the ruling"));
});

test("the failing-task help entry says in English that the same coder continues with the ruling", () => {
  assert.ok(HELP_FAILING_TASK.includes("the same coder continues with the ruling"));
});

test("the failing-task help entry says in Polish that the same coder continues with the ruling", () => {
  assert.ok(HELP_FAILING_TASK.includes("ten sam wykonawca kontynuuje z orzeczeniem"));
});

const ANSWERS = between(SKILL, "## Answers", "## 1. Land the plan");
const RUN_BULLET = bullet("- `RUN:` line");
const RUN_RULE_BULLET = bullet("  - A `--rule` one");
const RUN_AFTER_BULLET = bullet("  - A `--decide` or `--skip` one");

test("the skip answer reports the skip event and runs its RUN lines, each with its TaskUpdate to completed", () => {
  const skip = lines(ANSWERS).find((line) => line.startsWith("- `skip`")) ?? "";
  assert.ok(skip.includes("report the `skip` event and run its `RUN:` lines, one per message, each with its `TaskUpdate` -> completed"));
});

test("the retry answer of a coder after a DENIED reports retry coder --denied", () => {
  const retry = lines(ANSWERS).find((line) => line.startsWith("- `retry`")) ?? "";
  assert.ok(retry.includes("reporting `retry coder --denied` for a coder after a `DENIED`"));
});

test("a --rule RUN line exiting non-zero is named in the final summary, records no further ruling and retries nothing", () => {
  assert.ok(RUN_RULE_BULLET.includes("exiting non-zero -> name it in the final summary, record no further ruling, retry nothing"));
});

test("a --rule RUN line exiting non-zero still has the ruling carried out", () => {
  assert.ok(RUN_RULE_BULLET.includes("carry the ruling out all the same"));
});

test("a --decide or --skip RUN line exiting non-zero after a ruling is named in the final summary and the next block acted on", () => {
  assert.ok(RUN_AFTER_BULLET.includes("exiting non-zero after a ruling -> name it in the final summary and act on the next block"));
});

test("the RUN line bullet carries a --skip line's task completion in the message running it", () => {
  assert.ok(RUN_BULLET.includes("a `--skip` one in the message carrying its task's `TaskUpdate` -> completed"));
});

test("a ruling naming no listed option is carried out as the first option with the mismatch in the final summary", () => {
  assert.ok(
    lines(STEP_4).includes(
      "- `NEXT: carry-out: <option>`: carry that option out; a `mismatch` field (a `RULING` naming no listed option) names the mismatch in the final summary.",
    ),
  );
});

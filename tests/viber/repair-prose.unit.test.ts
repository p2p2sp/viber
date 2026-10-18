/*
 * repair-prose.unit.test.ts - pins the prose that teaches `task-coder` and
 * `task-reviewer` the repair pass (contract C1, the `repair: <problem>` dispatch line).
 *
 * A repair pass is the task's own coder sent back to fix one named problem: its earlier
 * work is already in the tree, it reads its notes file and the task's review reports
 * first, and a `deferred` path is its own to prove. The reviewer gates the named problem
 * and the task's whole `DoD`, running `Verification` and the test the pass added for a
 * `deferred` path. `implementor` records a path deferred to no task through `--owe` and,
 * with nothing in flight or ready, gives the owing task an owed-path pass of at most 2
 * attempts, then `--repaired`. The files read here are shipped prompts, whose text is
 * the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/repair-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const AGENTS = path.resolve(import.meta.dirname, "../../viber/agents");

const CODER = fs.readFileSync(path.join(AGENTS, "task-coder.md"), "utf8");
const REVIEWER = fs.readFileSync(path.join(AGENTS, "task-reviewer.md"), "utf8");

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function bulletsOpening(text: string, opening: string): string[] {
  return lines(text).filter((line) => line.startsWith(opening));
}

const REPAIR_OPENING = "- A `repair` line";
const CODER_REPAIR = bulletsOpening(CODER, REPAIR_OPENING)[0] ?? "";
const REVIEWER_REPAIR = bulletsOpening(REVIEWER, REPAIR_OPENING)[0] ?? "";
const CODER_DEFERRED = bulletsOpening(CODER, "- A `deferred` line");
const FILES_LINE = lines(CODER).find((line) => line.includes("`FILES: ")) ?? "";

test("task-coder carries exactly one repair input bullet", () => {
  assert.equal(bulletsOpening(CODER, REPAIR_OPENING).length, 1);
});

test("the coder repair bullet says the task's earlier work is already in the tree", () => {
  assert.ok(CODER_REPAIR.includes("already in the tree"));
});

test("the coder repair bullet says the line names the one problem to fix", () => {
  assert.ok(CODER_REPAIR.includes("names the one problem to fix"));
});

test("the coder repair bullet reads the notes file first", () => {
  assert.ok(CODER_REPAIR.includes("Read your `notes` file"));
});

test("the coder repair bullet reads every review report of the task beside the notes file", () => {
  assert.ok(CODER_REPAIR.includes("every `review-<id>-*.md` report of the task in the same `work/` directory"));
});

test("the coder repair bullet runs the new test of a deferred path besides Verification", () => {
  assert.ok(CODER_REPAIR.includes("besides `Verification`"));
});

test("task-coder keeps one deferred bullet, with no second one for a repair pass", () => {
  assert.equal(CODER_DEFERRED.length, 1);
});

test("the coder deferred bullet extends, in its own sentence, to the paths of a repair pass", () => {
  assert.ok(CODER_DEFERRED[0].includes(". On a repair pass, `deferred` paths are the task's own"));
});

test("the coder deferred bullet still names the paths an earlier task left for this one", () => {
  assert.ok(CODER_DEFERRED[0].startsWith("- A `deferred` line names paths an earlier task left for THIS one to prove"));
});

test("the coder FILES output line is due on a repair pass too", () => {
  assert.ok(FILES_LINE.includes("or on a repair pass"));
});

test("the coder FILES output line still holds for a run without a task file", () => {
  assert.ok(FILES_LINE.includes("on PASS or FAIL without a task file"));
});

test("task-reviewer carries exactly one repair input bullet", () => {
  assert.equal(bulletsOpening(REVIEWER, REPAIR_OPENING).length, 1);
});

test("the reviewer repair bullet gates the named problem and the whole DoD", () => {
  assert.ok(REVIEWER_REPAIR.includes("gate the problem it names and the task's `DoD` as a whole"));
});

test("the reviewer repair bullet proves the committed part by running Verification, not by the diff alone", () => {
  assert.ok(REVIEWER_REPAIR.includes("by running `Verification`, not by the diff alone"));
});

test("the reviewer repair bullet runs the test a repair pass added for a deferred path", () => {
  assert.ok(REVIEWER_REPAIR.includes("run the test a repair pass added for a `deferred` path as well"));
});

const SKILL = fs.readFileSync(path.join(AGENTS, "../skills/implementor/SKILL.md"), "utf8");
const STEP_4 = SKILL.slice(SKILL.indexOf("## 4. Run the plan"), SKILL.indexOf("## 5. Close"));
const PASS_START = STEP_4.indexOf("Owed-path pass:");
const PASS = PASS_START < 0 ? "" : STEP_4.slice(PASS_START);
const COMMIT_BULLET = bulletsOpening(STEP_4, "- `--defer ")[0] ?? "";
const PASS_BULLETS = lines(PASS);

function passBullet(opening: string): string {
  return PASS_BULLETS.find((line) => line.startsWith(opening)) ?? "";
}

test("the task commit records a none path no unfinished task claims through --owe", () => {
  assert.ok(COMMIT_BULLET.includes('`-> none` path no unfinished task claims is recorded through `--owe "<path>" ["<path>"...]`'));
});

test("implementor no longer leaves a path no task claims to the final summary alone", () => {
  assert.ok(!SKILL.includes("a path no task claims is named in the final summary"));
});

test("step 2 carries the index owed line to the repair passes", () => {
  assert.ok(lines(SKILL).includes("- `owed: <id>:<path>` -> the owed-path passes of step 4."));
});

test("step 4 holds exactly one owed-path pass section, named apart from step 5's repair dispatch", () => {
  assert.equal(STEP_4.split("Owed-path pass:").length, 2);
});

test("the owed-path pass starts only when nothing is in flight and nothing is ready", () => {
  assert.ok(passBullet("- Start ").includes("only when no agent is in flight and no task is ready to dispatch"));
});

test("the owed-path passes run one at a time in index order", () => {
  assert.ok(passBullet("- Start ").includes("one at a time, in index order"));
});

test("the owed-path pass is a coder dispatch of the task, never step 5's repair dispatch", () => {
  assert.ok(PASS.includes("a coder dispatch of the task, never step 5's repair dispatch"));
});

test("the owed-path pass codes at the tier of the task's last attempt", () => {
  assert.ok(passBullet("- Dispatch").includes("the tier of the task's last attempt"));
});

test("the owed-path pass reviews at the task's review tier raised to sonnet, never waived", () => {
  assert.ok(passBullet("- Dispatch").includes("the task's review tier raised to `sonnet`, never waived"));
});

test("the owed-path pass dispatch adds the repair and deferred lines to the ordinary ones", () => {
  const dispatch = passBullet("- Dispatch");
  assert.ok(dispatch.includes("the task's ordinary coder and reviewer dispatch lines"));
  assert.ok(dispatch.includes("`repair: <one line: the problem this pass fixes>`"));
  assert.ok(dispatch.includes("`deferred: <the task's owed paths>`"));
});

test("the owed-path pass allows at most 2 attempts", () => {
  assert.ok(passBullet("- At most 2 attempts").length > 0);
});

test("a coder failure of the owed-path pass costs an attempt and a DECIDE line never reaches the arbiter", () => {
  const attempts = passBullet("- At most 2 attempts");
  assert.ok(attempts.includes("a coder failure (a `DECIDE:` line included, never sent to the arbiter)"));
});

test("a review failure and a refused commit other than exit 4 each cost an owed-path attempt", () => {
  const attempts = passBullet("- At most 2 attempts");
  assert.ok(attempts.includes("a review failure and a task commit exiting other than 4 each cost one"));
});

test("the owed-path pass opens the C3 task-list entry", () => {
  assert.ok(passBullet("- Entry").includes("`R<n> - repair <id> (<tier>, review <review tier>)`, `<n>` counting from 1 in the session"));
});

test("the owed-path pass commits through the task commit form, its exit 4 after a reviewer PASS counting as done", () => {
  const commit = passBullet("- Commit");
  assert.ok(commit.includes('`"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" "<plan>" "<id>"`'));
  assert.ok(commit.includes("exit 4 after a reviewer `PASS` counts as done"));
});

test("the owed-path pass calls --repaired once it succeeds", () => {
  assert.ok(passBullet("- Commit").includes('`"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" --repaired "<plan>" "<id>"`'));
});

test("a --repaired call exiting non-zero is named in the final summary with no question", () => {
  assert.ok(passBullet("- Commit").includes("exiting non-zero -> name it in the final summary, ask nothing"));
});

test("a --repaired call is exempt from the retry or abort question of a refused commit", () => {
  assert.ok(lines(SKILL).some((line) => line.startsWith("- A `commit-task.sh` call exiting non-zero") && line.includes("a `--repaired` call")));
});

test("an owed-path pass failing both attempts names its paths as deferred paths without an owner", () => {
  assert.ok(passBullet("- Both attempts failed").includes("as deferred paths without an owner"));
});

test("an owed-path pass failing both attempts leaves one line per path of both attempts' FILES and EXTRA lines", () => {
  const failed = passBullet("- Both attempts failed");
  assert.ok(failed.includes("`left uncommitted: <path> | repair pass of <id> failed`"));
  assert.ok(failed.includes("the union of both attempts' `FILES:` and `EXTRA:` lines"));
});

test("a path a repair pass defers to no task goes to the summary as a deferred path without an owner, never owed again", () => {
  const none = passBullet("- A `-> none`");
  assert.ok(none.includes("deferred path without an owner"));
  assert.ok(none.includes("never `--owe`"));
});

test("task-coder keeps its VERDICT output line unchanged", () => {
  assert.ok(lines(CODER).includes("- line 1: `VERDICT: PASS`, `VERDICT: FAIL` or `VERDICT: DENIED`"));
});

test("task-reviewer keeps its VERDICT output lines unchanged", () => {
  const output = lines(REVIEWER);
  assert.ok(output.includes("  - line 1: `VERDICT: FAIL`"));
  assert.ok(output.includes("- All checks hold: return `VERDICT: PASS`, plus the `EXTRA:` line below when due, and write no report."));
});

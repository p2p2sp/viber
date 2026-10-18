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
 * attempts, then `--repaired`. A task failing attempt 5 is held with its dependents, its
 * repair pass runs first at `tiers.max`, and only a failed pass reaches the arbiter's
 * `cap` case. Every build then closes on one sentence (all clear, or `outcome.md`
 * records a problem naming each kind), in both close forms of `implementor`, with
 * `closeout` returning its `LEFT:` count of files left uncommitted. The files read
 * here are shipped prompts, whose text is the behaviour. Nothing is spawned.
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
const STEP_4 = SKILL.slice(SKILL.indexOf("## 4. Run the plan"), SKILL.indexOf("## 5 to 7. Close and archive"));
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

const ARBITER = fs.readFileSync(path.join(AGENTS, "arbiter.md"), "utf8");
const HELD_START = STEP_4.indexOf("Held-task pass:");
const HELD = HELD_START < 0 || PASS_START < HELD_START ? "" : STEP_4.slice(HELD_START, PASS_START);
const HELD_BULLETS = lines(HELD);
const ATTEMPT_5 = lines(STEP_4).find((line) => line.startsWith("- Coder failure on attempt 5")) ?? "";

function heldBullet(opening: string): string {
  return HELD_BULLETS.find((line) => line.startsWith(opening)) ?? "";
}

test("an attempt-5 failure holds the task and every task depending on it", () => {
  assert.ok(ATTEMPT_5.includes("hold the task and every task depending on it, directly or through another dependent"));
});

test("an attempt-5 failure goes to no arbiter and no question", () => {
  assert.ok(ATTEMPT_5.includes("asking nothing and calling no arbiter"));
  assert.ok(!ATTEMPT_5.includes("`case: cap`"));
});

test("step 4 holds exactly one held-task pass section, ahead of the owed-path pass", () => {
  assert.equal(STEP_4.split("Held-task pass:").length, 2);
  assert.ok(HELD.length > 0);
});

test("the held-task pass starts before every owed-path pass and before step 5", () => {
  const start = heldBullet("- Start ");
  assert.ok(start.includes("before every owed-path pass and before step 5"));
  assert.ok(start.includes("only when no agent is in flight and no task is ready to dispatch"));
});

test("the held-task pass is a coder dispatch of the task, never step 5's repair dispatch", () => {
  assert.ok(HELD.includes("a coder dispatch of the task, never step 5's repair dispatch"));
});

test("the held-task pass dispatch adds the repair line and the last failure's reason to the ordinary lines", () => {
  const dispatch = heldBullet("- Dispatch");
  assert.ok(dispatch.includes("the task's ordinary coder and reviewer dispatch lines"));
  assert.ok(dispatch.includes("`repair: <one line: the problem this pass fixes>`"));
  assert.ok(dispatch.includes("`reason:` the last failure's `REASON:`"));
});

test("the held-task pass codes and reviews at tiers.max, the review never waived", () => {
  const dispatch = heldBullet("- Dispatch");
  assert.ok(dispatch.includes("`tiers.max` for coder and reviewer"));
  assert.ok(dispatch.includes("never waived"));
});

test("the held-task pass coder reads every review report of the task itself", () => {
  assert.ok(heldBullet("- Dispatch").includes("its coder reads every `review-<id>-*.md` report of the task itself"));
});

test("the held-task pass opens the C3 task-list entry", () => {
  assert.ok(heldBullet("- Entry").includes("`R<n> - repair <id> (<tier>, review <review tier>)`, `<n>` counting from 1 in the session"));
});

test("the held-task pass allows at most 2 attempts, each failure kind costing one", () => {
  const attempts = heldBullet("- At most 2 attempts");
  assert.ok(attempts.includes("a coder failure (a `DECIDE:` line included, never sent to the arbiter)"));
  assert.ok(attempts.includes("a review failure and a task commit exiting other than 4 each cost one"));
});

test("a passing held task is committed through its own task commit", () => {
  assert.ok(heldBullet("- Commit").includes('`"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" "<plan>" "<id>"`'));
});

test("a held task's commit exit 4 is handled as step 4's commit exit 4", () => {
  assert.ok(heldBullet("- Commit").includes("exit 4 is the commit exit 4 above"));
});

test("a committed held task releases its dependents as ordinary tasks", () => {
  assert.ok(heldBullet("- Commit").includes("its dependents dispatch as ordinary tasks"));
});

test("after 2 failed repair attempts the arbiter gets case cap", () => {
  const failed = heldBullet("- Both attempts failed");
  assert.ok(failed.includes("the arbiter with `case: cap`"));
  assert.ok(failed.includes("`task: <dir>/tasks/<id>.md`"));
});

test("the cap case after a failed repair pass hands over the coder notes and the last review path", () => {
  const failed = heldBullet("- Both attempts failed");
  assert.ok(failed.includes("`report:` lines for `<dir>/work/<id>-coder.md` and the task's last `REVIEW` path"));
});

test("the cap case after a failed repair pass gives the repair's last failure as reason with the same options", () => {
  const failed = heldBullet("- Both attempts failed");
  assert.ok(failed.includes("`reason:` the repair's last failure"));
  assert.ok(failed.includes("`options: accept | skip` after a review failure, `options: skip` otherwise"));
});

test("the cap ruling is recorded with the task's id and an accept commit refused again goes back to the arbiter", () => {
  const failed = heldBullet("- Both attempts failed");
  assert.ok(failed.includes("Record its ruling with subject `<id>`"));
  assert.ok(failed.includes("An `accept` commit exiting other than 4 -> the arbiter again with `options: skip`"));
});

test("arbiter's cap line names the failed repair pass", () => {
  const cap = lines(ARBITER).find((line) => line.startsWith("- `cap` ")) ?? "";
  assert.ok(cap.includes("failed repair pass"));
  assert.ok(cap.includes("`accept` commits it unreviewed, `skip` drops it with every task depending on it"));
});

const CLOSEOUT = fs.readFileSync(path.join(AGENTS, "closeout.md"), "utf8");
const CLEANUP = fs.readFileSync(path.join(AGENTS, "../skills/implementor/fragments/cleanup.true.md"), "utf8");
const CLOSEOUT_OUTPUT = CLOSEOUT.slice(CLOSEOUT.indexOf("## Output"));
const OUTPUT_INTRO = lines(CLOSEOUT_OUTPUT).find((line) => line.includes(" lines on `VERDICT: ARCHIVED`")) ?? "";
const ARCHIVED_OUTPUT = bulletsOpening(CLOSEOUT_OUTPUT, "- `VERDICT: ARCHIVED`")[0] ?? "";
const BLOCKED_OUTPUT = bulletsOpening(CLOSEOUT_OUTPUT, "- or `VERDICT: BLOCKED`")[0] ?? "";
const DENIED_OUTPUT = bulletsOpening(CLOSEOUT_OUTPUT, "- or `VERDICT: DENIED`")[0] ?? "";
const LINE_COUNTS: Record<string, number> = { three: 3, four: 4 };

function listedLines(bullet: string): number {
  return bullet.split(", then ").length;
}

test("closeout ARCHIVED output puts the LEFT line after the PATH line", () => {
  assert.ok(ARCHIVED_OUTPUT.indexOf("`PATH: ") > 0);
  assert.ok(ARCHIVED_OUTPUT.indexOf("`LEFT: <n>`") > ARCHIVED_OUTPUT.indexOf("`PATH: "));
});

test("closeout LEFT line counts the outcome.md leftover lines ending left uncommitted, else none", () => {
  assert.ok(ARCHIVED_OUTPUT.includes("the leftover lines of `outcome.md` ending `left uncommitted`"));
  assert.ok(ARCHIVED_OUTPUT.includes("`LEFT: none`"));
});

test("closeout ARCHIVED output lists four lines and its intro counts four", () => {
  const counts = OUTPUT_INTRO.match(/^(Four|Three) lines on `VERDICT: ARCHIVED`/i);
  assert.equal(listedLines(ARCHIVED_OUTPUT), 4);
  assert.equal(LINE_COUNTS[(counts?.[1] ?? "").toLowerCase()], 4);
});

test("closeout BLOCKED and DENIED outputs list three lines and the intro counts three for any other verdict", () => {
  const counts = OUTPUT_INTRO.match(/(four|three) on any other verdict/i);
  assert.equal(LINE_COUNTS[(counts?.[1] ?? "").toLowerCase()], 3);
  assert.equal(listedLines(BLOCKED_OUTPUT), 3);
  assert.equal(listedLines(DENIED_OUTPUT), 3);
});

const CLOSE = fs.readFileSync(path.join(AGENTS, "../skills/implementor/parts/close.md"), "utf8");
const ARCHIVED_CLOSE = bulletsOpening(CLOSE, "- `closeout` returned `VERDICT: ARCHIVED` ->")[0] ?? "";
const SUMMARY_PRINT = "`Summary: <path>/outcome.md`";
const ARCHIVED_NEXT_LINE = "`/viber:intent <path>/roadmap.md`";
const SENTENCE_START = CLOSE.indexOf("Closing sentence");
const SENTENCE_END = CLOSE.indexOf("\n\n", SENTENCE_START + CLOSE.slice(SENTENCE_START).indexOf("\n- "));
const SENTENCE = SENTENCE_START < 0 ? "" : CLOSE.slice(SENTENCE_START, SENTENCE_END);

test("the archived close prints the closing sentence after the Summary line", () => {
  assert.ok(ARCHIVED_CLOSE.indexOf(SUMMARY_PRINT) > 0);
  assert.ok(ARCHIVED_CLOSE.indexOf("the closing sentence") > ARCHIVED_CLOSE.indexOf(SUMMARY_PRINT));
});

test("the archived close prints the closing sentence before the next-part line", () => {
  assert.ok(ARCHIVED_CLOSE.indexOf("the closing sentence") > 0);
  assert.ok(ARCHIVED_CLOSE.indexOf(ARCHIVED_NEXT_LINE) > ARCHIVED_CLOSE.indexOf("the closing sentence"));
});

test("step 7 defines one closing sentence in the conversation's language for both forms", () => {
  assert.equal(CLOSE.split("Closing sentence").length, 2);
  assert.ok(SENTENCE.includes("one sentence in the conversation's language"));
  assert.ok(SENTENCE.includes("in both forms"));
});

test("the closing sentence is all clear when no problem kind was found", () => {
  assert.ok(SENTENCE.includes("All clear when no problem kind below was found"));
});

test("the closing sentence says outcome.md records a problem, the summary above on a screen form with no outcome.md", () => {
  assert.ok(SENTENCE.includes("`outcome.md` records a problem"));
  assert.ok(SENTENCE.includes("with no `outcome.md`: the summary above records a problem"));
});

test("the screen form prints the closing sentence after the rulings", () => {
  const rulings = CLOSE.indexOf("After those, also outside its 7 lines, list the rulings");
  assert.ok(rulings > 0);
  assert.ok(SENTENCE_START > rulings);
});

test("the screen form prints the closing sentence before the next-part line, which stays last", () => {
  const next = CLOSE.indexOf("With a `next: part` index line");
  assert.ok(next > SENTENCE_START);
  const nextLine = lines(CLOSE).find((line) => line.startsWith("With a `next: part` index line")) ?? "";
  assert.ok(nextLine.includes("after the closing sentence"));
  assert.ok(nextLine.includes("the last line of the screen form"));
});

test("the pull request question still comes once everything is printed", () => {
  assert.ok(CLOSE.includes("once everything above is printed -> `AskUserQuestion`"));
});

const PROBLEM_KINDS = [
  "- skipped task",
  "- commit without review",
  "- tests accepted while failing",
  "- final review fix accepted over a failed recheck",
  "- file left uncommitted",
  "- deferred path without an owner",
];

for (const kind of PROBLEM_KINDS) {
  test(`the closing sentence names the problem kind "${kind.slice(2)}"`, () => {
    assert.ok(lines(SENTENCE).some((line) => line.startsWith(kind)));
  });
}

test("the closing sentence counts a left uncommitted line and closeout's LEFT line above none toward files left uncommitted", () => {
  const kind = lines(SENTENCE).find((line) => line.startsWith("- file left uncommitted")) ?? "";
  assert.ok(kind.includes("`left uncommitted:` line"));
  assert.ok(kind.includes("`LEFT:` line above `none`"));
});

test("the closing sentence states that OWNER lines and drift are no problem kind", () => {
  assert.ok(SENTENCE.includes("`OWNER:` lines and drift markers are no problem kind"));
});

test("the cleanup fragment names no two-line close", () => {
  assert.ok(!CLEANUP.includes("two-line"));
});

test("the cleanup fragment points the archived verdict to the close of step 7 without a line count", () => {
  assert.ok(CLEANUP.includes("- `VERDICT: ARCHIVED` -> the close of step 7."));
});

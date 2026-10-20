/*
 * repair-prose.unit.test.ts - pins the prose that teaches `task-coder` and
 * `task-reviewer` the repair pass (contract C1, the `repair: <problem>` dispatch line).
 *
 * A repair pass is the task's own coder sent back to fix one named problem: its earlier
 * work is already in the tree, it reads its notes file and the task's review reports
 * first, and a `deferred` path is its own to prove. The reviewer gates the named problem
 * and the task's whole `DoD`, running `Verification` and the test the pass added for a
 * `deferred` path. `implementor` names a path deferred to no task in the final summary,
 * names no owed-path machinery and holds a task failing attempt 5 with its dependents.
 * Step 4 states the repair pass once, in one `Repair pass:` section: a held task's second
 * chance at `tiers.max`, run with nothing in flight or ready, whose failure alone reaches
 * the arbiter's `cap` case. Every build
 * then closes on one sentence (all clear, or `outcome.md` records a problem naming each
 * kind), in both close forms of `implementor`, with `closeout` returning its `LEFT:` count
 * of files left uncommitted. The files read here are shipped prompts, whose text is the
 * behaviour. Nothing is spawned.
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

test("the coder DEFERRED output line names a later task whose file names the path, never none (an own path with no prover is done or unfinished, never owed)", () => {
  const deferred = lines(CODER).find((line) => line.startsWith("- `DEFERRED: ")) ?? "";
  assert.ok(deferred.includes("whose `Files`, `Delivers` or `DoD` names that path"));
  assert.ok(deferred.includes("A path no such task names gets no line"));
  assert.ok(!deferred.includes("-> none"));
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
const PASS_START = STEP_4.indexOf("Repair pass:");
const PASS = PASS_START < 0 ? "" : STEP_4.slice(PASS_START);
const COMMIT_BULLET = bulletsOpening(STEP_4, "- `--defer ")[0] ?? "";
const PASS_BULLETS = lines(PASS);

function passBullet(opening: string): string {
  return PASS_BULLETS.find((line) => line.startsWith(opening)) ?? "";
}

test("the task commit sends a none line to the final summary as a deferred path without an owner, with no --defer", () => {
  assert.ok(COMMIT_BULLET.includes("a `-> none` line takes no `--defer` and goes to the final summary as a deferred path without an owner"));
});

test("implementor names no owed-path machinery (nothing records an owed path, so a pass for one would be dead instructions)", () => {
  for (const token of [/--owe\b/, /\bowed\b/, /--repaired\b/]) {
    assert.ok(!token.test(SKILL), String(token));
  }
});

test("step 4 holds exactly one Repair pass section, named apart from step 5's repair dispatch", () => {
  assert.equal(STEP_4.split("Repair pass:").length, 2);
});

test("the repair pass is the second chance of a task held at attempt 5", () => {
  assert.ok(PASS_BULLETS[0].includes("the second chance of a task held at attempt 5"));
});

test("a repair pass is a coder dispatch of the task, never step 5's repair dispatch", () => {
  assert.ok(PASS.includes("a coder dispatch of the task, never step 5's repair dispatch"));
});

test("a repair pass starts only when nothing is in flight and nothing is ready, before step 5, one held task at a time in the order held", () => {
  const start = passBullet("- Start ");
  assert.ok(start.includes("only when no agent is in flight and no task is ready to dispatch"));
  assert.ok(start.includes("before step 5"));
  assert.ok(start.includes("one held task at a time, in the order held"));
});

test("a repair pass dispatch adds the repair line to the ordinary coder and reviewer lines, the review never waived", () => {
  const dispatch = passBullet("- Dispatch");
  assert.ok(dispatch.includes("the task's ordinary coder and reviewer dispatch lines"));
  assert.ok(dispatch.includes("`repair: <one line: the problem this pass fixes>` on both"));
  assert.ok(dispatch.includes("never waived"));
});

test("a repair pass dispatch adds the last failure's reason to the coder's lines", () => {
  const dispatch = passBullet("- Dispatch");
  assert.ok(dispatch.includes("`reason:` the last failure's `REASON:`"));
  assert.ok(dispatch.includes("the commit's error after a refused commit"));
});

test("a repair pass codes and reviews at tiers.max", () => {
  assert.ok(passBullet("- Dispatch").includes("`tiers.max` for coder and reviewer"));
});

test("a repair pass coder reads every review report of the task itself", () => {
  assert.ok(passBullet("- Dispatch").includes("its coder reads every `review-<id>-*.md` report of the task itself"));
});

test("a repair pass dispatch carries no deferred line", () => {
  assert.ok(!passBullet("- Dispatch").includes("deferred:"));
});

test("a repair pass allows at most 2 attempts", () => {
  assert.ok(passBullet("- At most 2 attempts").length > 0);
});

test("a coder failure of a repair pass costs an attempt and a DECIDE line never reaches the arbiter", () => {
  const attempts = passBullet("- At most 2 attempts");
  assert.ok(attempts.includes("a coder failure (a `DECIDE:` line included, never sent to the arbiter)"));
});

test("a review failure and a refused commit other than exit 4 each cost a repair pass attempt", () => {
  const attempts = passBullet("- At most 2 attempts");
  assert.ok(attempts.includes("a review failure and a task commit exiting other than 4 each cost one"));
});

test("the second repair attempt is the same fresh dispatch carrying the new reason and, after a review failure, the REVIEW path", () => {
  const attempts = passBullet("- At most 2 attempts");
  assert.ok(attempts.includes("The second attempt is the same fresh dispatch carrying the new failure's `reason:`"));
  assert.ok(attempts.includes("after a review failure, the `REVIEW` path as `report:`"));
});

test("a repair pass opens the C3 task-list entry", () => {
  assert.ok(passBullet("- Entry").includes("`R<n> - repair <id> (<tier>, review <review tier>)`, `<n>` counting from 1 in the session"));
});

test("a repair pass entry completes with the task's commit or with the second failure", () => {
  assert.ok(passBullet("- Entry").includes("it completes with the task's commit or with the second failure"));
});

test("a repair pass commits through the task commit form after a reviewer PASS, with --with and --defer as above and its TaskUpdate", () => {
  const commit = passBullet("- Commit");
  assert.ok(commit.includes("a coder `PASS` goes to review, a reviewer `PASS` to the task commit"));
  assert.ok(commit.includes('`"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" "<plan>" "<id>"`'));
  assert.ok(commit.includes("`--with` and `--defer` as above"));
  assert.ok(commit.includes("its `TaskUpdate` -> completed"));
});

test("a repair pass commit exit 4 is handled as step 4's commit exit 4", () => {
  assert.ok(passBullet("- Commit").includes("exit 4 is the commit exit 4 above"));
});

test("a committed repaired task releases its dependents as ordinary tasks", () => {
  assert.ok(passBullet("- Commit").includes("its dependents dispatch as ordinary tasks"));
});

test("a repair pass failing both attempts goes to the arbiter with case cap, never decide", () => {
  const failed = passBullet("- Both attempts failed");
  assert.ok(failed.includes("the arbiter with `case: cap` (never `decide`)"));
  assert.ok(failed.includes("`task: <dir>/tasks/<id>.md`"));
});

test("the cap case after a failed repair pass hands over the coder notes and the last review path", () => {
  const failed = passBullet("- Both attempts failed");
  assert.ok(failed.includes("`report:` lines for `<dir>/work/<id>-coder.md` and the task's last `REVIEW` path"));
});

test("the cap case after a failed repair pass gives the repair's last failure as reason with the same options", () => {
  const failed = passBullet("- Both attempts failed");
  assert.ok(failed.includes("`reason:` the repair's last failure"));
  assert.ok(failed.includes("`options: accept | skip` after a review failure, `options: skip` otherwise"));
});

test("the cap ruling is recorded with the task's id and an accept commit refused again goes back to the arbiter", () => {
  const failed = passBullet("- Both attempts failed");
  assert.ok(failed.includes("Record its ruling with subject `<id>`"));
  assert.ok(failed.includes("An `accept` commit exiting other than 4 -> the arbiter again with `options: skip`"));
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
const ATTEMPT_5 = lines(STEP_4).find((line) => line.startsWith("- Coder failure on attempt 5")) ?? "";

test("an attempt-5 failure holds the task and every task depending on it", () => {
  assert.ok(ATTEMPT_5.includes("hold the task and every task depending on it, directly or through another dependent"));
});

test("an attempt-5 failure goes to no arbiter and no question", () => {
  assert.ok(ATTEMPT_5.includes("asking nothing and calling no arbiter"));
  assert.ok(!ATTEMPT_5.includes("`case: cap`"));
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

const OUTSIDE_COMMIT = lines(SKILL).find((line) => line.startsWith("Commit outside a task:")) ?? "";

test("the commit outside a task rule names exit 4 of the fix-number repair form and --repair as handled by step 5", () => {
  assert.ok(OUTSIDE_COMMIT.includes("Exit 4 of the fix-number repair form and of `--repair` is handled by step 5 alone"));
});

test("the commit outside a task exit 4 exception allows no retry, no commit arbiter and no left uncommitted line", () => {
  assert.ok(OUTSIDE_COMMIT.includes("with no retry, no `commit` arbiter and no `left uncommitted:` line"));
});

test("the commit outside a task rule still retries then rules through the commit arbiter for other refusals", () => {
  assert.ok(OUTSIDE_COMMIT.includes("Any other non-zero exit -> run the same call once more, asking nothing."));
  assert.ok(OUTSIDE_COMMIT.includes("the arbiter with `case: commit`"));
});

test("the step 5 no-change rule keeps routing a round of repair commits all exiting 4 to the arbiter", () => {
  assert.ok(CLOSE.includes("every repair commit call of the round exiting 4 (no changes) -> the tree is the one that failed: no next round, the arbiter as on round 6"));
});

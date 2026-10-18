/*
 * repair-prose.unit.test.ts - pins the prose that teaches `task-coder` and
 * `task-reviewer` the repair pass (contract C1, the `repair: <problem>` dispatch line).
 *
 * A repair pass is the task's own coder sent back to fix one named problem: its earlier
 * work is already in the tree, it reads its notes file and the task's review reports
 * first, and a `deferred` path is its own to prove. The reviewer gates the named problem
 * and the task's whole `DoD`, running `Verification` and the test the pass added for a
 * `deferred` path. `implementor` records a path deferred to no task through `--owe` and
 * holds a task failing attempt 5 with its dependents. Step 4 states both repair passes
 * once, in one `Repair pass:` section: the rules the two kinds share, then per kind what
 * differs (tiers, extra dispatch lines, commit, failure of both attempts). The held-task
 * pass runs first at `tiers.max` and only its failure reaches the arbiter's `cap` case;
 * the owed-path pass runs with nothing in flight or ready, then `--repaired`. Every build
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
const HELD = "held-task pass";
const OWED = "owed-path pass";

function passBullet(opening: string): string {
  return PASS_BULLETS.find((line) => line.startsWith(opening)) ?? "";
}

function kindLine(opening: string, kind: string): string {
  const at = PASS_BULLETS.findIndex((line) => line.startsWith(opening));
  const sub: string[] = [];
  for (const line of at < 0 ? [] : PASS_BULLETS.slice(at + 1)) {
    if (!line.startsWith("  - ")) break;
    sub.push(line);
  }
  return sub.find((line) => line.startsWith(`  - ${kind}:`)) ?? "";
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

test("step 4 holds exactly one Repair pass section, named apart from step 5's repair dispatch", () => {
  assert.equal(STEP_4.split("Repair pass:").length, 2);
});

test("step 4 holds no Held-task pass or Owed-path pass heading line", () => {
  const headings = lines(STEP_4).filter((line) => line.startsWith("Held-task pass:") || line.startsWith("Owed-path pass:"));
  assert.deepEqual(headings, []);
});

test("the Repair pass section names its two kinds, the held-task pass and the owed-path pass", () => {
  assert.ok(PASS_BULLETS[0].includes(HELD));
  assert.ok(PASS_BULLETS[0].includes(OWED));
});

test("the held-task pass is the repair pass of a task held at attempt 5", () => {
  assert.ok(PASS_BULLETS[0].includes("task held at attempt 5"));
});

test("the owed-path pass is the repair pass of a done task for the paths it owes", () => {
  assert.ok(PASS_BULLETS[0].includes("done task"));
  assert.ok(PASS_BULLETS[0].includes("owes"));
});

test("a repair pass is a coder dispatch of the task, never step 5's repair dispatch", () => {
  assert.ok(PASS.includes("a coder dispatch of the task, never step 5's repair dispatch"));
});

test("a repair pass starts only when nothing is in flight and nothing is ready, before step 5", () => {
  const start = passBullet("- Start ");
  assert.ok(start.includes("only when no agent is in flight and no task is ready to dispatch"));
  assert.ok(start.includes("before step 5"));
});

test("the held-task passes run before every owed-path pass, one held task at a time in the order held", () => {
  const start = kindLine("- Start ", HELD);
  assert.ok(start.includes("before every owed-path pass"));
  assert.ok(start.includes("one held task at a time, in the order held"));
});

test("the owed-path passes run one at a time in index order, one pass per task covering all its paths", () => {
  const start = kindLine("- Start ", OWED);
  assert.ok(start.includes("one pass per task covering all its paths"));
  assert.ok(start.includes("one at a time, in index order"));
});

test("the owing tasks are the index owed entries plus every --owe this build passed", () => {
  assert.ok(kindLine("- Start ", OWED).includes("the index `owed:` entries plus every `--owe` this build passed"));
});

test("a repair pass dispatch adds the repair line to the ordinary coder and reviewer lines, the review never waived", () => {
  const dispatch = passBullet("- Dispatch");
  assert.ok(dispatch.includes("the task's ordinary coder and reviewer dispatch lines"));
  assert.ok(dispatch.includes("`repair: <one line: the problem this pass fixes>` on both"));
  assert.ok(dispatch.includes("never waived"));
});

test("the held-task pass dispatch adds the last failure's reason to the coder's lines", () => {
  const dispatch = kindLine("- Dispatch", HELD);
  assert.ok(dispatch.includes("`reason:` the last failure's `REASON:`"));
  assert.ok(dispatch.includes("the commit's error after a refused commit"));
});

test("the held-task pass codes and reviews at tiers.max", () => {
  assert.ok(kindLine("- Dispatch", HELD).includes("`tiers.max` for coder and reviewer"));
});

test("the held-task pass coder reads every review report of the task itself", () => {
  assert.ok(kindLine("- Dispatch", HELD).includes("its coder reads every `review-<id>-*.md` report of the task itself"));
});

test("the held-task pass dispatch carries no deferred line", () => {
  assert.ok(!kindLine("- Dispatch", HELD).includes("deferred:"));
});

test("the owed-path pass dispatch adds the owed paths as the coder's deferred line", () => {
  assert.ok(kindLine("- Dispatch", OWED).includes("`deferred: <the task's owed paths>` on the coder's"));
});

test("the owed-path pass codes at the tier of the task's last attempt", () => {
  assert.ok(kindLine("- Dispatch", OWED).includes("the tier of the task's last attempt"));
});

test("the owed-path pass reviews at the task's review tier raised to sonnet", () => {
  assert.ok(kindLine("- Dispatch", OWED).includes("the task's review tier raised to `sonnet`"));
});

test("the owed-path pass does not run at tiers.max", () => {
  assert.ok(!kindLine("- Dispatch", OWED).includes("tiers.max"));
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

test("a held-task pass entry completes with the task's commit, an owed-path pass entry with the --repaired call, either with the second failure", () => {
  const entry = passBullet("- Entry");
  assert.ok(entry.includes("the task's commit (held-task pass)"));
  assert.ok(entry.includes("the `--repaired` call (owed-path pass)"));
  assert.ok(entry.includes("the second failure"));
});

test("a repair pass commits through the task commit form after a reviewer PASS", () => {
  const commit = passBullet("- Commit");
  assert.ok(commit.includes("a coder `PASS` goes to review, a reviewer `PASS` to the task commit"));
  assert.ok(commit.includes('`"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" "<plan>" "<id>"`'));
});

test("a passing held task is committed with --defer and --owe as above and its TaskUpdate", () => {
  const commit = kindLine("- Commit", HELD);
  assert.ok(commit.includes("`--defer` and `--owe` as above"));
  assert.ok(commit.includes("its `TaskUpdate` -> completed"));
});

test("a held task's commit exit 4 is handled as step 4's commit exit 4", () => {
  assert.ok(kindLine("- Commit", HELD).includes("exit 4 is the commit exit 4 above"));
});

test("a committed held task releases its dependents as ordinary tasks", () => {
  assert.ok(kindLine("- Commit", HELD).includes("its dependents dispatch as ordinary tasks"));
});

test("a held-task pass commit never calls --repaired", () => {
  assert.ok(!kindLine("- Commit", HELD).includes("--repaired"));
});

test("the owed-path pass commits with --defer as above, its exit 4 after a reviewer PASS counting as done", () => {
  const commit = kindLine("- Commit", OWED);
  assert.ok(commit.includes("`--defer` as above"));
  assert.ok(commit.includes("exit 4 after a reviewer `PASS` counts as done"));
});

test("the owed-path pass calls --repaired once it succeeds", () => {
  assert.ok(kindLine("- Commit", OWED).includes('`"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" --repaired "<plan>" "<id>"`'));
});

test("a --repaired call exiting non-zero is named in the final summary with no question", () => {
  assert.ok(kindLine("- Commit", OWED).includes("exiting non-zero -> name it in the final summary, ask nothing"));
});

test("an owed-path pass commit carries no --owe", () => {
  assert.ok(!kindLine("- Commit", OWED).includes("--owe"));
});

test("a --repaired call is exempt from the retry or abort question of a refused commit", () => {
  assert.ok(lines(SKILL).some((line) => line.startsWith("- A `commit-task.sh` call exiting non-zero") && line.includes("a `--repaired` call")));
});

test("an owed-path pass failing both attempts names its paths as deferred paths without an owner", () => {
  assert.ok(kindLine("- Both attempts failed", OWED).includes("as deferred paths without an owner"));
});

test("an owed-path pass failing both attempts leaves one line per path of both attempts' FILES and EXTRA lines", () => {
  const failed = kindLine("- Both attempts failed", OWED);
  assert.ok(failed.includes("`left uncommitted: <path> | repair pass of <id> failed`"));
  assert.ok(failed.includes("the union of both attempts' `FILES:` and `EXTRA:` lines"));
});

test("an owed-path pass failing both attempts never calls --repaired", () => {
  assert.ok(kindLine("- Both attempts failed", OWED).includes("Never `--repaired`"));
});

test("a held-task pass failing both attempts goes to the arbiter with case cap, never decide", () => {
  const failed = kindLine("- Both attempts failed", HELD);
  assert.ok(failed.includes("the arbiter with `case: cap` (never `decide`)"));
  assert.ok(failed.includes("`task: <dir>/tasks/<id>.md`"));
});

test("the cap case after a failed held-task pass hands over the coder notes and the last review path", () => {
  const failed = kindLine("- Both attempts failed", HELD);
  assert.ok(failed.includes("`report:` lines for `<dir>/work/<id>-coder.md` and the task's last `REVIEW` path"));
});

test("the cap case after a failed held-task pass gives the repair's last failure as reason with the same options", () => {
  const failed = kindLine("- Both attempts failed", HELD);
  assert.ok(failed.includes("`reason:` the repair's last failure"));
  assert.ok(failed.includes("`options: accept | skip` after a review failure, `options: skip` otherwise"));
});

test("the cap ruling is recorded with the task's id and an accept commit refused again goes back to the arbiter", () => {
  const failed = kindLine("- Both attempts failed", HELD);
  assert.ok(failed.includes("Record its ruling with subject `<id>`"));
  assert.ok(failed.includes("An `accept` commit exiting other than 4 -> the arbiter again with `options: skip`"));
});

test("an owed-path pass failing both attempts reaches no arbiter", () => {
  assert.ok(!kindLine("- Both attempts failed", OWED).includes("arbiter"));
});

test("a path an owed-path pass defers to no task goes to the summary as a deferred path without an owner, never owed again", () => {
  const none = passBullet("- A `-> none`");
  assert.ok(none.includes("an owed-path pass defers"));
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

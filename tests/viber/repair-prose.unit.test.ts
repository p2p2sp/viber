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
 * chance, started by the `repair` call of `task-step.sh` with nothing in flight or ready (its
 * dispatch lines, attempts and `cap` arbiter are the script's). Every build
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

test("a DEFERRED none line takes no --defer and goes to the final summary as a deferred path without an owner", () => {
  assert.ok(STEP_4.includes("a `DEFERRED: <path> -> none` line takes no `--defer` and goes to the final summary as a deferred path without an owner"));
});

test("implementor names no owed-path machinery (nothing records an owed path, so a pass for one would be dead instructions)", () => {
  for (const token of [/--owe\b/, /\bowed\b/, /--repaired\b/]) {
    assert.ok(!token.test(SKILL), String(token));
  }
});

test("step 4 holds exactly one Repair pass section, named apart from step 5's repair dispatch", () => {
  assert.equal(STEP_4.split("Repair pass:").length, 2);
});

test("the repair pass is the second chance of a task held by the hold directive", () => {
  assert.ok(PASS.includes("the second chance of a task held by `NEXT: hold`"));
});

test("a repair pass is a coder dispatch of the task, never step 5's repair dispatch", () => {
  assert.ok(PASS.includes("a coder dispatch of the task, never step 5's repair dispatch"));
});

test("the repair pass keeps only when the repair call is made: nothing in flight and nothing ready, before step 5, one held task at a time in the order held", () => {
  assert.ok(PASS.includes("Make the `repair` call only when no agent is in flight and no task is ready to dispatch"));
  assert.ok(PASS.includes("before step 5"));
  assert.ok(PASS.includes("one held task at a time, in the order held"));
});

for (const text of ["`reason:`", "`repair:", "`tiers.max`", "At most 2", "`case: cap`", "`options: "]) {
  test(`the repair pass states no ${text} rule of its own (task-step.sh answers the dispatch lines, attempts, tiers and arbiter)`, () => {
    assert.ok(!PASS.includes(text));
  });
}

test("a repair pass opens the C3 task-list entry", () => {
  assert.ok(STEP_4.includes("`R<n> - repair <id> (<tier>, review <review tier>)`, `<n>` counting from 1 in the session"));
});

test("a repair pass entry completes with that task's NEXT: done or its cap ruling", () => {
  assert.ok(STEP_4.includes("completed with that task's `NEXT: done` or its `cap` ruling"));
});

test("only the first repair block opens the entry", () => {
  assert.ok(STEP_4.includes("A `repair: 1` field opens `TaskCreate`"));
});

test("a coder block past attempt 1 rewrites the task's subject with the tiers its model and review fields name", () => {
  assert.ok(STEP_4.includes("past attempt 1 its subject is rewritten"));
  assert.ok(STEP_4.includes("with the tiers its `model:` and `review:` fields name"));
});

test("the message running a commit RUN line carries the task's TaskUpdate to completed", () => {
  assert.ok(STEP_4.includes("in the message carrying its `TaskUpdate` -> completed, then report its exit"));
});

test("an ASK or NEXT: coder answering a refused commit sets the task back to in progress", () => {
  assert.ok(STEP_4.includes("the `ASK:` or `NEXT: coder` answering a refused commit sets the task back to in progress"));
});

test("a repair block's repair line takes one line naming the problem the pass fixes", () => {
  assert.ok(STEP_4.includes("`repair: <one line: the problem this pass fixes>`"));
});

for (const rule of [/attempts? 1 to 4/i, /attempt 5/i, /\b5 attempts\b/i, /one tier up/i, /at most 2 attempts/i]) {
  test(`step 4 states no attempt, tier or limit rule of its own, none matching ${rule} (task-step.sh counts, climbs and holds)`, () => {
    assert.ok(!rule.test(STEP_4));
  });
}

test("implementor counts the attempt field of each directive for the attempts line of the close", () => {
  assert.ok(STEP_4.includes("the highest `attempt:` field of each task"));
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
const HOLD = lines(STEP_4).find((line) => line.startsWith("- `NEXT: hold")) ?? "";

test("the hold directive holds the task and the dependents it names, none dispatching while held", () => {
  assert.ok(HOLD.includes("`NEXT: hold | dependents: <ids>|none`: hold the task and the tasks its `dependents:` field names"));
  assert.ok(HOLD.includes("none of them dispatches while held"));
});

test("the hold directive asks nothing, calls no arbiter and leaves the failure to the repair pass", () => {
  assert.ok(HOLD.includes("asking nothing and calling no arbiter"));
  assert.ok(HOLD.includes("waits for the repair pass"));
  assert.ok(!HOLD.includes("`case: cap`"));
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

test("closeout LEFT line is the left: value of the --leftovers call, else none", () => {
  assert.ok(ARCHIVED_OUTPUT.includes("`LEFT: <n>` or `LEFT: none`, the `left:` value of the leftovers call"));
  assert.ok(!ARCHIVED_OUTPUT.includes("leftover lines of `outcome.md`"));
});

test("closeout ends a non-zero --leftovers exit on BLOCKED with its error line and a refusal on DENIED, before any archive call", () => {
  const outcome = CLOSEOUT.slice(CLOSEOUT.indexOf("## Outcome"), CLOSEOUT.indexOf("## Archive"));
  assert.ok(outcome.includes("its `left:` line is your `LEFT:` value"));
  assert.ok(outcome.includes("A non-zero exit -> the run ends on `VERDICT: BLOCKED`, `REASON:` its `error:` line, with no archive call."));
  assert.ok(outcome.includes("The harness refuses it -> the run ends on `VERDICT: DENIED`"));
});

test("closeout ARCHIVED output lists four lines and its intro counts four", () => {
  const counts = OUTPUT_INTRO.match(/^(Four|Three) lines on `VERDICT: ARCHIVED`/i);
  assert.equal(listedLines(ARCHIVED_OUTPUT), 4);
  assert.equal(LINE_COUNTS[(counts?.[1] ?? "").toLowerCase()], 4);
});

test("closeout BLOCKED output lists three lines and DENIED four (its REFUSAL line), as the intro counts them", () => {
  assert.ok(OUTPUT_INTRO.startsWith("Four lines on `VERDICT: ARCHIVED` and `VERDICT: DENIED`, three on `VERDICT: BLOCKED`"));
  assert.equal(listedLines(BLOCKED_OUTPUT), 3);
  assert.equal(listedLines(DENIED_OUTPUT), 4);
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

test("the closing sentence says outcome.md records a problem, the summary above on the screen form whether or not an outcome.md exists", () => {
  assert.ok(SENTENCE.includes("`outcome.md` records a problem"));
  assert.ok(SENTENCE.includes("on the screen form: the summary above records a problem, whether or not an `outcome.md` exists"));
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

test("the commit outside a task rule names exit 4 of --repair alone as handled by step 5", () => {
  assert.ok(OUTSIDE_COMMIT.includes("Exit 4 of `--repair` is handled by step 5 alone"));
  assert.ok(!OUTSIDE_COMMIT.includes("fix-number"));
});

test("a second refusal of --repair writes one left uncommitted line per uncommitted line of that call, else per path, and the skill no longer says every non-zero exit committed nothing", () => {
  assert.ok(OUTSIDE_COMMIT.includes("line in the final summary per `uncommitted:` line of the second `--repair` call, else per path."));
  assert.ok(SKILL.includes("exiting non-zero committed nothing, `--repair` aside."));
});

test("the commit outside a task exit 4 exception allows no retry, no commit arbiter and no left uncommitted line", () => {
  assert.ok(OUTSIDE_COMMIT.includes("with no retry, no `commit` arbiter and no `left uncommitted:` line"));
});

test("the commit outside a task rule still retries then rules through the commit arbiter for other refusals", () => {
  assert.ok(OUTSIDE_COMMIT.includes("Any other non-zero exit -> run the same call once more, asking nothing."));
  assert.ok(OUTSIDE_COMMIT.includes("the arbiter with `case: commit`"));
});

test("the step 5 no-change rule keeps routing a round whose --repair call exits 4 to the arbiter", () => {
  assert.ok(CLOSE.includes("the round's `--repair` call exiting 4 (no changes) -> the tree is the one that failed: no next round, the arbiter as on round 6"));
});

const PROVE = CODER.slice(CODER.indexOf("## Prove it green"), CODER.indexOf("## Leave your notes"));
const BRAKE_OPENING = "On a dispatch carrying `reason`, when a red round";
const BRAKE_START = PROVE.indexOf(BRAKE_OPENING);
const BRAKE = BRAKE_START < 0 ? "" : PROVE.slice(BRAKE_START, PROVE.indexOf(". ", BRAKE_START) + 1);

test("the coder's Prove it green section carries the premise brake on a dispatch carrying reason", () => {
  assert.ok(BRAKE.startsWith(BRAKE_OPENING));
});

test("the premise brake fires when a red round fails on the check the reason names after a fix resting on the failed attempt's premise", () => {
  assert.ok(BRAKE.includes("fails on the same check the `reason` names after a fix resting on the premise of the failed attempt"));
});

test("the premise brake has the coder write that premise as one line of its notes", () => {
  assert.ok(BRAKE.includes("write that premise as one line of your notes"));
});

test("the premise brake has the coder check the premise directly before the next fix", () => {
  assert.ok(BRAKE.includes("check it directly before the next fix"));
});

test("the premise brake is the only place the coder prose speaks of a premise, so a dispatch without reason carries none", () => {
  assert.ok(BRAKE.length > 0);
  assert.ok(!CODER.replace(BRAKE, "").includes("premise"));
});

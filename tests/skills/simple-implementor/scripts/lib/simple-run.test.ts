/*
 * runSimple: the order of the steps, the single retry of a coder, stale ids,
 * the changed file and the review's numbers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runSimple } from "../../../../../viber/skills/simple-implementor/scripts/lib/simple-run.ts";
import { fakeFs, fakeGit, ROOT, type FakeFs } from "../../../../fake-ports.ts";

const PLAN = "/plans/plan.md";
const DIR = `${ROOT}/.temp/viber/s1/simple`;
const REVIEW = `${ROOT}/.temp/viber/s1/code-review/review.md`;

function run() {
  const fs = fakeFs({ [PLAN]: "Plan: x\nFacts.\n\n## 1. First\nFiles: a.ts\n\n## 2. Second\n" });
  const git = fakeGit(["mine.ts", ".temp/x"]);
  const call = (...args: string[]) => runSimple([PLAN, "s1", ...args], ROOT, { fs, git, tree: { root: () => ROOT, files: () => [] } });
  return { fs, call };
}

const state = (fs: FakeFs) => JSON.parse(fs.readText(`${DIR}/state.json`) ?? "null");

describe("runSimple", () => {
  it("start: every entry, the block of stage 1, the user's files as before", () => {
    const { fs, call } = run();
    assert.equal(
      call("start").stdout,
      [
        "TASKS",
        "in_progress | 1. First",
        "pending | 2. Second",
        "pending | Full test run",
        "pending | Code review",
        // Changed on purpose: the writers' entries are listed from the start.
        "pending | Update project memory",
        "pending | Update project rules",
        "",
        "DISPATCH: viber:simple-coder | id: stage1.1",
        `plan: ${PLAN}`,
        "stage: 1",
        `changed: ${DIR}/changed.md`,
        `blocked: ${DIR}/blocked/stage1.md`,
        "",
      ].join("\n"),
    );
    assert.deepEqual(state(fs).before, ["mine.ts"]);
  });

  it("a plan with no stage heading is refused", () => {
    const { fs, call } = run();
    fs.writeText(PLAN, "Facts only.\n");
    assert.deepEqual(call("start"), { stdout: "", stderr: `simple.sh: ${PLAN} holds no stage heading '## <n>. <goal>'\n`, exit: 2 });
  });

  it("stages in order, then the test run, the review, the fix, the end", () => {
    const { call } = run();
    call("start");
    assert.match(call("stage1.1", "DONE").stdout, /^TASKS\ncompleted \| 1\. First\nin_progress \| 2\. Second\n\nDISPATCH: viber:simple-coder \| id: stage2\.2\n/);
    assert.match(call("stage2.2", "DONE").stdout, /DISPATCH: viber:simple-coder \| id: tests\.3\nchanged: .*\nblocked: .*\/blocked\/tests\.md\ngoal: run the full test suite once and fix what the change broke\n$/);
    assert.equal(
      call("tests.3", "DONE").stdout,
      `TASKS\ncompleted | Full test run\nin_progress | Code review\n\nSKILL: code-review | id: review.4\nwrite the result to one markdown file at ${REVIEW}, each finding with its severity (important, pre_existing or nit), and return only the number of findings and the number of them that are not nit\n`,
    );
    assert.equal(
      call("review.4", "FOUND", "5 2").stdout,
      // Changed on purpose: the fix has no entry of its own, Code review stays in_progress through it.
      `DISPATCH: viber:simple-coder | id: fix.5\nchanged: ${DIR}/changed.md\nblocked: ${DIR}/blocked/fix.md\nfindings: ${REVIEW}\ngoal: fix every finding except the nit ones, then run the full test suite once\n`,
    );
    assert.equal(
      call("fix.5", "DONE").stdout,
      [
        "END",
        "Stages done: 2 of 2.",
        "The full test suite ran once and what the change broke was fixed.",
        `Review findings: 5, not nit: 2. Review file: ${REVIEW}`,
        "The findings were fixed, except the nit ones, and the full test suite ran once more.",
        "The change is left uncommitted.",
        "",
      ].join("\n"),
    );
  });

  it("no finding above nit: no fix, the end", () => {
    const { call } = run();
    call("start");
    call("stage1.1", "DONE");
    call("stage2.2", "DONE");
    call("tests.3", "DONE");
    const out = call("review.4", "FOUND", "3 0").stdout;
    assert.match(out, /^END\n/);
    assert.match(out, /Review findings: 3, not nit: 0\. .*\nNo finding needed a fix\.\n/);
  });

  it("a review that gave no numbers: no fix, the end says so", () => {
    const { call } = run();
    call("start");
    call("stage1.1", "DONE");
    call("stage2.2", "DONE");
    call("tests.3", "DONE");
    const out = call("review.4", "LOST").stdout;
    assert.match(out, /^END\n/);
    assert.match(out, /The review gave no numbers, so no finding was fixed\./);
    assert.doesNotMatch(out, /fix\.\d/);
  });

  it("BLOCKED: the same block once more under a new id, then END with the reason", () => {
    const { fs, call } = run();
    call("start");
    assert.match(call("stage1.1", "BLOCKED").stdout, /^DISPATCH: viber:simple-coder \| id: stage1\.2\nplan: .*\nstage: 1\n.*\nblocked: .*\/blocked\/stage1\.md\n$/);
    fs.writeText(`${DIR}/blocked/stage1.md`, "The API is missing.\n\nNo way around it.\n");
    assert.equal(
      call("stage1.2", "LOST").stdout,
      "END\nStage 1 did not finish after a second try.\nThe API is missing.\nNo way around it.\nStages done: 0 of 2.\nThe change is left uncommitted.\n",
    );
  });

  it("a return of an id not awaited changes nothing", () => {
    const { fs, call } = run();
    call("start");
    call("stage1.1", "BLOCKED");
    const saved = fs.readText(`${DIR}/state.json`);
    assert.equal(call("stage1.1", "DONE", "x.ts").stdout, "WAIT\n");
    assert.equal(fs.readText(`${DIR}/state.json`), saved);
    assert.equal(fs.readText(`${DIR}/changed.md`), "");
  });

  it("FILES of every awaited return accumulate in the changed file, .temp/ dropped", () => {
    const { fs, call } = run();
    call("start");
    call("stage1.1", "BLOCKED", "src\\a.ts, .temp/viber/s1/x.md");
    call("stage1.2", "DONE", `${ROOT}/src/a.ts,./src/b.ts`);
    assert.equal(fs.readText(`${DIR}/changed.md`), "src/a.ts\nsrc/b.ts\n");
  });
});

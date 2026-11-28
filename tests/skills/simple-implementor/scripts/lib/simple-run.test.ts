/*
 * runSimple: the order of the steps, the single retry of a lost coder, the stop
 * of a blocked one and its resume, stale ids, the changed file, the broken
 * assumptions, the review's numbers, the commit after each coder step and what
 * END names as left uncommitted.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runSimple } from "../../../../../viber/skills/simple-implementor/scripts/lib/simple-run.ts";
import { fakeFs, fakeGit, ROOT, type FakeFs, type FakeGit } from "../../../../fake-ports.ts";

const PLAN = "/plans/plan.md";
const DIR = `${ROOT}/.temp/viber/s1/simple`;
const REVIEW = `${ROOT}/.temp/viber/s1/code-review/review.md`;

function run() {
  const fs = fakeFs({ [PLAN]: "Plan: x\nFacts.\n\n## 1. First\nFiles: a.ts\n\n## 2. Second\n" });
  const git = fakeGit(["mine.ts", ".temp/x"]);
  const call = (...args: string[]) => runSimple([PLAN, "s1", ...args], ROOT, { fs, git, tree: { root: () => ROOT, files: () => [] } });
  return { fs, git, call };
}

const state = (fs: FakeFs) => JSON.parse(fs.readText(`${DIR}/state.json`) ?? "null");

describe("runSimple", () => {
  it("start: every entry, the block of stage 1, the user's files as before", () => {
    const { fs, call } = run();
    assert.equal(
      call("start").stdout,
      [
        "TASKS",
        "in_progress | T1 - First",
        "pending | T2 - Second",
        "pending | Full test run",
        "pending | Code review",
        // Changed on purpose: the writers' entries are listed from the start.
        "pending | Update project memory",
        "pending | Update project rules",
        // Changed on purpose: each coder step is committed on its own, the entry is the commit of the writers' files.
        "pending | Commit memory and rules",
        "",
        "DISPATCH: viber:simple-coder | id: stage1.1",
        `plan: ${PLAN}`,
        "stage: 1",
        `changed: ${DIR}/changed.md`,
        `blocked: ${DIR}/blocked/stage1.md`,
        // Changed on purpose: a coder is handed the file for the assumptions it broke.
        `deviations: ${DIR}/deviations.md`,
        "",
      ].join("\n"),
    );
    assert.deepEqual(state(fs).before, ["mine.ts"]);
    assert.equal(state(fs).base, "base000");
  });

  it("a plan with no stage heading is refused", () => {
    const { fs, call } = run();
    fs.writeText(PLAN, "Facts only.\n");
    assert.deepEqual(call("start"), { stdout: "", stderr: `simple.sh: ${PLAN} holds no stage heading '## <n>. <goal>'\n`, exit: 2 });
  });

  it("stages in order, then the test run, the review, the fix, the end", () => {
    const { call } = run();
    call("start");
    assert.match(call("stage1.1", "DONE").stdout, /^TASKS\ncompleted \| T1 - First\nin_progress \| T2 - Second\n\nDISPATCH: viber:simple-coder \| id: stage2\.2\n/);
    assert.match(call("stage2.2", "DONE").stdout, /DISPATCH: viber:simple-coder \| id: tests\.3\nchanged: .*\nblocked: .*\/blocked\/tests\.md\ndeviations: .*\ngoal: run the full test suite once and fix what the change broke\n$/);
    assert.equal(
      call("tests.3", "DONE").stdout,
      // Changed on purpose: the stages are committed by now, so the review is told where the change starts.
      `TASKS\ncompleted | Full test run\nin_progress | Code review\n\nSKILL: code-review | id: review.4\nreview the diff that git diff base000 prints (the commits of the run and the work tree), write the result to one markdown file at ${REVIEW}, each finding with its severity (important, pre_existing or nit), and return only the number of findings and the number of them that are not nit\n`,
    );
    assert.equal(
      call("review.4", "FOUND", "5 2").stdout,
      // Changed on purpose: the fix has no entry of its own, Code review stays in_progress through it.
      `DISPATCH: viber:simple-coder | id: fix.5\nchanged: ${DIR}/changed.md\nblocked: ${DIR}/blocked/fix.md\ndeviations: ${DIR}/deviations.md\nfindings: ${REVIEW}\ngoal: fix every finding except the nit ones, then run the full test suite once\n`,
    );
    assert.equal(
      call("fix.5", "DONE").stdout,
      [
        "END",
        "Stages done: 2 of 2.",
        "The full test suite ran once and what the change broke was fixed.",
        `Review findings: 5, not nit: 2. Review file: ${REVIEW}`,
        "The findings were fixed, except the nit ones, and the full test suite ran once more.",
        // Changed on purpose: no coder reported a file, so no commit is asked for.
        "Nothing to commit.",
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

  it("LOST: the same block once more under a new id, then END with the reason", () => {
    const { fs, call } = run();
    call("start");
    assert.match(call("stage1.1", "LOST").stdout, /^DISPATCH: viber:simple-coder \| id: stage1\.2\nplan: .*\nstage: 1\n.*\nblocked: .*\/blocked\/stage1\.md\ndeviations: .*\n$/);
    fs.writeText(`${DIR}/blocked/stage1.md`, "The API is missing.\n\nNo way around it.\n");
    assert.equal(
      call("stage1.2", "LOST").stdout,
      // Changed on purpose: a stopped run keeps the commits before it and leaves its open step uncommitted.
      "END\nStage 1 did not finish after a second try.\nThe API is missing.\nNo way around it.\nStages done: 0 of 2.\nThe run stopped: its open step is not committed.\n",
    );
  });

  it("BLOCKED: no second try, END with the reason at once", () => {
    const { fs, call } = run();
    call("start");
    fs.writeText(`${DIR}/blocked/stage1.md`, "The plan forbids the reference the fake needs.\n");
    // Changed on purpose: a blocked coder waits for a decision, the same block again brings none.
    assert.equal(call("stage1.1", "BLOCKED").stdout, "END\nStage 1 is blocked.\nThe plan forbids the reference the fake needs.\nStages done: 0 of 2.\nThe run stopped: its open step is not committed.\n");
    assert.equal(state(fs).stopped, "stage");
  });

  it("resume: the stopped step once more, every entry, the answer in its blocked file", () => {
    const { fs, call } = run();
    call("start");
    call("stage1.1", "DONE", "src/a.ts");
    fs.writeText(`${DIR}/blocked/stage2.md`, "Open: add the reference?");
    call("stage2.2", "BLOCKED");
    assert.equal(
      call("resume", " add it,\nnothing else ").stdout,
      [
        "TASKS",
        "completed | T1 - First",
        "in_progress | T2 - Second",
        "pending | Full test run",
        "pending | Code review",
        "pending | Update project memory",
        "pending | Update project rules",
        "pending | Commit memory and rules",
        "",
        "DISPATCH: viber:simple-coder | id: stage2.3",
        `plan: ${PLAN}`,
        "stage: 2",
        `changed: ${DIR}/changed.md`,
        `blocked: ${DIR}/blocked/stage2.md`,
        `deviations: ${DIR}/deviations.md`,
        "",
      ].join("\n"),
    );
    assert.equal(fs.readText(`${DIR}/blocked/stage2.md`), "Open: add the reference?\nDecision: add it, nothing else\n");
    assert.equal(fs.readText(`${DIR}/changed.md`), "src/a.ts\n");
    assert.equal(state(fs).stopped, undefined);
    assert.match(call("stage2.3", "DONE").stdout, /id: tests\.4\n/);
  });

  it("resume with no answer writes no decision; with no stopped run it changes nothing", () => {
    const { fs, call } = run();
    call("start");
    const saved = fs.readText(`${DIR}/state.json`);
    assert.equal(call("resume", "go on").stdout, "WAIT\n");
    assert.equal(fs.readText(`${DIR}/state.json`), saved);
    call("stage1.1", "BLOCKED");
    assert.match(call("resume").stdout, /DISPATCH: viber:simple-coder \| id: stage1\.2\n/);
    assert.equal(fs.readText(`${DIR}/blocked/stage1.md`), null);
  });

  it("the assumptions a coder broke are named under END", () => {
    const { fs, call } = run();
    call("start");
    fs.writeText(`${DIR}/deviations.md`, "project files unchanged | added a reference to X.Contracts\n\n");
    assert.match(call("stage1.1", "BLOCKED").stdout, /\nStages done: 0 of 2\.\nAssumed in the plan, broken by the build:\n  project files unchanged \| added a reference to X\.Contracts\nThe run stopped/);
  });

  it("a return of an id not awaited changes nothing", () => {
    const { fs, call } = run();
    call("start");
    call("stage1.1", "LOST");
    const saved = fs.readText(`${DIR}/state.json`);
    assert.equal(call("stage1.1", "DONE", "x.ts").stdout, "WAIT\n");
    assert.equal(fs.readText(`${DIR}/state.json`), saved);
    assert.equal(fs.readText(`${DIR}/changed.md`), "");
  });

  it("FILES of every awaited return accumulate in the changed file, .temp/ dropped", () => {
    const { fs, call } = run();
    call("start");
    call("stage1.1", "LOST", "src\\a.ts, .temp/viber/s1/x.md");
    call("stage1.2", "DONE", `${ROOT}/src/a.ts,./src/b.ts`);
    assert.equal(fs.readText(`${DIR}/changed.md`), "src/a.ts\nsrc/b.ts\n");
  });

  /** The commit skill made the commit awaited: its paths leave the dirty ones, HEAD moves to `sha`. */
  function made(git: FakeGit, paths: string[], sha: string): void {
    git.dirtyPaths = git.dirtyPaths.filter((path) => !paths.includes(path));
    git.head = () => sha;
  }

  // Changed on purpose: every coder step is committed on its own, before the next step.
  it("each stage is committed before the next: the reported files alone, none changed before the run; a path a commit did not take rides along", () => {
    const { fs, git, call } = run();
    fs.writeText(`${ROOT}/.claude/viber.yml`, "build:\n  rules: false\n");
    call("start");
    git.dirtyPaths.push("src/a.ts", "my file.ts", "stray.log");
    // The stage's entry stays in_progress through its commit: no TASKS block.
    assert.equal(call("stage1.1", "DONE", "src/a.ts, mine.ts, my file.ts").stdout, "SKILL: viber:commit | id: commit.2\nsrc/a.ts\n");
    assert.equal(call("stage1.1", "DONE").stdout, "WAIT\n");
    made(git, ["src/a.ts"], "1111111aaaa");
    assert.match(call("commit.2", "DONE").stdout, /^TASKS\ncompleted \| T1 - First\nin_progress \| T2 - Second\n\nDISPATCH: viber:simple-coder \| id: stage2\.3\n/);
    git.dirtyPaths.push("src/b.ts");
    assert.equal(call("stage2.3", "DONE", "src/b.ts").stdout, "SKILL: viber:commit | id: commit.4\nsrc/b.ts\n");
    // HEAD did not move: stage 2 is not committed, its file goes with the next commit.
    assert.match(call("commit.4", "LOST").stdout, /DISPATCH: viber:simple-coder \| id: tests\.5\n/);
    assert.equal(call("tests.5", "DONE").stdout, "SKILL: viber:commit | id: commit.6\nsrc/b.ts\n");
    made(git, ["src/b.ts"], "2222222bbbb");
    assert.match(call("commit.6", "DONE").stdout, /^TASKS\ncompleted \| Full test run\nin_progress \| Code review\n\nSKILL: code-review \| id: review\.7\n/);
    git.changesText = "A\tsrc/a.ts\nA\tsrc/b.ts";
    assert.match(call("review.7", "FOUND", "0 0").stdout, /DISPATCH: viber:memory-writer \| id: memory\.8\n/);
    assert.equal(
      call("memory.8", "NONE").stdout,
      [
        "END",
        "Stages done: 2 of 2.",
        "The full test suite ran once and what the change broke was fixed.",
        `Review findings: 0, not nit: 0. Review file: ${REVIEW}`,
        "No finding needed a fix.",
        "- memory | nothing to update",
        "Stage 1 is committed: 1111111.",
        "Stage 2 is not committed.",
        "The fixes of the full test run are committed: 2222222.",
        "Left uncommitted: my file.ts",
        "Left uncommitted, changed before the run too: mine.ts",
        "Left uncommitted, reported by no coder: stray.log",
        "",
      ].join("\n"),
    );
  });

  it("the fix of the findings is committed before the close", () => {
    const { git, call } = run();
    call("start");
    call("stage1.1", "DONE");
    call("stage2.2", "DONE");
    call("tests.3", "DONE");
    call("review.4", "FOUND", "2 1");
    git.dirtyPaths.push("src/a.ts");
    assert.equal(call("fix.5", "DONE", "src/a.ts").stdout, "SKILL: viber:commit | id: commit.6\nsrc/a.ts\n");
    made(git, ["src/a.ts"], "3333333cccc");
    assert.match(call("commit.6", "DONE").stdout, /^END\n(.*\n)*The findings were fixed, except the nit ones, and the full test suite ran once more\.\nThe fix of the findings is committed: 3333333\.\n$/);
  });

  // Changed on purpose: a stop leaves the commits made before it and names its own step as not committed.
  it("a stopped run: the commits before it stay, its step is left uncommitted and named; resume commits it", () => {
    const { git, call } = run();
    call("start");
    git.dirtyPaths.push("src/a.ts");
    call("stage1.1", "DONE", "src/a.ts");
    made(git, ["src/a.ts"], "1111111aaaa");
    call("commit.2", "DONE");
    git.dirtyPaths.push("src/b.ts", "stray.log");
    assert.equal(
      call("stage2.3", "BLOCKED", "src/b.ts").stdout,
      "END\nStage 2 is blocked.\nNo reason was written.\nStages done: 1 of 2.\nStage 1 is committed: 1111111.\nThe run stopped: its open step is not committed.\nLeft uncommitted: src/b.ts\nLeft uncommitted, reported by no coder: stray.log\n",
    );
    assert.match(call("resume", "go on").stdout, /DISPATCH: viber:simple-coder \| id: stage2\.4\n/);
    assert.equal(call("stage2.4", "DONE").stdout, "SKILL: viber:commit | id: commit.5\nsrc/b.ts\n");
  });
});

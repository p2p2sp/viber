/*
 * runSimple at its close: the gates of the memory and rules writers, the change
 * list they are handed, their returns in either order, the limits with their
 * send-back and restore, the protected files, the commit of the writers' files
 * and the END lines.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runSimple } from "../../../../../viber/skills/simple-implementor/scripts/lib/simple-run.ts";
import { fakeFs, fakeGit, ROOT } from "../../../../fake-ports.ts";

const PLAN = "/plans/plan.md";
const DIR = `${ROOT}/.temp/viber/s1/simple`;
const RULE = ".claude/rules/viber/src.md";
const RULE_TEXT = '---\npaths:\n  - "src/**"\n---\n\n# Src\n';

/**
 * A one-stage run with `before` dirty at start; `close` returns the review with no finding above nit, so the writers step is
 * entered. With `made` each commit of a coder step is made; without, HEAD stays and the coder's files are still dirty there.
 */
function run(opts: { before?: string[]; files?: string[]; disk?: Record<string, string> } = {}) {
  const fs = fakeFs({ [PLAN]: "Facts.\n\n## 1. Only\n", ...opts.disk });
  const git = fakeGit([...(opts.before ?? [])]);
  const call = (...args: string[]) => runSimple([PLAN, "s1", ...args], ROOT, { fs, git, tree: { root: () => ROOT, files: () => opts.files ?? [] } });
  const write = (path: string, text: string) => {
    fs.writeText(`${ROOT}/${path}`, text);
    if (!git.dirtyPaths.includes(path)) git.dirtyPaths.push(path);
  };
  /** Answers every commit block of `out` and the ones that follow. With `made` its paths leave the dirty ones, join what the run committed and HEAD moves; without, HEAD stays where it was. */
  const commits = (out: string, made: boolean): string => {
    for (let block = /id: (commit\.\d+)\n(.*)\n/.exec(out); block !== null; block = /id: (commit\.\d+)\n(.*)\n/.exec(out)) {
      if (made) {
        const paths = block[2].split(" ");
        git.dirtyPaths = git.dirtyPaths.filter((path) => !paths.includes(path));
        git.changesText += paths.map((path) => `A\t${path}\n`).join("");
        git.head = () => "1111111aaaa";
      }
      out = call(block[1], "DONE").stdout;
    }
    return out;
  };
  const close = (stageFiles = "", dirty: string[] = [], text = "x", made = true) => {
    call("start");
    for (const path of dirty) write(path, text);
    const tests = commits(call("stage1.1", "DONE", stageFiles).stdout, made);
    const review = commits(call(/id: (tests\.\d+)/.exec(tests)![1], "DONE").stdout, made);
    return call(/id: (review\.\d+)/.exec(review)![1], "FOUND", "1 0").stdout;
  };
  /** Answers every commit block of `out` and the ones that follow, up to END; no commit is made. */
  const end = (out: string): string => commits(out, false);
  return { fs, git, call, write, close, end };
}

const bothRules = { files: [RULE], disk: { [`${ROOT}/${RULE}`]: RULE_TEXT } };

describe("runSimple writers", () => {
  it("no change at the close: no writer, no entry, straight to END", () => {
    const { close } = run({ before: ["mine.ts"] });
    const out = close();
    assert.match(out, /^END\n/);
    assert.doesNotMatch(out, /writer|project memory/);
  });

  it("the change list: not in before, or in before and reported in FILES; .temp/ dropped; only the memory writer without a matching rule", () => {
    const { fs, git, close } = run({ before: ["mine.ts", "both.ts"] });
    git.heads.set("both.ts", 3);
    const out = close("both.ts", ["both.ts", "src/a.ts", ".temp/viber/s1/x.md"]);
    assert.equal(
      out,
      [
        "TASKS",
        "completed | Code review",
        // Changed on purpose: an entry a writer, the rules one completed when no rule matches.
        "in_progress | Update project memory",
        "completed | Update project rules",
        "",
        "DISPATCH: viber:memory-writer | id: memory.4",
        `spec: ${PLAN}`,
        `changes: ${DIR}/memory-changes.md`,
        `suggest: ${DIR}/suggest.md`,
        "",
      ].join("\n"),
    );
    assert.equal(fs.readText(`${DIR}/memory-changes.md`), "M\tboth.ts\nA\tsrc/a.ts\n");
  });

  // Changed on purpose: the stages are committed before the writers run, so their list opens with what those commits hold.
  it("the change list opens with what the commits of the run hold, then what still differs from HEAD", () => {
    const { fs, close } = run();
    close("src/a.ts, src/b.ts", ["src/a.ts", "src/b.ts", "stray.ts"]);
    assert.equal(fs.readText(`${DIR}/memory-changes.md`), "A\tsrc/a.ts\nA\tsrc/b.ts\nA\tstray.ts\n");
  });

  it("build.rules: false: no rules writer though a rule matches", () => {
    const { close } = run({ files: [RULE], disk: { [`${ROOT}/${RULE}`]: RULE_TEXT, [`${ROOT}/.claude/viber.yml`]: "build:\n  rules: false\n" } });
    const out = close("src/a.ts", ["src/a.ts"]);
    assert.match(out, /memory-writer/);
    assert.doesNotMatch(out, /rules-writer|Update project rules/);
  });

  it("both in one printout; rules first, then memory: WAIT, then END", () => {
    const { fs, call, close } = run(bothRules);
    const out = close("src/a.ts", ["src/a.ts"]);
    assert.match(out, /DISPATCH: viber:memory-writer \| id: memory\.5\n.*\n.*\n.*\n\nDISPATCH: viber:rules-writer \| id: rules\.6\n/);
    assert.match(out, new RegExp(`id: rules\\.6\\nspec: ${PLAN}\\nchanges: ${DIR}/rules-changes\\.md\\nrules notes: ${DIR}/rules\\.md\\n$`));
    assert.equal(fs.readText(`${DIR}/rules-changes.md`), "A\tsrc/a.ts\n");
    // Changed on purpose: each writer has its own entry, completed on its return.
    assert.equal(call("rules.6", "NONE").stdout, "TASKS\ncompleted | Update project rules\n\nWAIT\n");
    // Changed on purpose: the stage was committed after its DONE, so no writer's file means no commit at the close.
    assert.match(call("memory.5", "NONE").stdout, /^END\n(.*\n)*- memory \| nothing to update\nStage 1 is committed: 1111111\.\n$/);
  });

  it("memory first, then rules: WAIT, then the commit of the writers' files", () => {
    const { call, write, close } = run(bothRules);
    close("src/a.ts", ["src/a.ts"]);
    write("src/CLAUDE.md", "m");
    // Changed on purpose: each writer has its own entry, completed on its return.
    assert.equal(call("memory.5", "UPDATED", "src/CLAUDE.md").stdout, "TASKS\ncompleted | Update project memory\n\nWAIT\n");
    assert.equal(call("memory.5", "UPDATED", "src/CLAUDE.md").stdout, "WAIT\n");
    // Changed on purpose: the close commits the writers' files alone, the stage being committed already.
    assert.equal(call("rules.6", "NONE").stdout, "TASKS\ncompleted | Update project rules\nin_progress | Commit memory and rules\n\nSKILL: viber:commit | id: commit.7\nsrc/CLAUDE.md\n");
  });

  it("an overrun sends the writer once more with take off and W lines; a second restores its own files only", () => {
    const { fs, git, call, write, close, end } = run({ before: ["docs/CLAUDE.md"] });
    fs.writeText(`${ROOT}/docs/CLAUDE.md`, "u".repeat(900));
    close("lib/CLAUDE.md", ["lib/CLAUDE.md"]);
    // Changed on purpose: a coder's memory file is now measured from its entry, so the writer leaves it alone here.
    write("src/CLAUDE.md", "m".repeat(700));
    const back = call("memory.5", "UPDATED", "src/CLAUDE.md").stdout;
    assert.match(back, /^DISPATCH: viber:memory-writer \| id: memory\.6\n.*\n.*\n.*\ntake off: 100 bytes\n$/);
    assert.equal(fs.readText(`${DIR}/memory-changes.md`), "A\tlib/CLAUDE.md\nW\tsrc/CLAUDE.md\n");
    write("src/CLAUDE.md", "m".repeat(650));
    const out = end(call("memory.6", "UPDATED", "src/CLAUDE.md").stdout);
    assert.deepEqual(git.restores, [["src/CLAUDE.md"]]);
    // Changed on purpose: the commits' lines follow the writers' ones, the stage's commit first.
    assert.match(out, /\n- memory \| 100 bytes over the limit, the writer dispatched once more\n- memory \| 50 bytes over the limit after the retry, the nodes are restored to HEAD, any changed before the writers ran left as they are\nStage 1 is committed: 1111111\.\n/);
  });

  // Changed on purpose: only `before` is protected; a coder's file the writer did not touch counts nothing, but is the writer's to report.
  it("the user's files are never measured nor reported as the writer's; an untouched coder's file counts nothing", () => {
    const { fs, git, call, write, close, end } = run({ before: ["docs/CLAUDE.md"] });
    fs.writeText(`${ROOT}/docs/CLAUDE.md`, "u".repeat(900));
    // No commit of the coder steps is made: the coder's node is still dirty on entering the writers step.
    close("lib/CLAUDE.md", ["lib/CLAUDE.md"], "c".repeat(900), false);
    write("src/CLAUDE.md", "m".repeat(100));
    const sent = call("memory.6", "UPDATED", "src/CLAUDE.md, lib/CLAUDE.md, docs/CLAUDE.md").stdout;
    assert.deepEqual(git.restores, []);
    // Changed on purpose: the writers' commit holds the writer's node alone: not the coder's untouched one, not the user's.
    assert.match(sent, /\nSKILL: viber:commit \| id: commit\.7\nsrc\/CLAUDE\.md\n$/);
    const out = end(sent);
    assert.match(
      out,
      /\n- memory \| updated \| src\/CLAUDE\.md, lib\/CLAUDE\.md\nStage 1 is not committed\.\nThe fixes of the full test run are not committed\.\nThe writers' files are not committed\.\nLeft uncommitted: lib\/CLAUDE\.md, src\/CLAUDE\.md\n$/,
    );
  });

  it("a coder's memory file grows from its size on entering the writers step, not from HEAD", () => {
    const { call, write, close, end } = run();
    close("lib/CLAUDE.md", ["lib/CLAUDE.md"], "k".repeat(900), false);
    write("lib/CLAUDE.md", "k".repeat(1400));
    const out = end(call("memory.6", "UPDATED", "lib/CLAUDE.md").stdout);
    // Changed on purpose: a node both a coder and the writer changed is the writers' commit.
    assert.match(out, /\n- memory \| updated \| lib\/CLAUDE\.md\nStage 1 is not committed\.\nThe fixes of the full test run are not committed\.\nThe writers' files are not committed\.\nLeft uncommitted: lib\/CLAUDE\.md\n$/);
  });

  it("over the limit only through a coder's file: sent back with take off and that file as W", () => {
    const { fs, call, write, close } = run();
    close("lib/CLAUDE.md", ["lib/CLAUDE.md"], "k".repeat(900), false);
    write("lib/CLAUDE.md", "k".repeat(1600));
    const back = call("memory.6", "UPDATED", "lib/CLAUDE.md").stdout;
    assert.match(back, /^DISPATCH: viber:memory-writer \| id: memory\.7\n.*\n.*\n.*\ntake off: 100 bytes\n$/);
    assert.equal(fs.readText(`${DIR}/memory-changes.md`), "A\tlib/CLAUDE.md\nW\tlib/CLAUDE.md\n");
  });

  it("a second overrun puts a coder's file back to its entry content and the others back to HEAD; before untouched", () => {
    const { fs, git, call, write, close, end } = run({ before: ["docs/CLAUDE.md"] });
    fs.writeText(`${ROOT}/docs/CLAUDE.md`, "u".repeat(900));
    close("lib/CLAUDE.md", ["lib/CLAUDE.md"], "k".repeat(900), false);
    write("lib/CLAUDE.md", "k".repeat(1300));
    write("src/CLAUDE.md", "m".repeat(300));
    call("memory.6", "UPDATED", "lib/CLAUDE.md, src/CLAUDE.md");
    const out = end(call("memory.7", "UPDATED", "lib/CLAUDE.md, src/CLAUDE.md").stdout);
    assert.deepEqual(git.restores, [["src/CLAUDE.md"]]);
    assert.equal(fs.readText(`${ROOT}/lib/CLAUDE.md`), "k".repeat(900));
    assert.equal(fs.readText(`${ROOT}/docs/CLAUDE.md`), "u".repeat(900));
    assert.ok(!fs.removed.includes(`${ROOT}/docs/CLAUDE.md`));
    assert.match(
      out,
      /\n- memory \| 100 bytes over the limit after the retry, the nodes are restored to HEAD, those a coder of this run changed to their state before the writers, any changed before the run left as they are\nStage 1 is not committed\.\n/,
    );
  });

  it("a coder's file absent on entering the writers step is removed on restore", () => {
    const { fs, git, call, write } = run();
    git.heads.set("lib/CLAUDE.md", 50);
    call("start");
    git.dirtyPaths.push("lib/CLAUDE.md");
    // No commit of the coder steps is made: the deletion is still in the tree on entering the writers step.
    call("stage1.1", "DONE", "lib/CLAUDE.md");
    call("commit.2", "DONE");
    call("tests.3", "DONE");
    call("commit.4", "DONE");
    call("review.5", "FOUND", "1 0");
    write("lib/CLAUDE.md", "w".repeat(700));
    assert.match(call("memory.6", "UPDATED", "lib/CLAUDE.md").stdout, /take off: 100 bytes\n$/);
    call("memory.7", "UPDATED", "lib/CLAUDE.md");
    assert.deepEqual(git.restores, []);
    assert.equal(fs.readText(`${ROOT}/lib/CLAUDE.md`), null);
    assert.ok(fs.removed.includes(`${ROOT}/lib/CLAUDE.md`));
  });

  it("END: suggestions and rule notes under their headers, a path outside what the writer may write noted, an emptied rule removed, the stage's commit and the writers' one", () => {
    const { fs, git, call, write, close } = run(bothRules);
    git.heads.set(RULE, RULE_TEXT.length);
    close("src/a.ts", ["src/a.ts"]);
    fs.writeText(`${DIR}/suggest.md`, "- Add the parser.\n");
    write("src/CLAUDE.md", "m");
    call("memory.5", "UPDATED", "src/CLAUDE.md, src/a.ts");
    fs.writeText(`${DIR}/rules.md`, `- ${RULE} | stale\n`);
    write(RULE, "");
    // Changed on purpose: one commit at the close, the writers' files, the removed rule among them; the stage has its own.
    assert.equal(call("rules.6", "UPDATED", RULE).stdout, `TASKS\ncompleted | Update project rules\nin_progress | Commit memory and rules\n\nSKILL: viber:commit | id: commit.7\nsrc/CLAUDE.md ${RULE}\n`);
    assert.ok(fs.removed.includes(`${ROOT}/${RULE}`));
    git.dirtyPaths = [];
    git.head = () => "2222222bbbb";
    assert.equal(
      call("commit.7", "DONE").stdout,
      [
        "END",
        "Stages done: 1 of 1.",
        "The full test suite ran once and what the change broke was fixed.",
        `Review findings: 1, not nit: 0. Review file: ${ROOT}/.temp/viber/s1/code-review/review.md`,
        "No finding needed a fix.",
        "- memory | suggested for the root CLAUDE.md:",
        "  - Add the parser.",
        "- memory | updated | src/CLAUDE.md",
        "- memory | left in the tree, outside what this step may write | src/a.ts",
        "- rules | notes:",
        `  - ${RULE} | stale`,
        `- rules | updated | ${RULE}`,
        "Stage 1 is committed: 1111111.",
        "The writers' files are committed: 2222222.",
        "",
      ].join("\n"),
    );
  });
});

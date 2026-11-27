/*
 * runSimple at its close: the gates of the memory and rules writers, the change
 * list they are handed, their returns in either order, the limits with their
 * send-back and restore, the protected files and the END lines.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runSimple } from "../../../../../viber/skills/simple-implementor/scripts/lib/simple-run.ts";
import { fakeFs, fakeGit, ROOT } from "../../../../fake-ports.ts";

const PLAN = "/plans/plan.md";
const DIR = `${ROOT}/.temp/viber/s1/simple`;
const RULE = ".claude/rules/viber/src.md";
const RULE_TEXT = '---\npaths:\n  - "src/**"\n---\n\n# Src\n';

/** A one-stage run with `before` dirty at start; `close` returns the review with no finding above nit, so the writers step is entered. */
function run(opts: { before?: string[]; files?: string[]; disk?: Record<string, string> } = {}) {
  const fs = fakeFs({ [PLAN]: "Facts.\n\n## 1. Only\n", ...opts.disk });
  const git = fakeGit([...(opts.before ?? [])]);
  const call = (...args: string[]) => runSimple([PLAN, "s1", ...args], ROOT, { fs, git, tree: { root: () => ROOT, files: () => opts.files ?? [] } });
  const write = (path: string, text: string) => {
    fs.writeText(`${ROOT}/${path}`, text);
    if (!git.dirtyPaths.includes(path)) git.dirtyPaths.push(path);
  };
  const close = (stageFiles = "", dirty: string[] = [], text = "x") => {
    call("start");
    for (const path of dirty) write(path, text);
    call("stage1.1", "DONE", stageFiles);
    call("tests.2", "DONE");
    return call("review.3", "FOUND", "1 0").stdout;
  };
  return { fs, git, call, write, close };
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

  it("build.rules: false: no rules writer though a rule matches", () => {
    const { close } = run({ files: [RULE], disk: { [`${ROOT}/${RULE}`]: RULE_TEXT, [`${ROOT}/.claude/viber.yml`]: "build:\n  rules: false\n" } });
    const out = close("src/a.ts", ["src/a.ts"]);
    assert.match(out, /memory-writer/);
    assert.doesNotMatch(out, /rules-writer|Update project rules/);
  });

  it("both in one printout; rules first, then memory: WAIT, then END", () => {
    const { fs, call, close } = run(bothRules);
    const out = close("src/a.ts", ["src/a.ts"]);
    assert.match(out, /DISPATCH: viber:memory-writer \| id: memory\.4\n.*\n.*\n.*\n\nDISPATCH: viber:rules-writer \| id: rules\.5\n/);
    assert.match(out, new RegExp(`id: rules\\.5\\nspec: ${PLAN}\\nchanges: ${DIR}/rules-changes\\.md\\nrules notes: ${DIR}/rules\\.md\\n$`));
    assert.equal(fs.readText(`${DIR}/rules-changes.md`), "A\tsrc/a.ts\n");
    // Changed on purpose: each writer has its own entry, completed on its return.
    assert.equal(call("rules.5", "NONE").stdout, "TASKS\ncompleted | Update project rules\n\nWAIT\n");
    assert.match(call("memory.4", "NONE").stdout, /^END\n/);
  });

  it("memory first, then rules: WAIT, then END", () => {
    const { call, close } = run(bothRules);
    close("src/a.ts", ["src/a.ts"]);
    // Changed on purpose: each writer has its own entry, completed on its return.
    assert.equal(call("memory.4", "NONE").stdout, "TASKS\ncompleted | Update project memory\n\nWAIT\n");
    assert.equal(call("memory.4", "NONE").stdout, "WAIT\n");
    assert.match(call("rules.5", "NONE").stdout, /^END\n/);
  });

  it("an overrun sends the writer once more with take off and W lines; a second restores its own files only", () => {
    const { fs, git, call, write, close } = run({ before: ["docs/CLAUDE.md"] });
    fs.writeText(`${ROOT}/docs/CLAUDE.md`, "u".repeat(900));
    close("lib/CLAUDE.md", ["lib/CLAUDE.md"]);
    // Changed on purpose: a coder's memory file is now measured from its entry, so the writer leaves it alone here.
    write("src/CLAUDE.md", "m".repeat(700));
    const back = call("memory.4", "UPDATED", "src/CLAUDE.md").stdout;
    assert.match(back, /^DISPATCH: viber:memory-writer \| id: memory\.5\n.*\n.*\n.*\ntake off: 100 bytes\n$/);
    assert.equal(fs.readText(`${DIR}/memory-changes.md`), "A\tlib/CLAUDE.md\nW\tsrc/CLAUDE.md\n");
    write("src/CLAUDE.md", "m".repeat(650));
    const out = call("memory.5", "UPDATED", "src/CLAUDE.md").stdout;
    assert.deepEqual(git.restores, [["src/CLAUDE.md"]]);
    assert.match(out, /\n- memory \| 100 bytes over the limit, the writer dispatched once more\n- memory \| 50 bytes over the limit after the retry, the nodes are restored to HEAD, any changed before the writers ran left as they are\nThe change is left uncommitted\.\n$/);
  });

  // Changed on purpose: only `before` is protected; a coder's file the writer did not touch counts nothing, but is the writer's to report.
  it("the user's files are never measured nor reported as the writer's; an untouched coder's file counts nothing", () => {
    const { fs, git, call, write, close } = run({ before: ["docs/CLAUDE.md"] });
    fs.writeText(`${ROOT}/docs/CLAUDE.md`, "u".repeat(900));
    close("lib/CLAUDE.md", ["lib/CLAUDE.md"], "c".repeat(900));
    write("src/CLAUDE.md", "m".repeat(100));
    const out = call("memory.4", "UPDATED", "src/CLAUDE.md, lib/CLAUDE.md, docs/CLAUDE.md").stdout;
    assert.deepEqual(git.restores, []);
    assert.match(out, /\n- memory \| updated \| src\/CLAUDE\.md, lib\/CLAUDE\.md\nThe change is left uncommitted\.\n$/);
  });

  it("a coder's memory file grows from its size on entering the writers step, not from HEAD", () => {
    const { call, write, close } = run();
    close("lib/CLAUDE.md", ["lib/CLAUDE.md"], "k".repeat(900));
    write("lib/CLAUDE.md", "k".repeat(1400));
    const out = call("memory.4", "UPDATED", "lib/CLAUDE.md").stdout;
    assert.match(out, /\n- memory \| updated \| lib\/CLAUDE\.md\nThe change is left uncommitted\.\n$/);
  });

  it("over the limit only through a coder's file: sent back with take off and that file as W", () => {
    const { fs, call, write, close } = run();
    close("lib/CLAUDE.md", ["lib/CLAUDE.md"], "k".repeat(900));
    write("lib/CLAUDE.md", "k".repeat(1600));
    const back = call("memory.4", "UPDATED", "lib/CLAUDE.md").stdout;
    assert.match(back, /^DISPATCH: viber:memory-writer \| id: memory\.5\n.*\n.*\n.*\ntake off: 100 bytes\n$/);
    assert.equal(fs.readText(`${DIR}/memory-changes.md`), "A\tlib/CLAUDE.md\nW\tlib/CLAUDE.md\n");
  });

  it("a second overrun puts a coder's file back to its entry content and the others back to HEAD; before untouched", () => {
    const { fs, git, call, write, close } = run({ before: ["docs/CLAUDE.md"] });
    fs.writeText(`${ROOT}/docs/CLAUDE.md`, "u".repeat(900));
    close("lib/CLAUDE.md", ["lib/CLAUDE.md"], "k".repeat(900));
    write("lib/CLAUDE.md", "k".repeat(1300));
    write("src/CLAUDE.md", "m".repeat(300));
    call("memory.4", "UPDATED", "lib/CLAUDE.md, src/CLAUDE.md");
    const out = call("memory.5", "UPDATED", "lib/CLAUDE.md, src/CLAUDE.md").stdout;
    assert.deepEqual(git.restores, [["src/CLAUDE.md"]]);
    assert.equal(fs.readText(`${ROOT}/lib/CLAUDE.md`), "k".repeat(900));
    assert.equal(fs.readText(`${ROOT}/docs/CLAUDE.md`), "u".repeat(900));
    assert.ok(!fs.removed.includes(`${ROOT}/docs/CLAUDE.md`));
    assert.match(
      out,
      /\n- memory \| 100 bytes over the limit after the retry, the nodes are restored to HEAD, those a coder of this run changed to their state before the writers, any changed before the run left as they are\nThe change is left uncommitted\.\n$/,
    );
  });

  it("a coder's file absent on entering the writers step is removed on restore", () => {
    const { fs, git, call, write } = run();
    git.heads.set("lib/CLAUDE.md", 50);
    call("start");
    git.dirtyPaths.push("lib/CLAUDE.md");
    call("stage1.1", "DONE", "lib/CLAUDE.md");
    call("tests.2", "DONE");
    call("review.3", "FOUND", "1 0");
    write("lib/CLAUDE.md", "w".repeat(700));
    assert.match(call("memory.4", "UPDATED", "lib/CLAUDE.md").stdout, /take off: 100 bytes\n$/);
    call("memory.5", "UPDATED", "lib/CLAUDE.md");
    assert.deepEqual(git.restores, []);
    assert.equal(fs.readText(`${ROOT}/lib/CLAUDE.md`), null);
    assert.ok(fs.removed.includes(`${ROOT}/lib/CLAUDE.md`));
  });

  it("END: suggestions and rule notes under their headers, a path outside what the writer may write noted, an emptied rule removed", () => {
    const { fs, git, call, write, close } = run(bothRules);
    git.heads.set(RULE, RULE_TEXT.length);
    close("src/a.ts", ["src/a.ts"]);
    fs.writeText(`${DIR}/suggest.md`, "- Add the parser.\n");
    write("src/CLAUDE.md", "m");
    call("memory.4", "UPDATED", "src/CLAUDE.md, src/a.ts");
    fs.writeText(`${DIR}/rules.md`, `- ${RULE} | stale\n`);
    write(RULE, "");
    const out = call("rules.5", "UPDATED", RULE).stdout;
    assert.ok(fs.removed.includes(`${ROOT}/${RULE}`));
    assert.equal(
      out,
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
        "The change is left uncommitted.",
        "",
      ].join("\n"),
    );
  });
});

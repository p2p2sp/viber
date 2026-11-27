/*
 * Characterization of the close's memory and rules writers (the `before`
 * filter and the limit protocol) and of its config reads, driven through the
 * exported closeEvent and closeStep with fake ports. Briefs, notes and commit
 * messages are pinned byte for byte.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { closeEvent, closeStep } from "../../../../../viber/skills/spec-implementor/scripts/lib/build-close.ts";
import { fakeCtx, fakeFs, fakeGit, ROOT, SPEC_DIR, WORK } from "../../../../fake-ports.ts";

const RUN_FILES = ["docs/_specs/run1/plan.md", "docs/_specs/run1/outcome.md", "docs/_specs/run1/work/state.json", "docs/_specs/run1/work/tasks"];
const V = ".claude/rules/viber";

/** A context awaiting the writer `id` of the joint step, with a QA writer still open so the step does not move on. */
function awaiting(id: string, files: Record<string, string>, dirty: string[], heads: Record<string, number>, before?: string[]) {
  const fs = fakeFs(Object.fromEntries(Object.entries(files).map(([path, text]) => [path.startsWith("/") ? path : `${ROOT}/${path}`, text])));
  const git = fakeGit(dirty, heads);
  git.changesText = "M\tlib/x.ts";
  const ctx = fakeCtx({ fs, git, before, step: "writers" });
  ctx.state.close.open = [id, "qa.2"];
  ctx.state.close.seq = 2;
  return ctx;
}

describe("memory writer", () => {
  it("under the limit: commits the nodes, never a file of before, notes it", () => {
    const ctx = awaiting("memory.1", { "lib/CLAUDE.md": "a".repeat(100), "src/CLAUDE.md": "b".repeat(5000), "README.md": "x" }, ["lib/CLAUDE.md", "src/CLAUDE.md", "README.md"], {}, ["src/CLAUDE.md"]);
    closeEvent(ctx, "memory.1", "UPDATED", "lib/CLAUDE.md, src/CLAUDE.md, README.md");
    assert.deepEqual(ctx.state.close.notes, [
      "- memory | not committed, the user's file before the run | src/CLAUDE.md",
      "- memory | not committed, outside what this step may write | README.md",
    ]);
    assert.deepEqual(ctx.git.commits, [{ message: "docs(viber): project memory", paths: ["lib/CLAUDE.md", ...RUN_FILES] }]);
    assert.deepEqual(ctx.git.restores, []);
    assert.deepEqual(ctx.out, []);
    assert.deepEqual(ctx.state.close.open, ["qa.2"]);
  });

  it("a reported <dir>/CLAUDE.local.md: notes it, never measures, commits or restores it", () => {
    const ctx = awaiting("memory.1", { "lib/CLAUDE.md": "a".repeat(100), "src/CLAUDE.local.md": "b".repeat(5000) }, ["lib/CLAUDE.md", "src/CLAUDE.local.md"], {});
    ctx.state.close.overruns.memory = 1;
    closeEvent(ctx, "memory.1", "UPDATED", "lib/CLAUDE.md, src/CLAUDE.local.md");
    assert.deepEqual(ctx.state.close.notes, ["- memory | not committed, outside what this step may write | src/CLAUDE.local.md"]);
    assert.deepEqual(ctx.git.commits, [{ message: "docs(viber): project memory", paths: ["lib/CLAUDE.md", ...RUN_FILES] }]);
    assert.deepEqual(ctx.git.restores, []);
    assert.deepEqual(ctx.out, []);
  });

  it("a state without before has no user files", () => {
    const ctx = awaiting("memory.1", { "src/CLAUDE.md": "b".repeat(10) }, ["src/CLAUDE.md"], {});
    assert.equal(ctx.state.before, undefined);
    closeEvent(ctx, "memory.1", "UPDATED", "src/CLAUDE.md");
    assert.deepEqual(ctx.state.close.notes, []);
    assert.deepEqual(ctx.git.commits, [{ message: "docs(viber): project memory", paths: ["src/CLAUDE.md", ...RUN_FILES] }]);
  });

  it("first overrun: counts it, notes it and sends the writer back with take off", () => {
    const ctx = awaiting(
      "memory.1",
      { "lib/CLAUDE.md": "a".repeat(700), "src/CLAUDE.md": "b".repeat(5000), [`${WORK}/suggest.md`]: "- add X\n" },
      ["lib/CLAUDE.md", "src/CLAUDE.md"],
      {},
      ["src/CLAUDE.md"],
    );
    closeEvent(ctx, "memory.1", "UPDATED", "lib/CLAUDE.md");
    assert.deepEqual(ctx.state.close.overruns, { memory: 1, rules: 0 });
    assert.deepEqual(ctx.state.close.notes, ["- memory | suggested for the root CLAUDE.md:", "  - add X", "- memory | 100 bytes over the limit, the writer dispatched once more"]);
    assert.deepEqual(ctx.out, [
      {
        agent: "viber:memory-writer",
        id: "memory.3",
        model: "",
        lines: [`spec: ${SPEC_DIR}/spec.md`, `notes: ${WORK}/notes`, `changes: ${WORK}/memory-changes.md`, `suggest: ${WORK}/suggest.md`, "take off: 100 bytes"],
      },
    ]);
    // The retry lists its earlier writes as W, none of before.
    assert.equal(ctx.fs.readText(`${WORK}/memory-changes.md`), "M\tlib/x.ts\nW\tlib/CLAUDE.md\n");
    assert.equal(ctx.fs.readText(`${WORK}/suggest.md`), null);
    assert.deepEqual(ctx.state.close.open, ["qa.2", "memory.3"]);
    assert.deepEqual(ctx.git.commits, []);
    assert.deepEqual(ctx.git.restores, []);
  });

  it("second overrun: restores the nodes to HEAD, none of before", () => {
    const ctx = awaiting("memory.1", { "lib/CLAUDE.md": "a".repeat(700), "src/CLAUDE.md": "b".repeat(5000) }, ["lib/CLAUDE.md", "src/CLAUDE.md"], {}, ["src/CLAUDE.md"]);
    ctx.state.close.overruns.memory = 1;
    closeEvent(ctx, "memory.1", "UPDATED", "lib/CLAUDE.md");
    assert.deepEqual(ctx.state.close.notes, ["- memory | 100 bytes over the limit after the retry, the nodes are restored to HEAD, any the user changed before the run left as they are"]);
    assert.deepEqual(ctx.git.restores, [["lib/CLAUDE.md"]]);
    assert.deepEqual(ctx.git.commits, []);
    assert.deepEqual(ctx.out, []);
  });

  it("second overrun with a failed restore: notes it", () => {
    const ctx = awaiting("memory.1", { "lib/CLAUDE.md": "a".repeat(700) }, ["lib/CLAUDE.md"], {});
    ctx.state.close.overruns.memory = 1;
    ctx.git.restoreOk = false;
    closeEvent(ctx, "memory.1", "UPDATED", "lib/CLAUDE.md");
    assert.deepEqual(ctx.state.close.notes, [
      "- memory | 100 bytes over the limit after the retry, the nodes are restored to HEAD, any the user changed before the run left as they are",
      "- memory | restore to HEAD failed, the nodes are left in the tree",
    ]);
  });
});

describe("rules writer", () => {
  it("under the limit: removes the emptied rules and commits those HEAD holds, never a file of before", () => {
    const ctx = awaiting(
      "rules.1",
      { [`${V}/a.md`]: "a".repeat(50), [`${V}/gone.md`]: "", [`${V}/user.md`]: "", [`${V}/new.md`]: "n" },
      [`${V}/a.md`, `${V}/gone.md`, `${V}/user.md`, `${V}/new.md`],
      { [`${V}/a.md`]: 40, [`${V}/gone.md`]: 30 },
      [`${V}/user.md`],
    );
    closeEvent(ctx, "rules.1", "UPDATED", `${V}/a.md, ${V}/gone.md, ${V}/user.md, ${V}/new.md`);
    assert.deepEqual(ctx.fs.removed, [`${ROOT}/${V}/gone.md`]);
    assert.equal(ctx.fs.readText(`${ROOT}/${V}/user.md`), "");
    assert.deepEqual(ctx.state.close.notes, [
      `- rules | not committed, the user's file before the run | ${V}/user.md`,
      `- rules | not committed, outside what this step may write | ${V}/new.md`,
    ]);
    assert.deepEqual(ctx.git.commits, [{ message: "docs(viber): project rules", paths: [`${V}/a.md`, `${V}/gone.md`, ...RUN_FILES] }]);
    assert.deepEqual(ctx.git.restores, []);
  });

  it("first overrun: counts it, notes it and sends the writer back with take off", () => {
    const ctx = awaiting(
      "rules.1",
      { [`${V}/a.md`]: "a".repeat(300), [`${V}/user.md`]: "u".repeat(5000), [`${WORK}/rules.md`]: "check X\n" },
      [`${V}/a.md`, `${V}/user.md`],
      {},
      [`${V}/user.md`],
    );
    closeEvent(ctx, "rules.1", "UPDATED", `${V}/a.md`);
    assert.deepEqual(ctx.state.close.overruns, { memory: 0, rules: 1 });
    assert.deepEqual(ctx.state.close.notes, ["- rules | notes:", "  check X", "- rules | 100 bytes over the limit, the writer dispatched once more"]);
    assert.deepEqual(ctx.out, [
      {
        agent: "viber:rules-writer",
        id: "rules.3",
        model: "",
        lines: [`spec: ${SPEC_DIR}/spec.md`, `changes: ${WORK}/rules-changes.md`, `rules notes: ${WORK}/rules.md`, "take off: 100 bytes"],
      },
    ]);
    assert.equal(ctx.fs.readText(`${WORK}/rules-changes.md`), `M\tlib/x.ts\nW\t${V}/a.md\n`);
    assert.equal(ctx.fs.readText(`${WORK}/rules.md`), null);
    assert.deepEqual(ctx.git.commits, []);
  });

  it("second overrun: restores the rules to HEAD, none of before", () => {
    const ctx = awaiting("rules.1", { [`${V}/a.md`]: "a".repeat(300), [`${V}/user.md`]: "u".repeat(5000) }, [`${V}/a.md`, `${V}/user.md`], {}, [`${V}/user.md`]);
    ctx.state.close.overruns.rules = 1;
    closeEvent(ctx, "rules.1", "UPDATED", `${V}/a.md`);
    assert.deepEqual(ctx.state.close.notes, ["- rules | 100 bytes over the limit after the retry, the rules are restored to HEAD, any the user changed before the run left as they are"]);
    assert.deepEqual(ctx.git.restores, [[`${V}/a.md`]]);
    assert.deepEqual(ctx.git.commits, []);
    assert.deepEqual(ctx.out, []);
  });

  it("second overrun with a failed restore: notes it", () => {
    const ctx = awaiting("rules.1", { [`${V}/a.md`]: "a".repeat(300) }, [`${V}/a.md`], {});
    ctx.state.close.overruns.rules = 1;
    ctx.git.restoreOk = false;
    closeEvent(ctx, "rules.1", "UPDATED", `${V}/a.md`);
    assert.deepEqual(ctx.state.close.notes, [
      "- rules | 100 bytes over the limit after the retry, the rules are restored to HEAD, any the user changed before the run left as they are",
      "- rules | restore to HEAD failed, the rules are left in the tree",
    ]);
  });
});

describe("a state written before close.overruns", () => {
  for (const [id, file, size, agent] of [
    ["memory.1", "lib/CLAUDE.md", 700, "viber:memory-writer"],
    ["rules.1", `${V}/a.md`, 300, "viber:rules-writer"],
  ] as const) {
    it(`${id}: counts from { memory: 0, rules: 0 }`, () => {
      const ctx = awaiting(id, { [file]: "a".repeat(size) }, [file], {});
      delete (ctx.state.close as { overruns?: unknown }).overruns;
      closeEvent(ctx, id, "UPDATED", file);
      assert.deepEqual(ctx.state.close.overruns, id.startsWith("memory") ? { memory: 1, rules: 0 } : { memory: 0, rules: 1 });
      assert.equal(ctx.out.length, 1);
      assert.equal(ctx.out[0].agent, agent);
      assert.equal(ctx.out[0].lines.at(-1), "take off: 100 bytes");
    });
  }
});

describe("config reads", () => {
  const writers = (yaml: string | null) => {
    const fs = fakeFs({ [`${ROOT}/.claude/rules/r.md`]: "---\npaths: src/a.ts\n---\nrule\n" });
    if (yaml !== null) fs.writeText(`${ROOT}/.claude/viber.yml`, yaml);
    const git = fakeGit();
    git.changesText = "M\tsrc/a.ts";
    const ctx = fakeCtx({ fs, git, step: "writers", files: [".claude/rules/r.md"] });
    closeStep(ctx);
    return ctx.out.map((block) => block.agent);
  };

  it("the writers step reads build.rules and build.qa from .claude/viber.yml", () => {
    assert.deepEqual(writers(null), ["viber:memory-writer", "viber:rules-writer"]);
    assert.deepEqual(writers("build:\n  rules: false\n  qa: true\n"), ["viber:memory-writer", "viber:qa-writer"]);
  });

  it("the extensions step notes a quoted key as no agent name", () => {
    const fs = fakeFs({
      [`${ROOT}/.claude/viber.yml`]: 'build:\n  extensions:\n    "my-agent":\n    good-agent:\n',
      [`${ROOT}/.claude/agents/good-agent.md`]: "agent",
    });
    const ctx = fakeCtx({ fs, step: "extensions" });
    closeStep(ctx);
    assert.deepEqual(ctx.state.close.notes, ['- extensions | no agent name, not run | "my-agent"']);
    assert.deepEqual(
      ctx.out.map((block) => block.id),
      ["ext.good-agent.1"],
    );
  });
});

describe("the Next line of END", () => {
  /** A part closed in full once its finalizer returns, the part after it present or not. */
  function ended(n: number, of: number, next: boolean, partial = false): string[] {
    const name = `20260101_x-p${n}-of-${of}`;
    const dir = `${ROOT}/docs/_specs/${name}`;
    const fs = fakeFs({ [`${dir}/spec.md`]: "spec", ...(next ? { [`${ROOT}/docs/_specs/20260101_x-p${n + 1}-of-${of}/spec.md`]: "spec" } : {}) });
    const ctx = { ...fakeCtx({ fs, step: "finalize" }), name, specDir: dir, work: `${dir}/work`, phase: { n, of } };
    ctx.state.close.open = ["finalize.1"];
    ctx.state.close.partial = partial;
    closeEvent(ctx, "finalize.1", "DONE", "");
    return ctx.state.close.end;
  }

  it("a part before the last, the next one present: names its spec", () => {
    assert.equal(ended(1, 3, true).at(-1), "Next: P2 of 3: docs/_specs/20260101_x-p2-of-3/spec.md");
  });

  it("the next part's spec missing: names it as missing", () => {
    assert.equal(ended(1, 3, false).at(-1), "Next: P2 of 3: docs/_specs/20260101_x-p2-of-3/spec.md is missing");
  });

  it("the last part or a partial close: no Next line", () => {
    assert.ok(!ended(3, 3, false).some((line) => line.startsWith("Next:")));
    assert.ok(!ended(1, 3, true, true).some((line) => line.startsWith("Next:")));
  });
});

/*
 * plan-graph.unit.test.ts - the dependency graph of an assembled plan:
 * `orderTasks(tasks, blockFiles)` of viber/lib/plan-graph.ts answers, per task
 * in plan order, the earlier tasks it depends on, computed from `Files` and
 * contract use alone, and `dependsValue` words them as the `Depends-on` value.
 *
 * A later task depends on an earlier one when both list one file, when it uses
 * a contract block the earlier one writes (the block's `File:` path sits in the
 * earlier task's `Files` and that task names the block in `Uses`), or when its
 * `Verification`, `Delivers` or `DoD` names a file the earlier one lists. An
 * edge reached through another is dropped. No author writes a dependency, so
 * the three checks of plan-index/check.ts that read the graph hold by
 * construction: one case runs them over the computed lines.
 *
 * `arrangeTasks(tasks, blockFiles, held)` answers the order the tasks take
 * before those edges are computed: a task that uses a contract block only a
 * later task writes, or names a file only a later task creates, moves behind
 * that task, whichever slice wrote which, and everything else keeps its place.
 * Tasks that need each other in a ring are answered as a cycle.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { arrangeTasks, dependsValue, orderTasks, type GraphTask } from "../../../viber/lib/plan-graph.ts";
import { checkPlan } from "../../../viber/lib/plan-index/check.ts";
import { readPlan } from "../../../viber/lib/plan-index/read.ts";

const task = (files: string, more: Partial<GraphTask> = {}): GraphTask => ({ files: files.split(", "), uses: [], verification: "npm test -> green", delivers: "a thing", dod: "it works", ...more });
const ids = (count: number): string[] => Array.from({ length: count }, (_, at) => `T${at + 1}`);
const values = (tasks: GraphTask[], blocks: Record<string, string[]> = {}): string[] => orderTasks(tasks, new Map(Object.entries(blocks))).map((deps) => dependsValue(deps, ids(tasks.length)));

/** Five tasks: T2 shares a file with T1, T3 consumes the block T1 writes, T4 reads a file of T3 in its DoD, T5 touches nothing of the others. */
const SAMPLE: GraphTask[] = [
  task("src/login.ts, src/session.ts", { uses: ["C1"] }),
  task("src/session.ts"),
  task("src/form.ts", { uses: ["C1"] }),
  task("src/page.ts, src/session.ts", { dod: "the page renders the form of `src/form.ts`" }),
  task("docs/notes.md"),
];
const BLOCKS = { C1: ["src/login.ts"] };

test("a sample of five tasks gets its Depends-on from Files and contract use alone: a shared file, a contract writer and its consumer, a path read in a DoD, a redundant edge dropped and an unrelated task left on none", () => {
  assert.deepEqual(values(SAMPLE, BLOCKS), ["none", "T1", "T1", "T2, T3", "none"]);
});

test("a task listing a file two earlier tasks list depends on the later of them alone when that one already reaches the first (the edge to T1 is reached through T2)", () => {
  assert.deepEqual(values([task("a.ts"), task("a.ts"), task("a.ts")]), ["none", "T1", "T2"]);
});

test("a consumer depends on the writer of a block only: a task using the block without holding its file writes nothing", () => {
  const tasks = [task("src/a.ts", { uses: ["C1"] }), task("src/b.ts", { uses: ["C1"] }), task("src/c.ts", { uses: ["C1"] })];
  assert.deepEqual(values(tasks, { C1: ["src/a.ts"] }), ["none", "T1", "T1"]);
  assert.deepEqual(values(tasks, { C1: [] }), ["none", "none", "none"]);
});

test("a holder of the block's file that does not name the block in Uses is no writer, so its consumers do not wait for it", () => {
  assert.deepEqual(values([task("src/a.ts"), task("src/b.ts", { uses: ["C1"] })], { C1: ["src/a.ts"] }), ["none", "none"]);
});

// [the field naming src/a.ts, whether T2 then depends on T1]
for (const [field, depends] of [
  ["verification", true],
  ["delivers", true],
  ["dod", true],
] as [keyof GraphTask, boolean][]) {
  test(`a task whose ${field} names a file an earlier task lists depends on that task`, () => {
    assert.deepEqual(values([task("src/a.ts"), task("src/b.ts", { [field]: "it reads src/a.ts first" })]), ["none", depends ? "T1" : "none"]);
  });
}

test("a file named inside a longer path or by its bare name is no reading, and a later task's file is never a dependency (an edge points backwards only)", () => {
  assert.deepEqual(values([task("src/a.ts"), task("src/b.ts", { dod: "it reads lib/src/a.ts.bak and a.ts" })]), ["none", "none"]);
  assert.deepEqual(values([task("src/b.ts", { dod: "it reads src/a.ts" }), task("src/a.ts")]), ["none", "none"]);
});

test("the Delivers of a decision record task is no reading: it records what other tasks build", () => {
  const record = task("docs/adr/20261124-retry.md", { delivers: "the record of the retry loop in src/a.ts" });
  assert.deepEqual(values([task("src/a.ts"), record]), ["none", "none"]);
  assert.deepEqual(values([task("src/a.ts"), { ...record, dod: "the record names src/a.ts" }]), ["none", "T1"]);
});

test("a leading ./ of a Files entry names the same file", () => {
  assert.deepEqual(values([task("./src/a.ts"), task("src/a.ts")]), ["none", "T1"]);
});

const arranged = (tasks: GraphTask[], blocks: Record<string, string[]> = {}, held: string[] = []) => arrangeTasks(tasks, new Map(Object.entries(blocks)), (path) => held.includes(path));

test("a task using a contract block only a later task writes moves behind that task, the others keeping their order (a slice consuming what a later slice creates)", () => {
  const tasks = [task("src/page.ts", { uses: ["C1"] }), task("docs/notes.md"), task("src/login.ts", { uses: ["C1"] }), task("src/form.ts")];
  assert.deepEqual(arranged(tasks, { C1: ["src/login.ts"] }), { order: [1, 2, 0, 3], cycles: [] });
  // In that order the consumer depends on its writer, as any later task would.
  const moved = [1, 2, 0, 3].map((at) => tasks[at]);
  assert.deepEqual(orderTasks(moved, new Map([["C1", ["src/login.ts"]]])).map((deps) => dependsValue(deps, ids(4))), ["none", "none", "T2", "none"]);
});

test("a consumer with a writer before it stays where it is, a later second writer moving nothing", () => {
  const tasks = [task("src/login.ts", { uses: ["C1"] }), task("src/page.ts", { uses: ["C1"] }), task("src/login.ts", { uses: ["C1"] })];
  assert.deepEqual(arranged(tasks, { C1: ["src/login.ts"] }), { order: [0, 1, 2], cycles: [] });
});

// [the field naming src/a.ts]
for (const field of ["verification", "delivers", "dod"] as (keyof GraphTask)[]) {
  test(`a task whose ${field} names a file only a later task creates moves behind that task`, () => {
    assert.deepEqual(arranged([task("src/b.ts", { [field]: "it reads src/a.ts first" }), task("src/a.ts")]), { order: [1, 0], cycles: [] });
  });
}

test("a task naming a file a later task lists stays where it is when the tree holds that file or an earlier task lists it too: it reads what is there", () => {
  const reader = task("src/b.ts", { dod: "it reads src/a.ts" });
  assert.deepEqual(arranged([reader, task("src/a.ts")], {}, ["src/a.ts"]).order, [0, 1]);
  assert.deepEqual(arranged([task("src/a.ts"), reader, task("src/a.ts")]).order, [0, 1, 2]);
});

test("a task moved behind its producer takes the tasks that depend on it along: each still follows what it needed before", () => {
  // T1 consumes the block T3 writes, T2 shares a file with T1.
  const tasks = [task("src/page.ts", { uses: ["C1"] }), task("src/page.ts"), task("src/login.ts", { uses: ["C1"] })];
  assert.deepEqual(arranged(tasks, { C1: ["src/login.ts"] }), { order: [2, 0, 1], cycles: [] });
});

test("two tasks that need each other are answered as a cycle naming what each needs of the other, and keep their order", () => {
  // T1 consumes the block T2 writes, and T2 reads a file T1 lists.
  const tasks = [task("src/page.ts", { uses: ["C1"] }), task("src/login.ts", { uses: ["C1"], dod: "it renders src/page.ts" })];
  assert.deepEqual(arranged(tasks, { C1: ["src/login.ts"] }, ["src/page.ts"]), {
    order: [0, 1],
    cycles: [
      [
        { at: 0, needs: "C1" },
        { at: 1, needs: "src/page.ts" },
      ],
    ],
  });
});

test("a ring a third task waits for is answered once, and that task still follows the ring", () => {
  const tasks = [task("docs/x.md", { dod: "it quotes src/login.ts" }), task("src/page.ts", { uses: ["C1"] }), task("src/login.ts", { uses: ["C1"], dod: "it renders src/page.ts" })];
  const result = arranged(tasks, { C1: ["src/login.ts"] }, ["src/page.ts"]);
  assert.deepEqual([result.order, result.cycles.length], [[1, 2, 0], 1]);
});

test("an order no producer disturbs is the order given", () => {
  assert.deepEqual(arranged(SAMPLE, BLOCKS), { order: [0, 1, 2, 3, 4], cycles: [] });
});

test("dependsValue words no dependency as none and several as their ids ascending, comma separated", () => {
  assert.deepEqual([dependsValue([], ids(3)), dependsValue([2, 0], ids(3))], ["none", "T1, T3"]);
});

test("the computed lines pass the three graph checks of the plan-index core by construction: no shared file without a path, no consumer beside its writer, no reader beside the task it reads", () => {
  const computed = values(SAMPLE, BLOCKS);
  const fields = (at: number): string[] => [
    "<!-- TASK -->",
    `### T${at + 1} - Task ${at + 1}`,
    "- TDD: none",
    "- Covers: AC1",
    `- Uses: ${SAMPLE[at].uses.join(", ") || "none"}`,
    `- Depends-on: ${computed[at]}`,
    `- Files: ${SAMPLE[at].files.join(", ")}`,
    `- Delivers: ${SAMPLE[at].delivers}`,
    `- Verification: ${SAMPLE[at].verification}`,
    `- DoD: ${SAMPLE[at].dod}`,
    "<!-- /TASK -->",
    "",
  ];
  const plan = ["# Plan", "", "## Acceptance criteria", "", "1. It works.", "", "## Tasks", "", ...SAMPLE.flatMap((_, at) => fields(at)), "## Contracts", "", "### C1 - Login", "", "File: src/login.ts", "", "POST /login"];
  const doc = readPlan(plan, { slots: [], held: () => true });
  const checked = checkPlan(doc, { fresh: { slots: [], held: () => true, memory: false }, held: () => true });
  assert.deepEqual([doc.defects, checked.defects], [[], []]);
  // The same plan with every dependency dropped holds the three defects the computed lines prevent.
  const bare = plan.map((line) => (line.startsWith("- Depends-on:") ? "- Depends-on: none" : line));
  const broken = checkPlan(readPlan(bare, { slots: [], held: () => true }), { fresh: { slots: [], held: () => true, memory: false }, held: () => true }).defects;
  assert.deepEqual(broken.map((line) => line.replace(/^FIX: (tasks? \S+).*?(both list|reads|uses).*$/, "$1 $2")), ["tasks T1 both list", "tasks T1 both list", "tasks T2 both list", "task T4 reads", "task T3 uses"]);
});

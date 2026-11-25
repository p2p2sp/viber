/*
 * listing.unit.test.ts - the index of a sound plan: its rows, the profile lines of
 * --split, the dirty and orphan lines of a work tree an earlier session left, and
 * the threshold line of a fresh plan. The state lines are state.unit.test.ts.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { CONTRACT, PLAN_DIR, PLAN_REL, planBody, SCOPE_TASKS, TWO_TASKS, type TaskFields } from "../../plan-body.ts";
import { indexOf, labelled, ok, answerOf } from "./scene.ts";

const HEAD = "tasks: id | state | tdd | excl | hard | deps | feeds | files | title";
const owned = (file: string): string[] => ["### C1 - Login endpoint", "", `File: ${file}`, "", "POST /login -> 200"];
const rowsOf = (lines: string[]): string[] => lines.filter((line) => /^T[0-9]+ \| /.test(line));

test("a fresh plan prints its rows and a verify line per task and names no reviewer, a task's exclusivity, hardness and dependencies in its row", () => {
  const plan = planBody([
    { id: "T1", title: "Add the login handler", files: "src/login.ts", hard: "lockout races" },
    { id: "T2", title: "Prove it against a real server", covers: "AC2", uses: "none", deps: "T1", files: "test/login.api.ts", exclusive: "true" },
  ]);
  assert.deepEqual(
    answerOf(indexOf(plan)),
    ok([
      `plan: ${PLAN_REL}`,
      "title: Add login",
      "progress: 0/2",
      HEAD,
      "T1 | todo | required | - | yes | - | - | src/login.ts | Add the login handler",
      "T2 | todo | required | yes | - | T1 | - | test/login.api.ts | Prove it against a real server",
      "verify: T1 | npm test",
      "verify: T2 | npm test",
    ]),
  );
});

test("a Files entry whose brackets wrap whole segments reaches the index untouched (an App Router project has one in every route)", () => {
  const files = ["src/app/(public)/[host]/[[...path]]/page.tsx", "src/app/api/sites/[siteId]/route.ts", "src/app/blog/[...slug]/page.tsx"].join(",");
  assert.deepEqual(rowsOf(indexOf(planBody([{ id: "T1", files }], 1)).lines), [`T1 | todo | required | - | - | - | - | ${files} | do the thing`]);
});

/** T1 holds the file C1 lives in; T2 to T4 consume it. */
const CONSUMERS: TaskFields[] = [
  { id: "T2", covers: "AC2", uses: "C1", deps: "T1", files: "src/b.ts" },
  { id: "T3", uses: "C1", deps: "T1", files: "src/c.ts" },
  { id: "T4", uses: "C1", deps: "T1", files: "src/d.ts" },
];

test("feeds names a block its writer declares with the count of other tasks using it, and stays - for a consumer", () => {
  const plan = planBody([{ id: "T1", files: "src/login.ts" }, ...CONSUMERS.slice(0, 2)], 2, owned("src/login.ts"));
  assert.deepEqual(
    rowsOf(indexOf(plan).lines).map((row) => row.split(" | ")[6]),
    ["C1:2", "-", "-"],
  );
});

const THREE = "src/login.ts,src/x.ts,src/y.ts";
const CONSUMER_LINES = ["T2", "T3", "T4"].map((id) => `profile: ${id} | tier: sonnet | review: sonnet | subject: ${id} [TDD] - do the thing`);
const PROFILES: Array<[string, TaskFields[], string, string[]]> = [
  ["a hard task is opus with an opus review", [{ id: "T1", title: "Race", hard: "lockout races" }], "", ["profile: T1 | tier: opus | review: opus | subject: T1 [TDD] - Race"]],
  ["a TDD none task over two files may be mechanical, its review then raised to sonnet", [{ id: "T1", tdd: "none", files: "src/a.ts,src/b.ts" }], "", ["profile: T1 | haiku? | mechanical: haiku review sonnet | else: sonnet waive? sonnet | subject: T1 - do the thing"]],
  ["a TDD none task over three files feeding nothing may have its review waived", [{ id: "T1", tdd: "none", files: THREE }], "", ["profile: T1 | tier: sonnet | review: waive? sonnet | subject: T1 - do the thing"]],
  ["a TDD required task never has its review waived", [{ id: "T1", title: "Add the handler" }], "", ["profile: T1 | tier: sonnet | review: sonnet | subject: T1 [TDD] - Add the handler"]],
  ["a task feeding three is reviewed by opus with no waiver", [{ id: "T1", tdd: "none", files: THREE }, ...CONSUMERS], "", ["profile: T1 | tier: sonnet | review: opus | subject: T1 - do the thing", ...CONSUMER_LINES]],
  ["a mechanical task feeding three is reviewed by opus either way", [{ id: "T1", tdd: "none", files: "src/login.ts" }, ...CONSUMERS], "", ["profile: T1 | haiku? | mechanical: haiku review opus | else: sonnet review opus | subject: T1 - do the thing", ...CONSUMER_LINES]],
  ["tiers.min sonnet raises the mechanical tier", [{ id: "T1", tdd: "none" }], "tiers:\n  min: sonnet\n", ["profile: T1 | haiku? | mechanical: sonnet review sonnet | else: sonnet waive? sonnet | subject: T1 - do the thing"]],
  ["tiers.max sonnet lowers a hard task and its review", [{ id: "T1", title: "Race", hard: "lockout races" }], "tiers:\n  max: sonnet\n", ["profile: T1 | tier: sonnet | review: sonnet | subject: T1 [TDD] - Race"]],
];
for (const [label, tasks, config, lines] of PROFILES) {
  test(`--split profile: ${label}`, () => {
    const plan = planBody(tasks, tasks.length === 1 ? 1 : 2, tasks.length === 1 ? CONTRACT : owned("src/login.ts"));
    assert.deepEqual(labelled(indexOf(plan, ["--split"], { config }).lines, "profile"), lines);
  });
}

const status = (...paths: string[]) => ({ status: paths.map((path) => ({ code: " M", path })) });

test("--split of a resumed run prints a profile line for each open task after the verify lines and before the dirty and orphan ones, the extras file of an open task showing on neither", () => {
  const at = indexOf(planBody(SCOPE_TASKS, 1), ["--split"], {
    status: ["progress: 2/4", "done: T1", "skipped: T4"],
    repo: status("src/todo.ts", "lib/x.ts", `${PLAN_DIR}/work/T3-extra.md`),
  });
  assert.deepEqual(
    answerOf(at).stdout.split("\n").slice(3),
    [
      "skipped: T4",
      HEAD,
      "T1 | done | required | - | - | - | - | src/done-a.ts,src/done-a2.ts | do the thing",
      "T2 | todo | required | - | - | - | - | src/todo.ts | do the thing",
      "T3 | todo | required | - | - | - | - | src/own.ts | do the thing",
      "T4 | skipped | required | - | - | - | - | src/done-b.ts | do the thing",
      "verify: T1 | npm test",
      "verify: T2 | npm test",
      "verify: T3 | npm test",
      "verify: T4 | npm test",
      "profile: T2 | tier: sonnet | review: sonnet | subject: T2 [TDD] - do the thing",
      "profile: T3 | tier: sonnet | review: sonnet | subject: T3 [TDD] - do the thing",
      "dirty: T2 | src/todo.ts",
      "orphan: lib/x.ts",
      "",
    ],
  );
});

const FIX_TASK = planBody([{ id: "T1", tdd: "none", repro: "./test/login.test.ts", files: "src/login.ts, test/login.test.ts" }], 1);
const PLAN = planBody(TWO_TASKS);
const TREES: Array<[string, string, string[], string[], string[]]> = [
  ["a clean tree prints neither", PLAN, [], [], []],
  ["the changed files of an open task are dirty, never orphans (a session was cut off inside it)", PLAN, [], ["src/login.ts", "src/reject.ts"], ["dirty: T1 | src/login.ts", "dirty: T2 | src/reject.ts"]],
  ["a path no task claims is an orphan, one line each and a comma in it kept whole", PLAN, [], ["notes/b.md", "notes/q3, draft.md"], ["orphan: notes/b.md", "orphan: notes/q3, draft.md"]],
  ["a path of the run directory is never an orphan", PLAN, [], [`${PLAN_DIR}/work/T1.round1.md`, `${PLAN_DIR}/rulings.md`], []],
  ["a done task's changed file is an orphan: nothing dispatches onto it again", PLAN, ["done: T1"], ["src/login.ts"], ["orphan: src/login.ts"]],
  ["a skipped task's changed file is dirty", PLAN, ["skipped: T2"], ["src/reject.ts"], ["dirty: T2 | src/reject.ts"]],
  ["the Repro path is uncommitted by design, the rest of its task's files are not", FIX_TASK, [], ["src/login.ts", "test/login.test.ts"], ["dirty: T1 | src/login.ts"]],
];
for (const [label, plan, state, changed, lines] of TREES) {
  test(`dirty and orphan lines: ${label}`, () => {
    assert.deepEqual(labelled(indexOf(plan, [], { status: state, repo: status(...changed) }).lines, "dirty", "orphan"), lines);
  });
}

/** Independent tasks, each on its own file. */
const planned = (count: number): string => planBody(Array.from({ length: count }, (_, k) => ({ id: `T${k + 1}`, files: `src/t${k + 1}.ts` })), 1);
const THRESHOLDS: Array<[number, string[], string[]]> = [
  [1, [], []],
  [13, [], []],
  [30, [], []],
  [31, [], ["threshold: 31 tasks, past 30"]],
  [31, ["--accepted", "0"], ["threshold: 31 tasks, past 30"]],
  [33, ["--accepted", "33"], []],
  [33, ["--input", "input.md", "--accepted", "34"], []],
  [36, ["--accepted", "34"], ["threshold: 36 tasks, past 30"]],
];
for (const [count, argv, tail] of THRESHOLDS) {
  test(`a fresh plan of ${count} tasks${argv.length > 0 ? ` with ${argv.join(" ")}` : ""} ends on its verify lines, a threshold line only past 30 tasks and past the accepted count, and no review or dispatch line`, () => {
    assert.deepEqual(indexOf(planned(count), argv, { files: { "input.md": "\n" } }).lines.slice(3 + 1 + 2 * count), tail);
  });
}

for (const [label, argv, state] of [
  ["a landed plan", [], ["done: none"]],
  ["--split", ["--split"], undefined],
] as const) {
  test(`${label} of 31 tasks prints no threshold line (other scripts parse the index of a landed run)`, () => {
    assert.deepEqual(labelled(indexOf(planned(31), [...argv], { status: state === undefined ? undefined : [...state] }).lines, "review", "dispatch", "threshold"), []);
  });
}

/*
 * task-ready.unit.test.ts - the task-ready core on a fake file system and a fake
 * git: with no model involved it says which tasks of a landed plan may run now
 * and remembers which task waited on which path of which other task, so the
 * session that builds the plan schedules nothing itself.
 *
 * Properties that carry the design. Readiness comes from the plan and status.md
 * alone: a task is listed once every Depends-on id is done, at most 10 tasks run
 * at once, and an Exclusive task runs alone. A collision is remembered in
 * .temp/viber/waits under the session mark: the first collision of a pair of
 * tasks is a wait that ends when the claimant leaves flight, the second one puts
 * the pair in sequence (the "sequence:" line task-step.sh turns into the
 * "decision: <id>: sequenced after <other>: both need <path>" line of
 * status.md), and from then on the waiting task is listed only once the other is
 * done or skipped. A claimant that is not running is put in sequence at the
 * first collision: a retry sent at once would only meet the same refusal. A
 * dirty file no task claims is waited out once, until every task running at
 * that wait has left flight; a second wait on it, or one with nothing else
 * running, is "unclaimed:". No wait can turn into a wait that never ends: a
 * skipped task claims nothing, and a claimant that itself runs only after the
 * waiting task is "blocked:". A plan with no wait and no decision lists what the
 * dependency rule alone lists.
 *
 * The exec bit and the line endings of the wrapper task-ready.sh are held by the
 * `invocations` and `script-portability` lint rules; what task-step.sh makes of
 * the printed lines is proven on the real script by tests/viber/task-step.test.ts.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runTaskReady, sequencedOf } from "../../../viber/lib/task-ready.ts";

const ROOT = "/r";
const RUN = "docs/_specs/2026-11-25-10-00-00_ready";
const PLAN = `${RUN}/plan.md`;
const WAITS = `${ROOT}/.temp/viber/waits`;
const USAGE = "error: usage: task-ready.sh <plan-file> ready --started <mark> [--flight <id>,..] [--held <id>,..] [--waiting <id>,..] [--lost <id>,..] | <plan-file> wait <id> --started <mark> [--flight <id>,..] <path>[,<path>]\n";

const lines = (...parts: string[]): string => parts.map((part) => `${part}\n`).join("");

interface Task {
  id: string;
  deps?: string;
  files?: string;
  exclusive?: boolean;
}

const block = ({ id, deps = "none", files = `src/${id}.ts`, exclusive = false }: Task): string[] => [
  "<!-- TASK -->",
  `### ${id} - task ${id}`,
  "- TDD: none",
  ...(exclusive ? ["- Exclusive: true"] : []),
  `- Depends-on: ${deps}`,
  `- Files: ${files}`,
  "- Delivers: the thing",
  "- Verification: npm test -> green",
  "- DoD: it works",
  "<!-- /TASK -->",
  "",
];

const plan = (tasks: Task[]): string => lines("---", `source: ${PLAN}`, "---", "# Ready", "", "## Goal", "", "Tasks run in order.", "", "## Tasks", "", ...tasks.flatMap(block));

/** T2 needs T1, T3 needs T2, T4 and T5 stand alone; T3 and T5 both own nothing shared. */
const CHAIN: Task[] = [{ id: "T1" }, { id: "T2", deps: "T1" }, { id: "T3", deps: "T2" }, { id: "T4" }, { id: "T5", files: "src/T5.ts, src/b.ts" }];

/** T3 owns a.ts and shared.ts, T5 owns b.ts; no dependency ties them. */
const PAIR: Task[] = [{ id: "T1" }, { id: "T3", files: "src/a.ts, ./src/shared.ts" }, { id: "T5", files: "src/b.ts" }, { id: "T6", deps: "T5", files: "src/c.ts" }];

const status = (done = "none", skipped = "none", decisions: string[] = []): string =>
  lines("# status", "", "progress: 0/5", `done: ${done}`, `skipped: ${skipped}`, "unreviewed: none", "deferred: none", "closed: none", ...decisions);

interface Scene {
  tasks?: Task[];
  status?: string | null;
  /** Files over those of the run, by repo-relative path. */
  tree?: Record<string, string>;
  bare?: boolean;
}

function scene(given: Scene = {}) {
  const files: Record<string, string> = { [`${ROOT}/${PLAN}`]: plan(given.tasks ?? CHAIN) };
  if (given.status !== null) files[`${ROOT}/${RUN}/status.md`] = given.status ?? status();
  for (const [path, text] of Object.entries(given.tree ?? {})) files[`${ROOT}/${path}`] = text;
  const fs = fakeFs(files, { dirs: [ROOT] });
  const git = fakeGit(given.bare ? null : { root: ROOT, tracked: [] });
  const call = (argv: string[], cwd = ROOT) => runTaskReady(argv, cwd, { fs, git });
  const ready = (flags: string[] = [], mark = "100") => call([PLAN, "ready", "--started", mark, ...flags]);
  /** A wait of task id; with no flight given every task of the plan is running, the claimant of any path included. */
  const everyone = (given.tasks ?? CHAIN).map((task) => task.id).join(",");
  const wait = (id: string, paths: string, at: { mark?: string; flight?: string } = {}) => call([PLAN, "wait", id, "--started", at.mark ?? "100", "--flight", at.flight ?? everyone, paths]);
  return { fs, call, ready, wait, waits: () => fs.readText(WAITS) };
}

const out = (...parts: string[]) => ({ stdout: lines(...parts), stderr: "", exit: 0 });

// --- acceptance criterion 8: the second collision of one pair ---

test("the second wait of one pair prints sequence: naming the waiting task, the claimant and the path, where the first printed wait: (a second collision puts the pair in sequence)", () => {
  const at = scene({ tasks: PAIR });
  assert.deepEqual(at.wait("T5", "src/a.ts"), out("wait: T5 | on: T3"));
  assert.deepEqual(at.wait("T5", "src/a.ts"), out("sequence: T5 | after: T3 | path: src/a.ts"));
  assert.equal(at.waits(), lines("started: 100", "wait: T5 | T3 | src/a.ts", "wait: T5 | T3 | src/a.ts", "sequence: T5 | T3 | src/a.ts"));
});

test("a pair put in sequence holds from the call that printed it, before its decision line reaches status.md: the second task is kept back and no third task can close a ring", () => {
  const tasks: Task[] = [{ id: "T1", files: "src/one.ts" }, { id: "T3", files: "src/a.ts" }, { id: "T5", files: "src/b.ts" }];
  const at = scene({ tasks });
  at.wait("T1", "src/a.ts");
  assert.deepEqual(at.wait("T1", "src/a.ts"), out("sequence: T1 | after: T3 | path: src/a.ts"));
  at.wait("T3", "src/b.ts");
  assert.deepEqual(at.wait("T3", "src/b.ts"), out("sequence: T3 | after: T5 | path: src/b.ts"));
  assert.deepEqual(at.wait("T5", "src/one.ts"), out("blocked: src/one.ts | by: T1"));
  assert.deepEqual(at.ready(["--waiting", "T1,T3"]), out("start: T5"));
  assert.deepEqual(at.ready(["--waiting", "T1,T3"], "200"), out("start: T5", "retry: T1,T3"));
});

test("with decision: T5: sequenced after T3: both need a.ts in status.md, T5 is listed only once T3 is done or skipped (the pair is dispatched one after the other)", () => {
  const decision = ["decision: T5: sequenced after T3: both need a.ts"];
  const open = scene({ tasks: PAIR, status: status("T1", "none", decision) });
  assert.deepEqual(open.ready(), out("start: T3"));
  assert.deepEqual(open.ready(["--flight", "T3"]), out("none"));
  assert.deepEqual(open.ready(["--waiting", "T5", "--flight", "T3"]), out("none"));
  assert.deepEqual(open.ready(["--waiting", "T5", "--held", "T3"]), out("none"));

  assert.deepEqual(scene({ tasks: PAIR, status: status("T1 T3", "none", decision) }).ready(), out("start: T5"));
  assert.deepEqual(scene({ tasks: PAIR, status: status("T1", "T3", decision) }).ready(), out("start: T5"));
  assert.deepEqual(scene({ tasks: PAIR, status: status("T1 T3", "none", decision) }).ready(["--waiting", "T5"]), out("retry: T5"));
});

test("the two halves meet: the sequence: line of the second collision, recorded as the decision line it names, holds the waiting task back while the claimant is open", () => {
  const at = scene({ tasks: PAIR });
  at.wait("T5", "src/a.ts");
  const second = at.wait("T5", "src/a.ts").stdout;
  const parts = /^sequence: (\S+) \| after: (\S+) \| path: (.+)\n$/.exec(second);
  assert.ok(parts !== null, second);
  const decision = `decision: ${parts[1]}: sequenced after ${parts[2]}: both need ${parts[3]}`;
  assert.deepEqual(sequencedOf([decision]), [{ id: "T5", after: "T3", path: "src/a.ts" }]);
  const later = scene({ tasks: PAIR, status: status("T1", "none", [decision]), tree: { ".temp/viber/waits": at.waits() ?? "" } });
  assert.deepEqual(later.ready(["--waiting", "T5"]), out("start: T3"));
});

test("a pair is the two tasks whichever of them waited: T3 colliding with T5 after T5 collided with T3 is the second collision", () => {
  const at = scene({ tasks: PAIR });
  assert.deepEqual(at.wait("T5", "src/a.ts"), out("wait: T5 | on: T3"));
  assert.deepEqual(at.wait("T3", "src/b.ts"), out("sequence: T3 | after: T5 | path: src/b.ts"));
});

test("one return naming two paths of one claimant is one collision: one wait: line, a line per path remembered, and the next return of the pair is the second", () => {
  const at = scene({ tasks: PAIR });
  assert.deepEqual(at.wait("T5", "src/a.ts, src\\shared.ts"), out("wait: T5 | on: T3"));
  assert.equal(at.waits(), lines("started: 100", "wait: T5 | T3 | src/a.ts", "wait: T5 | T3 | src/shared.ts"));
  assert.deepEqual(at.wait("T5", "./src/shared.ts"), out("sequence: T5 | after: T3 | path: src/shared.ts"));
});

// --- waits ---

test("a wait under another mark is discarded: the file starts again under the new mark and the collision is the first of its pair", () => {
  const at = scene({ tasks: PAIR });
  at.wait("T5", "src/a.ts", { mark: "100" });
  assert.deepEqual(at.wait("T5", "src/a.ts", { mark: "200" }), out("wait: T5 | on: T3"));
  assert.equal(at.waits(), lines("started: 200", "wait: T5 | T3 | src/a.ts"));
  assert.deepEqual(at.ready(["--waiting", "T5", "--flight", "T3"], "300"), out("start: T1", "retry: T5"));
});

test("the claimant is the lowest-numbered task not done whose Files or extras file lists the path, the waiting task left out", () => {
  const tasks: Task[] = [{ id: "T1", files: "src/a.ts" }, { id: "T2", files: "src/a.ts", deps: "T1" }, { id: "T3", files: "src/c.ts" }, { id: "T4", files: "src/d.ts" }];
  const tree = { [`${RUN}/work/T3-extra.md`]: "src/x.ts\r\n", [`${RUN}/work/T2-extra-review.md`]: "  ./src/y.ts  \n" };
  assert.deepEqual(scene({ tasks, tree }).wait("T4", "src/a.ts"), out("wait: T4 | on: T1"));
  assert.deepEqual(scene({ tasks, tree, status: status("T1") }).wait("T4", "src/a.ts"), out("wait: T4 | on: T2"));
  assert.deepEqual(scene({ tasks, tree }).wait("T4", "src/x.ts"), out("wait: T4 | on: T3"));
  assert.deepEqual(scene({ tasks, tree }).wait("T4", "src/y.ts"), out("wait: T4 | on: T2"));
  assert.deepEqual(scene({ tasks, tree }).wait("T3", "/r/src/x.ts, src/d.ts", { flight: "T3,T4" }), out("wait: T3 | on: T4"));
  assert.deepEqual(scene({ tasks, tree }).wait("T3", "/r/src/x.ts", { flight: "T3" }), out("unclaimed: src/x.ts"));
});

test("a path no task that is not done claims, with no other task in flight, prints unclaimed: and is not remembered (nobody is left to wait out)", () => {
  const at = scene({ tasks: PAIR, status: status("T3") });
  assert.deepEqual(at.wait("T5", "src/a.ts, src/nobody.ts", { flight: "T5" }), out("unclaimed: src/a.ts", "unclaimed: src/nobody.ts"));
  assert.deepEqual(at.wait("T5", "src/nobody.ts", { flight: "T3" }), out("unclaimed: src/nobody.ts"));
  assert.equal(at.waits(), null);
});

test("a wait on a path no task claims while other tasks are in flight is remembered and prints one wait: line naming them (a coder mid-edit lists an extra file only at its return)", () => {
  const at = scene({ tasks: PAIR });
  assert.deepEqual(at.wait("T5", "src/free.ts, src/other.ts", { flight: "T5,T3,T1" }), out("wait: T5 | on: T1,T3"));
  assert.equal(at.waits(), lines("started: 100", "free: T5 | T1,T3 | src/free.ts", "free: T5 | T1,T3 | src/other.ts"));
});

test("a task that waited on an unclaimed path goes on retry: only once every task in flight at that wait has left flight", () => {
  const at = scene({ tasks: PAIR });
  at.wait("T5", "src/free.ts", { flight: "T1,T3,T5" });
  assert.deepEqual(at.ready(["--waiting", "T5", "--flight", "T1,T3"]), out("none"));
  assert.deepEqual(at.ready(["--waiting", "T5", "--flight", "T3", "--held", "T1"]), out("none"));
  assert.deepEqual(at.ready(["--waiting", "T5", "--held", "T1,T3"]), out("retry: T5"));
  assert.deepEqual(scene({ tasks: PAIR, status: status("T1 T3"), tree: { ".temp/viber/waits": at.waits() ?? "" } }).ready(["--waiting", "T5"]), out("retry: T5"));
});

test("a second wait of a task on the same unclaimed path prints unclaimed: (it waited once, the failure is the task own), while another unclaimed path is still waited out", () => {
  const at = scene({ tasks: PAIR });
  at.wait("T5", "src/free.ts", { flight: "T3,T5" });
  assert.deepEqual(at.wait("T5", "./src/free.ts", { flight: "T1,T5" }), out("unclaimed: src/free.ts"));
  assert.deepEqual(at.wait("T5", "src/free.ts, src/new.ts", { flight: "T1,T5" }), out("unclaimed: src/free.ts", "wait: T5 | on: T1"));
  assert.deepEqual(at.wait("T3", "src/free.ts", { flight: "T3,T5" }), out("wait: T3 | on: T5"));
});

test("a wait on a path of a claimant that is not in flight prints sequence: at the first collision (a retry sent at once would meet the same refusal)", () => {
  const idle = scene({ tasks: PAIR });
  assert.deepEqual(idle.wait("T5", "src/a.ts, src/shared.ts", { flight: "T1,T5" }), out("sequence: T5 | after: T3 | path: src/a.ts"));
  assert.equal(idle.waits(), lines("started: 100", "wait: T5 | T3 | src/a.ts", "sequence: T5 | T3 | src/a.ts", "wait: T5 | T3 | src/shared.ts"));
  assert.deepEqual(idle.ready(["--waiting", "T5", "--flight", "T1"]), out("start: T3"));
  assert.deepEqual(scene({ tasks: PAIR, status: status("T3"), tree: { ".temp/viber/waits": idle.waits() ?? "" } }).ready(["--waiting", "T5"]), out("start: T1", "retry: T5"));
  assert.deepEqual(scene({ tasks: PAIR }).wait("T5", "src/a.ts", { flight: "T3,T5" }), out("wait: T5 | on: T3"));
});

test("a task that waited on two claimants in one return goes on retry: only once both have left flight", () => {
  const tasks: Task[] = [{ id: "T1", files: "src/one.ts" }, { id: "T3", files: "src/a.ts" }, { id: "T5", files: "src/b.ts" }];
  const at = scene({ tasks });
  assert.deepEqual(at.wait("T5", "src/a.ts, src/one.ts"), out("wait: T5 | on: T3", "wait: T5 | on: T1"));
  assert.deepEqual(at.ready(["--waiting", "T5", "--flight", "T3"]), out("start: T1"));
  assert.deepEqual(at.ready(["--waiting", "T5", "--flight", "T1"]), out("start: T3"));
  assert.deepEqual(at.ready(["--waiting", "T5", "--held", "T1,T3"]), out("retry: T5"));
});

test("a skipped task claims nothing: its path is unclaimed, or the next task listing it is the claimant (a skipped task never finishes, so a wait on it could not end)", () => {
  assert.deepEqual(scene({ tasks: PAIR, status: status("none", "T3") }).wait("T5", "src/a.ts", { flight: "T5" }), out("unclaimed: src/a.ts"));
  const tasks: Task[] = [{ id: "T1", files: "src/a.ts" }, { id: "T2", files: "src/a.ts", deps: "T1" }, { id: "T4", files: "src/d.ts" }];
  assert.deepEqual(scene({ tasks, status: status("none", "T1") }).wait("T4", "src/a.ts"), out("wait: T4 | on: T2"));
});

test("a claimant that runs only after the waiting task is blocked: and never a wait (no wait that cannot end)", () => {
  assert.deepEqual(scene({ tasks: PAIR }).wait("T5", "src/c.ts"), out("blocked: src/c.ts | by: T6"));
  const turned = scene({ tasks: PAIR, status: status("none", "none", ["decision: T3: sequenced after T6: both need src/c.ts"]) });
  assert.deepEqual(turned.wait("T5", "src/a.ts"), out("blocked: src/a.ts | by: T3"));
});

test("a waiting task goes on retry: once the claimant of its last wait line is out of flight, and stays off the list while that claimant runs", () => {
  const at = scene({ tasks: PAIR, status: status("T1") });
  at.wait("T5", "src/a.ts");
  assert.deepEqual(at.ready(["--waiting", "T5", "--flight", "T3"]), out("none"));
  assert.deepEqual(at.ready(["--waiting", "T5", "--held", "T3"]), out("retry: T5"));
  assert.deepEqual(at.ready(["--waiting", "T5"]), out("start: T3", "retry: T5"));
});

// --- readiness ---

test("a plan with no wait and no decision lists what the dependency rule lists: every task whose Depends-on ids are all done, in plan order", () => {
  assert.deepEqual(scene().ready(), out("start: T1,T4,T5"));
  assert.deepEqual(scene({ status: null }).ready(), out("start: T1,T4,T5"));
  assert.deepEqual(scene({ status: status("T1") }).ready(["--flight", "T4,T5"]), out("start: T2"));
  assert.deepEqual(scene({ status: status("T1 T2 T4") }).ready(), out("start: T3,T5"));
  assert.deepEqual(scene({ status: status("T1 T2 T3 T4 T5") }).ready(), out("none"));
  assert.equal(scene().waits(), null);
});

test("a task in flight, held or waiting is never listed as a start, and a dependency that is skipped opens nothing", () => {
  assert.deepEqual(scene().ready(["--flight", "T1", "--held", "T4"]), out("start: T5"));
  assert.deepEqual(scene().ready(["--flight", " T1 , T4 ", "--waiting", "T5"]), out("retry: T5"));
  assert.deepEqual(scene({ status: status("none", "T1") }).ready(), out("start: T4,T5"));
});

test("at most 10 tasks run at once: the tasks in flight and the listed ones together, a retry before a start, the starts in plan order", () => {
  const many: Task[] = Array.from({ length: 14 }, (_, k) => ({ id: `T${k + 1}` }));
  assert.deepEqual(scene({ tasks: many }).ready(), out("start: T1,T2,T3,T4,T5,T6,T7,T8,T9,T10"));
  assert.deepEqual(scene({ tasks: many }).ready(["--flight", "T1,T2,T3,T4,T5,T6,T7,T8"]), out("start: T9,T10"));
  assert.deepEqual(scene({ tasks: many }).ready(["--flight", "T1,T2,T3,T4,T5,T6,T7,T8", "--waiting", "T14"]), out("start: T9", "retry: T14"));
  assert.deepEqual(scene({ tasks: many }).ready(["--flight", "T1,T2,T3,T4,T5,T6,T7,T8,T9,T10"]), out("none"));
  assert.deepEqual(scene({ tasks: many, status: status("T1 T2") }).ready(["--flight", "T1,T2,T3,T4,T5,T6,T7,T8,T9,T10"]), out("start: T11,T12"));
});

test("an Exclusive task is held while another task is ready or anything is in flight, then listed alone, one at a time, and nothing is listed while it runs", () => {
  const tasks: Task[] = [{ id: "T1" }, { id: "T2", exclusive: true }, { id: "T3", exclusive: true }, { id: "T4", deps: "T1" }];
  assert.deepEqual(scene({ tasks }).ready(), out("start: T1"));
  assert.deepEqual(scene({ tasks }).ready(["--flight", "T1"]), out("none"));
  assert.deepEqual(scene({ tasks, status: status("T1") }).ready(), out("start: T4"));
  assert.deepEqual(scene({ tasks, status: status("T1 T4") }).ready(), out("start: T2"));
  assert.deepEqual(scene({ tasks, status: status("T1 T4") }).ready(["--flight", "T2"]), out("none"));
  assert.deepEqual(scene({ tasks, status: status("T1") }).ready(["--flight", "T2"]), out("none"));
  assert.deepEqual(scene({ tasks, status: status("T1 T2 T4") }).ready(), out("start: T3"));
});

// --- a lost dispatch ---

test("a task of --lost (its dispatch ended with no return) is listed under retry: at once, whoever its last wait named and whoever is in flight, where the same task of --waiting stays off the list", () => {
  const at = scene({ tasks: PAIR });
  at.wait("T5", "src/a.ts");
  assert.deepEqual(at.ready(["--waiting", "T5", "--flight", "T3"]), out("start: T1"));
  assert.deepEqual(at.ready(["--lost", "T5", "--flight", "T3"]), out("start: T1", "retry: T5"));
  assert.deepEqual(scene().ready(["--lost", " T1 , T4 "]), out("start: T5", "retry: T1,T4"));
});

test("a lost task is never listed as a start, and one that is also in flight or held is not listed at all (no second dispatch of a task that is out)", () => {
  assert.deepEqual(scene().ready(["--lost", "T1", "--flight", "T4"]), out("start: T5", "retry: T1"));
  assert.deepEqual(scene().ready(["--lost", "T1", "--flight", "T1"]), out("start: T4,T5"));
  assert.deepEqual(scene().ready(["--lost", "T1", "--held", "T1"]), out("start: T4,T5"));
});

test("a lost task that is done or skipped is dropped, and one a sequenced line holds is listed only once the other task is done", () => {
  assert.deepEqual(scene({ status: status("T1") }).ready(["--lost", "T1"]), out("start: T2,T4,T5"));
  assert.deepEqual(scene({ status: status("none", "T4") }).ready(["--lost", "T4"]), out("start: T1,T5"));
  const decision = ["decision: T5: sequenced after T3: both need a.ts"];
  assert.deepEqual(scene({ tasks: PAIR, status: status("T1", "none", decision) }).ready(["--lost", "T5", "--flight", "T3"]), out("none"));
  assert.deepEqual(scene({ tasks: PAIR, status: status("T1 T3", "none", decision) }).ready(["--lost", "T5"]), out("retry: T5"));
});

test("a lost task takes its slot back before any start under the cap of 10, and a lost Exclusive task goes out alone", () => {
  const many: Task[] = Array.from({ length: 14 }, (_, k) => ({ id: `T${k + 1}` }));
  assert.deepEqual(scene({ tasks: many }).ready(["--flight", "T1,T2,T3,T4,T5,T6,T7,T8", "--lost", "T9"]), out("start: T10", "retry: T9"));
  assert.deepEqual(scene({ tasks: many }).ready(["--flight", "T1,T2,T3,T4,T5,T6,T7,T8,T9,T10", "--lost", "T11"]), out("none"));
  const tasks: Task[] = [{ id: "T1" }, { id: "T2", exclusive: true }, { id: "T3", deps: "T1" }];
  assert.deepEqual(scene({ tasks, status: status("T1 T3") }).ready(["--lost", "T2"]), out("retry: T2"));
  assert.deepEqual(scene({ tasks }).ready(["--lost", "T2"]), out("start: T1"));
  assert.deepEqual(scene({ tasks }).ready(["--lost", "T1"]), out("retry: T1"));
});

// --- the call ---

test("the waits file lives under the repository root whatever the cwd, and under the cwd outside a repository", () => {
  const inside = scene({ tasks: PAIR });
  assert.deepEqual(inside.call([`${ROOT}/${PLAN}`, "wait", "T5", "--started", "100", "--flight", "T3", "src/a.ts"], `${ROOT}/src`), out("wait: T5 | on: T3"));
  assert.equal(inside.waits(), lines("started: 100", "wait: T5 | T3 | src/a.ts"));
  const outside = scene({ tasks: PAIR, bare: true });
  assert.deepEqual(outside.wait("T5", "src/a.ts"), out("wait: T5 | on: T3"));
  assert.equal(outside.waits(), lines("started: 100", "wait: T5 | T3 | src/a.ts"));
});

test("a missing plan, a task the plan does not hold and a waits file that cannot be written each exit 2 with one error: line and an empty stdout", () => {
  assert.deepEqual(scene().call(["docs/none/plan.md", "ready", "--started", "100"]), { stdout: "", stderr: "error: plan file not found: docs/none/plan.md\n", exit: 2 });
  assert.deepEqual(scene({ tasks: PAIR }).wait("T9", "src/a.ts"), { stdout: "", stderr: "error: the plan holds no task T9\n", exit: 2 });
  const at = scene({ tasks: PAIR });
  const blind = runTaskReady([PLAN, "wait", "T5", "--started", "100", "src/a.ts"], ROOT, { fs: { ...at.fs, writeBytes: () => false, appendBytes: () => false }, git: fakeGit({ root: ROOT, tracked: [] }) });
  assert.deepEqual(blind, { stdout: "", stderr: `error: cannot write ${WAITS}\n`, exit: 2 });
});

test("any other argv exits 2 with the usage line and an empty stdout", () => {
  const calls = [[], [PLAN], [PLAN, "ready"], [PLAN, "ready", "--started"], [PLAN, "ready", "--started", "100", "--flight"], [PLAN, "ready", "--started", "100", "--other", "T1"], [PLAN, "list", "--started", "100"], [PLAN, "wait", "T5", "--started", "100"], [PLAN, "wait", "T5", "--started", "100", " , "], [PLAN, "wait", "T5", "src/a.ts"], [PLAN, "wait", "T5", "--started", "100", "--held", "T1", "src/a.ts"], [PLAN, "wait", "T5", "--started", "100", "--lost", "T1", "src/a.ts"], [PLAN, "ready", "--started", "100", "--lost"]];
  for (const argv of calls) assert.deepEqual(scene().call(argv), { stdout: "", stderr: USAGE, exit: 2 }, argv.join(" "));
});

test("sequencedOf reads only the decision lines of the sequenced shape, a carriage return at the end cut", () => {
  assert.deepEqual(sequencedOf(["decision: T5: sequenced after T3: both need src/a b.ts\r", "decision: T2: auto: keep the cache", "decision: T7: sequenced after T3", "done: T1"]), [{ id: "T5", after: "T3", path: "src/a b.ts" }]);
});

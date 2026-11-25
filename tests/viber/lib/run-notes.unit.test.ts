/*
 * run-notes.unit.test.ts - the run-notes core on a fake file system: with no
 * model involved it prints the one list commit-task.sh --leftovers writes into
 * outcome.md under "## Notes and rulings", which is all closeout and the user
 * get of the notes of a plan review once the build is over.
 *
 * Properties that carry the design. The list is complete: every item of the
 * "## Open items" section of the landed plan.md and every entry of rulings.md
 * is one line, so the user reads the list and never the plan. A task note is
 * numbered as plan-index.sh --split numbered it in the task file (N1.. per
 * task, in section order) and ends on what happened to it: the text of the
 * coder's own N<k> line in work/<id>-coder.md, "no coder line" when the coder
 * left none, "task skipped" for a task on the skipped list. After the rulings
 * come the two kinds of line the build schedules by: a path a task commit
 * refused (the "refused:" key of status.md, its claimant read back from the plan
 * and the extras files) and a pair of tasks put in sequence (a "decision: <id>:
 * sequenced after <other>: both need <path>" line of status.md). A run with none
 * of these prints nothing, so its outcome.md holds no notes section. The caller
 * takes the printed lines as they stand: stdout (nothing on a refusal) and the
 * exit codes (2: unusable argv or a missing plan) are the whole interface.
 *
 * The exec bit and the line endings of the wrapper run-notes.sh are held by the
 * `invocations` and `script-portability` lint rules; the section the lines land
 * in is proven on the real script by tests/viber/commit-task.test.ts.
 */

import assert from "node:assert/strict";
import { fakeFs } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runRunNotes } from "../../../viber/lib/run-notes.ts";

const ROOT = "/r";
const RUN = "docs/_specs/2026-11-25-10-00-00_notes";
const PLAN = `${RUN}/plan.md`;

const lines = (...parts: string[]): string => parts.join("\n") + "\n";

const taskBlock = (id: string): string[] => ["<!-- TASK -->", `### ${id} - task ${id}`, `- Files: src/${id}.ts`, "<!-- /TASK -->", ""];

/** A landed plan: the open items, when given, as the last section above the tasks. */
const plan = (items: string[]): string =>
  lines("---", `source: ${PLAN}`, "---", "# Add login", "", "## Goal", "", "Users can log in.", "", ...(items.length === 0 ? [] : ["## Open items", "", ...items, ""]), "## Tasks", "", ...["T1", "T2", "T3"].flatMap(taskBlock));

const status = (skipped = "none"): string => lines("# status", "", "progress: 2/3", "done: T1 T3", `skipped: ${skipped}`, "unreviewed: none", "deferred: none", "closed: none");

const RULINGS = lines("# Rulings", "", "- T1: keep the cache | why: the spec asks for it | cost if wrong: stale reads", "- tests: accept the red suite | why: the failure is older than the run | cost if wrong: a regression ships");

/** files: by path relative to the run directory; the plan and the state file are always there unless overridden with null. */
function run(files: Record<string, string | null>, argv: string[] = [PLAN], cwd = ROOT) {
  const run: Record<string, string | null> = { "plan.md": plan([]), "status.md": status(), ...files };
  const held = Object.entries(run).filter((entry): entry is [string, string] => entry[1] !== null);
  const fs = fakeFs(Object.fromEntries(held.map(([path, text]) => [`${ROOT}/${RUN}/${path}`, text])), { dirs: [ROOT] });
  return runRunNotes(argv, cwd, { fs });
}

const FULL = [
  "- critical | plan | AC2 - no task covers the logout criterion",
  "- note | T1 | the handler name differs from the route table",
  "- note | T1 | fixed after the last review: the DoD now names the 401 case",
  "- note | T3 | the fixture is shared with the billing tests",
  "- note | plan | the summary leaves the session length open",
];

test("a run with three notes over two tasks, one plan note, one open critical problem and two rulings prints exactly seven lines, each note with its coder line (the list handed to closeout is complete)", () => {
  const result = run({
    "plan.md": plan(FULL),
    "rulings.md": RULINGS,
    "work/T1-coder.md": lines("N1: renamed the handler to match the table", "N2: nothing to do, the clause was already met", "The cache key is built in src/key.ts."),
    "work/T3-coder.md": lines("N1: left the fixture alone and added a second one", "A trap: the billing tests read the same file."),
  });
  assert.equal(result.exit, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(result.stdout.split("\n"), [
    "- critical | plan | AC2 - no task covers the logout criterion | open",
    "- note | T1 | N1 | the handler name differs from the route table | renamed the handler to match the table",
    "- note | T1 | N2 | fixed after the last review: the DoD now names the 401 case | nothing to do, the clause was already met",
    "- note | T3 | N1 | the fixture is shared with the billing tests | left the fixture alone and added a second one",
    "- note | plan | the summary leaves the session length open | for the user",
    "- ruling | T1: keep the cache | why: the spec asks for it | cost if wrong: stale reads",
    "- ruling | tests: accept the red suite | why: the failure is older than the run | cost if wrong: a regression ships",
    "",
  ]);
});

test("every item of the Open items section and every entry of rulings.md is on exactly one printed line, whatever the coders wrote (nothing of the plan review is lost before outcome.md)", () => {
  const items = [
    "- critical | T2 | the contract C1 names a field the task never writes",
    "- critical | plan | spec - the goal contradicts the summary",
    "- note | T2 | first",
    "- note | T2 | second",
    "- note | T2 | third",
    "- note | T1 | only one",
    "- note | plan | (T2) a fourth note past the cap",
  ];
  const result = run({ "plan.md": plan(items), "rulings.md": RULINGS });
  const printed = result.stdout.split("\n").slice(0, -1);
  assert.equal(printed.length, items.length + 2);
  for (const item of items) {
    const text = item.slice(item.indexOf(" | ", item.indexOf(" | ") + 3) + 3);
    assert.equal(printed.filter((line) => line.includes(` | ${text} | `)).length, 1, `${item}\n${result.stdout}`);
  }
  assert.deepEqual(printed.slice(-2), RULINGS.split("\n").slice(2, 4).map((line) => `- ruling | ${line.slice(2)}`));
  assert.deepEqual(printed.slice(0, 2), ["- critical | T2 | the contract C1 names a field the task never writes | open", "- critical | plan | spec - the goal contradicts the summary | open"]);
});

test("a note whose task left no notes file, or a notes file holding no line for it, ends on 'no coder line'", () => {
  const result = run({
    "plan.md": plan(["- note | T1 | first", "- note | T1 | second", "- note | T3 | third"]),
    "work/T1-coder.md": lines("N2: handled the second", "A constraint the diff does not show."),
  });
  assert.equal(result.stdout, lines("- note | T1 | N1 | first | no coder line", "- note | T1 | N2 | second | handled the second", "- note | T3 | N1 | third | no coder line"));
});

test("a note of a task on the skipped list ends on 'task skipped', even when its coder left a line before the skip", () => {
  const result = run({
    "plan.md": plan(["- note | T2 | the adapter has no fake yet", "- note | T3 | kept"]),
    "status.md": status("T2"),
    "work/T2-coder.md": lines("N1: started on the fake"),
    "work/T3-coder.md": lines("N1: done"),
  });
  assert.equal(result.stdout, lines("- note | T2 | N1 | the adapter has no fake yet | task skipped", "- note | T3 | N1 | kept | done"));
});

test("a coder line is read behind a list dash, with a carriage return at its end and below other notes; one with no text counts as no line", () => {
  const result = run({
    "plan.md": plan(["- note | T1 | first", "- note | T1 | second", "- note | T1 | third"]),
    "work/T1-coder.md": "A convention: errors are values here.\r\n- N1: followed it  \r\nN2:\r\n  N3: indented, so no line of the coder\r\nN10: no such note\r\n",
  });
  assert.equal(result.stdout, lines("- note | T1 | N1 | first | followed it", "- note | T1 | N2 | second | no coder line", "- note | T1 | N3 | third | no coder line"));
});

test("a plan with no open item and no ruling prints nothing and exits 0 (a build without notes writes the outcome.md it wrote before)", () => {
  const runs: Array<Record<string, string | null>> = [{}, { "status.md": null }, { "rulings.md": "# Rulings\n\n" }, { "work/T1-coder.md": lines("N1: a line for a note the plan never held") }];
  for (const files of runs) assert.deepEqual(run(files), { stdout: "", stderr: "", exit: 0 });
});

test("a run with rulings and no open item prints the ruling lines alone", () => {
  assert.equal(run({ "rulings.md": RULINGS }).stdout, lines("- ruling | T1: keep the cache | why: the spec asks for it | cost if wrong: stale reads", "- ruling | tests: accept the red suite | why: the failure is older than the run | cost if wrong: a regression ships"));
});

test("a path a task commit refused is one refused line naming the task that claims it, and a sequenced decision one sequenced line, both after the rulings (every such event reaches outcome.md, none a question)", () => {
  const result = run({
    "status.md": status() + lines("decision: T2: sequenced after T1: both need src/T1.ts", "decision: T3: auto: keep the cache", "refused: T2:src/T3.ts T1:lib/x.ts"),
    "rulings.md": RULINGS,
    "work/T3-extra.md": "./lib/x.ts\r\n",
  });
  assert.equal(result.exit, 0, result.stderr);
  assert.deepEqual(result.stdout.split("\n").slice(2), ["- refused | T2 | src/T3.ts | claimed by task T3", "- refused | T1 | lib/x.ts | claimed by task T3", "- sequenced | T2 | after T1 | src/T1.ts", ""]);
});

test("a refused path no other task lists any more ends on 'claimed by another task', and the refusing task never counts as its own claimant", () => {
  const result = run({ "status.md": status() + lines("refused: T1:lib/gone.ts T2:src/T2.ts"), "work/T1-extra.md": "lib/gone.ts\n" });
  assert.equal(result.stdout, lines("- refused | T1 | lib/gone.ts | claimed by another task", "- refused | T2 | src/T2.ts | claimed by another task"));
});

test("a refused path holding a space is one entry and one line: status.md keeps a space as %20 and a percent sign as %25, read back here (split on its spaces the path was recorded as another, shorter path)", () => {
  const result = run({ "status.md": status() + lines("refused: T1:lib/my%20shared%20file.ts T2:docs/50%25%20off.md T2:src/T3.ts"), "work/T3-extra.md": "lib/my shared file.ts\n" });
  assert.equal(result.exit, 0, result.stderr);
  assert.equal(result.stdout, lines("- refused | T1 | lib/my shared file.ts | claimed by task T3", "- refused | T2 | docs/50% off.md | claimed by another task", "- refused | T2 | src/T3.ts | claimed by task T3"));
});

test("a refused key reading none, an entry that is no <task id>:<path> and a decision of another shape print nothing (a build with no collision writes the outcome.md it wrote without them)", () => {
  for (const tail of [lines("refused: none"), lines("refused: T1 :src/a.ts T2:"), lines("decision: T1: auto: sequenced after lunch"), ""]) {
    assert.deepEqual(run({ "status.md": status() + tail }), { stdout: "", stderr: "", exit: 0 }, tail);
  }
});

test("an absolute plan path, a backslashed one and a ./ one read the same run as the repo-relative path", () => {
  const files = { "plan.md": plan(["- note | plan | one for the user"]) };
  const expected = lines("- note | plan | one for the user | for the user");
  for (const spelled of [`${ROOT}/${PLAN}`, PLAN.replaceAll("/", "\\"), `./${PLAN}`]) assert.equal(run(files, [spelled]).stdout, expected, spelled);
});

test("a missing plan exits 2 with one error: line naming it and an empty stdout", () => {
  assert.deepEqual(run({ "plan.md": null }), { stdout: "", stderr: `error: plan file not found: ${PLAN}\n`, exit: 2 });
});

test("no argument, or more than one, exits 2 with the usage line and an empty stdout", () => {
  for (const argv of [[], [PLAN, "extra"], [""]]) {
    assert.deepEqual(run({ "rulings.md": RULINGS }, argv), { stdout: "", stderr: "error: usage: run-notes.sh <plan-file>\n", exit: 2 });
  }
});

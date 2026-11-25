/*
 * ready-prose.unit.test.ts - pins the prose that leaves the order of a build to
 * `task-step.sh` instead of `implementor` computing it.
 *
 * `implementor` opens no file and judges nothing about scheduling: it asks
 * `task-step.sh ready` which tasks to start and reports what that lists, hands a
 * coder's `WAIT:` line on as `--wait`, and acts on the `NEXT: wait` block it gets
 * back. Which task is ready, the cap, the `Exclusive` hold and the memory of who
 * waited on whom live in `scripts/task-ready.ts`, which `task-step.sh` alone
 * calls. No event of this kind asks the user: a second collision of a pair is a
 * `commit-task.sh --decide` line (one that fails is named in the summary), and a path a task commit refused reaches
 * `outcome.md` through the `refused:` key of `status.md` and `run-notes.sh`,
 * never through the session's memory. A coder or reviewer that returned no
 * output at all is reported as `lost`, and the script says when its task goes
 * out again. `task-coder` names on `WAIT:` the path a
 * file guard refusal named. The files read here are shipped prompts and script
 * headers, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/ready-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(rel: string): string {
  return fs.readFileSync(path.join(VIBER, rel), "utf8");
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start);
  return text.slice(start, end);
}

const SKILL = read("skills/implementor/SKILL.md");
const STEP_4 = between(SKILL, "## 4. Run the plan", "## 5 to 7. Close and archive");
const STEP = read("scripts/task-step.sh");
const STEP_HEADER = STEP.slice(0, STEP.indexOf("\nset -euo pipefail"));
const CODER = read("agents/task-coder.md");

const READY_CALL = '`"${CLAUDE_PLUGIN_ROOT}/scripts/task-step.sh" "<plan>" "-" "<started>" ready`';

test("implementor asks task-step.sh which tasks to start: one ready call alone in a message, at the start and after every done, hold, wait or skip", () => {
  assert.ok(STEP_4.includes(`${READY_CALL} answers \`NEXT: ready | start: <ids> | retry: <ids>\``));
  assert.ok(STEP_4.includes("or `NEXT: ready | none`"));
  assert.ok(STEP_4.includes("Make that call alone in a message, at the start and after every message that answered a `NEXT: done`, `NEXT: hold`, `NEXT: wait` or a skip"));
});

test("implementor reports start for each start: id and retry coder --waited for each retry: id, and starts no task the call did not list", () => {
  assert.ok(STEP_4.includes("`start` for each `start:` id and `retry coder --waited` for each `retry:` id"));
  assert.ok(STEP_4.includes("Start no task it did not list; order, hold and count none yourself."));
});

for (const gone of ["`deps` is done", "`excl` column", "At most 10 tasks", "Start with every task", "unblocks the most tasks", "its dependents are ready"]) {
  test(`implementor holds no scheduling rule of its own: ${gone}`, () => {
    assert.ok(!STEP_4.includes(gone));
  });
}

test("implementor hands a coder WAIT: line to task-step.sh as --wait and keeps no wait rule or wait memory of its own", () => {
  const coder = lines(STEP_4).find((line) => line.startsWith("- A coder return:")) ?? "";
  assert.ok(coder.includes('`--wait "<path>,..."` for its `WAIT:` line'));
  assert.ok(!lines(STEP_4).some((line) => line.startsWith("- A coder `VERDICT: FAIL` carrying `WAIT:`")));
  assert.ok(!SKILL.includes("already waited once"));
});

test("the wait directive asks nothing and ends no attempt: the task goes out again only when a ready call lists it", () => {
  const wait = lines(STEP_4).find((line) => line.startsWith("- `NEXT: wait")) ?? "";
  assert.ok(wait.includes("`NEXT: wait | on: <id>`: the task waits for that task, asking nothing and ending no attempt: dispatch nothing for it until a `ready` call lists it."));
  assert.ok(!wait.includes("AskUserQuestion"));
});

test("implementor carries no refused warning to the summary: commit-task.sh records it on the refused: key and run-notes.sh lists it", () => {
  assert.ok(!SKILL.includes("refused <path> - claimed by task"));
  assert.ok(read("scripts/commit-task.sh").includes('#   refused: T2:src/a.ts a task commit, one "<task-id>:<path>" entry per --with or'));
  assert.ok(read("scripts/run-notes.ts").includes(" *              - refused | <task id> | <path> | claimed by task <id>"));
  assert.ok(read("scripts/run-notes.ts").includes(" *              - sequenced | <task id> | after <task id> | <path>"));
});

test("implementor never calls task-ready.sh: task-step.sh is its one caller", () => {
  assert.ok(!SKILL.includes("task-ready"));
  assert.ok(STEP.includes('bash "$here/task-ready.sh" "${ready_args[@]}"'));
  assert.ok(STEP.includes('bash "$here/task-ready.sh" "$plan" wait "$id" --started "$started" --flight "$flight" "$f_wait"'));
});

for (const directive of ["NEXT: ready | start: <id>,<id> | retry: <id>,<id>", "NEXT: ready | none", "NEXT: wait | on: <claimant>[ | sequenced]"]) {
  test(`the header of task-step.sh defines the directive ${directive}`, () => {
    assert.ok(lines(STEP_HEADER).includes(`#   ${directive}`));
  });
}

test("the header of task-step.sh names the events implementor reports for scheduling", () => {
  for (const usage of ["#     ready", "#                            [--wait <path>[,<path>]...]", "#     retry coder [--denied|--waited] | retry reviewer"]) {
    assert.ok(lines(STEP_HEADER).includes(usage), usage);
  }
});

test("the second collision of a pair is recorded by the --decide line task-step.sh prints, in the shape task-ready.ts reads back from status.md (no question is asked)", () => {
  assert.ok(STEP.includes('--decide \\"$plan\\" \\"$id\\" \\"sequenced after $claimant: both need $path\\""'));
  assert.ok(read("lib/task-ready.ts").includes("const SEQUENCED = /^decision: ([^ \\t:]+): sequenced after ([^ \\t:]+): both need (.+)$/;"));
  assert.ok(!between(STEP, "wait_blocks() {", "\n}\n").includes("ASK:"));
});

test("the --decide line of a pair put in sequence exiting non-zero has a branch that asks nobody: it is named in the final summary and the wait block after it acted on", () => {
  const failed = lines(STEP_4).find((line) => line.startsWith("  - A `--decide` or `--skip` one")) ?? "";
  assert.ok(failed.includes("exiting non-zero after a ruling or ahead of a `NEXT: wait` -> name it in the final summary and act on the next block."));
  assert.ok(!failed.includes("AskUserQuestion"));
});

test("task-ready.sh is told which tasks are in flight at a wait, so a dirty path no task claims is waited out and a pair whose claimant is not running is put in sequence at once", () => {
  assert.ok(STEP.includes("  read_steps\n  out=\"$(bash \"$here/task-ready.sh\" \"$plan\" wait"));
  assert.ok(read("lib/task-ready.ts").includes("if (met(claimant) || !flight.has(claimant)) {"));
  assert.ok(read("lib/task-ready.ts").includes("if (running.length === 0 || waitedOn(path)) out.push(`unclaimed: ${path}`);"));
});

test("implementor reports a coder or reviewer that returned no output at all as lost and acts on the ready block it gets back: it asks nobody and judges nothing", () => {
  const lost = lines(STEP_4).find((line) => line.startsWith("- A coder or reviewer returning no output at all")) ?? "";
  assert.ok(lost.includes("(it failed, was killed or stopped): `lost`; act on a `NEXT: ready` answer as on the `ready` call's."));
  assert.ok(!lost.includes("AskUserQuestion"));
  assert.ok(SKILL.includes("- An agent returning output with no `VERDICT:` line -> act as on its `VERDICT: FAIL`"));
});

test("task-step.sh answers lost from task-ready.sh, which lists a lost task once and never one still in flight (no question, no second dispatch)", () => {
  assert.ok(lines(STEP_HEADER).includes("#     lost       (the coder or reviewer of the task ended with no return at"));
  assert.ok(STEP.includes('[[ -z "$lost" ]] || ready_args+=(--lost "$lost")'));
  const event = between(STEP, "\n  lost)\n", "\n  start)\n");
  assert.ok(event.includes('elif [[ "$st_started" == "$started" && "$step" == "run" ]]; then'));
  assert.ok(event.includes("ready_block"));
  assert.ok(!event.includes("ASK:"));
  assert.ok(read("lib/task-ready.ts").includes('const lost = new Set([...idsOf("--lost")].filter((id) => !flight.has(id) && !held.has(id)));'));
});

test("task-coder names on WAIT: every path a file guard refusal named, beside the dirty files outside its Files", () => {
  const wait = lines(CODER).find((line) => line.startsWith("- on FAIL only: `WAIT:")) ?? "";
  assert.ok(wait.includes("every path a `viber guard:` refusal named, and every file outside `Files` you need that carries uncommitted changes you did not make"));
});

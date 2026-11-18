/*
 * extras-prose.unit.test.ts - pins the prose that hands the extras file to the
 * coder and the reviewer instead of `implementor` computing their lines.
 *
 * `implementor` builds no dispatch line (`task-step.sh` prints the coder's `extras:` and the
 * reviewer's `extras:` and `scope:` lines) and hands the `EXTRA:` paths returned in its own
 * session to `task-step.sh` as `--with` (the extras files stay the record). `task-coder` records its
 * `EXTRA:` paths in the coder file, `task-reviewer` runs the scope command and
 * records its own in the reviewer file. The file names and the `--extra` mode come
 * from the headers of `plan-index.sh` and `commit-task.sh`. The files read here are
 * shipped prompts and script headers, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/extras-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

const CODER_EXTRAS_LINE = "extras: <dir>/work/<id>-extra.md";
const REVIEWER_EXTRAS_LINE = "extras: <dir>/work/<id>-extra-review.md";
const SCOPE_LINE =
  'scope: "${CLAUDE_PLUGIN_ROOT}/scripts/plan-index.sh" "<plan>" --extra "<id>"';

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

const SKILL = `${read("skills/implementor/SKILL.md")}\n${read("skills/implementor/parts/close.md")}`;
const CODER = read("agents/task-coder.md");
const REVIEWER = read("agents/task-reviewer.md");

const STEP_4 = between(SKILL, "## 4. Run the plan", "## 5 to 7. Close and archive");

function inputBullet(text: string, label: string): string {
  return lines(text).find((line) => line.startsWith(`- A \`${label}\``) || line.startsWith(`- An \`${label}\``)) ?? "";
}

test("implementor holds no coder or reviewer dispatch line: the extras, scope and decide-file lines come from plan-index.sh --dispatch through task-step.sh", () => {
  assert.ok(!SKILL.includes(CODER_EXTRAS_LINE));
  assert.ok(!SKILL.includes(REVIEWER_EXTRAS_LINE));
  assert.ok(!SKILL.includes(SCOPE_LINE));
  assert.ok(!SKILL.includes("decide-file: <dir>"));
});

test("both baseline-run fragments end before a baseline dispatch line: plan-index.sh --dispatch prints it", () => {
  for (const name of ["fast", "full"]) {
    const fragment = read(`skills/implementor/fragments/baseline-run.${name}.md`);
    assert.ok(!fragment.includes("baseline: <dir>/work/tests-baseline.md"));
    assert.ok(!fragment.includes("Every coder and reviewer dispatch"));
    assert.ok(fragment.trimEnd().endsWith("`accept` going on with no baseline."));
  }
});

test("a coder return hands the EXTRA paths of the attempt to task-step.sh as --with, which commits them (a path an earlier attempt reverted must not sweep another task's change into this commit)", () => {
  assert.ok(STEP_4.includes("`--with \"<path>,...\"` for its `EXTRA:` paths"));
  assert.ok(STEP_4.includes("`--defer \"<id>:<path>,...\"` for its `DEFERRED:` lines"));
});

test("a reviewer return hands its EXTRA paths to task-step.sh as --with", () => {
  assert.ok(STEP_4.includes("`--with` for its `EXTRA:` paths"));
});

test("implementor builds no extra or recheck line for the reviewer", () => {
  assert.ok(!SKILL.includes("`extra:"));
  assert.ok(!SKILL.includes("`recheck:"));
});

test("implementor builds no resume line: a dirty answer of continue goes to start as --resume", () => {
  assert.equal(lines(SKILL).filter((line) => line.includes("resume:")).length, 0);
  const dirty = lines(SKILL).find((line) => line.startsWith("- `dirty: <id> | <paths>`")) ?? "";
  assert.ok(dirty.includes("`--resume \"<paths>\"`"));
});

test("the scope line names the --extra mode plan-index.sh declares", () => {
  assert.ok(read("scripts/plan-index.sh").includes("plan-index.sh <plan-file> --extra <task-id>"));
  assert.ok(SCOPE_LINE.includes(" --extra "));
});

test("the coder extras path ends in the -extra.md name commit-task.sh derives", () => {
  assert.ok(read("scripts/commit-task.sh").includes('"$extras_dir/work/$task_id-extra.md"'));
  assert.ok(CODER_EXTRAS_LINE.endsWith("<id>-extra.md"));
});

test("the reviewer extras path ends in the -extra-review.md name commit-task.sh derives", () => {
  assert.ok(read("scripts/commit-task.sh").includes('"$extras_dir/work/$task_id-extra-review.md"'));
  assert.ok(REVIEWER_EXTRAS_LINE.endsWith("<id>-extra-review.md"));
});

test("a coder PASS is routed to review or commit by task-step.sh, never by a rule of the skill", () => {
  assert.ok(!STEP_4.includes("-> reviewer dispatch"));
  assert.ok(!STEP_4.includes("Coder `PASS` otherwise"));
});

test("implementor runs plan-index.sh only for the split in step 2", () => {
  const calls = lines(SKILL).filter((line) => line.includes("plan-index.sh"));
  assert.equal(calls.length, 2);
  assert.ok(calls[0].startsWith("allowed-tools:"));
  assert.ok(calls[1].startsWith("Run `"));
});

test("the --extra mode appears nowhere in implementor", () => {
  assert.equal(lines(SKILL).filter((line) => line.includes("--extra")).length, 0);
});

test("task-coder names the extras input line", () => {
  assert.ok(inputBullet(CODER, "extras").startsWith("- An `extras` line"));
});

test("task-coder reads its extras file first when it exists", () => {
  assert.ok(inputBullet(CODER, "extras").includes("when it exists, read it first"));
});

test("task-coder continues the paths already in its extras file", () => {
  assert.ok(inputBullet(CODER, "extras").includes("so continue them, never restart"));
});

test("task-coder appends its EXTRA paths to the extras file once", () => {
  const bullet = inputBullet(CODER, "extras");
  assert.ok(bullet.includes("append each path of your `EXTRA:` line it does not list yet to it once"));
});

test("task-coder exempts the extras paths from its uncommitted-changes check as it exempts its resume paths", () => {
  assert.ok(CODER.includes("absent from your `resume` line and your `extras` file, edit nothing more"));
});

test("task-coder never names on EXTRA a file a task not yet done lists", () => {
  assert.ok(CODER.includes("never a file a task not yet `done` lists"));
});

test("task-reviewer names the extras and scope input lines", () => {
  assert.ok(REVIEWER.includes("`extras` (your extras file), `scope` (a command)"));
});

test("task-reviewer runs the scope command before judging", () => {
  assert.ok(inputBullet(REVIEWER, "scope").includes("run it before judging"));
});

test("task-reviewer reads its extras file first when it exists", () => {
  assert.ok(inputBullet(REVIEWER, "extras").includes("when it exists, read it first"));
});

test("task-reviewer appends its own EXTRA paths to its extras file once", () => {
  const bullet = inputBullet(REVIEWER, "extras");
  assert.ok(bullet.includes("append each path of your `EXTRA:` line it does not list yet to it once"));
});

test("task-reviewer names its extras file beside its report as the files it may write", () => {
  assert.ok(REVIEWER.includes("The only files you write are your report and your `extras` file"));
});

const DROP_CALL = '"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" --drop "<plan>" "<path>" ["<path>"...]';

function scratchBullet(text: string): string {
  return lines(text).find((line) => line.startsWith("- Scratch return:")) ?? "";
}

test("task-coder keeps its scratch output under its out directory", () => {
  const bullet = lines(CODER).find((line) => line.startsWith("- Scratch output")) ?? "";
  assert.ok(bullet.includes("under your `out` directory"));
});

test("task-coder returns a scratch file that must sit in the tree on a SCRATCH line, never on FILES or EXTRA", () => {
  const bullet = lines(CODER).find((line) => line.startsWith("- `SCRATCH:")) ?? "";
  assert.ok(bullet.includes("on any verdict"));
  assert.ok(bullet.includes("left outside `.temp/`"));
  assert.ok(bullet.includes("never a path on `FILES:` or `EXTRA:`"));
});

test("implementor answers a SCRATCH return with one --drop call naming every path before any other dispatch or commit", () => {
  const bullet = scratchBullet(SKILL);
  assert.ok(bullet.includes("`SCRATCH:`, in any step"));
  assert.ok(bullet.includes(`\`${DROP_CALL}\``));
  assert.ok(bullet.includes("before any other dispatch or commit for that return"));
});

test("implementor turns each kept warning of the drop into a left uncommitted line of the final summary", () => {
  const bullet = scratchBullet(SKILL);
  assert.ok(bullet.includes("`warning: kept <path> - <reason>`"));
  assert.ok(bullet.includes("`left uncommitted: <path> | <reason>`"));
});

test("task-reviewer names the SCRATCH line of the coder as the fix of a scratch leftover, never rm", () => {
  const bullet = lines(REVIEWER).find((line) => line.startsWith("- Scratch:")) ?? "";
  assert.ok(bullet.includes("`SCRATCH:` line"));
  assert.ok(bullet.includes("never `rm`"));
});

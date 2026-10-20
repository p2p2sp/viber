/*
 * extras-prose.unit.test.ts - pins the prose that hands the extras file to the
 * coder and the reviewer instead of `implementor` computing their lines.
 *
 * `implementor` dispatches the coder with an `extras:` line and the reviewer with
 * `extras:` and `scope:` lines, commits a task with `--with` only for the `EXTRA:`
 * paths returned in its own session (the extras files stay the record), and sends a coder
 * `PASS` to review on its own `EXTRA:` line alone. `task-coder` records its
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

const CODER_DISPATCH = between(SKILL, "Coder dispatch:", "Reviewer dispatch:");
const REVIEWER_DISPATCH = between(SKILL, "Reviewer dispatch:", "Commit: ");
const COMMIT = between(SKILL, "Commit: ", "Warnings off the commit");

function inputBullet(text: string, label: string): string {
  return lines(text).find((line) => line.startsWith(`- A \`${label}\``) || line.startsWith(`- An \`${label}\``)) ?? "";
}

test("the coder dispatch of implementor carries the C7 extras line", () => {
  assert.ok(lines(CODER_DISPATCH).includes(CODER_EXTRAS_LINE));
});

test("the reviewer dispatch of implementor carries the C7 extras line", () => {
  assert.ok(lines(REVIEWER_DISPATCH).some((line) => line.includes(`\`${REVIEWER_EXTRAS_LINE}\``)));
});

test("the reviewer dispatch of implementor carries the C7 scope line", () => {
  assert.ok(lines(REVIEWER_DISPATCH).some((line) => line.includes(`\`${SCOPE_LINE}\``)));
});

test("the task commit passes the EXTRA paths returned in this session through --with (a coder that skipped its extras file must not leak the path into a later task's commit)", () => {
  assert.ok(COMMIT.includes("`--with \"<path>\" [...]` for every path on an `EXTRA:` line the task's coders and reviewers returned in this session"));
  assert.ok(COMMIT.includes("--defer"));
});

test("implementor builds no extra or recheck line for the reviewer", () => {
  assert.ok(!SKILL.includes("`extra:"));
  assert.ok(!SKILL.includes("`recheck:"));
});

test("the only resume line implementor builds is the one of a dirty answer", () => {
  const resumeLines = lines(SKILL).filter((line) => line.includes("resume:"));
  assert.equal(resumeLines.length, 1);
  assert.ok(resumeLines[0].startsWith("- `dirty: <id> | <paths>`"));
  assert.ok(resumeLines[0].includes("`resume: <paths>`"));
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

test("a coder PASS goes to review when review is due or the coder returned an EXTRA line in any attempt", () => {
  assert.ok(
    lines(SKILL).includes(
      "- Coder `PASS`, and review due or the task's coder returned an `EXTRA:` line in any attempt -> reviewer dispatch at the next round.",
    ),
  );
});

test("a coder PASS without review due and without an EXTRA line goes to commit", () => {
  assert.ok(lines(SKILL).includes("- Coder `PASS` otherwise -> commit."));
});

test("implementor runs plan-index.sh only for the split in step 2 and the scope line", () => {
  const calls = lines(SKILL).filter((line) => line.includes("plan-index.sh"));
  assert.equal(calls.length, 3);
  assert.ok(calls[0].startsWith("allowed-tools:"));
  assert.ok(calls[1].startsWith("Run `"));
  assert.ok(calls[2].includes(`\`${SCOPE_LINE}\``));
});

test("the --extra mode appears in implementor only inside the scope line", () => {
  const withMode = lines(SKILL).filter((line) => line.includes("--extra"));
  assert.equal(withMode.length, 1);
  assert.ok(withMode[0].includes(`\`${SCOPE_LINE}\``));
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

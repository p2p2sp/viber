/*
 * review-round.test.ts - proves the `start` event of
 * viber/skills/planner/scripts/review-round.sh.
 *
 * `review-round.sh <plan> start` runs plan-index.sh on the plan and prints one
 * dispatch block per reviewer of the round, the lines the planner sends as the
 * reviewer's prompt, so a wrong block is a reviewer given the wrong plan, the
 * wrong input or the wrong slice of tasks. The cases pin the blocks of a single
 * and of a set round, the `--input` form, the round a start opens on (the first
 * one on no state, on the state of another plan or on `--fresh`), the refusal
 * of a start on a round still open, the refusal of a plan plan-index.sh refuses
 * and of an unknown event.
 *
 * The plans are lite plans with no `## Behaviour` section and only `add` file
 * map lines, so plan-index.sh accepts them. Every case builds its own throwaway
 * repository and reads the script's stdout and stderr.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/review-round.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/planner/scripts/review-round.sh");
const PLAN_INDEX = path.resolve(import.meta.dirname, "../../viber/scripts/plan-index.sh");
const REFS = slash(path.resolve(import.meta.dirname, "../../viber/references"));

const PLAN_REL = "docs/_specs/2026-09-20-10-00-00_add-login/plan.md";
const OTHER_PLAN_REL = "docs/_specs/2026-09-21-10-00-00_add-logout/plan.md";
const STATE_REL = ".temp/viber/planner/review-round";

function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** A lite plan of `count` independent tasks T1..Tcount, each on its own `add` file. */
function litePlan(count: number): string {
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  return [
    "# Add login",
    "",
    "## Goal",
    "",
    "Users can log in.",
    "",
    "## Acceptance criteria",
    "",
    "1. A user with valid credentials gets a session.",
    "",
    "## Scope",
    "",
    "### File map",
    "",
    ...ids.map((n) => `- add - src/t${n}.ts - the part ${n}`),
    "",
    "### Out of scope",
    "",
    "- Password reset.",
    "",
    "## Tasks",
    "",
    ...ids.flatMap((n) => [
      "<!-- TASK -->",
      `### T${n} - Do thing ${n}`,
      "- TDD: required",
      "- Covers: AC1",
      "- Uses: C1",
      "- Depends-on: none",
      `- Files: src/t${n}.ts`,
      "- Delivers: the thing",
      "- Verification: npm test -> green",
      "- DoD: it works",
      "<!-- /TASK -->",
      "",
    ]),
    "## Contracts",
    "",
    "### C1 - Login endpoint",
    "",
    "File: none",
    "",
    "POST /login -> 200 | 401",
    "",
  ].join("\n");
}

function review(repo: GitRepo, args: string[]) {
  return runScript(SUT, args, { cwd: repo.dir, env: repo.env, shell: "bash" });
}

function start(repo: GitRepo, plan: string, ...flags: string[]) {
  return review(repo, [plan, "start", ...flags]);
}

test("start on a plan of 12 tasks or fewer prints one planner-review block with the plan, refs, memory and input addition lines", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2));
    write(repo.dir, ".claude/viber.yml", "build:\n  memory: true\n");

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      slash(result.stdout),
      [
        "NEXT: review | member: 1 | agent: viber:planner-review | round: 1 | add: input | add: answered",
        `plan: ${PLAN_REL}`,
        `refs: ${REFS}`,
        "memory: true",
        "",
      ].join("\n"),
    );
  });
});

test("start on a plan of more than 12 tasks prints one block per dispatch line, the task reviewers each with their slice", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(13));

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      slash(result.stdout),
      [
        "NEXT: review | member: 1 | agent: viber:planner-spec-review | round: 1 | add: input | add: answered",
        `plan: ${PLAN_REL}`,
        `refs: ${REFS}`,
        "NEXT: review | member: 2 | agent: viber:planner-graph-review | round: 1",
        `plan: ${PLAN_REL}`,
        `refs: ${REFS}`,
        "memory: false",
        "NEXT: review | member: 3 | agent: viber:planner-task-review | round: 1",
        `plan: ${PLAN_REL}`,
        `refs: ${REFS}`,
        "memory: false",
        "tasks: T1-T7",
        "NEXT: review | member: 4 | agent: viber:planner-task-review | round: 1",
        `plan: ${PLAN_REL}`,
        `refs: ${REFS}`,
        "memory: false",
        "tasks: T8-T13",
        "",
      ].join("\n"),
    );
  });
});

test("start --input puts the summary file path on the input line and drops the input addition", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2));

    const result = await start(repo, PLAN_REL, "--input", ".temp/viber/intent/summary-1.md");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      slash(result.stdout),
      [
        "NEXT: review | member: 1 | agent: viber:planner-review | round: 1 | add: answered",
        `plan: ${PLAN_REL}`,
        `refs: ${REFS}`,
        "memory: false",
        "input: .temp/viber/intent/summary-1.md",
        "",
      ].join("\n"),
    );
  });
});

// A state naming round 3 closed on NEXT: fix would open round 4 with add: previous: each case
// below is a start that must not, so each seeds the state that would.
const FIX_STATE = (plan: string) => `plan: ${plan}\nround: 3\nanswer: fix\n`;

test("start with the state of another plan prints round 1 with no previous findings", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2));
    write(repo.dir, STATE_REL, FIX_STATE(OTHER_PLAN_REL));

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout.split("\n")[0],
      "NEXT: review | member: 1 | agent: viber:planner-review | round: 1 | add: input | add: answered",
    );
  });
});

test("start --fresh on a round closed on NEXT: fix prints round 1 with no previous findings", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2));
    write(repo.dir, STATE_REL, FIX_STATE(PLAN_REL));

    const result = await start(repo, PLAN_REL, "--fresh");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout.split("\n")[0],
      "NEXT: review | member: 1 | agent: viber:planner-review | round: 1 | add: input | add: answered",
    );
  });
});

test("start without --fresh on a round with no returned yet exits 2 with one error line naming --fresh and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2));
    const first = await start(repo, PLAN_REL);
    assert.equal(first.status, 0, `stderr: ${first.stderr}`);

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: round 1 is not closed on NEXT: fix - run start --fresh\n");
  });
});

test("start on a plan plan-index.sh refuses exits 2 with an empty stdout and its error line followed by the stderr plan-index.sh prints", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2).replace("- Covers: AC1", "- Covers: AC9"));
    const direct = await runScript(PLAN_INDEX, [PLAN_REL], { cwd: repo.dir, env: repo.env, shell: "bash" });
    assert.notEqual(direct.status, 0);
    assert.notEqual(direct.stderr, "");

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `error: plan-index.sh refused the plan\n${direct.stderr}`);
  });
});

test("an unknown event exits 2 with one error line and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2));

    const result = await review(repo, [PLAN_REL, "begin"]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: unknown event: begin\n");
  });
});

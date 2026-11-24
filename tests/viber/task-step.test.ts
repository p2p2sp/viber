/*
 * task-step.test.ts - proves viber/scripts/task-step.sh's answers to the
 * `start`, `coder`, `reviewer`, `retry`, `accept`, `commit`, `ruled`,
 * `resume-failed`, `repair` and `skip` events: the one directive block the
 * implementor sends next after a coder, a reviewer, a commit or an arbiter returns.
 *
 * The script is the implementor's task loop moved out of prose: it counts
 * attempts, climbs the tiers, decides review against commit and holds a task at
 * its fifth failure, so a wrong answer here is a wrong dispatch in a build with
 * nothing else to catch it. Each case arranges the task through earlier calls of
 * the script itself (the state file is its private format) and asserts on the
 * answer of the last call alone.
 *
 * Repo reality: no build, no lint, no npm - this file is run directly by Node's
 * native test runner + TypeScript type stripping:
 *   node --test tests/viber/task-step.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { slash } from "../harness/paths.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import {
  SUT,
  PLAN_DIR,
  PLAN_REL,
  ROOT,
  type Overrides,
  write,
  seedPlan,
  type Call,
  step,
  arrange,
  lines,
  coderLines,
  START_T1,
  START_T4_WAIVED,
  T1_FAIL,
  T1_PASS,
} from "./task-step-fixture.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

function reviewerLines(id: string, root = ROOT): string[] {
  return [
    `task: ${PLAN_DIR}/tasks/${id}.md`,
    `notes: ${PLAN_DIR}/work/${id}-coder.md`,
    `out: .temp/viber/${id}/`,
    `refs: ${root}/references`,
    `extras: ${PLAN_DIR}/work/${id}-extra-review.md`,
    `scope: "${root}/scripts/plan-index.sh" "${PLAN_REL}" --extra "${id}"`,
  ];
}

// --- start ------------------------------------------------------------------

test("start under a waived review answers review: waived", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);

    const result = await step(repo, START_T4_WAIVED);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("NEXT: coder | attempt: 1 | model: sonnet | review: waived", ...coderLines("T4")));
  });
});

test("start with --resume adds the resume line after the coder lines", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);

    const result = await step(repo, [...START_T1, "--resume", "src/a.ts,src/b.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 1 | model: sonnet | review: opus", ...coderLines("T1", ["resume: src/a.ts,src/b.ts"])),
    );
  });
});

test("every path of the answer names the plugin root in the spelling the script was invoked with", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    const detourSut = `${ROOT}/scripts/../scripts/task-step.sh`;
    await arrange(repo, [START_T4_WAIVED]);

    const result = await step(repo, ["T4", "100", "coder", "PASS"], detourSut);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: commit", `RUN: "${ROOT}/scripts/../scripts/commit-task.sh" "${PLAN_REL}" "T4"`),
    );
  });
});

test("the script is recorded in the git index as mode 100755", () => {
  const entry = execFileSync("git", ["ls-files", "-s", "--", "viber/scripts/task-step.sh"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  assert.ok(entry.startsWith("100755 "), `index entry: ${entry}`);
});

test("start writes the session lessons file first and carries the list as run-lessons", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    write(repo.dir, `${PLAN_DIR}/work/review-T2-1.md`, "- Blocking [task] tests/a.test.ts:1 - breaks test-strategy `Act`\n");

    const result = await step(repo, START_T1);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.endsWith("\nrun-lessons: Act x1\n"), `stdout: ${result.stdout}`);
    assert.equal(fs.readFileSync(path.join(repo.dir, ".temp/viber/lessons"), "utf-8"), "started: 100\nAct x1\n");
  });
});

test("start leaves a lessons file of the current mark as it is", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    write(repo.dir, ".temp/viber/lessons", "started: 100\nState x9\n");

    const result = await step(repo, START_T1);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.endsWith("\nrun-lessons: State x9\n"), `stdout: ${result.stdout}`);
  });
});

test("start rewrites a lessons file of another mark", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    write(repo.dir, ".temp/viber/lessons", "started: 99\nState x9\n");

    const result = await step(repo, START_T1);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout.includes("run-lessons"), false);
    assert.equal(fs.readFileSync(path.join(repo.dir, ".temp/viber/lessons"), "utf-8"), "started: 100\n");
  });
});

test("start under the mark unknown rewrites the lessons file even when it holds that mark already", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    write(repo.dir, ".temp/viber/lessons", "started: unknown\nState x9\n");

    const result = await step(repo, ["T1", "unknown", "start", "--tier", "sonnet", "--review", "opus"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout.includes("run-lessons"), false);
    assert.equal(fs.readFileSync(path.join(repo.dir, ".temp/viber/lessons"), "utf-8"), "started: unknown\n");
  });
});

test("start under the mark unknown always discards the state", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    const unknownStart: Call = ["T1", "unknown", "start", "--tier", "sonnet", "--review", "opus"];
    await arrange(repo, [unknownStart, ["T1", "unknown", "coder", "FAIL"]]);

    const result = await step(repo, unknownStart);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.startsWith("NEXT: coder | attempt: 1 |"), `stdout: ${result.stdout}`);
  });
});

test("a later event under the mark unknown keeps counting from what start wrote", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [["T1", "unknown", "start", "--tier", "sonnet", "--review", "opus"]]);

    const result = await step(repo, ["T1", "unknown", "coder", "FAIL"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.startsWith("NEXT: coder | attempt: 2 |"), `stdout: ${result.stdout}`);
  });
});

// --- a coder failure --------------------------------------------------------

for (const [tier, review, max, model, nextReview] of [
  ["sonnet", "sonnet", "opus", "opus", "opus"],
  ["haiku", "haiku", "opus", "sonnet", "sonnet"],
  ["opus", "opus", "opus", "opus", "opus"],
  ["sonnet", "opus", "fable", "opus", "fable"],
  ["sonnet", "waived", "opus", "opus", "waived"],
  ["haiku", "waived", "opus", "sonnet", "waived"],
  ["haiku", "haiku", "haiku", "haiku", "sonnet"],
] as const) {
  test(`a FAIL of a ${tier} coder with review ${review} under tiers.max ${max} answers attempt 2 at ${model} with review ${nextReview}`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo, `tiers:\n  max: ${max}\n`);
      await arrange(repo, [["T1", "100", "start", "--tier", tier, "--review", review]]);

      const result = await step(repo, T1_FAIL);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        lines(`NEXT: coder | attempt: 2 | model: ${model} | review: ${nextReview} | add: reason`, ...coderLines("T1")),
      );
    });
  });
}

test("a PASS with a short --dod answers the next attempt with the ready DOD reason line and no add field", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1]);

    const result = await step(repo, ["T1", "100", "coder", "PASS", "--dod", "2/3", "--red", "2"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 2 | model: opus | review: opus", ...coderLines("T1", ["reason: DOD: 2/3"])),
    );
  });
});

for (const [label, flags] of [
  ["no --red", []],
  ["--red 0", ["--red", "0"]],
] as const) {
  test(`a PASS of a TDD required task with ${label} answers the next attempt with the no red evidence reason`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);
      await arrange(repo, [START_T1]);

      const result = await step(repo, ["T1", "100", "coder", "PASS", "--dod", "3/3", ...flags]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        lines("NEXT: coder | attempt: 2 | model: opus | review: opus", ...coderLines("T1", ["reason: no red evidence"])),
      );
    });
  });
}

test("a PASS of a TDD required task with RED: missing counts as red evidence and goes to review", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1]);

    const result = await step(repo, ["T1", "100", "coder", "PASS", "--dod", "3/3", "--red", "missing"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.startsWith("NEXT: review | round: 1 |"), `stdout: ${result.stdout}`);
  });
});

// --- a coder PASS that is no failure ----------------------------------------

test("a passing coder under a review answers the review dispatch at round 1 with the report path and the red log", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1]);

    const result = await step(repo, [
      "T1", "100", "coder", "PASS", "--dod", "3/3", "--red", "2", "--red-log", ".temp/viber/T1/red.log",
    ]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: review | round: 1 | model: opus",
        ...reviewerLines("T1"),
        `report: ${PLAN_DIR}/work/review-T1-1.md`,
        "red: .temp/viber/T1/red.log",
      ),
    );
  });
});

test("the red line names the last coder return's log only, and the round rises with every review", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [
      START_T1,
      ["T1", "100", "coder", "PASS", "--dod", "3/3", "--red", "2", "--red-log", ".temp/viber/T1/red.log"],
    ]);

    const result = await step(repo, ["T1", "100", "coder", "PASS", "--dod", "3/3", "--red", "2"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: review | round: 2 | model: opus", ...reviewerLines("T1"), `report: ${PLAN_DIR}/work/review-T1-2.md`),
    );
  });
});

test("a passing coder under a waived review answers the commit with no extra argument", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T4_WAIVED]);

    const result = await step(repo, ["T4", "100", "coder", "PASS", "--dod", "1/1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("NEXT: commit", `RUN: "${ROOT}/scripts/commit-task.sh" "${PLAN_REL}" "T4"`));
  });
});

test("a commit carries every --defer entry the coder reported", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T4_WAIVED]);

    const result = await step(repo, ["T4", "100", "coder", "PASS", "--defer", "T2:src/x.ts,T3:src/y.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: commit", `RUN: "${ROOT}/scripts/commit-task.sh" "${PLAN_REL}" "T4" --defer "T2:src/x.ts" "T3:src/y.ts"`),
    );
  });
});

for (const [tier, model] of [
  ["sonnet", "sonnet"],
  ["haiku", "sonnet"],
  ["opus", "opus"],
] as const) {
  test(`a waived review of a ${tier} task whose coder reported --with is dispatched at ${model}`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);
      await arrange(repo, [["T4", "100", "start", "--tier", tier, "--review", "waived"]]);

      const result = await step(repo, ["T4", "100", "coder", "PASS", "--with", "lib/x.ts,lib/y.ts"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        lines(`NEXT: review | round: 1 | model: ${model}`, ...reviewerLines("T4"), `report: ${PLAN_DIR}/work/review-T4-1.md`),
      );
    });
  });
}

test("a task whose earlier coder reported --with is still reviewed when the waived coder of its next attempt reports none", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T4_WAIVED, ["T4", "100", "coder", "FAIL", "--with", "lib/x.ts"]]);

    const result = await step(repo, ["T4", "100", "coder", "PASS"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.startsWith("NEXT: review | round: 1 | model: opus\n"), `stdout: ${result.stdout}`);
  });
});

// --- the limit --------------------------------------------------------------

const FOUR_FAILURES: Call[] = [
  ["T1", "100", "start", "--tier", "haiku", "--review", "haiku"],
  T1_FAIL,
  T1_FAIL,
  T1_FAIL,
  T1_FAIL,
];

const FOUR_FAILURES_OF_T4: Call[] = [
  ["T4", "100", "start", "--tier", "haiku", "--review", "haiku"],
  ["T4", "100", "coder", "FAIL"],
  ["T4", "100", "coder", "FAIL"],
  ["T4", "100", "coder", "FAIL"],
  ["T4", "100", "coder", "FAIL"],
];

test("a coder failure on attempt 5 holds the task naming every task depending on it, directly or through another", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, FOUR_FAILURES);

    const result = await step(repo, T1_FAIL);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("NEXT: hold | dependents: T2,T3"));
  });
});

test("a coder failure on attempt 5 of a task nothing depends on names dependents: none", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, FOUR_FAILURES_OF_T4);

    const result = await step(repo, ["T4", "100", "coder", "FAIL"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("NEXT: hold | dependents: none"));
  });
});

// --- DENIED and retry -------------------------------------------------------

test("a denied coder answers the retry, skip and abort question", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1]);

    const result = await step(repo, ["T1", "100", "coder", "DENIED"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("ASK: retry -> retry coder --denied | skip -> skip | abort"));
  });
});

test("retry coder --denied prints the current attempt's coder block again with add: reason", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, ["T1", "100", "coder", "DENIED"]]);

    const result = await step(repo, ["T1", "100", "retry", "coder", "--denied"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 1 | model: sonnet | review: opus | add: reason", ...coderLines("T1")),
    );
  });
});

test("retry coder counts no attempt, so the next failure answers attempt 2", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, ["T1", "100", "retry", "coder", "--denied"]]);

    const result = await step(repo, T1_FAIL);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.startsWith("NEXT: coder | attempt: 2 | model: opus |"), `stdout: ${result.stdout}`);
  });
});

test("retry coder after a short DOD prints the attempt's block again with its ready reason line and no add field", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, ["T1", "100", "coder", "PASS", "--dod", "1/2", "--red", "1"]]);

    const result = await step(repo, ["T1", "100", "retry", "coder"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 2 | model: opus | review: opus", ...coderLines("T1", ["reason: DOD: 1/2"])),
    );
  });
});

// --- a reviewer return --------------------------------------------------------
const REVIEW_1 = `${PLAN_DIR}/work/review-T1-1.md`;

test("a coder --with list with a blank after its comma reaches the commit call as trimmed paths after a reviewer PASS", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, [...T1_PASS, "--with", "src/extra1.ts, src/extra2.ts"]]);

    const result = await step(repo, ["T1", "100", "reviewer", "PASS"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: commit", `RUN: "${ROOT}/scripts/commit-task.sh" "${PLAN_REL}" "T1" --with "src/extra1.ts" "src/extra2.ts"`),
    );
  });
});

for (const withList of ["a,b", "a, , b", " a ,b ,"]) {
  test(`--with "${withList}" prints the two paths a and b with the blanks and the empty entries dropped`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);
      await arrange(repo, [START_T4_WAIVED, ["T4", "100", "coder", "PASS", "--with", withList]]);

      const result = await step(repo, ["T4", "100", "reviewer", "PASS"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        lines("NEXT: commit", `RUN: "${ROOT}/scripts/commit-task.sh" "${PLAN_REL}" "T4" --with "a" "b"`),
      );
    });
  });
}

test("a coder --defer list with a blank after its comma prints the same --defer entries as one without", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T4_WAIVED]);

    const result = await step(repo, ["T4", "100", "coder", "PASS", "--defer", "T2:src/x.ts, T3:src/y.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: commit", `RUN: "${ROOT}/scripts/commit-task.sh" "${PLAN_REL}" "T4" --defer "T2:src/x.ts" "T3:src/y.ts"`),
    );
  });
});

test("start --resume with a blank after its comma prints the same resume line as one without", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);

    const result = await step(repo, [...START_T1, "--resume", "src/a.ts, src/b.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 1 | model: sonnet | review: opus", ...coderLines("T1", ["resume: src/a.ts,src/b.ts"])),
    );
  });
});

test("a reviewer FAIL on attempt 4 answers the next attempt's coder block with the returned REVIEW path as report and no reason", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo, "tiers:\n  max: opus\n");
    await arrange(repo, [["T1", "100", "start", "--tier", "haiku", "--review", "haiku"], T1_FAIL, T1_FAIL, T1_FAIL, T1_PASS]);

    const result = await step(repo, ["T1", "100", "reviewer", "FAIL", "--report", REVIEW_1]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 5 | model: opus | review: opus", ...coderLines("T1", [`report: ${REVIEW_1}`])),
    );
  });
});

test("a reviewer of the next round carries the path of the last failed review as previous", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, T1_PASS, ["T1", "100", "reviewer", "FAIL", "--report", REVIEW_1]]);

    const result = await step(repo, T1_PASS);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: review | round: 2 | model: opus",
        ...reviewerLines("T1"),
        `report: ${PLAN_DIR}/work/review-T1-2.md`,
        `previous: ${REVIEW_1}`,
      ),
    );
  });
});

const FOUR_FAILURES_THEN_PASS: Call[] = [...FOUR_FAILURES, T1_PASS];

const LESSONS_ROWS: [string, Call[]][] = [
  ["1", [START_T1, T1_PASS]],
  ["5", FOUR_FAILURES_THEN_PASS],
];

for (const [label, calls] of LESSONS_ROWS) {
  test(`a reviewer FAIL on attempt ${label} rewrites the session lessons file before it answers`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);
      await arrange(repo, calls);
      write(repo.dir, `${PLAN_DIR}/work/review-T2-1.md`, "- Blocking [task] tests/a.test.ts:1 - breaks test-strategy `Act`\n");

      const result = await step(repo, ["T1", "100", "reviewer", "FAIL", "--report", REVIEW_1]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(fs.readFileSync(path.join(repo.dir, ".temp/viber/lessons"), "utf-8"), "started: 100\nAct x1\n");
    });
  });
}

test("a reviewer FAIL on attempt 1 answers a coder block that carries the rewritten lessons as run-lessons", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, T1_PASS]);
    write(repo.dir, `${PLAN_DIR}/work/review-T2-1.md`, "- Blocking [task] tests/a.test.ts:1 - breaks test-strategy `Act`\n");

    const result = await step(repo, ["T1", "100", "reviewer", "FAIL", "--report", REVIEW_1]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: coder | attempt: 2 | model: opus | review: opus",
        ...coderLines("T1", ["run-lessons: Act x1", `report: ${REVIEW_1}`]),
      ),
    );
  });
});

test("a reviewer FAIL on attempt 5 holds the task naming every task depending on it", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, FOUR_FAILURES_THEN_PASS);

    const result = await step(repo, ["T1", "100", "reviewer", "FAIL", "--report", REVIEW_1]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("NEXT: hold | dependents: T2,T3"));
  });
});

test("a denied reviewer answers the retry, accept and abort question", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, T1_PASS]);

    const result = await step(repo, ["T1", "100", "reviewer", "DENIED"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("ASK: retry -> retry reviewer | accept -> accept | abort"));
  });
});

test("retry reviewer prints the same round's reviewer block again", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, [...T1_PASS, "--red-log", ".temp/viber/T1/red.log"], ["T1", "100", "reviewer", "DENIED"]]);

    const result = await step(repo, ["T1", "100", "retry", "reviewer"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: review | round: 1 | model: opus",
        ...reviewerLines("T1"),
        `report: ${REVIEW_1}`,
        "red: .temp/viber/T1/red.log",
      ),
    );
  });
});

test("accept after a denied reviewer answers the task commit with --unreviewed after the --with and --defer arguments", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [
      START_T1,
      [...T1_PASS, "--with", "lib/x.ts", "--defer", "T2:src/x.ts"],
      ["T1", "100", "reviewer", "DENIED"],
    ]);

    const result = await step(repo, ["T1", "100", "accept"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: commit", `RUN: "${ROOT}/scripts/commit-task.sh" "${PLAN_REL}" "T1" --with "lib/x.ts" --defer "T2:src/x.ts" --unreviewed`),
    );
  });
});

// --- a commit return ---------------------------------------------------------

const T1_REVIEWED: Call[] = [
  START_T1,
  [...T1_PASS, "--with", "lib/x.ts", "--defer", "T2:src/x.ts"],
  ["T1", "100", "reviewer", "PASS"],
];

test("commit 0 answers done", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, T1_REVIEWED);

    const result = await step(repo, ["T1", "100", "commit", "0"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("NEXT: done"));
  });
});

test("commit 4 answers the retry, skip and abort question", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, T1_REVIEWED);

    const result = await step(repo, ["T1", "100", "commit", "4"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("ASK: retry | skip -> skip | abort"));
  });
});

test("a commit refused on attempt 1 answers the next attempt's coder block with add: reason and no report", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T4_WAIVED, ["T4", "100", "coder", "PASS"]]);

    const result = await step(repo, ["T4", "100", "commit", "5"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 2 | model: opus | review: waived | add: reason", ...coderLines("T4")),
    );
  });
});

test("a commit refused on attempt 5 holds the task", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [...FOUR_FAILURES_OF_T4, ["T4", "100", "coder", "PASS"]]);

    const result = await step(repo, ["T4", "100", "commit", "5"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("NEXT: hold | dependents: none"));
  });
});

// --- the red check ----------------------------------------------------------

const CHECKED_PLAN: Overrides = { T1: { files: "src/lib.sh, tests/check.sh", verify: "bash tests/check.sh" } };
const CHECK_ON = "build:\n  red-check: true\n";
const T1_RED_LOG = ".temp/viber/T1/red.log";
const T1_PASS_LOGGED: Call = [...T1_PASS, "--red-log", T1_RED_LOG];
const T1_CHECK_LOG = ".temp/viber/T1/red-check.log";

/** Commits the plan and the production file at their HEAD state, then leaves the
 *  task's change (the answer becomes 42) and the given test file in the tree. */
async function seedChecked(repo: GitRepo, config: string, testBody: string): Promise<void> {
  fs.appendFileSync(path.join(repo.dir, ".git", "info", "exclude"), ".gitconfig-global\n.temp/\n");
  seedPlan(repo, config, CHECKED_PLAN);
  write(repo.dir, "src/lib.sh", "answer() { echo 0; }\n");
  await repo.git("add", "-A");
  await repo.git("commit", "-m", "seed");
  write(repo.dir, "src/lib.sh", "answer() { echo 42; }\n");
  write(repo.dir, "tests/check.sh", testBody);
}

/** This script beside copies of its siblings, with red-check.sh replaced by a stub. */
function stubbedCheck(repo: GitRepo, body: string): { sut: string; root: string } {
  const scripts = path.join(repo.dir, "plugin", "scripts");
  fs.mkdirSync(scripts, { recursive: true });
  for (const name of ["task-step.sh", "plan-index.sh", "config.sh", "config.ts", "run-failures.sh", "run-failures.ts", "plugin-root.sh"]) {
    fs.copyFileSync(path.join(path.dirname(SUT), name), path.join(scripts, name));
  }
  fs.cpSync(path.join(path.dirname(SUT), "..", "lib"), path.join(repo.dir, "plugin", "lib"), { recursive: true });
  fs.writeFileSync(path.join(scripts, "red-check.sh"), `#!/usr/bin/env bash\n${body}\n`);
  return { sut: path.join(scripts, "task-step.sh"), root: slash(path.join(repo.dir, "plugin")) };
}

test("a coder PASS of a TDD required task under build.red-check true answers the review with the check's result and leaves its log", async () => {
  await withGitRepo(async (repo) => {
    await seedChecked(repo, CHECK_ON, '. ./src/lib.sh\n[ "$(answer)" = 42 ]\n');
    await arrange(repo, [START_T1]);

    const result = await step(repo, T1_PASS_LOGGED);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: review | round: 1 | model: opus | red-check: FAIL-AS-EXPECTED",
        ...reviewerLines("T1"),
        `report: ${PLAN_DIR}/work/review-T1-1.md`,
        `red: ${T1_RED_LOG}`,
        `red-check: FAIL-AS-EXPECTED ${T1_CHECK_LOG}`,
      ),
    );
    assert.equal(fs.existsSync(path.join(repo.dir, T1_CHECK_LOG)), true);
  });
});

test("a coder PASS of a TDD required task under build.red-check false runs no check and answers no red-check line", async () => {
  await withGitRepo(async (repo) => {
    await seedChecked(repo, "", '. ./src/lib.sh\n[ "$(answer)" = 42 ]\n');
    await arrange(repo, [START_T1]);

    const result = await step(repo, T1_PASS_LOGGED);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: review | round: 1 | model: opus",
        ...reviewerLines("T1"),
        `report: ${PLAN_DIR}/work/review-T1-1.md`,
        `red: ${T1_RED_LOG}`,
      ),
    );
    assert.equal(fs.existsSync(path.join(repo.dir, T1_CHECK_LOG)), false);
  });
});

test("tests that pass without the change are a coder failure whose reason is the check's and whose answer carries no red-check line in its body", async () => {
  await withGitRepo(async (repo) => {
    await seedChecked(repo, CHECK_ON, '. ./src/lib.sh\n[ -n "$(answer)" ]\n');
    await arrange(repo, [START_T1]);

    const result = await step(repo, T1_PASS_LOGGED);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: coder | attempt: 2 | model: opus | review: opus | red-check: PASSED-WITHOUT-CHANGE",
        ...coderLines("T1", ["reason: tests pass without the change: tests/check.sh"]),
      ),
    );
  });
});

test("tests that pass without the change a second time in the session answer the review with the check's line (a coder told once gains nothing from the same reason again)", async () => {
  await withGitRepo(async (repo) => {
    await seedChecked(repo, CHECK_ON, '. ./src/lib.sh\n[ -n "$(answer)" ]\n');
    await arrange(repo, [START_T1, T1_PASS_LOGGED]);

    const result = await step(repo, T1_PASS_LOGGED);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: review | round: 1 | model: opus | red-check: PASSED-WITHOUT-CHANGE",
        ...reviewerLines("T1"),
        `report: ${PLAN_DIR}/work/review-T1-1.md`,
        `red: ${T1_RED_LOG}`,
        "red-check: PASSED-WITHOUT-CHANGE tests/check.sh",
      ),
    );
  });
});

test("tests that pass on HEAD with no production change of the task answer the review on the first PASS, never a coder attempt (an earlier task delivered the behaviour, so every retry would meet the same run)", async () => {
  await withGitRepo(async (repo) => {
    await seedChecked(repo, CHECK_ON, '. ./src/lib.sh\n[ "$(answer)" = 0 ]\n');
    write(repo.dir, "src/lib.sh", "answer() { echo 0; }\n");
    await arrange(repo, [START_T1]);

    const result = await step(repo, T1_PASS_LOGGED);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: review | round: 1 | model: opus | red-check: NO-PRODUCTION-CHANGE",
        ...reviewerLines("T1"),
        `report: ${PLAN_DIR}/work/review-T1-1.md`,
        `red: ${T1_RED_LOG}`,
        "red-check: NO-PRODUCTION-CHANGE tests/check.sh",
      ),
    );
  });
});

for (const [label, body, line] of [
  ["exits non-zero", "echo 'red-check: FAIL-AS-EXPECTED x'\necho 'NEXT: review'\nexit 3", "UNRUNNABLE exit 3"],
  ["prints no NEXT: line", "echo 'red-check: FAIL-AS-EXPECTED x'", "UNRUNNABLE no NEXT: line"],
] as const) {
  test(`a check that ${label} answers the reviewer block with ${line}`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo, CHECK_ON);
      const { sut, root } = stubbedCheck(repo, body);
      await arrange(repo, [START_T1]);

      const result = await step(repo, T1_PASS_LOGGED, sut);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        lines(
          "NEXT: review | round: 1 | model: opus | red-check: UNRUNNABLE",
          ...reviewerLines("T1", root),
          `report: ${PLAN_DIR}/work/review-T1-1.md`,
          `red: ${T1_RED_LOG}`,
          `red-check: ${line}`,
        ),
      );
    });
  });
}

test("a coder PASS under --red-timeout answers the reviewer block with UNRUNNABLE timeout without running the check", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo, CHECK_ON);
    await arrange(repo, [START_T1]);

    const result = await step(repo, [...T1_PASS_LOGGED, "--red-timeout"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: review | round: 1 | model: opus | red-check: UNRUNNABLE",
        ...reviewerLines("T1"),
        `report: ${PLAN_DIR}/work/review-T1-1.md`,
        `red: ${T1_RED_LOG}`,
        "red-check: UNRUNNABLE timeout",
      ),
    );
    assert.equal(fs.existsSync(path.join(repo.dir, T1_CHECK_LOG)), false);
  });
});

test("retry reviewer prints the round's check result again (a denied reviewer must not lose the red-check line)", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo, CHECK_ON);
    await arrange(repo, [START_T1, [...T1_PASS_LOGGED, "--red-timeout"], ["T1", "100", "reviewer", "DENIED"]]);

    const result = await step(repo, ["T1", "100", "retry", "reviewer"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: review | round: 1 | model: opus | red-check: UNRUNNABLE",
        ...reviewerLines("T1"),
        `report: ${REVIEW_1}`,
        `red: ${T1_RED_LOG}`,
        "red-check: UNRUNNABLE timeout",
      ),
    );
  });
});

// --- a stalled coder and the arbiter ----------------------------------------

const OPTIONS_T1 = `${PLAN_DIR}/work/T1-options.md`;
const RULING_T1 = `${PLAN_DIR}/work/ruling-T1.md`;
const CLOSING = "Continue the task under these decisions, then return your output lines again.";
const COMMIT_TASK = `"${ROOT}/scripts/commit-task.sh"`;
const T1_DECIDE: Call = ["T1", "100", "coder", "FAIL", "--decide"];

function seedOptions(repo: GitRepo, id = "T1"): void {
  write(repo.dir, `${PLAN_DIR}/work/${id}-options.md`, "DECIDE: use sqlite | use files\n");
}

function seedRuling(repo: GitRepo, id: string, ruling: string): void {
  write(repo.dir, `${PLAN_DIR}/work/ruling-${id}.md`, `VERDICT: RULED\nRULING: ${ruling}\nWHY: the reports say so\nCOST: a rework\n`);
}

function seedDecisions(repo: GitRepo, decisions: string[]): void {
  write(repo.dir, `${PLAN_DIR}/status.md`, `# status\n\nprogress: 0/4\ndone: none\n${decisions.join("\n")}\n`);
}

function arbiterLines(head: string, reasonLine: string[] = []): string {
  return lines(
    head,
    "case: decide",
    "options: use sqlite | use files",
    `task: ${PLAN_DIR}/tasks/T1.md`,
    `report: ${PLAN_DIR}/work/T1-coder.md`,
    `ruling: ${RULING_T1}`,
    ...reasonLine,
  );
}

test("a FAIL with --decide on attempt 1 answers the arbiter with the options of the options file and add: reason", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedOptions(repo);
    await arrange(repo, [START_T1]);

    const result = await step(repo, T1_DECIDE);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, arbiterLines("NEXT: arbiter | add: reason"));
  });
});

for (const [label, call, reasonLine] of [
  ["a short DOD", ["T1", "100", "coder", "PASS", "--dod", "2/3", "--red", "2", "--decide"], "reason: DOD: 2/3"],
  ["no red evidence", ["T1", "100", "coder", "PASS", "--dod", "3/3", "--decide"], "reason: no red evidence"],
] as const) {
  test(`a PASS with ${label} and --decide answers the arbiter with the ready reason line and no add field`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);
      seedOptions(repo);
      await arrange(repo, [START_T1]);

      const result = await step(repo, [...call]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, arbiterLines("NEXT: arbiter", [reasonLine]));
    });
  });
}

test("tests that pass without the change under --decide answer the arbiter with the red check's reason", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo, CHECK_ON);
    seedOptions(repo);
    const { sut } = stubbedCheck(
      repo,
      "echo 'red-check: PASSED-WITHOUT-CHANGE x'\necho 'NEXT: coder-failure | reason: tests pass without the change: tests/check.sh'",
    );
    await arrange(repo, [START_T1]);

    const result = await step(repo, [...T1_PASS_LOGGED, "--decide"], sut);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      arbiterLines("NEXT: arbiter", ["reason: tests pass without the change: tests/check.sh"]),
    );
  });
});

test("the PASS of a coder resumed after such a ruling answers the review when the tests still pass without the change (a ruling must not be met by the failure it settled)", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo, CHECK_ON);
    seedOptions(repo);
    const { sut, root } = stubbedCheck(
      repo,
      "echo 'red-check: PASSED-WITHOUT-CHANGE x'\necho 'NEXT: coder-failure | reason: tests pass without the change: tests/check.sh'",
    );
    await arrange(repo, [START_T1]);
    const ruled = await step(repo, [...T1_PASS_LOGGED, "--decide"], sut);
    assert.equal(ruled.status, 0, `stderr: ${ruled.stderr}`);

    const result = await step(repo, T1_PASS_LOGGED, sut);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: review | round: 1 | model: opus | red-check: PASSED-WITHOUT-CHANGE",
        ...reviewerLines("T1", root),
        `report: ${PLAN_DIR}/work/review-T1-1.md`,
        `red: ${T1_RED_LOG}`,
        "red-check: PASSED-WITHOUT-CHANGE x",
      ),
    );
  });
});

test("a FAIL with --decide on attempt 5 holds the task instead of calling the arbiter", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedOptions(repo);
    await arrange(repo, FOUR_FAILURES);

    const result = await step(repo, T1_DECIDE);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("NEXT: hold | dependents: T2,T3"));
  });
});

test("the arbiter route counts no attempt, so the next ordinary failure answers attempt 2", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedOptions(repo);
    await arrange(repo, [START_T1, T1_DECIDE]);

    const result = await step(repo, T1_FAIL);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.startsWith("NEXT: coder | attempt: 2 | model: opus |"), `stdout: ${result.stdout}`);
  });
});

test("a resumed coder's second DECIDE answers the arbiter again in the same attempt", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedOptions(repo);
    await arrange(repo, [START_T1, T1_DECIDE]);

    const result = await step(repo, T1_DECIDE);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, arbiterLines("NEXT: arbiter | add: reason"));
  });
});

test("resume-failed answers the next attempt with every decision line of the task", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedDecisions(repo, ["decision: T1: auto: use files"]);
    await arrange(repo, [START_T1]);

    const result = await step(repo, ["T1", "100", "resume-failed"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 2 | model: opus | review: opus", ...coderLines("T1", ["decision: T1: auto: use files"])),
    );
  });
});

test("a resumed coder's failure without --decide answers the next attempt with the decision lines and add: reason", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedOptions(repo);
    seedDecisions(repo, ["decision: T1: auto: use files"]);
    await arrange(repo, [START_T1, T1_DECIDE]);

    const result = await step(repo, T1_FAIL);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: coder | attempt: 2 | model: opus | review: opus | add: reason",
        ...coderLines("T1", ["decision: T1: auto: use files"]),
      ),
    );
  });
});

test("a ruling naming a listed option answers the rule call, the decide call from the ruling file and the resume message", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedOptions(repo);
    seedRuling(repo, "T1", "use files");
    await arrange(repo, [START_T1]);

    const result = await step(repo, ["T1", "100", "ruled", "--case", "decide"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        `RUN: ${COMMIT_TASK} --rule "${PLAN_REL}" "T1" --from "${RULING_T1}"`,
        `RUN: ${COMMIT_TASK} --decide "${PLAN_REL}" "T1" --from "${RULING_T1}"`,
        "NEXT: resume",
        "decision: T1: auto: use files",
        CLOSING,
      ),
    );
  });
});

test("a ruling naming no listed option falls back to the first option of the options file and carries the mismatch field", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedOptions(repo);
    seedRuling(repo, "T1", "rewrite everything");
    await arrange(repo, [START_T1]);

    const result = await step(repo, ["T1", "100", "ruled", "--case", "decide"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        `RUN: ${COMMIT_TASK} --rule "${PLAN_REL}" "T1" --from "${RULING_T1}"`,
        `RUN: ${COMMIT_TASK} --decide "${PLAN_REL}" "T1" --first-of "${OPTIONS_T1}"`,
        "NEXT: resume | mismatch",
        "decision: T1: auto: use sqlite",
        CLOSING,
      ),
    );
  });
});

test("the resume message carries the decisions of the task and its dependencies, the one just ruled last, and no other task's", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedOptions(repo, "T2");
    seedRuling(repo, "T2", "use files");
    seedDecisions(repo, ["decision: T1: auto: use sqlite", "decision: T4: auto: unrelated"]);
    await arrange(repo, [["T2", "100", "start", "--tier", "sonnet", "--review", "opus"]]);

    const result = await step(repo, ["T2", "100", "ruled", "--case", "decide"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        `RUN: ${COMMIT_TASK} --rule "${PLAN_REL}" "T2" --from "${PLAN_DIR}/work/ruling-T2.md"`,
        `RUN: ${COMMIT_TASK} --decide "${PLAN_REL}" "T2" --from "${PLAN_DIR}/work/ruling-T2.md"`,
        "NEXT: resume",
        "decision: T1: auto: use sqlite",
        "decision: T2: auto: use files",
        CLOSING,
      ),
    );
  });
});

test("a refused arbiter on decide answers the fixed-words rule call, the first-of call and the resume message", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedOptions(repo);
    await arrange(repo, [START_T1]);

    const result = await step(repo, ["T1", "100", "ruled", "--case", "decide", "--refused"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        `RUN: ${COMMIT_TASK} --rule "${PLAN_REL}" "T1" "the coder's first option" "the arbiter was refused" "not assessed - the arbiter was refused"`,
        `RUN: ${COMMIT_TASK} --decide "${PLAN_REL}" "T1" --first-of "${OPTIONS_T1}"`,
        "NEXT: resume",
        "decision: T1: auto: use sqlite",
        CLOSING,
      ),
    );
  });
});

for (const [subject, first] of [
  ["baseline", "continue"],
  ["tests", "accept"],
  ["final-review", "accept"],
  ["commit", "leave uncommitted"],
] as const) {
  test(`a refused arbiter on ${subject} answers the fixed-words rule call and carries out ${first}`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);

      const result = await step(repo, [subject, "100", "ruled", "--case", subject, "--refused"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        lines(
          `RUN: ${COMMIT_TASK} --rule "${PLAN_REL}" "${subject}" "${first}" "the arbiter was refused" "not assessed - the arbiter was refused"`,
          `NEXT: carry-out: ${first}`,
        ),
      );
    });
  });
}

test("a refused arbiter on baseline with --options carries out the first of them and records it in the rule call", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);

    const result = await step(repo, ["baseline", "100", "ruled", "--case", "baseline", "--options", "halt | continue", "--refused"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        `RUN: ${COMMIT_TASK} --rule "${PLAN_REL}" "baseline" "halt" "the arbiter was refused" "not assessed - the arbiter was refused"`,
        "NEXT: carry-out: halt",
      ),
    );
  });
});

for (const [subject, options, ruling] of [
  ["baseline", "continue", "continue"],
  ["tests", "accept", "accept"],
  ["final-review", "accept | abort", "abort"],
  ["commit", "leave uncommitted", "leave uncommitted"],
] as const) {
  test(`a ${subject} ruling of ${ruling} answers the rule call from the ruling file and carries it out`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);
      seedRuling(repo, subject, ruling);

      const result = await step(repo, [subject, "100", "ruled", "--case", subject, "--options", options]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        lines(
          `RUN: ${COMMIT_TASK} --rule "${PLAN_REL}" "${subject}" --from "${PLAN_DIR}/work/ruling-${subject}.md"`,
          `NEXT: carry-out: ${ruling}`,
        ),
      );
    });
  });
}

test("a tests ruling naming none of the options carries out the first option with the mismatch field", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedRuling(repo, "tests", "ignore it");

    const result = await step(repo, ["tests", "100", "ruled", "--case", "tests", "--options", "accept | abort"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        `RUN: ${COMMIT_TASK} --rule "${PLAN_REL}" "tests" --from "${PLAN_DIR}/work/ruling-tests.md"`,
        "NEXT: carry-out: accept | mismatch",
      ),
    );
  });
});

test("a ruling on baseline writes no step state", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedRuling(repo, "baseline", "continue");

    const result = await step(repo, ["baseline", "100", "ruled", "--case", "baseline", "--options", "continue"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(fs.existsSync(path.join(repo.dir, ".temp", "viber", "baseline")), false);
  });
});

// --- the repair pass ----------------------------------------------------------

const HELD_T1: Call[] = [...FOUR_FAILURES, T1_FAIL];
const HELD_T1_BY_REVIEW: Call[] = [...FOUR_FAILURES_THEN_PASS, ["T1", "100", "reviewer", "FAIL", "--report", REVIEW_1]];
const HELD_T4: Call[] = [...FOUR_FAILURES_OF_T4, ["T4", "100", "coder", "FAIL"]];
const HELD_T4_WAIVED: Call[] = [
  ["T4", "100", "start", "--tier", "haiku", "--review", "waived"],
  ...Array.from({ length: 5 }, (): Call => ["T4", "100", "coder", "FAIL"]),
];
const HELD_T4_BY_COMMIT: Call[] = [...FOUR_FAILURES_OF_T4, ["T4", "100", "coder", "PASS"], ["T4", "100", "commit", "5"]];
const REPAIR_T1: Call = ["T1", "100", "repair"];
const REPAIR_T4: Call = ["T4", "100", "repair"];
const T1_SHORT_DOD: Call = ["T1", "100", "coder", "PASS", "--dod", "1/2", "--red", "1"];
const T1_REPAIR_PASS: Call = [...T1_PASS, "--with", "lib/x.ts"];
const T1_CODER_NOTES = `${PLAN_DIR}/work/T1-coder.md`;
const COMMIT_SKIP_T1 = `RUN: ${COMMIT_TASK} --skip "${PLAN_REL}" "T1"`;

for (const [label, id, held, add, extra] of [
  ["a coder FAIL", "T1", HELD_T1, "repair, reason", []],
  ["a short DOD", "T1", [...FOUR_FAILURES, T1_SHORT_DOD], "repair", ["reason: DOD: 1/2"]],
  ["a review failure", "T1", HELD_T1_BY_REVIEW, "repair", [`report: ${REVIEW_1}`]],
  ["a refused commit", "T4", HELD_T4_BY_COMMIT, "repair, reason", []],
] as const) {
  test(`repair on a task held after ${label} answers repair 1 at tiers.max carrying that failure`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);
      await arrange(repo, [...held]);

      const result = await step(repo, [id, "100", "repair"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        lines(`NEXT: coder | repair: 1 | model: opus | review: opus | add: ${add}`, ...coderLines(id, [...extra])),
      );
    });
  });
}

test("repair runs the coder and the review at tiers.max whatever tier the task started at", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo, "tiers:\n  max: fable\n");
    await arrange(repo, HELD_T1);

    const result = await step(repo, REPAIR_T1);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | repair: 1 | model: fable | review: fable | add: repair, reason", ...coderLines("T1")),
    );
  });
});

for (const [label, id, held, before, last, add, extra] of [
  ["a coder FAIL", "T1", HELD_T1, [], ["T1", "100", "coder", "FAIL"], "repair, reason", []],
  ["a short DOD", "T1", HELD_T1, [], T1_SHORT_DOD, "repair", ["reason: DOD: 1/2"]],
  ["a review failure", "T1", HELD_T1, [T1_PASS], ["T1", "100", "reviewer", "FAIL", "--report", REVIEW_1], "repair", [`report: ${REVIEW_1}`]],
  ["a refused commit", "T4", HELD_T4, [["T4", "100", "coder", "PASS"], ["T4", "100", "reviewer", "PASS"]], ["T4", "100", "commit", "5"], "repair, reason", []],
] as const) {
  test(`${label} of the first repair attempt answers repair 2 carrying that failure`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);
      await arrange(repo, [...held, [id, "100", "repair"], ...before.map((call) => [...call])]);

      const result = await step(repo, [...last]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        lines(`NEXT: coder | repair: 2 | model: opus | review: opus | add: ${add}`, ...coderLines(id, [...extra])),
      );
    });
  });
}

test("a coder PASS in the repair pass of a waived-review task goes to review at tiers.max with add: repair", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [...HELD_T4_WAIVED, REPAIR_T4]);

    const result = await step(repo, ["T4", "100", "coder", "PASS"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: review | round: 1 | model: opus | add: repair", ...reviewerLines("T4"), `report: ${PLAN_DIR}/work/review-T4-1.md`),
    );
  });
});

test("a DECIDE: in the repair pass costs an attempt and calls no arbiter", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedOptions(repo);
    await arrange(repo, [...HELD_T1, REPAIR_T1]);

    const result = await step(repo, T1_DECIDE);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | repair: 2 | model: opus | review: opus | add: repair, reason", ...coderLines("T1")),
    );
  });
});

// --- the cap arbiter ----------------------------------------------------------

const CAP_BY_FAIL: Call[] = [...HELD_T1, REPAIR_T1, T1_FAIL, T1_FAIL];
const CAP_BY_REVIEW: Call[] = [...HELD_T1, REPAIR_T1, T1_FAIL, T1_REPAIR_PASS, ["T1", "100", "reviewer", "FAIL", "--report", REVIEW_1]];

function capLines(id: string, head: string, options: string, reports: string[], tail: string[] = []): string {
  return lines(
    head,
    "case: cap",
    `options: ${options}`,
    `task: ${PLAN_DIR}/tasks/${id}.md`,
    ...reports.map((r) => `report: ${r}`),
    `ruling: ${PLAN_DIR}/work/ruling-${id}.md`,
    ...tail,
  );
}

test("a second failed repair attempt by a coder FAIL answers the cap arbiter with options: skip and add: reason", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [...HELD_T1, REPAIR_T1, T1_FAIL]);

    const result = await step(repo, T1_FAIL);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, capLines("T1", "NEXT: arbiter | add: reason", "skip", [T1_CODER_NOTES]));
  });
});

test("a second failed repair attempt by a short DOD answers the cap arbiter with the ready reason line and no add field", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [...HELD_T1, REPAIR_T1, T1_FAIL]);

    const result = await step(repo, T1_SHORT_DOD);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, capLines("T1", "NEXT: arbiter", "skip", [T1_CODER_NOTES], ["reason: DOD: 1/2"]));
  });
});

test("a second failed repair attempt by a review failure answers the cap arbiter offering accept and skip with the coder notes and the review report", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [...HELD_T1, REPAIR_T1, T1_FAIL, T1_PASS]);

    const result = await step(repo, ["T1", "100", "reviewer", "FAIL", "--report", `${PLAN_DIR}/work/review-T1-1.md`]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, capLines("T1", "NEXT: arbiter", "accept | skip", [T1_CODER_NOTES, REVIEW_1]));
  });
});

test("a coder failure after an earlier review failure keeps that review report on the cap arbiter and offers skip alone", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [...HELD_T1_BY_REVIEW, REPAIR_T1, T1_FAIL]);

    const result = await step(repo, T1_FAIL);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, capLines("T1", "NEXT: arbiter | add: reason", "skip", [T1_CODER_NOTES, REVIEW_1]));
  });
});

test("a refused commit of the second repair attempt answers the cap arbiter with options: skip and add: reason", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [...HELD_T4, REPAIR_T4, ["T4", "100", "coder", "FAIL"], ["T4", "100", "coder", "PASS"]]);

    const result = await step(repo, ["T4", "100", "commit", "5"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, capLines("T4", "NEXT: arbiter | add: reason", "skip", [`${PLAN_DIR}/work/T4-coder.md`]));
  });
});

test("an accepted commit refused again answers the cap arbiter with options: skip, add: reason and the same report lines", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedRuling(repo, "T1", "accept");
    await arrange(repo, [...CAP_BY_REVIEW, ["T1", "100", "ruled", "--case", "cap"]]);

    const result = await step(repo, ["T1", "100", "commit", "5"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, capLines("T1", "NEXT: arbiter | add: reason", "skip", [T1_CODER_NOTES, REVIEW_1]));
  });
});

const RULE_CAP = `RUN: ${COMMIT_TASK} --rule "${PLAN_REL}" "T1" --from "${RULING_T1}"`;
const REFUSED_RULE_CAP = (first: string) =>
  `RUN: ${COMMIT_TASK} --rule "${PLAN_REL}" "T1" "${first}" "the arbiter was refused" "not assessed - the arbiter was refused"`;
const SKIP_CHAIN_T1 = [
  COMMIT_SKIP_T1,
  `RUN: ${COMMIT_TASK} --skip "${PLAN_REL}" "T2"`,
  `RUN: ${COMMIT_TASK} --skip "${PLAN_REL}" "T3"`,
];
const COMMIT_UNREVIEWED_T1 = [
  "NEXT: commit",
  `RUN: ${COMMIT_TASK} "${PLAN_REL}" "T1" --with "lib/x.ts" --unreviewed`,
];

for (const [label, ruling, expected] of [
  ["skip", "skip", [RULE_CAP, "NEXT: carry-out: skip", ...SKIP_CHAIN_T1]],
  ["accept", "accept", [RULE_CAP, "NEXT: carry-out: accept", ...COMMIT_UNREVIEWED_T1]],
  ["a ruling naming neither", "rewrite it", [RULE_CAP, "NEXT: carry-out: accept | mismatch", ...COMMIT_UNREVIEWED_T1]],
] as const) {
  test(`ruled --case cap after a review failure with the ruling ${label} carries it out`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);
      seedRuling(repo, "T1", ruling);
      await arrange(repo, CAP_BY_REVIEW);

      const result = await step(repo, ["T1", "100", "ruled", "--case", "cap"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, lines(...expected));
    });
  });
}

test("ruled --case cap offers skip alone after a coder failure, so an accept ruling is a mismatch carried out as skip", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    seedRuling(repo, "T1", "accept");
    await arrange(repo, CAP_BY_FAIL);

    const result = await step(repo, ["T1", "100", "ruled", "--case", "cap"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines(RULE_CAP, "NEXT: carry-out: skip | mismatch", ...SKIP_CHAIN_T1));
  });
});

for (const [label, held, first, expected] of [
  ["a review failure", CAP_BY_REVIEW, "accept", ["NEXT: carry-out: accept", ...COMMIT_UNREVIEWED_T1]],
  ["a coder failure", CAP_BY_FAIL, "skip", ["NEXT: carry-out: skip", ...SKIP_CHAIN_T1]],
] as const) {
  test(`a refused cap arbiter after ${label} answers the fixed-words rule call with ${first} and carries it out`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);
      await arrange(repo, [...held]);

      const result = await step(repo, ["T1", "100", "ruled", "--case", "cap", "--refused"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, lines(REFUSED_RULE_CAP(first), ...expected));
    });
  });
}

// --- the skip chain -----------------------------------------------------------

for (const [id, expected] of [
  ["T1", SKIP_CHAIN_T1],
  ["T2", [`RUN: ${COMMIT_TASK} --skip "${PLAN_REL}" "T2"`, `RUN: ${COMMIT_TASK} --skip "${PLAN_REL}" "T3"`]],
  ["T4", [`RUN: ${COMMIT_TASK} --skip "${PLAN_REL}" "T4"`]],
] as const) {
  test(`skip of ${id} answers one commit-task --skip block for it, then one per task depending on it in task order`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);

      const result = await step(repo, [id, "100", "skip"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, lines(...expected));
    });
  });
}

// --- refusals ---------------------------------------------------------------

for (const [label, call] of [
  ["an id the plan does not hold", ["T9", "100", "start", "--tier", "sonnet", "--review", "opus"]],
  ["a tier that is no tier", ["T1", "100", "start", "--tier", "gold", "--review", "opus"]],
  ["a start with no --review", ["T1", "100", "start", "--tier", "sonnet"]],
  ["an event the script does not know", ["T1", "100", "bogus"]],
  ["a coder verdict that is none", ["T1", "100", "coder", "MAYBE"]],
  ["a --dod that is no m/n", ["T1", "100", "coder", "PASS", "--dod", "all"]],
  ["a coder event before any start", ["T1", "100", "coder", "FAIL"]],
] as const) {
  test(`${label} exits 2 with one error line and nothing on stdout`, async () => {
    await withGitRepo(async (repo) => {
      seedPlan(repo);

      const result = await step(repo, [...call]);
      assert.equal(result.status, 2, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^error: /);
    });
  });
}

test("a plan that plan-index.sh refuses exits 2 with nothing on stdout", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, "# not a plan\n");

    const result = await step(repo, START_T1);
    assert.equal(result.status, 2, `stdout: ${result.stdout}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: /);
  });
});

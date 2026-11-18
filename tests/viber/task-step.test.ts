/*
 * task-step.test.ts - proves viber/scripts/task-step.sh's answers to the
 * `start`, `coder`, `reviewer`, `retry`, `accept`, `commit` and `landed` events:
 * the one directive block the implementor sends next after a coder, a reviewer
 * or a commit returns.
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
import { runScript } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/task-step.sh");
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

const PLAN_DIR = "docs/_specs/2026-11-18-10-00-00_scripted-step";
const PLAN_REL = `${PLAN_DIR}/plan.md`;
const ROOT = slash(SUT).replace(/\/scripts\/task-step\.sh$/, "");

/** T2 depends on T1 and T3 on T2; T4 stands alone. T1 and T3 are TDD tasks. */
const TASKS = [
  { id: "T1", tdd: "required", deps: "none" },
  { id: "T2", tdd: "none", deps: "T1" },
  { id: "T3", tdd: "required", deps: "T2" },
  { id: "T4", tdd: "none", deps: "none" },
];

/** A task's Files and Verification, where a case needs the red check to run for real. */
type Overrides = Record<string, { files: string; verify: string }>;

function planText(overrides: Overrides = {}): string {
  return [
    "# Scripted step",
    "",
    "## Goal",
    "",
    "A task steps through its attempts.",
    "",
    "## Acceptance criteria",
    "",
    "1. A coder return is answered.",
    "",
    "## Scope",
    "",
    "### File map",
    "",
    "- add - src/one.ts - the handler",
    "",
    "### Out of scope",
    "",
    "- Everything else.",
    "",
    "## Tasks",
    "",
    ...TASKS.flatMap((t) => [
      "<!-- TASK -->",
      `### ${t.id} - do the thing`,
      `- TDD: ${t.tdd}`,
      "- Covers: AC1",
      "- Uses: C1",
      `- Depends-on: ${t.deps}`,
      `- Files: ${overrides[t.id]?.files ?? `src/${t.id}.ts`}`,
      "- Delivers: the thing",
      `- Verification: ${overrides[t.id]?.verify ?? "npm test"} -> green`,
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

function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function seedPlan(repo: GitRepo, config = "", overrides: Overrides = {}): void {
  write(repo.dir, PLAN_REL, planText(overrides));
  write(repo.dir, `${PLAN_DIR}/status.md`, "# status\n\nprogress: 0/4\ndone: none\n");
  if (config !== "") write(repo.dir, ".claude/viber.yml", config);
}

/** One call: the task id, the started mark, then the event and its flags. */
type Call = string[];

function step(repo: GitRepo, call: Call, sut = SUT) {
  const [id, mark, ...rest] = call;
  return runScript(sut, [PLAN_REL, id, mark, ...rest], { cwd: repo.dir, env: repo.env, shell: "bash", timeout: 120000 });
}

/** Earlier calls of the same task, run one after another. */
async function arrange(repo: GitRepo, calls: Call[]): Promise<void> {
  for (const call of calls) {
    const result = await step(repo, call);
    assert.equal(result.status, 0, `arranging ${call.join(" ")} failed: ${result.stderr}`);
  }
}

function lines(...parts: string[]): string {
  return `${parts.join("\n")}\n`;
}

function coderLines(id: string, extra: string[] = []): string[] {
  return [
    `task: ${PLAN_DIR}/tasks/${id}.md`,
    `notes: ${PLAN_DIR}/work/${id}-coder.md`,
    `out: .temp/viber/${id}/`,
    `refs: ${ROOT}/references`,
    `extras: ${PLAN_DIR}/work/${id}-extra.md`,
    `decide-file: ${PLAN_DIR}/work/${id}-options.md`,
    ...extra,
  ];
}

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

const START_T1: Call = ["T1", "100", "start", "--tier", "sonnet", "--review", "opus"];
const START_T4_WAIVED: Call = ["T4", "100", "start", "--tier", "sonnet", "--review", "waived"];
const T1_FAIL: Call = ["T1", "100", "coder", "FAIL"];

// --- start ------------------------------------------------------------------

test("start answers the first coder block with the tiers it was given and the coder lines of the plan", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);

    const result = await step(repo, ["T3", "100", "start", "--tier", "sonnet", "--review", "opus"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines(
        "NEXT: coder | attempt: 1 | model: sonnet | review: opus",
        ...coderLines("T3", [`prior: ${PLAN_DIR}/work/T2-coder.md`]),
      ),
    );
  });
});

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

test("start under another started mark discards the state and answers attempt 1", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, T1_FAIL]);

    const result = await step(repo, ["T1", "101", "start", "--tier", "sonnet", "--review", "opus"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 1 | model: sonnet | review: opus", ...coderLines("T1")),
    );
  });
});

test("start under the current mark keeps the state and prints the current attempt's coder block again", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [START_T1, T1_FAIL]);

    const result = await step(repo, START_T1);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: coder | attempt: 2 | model: opus | review: opus", ...coderLines("T1")),
    );
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

const T1_PASS: Call = ["T1", "100", "coder", "PASS", "--dod", "3/3", "--red", "2"];
const REVIEW_1 = `${PLAN_DIR}/work/review-T1-1.md`;

test("a reviewer PASS answers the commit with every --with path the coder and the reviewers reported and the --defer entries", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [
      START_T1,
      [...T1_PASS, "--with", "lib/x.ts", "--defer", "T2:src/x.ts"],
    ]);

    const result = await step(repo, ["T1", "100", "reviewer", "PASS", "--with", "lib/y.ts,lib/x.ts"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: commit", `RUN: "${ROOT}/scripts/commit-task.sh" "${PLAN_REL}" "T1" --with "lib/x.ts" "lib/y.ts" --defer "T2:src/x.ts"`),
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

test("commit 4 naming --landed opens the question on the already committed answer", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, T1_REVIEWED);

    const result = await step(repo, ["T1", "100", "commit", "4", "--landed"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, lines("ASK: already committed -> landed <sha> | retry | skip -> skip | abort"));
  });
});

test("landed answers the commit with the sha in place of the --with paths and keeps the --defer entries", async () => {
  await withGitRepo(async (repo) => {
    seedPlan(repo);
    await arrange(repo, [...T1_REVIEWED, ["T1", "100", "commit", "4", "--landed"]]);

    const result = await step(repo, ["T1", "100", "landed", "abc1234"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      lines("NEXT: commit", `RUN: "${ROOT}/scripts/commit-task.sh" "${PLAN_REL}" "T1" --landed "abc1234" --defer "T2:src/x.ts"`),
    );
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
  for (const name of ["task-step.sh", "plan-index.sh", "config.sh", "run-failures.sh"]) {
    fs.copyFileSync(path.join(path.dirname(SUT), name), path.join(scripts, name));
  }
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

/*
 * plan-index.test.ts - proves viber/scripts/plan-index.sh's two contracts.
 *
 * `plan-index.sh <plan>` validates the plan's structure and prints the compact
 * index that is the orchestrator's WHOLE view of it - the skill's body forbids
 * it to open a file, so a plan defect this script lets through is a
 * defect nothing else in the track can see. A non-zero exit must print nothing
 * on stdout and leave nothing on disk.
 *
 * That index is also what a session which did not start the build resumes from:
 * the run's own status.md (`done`, `skipped`, `unreviewed`, `deferred`,
 * `closed`) passes through, and a
 * `dirty:` line names a task whose files carry uncommitted work from a session
 * that was cut off inside it. A missing dirty line sends a fresh coder onto
 * another one's half-finished work; a spurious one - the fixer's RED
 * reproduction test, named on the task's `Repro:` line and uncommitted by
 * design - stops every fix build on a question with one right answer. A
 * `done` task's dirty file now shows as `orphan:` instead of `dirty:` - the
 * task that claimed it is already settled, so nothing dispatches a coder onto
 * it again.
 *
 * `plan-index.sh <plan> --split` additionally decomposes the plan in place:
 * `spec.md` (everything above `## Tasks`) plus one `tasks/<id>.md` per task,
 * carrying the block verbatim, the plan's goal, the text of the criteria its
 * `Covers:` line names, the contract blocks its `Uses:` line names, the big
 * shape's `### Must not change` where the plan has one, and the plan's
 * out-of-scope list. A task file carries no attachment or prototype section:
 * the files a plan is built from (`<run>/attachments/`, copied there by
 * `plan-path.sh --land`) are listed instead at the end of `spec.md`, under
 * `## Attachments`, one repo-relative path per line sorted by name, and
 * committed with the decomposition; no such directory or no file in it, no
 * section. A task file IS a coder's WHOLE input - it gets no `spec:` line
 * at all - so a task file that loses a field, loses a contract or picks up a
 * neighbour's is silent, uncatchable drift. The one line it does NOT carry
 * verbatim is `- DoD:`, cut on `;` into one numbered `- DoD.<k>:` line per
 * clause: a coder answers for each clause and a reviewer gates each one, which
 * the single sentence the plan keeps does not allow.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/plan-index.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { slash } from "../harness/paths.ts";
import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/plan-index.sh");

/** The dated run directory plan-path.sh owns; the decomposition lands beside the plan. */
const PLAN_DIR = "docs/_specs/2026-09-20-10-00-00_add-login";
const PLAN_REL = `${PLAN_DIR}/plan.md`;

function run(dir: string, env: Record<string, string>, args: string[]) {
  return runScript(SUT, args, { cwd: dir, env, shell: "bash" });
}

function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

interface TaskFields {
  id?: string;
  title?: string;
  tdd?: string;
  /** Omitted entirely unless set - an absent line is what an ordinary task looks like. */
  exclusive?: string;
  /** Omitted entirely unless set - only a fixing task carries the fixer's RED test. */
  repro?: string;
  /** Omitted entirely unless set - the plan marks only a task whose design it cannot settle. */
  hard?: string;
  covers?: string;
  /** `null` omits the line entirely - the shape a plan written before `Uses:` has. */
  uses?: string | null;
  deps?: string;
  files?: string;
  /** The whole Verification value; the default names no file. */
  verification?: string;
  /** Semicolon-separated clauses; the decomposition numbers them one per line. */
  dod?: string;
  /** The whole Delivers value; the default names no contract block. */
  delivers?: string;
}

/** The `## Contracts` appendix every default task names through `Uses: C1`. It
 *  sits BELOW the tasks, so it never reaches spec.md - only the task files whose
 *  `Uses:` line asks for it. Its `File:` line says `none` - a wire shape declared
 *  in no file of this plan - which keeps the ownership rules out of every case
 *  that is not about them; the cases that are build their own appendix. */
const CONTRACT = [
  "### C1 - Login endpoint",
  "",
  "File: none",
  "",
  "POST /login -> 200 | 401",
  "",
  "Body: `{ user, pass }`",
];

/** An appendix whose shape lives in a file, which is what ties it to the task
 *  map: the task holding that path is the block's writer. */
function ownedContract(file: string): string[] {
  return ["### C1 - Login endpoint", "", `File: ${file}`, "", "POST /login -> 200 | 401"];
}

/** The acceptance criteria both spec shapes carry: two of them, the first
 *  wrapped over two lines - a criterion's continuation is part of its text and
 *  has to reach the task file with it. */
function criteriaLines(criteria: number): string[] {
  return [
    "1. A user with valid credentials gets a session.",
    "   The session survives a reload.",
    "2. An invalid password is rejected.",
  ].slice(0, criteria === 1 ? 2 : 3);
}

/** The head of a plan built from `templates/spec-lite.md`. */
function liteHead(criteria: number): string[] {
  return [
    "# Add login",
    "",
    "## Goal",
    "",
    "Users can log in.",
    "The session is durable.",
    "",
    "## Acceptance criteria",
    "",
    ...criteriaLines(criteria),
    "",
    "## Scope",
    "",
    "### File map",
    "",
    "- add - src/login.ts - the handler",
    "",
    "### Out of scope",
    "",
    "- Password reset.",
    "- OAuth.",
    "",
  ];
}

/** The head of a plan built from `templates/spec-full.md`: the same four
 *  anchors, wrapped in the sections the big shape adds around them. */
function fullHead(criteria: number): string[] {
  return [
    "# Add login",
    "",
    "## Goal",
    "",
    "Users can log in.",
    "The session is durable.",
    "",
    "## Problem",
    "",
    "Anyone can read another person's orders.",
    "",
    "## Current behaviour",
    "",
    "Every page is public.",
    "",
    "### Must not change",
    "",
    "- The public catalogue stays reachable without an account.",
    "",
    "## Behaviour",
    "",
    "### S1 - Signing in [NEW]",
    "",
    "A returning customer reaches their own orders.",
    "",
    "Given a registered customer",
    "When they submit their credentials",
    "Then they see their own orders",
    "",
    "### Edge cases",
    "",
    "- An empty password -> the form is rejected before anything is checked.",
    "",
    "## Glossary",
    "",
    "- Session - the proof that this visitor signed in, held until they leave.",
    "",
    "## Acceptance criteria",
    "",
    ...criteriaLines(criteria),
    "",
    "## Scope",
    "",
    "### File map",
    "",
    "- add - src/login.ts - the handler",
    "",
    "### Out of scope",
    "",
    "- Password reset.",
    "- OAuth.",
    "",
    "## Solution requirements",
    "",
    "- The existing session cookie name has to survive.",
    "",
  ];
}

/** A plan in the template's shape: one of the two spec heads, then the task
 *  half every shape shares. */
function planBody(
  tasks: TaskFields[],
  criteria = 2,
  contracts: string[] = CONTRACT,
  shape: "lite" | "full" = "lite",
): string {
  return [
    ...(shape === "full" ? fullHead(criteria) : liteHead(criteria)),
    "## Tasks",
    "",
    ...tasks.flatMap((t) => [
      "<!-- TASK -->",
      `### ${t.id ?? "T1"} - ${t.title ?? "do the thing"}`,
      `- TDD: ${t.tdd ?? "required"}`,
      ...(t.exclusive === undefined ? [] : [`- Exclusive: ${t.exclusive}`]),
      ...(t.repro === undefined ? [] : [`- Repro: ${t.repro}`]),
      ...(t.hard === undefined ? [] : [`- Hard: ${t.hard}`]),
      `- Covers: ${t.covers ?? "AC1"}`,
      ...(t.uses === null ? [] : [`- Uses: ${t.uses ?? "C1"}`]),
      `- Depends-on: ${t.deps ?? "none"}`,
      `- Files: ${t.files ?? "src/a.ts"}`,
      `- Delivers: ${t.delivers ?? "the thing"}`,
      `- Verification: ${t.verification ?? "npm test -> green"}`,
      `- DoD: ${t.dod ?? "it works"}`,
      "<!-- /TASK -->",
      "",
    ]),
    ...(contracts.length ? ["## Contracts", "", ...contracts, ""] : []),
  ].join("\n");
}

/** T1 names the one contract block, T2 names none: the split has to be selective. */
const TWO_TASKS: TaskFields[] = [
  { id: "T1", title: "Add the login handler", files: "src/login.ts" },
  {
    id: "T2",
    title: "Reject a bad password",
    covers: "AC2",
    uses: "none",
    deps: "T1",
    files: "src/reject.ts",
  },
];

function seed(dir: string, body: string): void {
  write(dir, PLAN_REL, body);
}

/** The run's state file, as --split writes it and commit-task.sh advances it.
 *  Every key is optional here: what the file does not carry is simply not set. */
function seedStatus(dir: string, entries: Record<string, string>): void {
  write(
    dir,
    `${PLAN_DIR}/status.md`,
    ["# status", "", ...Object.entries(entries).map(([k, v]) => `${k}: ${v}`), ""].join("\n"),
  );
}

function readRun(dir: string, rel: string): string {
  return fs.readFileSync(path.join(dir, PLAN_DIR, rel), "utf-8");
}

function taskFiles(dir: string): string[] {
  const tasks = path.join(dir, PLAN_DIR, "tasks");
  return fs.existsSync(tasks) ? fs.readdirSync(tasks).sort() : [];
}

// --- the header documentation ------------------------------------------------

test("the header's example task titles carry no Conventional Commits type - a task title is prose, never a commit subject", () => {
  const source = fs.readFileSync(SUT, "utf-8");
  const exampleRows = source.split("\n").filter((l) => /^#\s+T[12] \|/.test(l));
  assert.equal(exampleRows.length, 2, `expected two example rows in the header, got: ${JSON.stringify(exampleRows)}`);
  for (const row of exampleRows) {
    assert.doesNotMatch(row, /\bchore:|\bfeat:/, row);
  }
});

// --- the index -------------------------------------------------------------

test("the index carries one row per task: id, state, TDD marker, exclusivity, normalised deps, files and title", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      [
        `plan: ${PLAN_REL}`,
        "title: Add login",
        "progress: 0/2",
        "tasks: id | state | tdd | excl | hard | deps | feeds | files | title",
        "T1 | todo | required | - | - | - | - | src/login.ts | Add the login handler",
        "T2 | todo | required | - | - | T1 | - | src/reject.ts | Reject a bad password",
        "verify: T1 | npm test",
        "verify: T2 | npm test",
        "review: single",
        "dispatch: viber:planner-review",
        "",
      ].join("\n"),
    );
  });
});

test("a marker mentioned mid-sentence in prose creates no task - only a marker alone on its own line opens one", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const body = planBody(TWO_TASKS).replace(
      "## Goal\n",
      "## Goal\n\nMentioning <!-- TASK --> inside a sentence must not open one.\n\n",
    );
    seed(dir, body);

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^progress: 0\/2$/m);
    assert.match(result.stdout, /^T1 \| todo \|/m);
    assert.match(result.stdout, /^T2 \| todo \|/m);
  });
});

test("Exclusive: true reaches the orchestrator as excl yes, and an absent line as '-' (the plan declares the constraint, the script only carries it)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody([
        { id: "T1", title: "Add the login handler", files: "src/login.ts" },
        {
          id: "T2",
          title: "Prove the endpoint against a real server",
          covers: "AC2",
          uses: "none",
          deps: "T1",
          files: "test/login.api.ts",
          exclusive: "true",
        },
      ]),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      [
        `plan: ${PLAN_REL}`,
        "title: Add login",
        "progress: 0/2",
        "tasks: id | state | tdd | excl | hard | deps | feeds | files | title",
        "T1 | todo | required | - | - | - | - | src/login.ts | Add the login handler",
        "T2 | todo | required | yes | - | T1 | - | test/login.api.ts | Prove the endpoint against a real server",
        "verify: T1 | npm test",
        "verify: T2 | npm test",
        "review: single",
        "dispatch: viber:planner-review",
        "",
      ].join("\n"),
    );
  });
});

test("a Hard line reaches the orchestrator as hard yes, and an absent line as '-' (the plan marks the task, the orchestrator picks the model)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody([
        { id: "T1", title: "Add the login handler", files: "src/login.ts", hard: "lockout races between concurrent attempts" },
        { id: "T2", title: "Reject a bad password", covers: "AC2", deps: "T1", files: "src/reject.ts" },
      ]),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^T1 \| todo \| required \| - \| yes \| - \| - \| src\/login\.ts \| Add the login handler$/m);
    assert.match(result.stdout, /^T2 \| todo \| required \| - \| - \| T1 \| - \| src\/reject\.ts \| Reject a bad password$/m);
  });
});

test("state and the progress counter come from the run's own status.md, which is how a build resumes", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    seedStatus(dir, { progress: "1/2", done: "T1" });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^progress: 1\/2$/m);
    assert.match(result.stdout, /^T1 \| done \|/m);
    assert.match(result.stdout, /^T2 \| todo \|/m);
  });
});

test("the status file's other entries pass through, and a skipped task is settled rather than todo", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    seedStatus(dir, {
      progress: "1/2",
      done: "T1",
      skipped: "T2",
      unreviewed: "T1",
      deferred: "T2:src/reject.ts",
      closed: "memory qa",
    });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^progress: 1\/2$/m);
    assert.match(result.stdout, /^skipped: T2$/m);
    assert.match(result.stdout, /^unreviewed: T1$/m);
    // who owes a test for code an earlier task left unproved - no later session
    // could read that off the tree
    assert.match(result.stdout, /^deferred: T2:src\/reject\.ts$/m);
    assert.match(result.stdout, /^closed: memory qa$/m);
    assert.match(result.stdout, /^T2 \| skipped \|/m);
  });
});

test("a status file still carrying owed and repaired keys prints neither line (no build reads them)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    seedStatus(dir, {
      progress: "2/2",
      done: "T1 T2",
      deferred: "T2:src/reject.ts",
      owed: "T1:src/a.ts",
      repaired: "none",
      closed: "memory",
    });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^deferred: T2:src\/reject\.ts\nclosed: memory\n/m);
    assert.doesNotMatch(result.stdout, /^(owed|repaired):/m);
  });
});

test("a run whose status file carries none of those entries reports none of them, so a run that needed no decision stays quiet", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    seedStatus(dir, {
      progress: "0/2",
      done: "none",
      skipped: "none",
      unreviewed: "none",
      deferred: "none",
      closed: "none",
    });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    for (const line of [/^skipped:/m, /^unreviewed:/m, /^deferred:/m, /^closed:/m, /^dirty:/m]) {
      assert.doesNotMatch(result.stdout, line);
    }
  });
});

test("every decision line of status.md is printed in file order between the closed line and the tasks line, a colon in its text intact", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    write(
      dir,
      `${PLAN_DIR}/status.md`,
      [
        "# status",
        "",
        "progress: 0/2",
        "done: none",
        "decision: T2: scope: src/reject.ts only",
        "closed: memory",
        "decision: T1: keep the old handler",
        "",
      ].join("\n"),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(
      result.stdout,
      /^closed: memory\ndecision: T2: scope: src\/reject\.ts only\ndecision: T1: keep the old handler\ntasks: /m,
    );
  });
});

test("a status file with no decision line prints the index exactly as before - the tasks line straight after the state lines", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    seedStatus(dir, { progress: "1/2", done: "T1", closed: "memory" });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      [
        `plan: ${PLAN_REL}`,
        "title: Add login",
        "progress: 1/2",
        "closed: memory",
        "tasks: id | state | tdd | excl | hard | deps | feeds | files | title",
        "T1 | done | required | - | - | - | - | src/login.ts | Add the login handler",
        "T2 | todo | required | - | - | T1 | - | src/reject.ts | Reject a bad password",
        "verify: T1 | npm test",
        "verify: T2 | npm test",
        "",
      ].join("\n"),
    );
  });
});

test("a plan with no status file beside it reports nothing done, which is the state of a run that never started", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^progress: 0\/2$/m);
    assert.match(result.stdout, /^T1 \| todo \|/m);
    for (const line of [/^skipped:/m, /^unreviewed:/m, /^deferred:/m, /^closed:/m]) {
      assert.doesNotMatch(result.stdout, line);
    }
  });
});

test("a task whose own files carry uncommitted work is reported dirty - that is a session cut off mid-task", async () => {
  await withGitRepo(async (repo) => {
    seed(repo.dir, planBody(TWO_TASKS));
    write(repo.dir, "src/login.ts", "committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    // T1's file edited but not committed, T2's created but never staged
    write(repo.dir, "src/login.ts", "half a coder's work\n");
    write(repo.dir, "src/reject.ts", "and another\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^dirty: T1 \| src\/login\.ts$/m);
    assert.match(result.stdout, /^dirty: T2 \| src\/reject\.ts$/m);
    // a todo task's own dirty file is dirty:, never orphan: too
    assert.doesNotMatch(result.stdout, /^orphan:/m);
    // the state itself still comes from the plan, never from the tree
    assert.match(result.stdout, /^T1 \| todo \|/m);
  });
});

test("a clean tree reports no dirty line, so a build that starts normally sees no resume noise", async () => {
  await withGitRepo(async (repo) => {
    seed(repo.dir, planBody(TWO_TASKS));
    write(repo.dir, "src/login.ts", "committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    const result = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^dirty:/m);
    assert.doesNotMatch(result.stdout, /^orphan:/m);
  });
});

test("a run whose rulings.md holds two entries prints two ruling lines in file order after the decision lines, the leading dash dropped and a colon in the text intact", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    write(dir, `${PLAN_DIR}/status.md`, ["# status", "", "progress: 0/2", "decision: T1: keep the old handler", ""].join("\n"));
    write(
      dir,
      `${PLAN_DIR}/rulings.md`,
      [
        "# Rulings",
        "",
        "- T2: retry: with the note | why: a flaky port | cost if wrong: one more round",
        "- baseline: accept | why: red before the change | cost if wrong: a hidden failure",
        "",
      ].join("\n"),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(
      result.stdout,
      /^decision: T1: keep the old handler\nruling: T2: retry: with the note \| why: a flaky port \| cost if wrong: one more round\nruling: baseline: accept \| why: red before the change \| cost if wrong: a hidden failure\ntasks: /m,
    );
  });
});

test("a run with no rulings.md prints the index exactly as before - no ruling line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    seedStatus(dir, { progress: "0/2", closed: "memory" });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      [
        `plan: ${PLAN_REL}`,
        "title: Add login",
        "progress: 0/2",
        "closed: memory",
        "tasks: id | state | tdd | excl | hard | deps | feeds | files | title",
        "T1 | todo | required | - | - | - | - | src/login.ts | Add the login handler",
        "T2 | todo | required | - | - | T1 | - | src/reject.ts | Reject a bad password",
        "verify: T1 | npm test",
        "verify: T2 | npm test",
        "",
      ].join("\n"),
    );
  });
});

test("an uncommitted rulings.md never appears on an orphan or dirty line (it lives in the run directory, no task owns it)", async () => {
  await withGitRepo(async (repo) => {
    seed(repo.dir, planBody(TWO_TASKS));
    write(repo.dir, "src/login.ts", "committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    write(repo.dir, `${PLAN_DIR}/rulings.md`, "# Rulings\n\n- T1: retry | why: a | cost if wrong: b\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^(orphan|dirty):.*rulings\.md/m);
  });
});

test("a changed path claimed by no task not done is reported orphan", async () => {
  await withGitRepo(async (repo) => {
    seed(repo.dir, planBody(TWO_TASKS));
    write(repo.dir, "src/login.ts", "committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    write(repo.dir, "lib/x.ts", "nobody's task claims this\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^orphan: lib\/x\.ts$/m);
  });
});

test("each orphan path gets its own orphan line, a path holding a comma staying whole (a comma-joined line split it in two)", async () => {
  await withGitRepo(async (repo) => {
    seed(repo.dir, planBody(TWO_TASKS));
    write(repo.dir, "src/login.ts", "committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    write(repo.dir, "notes/b.md", "nobody's task claims this\n");
    write(repo.dir, "notes/q3, draft.md", "nor this\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const lines = result.stdout.split("\n").filter((line) => line.startsWith("orphan:"));
    assert.deepEqual(lines, ["orphan: notes/b.md", "orphan: notes/q3, draft.md"]);
  });
});

test("a path inside the run directory (a work/ note) is never reported orphan", async () => {
  await withGitRepo(async (repo) => {
    seed(repo.dir, planBody(TWO_TASKS));
    write(repo.dir, "src/login.ts", "committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    write(repo.dir, `${PLAN_DIR}/work/T1.round1.md`, "a coder's own trail note\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^orphan:/m);
  });
});

test("an absolute or './' plan path inside the repository prints the same index as the relative one (an absolute run directory once reported its own files orphan)", async () => {
  await withGitRepo(async (repo) => {
    seed(repo.dir, planBody(TWO_TASKS));
    write(repo.dir, "src/login.ts", "committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    write(repo.dir, `${PLAN_DIR}/work/T1.round1.md`, "a coder's own trail note\n");

    const relative = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(relative.status, 0, `stderr: ${relative.stderr}`);
    for (const spelling of [path.join(repo.dir, PLAN_REL), `./${PLAN_REL}`]) {
      const result = await run(repo.dir, repo.env, [spelling]);
      assert.equal(result.status, 0, `${spelling}: ${result.stderr}`);
      assert.equal(result.stdout, relative.stdout, spelling);
    }
  });
});

test("a done task's dirty file is reported orphan, not dirty, since the task that claimed it is already settled", async () => {
  await withGitRepo(async (repo) => {
    seed(repo.dir, planBody(TWO_TASKS));
    seedStatus(repo.dir, { progress: "1/2", done: "T1" });
    write(repo.dir, "src/login.ts", "committed\n");
    write(repo.dir, "src/reject.ts", "committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    // T1 is done, but its own file is dirty again - a session cut off after
    // the task landed
    write(repo.dir, "src/login.ts", "touched again after T1 landed\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^dirty: T1 \|/m);
    assert.match(result.stdout, /^orphan: src\/login\.ts$/m);
  });
});

test("a skipped task's dirty file is reported dirty, never orphan", async () => {
  await withGitRepo(async (repo) => {
    seed(repo.dir, planBody(TWO_TASKS));
    seedStatus(repo.dir, { progress: "0/2", done: "none", skipped: "T2" });
    write(repo.dir, "src/login.ts", "committed\n");
    write(repo.dir, "src/reject.ts", "committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    write(repo.dir, "src/reject.ts", "touched after T2 was skipped\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^dirty: T2 \| src\/reject\.ts$/m);
    assert.doesNotMatch(result.stdout, /^orphan:/m);
  });
});

test("the Repro path is uncommitted by design and never reported dirty, while the rest of that task's files still are", async () => {
  const FIX: TaskFields[] = [
    {
      id: "T1",
      title: "Fix the rejected login",
      tdd: "none",
      repro: "test/login.test.ts",
      files: "src/login.ts, test/login.test.ts",
    },
  ];
  await withGitRepo(async (repo) => {
    seed(repo.dir, planBody(FIX, 1));
    write(repo.dir, "src/login.ts", "committed\n");
    write(repo.dir, "test/login.test.ts", "committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    // the fixer's RED test, appended to an existing test file and left uncommitted
    write(repo.dir, "test/login.test.ts", "committed\nand a RED reproduction\n");
    let result = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^dirty:/m);
    // the Repro path is claimed by T1's own Files, so it is never orphan either
    assert.doesNotMatch(result.stdout, /^orphan:/m);

    // a session cut off inside the fix still shows, the Repro path left out
    write(repo.dir, "src/login.ts", "half a coder's fix\n");
    result = await run(repo.dir, repo.env, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^dirty: T1 \| src\/login\.ts$/m);
    assert.doesNotMatch(result.stdout, /^orphan:/m);
  });
});

// --- validation ------------------------------------------------------------

test("a missing argument, a missing plan and an unknown second argument all exit 2 with nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    for (const args of [[], ["docs/_specs/nope/plan.md"], [PLAN_REL, "--decompose"]]) {
      const result = await run(dir, {}, args);
      assert.equal(result.status, 2, `args ${JSON.stringify(args)} -> stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
    }
  });
});

test("--split refuses any plan but the run's own <dir>/plan.md - it rebuilds <dir>/tasks and would delete a real one", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // the exact shape that would cost a project its own tasks/ directory:
    // a plan sitting loose in the repository root
    write(dir, "plan.md", planBody(TWO_TASKS));
    write(dir, "tasks/keep.txt", "a directory this project owns\n");
    write(dir, `${PLAN_DIR}/steps.md`, planBody(TWO_TASKS));

    for (const rel of ["plan.md", `${PLAN_DIR}/steps.md`]) {
      const result = await run(dir, {}, [rel, "--split"]);
      assert.equal(result.status, 2, `${rel} -> stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /--split expects the run/);
    }

    assert.deepEqual(fs.readdirSync(path.join(dir, "tasks")), ["keep.txt"]);
  });
});

test(
  "--split accepts the run's own plan.md handed over with Windows separators (dirname splits a backslash, the shell's own expansion does not - disagreeing, they refuse a legitimate plan)",
  {
    skip:
      process.platform === "win32"
        ? false
        : "off Windows a backslash is a legal filename character, so the argument names no file",
  },
  async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, planBody(TWO_TASKS));

      const result = await run(dir, {}, [PLAN_REL.replace(/\//g, "\\"), "--split"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);
    });
  },
);

test("a <!-- TASK --> block above the plan's own \"## Tasks\" heading is refused, naming the task, and --split writes nothing for it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // the cut point IS the "## Tasks" heading: a block that opens before it has
    // ever been seen would ride into spec.md rather than decompose into its own
    // task file, which is silent drift a coder never notices
    const misplaced = [
      "<!-- TASK -->",
      "### T0 - Misplaced task",
      "- TDD: required",
      "- Covers: AC1",
      "- Uses: none",
      "- Depends-on: none",
      "- Files: src/misplaced.ts",
      "- Delivers: the thing",
      "- Verification: npm test -> green",
      "- DoD: it works",
      "<!-- /TASK -->",
      "",
      "",
    ].join("\n");
    const body = planBody(TWO_TASKS).replace("## Goal\n", `## Goal\n\n${misplaced}`);
    seed(dir, body);

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /task T0: <!-- TASK --> block sits above the "## Tasks" heading/);
    assert.deepEqual(fs.readdirSync(path.join(dir, PLAN_DIR)), ["plan.md"]);
  });
});

test("a plan with no task blocks exits 3", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([]).replace(/<!-- \/?TASK -->/g, ""));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 3);
    assert.equal(result.stdout, "");
  });
});

test("a broken task contract exits 4 and names the task", async () => {
  const cases: Array<[string, TaskFields[], RegExp, string[]?]> = [
    [
      "duplicate id",
      [
        { id: "T1", files: "src/a.ts" },
        { id: "T1", files: "src/b.ts" },
      ],
      /duplicate task id: T1/,
    ],
    [
      "an id that is not a bare token - it names the task file",
      [{ id: "T 1/x", files: "src/a.ts" }],
      /task id "T 1\/x"/,
    ],
    ["a Covers pointing at a criterion that does not exist", [{ id: "T1", covers: "AC9" }], /task T1: Covers AC9, absent from acceptance criteria/],
    ["a Covers still written in the old #<n> form - it names no criterion", [{ id: "T1", covers: "#1" }], /task T1: Covers references no acceptance criterion/],
    [
      "a task with no Uses line - the one a plan written before the field looks like",
      [{ id: "T1", uses: null }],
      /task T1: missing Uses/,
    ],
    [
      "a Uses pointing at a contract block that does not exist",
      [{ id: "T1", uses: "C9" }],
      /task T1: Uses C9, no such contract block/,
    ],
    ["a glob in Files", [{ id: "T1", files: "src/*.ts" }], /is a glob/],
    ["a recursive glob in Files", [{ id: "T1", files: "src/**/*.ts" }], /is a glob/],
    [
      // the bracket does not wrap the segment, so it is a character class and
      // not an App Router directory name - the one case the shape test keeps out
      "a character class inside a segment of a Files entry",
      [{ id: "T1", files: "src/a[bc].ts" }],
      /Files entry "src\/a\[bc\]\.ts" is a glob/,
    ],
    ["a directory in Files", [{ id: "T1", files: "src/" }], /is a directory/],
    // quoting reaches commit-task.sh as part of the pathspec and stages nothing
    ["a backticked path in Files", [{ id: "T1", files: "`src/a.ts`" }], /is not a bare path, drop the quoting/],
    ["a double-quoted path in Files", [{ id: "T1", files: '"src/a.ts"' }], /is not a bare path, drop the quoting/],
    ["a TDD marker that is neither required nor none", [{ id: "T1", tdd: "maybe" }], /TDD must be/],
    [
      "an Exclusive line spelled false rather than left out",
      [{ id: "T1", exclusive: "false" }],
      /task T1: Exclusive must be "true" or the line left out, got: "false"/,
    ],
    [
      "a Hard line with no reason - the reason is what justifies the stronger model",
      [{ id: "T1", hard: "" }],
      /task T1: Hard needs its reason, or the line left out/,
    ],
    [
      "an Exclusive line spelled none - the mandatory fields' convention, borrowed where it does not hold",
      [{ id: "T1", exclusive: "none" }],
      /task T1: Exclusive must be "true" or the line left out, got: "none"/,
    ],
    [
      "a Repro path outside the task's own Files - it would be committed by nobody",
      [{ id: "T1", tdd: "none", repro: "test/other.test.ts", files: "src/a.ts" }],
      /task T1: Repro "test\/other\.test\.ts" must be one path of its own Files/,
    ],
    [
      "a Repro on a TDD: required task - the reproduction test already is the RED cycle",
      [{ id: "T1", repro: "src/a.ts", files: "src/a.ts" }],
      /task T1: Repro needs "TDD: none"/,
    ],
    [
      "a dependency pointing forward",
      [
        { id: "T1", deps: "T2", files: "src/a.ts" },
        { id: "T2", files: "src/b.ts" },
      ],
      /must reference an earlier task/,
    ],
    [
      "a task depending on an Exclusive task - it runs last, so nothing may depend on it",
      [
        { id: "T1", exclusive: "true", files: "src/a.ts" },
        { id: "T2", deps: "T1", files: "src/b.ts" },
      ],
      /task T2: Depends-on T1, an Exclusive task - it runs last, so no task may depend on it/,
    ],
    [
      "two tasks with no dependency path between them claiming the same file",
      [
        { id: "T1", files: "src/a.ts" },
        { id: "T2", files: "src/a.ts" },
      ],
      /both list src\/a\.ts/,
    ],
    [
      "two contract blocks sharing an id - the id is what a Uses line resolves",
      [{ id: "T1" }],
      /duplicate contract id: C1/,
      [...CONTRACT, "", "### C1 - Login endpoint again", "", "POST /login -> 204"],
    ],
    [
      "a contract heading with no id in front of the name",
      [{ id: "T1", uses: "none" }],
      /contract heading must be "### <id> - <name>", got: Login endpoint/,
      ["### Login endpoint", "", "POST /login -> 200 | 401"],
    ],
  ];

  for (const [name, tasks, expected, contracts] of cases) {
    await withTempDir("p2p2-viber-", async (dir) => {
      // one criterion, which every default Covers names: each case has to fail
      // for the defect it carries, not for an uncovered criterion
      seed(dir, planBody(tasks, 1, contracts));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 4, `${name} -> stdout: ${result.stdout} stderr: ${result.stderr}`);
      assert.equal(result.stdout, "", name);
      assert.match(result.stderr, expected, name);
    });
  }
});

test("a task depending on an Exclusive task validates under --split - a frozen plan resumed after the rule lands must still decompose", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", exclusive: "true", files: "src/a.ts" },
          { id: "T2", deps: "T1", files: "src/b.ts" },
        ],
        1,
      ),
    );

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);
  });
});

test("an Exclusive task depending on earlier tasks and having no dependents itself decomposes under --split", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody([
        { id: "T1", title: "Add the login handler", files: "src/login.ts" },
        {
          id: "T2",
          title: "Prove the endpoint against a real server",
          covers: "AC2",
          uses: "none",
          deps: "T1",
          files: "test/login.api.ts",
          exclusive: "true",
        },
      ]),
    );

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);
  });
});

/** T3 names T1 beside T2, while T2 already depends on T1: the T1 edge orders nothing. */
const REDUNDANT_DIRECT: TaskFields[] = [
  { id: "T1", files: "src/a.ts" },
  { id: "T2", deps: "T1", files: "src/b.ts" },
  { id: "T3", deps: "T1, T2", files: "src/c.ts" },
];

test("a Depends-on entry another entry of the same line already reaches directly exits 4, naming the task, the entry and the one reaching it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(REDUNDANT_DIRECT, 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /task T3: Depends-on T1 is already reached through T2 - drop it/);
  });
});

test("a Depends-on entry another entry of the same line reaches only transitively exits 4, naming the entry on that line that reaches it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", files: "src/a.ts" },
          { id: "T2", deps: "T1", files: "src/b.ts" },
          { id: "T3", deps: "T2", files: "src/c.ts" },
          { id: "T4", deps: "T1, T3", files: "src/d.ts" },
        ],
        1,
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /task T4: Depends-on T1 is already reached through T3 - drop it/);
  });
});

test("a redundant Depends-on entry validates under --split - a frozen plan resumed after the rule lands must still decompose", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(REDUNDANT_DIRECT, 1));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("two Depends-on entries with no path between them are both load-bearing and validate", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", files: "src/a.ts" },
          { id: "T2", files: "src/b.ts" },
          { id: "T3", deps: "T1, T2", files: "src/c.ts" },
        ],
        1,
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a Files entry whose brackets wrap whole segments is an exact path and reaches the index untouched", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // the three Next.js App Router dynamic segments - a dynamic one, a catch-all
    // and an optional catch-all - plus a route group in parentheses. Every route
    // of such a project carries one, so rejecting the bracket itself would leave
    // no plan touching a route able to validate at all.
    const files = [
      "src/app/(public)/site-render/[host]/preview-draft/[token]/[[...path]]/page.tsx",
      "src/app/api/admin/sites/[siteId]/contents/[contentId]/route.ts",
      "src/app/blog/[...slug]/page.tsx",
    ].join(",");
    seed(dir, planBody([{ id: "T1", files }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^T1 \| todo \| required \| - \| - \| - \| - \| (.+) \| do the thing$/m);
    assert.ok(result.stdout.includes(`| ${files} |`), `stdout: ${result.stdout}`);
  });
});

test("an acceptance criterion no task's Covers names exits 4 (nothing downstream gates the spec as a whole)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // both criteria present, every task pointing at the first one
    seed(dir, planBody([{ id: "T1", covers: "AC1" }]));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /acceptance criterion AC2 is covered by no task/);
  });
});

test("only the criterion tokens of Covers count, so a digit inside an annotation covers nothing", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // "(see S2)" carries a 2, and criterion AC2 is still covered by no task
    seed(dir, planBody([{ id: "T1", covers: "AC1 (see S2)" }]));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /acceptance criterion AC2 is covered by no task/);
    assert.doesNotMatch(result.stderr, /criterion AC1 |Covers AC/);
  });
});

test("one task writing Covers: AC1, AC2 validates and its task file carries both criteria", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", covers: "AC1, AC2" }]));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(readRun(dir, "tasks/T1.md"), /^## Covered criteria\n1\. A user with valid[^\n]*\n[^\n]*\n2\. An invalid password is rejected\.$/m);
  });
});

test("a contract block no task's Uses names exits 4 (the split would leave it unreachable)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // the block is in the appendix and every task says it touches no shape, so
    // nothing would ever carry it to a coder
    seed(dir, planBody([{ id: "T1", uses: "none" }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /contract C1 is used by no task/);
  });
});

test("an appendix where no block carries File fails validation outside --split (the exemption is for resuming a frozen plan, not for a fresh one)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1" }], 1, ["### C1 - Login endpoint", "", "POST /login -> 200 | 401"]));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /contract C1: missing File/);
  });
});

test("an appendix where no block carries File validates untouched (a plan that landed before the field is frozen and still has to resume)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // the old shape: a block with no File line, naming a file no task owns -
    // exactly what the ownership rules reject, and exactly what a run started
    // under an earlier version carries
    seed(dir, planBody([{ id: "T1" }], 1, ["### C1 - Login endpoint", "", "POST /login -> 200 | 401"]));

    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);
  });
});

test("one block carrying File makes the line mandatory for the rest (a half-filled appendix is drift, not an older plan)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody([{ id: "T1", uses: "C1, C2" }], 1, [
        ...ownedContract("src/a.ts"),
        "",
        "### C2 - Session cookie",
        "",
        "Set-Cookie: sid",
      ]),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /contract C2: missing File/);
  });
});

test("a contract file no task creates and the tree does not hold exits 4 (the shape would be invented by whoever needs it first)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // the task writes src/a.ts; the shape is declared in a file nobody owns, so
    // its coder would discover it missing and write it outside its own Files
    seed(dir, planBody([{ id: "T1" }], 1, ownedContract("src/session.ts")));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /contract C1 declares src\/session\.ts, which no task creates/);
  });
});

test("a contract file already in the tree needs no owner - a shape this change only consumes is already written", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    write(dir, "src/session.ts", "export type Session = { id: string };\n");
    seed(dir, planBody([{ id: "T1" }], 1, ownedContract("src/session.ts")));

    assert.equal((await run(dir, {}, [PLAN_REL])).status, 0);
  });
});

test("a contract file whose holders never name the block exits 4 (its writer would never see the shape)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // T1 holds the file the shape lives in but says it touches no shape; only
    // T2, which does not hold it, names C1 - so the block reaches the consumer
    // and never the writer
    seed(
      dir,
      planBody(
        [
          { id: "T1", uses: "none", files: "src/login.ts" },
          { id: "T2", covers: "AC2", uses: "C1", deps: "T1", files: "src/reject.ts" },
        ],
        2,
        ownedContract("src/login.ts"),
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /contract C1 declares src\/login\.ts, held by T1, but no holder names C1 in Uses/);
  });
});

test("one holder naming the block is enough - a file several tasks in one chain touch is not everyone's shape", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", uses: "C1", files: "src/login.ts" },
          { id: "T2", covers: "AC2", uses: "none", deps: "T1", files: "src/login.ts" },
        ],
        2,
        ownedContract("src/login.ts"),
      ),
    );

    assert.equal((await run(dir, {}, [PLAN_REL])).status, 0);
  });
});

test("feeds names a contract block one task writes with the count of other tasks consuming it, and stays '-' for a consumer itself", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // T1 holds the file the shape lives in AND names it in Uses (satisfying
    // reachability); T2 and T3, which do not hold that file, also name it -
    // the two other tasks that make T1's own work load-bearing
    seed(
      dir,
      planBody(
        [
          { id: "T1", uses: "C1", files: "src/login.ts" },
          { id: "T2", covers: "AC2", uses: "C1", deps: "T1", files: "src/reject.ts" },
          { id: "T3", uses: "C1", deps: "T1", files: "src/logout.ts" },
        ],
        2,
        ownedContract("src/login.ts"),
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^T1 \| todo \| required \| - \| - \| - \| C1:2 \| src\/login\.ts \| do the thing$/m);
    assert.match(result.stdout, /^T2 \| todo \| required \| - \| - \| T1 \| - \| src\/reject\.ts \| do the thing$/m);
  });
});

// --- the profile lines of --split --------------------------------------------

/** T1 holds the file C1 lives in; T2 to T4 consume it, so T1 feeds three tasks. */
const FEEDING_THREE: TaskFields[] = [
  { id: "T2", covers: "AC2", uses: "C1", deps: "T1", files: "src/b.ts" },
  { id: "T3", uses: "C1", deps: "T1", files: "src/c.ts" },
  { id: "T4", uses: "C1", deps: "T1", files: "src/d.ts" },
];

/** The `profile:` lines of a --split run over the plan, under an optional tiers config. */
async function profileLines(
  tasks: TaskFields[],
  contracts: string[] = CONTRACT,
  config = "",
  status: Record<string, string> | null = null,
): Promise<string[]> {
  return withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(tasks, new Set(tasks.map((t) => t.covers ?? "AC1")).size, contracts));
    if (config !== "") write(dir, ".claude/viber.yml", config);
    if (status !== null) seedStatus(dir, status);
    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    return result.stdout.split("\n").filter((l) => l.startsWith("profile: "));
  });
}

const THREE_FILES = "src/login.ts,src/x.ts,src/y.ts";
const MIN_SONNET = "tiers:\n  min: sonnet\n";
const MAX_SONNET = "tiers:\n  max: sonnet\n";

const PROFILE_CASES: [string, TaskFields[], string[], string, string[]][] = [
  [
    "a hard task prints opus and a review tier of opus",
    [{ id: "T1", title: "Race", hard: "lockout races" }],
    CONTRACT,
    "",
    ["profile: T1 | tier: opus | review: opus | subject: T1 [TDD] - Race"],
  ],
  [
    "a TDD none task over one file and not hard prints haiku? with its mechanical and other tiers, the mechanical review raised to sonnet",
    [{ id: "T1", tdd: "none" }],
    CONTRACT,
    "",
    ["profile: T1 | haiku? | mechanical: haiku review sonnet | else: sonnet waive? sonnet | subject: T1 - do the thing"],
  ],
  [
    "a TDD none task over two files is still a haiku? line",
    [{ id: "T1", tdd: "none", files: "src/a.ts,src/b.ts" }],
    CONTRACT,
    "",
    ["profile: T1 | haiku? | mechanical: haiku review sonnet | else: sonnet waive? sonnet | subject: T1 - do the thing"],
  ],
  [
    "a sonnet task with TDD none over three files and feeding nothing prints waive? before its tier",
    [{ id: "T1", tdd: "none", files: THREE_FILES }],
    CONTRACT,
    "",
    ["profile: T1 | tier: sonnet | review: waive? sonnet | subject: T1 - do the thing"],
  ],
  [
    "a TDD required task prints its review tier with no waive? and [TDD] after its id",
    [{ id: "T1", title: "Add the handler" }],
    CONTRACT,
    "",
    ["profile: T1 | tier: sonnet | review: sonnet | subject: T1 [TDD] - Add the handler"],
  ],
  [
    "a task feeding three tasks gets a review tier of opus and no waive?",
    [{ id: "T1", tdd: "none", files: THREE_FILES, uses: "C1" }, ...FEEDING_THREE],
    ownedContract("src/login.ts"),
    "",
    [
      "profile: T1 | tier: sonnet | review: opus | subject: T1 - do the thing",
      "profile: T2 | tier: sonnet | review: sonnet | subject: T2 [TDD] - do the thing",
      "profile: T3 | tier: sonnet | review: sonnet | subject: T3 [TDD] - do the thing",
      "profile: T4 | tier: sonnet | review: sonnet | subject: T4 [TDD] - do the thing",
    ],
  ],
  [
    "a mechanical task feeding three tasks raises both alternatives to a review of opus",
    [{ id: "T1", tdd: "none", files: "src/login.ts", uses: "C1" }, ...FEEDING_THREE],
    ownedContract("src/login.ts"),
    "",
    [
      "profile: T1 | haiku? | mechanical: haiku review opus | else: sonnet review opus | subject: T1 - do the thing",
      "profile: T2 | tier: sonnet | review: sonnet | subject: T2 [TDD] - do the thing",
      "profile: T3 | tier: sonnet | review: sonnet | subject: T3 [TDD] - do the thing",
      "profile: T4 | tier: sonnet | review: sonnet | subject: T4 [TDD] - do the thing",
    ],
  ],
  [
    "a haiku? line under tiers.min sonnet prints its mechanical tiers as sonnet with no waiver and keeps the other alternative",
    [{ id: "T1", tdd: "none" }],
    CONTRACT,
    MIN_SONNET,
    ["profile: T1 | haiku? | mechanical: sonnet review sonnet | else: sonnet waive? sonnet | subject: T1 - do the thing"],
  ],
  [
    "a hard task under tiers.max sonnet prints sonnet for its tier and its review",
    [{ id: "T1", title: "Race", hard: "lockout races" }],
    CONTRACT,
    MAX_SONNET,
    ["profile: T1 | tier: sonnet | review: sonnet | subject: T1 [TDD] - Race"],
  ],
];

for (const [name, tasks, contracts, config, expected] of PROFILE_CASES) {
  test(`--split profile: ${name}`, async () => {
    assert.deepEqual(await profileLines(tasks, contracts, config), expected);
  });
}

test("--split prints no profile line for a done or a skipped task (nothing dispatches it again)", async () => {
  const lines = await profileLines(
    [
      { id: "T1", title: "First" },
      { id: "T2", title: "Second", covers: "AC2", files: "src/b.ts" },
      { id: "T3", title: "Third", files: "src/c.ts" },
    ],
    CONTRACT,
    "",
    { done: "T1", skipped: "T2" },
  );
  assert.deepEqual(lines, ["profile: T3 | tier: sonnet | review: sonnet | subject: T3 [TDD] - Third"]);
});

test("--split prints the profile lines after the verify lines and before a dirty line", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, planBody([{ id: "T1" }], 1));
    write(repo.dir, "src/a.ts", "x\n");
    const result = await run(repo.dir, repo.env, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const kinds = result.stdout.split("\n").map((l) => l.split(":")[0]).filter((k) => ["verify", "profile", "dirty"].includes(k));
    assert.deepEqual(kinds, ["verify", "profile", "dirty"]);
  });
});

test("a plain call prints no profile line (the index of the planner stays as it was)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1" }], 1));
    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^profile:/m);
  });
});

/** T1 writes C1 (it holds the block's file and names it), T2 consumes C1 with
 *  no dependency on T1 - it would run beside its own writer. */
const CONSUMER_WITHOUT_WRITER: TaskFields[] = [
  { id: "T1", uses: "C1", files: "src/login.ts" },
  { id: "T2", covers: "AC2", uses: "C1", files: "src/reject.ts" },
];

test("a task using a contract block whose lower-numbered writer is not among its dependencies exits 4, naming both tasks (it would run beside the code it calls)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(CONSUMER_WITHOUT_WRITER, 2, ownedContract("src/login.ts")));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /task T2 uses C1, written by T1, but has no dependency path to T1/);
  });
});

test("a consumer with no dependency on its writer still decomposes under --split (a plan landed before the rule is frozen)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(CONSUMER_WITHOUT_WRITER, 2, ownedContract("src/login.ts")));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);
  });
});

test("a consumer reaching its writer through another task validates (a transitive dependency already orders the two)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", uses: "C1", files: "src/login.ts" },
          { id: "T2", covers: "AC2", uses: "none", deps: "T1", files: "src/session.ts" },
          { id: "T3", uses: "C1", deps: "T2", files: "src/reject.ts" },
        ],
        2,
        ownedContract("src/login.ts"),
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("two tasks using a block on File: none need no dependency between them (such a block has no writer)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody([
        { id: "T1", files: "src/login.ts" },
        { id: "T2", covers: "AC2", files: "src/reject.ts" },
      ]),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a consumer numbered below its only writer raises nothing from the dependency rule (no lower-numbered writer exists)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", uses: "C1", files: "src/reject.ts" },
          { id: "T2", covers: "AC2", uses: "C1", files: "src/login.ts" },
        ],
        2,
        ownedContract("src/login.ts"),
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

/** T1 writes src/login.ts; T2 numbered above it names that path where `reader`
 *  sets it, and depends on T1 only through `deps`. */
function readAfterPlan(reader: Pick<TaskFields, "verification" | "delivers" | "dod">, deps = "none"): string {
  return planBody(
    [
      { id: "T1", files: "src/login.ts" },
      { id: "T2", covers: "AC2", uses: "none", deps, files: "src/reject.ts", ...reader },
    ],
    2,
    CONTRACT,
  );
}

const READ_AFTER_MESSAGE =
  /task T2 reads src\/login\.ts, listed by T1, but has no dependency path to T1 - add T1 to its Depends-on/;

test("read-after: a Verification naming a file a lower-numbered task lists, with no dependency path to it, exits 4 naming reader, path and writer", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, readAfterPlan({ verification: "node --test src/login.ts -> green" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, READ_AFTER_MESSAGE);
  });
});

test("read-after: a DoD naming such a file inside backticks exits 4 as well (the backticks only wrap the token)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, readAfterPlan({ dod: "it reads `src/login.ts`" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.match(result.stderr, READ_AFTER_MESSAGE);
  });
});

test("read-after: a path closed by a sentence period still counts", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, readAfterPlan({ dod: "the handler in src/login.ts. It works" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.match(result.stderr, READ_AFTER_MESSAGE);
  });
});

test("read-after: the reader depending on the writer directly validates", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, readAfterPlan({ verification: "node --test src/login.ts -> green" }, "T1"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("read-after: the reader reaching the writer through another task validates", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", files: "src/login.ts" },
          { id: "T2", covers: "AC2", uses: "none", deps: "T1", files: "src/session.ts" },
          { id: "T3", uses: "none", deps: "T2", files: "src/reject.ts", dod: "it reads `src/login.ts`" },
        ],
        2,
        CONTRACT,
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("read-after: a Delivers naming a file a lower-numbered task lists, with no dependency path to it, exits 4 naming reader, path and writer", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, readAfterPlan({ delivers: "the handler in src/login.ts" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.match(result.stderr, READ_AFTER_MESSAGE);
  });
});

test("read-after: the same Delivers with a Depends-on to the writer validates", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, readAfterPlan({ delivers: "the handler in src/login.ts" }, "T1"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

/** T1 names `src/new.ts` where `reader` sets it; T2 and T3 list it, so only later
 *  tasks create it. */
function forwardPlan(reader: Pick<TaskFields, "verification" | "delivers" | "dod">, t1Files = "src/reject.ts"): string {
  return planBody(
    [
      { id: "T1", files: t1Files, ...reader },
      { id: "T2", covers: "AC2", uses: "none", files: "src/new.ts" },
      { id: "T3", uses: "none", deps: "T2", files: "src/new.ts" },
    ],
    2,
    CONTRACT,
  );
}

const FORWARD_MESSAGE =
  "error: task T1 reads src/new.ts, which only the later task T2 creates - move the reading after T2 (Read after)";

const FORWARD_FIELDS: [string, Pick<TaskFields, "verification" | "delivers" | "dod">][] = [
  ["Verification", { verification: "node --test src/new.ts -> green" }],
  ["Delivers", { delivers: "the helper in src/new.ts" }],
  ["DoD", { dod: "it reads `src/new.ts`" }],
];

for (const [field, reader] of FORWARD_FIELDS) {
  test(`read-after: a ${field} naming a file absent from the tree that only later tasks list exits 4 naming the reader, the path and the lowest-numbered lister`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, forwardPlan(reader));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 4, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.ok(result.stderr.includes(FORWARD_MESSAGE), result.stderr);
      assert.ok(!result.stderr.includes("src/new.ts, listed by"), result.stderr);
    });
  });
}

test("read-after: the forward case names a path once per task however many later tasks list it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, forwardPlan({ dod: "it reads `src/new.ts` and src/new.ts again" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stderr.split(FORWARD_MESSAGE).length - 1, 1, result.stderr);
  });
});

test("read-after: the forward case passes a path the tree already holds", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, forwardPlan({ dod: "it reads `src/new.ts`" }));
    write(dir, "src/new.ts", "export {};\n");

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("read-after: the forward case passes a path the reading task lists itself", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", files: "src/reject.ts,src/new.ts", dod: "it reads `src/new.ts`" },
          { id: "T2", covers: "AC2", uses: "none", deps: "T1", files: "src/new.ts" },
        ],
        2,
        CONTRACT,
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("read-after: a decision record task, every Files path under docs/adr/, may name in Delivers paths other tasks list", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", files: "docs/adr/0001-login.md", delivers: "the record of the handler in src/login.ts" },
          { id: "T2", covers: "AC2", uses: "none", files: "src/login.ts" },
        ],
        2,
        CONTRACT,
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("read-after: a Delivers naming a listed file is still caught when one Files path lies outside docs/adr/", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", files: "docs/adr/0001-login.md,src/record.ts", delivers: "the record of the handler in src/login.ts" },
          { id: "T2", covers: "AC2", uses: "none", files: "src/login.ts" },
        ],
        2,
        CONTRACT,
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.ok(result.stderr.includes("error: task T1 reads src/login.ts, which only the later task T2 creates - move the reading after T2 (Read after)"), result.stderr);
  });
});

const LANDED_DEFECTS: [string, () => string][] = [
  ["forward", () => forwardPlan({ dod: "it reads `src/new.ts`" })],
  ["Delivers", () => readAfterPlan({ delivers: "the handler in src/login.ts" })],
];

for (const [defect, plan] of LANDED_DEFECTS) {
  test(`read-after: a landed plan with the ${defect} defect validates (status.md beside it)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, plan());
      seedStatus(dir, { done: "none" });

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });
}

test("read-after: a token that is only the tail of a listed path raises nothing (a.ts inside src/a.ts)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, readAfterPlan({ dod: "it reads login.ts" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("read-after: a listed path that is only the head of a longer token raises nothing (src/a.ts inside src/a.tsx)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, readAfterPlan({ dod: "it reads src/login.tsx" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("read-after: under --split the check does not run (a frozen plan still decomposes)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, readAfterPlan({ dod: "it reads `src/login.ts`" }));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);
  });
});

test("read-after: a plain call on a plan with status.md beside it validates the same plan under the --split exemptions (a landed plan is frozen)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, readAfterPlan({ verification: "node --test src/login.ts -> green" }));
    seedStatus(dir, { done: "none" });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^tasks: /m);
  });
});

test("read-after: the same plan with no status.md beside it still exits 4 naming the rule (a fresh plan keeps every rule)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, readAfterPlan({ verification: "node --test src/login.ts -> green" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.match(result.stderr, READ_AFTER_MESSAGE);
  });
});

test("read-after: the header's exit-4 list names the case", () => {
  const source = fs.readFileSync(SUT, "utf-8");
  assert.match(source, /read-after: a "Verification:", "Delivers:" or "DoD:" line naming/);
});

/** One task writing `files`, whose Verification is `verification`: the shape the
 *  integration test check reads. */
function integrationPlan(files: string, verification: string): string {
  return planBody([{ id: "T1", files, verification }], 1);
}

const STORE_TEST = "backend/A.IntegrationTests/StoreTests.cs";
const STORE_PROJECT = "backend/A.IntegrationTests/A.IntegrationTests.csproj";
const INTEGRATION_MESSAGE = `error: task T1: Files writes ${STORE_TEST} under an integration test directory, which no Verification command names - list or type-check that file or its test project there (Layered)`;

test("integration check: a task writing a file under an integration test directory whose Verification names neither it nor a directory of it exits 4 with the Layered error", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, integrationPlan(STORE_TEST, "dotnet test backend/Other/Other.csproj -> green"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.includes(INTEGRATION_MESSAGE), result.stderr);
  });
});

test("integration check: a Verification building the test project under that directory validates", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, integrationPlan(STORE_TEST, `dotnet build ${STORE_PROJECT} -> green`));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("integration check: a Verification naming the file itself validates", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, integrationPlan(STORE_TEST, `dotnet test ${STORE_TEST} --list-tests -> lists them`));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("integration check: a Verification naming the test directory itself validates", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, integrationPlan(STORE_TEST, "dotnet test backend/A.IntegrationTests/ --list-tests -> lists them"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("integration check: a Verification naming only a directory above the test directory exits 4", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, integrationPlan(STORE_TEST, "dotnet test backend -> green"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.ok(result.stderr.includes(INTEGRATION_MESSAGE), result.stderr);
  });
});

for (const [label, verification] of [
  ["grep", `grep -c Store ${STORE_TEST} src/Store.cs -> 2`],
  ["git grep", `git grep -c Store -- ${STORE_TEST} -> 1`],
  ["rg", `rg -c Store ${STORE_TEST} -> 1`],
  ["a grep after a pipe", `dotnet test src/Store.csproj | grep Store ${STORE_TEST} -> 1`],
  ["a grep after a semicolon", `dotnet test src/Store.csproj ; grep -c Store ${STORE_TEST} -> 1`],
  ["a grep after a comma", `dotnet test src/Store.csproj, grep -c Store ${STORE_TEST} -> 1`],
  ["a grep after &&", `dotnet test src/Store.csproj && grep -c Store ${STORE_TEST} -> 1`],
  ["a grep after ||", `dotnet test src/Store.csproj || grep -c Store ${STORE_TEST} -> 1`],
] as const) {
  test(`integration check: ${label} naming the file never counts as naming it, so the task exits 4`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, integrationPlan(STORE_TEST, verification));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 4, `stderr: ${result.stderr}`);
      assert.ok(result.stderr.includes(INTEGRATION_MESSAGE), result.stderr);
    });
  });
}

test("integration check: a build command after a grep, split at &&, still names the file", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, integrationPlan(STORE_TEST, `grep -c Store src/Store.cs && dotnet build ${STORE_PROJECT} -> green`));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

for (const file of [
  "tests/integration/store.test.ts",
  "backend/Store.Integration_Tests/store.cs",
  "backend/store-integrationtest/store.cs",
  "src/store.integration.test.ts",
]) {
  test(`integration check: ${file} is checked, and a Verification not naming it exits 4`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, integrationPlan(file, "npm test -> green"));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 4, `stderr: ${result.stderr}`);
      assert.ok(result.stderr.includes(`error: task T1: Files writes ${file} under an integration test directory`), result.stderr);
    });
  });
}

test("integration check: a Verification naming a file of an integration directory by its path validates", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, integrationPlan("tests/integration/store.test.ts", "node --test tests/integration/store.test.ts -> lists"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

for (const file of ["docs/third-party-integrations.md", "viber/references/integration-tests.md"]) {
  test(`integration check: ${file}, whose file name alone matches, is not checked`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, integrationPlan(file, "npm test -> green"));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });
}

test("integration check: under --split the check does not run", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, integrationPlan(STORE_TEST, "npm test -> green"));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("integration check: under --extra the check does not run", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, integrationPlan(STORE_TEST, "npm test -> green"));

    const result = await run(dir, {}, [PLAN_REL, "--extra", "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("integration check: a plain call with status.md beside the plan does not run it (a landed plan is frozen)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, integrationPlan(STORE_TEST, "npm test -> green"));
    seedStatus(dir, { done: "none" });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

const NEW_TOOL = "tools/new.ts";
const GIT_GREP_MESSAGE = `error: task T1: Verification runs git grep without --untracked over ${NEW_TOOL}, which this task creates and git grep never reads - add --untracked or use grep (Provable)`;

for (const [label, verification] of [
  ["a git grep with a pathspec after --", `git grep -c readRuns -- ${NEW_TOOL} -> 1`],
  ["a git grep with the path as a plain argument", `git grep -c readRuns ${NEW_TOOL} -> 1`],
  ["a git grep chained after &&", `npm test && git grep -c readRuns -- ${NEW_TOOL} -> 1`],
  ["a git grep after a pipe", `npm test | git grep -c readRuns -- ${NEW_TOOL} -> 1`],
] as const) {
  test(`git grep check: ${label} over a file the tree lacks exits 4 with the Provable error`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, planBody([{ id: "T1", files: NEW_TOOL, verification }], 1));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 4, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.ok(result.stderr.includes(GIT_GREP_MESSAGE), result.stderr);
    });
  });
}

for (const [label, verification] of [
  ["git grep with --untracked", `git grep --untracked -c readRuns -- ${NEW_TOOL} -> 1`],
  ["git grep with --untracked after the pattern", `git grep -c readRuns --untracked -- ${NEW_TOOL} -> 1`],
  ["plain grep", `grep -c readRuns ${NEW_TOOL} -> 1`],
] as const) {
  test(`git grep check: ${label} over a file the tree lacks validates`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, planBody([{ id: "T1", files: NEW_TOOL, verification }], 1));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });
}

test("git grep check: a git grep over a path the tree already holds validates", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    write(dir, NEW_TOOL, "export const readRuns = 1;\n");
    seed(dir, planBody([{ id: "T1", files: NEW_TOOL, verification: `git grep -c readRuns -- ${NEW_TOOL} -> 1` }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("git grep check: a git grep naming no path of the task's Files is not checked", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", files: "src/a.ts", verification: `git grep -c readRuns -- ${NEW_TOOL} -> 1` }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("git grep check: under --split the check does not run", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", files: NEW_TOOL, verification: `git grep -c readRuns -- ${NEW_TOOL} -> 1` }], 1));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("git grep check: under --extra the check does not run", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", files: NEW_TOOL, verification: `git grep -c readRuns -- ${NEW_TOOL} -> 1` }], 1));

    const result = await run(dir, {}, [PLAN_REL, "--extra", "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("git grep check: a plain call with status.md beside the plan does not run it (a landed plan is frozen)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", files: NEW_TOOL, verification: `git grep -c readRuns -- ${NEW_TOOL} -> 1` }], 1));
    seedStatus(dir, { done: "none" });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

const PROVABLE_TAIL = "run a project test or script instead (Provable)";
const BAD_VERIFICATIONS: [string, string, string][] = [
  ["wrapped in backticks", "`npm test` -> green", "error: task T1: Verification is wrapped in backticks - write the command bare (Provable)"],
  ["running node -e", "node -e \"process.exit(0)\" -> green", `error: task T1: Verification runs inline interpreter code "node -e" - ${PROVABLE_TAIL}`],
  ["running python -c", "python -c \"print(1)\" -> green", `error: task T1: Verification runs inline interpreter code "python -c" - ${PROVABLE_TAIL}`],
  ["running python3 -c", "python3 -c \"print(1)\" -> green", `error: task T1: Verification runs inline interpreter code "python3 -c" - ${PROVABLE_TAIL}`],
  ["running ruby -e", "ruby -e \"puts 1\" -> green", `error: task T1: Verification runs inline interpreter code "ruby -e" - ${PROVABLE_TAIL}`],
  ["running perl -e", "perl -e \"print 1\" -> green", `error: task T1: Verification runs inline interpreter code "perl -e" - ${PROVABLE_TAIL}`],
  ["running an interpreter after an option and a chain", "npm test && node --no-warnings -e \"1\" -> green", `error: task T1: Verification runs inline interpreter code "node -e" - ${PROVABLE_TAIL}`],
  ["running bash on a .temp/ script", "bash .temp/run.sh -> green", `error: task T1: Verification runs .temp/run.sh under .temp/ - ${PROVABLE_TAIL}`],
  ["running a .temp/ script as the command word", "./.temp/run.sh -> green", `error: task T1: Verification runs ./.temp/run.sh under .temp/ - ${PROVABLE_TAIL}`],
  ["running node on a .temp/ script after an option", "node --no-warnings .temp/run.mjs -> green", `error: task T1: Verification runs .temp/run.mjs under .temp/ - ${PROVABLE_TAIL}`],
];

for (const [label, verification, message] of BAD_VERIFICATIONS) {
  test(`Provable check: a Verification ${label} on a fresh plan exits 4 with its C1 error and nothing on stdout`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, planBody([{ id: "T1", verification }], 1));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 4, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.ok(result.stderr.includes(message), result.stderr);
    });
  });

  test(`Provable check: a Verification ${label} exits 0 under --split`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, planBody([{ id: "T1", verification }], 1));

      const result = await run(dir, {}, [PLAN_REL, "--split"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });

  test(`Provable check: a Verification ${label} exits 0 as a landed plan with status.md beside it`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, planBody([{ id: "T1", verification }], 1));
      seedStatus(dir, { done: "none" });

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });
}

for (const [label, verification] of [
  ["a project test run", "node --test tests/a.test.ts -> green"],
  ["a grep quoting an interpreter option", "grep -c 'node -e' docs/a.md -> 1"],
  ["a grep quoting an interpreter option after a semicolon", "grep -c 'a; node -e' docs/a.md -> 1"],
  ["a test run redirecting its output under .temp/", "node --test x > .temp/log -> green"],
  ["a grep over a file under .temp/", "grep x .temp/a.md -> 1"],
  ["a test run with an environment prefix and no inline code", "CI=true node --test x -> green"],
] as const) {
  test(`Provable check: ${label} as a Verification validates on a fresh plan`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, planBody([{ id: "T1", verification }], 1));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });
}

const MEMORY_ON = ["schema: 1", "build:", "  memory: true", ""].join("\n");
const MEMORY_OFF = ["schema: 1", "build:", "  memory: false", ""].join("\n");

function memoryMessage(file: string): string {
  return `error: task T1: Files lists ${file} while build.memory is on - drop it, the build close updates every CLAUDE.md (Memory-owned)`;
}

for (const file of ["src/CLAUDE.md", "CLAUDE.md", "./src/CLAUDE.md"]) {
  test(`Memory-owned check: ${file} in Files on a fresh plan with build.memory on exits 4 with the C1 error and nothing on stdout`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      write(dir, ".claude/viber.yml", MEMORY_ON);
      seed(dir, planBody([{ id: "T1", files: `src/a.ts, ${file}` }], 1));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 4, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.ok(result.stderr.includes(memoryMessage(file.replace(/^\.\//, ""))), result.stderr);
    });
  });
}

for (const file of ["docs/CLAUDE-notes.md", "viber/scripts/CLAUDE.run-scripts.md", "src/NOTCLAUDE.md"]) {
  test(`Memory-owned check: ${file} in Files with build.memory on exits 0 (only a file named CLAUDE.md is owned by the close)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      write(dir, ".claude/viber.yml", MEMORY_ON);
      seed(dir, planBody([{ id: "T1", files: `src/a.ts, ${file}` }], 1));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });
}

test("Memory-owned check: a CLAUDE.md in Files exits 0 with build.memory false", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    write(dir, ".claude/viber.yml", MEMORY_OFF);
    seed(dir, planBody([{ id: "T1", files: "src/a.ts, src/CLAUDE.md" }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("Memory-owned check: a CLAUDE.md in Files exits 0 with no .claude/viber.yml", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", files: "src/a.ts, src/CLAUDE.md" }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

for (const [label, config] of [
  ["at column 0", "memory: true\n"],
  ["under another group", ["planning:", "  memory: true", ""].join("\n")],
]) {
  test(`Memory-owned check: memory: true ${label} exits 0 (the build.memory line config.sh prints decides)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      write(dir, ".claude/viber.yml", config);
      seed(dir, planBody([{ id: "T1", files: "src/a.ts, src/CLAUDE.md" }], 1));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });
}

test("Memory-owned check: a landed plan with status.md beside it and a CLAUDE.md in Files exits 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    write(dir, ".claude/viber.yml", MEMORY_ON);
    seed(dir, planBody([{ id: "T1", files: "src/a.ts, src/CLAUDE.md" }], 1));
    seedStatus(dir, { done: "none" });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("Memory-owned check: a CLAUDE.md in Files exits 0 under --split with build.memory on", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    write(dir, ".claude/viber.yml", MEMORY_ON);
    seed(dir, planBody([{ id: "T1", files: "src/a.ts, src/CLAUDE.md" }], 1));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("Memory-owned check: the switch is read in the caller's cwd, so a plan file outside it still gets the check", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    await withTempDir("p2p2-viber-plan-", async (outside) => {
      write(dir, ".claude/viber.yml", MEMORY_ON);
      const planFile = path.join(outside, "plan.md");
      fs.writeFileSync(planFile, planBody([{ id: "T1", files: "src/a.ts, src/CLAUDE.md" }], 1));

      const result = await run(dir, {}, [planFile]);
      assert.equal(result.status, 4, `stderr: ${result.stderr}`);
      assert.ok(result.stderr.includes(memoryMessage("src/CLAUDE.md")), result.stderr);
    });
  });
});

/** `body` under a frontmatter carrying an `attachments:` map of the given entry lines. */
function withMap(body: string, entries: string[]): string {
  return ["---", "source: .temp/plan.md", "attachments:", ...entries, "---", body].join("\n");
}

for (const name of ["my file.png", "-a.png"]) {
  test(`Attachments check: a map entry named "${name}" on a fresh plan exits 4 with the C1 invalid name error naming it and nothing on stdout`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, withMap(planBody([{ id: "T1" }], 1), [`  ${name}: .temp/x.png`]));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 4, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.ok(
        result.stderr.includes(
          `error: attachments: name "${name}" is not one path component of letters, digits, _, . and - opening on a letter or digit - rename it (Attachments)`,
        ),
        result.stderr,
      );
    });
  });
}

test("Attachments check: entries a.png and A.png exit 4 with the C1 repeat error naming A.png", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, withMap(planBody([{ id: "T1" }], 1), ["  a.png: .temp/a.png", "  A.png: .temp/b.png"]));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.ok(
      result.stderr.includes('error: attachments: name "A.png" repeats an earlier one - rename one of them (Attachments)'),
      result.stderr,
    );
  });
});

test("Attachments check: a DoD naming attachments/b.png with no b.png entry exits 4 with the C1 DoD error", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, withMap(planBody([{ id: "T1", dod: "the page matches attachments/b.png" }], 1), ["  a.png: .temp/a.png"]));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.ok(
      result.stderr.includes(
        "error: task T1: DoD names attachments/b.png, absent from the attachments map - add a b.png entry or drop the reference (Attachments)",
      ),
      result.stderr,
    );
  });
});

for (const [label, dod] of [
  ["a file entry", "the page matches `attachments/a.png`."],
  ["a directory entry named with its trailing slash", "the page matches attachments/mock/ closely"],
  ["a file inside a directory entry", "the page matches attachments/mock/home.png"],
] as const) {
  test(`Attachments check: a DoD naming ${label} the map holds exits 0`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, withMap(planBody([{ id: "T1", dod }], 1), ["  a.png: .temp/a.png", "  mock: .temp/mock"]));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });
}

test("Attachments check: a plan with no frontmatter exits 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", dod: "the page matches attachments/b.png" }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("Attachments check: a frontmatter with no attachments key exits 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, ["---", "source: .temp/plan.md", "---", planBody([{ id: "T1", dod: "the page matches attachments/b.png" }], 1)].join("\n"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("Attachments check: a landed plan with status.md beside it and a bad map exits 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, withMap(planBody([{ id: "T1" }], 1), ["  -a.png: .temp/a.png"]));
    seedStatus(dir, { done: "none" });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("Attachments check: a bad map exits 0 under --split", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, withMap(planBody([{ id: "T1" }], 1), ["  -a.png: .temp/a.png"]));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a File entry whose bracket wraps a whole segment is a path, not a glob - like a Files entry", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const route = "src/app/api/sites/[siteId]/route.ts";
    seed(dir, planBody([{ id: "T1", files: route }], 1, ownedContract(route)));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a File entry that is a glob, a directory or an absolute path exits 4, like a Files entry", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    for (const entry of ["src/*.ts", "src/", "/abs/login.ts", "src/a[bc].ts"]) {
      seed(dir, planBody([{ id: "T1" }], 1, ownedContract(entry)));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 4, `${entry}: ${result.stderr}`);
      assert.match(result.stderr, /must be one bare repo-relative file path/, entry);
    }
  });
});

test("a plan that introduces no shape at all validates with every task on Uses: none", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", uses: "none" }], 1, []));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(readRun(dir, "tasks/T1.md"), /## Contracts/);
  });
});

test("a rejected plan is never decomposed - --split writes nothing when validation fails", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", covers: "AC9" }]));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 4);
    assert.deepEqual(fs.readdirSync(path.join(dir, PLAN_DIR)), ["plan.md"]);
  });
});

// --- the decomposition -----------------------------------------------------

test("--split writes the specification and one file per task, and still prints the index", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^T2 \| todo \| required \| - \| - \| T1 \| - \| src\/reject\.ts \| Reject a bad password$/m);

    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);

    // spec.md is everything ABOVE the task list: WHAT and WHY, no task and -
    // because the appendix sits below the tasks - no contract either.
    const spec = readRun(dir, "spec.md");
    assert.match(spec, /^# Add login$/m);
    assert.match(spec, /^- add - src\/login\.ts - the handler$/m);
    assert.match(spec, /^### Out of scope$/m);
    assert.doesNotMatch(spec, /## Tasks/);
    assert.doesNotMatch(spec, /Add the login handler/);
    assert.doesNotMatch(spec, /## Contracts|POST \/login/);
  });
});

test("spec.md carries neither the frontmatter nor one HTML comment - the run plumbing stops at plan.md", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // The frontmatter is how the implementor finds the plan file again, and a
    // landed plan keeps it. It is the run plumbing, and spec.md outlives the
    // run - archived, the path it names is a plan mode file that is already
    // gone. The legacy comment marker is what a plan written before the key
    // moved carries, and the block comment is what a plan that never went
    // through --land brings with it.
    const body = [
      "---",
      "source: /home/u/.claude/plans/add-login.md",
      "---",
      "",
    ].join("\n") + planBody(TWO_TASKS).replace(
      "# Add login\n",
      [
        "# Add login",
        "",
        "<!-- source: /legacy/plans/add-login.md -->",
        "",
        "Build: skill `implementor`",
        "",
        "<!-- Guidance for whoever writes the plan:",
        "     it spans several lines and ends here. -->",
        "",
      ].join("\n"),
    );
    seed(dir, body);

    const r = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // the title is read off the H1, which the frontmatter above it does not move
    assert.match(r.stdout, /^title: Add login$/m);

    const spec = readRun(dir, "spec.md");
    assert.doesNotMatch(spec, /<!--|^---$|source:/m);
    assert.doesNotMatch(spec, /add-login\.md|Guidance for whoever/);
    // and what the cut leaves behind reads like a document written without any
    // of it: one blank line between kept lines, never two
    assert.match(spec, /^# Add login\n\nBuild: skill `implementor`\n\n## Goal\n/);
    assert.doesNotMatch(spec, /\n\n\n/);
    // the plan itself is untouched - it is the file the run resumes from
    const plan = fs.readFileSync(path.join(dir, PLAN_REL), "utf-8");
    assert.match(plan, /^---\nsource: \/home\/u/m);
  });
});

for (const [fence, other] of [["```", "~~~"], ["~~~", "```"]] as const) {
  test(`spec.md keeps a ${fence} fenced block above ## Tasks whole, its comment and blank lines included, and still cuts the comments outside it (a comment in an example is content, not guidance)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      const block = [
        `${fence}html`,
        "<!-- slot -->",
        "",
        "",
        other,
        "<!-- still inside: the other fence character closes nothing -->",
        `${fence}`,
      ].join("\n");
      seed(
        dir,
        planBody(TWO_TASKS).replace(
          "## Scope\n",
          ["<!-- guidance above the example -->", "", block, "", "## Scope", ""].join("\n"),
        ),
      );

      const r = await run(dir, {}, [PLAN_REL, "--split"]);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);

      const spec = readRun(dir, "spec.md");
      assert.ok(spec.includes(`\n\n${block}\n\n## Scope\n`), spec);
      assert.doesNotMatch(spec, /guidance above the example/);
    });
  });
}

test("spec.md still loses a comment opened outside any fence whole, a fence line inside it included (a fence inside guidance opens nothing)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(TWO_TASKS).replace(
        "## Scope\n",
        ["<!-- guidance that runs on", "```", "an example inside the guidance", "-->", "", "## Scope", ""].join("\n"),
      ),
    );

    const r = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const spec = readRun(dir, "spec.md");
    assert.match(spec, /^2\. An invalid password is rejected\.\n\n## Scope\n/m);
    assert.doesNotMatch(spec, /guidance that runs on|```|an example inside/);
  });
});

// --- headings inside a code fence are body text -------------------------------

/** A contract whose shape is a fenced report skeleton: three heading lines that
 *  are example text, with the closing fence after them. */
const FENCED_SHAPE = ["```md", "# Report", "", "## Findings", "", "## Coverage notes", "```"];

test("a contract whose fenced shape holds # Report, ## Findings and ## Coverage notes reaches tasks/T1.md whole, closing fence included", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS, 2, ["### C1 - Report shape", "", "File: none", "", ...FENCED_SHAPE]));

    const r = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const t1 = readRun(dir, "tasks/T1.md");
    assert.ok(t1.includes(`### C1 - Report shape\n\nFile: none\n\n${FENCED_SHAPE.join("\n")}\n`), t1);
  });
});

test("a second contract after a fenced shape holding ## headings is recognized, so a plan whose task uses it validates", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const contracts = [
      "### C1 - Report shape",
      "",
      "File: none",
      "",
      ...FENCED_SHAPE,
      "",
      "### C2 - Login endpoint",
      "",
      "File: none",
      "",
      "POST /login -> 200 | 401",
    ];
    seed(dir, planBody([{ ...TWO_TASKS[0], uses: "C1" }, { ...TWO_TASKS[1], uses: "C2" }], 2, contracts));

    const r = await run(dir, {}, [PLAN_REL]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });
});

/** A four-backtick block quoting a three-backtick line and a heading-looking line:
 *  only the bare four-backtick line ends it. */
const LONG_FENCE = ["````md", "```", "## Quoted heading", "````"];

test("a Current behaviour holding a four-backtick block with a bare three-backtick line inside keeps Must not change in tasks/T1.md after --split", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(TWO_TASKS, 2, CONTRACT, "full").replace(
        "Every page is public.\n",
        ["Every page is public.", "", ...LONG_FENCE, ""].join("\n"),
      ),
    );

    const r = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    assert.match(
      readRun(dir, "tasks/T1.md"),
      /\n## Must not change\n- The public catalogue stays reachable without an account\.\n/,
    );
  });
});

test("a contract block after a four-backtick contract shape holding a bare three-backtick line is found by its task Uses", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const contracts = [
      "### C1 - Report shape",
      "",
      "File: none",
      "",
      ...LONG_FENCE,
      "",
      "### C2 - Login endpoint",
      "",
      "File: none",
      "",
      "POST /login -> 200 | 401",
    ];
    seed(dir, planBody([{ ...TWO_TASKS[0], uses: "C1" }, { ...TWO_TASKS[1], uses: "C2" }], 2, contracts));

    const r = await run(dir, {}, [PLAN_REL]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });
});

test("spec.md keeps the headings following a four-backtick block holding a bare three-backtick line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const block = LONG_FENCE.join("\n");
    seed(
      dir,
      planBody(TWO_TASKS).replace("## Scope\n", [block, "", "## Scope", ""].join("\n")),
    );

    const r = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const spec = readRun(dir, "spec.md");
    assert.ok(spec.includes(`\n\n${block}\n\n## Scope\n\n### File map\n`), spec);
  });
});

test("a fenced example opening ## Tasks above the real heading leaves spec.md its Acceptance criteria and Scope and every task file its Covered criteria", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(TWO_TASKS).replace(
        "## Acceptance criteria\n",
        ["```md", "## Tasks", "```", "", "## Acceptance criteria", ""].join("\n"),
      ),
    );

    const r = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const spec = readRun(dir, "spec.md");
    assert.match(spec, /^## Acceptance criteria\n/m);
    assert.match(spec, /^## Scope\n/m);
    assert.match(readRun(dir, "tasks/T1.md"), /\n## Covered criteria\n1\. A user with valid credentials gets a session\./);
    assert.match(readRun(dir, "tasks/T2.md"), /\n## Covered criteria\n2\. An invalid password is rejected\./);
  });
});

test("a plan frontmatter issue: line makes spec.md open with its own three-line frontmatter, then the specification as today", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // source rides the plan for the run's own plumbing; issue is the
    // one key the archive keeps, so it alone survives into spec.md
    const body = [
      "---",
      "source: /home/u/.claude/plans/add-login.md",
      "issue: https://github.com/acme/widgets/issues/42",
      "---",
      "",
    ].join("\n") + planBody(TWO_TASKS);
    seed(dir, body);

    const r = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const spec = readRun(dir, "spec.md");
    assert.match(spec, /^---\nissue: https:\/\/github\.com\/acme\/widgets\/issues\/42\n---\n\n# Add login\n/);
    assert.doesNotMatch(spec, /source:/);
    // no doubled blank line where the frontmatter meets the specification
    assert.doesNotMatch(spec, /\n\n\n/);
  });
});

test("a plan frontmatter with no issue: line, or an empty one, reaches spec.md exactly as a plan with no frontmatter at all", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const withoutIssue = planBody(TWO_TASKS);
    seed(dir, withoutIssue);
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);
    const baseline = readRun(dir, "spec.md");

    const emptyIssue = ["---", "source: /home/u/plans/add-login.md", "issue:", "---", ""].join("\n") + withoutIssue;
    seed(dir, emptyIssue);
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);
    assert.equal(readRun(dir, "spec.md"), baseline);
  });
});

test("<!-- TASK --> blocks under no \"## Tasks\" heading are refused, not silently left out of the decomposition", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // The cut is that heading, so without it the whole task half rides into
    // spec.md and tasks/ comes out empty - while the index still lists every
    // task, which sends the orchestrator after a task file that was never
    // written. A translated or renamed heading is the way it happens.
    seed(dir, planBody(TWO_TASKS).replace("## Tasks", "## Zadania"));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 4);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /no "## Tasks" heading/);
    assert.deepEqual(fs.readdirSync(path.join(dir, PLAN_DIR)), ["plan.md"]);
  });
});

test("a task file carries its own block verbatim, the text of the criteria it covers, and no other task", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);

    const t1 = readRun(dir, "tasks/T1.md");
    assert.match(t1, /^### T1 - Add the login handler$/m);
    assert.match(t1, /^- Files: src\/login\.ts$/m);
    assert.match(t1, /^- DoD\.1: it works$/m);
    assert.doesNotMatch(t1, /<!-- TASK -->/);
    // the neighbour, its file and its title stay out of this context entirely
    assert.doesNotMatch(t1, /T2|Reject a bad password|src\/reject\.ts/);

    // the covered criterion arrives whole, continuation line included
    assert.match(
      t1,
      /^## Covered criteria\n1\. A user with valid credentials gets a session\.\n {3}The session survives a reload\.$/m,
    );
    assert.doesNotMatch(t1, /An invalid password is rejected/);

    assert.match(readRun(dir, "tasks/T2.md"), /^## Covered criteria\n2\. An invalid password is rejected\.$/m);
  });
});

test("the DoD is cut into one numbered line per semicolon clause, and the plan keeps the single line it was written as", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const body = planBody([
      { ...TWO_TASKS[0]!, dod: "the endpoint answers 200;  a bad password answers 401 ; " },
      TWO_TASKS[1]!,
    ]);
    seed(dir, body);
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);

    // a coder answers for each clause and a reviewer gates each one, which the
    // one sentence carrying all of them does not allow
    const t1 = readRun(dir, "tasks/T1.md");
    assert.match(t1, /^- DoD\.1: the endpoint answers 200$/m);
    assert.match(t1, /^- DoD\.2: a bad password answers 401$/m);
    // the empty trailing clause is dropped, so the numbers stay contiguous and
    // both sides cite the same one
    assert.doesNotMatch(t1, /^- DoD\.3:/m);
    assert.doesNotMatch(t1, /^- DoD: /m);

    // no semicolon is still one numbered clause, not an unnumbered line
    assert.match(readRun(dir, "tasks/T2.md"), /^- DoD\.1: it works$/m);

    // the decomposition is the only place the DoD is cut
    assert.equal(fs.readFileSync(path.join(dir, PLAN_REL), "utf-8"), body);
  });
});

test("a semicolon inside a backtick span does not cut the DoD, so a quoted declaration stays whole in the task file", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const quoted = "`color: var(--accent); font-weight: 600`";
    const body = planBody([
      { ...TWO_TASKS[0]!, dod: `the rule ${quoted} is applied; the page renders` },
      TWO_TASKS[1]!,
    ]);
    seed(dir, body);
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);

    const t1 = readRun(dir, "tasks/T1.md");
    assert.match(t1, /^- DoD\.1: the rule `color: var\(--accent\); font-weight: 600` is applied$/m);
    assert.match(t1, /^- DoD\.2: the page renders$/m);
    assert.doesNotMatch(t1, /^- DoD\.3:/m);
  });
});

test("a task file cuts on a semicolon after a backtick span has closed, and an unclosed backtick cuts like text", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const body = planBody([
      { ...TWO_TASKS[0]!, dod: "`a; b` holds; it's one backtick ` here; and done" },
      TWO_TASKS[1]!,
    ]);
    seed(dir, body);
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);

    const t1 = readRun(dir, "tasks/T1.md");
    assert.match(t1, /^- DoD\.1: `a; b` holds$/m);
    assert.match(t1, /^- DoD\.2: it's one backtick ` here$/m);
    assert.match(t1, /^- DoD\.3: and done$/m);
  });
});

test("a task file carries the run's goal and its out-of-scope list, so a coder needs no second file", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);

    for (const id of ["T1", "T2"]) {
      const body = readRun(dir, `tasks/${id}.md`);
      assert.match(body, /^## Goal\nUsers can log in\.\nThe session is durable\.$/m, id);
      assert.match(body, /^## Out of scope\n- Password reset\.\n- OAuth\.$/m, id);
      // the file map is the planner's decomposition artefact and the closing
      // writer's input - never a coder's, which is bounded by its own Files
      assert.doesNotMatch(body, /## Scope|### File map/, id);
    }
  });
});

test("a contract block reaches the tasks whose Uses names it and no others", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);

    // T1 uses C1: the whole block arrives, heading and body
    assert.match(
      readRun(dir, "tasks/T1.md"),
      /^## Contracts\n\n### C1 - Login endpoint\n\nFile: none\n\nPOST \/login -> 200 \| 401\n\nBody: `\{ user, pass \}`$/m,
    );
    // T2 says none: not the section, not one line of the shape
    const t2 = readRun(dir, "tasks/T2.md");
    assert.doesNotMatch(t2, /## Contracts|C1|POST \/login/);
  });
});

// --- the two spec shapes ---------------------------------------------------

/** The four anchors `plan-index.sh` reads out of a plan head. Both spec
 *  templates carry them character for character, which is what lets one script
 *  decompose either shape. */
const ANCHORS = ["## Goal", "## Acceptance criteria", "### File map", "### Out of scope"];

const TEMPLATES = path.resolve(import.meta.dirname, "../../viber/skills/planner/templates");

/** The `## ` and `### ` headings of a decomposed task file, in order. */
function headings(body: string): string[] {
  return body
    .split("\n")
    .filter((l) => /^#{2,3} /.test(l))
    .map((l) => l.trim());
}

test("both spec templates carry the four anchors, so the shape is a choice and never a second script", () => {
  const shapes = ["spec-lite.md", "spec-full.md"].map((name) =>
    fs.readFileSync(path.join(TEMPLATES, name), "utf-8"),
  );
  for (const [index, body] of shapes.entries()) {
    for (const anchor of ANCHORS) {
      assert.ok(
        body.split("\n").some((line) => line === anchor),
        `${index === 0 ? "spec-lite" : "spec-full"}.md is missing the anchor line "${anchor}"`,
      );
    }
  }
  // the fifth anchor is the big shape's alone: it reaches a task file the same
  // way the four do, and its absence from spec-lite is what keeps that shape's
  // task file exactly what it always was
  assert.ok(
    shapes[1]!.split("\n").some((line) => line === "### Must not change"),
    'spec-full.md is missing the anchor line "### Must not change"',
  );
  assert.ok(!shapes[0]!.includes("Must not change"), "spec-lite.md must not carry a regression boundary");

  // the task half is one file for both shapes
  const tasks = fs.readFileSync(path.join(TEMPLATES, "tasks.md"), "utf-8");
  assert.match(tasks, /^## Tasks$/m);
  assert.match(tasks, /^## Contracts$/m);
  assert.ok(!fs.existsSync(path.join(TEMPLATES, "plan.md")), "plan.md was replaced by the three templates");
});

/** A template's `## Roadmap` section, heading included, up to the line before
 *  the next `## ` heading - the span `--split` cuts into roadmap.md. */
function roadmapSection(template: string): string {
  const body = fs.readFileSync(path.join(TEMPLATES, template), "utf-8");
  return body.match(/^## Roadmap\n[\s\S]*?(?=^## )/m)?.[0] ?? "";
}

/** The entry this plan builds, any lines of its own, then a later entry
 *  carrying an indented decision line - what a later part's interview resumes from. */
const ROADMAP_SHAPE = /^\d+\. .+ \(this plan\)\n(?:[ \t]+- .*\n)*\d+\. .+\n[ \t]+- \S/m;

for (const template of ["spec-lite.md", "spec-full.md"]) {
  test(`Roadmap shape: ${template} carries a "(this plan)" entry and a later entry with an indented decision line (a later part's settled decisions would otherwise have no place to survive)`, () => {
    assert.match(roadmapSection(template), ROADMAP_SHAPE);
  });
}

test("Roadmap shape: both spec templates carry the same Roadmap section (one planner rule writes it, whichever shape the plan takes)", () => {
  assert.equal(roadmapSection("spec-full.md"), roadmapSection("spec-lite.md"));
});

/** A task file with the one block only the big shape contributes removed, which
 *  is what makes everything else comparable across the two shapes. */
function stripBoundary(body: string): string {
  return body.replace(/\n## Must not change\n[\s\S]*?(?=\n## Out of scope\n)/, "");
}

test("a plan built from spec-full plus tasks decomposes into the same task file as one built from spec-lite, but for the regression boundary", async () => {
  const files: Record<string, Record<string, string>> = {};
  for (const shape of ["lite", "full"] as const) {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, planBody(TWO_TASKS, 2, CONTRACT, shape));

      const result = await run(dir, {}, [PLAN_REL, "--split"]);
      assert.equal(result.status, 0, `${shape} -> stderr: ${result.stderr}`);
      assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"], shape);

      files[shape] = { T1: readRun(dir, "tasks/T1.md"), T2: readRun(dir, "tasks/T2.md") };
      // every OTHER section the big shape adds is WHAT and WHY: it rides into
      // spec.md, never into a coder's file
      assert.match(readRun(dir, "spec.md"), shape === "full" ? /^## Glossary$/m : /^## Scope$/m, shape);
    });
  }

  for (const id of ["T1", "T2"]) {
    // the regression boundary every coder of the run holds, ahead of the
    // out-of-scope list: the one thing the big shape hands a task file
    assert.match(
      files.full![id]!,
      /\n## Must not change\n- The public catalogue stays reachable without an account\.\n\n## Out of scope\n/,
      id,
    );
    assert.doesNotMatch(files.lite![id]!, /Must not change/, id);
    assert.doesNotMatch(files.lite![id]!, /public catalogue/, id);

    // and nothing else differs by shape
    const full = stripBoundary(files.full![id]!);
    assert.deepEqual(headings(full), headings(files.lite![id]!), `${id} sections differ beyond the boundary`);
    assert.equal(full, files.lite![id], `${id} differs beyond the boundary`);
  }
});

test("a spec-full plan carrying no Must not change section decomposes exactly like spec-lite", async () => {
  const files: Record<string, string> = {};
  for (const shape of ["lite", "full"] as const) {
    await withTempDir("p2p2-viber-", async (dir) => {
      // the big shape with that one section dropped: the script reads an anchor,
      // never a shape, so an absent one contributes nothing rather than failing
      const body = planBody(TWO_TASKS, 2, CONTRACT, shape).replace(
        "### Must not change\n\n- The public catalogue stays reachable without an account.\n\n",
        "",
      );
      assert.ok(shape === "lite" || !body.includes("Must not change"), "the fixture still carries the section");
      seed(dir, body);

      assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0, shape);
      files[shape] = readRun(dir, "tasks/T1.md");
    });
  }
  assert.equal(files.full, files.lite);
});

test("tasks/ is rebuilt from scratch, so a task dropped from the plan leaves no stale file behind", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);
    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);

    seed(dir, planBody([TWO_TASKS[0]!], 1));
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);
    assert.deepEqual(taskFiles(dir), ["T1.md"]);
  });
});

test("--split outside a git repository still decomposes and exits 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    const result = await run(dir, { GIT_CEILING_DIRECTORIES: dir }, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);
  });
});

// --- the decomposition commit ----------------------------------------------

async function subjects(repo: GitRepo): Promise<string[]> {
  return (await repo.git("log", "--format=%s")).stdout.trim().split("\n").filter(Boolean);
}

test("the decomposition is committed with the plan, and nothing outside the run directory rides along", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, "README.md", "seed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    seed(repo.dir, planBody(TWO_TASKS));
    // a change the user has open, and one they already staged: neither is this
    // script's business
    write(repo.dir, "README.md", "edited\n");
    write(repo.dir, "src/other.ts", "staged by the user\n");
    await repo.git("add", "src/other.ts");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    assert.deepEqual(await subjects(repo), [
      "chore(viber): decompose plan 2026-09-20-10-00-00_add-login",
      "seed",
    ]);
    const committed = (await repo
      .git("show", "--name-only", "--format=", "HEAD"))
      .stdout.trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();
    assert.deepEqual(committed, [
      PLAN_REL,
      `${PLAN_DIR}/spec.md`,
      `${PLAN_DIR}/status.md`,
      `${PLAN_DIR}/tasks/T1.md`,
      `${PLAN_DIR}/tasks/T2.md`,
    ].sort());

    // the user's own work is exactly where they left it
    assert.equal(fs.readFileSync(path.join(repo.dir, "README.md"), "utf-8"), "edited\n");
    assert.match((await repo.git("status", "--short")).stdout, /README\.md/);
    assert.match((await repo.git("status", "--short")).stdout, /src\/other\.ts/);
  });
});

test("an untracked work/ trail file beside the plan stays out of the decomposition commit and stays untracked", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, "README.md", "seed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    seed(repo.dir, planBody(TWO_TASKS));
    write(repo.dir, `${PLAN_DIR}/work/T3-notes.md`, "a coder's own trail, not the decomposition\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    const committed = (await repo
      .git("show", "--name-only", "--format=", "HEAD"))
      .stdout.trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();
    assert.deepEqual(committed, [
      PLAN_REL,
      `${PLAN_DIR}/spec.md`,
      `${PLAN_DIR}/status.md`,
      `${PLAN_DIR}/tasks/T1.md`,
      `${PLAN_DIR}/tasks/T2.md`,
    ].sort());
    assert.ok(!committed.includes(`${PLAN_DIR}/work/T3-notes.md`));

    // still on disk, still untracked - never staged, never committed
    assert.equal(
      fs.readFileSync(path.join(repo.dir, `${PLAN_DIR}/work/T3-notes.md`), "utf-8"),
      "a coder's own trail, not the decomposition\n",
    );
    assert.match((await repo.git("status", "--short")).stdout, /\?\? .*work\//);
  });
});

test("a plan tied to an issue gets its decomposition commit footed with Refs: #<N>, and one without an issue gets no footer", async () => {
  const cases: Array<[frontmatter: string[], body: RegExp]> = [
    [["---", "source: /home/u/plans/add-login.md", "issue: https://github.com/acme/widgets/issues/42", "---", ""], /^Refs: #42\n*$/],
    [["---", "source: /home/u/plans/add-login.md", "---", ""], /^\n*$/],
    [["---", "issue: https://github.com/acme/widgets/pull/42", "---", ""], /^\n*$/],
  ];
  for (const [frontmatter, body] of cases) {
    await withGitRepo(async (repo) => {
      write(repo.dir, "README.md", "seed\n");
      await repo.git("add", "-A");
      await repo.git("commit", "-m", "seed");
      seed(repo.dir, frontmatter.join("\n") + planBody(TWO_TASKS));

      const result = await run(repo.dir, repo.env, [PLAN_REL, "--split"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal((await subjects(repo))[0], "chore(viber): decompose plan 2026-09-20-10-00-00_add-login");
      assert.match((await repo.git("log", "-1", "--format=%b")).stdout, body);
    });
  }
});

test("--split writes the run's state file, and a later --split leaves the progress in it untouched", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);
    assert.equal(
      readRun(dir, "status.md"),
      "# status\n\nprogress: 0/2\ndone: none\nskipped: none\nunreviewed: none\ndeferred: none\nclosed: none\n",
    );

    // a resume splits again: the file is the build's progress, never reset by it
    seedStatus(dir, {
      progress: "1/2",
      done: "T1",
      skipped: "none",
      unreviewed: "none",
      deferred: "none",
      closed: "none",
    });
    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);
    assert.match(readRun(dir, "status.md"), /^done: T1$/m);
    assert.match((await run(dir, {}, [PLAN_REL])).stdout, /^progress: 1\/2$/m);
  });
});

// --- the roadmap -----------------------------------------------------------

/** A split change's `## Roadmap` section, placed where both templates put it:
 *  after the goal, before the acceptance criteria. Its guidance comment is the
 *  template's own, which the cut drops. */
const ROADMAP = [
  "## Roadmap",
  "",
  "<!-- Only when the change was split into parts; otherwise drop this section.",
  "     The build cuts it into roadmap.md, never into spec.md. -->",
  "",
  "Part 2 of 3 - Add login",
  "",
  "1. Account model (built)",
  "2. Add login (this plan)",
  "3. Session expiry",
  "   - Idle sessions end after one hour.",
  "",
];

function withRoadmap(body: string): string {
  return body.replace("## Acceptance criteria\n", [...ROADMAP, "## Acceptance criteria", ""].join("\n"));
}

test("--split writes the Roadmap section into roadmap.md, heading included and its HTML comment dropped", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, withRoadmap(planBody(TWO_TASKS)));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      readRun(dir, "roadmap.md"),
      [
        "## Roadmap",
        "",
        "Part 2 of 3 - Add login",
        "",
        "1. Account model (built)",
        "2. Add login (this plan)",
        "3. Session expiry",
        "   - Idle sessions end after one hour.",
        "",
      ].join("\n"),
    );
  });
});

test("--split leaves the Roadmap section out of spec.md, the goal running straight into the acceptance criteria (a later part's decisions are not this part's specification)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, withRoadmap(planBody(TWO_TASKS)));

    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);
    const spec = readRun(dir, "spec.md");
    assert.ok(
      spec.includes("## Goal\n\nUsers can log in.\nThe session is durable.\n\n## Acceptance criteria\n"),
      spec,
    );
    assert.doesNotMatch(spec, /Roadmap|Part 2 of 3|Account model|Session expiry|Idle sessions/);
  });
});

test("roadmap.md is committed with the decomposition", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, "README.md", "seed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");
    seed(repo.dir, withRoadmap(planBody(TWO_TASKS)));

    const result = await run(repo.dir, repo.env, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const committed = (await repo
      .git("show", "--name-only", "--format=", "HEAD"))
      .stdout.trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();
    assert.deepEqual(committed, [
      PLAN_REL,
      `${PLAN_DIR}/roadmap.md`,
      `${PLAN_DIR}/spec.md`,
      `${PLAN_DIR}/status.md`,
      `${PLAN_DIR}/tasks/T1.md`,
      `${PLAN_DIR}/tasks/T2.md`,
    ].sort());
  });
});

test("a plan with no Roadmap section writes no roadmap.md and exactly the spec.md it always did (a change built in one part carries no roadmap)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    assert.equal((await run(dir, {}, [PLAN_REL, "--split"])).status, 0);
    assert.ok(!fs.existsSync(path.join(dir, PLAN_DIR, "roadmap.md")), "roadmap.md was written");
    assert.equal(readRun(dir, "spec.md"), liteHead(2).join("\n"));
  });
});

test("the header names roadmap.md among the files --split writes", () => {
  const source = fs.readFileSync(SUT, "utf-8");
  const splitDoc = source.slice(source.indexOf("# --split writes"), source.indexOf("# Validation"));
  assert.match(splitDoc, /^#\s+roadmap\.md\s+- /m);
});

// --- the attachments ---------------------------------------------------------

/** Where `plan-path.sh --land` copies the files the plan's `attachments:` key names. */
const ATTACH_DIR = `${PLAN_DIR}/attachments`;
const ATTACH_MOCKUP = `${ATTACH_DIR}/prototype.html`;
const ATTACH_FINDINGS = `${ATTACH_DIR}/findings.md`;

async function committedFiles(repo: GitRepo): Promise<string[]> {
  return (await repo.git("show", "--name-only", "--format=", "HEAD")).stdout
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
}

test("--split over a run whose attachments directory holds two files ends spec.md with ## Attachments and both repo-relative paths sorted by name", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    write(dir, ATTACH_MOCKUP, "<!doctype html><title>Login</title>\n");
    write(dir, ATTACH_FINDINGS, "# findings\n");

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      readRun(dir, "spec.md"),
      `${liteHead(2).join("\n")}\n## Attachments\n${ATTACH_FINDINGS}\n${ATTACH_MOCKUP}\n`,
    );
  });
});

test("--split over a run whose attachments directory holds a directory lists it with a trailing slash", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    write(dir, `${ATTACH_DIR}/bench-llm/run.json`, "{}\n");

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(readRun(dir, "spec.md"), `${liteHead(2).join("\n")}\n## Attachments\n${ATTACH_DIR}/bench-llm/\n`);
  });
});

test("--split over a run whose attachments directory is empty ends spec.md exactly where the head ends (no empty ## Attachments section)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    fs.mkdirSync(path.join(dir, ATTACH_DIR), { recursive: true });

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(readRun(dir, "spec.md"), liteHead(2).join("\n"));
  });
});

test("--split over a run with no attachments directory leaves spec.md without a ## Attachments section", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(readRun(dir, "spec.md"), /## Attachments/);
  });
});

test("no task file carries ## Attachments or ## Prototype when the run holds attachments (each task names the file it needs itself)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));
    write(dir, ATTACH_MOCKUP, "<!doctype html><title>Login</title>\n");
    write(dir, ATTACH_FINDINGS, "# findings\n");

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);
    for (const name of taskFiles(dir)) {
      assert.doesNotMatch(readRun(dir, `tasks/${name}`), /## Attachments|## Prototype|prototype\.html|findings\.md/, name);
    }
  });
});

test("no task file carries ## Attachments or ## Prototype when the run holds no attachments", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    for (const name of taskFiles(dir)) {
      assert.doesNotMatch(readRun(dir, `tasks/${name}`), /## Attachments|## Prototype/, name);
    }
  });
});

test("the decomposition commit includes every file under attachments/", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, "README.md", "seed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");
    seed(repo.dir, planBody(TWO_TASKS));
    write(repo.dir, ATTACH_MOCKUP, "<!doctype html><title>Login</title>\n");
    write(repo.dir, ATTACH_FINDINGS, "# findings\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [
      PLAN_REL,
      ATTACH_FINDINGS,
      ATTACH_MOCKUP,
      `${PLAN_DIR}/spec.md`,
      `${PLAN_DIR}/status.md`,
      `${PLAN_DIR}/tasks/T1.md`,
      `${PLAN_DIR}/tasks/T2.md`,
    ].sort());
  });
});

test("--split without attachments commits nothing beyond the decomposition (a run with no attachments reads as it always did)", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, "README.md", "seed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");
    seed(repo.dir, planBody(TWO_TASKS));

    const result = await run(repo.dir, repo.env, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(await committedFiles(repo), [
      PLAN_REL,
      `${PLAN_DIR}/spec.md`,
      `${PLAN_DIR}/status.md`,
      `${PLAN_DIR}/tasks/T1.md`,
      `${PLAN_DIR}/tasks/T2.md`,
    ].sort());
  });
});

/** A plan whose `## Roadmap` lists exactly `entries`, placed like the templates place it. */
function roadmapPlan(entries: string[]): string {
  return planBody(TWO_TASKS).replace(
    "## Acceptance criteria\n",
    ["## Roadmap", "", "Part 1 of 1 - x", "", ...entries, "", "## Acceptance criteria", ""].join("\n"),
  );
}

test("a Roadmap entry after the one marked (this plan) prints the next line between the decision lines and the tasks line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, withRoadmap(planBody(TWO_TASKS)));
    write(dir, `${PLAN_DIR}/status.md`, ["# status", "", "progress: 0/2", "decision: T1: keep the old handler", ""].join("\n"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(
      result.stdout,
      /^decision: T1: keep the old handler\nnext: part 3 of 3 - Session expiry\ntasks: /m,
    );
  });
});

test("the next line strips a trailing marker from the name and counts every numbered entry (a marker is bookkeeping, never part of the part's name)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, roadmapPlan(["1. Account model (this plan)", "2. Session expiry (built)", "3. Audit log"]));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^next: part 2 of 3 - Session expiry\n/m);
  });
});

test("a Roadmap whose (this plan) entry is last prints no next line (nothing is left to interview)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, roadmapPlan(["1. Account model (built)", "2. Add login (this plan)"]));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^next:/m);
  });
});

test("a Roadmap with no (this plan) entry prints no next line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, roadmapPlan(["1. Account model (built)", "2. Add login"]));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^next:/m);
  });
});

test("a plan with no Roadmap prints no next line, the tasks line straight after the state lines", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody(TWO_TASKS));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^next:/m);
  });
});

test("a numbered line outside the Roadmap section is no entry (a later section's list names no part)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, roadmapPlan(["1. Add login (this plan)"]).replace("- Password reset.\n", "2. Session expiry\n- Password reset.\n"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.doesNotMatch(result.stdout, /^next:/m);
  });
});

test("the header's stdout block lists the next line", () => {
  const source = fs.readFileSync(SUT, "utf-8");
  const stdoutDoc = source.slice(source.indexOf("# stdout"), source.indexOf("# \"feeds\""));
  assert.match(stdoutDoc, /^#\s+next: part <n> of <N> - <name>/m);
});

test("a second --split with the plan unchanged commits nothing and still exits 0", async () => {
  await withGitRepo(async (repo) => {
    seed(repo.dir, planBody(TWO_TASKS));
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    assert.equal((await run(repo.dir, repo.env, [PLAN_REL, "--split"])).status, 0);
    const after = await subjects(repo);
    assert.equal((await run(repo.dir, repo.env, [PLAN_REL, "--split"])).status, 0);
    assert.deepEqual(await subjects(repo), after);
  });
});

test("a DoD line naming another task's id outside backticks exits 4 with the C1 line and nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", files: "src/a.ts" },
          {
            id: "T2",
            covers: "AC1",
            uses: "none",
            deps: "T1",
            files: "src/b.ts",
            dod: "proven by T1",
          },
        ],
        1,
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /task T2: DoD names task T1 - prove each clause inside this task, naming a file or symbol instead/,
    );
  });
});

/** `count` distinct paths, joined as one Files value. */
function manyFiles(count: number): string {
  return Array.from({ length: count }, (_, k) => `src/f${k + 1}.ts`).join(", ");
}

/** `count` clauses, joined as one DoD value, with one empty clause the count skips. */
function manyClauses(count: number): string {
  return [...Array.from({ length: count }, (_, k) => `case ${k + 1} holds`), " "].join("; ");
}

test("a TDD: required task at 12 Files and 6 DoD clauses exits 0 (the caps are inclusive, and an empty clause counts as none)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", files: manyFiles(12), dod: manyClauses(6) }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a TDD: required task with 6 DoD clauses, one quoting a semicolon in backticks, exits 0 (the span is not a cut)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const dod = `${manyClauses(5)}; keeps \`color: var(--accent); font-weight: 600\` whole`;
    seed(dir, planBody([{ id: "T1", dod }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a TDD: required task with 13 Files exits 4 naming the count and nothing on stdout (one behaviour per task)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", files: manyFiles(13) }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /task T1: 13 Files, past the 12 a TDD: required task may hold - split it, one behaviour per task/);
  });
});

test("a TDD: required task with 7 DoD clauses exits 4 naming the count and nothing on stdout (one behaviour per task)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", dod: manyClauses(7) }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /task T1: 7 DoD clauses, past the 6 a TDD: required task may hold - split it, one behaviour per task/);
  });
});

test("a TDD: none task at 25 Files and 10 DoD clauses exits 0 (a task with no red-green cycle may be larger)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", tdd: "none", files: manyFiles(25), dod: manyClauses(10) }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a TDD: none task with 26 Files and 11 DoD clauses exits 4 naming both counts", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", tdd: "none", files: manyFiles(26), dod: manyClauses(11) }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /task T1: 26 Files, past the 25 a TDD: none task may hold/);
    assert.match(result.stderr, /task T1: 11 DoD clauses, past the 10 a TDD: none task may hold/);
  });
});

test("a task past both size caps validates under --split - a frozen plan resumed after the rule lands must still decompose", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", files: manyFiles(13), dod: manyClauses(7) }], 1));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a DoD line naming the task's own id exits 0 - a task's own id never matches", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", files: "src/a.ts", dod: "T1 handles this case" }], 1));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a DoD line whose word merely contains another task's id exits 0 (T10 beside a task T1 names no task)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", files: "src/a.ts" },
          {
            id: "T2",
            covers: "AC1",
            uses: "none",
            deps: "T1",
            files: "src/b.ts",
            dod: "handles case T10 correctly",
          },
        ],
        1,
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a DoD line naming another task's id only inside a backtick span exits 0 (a fixture plan quoted as literal test data)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", files: "src/a.ts" },
          {
            id: "T2",
            covers: "AC1",
            uses: "none",
            deps: "T1",
            files: "src/b.ts",
            dod: "the fixture plan quotes `T1` as literal test data",
          },
        ],
        1,
      ),
    );

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a DoD line naming another task validates under --split - a frozen plan resumed after the rule lands must still decompose", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(
      dir,
      planBody(
        [
          { id: "T1", files: "src/a.ts" },
          {
            id: "T2",
            covers: "AC1",
            uses: "none",
            deps: "T1",
            files: "src/b.ts",
            dod: "proven by T1",
          },
        ],
        1,
      ),
    );

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);
  });
});

// --- the scope command: plan-index.sh <plan> --extra <task-id> ---------------

/** T1 and T4 are done, T2 is still open, T3 is the task under review. T1 claims
 *  two files, so one task can hold several paths of the coder's extras file. */
const SCOPE_TASKS: TaskFields[] = [
  { id: "T1", files: "src/done-a.ts,src/done-a2.ts" },
  { id: "T2", files: "src/todo.ts" },
  { id: "T3", files: "src/own.ts" },
  { id: "T4", files: "src/done-b.ts" },
];

const EXTRA_CODER = `${PLAN_DIR}/work/T3-extra.md`;
const EXTRA_REVIEWER = `${PLAN_DIR}/work/T3-extra-review.md`;

/** A run with SCOPE_TASKS, T1 and T4 done, and the coder's extras file for T3 holding `coder`. */
function seedScope(dir: string, coder: string | null): void {
  seed(dir, planBody(SCOPE_TASKS, 1));
  seedStatus(dir, { progress: "2/4", done: "T1 T4" });
  if (coder !== null) write(dir, EXTRA_CODER, coder);
}

async function scope(dir: string, id = "T3") {
  return run(dir, {}, [PLAN_REL, "--extra", id]);
}

test("a coder-file path no task claims prints on an extra line and no recheck line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "lib/new.ts\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "extra: lib/new.ts\n");
  });
});

test("a path under .temp/ is left off the extra line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, ".temp/viber/T3/out.md\nlib/new.ts\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "extra: lib/new.ts\n");
  });
});

test("the reviewer's extras file is never read (only the coder's paths reach the reviewer's scope)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, null);
    write(dir, EXTRA_REVIEWER, "lib/reviewer-only.ts\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
  });
});

test("a path a done task claims prints on the extra line with one recheck line carrying that task's verification command", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "src/done-a.ts\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "extra: src/done-a.ts\nrecheck: T1 | npm test\n");
  });
});

test("a path the task's own Files lists is left off", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "src/own.ts\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
  });
});

test("a path a task not yet done claims is left off (that task's own coder owns it)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "src/todo.ts\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
  });
});

test("several paths print one comma-separated extra line in file order, with one recheck line per done task in task order", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "src/done-b.ts\nlib/b.ts\nsrc/done-a2.ts\nsrc/done-a.ts\nlib/a.ts\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      "extra: src/done-b.ts,lib/b.ts,src/done-a2.ts,src/done-a.ts,lib/a.ts\nrecheck: T1 | npm test\nrecheck: T4 | npm test\n",
    );
  });
});

test("blank lines are ignored and a carriage return or a leading ./ is stripped from a coder-file path", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "\n./lib/a.ts\r\n\r\nlib/b.ts\r\n\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "extra: lib/a.ts,lib/b.ts\n");
  });
});

test("an absolute coder-file path of a file a task not yet done claims is left off exactly as its repo-relative spelling is (the ownership comparison sees one spelling)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    write(dir, "src/todo.ts", "x\n");
    seedScope(dir, `${dir}/src/todo.ts\n`);

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
  });
});

test("an absolute coder-file path of a file a done task claims prints on the extra line repo-relative with that task's recheck line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    write(dir, "src/done-a.ts", "x\n");
    seedScope(dir, `${dir}/src/done-a.ts\r\n`);

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "extra: src/done-a.ts\nrecheck: T1 | npm test\n");
  });
});

test("a backslashed coder-file path prints on the extra line in its forward-slash form", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "src\\b.ts\r\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "extra: src/b.ts\n");
  });
});

test("a backslashed coder-file path of a file a task not yet done claims is left off exactly as its forward-slash spelling is", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "src\\todo.ts\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
  });
});

// --- the verify command value: one pair of wrapping backticks is dropped ------

/** The `verify:` lines of the index a landed one-task plan prints (status.md beside it,
 *  so the fresh-plan checks stand aside), T1 carrying `verification`. */
async function verifyLines(dir: string, verification: string): Promise<string[]> {
  seed(dir, planBody([{ id: "T1", verification }], 1));
  seedStatus(dir, { done: "none" });
  const result = await run(dir, {}, [PLAN_REL]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  return result.stdout.split("\n").filter((l) => l.startsWith("verify:"));
}

test("a Verification wrapped in backticks prints on the verify line as the bare command (a wrapped command made red-check always fail)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    assert.deepEqual(await verifyLines(dir, "`cmd a` -> all pass"), ["verify: T1 | cmd a"]);
  });
});

test("the recheck line of a done task owning an extra path carries the same unwrapped command", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1", files: "src/done-a.ts", verification: "`cmd a` -> all pass" }, { id: "T2", files: "src/own.ts" }], 1));
    seedStatus(dir, { progress: "1/2", done: "T1" });
    write(dir, `${PLAN_DIR}/work/T2-extra.md`, "src/done-a.ts\n");

    const result = await scope(dir, "T2");
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "extra: src/done-a.ts\nrecheck: T1 | cmd a\n");
  });
});

test("a wrapped Verification holding inner backticks loses only its first and last backtick", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    assert.deepEqual(await verifyLines(dir, "` echo `x` y ` -> all pass"), ["verify: T1 | echo `x` y"]);
  });
});

test("a Verification opening without a backtick but holding a backtick pair prints unchanged", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    assert.deepEqual(await verifyLines(dir, "echo `a` `b` -> all pass"), ["verify: T1 | echo `a` `b`"]);
  });
});

test("an absolute coder-file path outside the repository prints as written", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const outside = `${path.dirname(dir)}/p2p2-viber-outside/lib/x.ts`;
    seedScope(dir, `${outside}\n`);

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `extra: ${outside}\n`);
  });
});

test("a missing coder file prints nothing and exits 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, null);

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
  });
});

test("a coder file leaving no path prints nothing and exits 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "\n.temp/viber/T3/out.md\nsrc/own.ts\n");

    const result = await scope(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
  });
});

test("--extra with an id the plan does not hold exits 2 with nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "lib/new.ts\n");

    const result = await scope(dir, "T9");
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
  });
});

test("--extra combined with --split exits 2 and decomposes nothing", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "lib/new.ts\n");

    const result = await run(dir, {}, [PLAN_REL, "--extra", "T3", "--split"]);
    assert.equal(result.status, 2, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.equal(fs.existsSync(path.join(dir, PLAN_DIR, "tasks")), false);
  });
});

test("--split removes the coder and reviewer extras files of every task not done and keeps those of a done task", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "lib/new.ts\n");
    write(dir, EXTRA_REVIEWER, "lib/rev.ts\n");
    write(dir, `${PLAN_DIR}/work/T1-extra.md`, "lib/kept.ts\n");
    write(dir, `${PLAN_DIR}/work/T1-extra-review.md`, "lib/kept-rev.ts\n");
    write(dir, `${PLAN_DIR}/work/T2-extra.md`, "lib/gone.ts\n");

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(fs.readdirSync(path.join(dir, PLAN_DIR, "work")).sort(), ["T1-extra-review.md", "T1-extra.md"]);
  });
});

test("--split with a committed extras file of a task not done prints the orphan and dirty lines exactly as it would without one", async () => {
  await withGitRepo(async (repo) => {
    seedScope(repo.dir, "lib/new.ts\n");
    write(repo.dir, "src/todo.ts", "committed\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    write(repo.dir, "src/todo.ts", "half a coder's work\n");
    write(repo.dir, "lib/x.ts", "nobody's task claims this\n");

    const result = await run(repo.dir, repo.env, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.endsWith(
        [
          "verify: T4 | npm test",
          "profile: T2 | tier: sonnet | review: sonnet | subject: T2 [TDD] - do the thing",
          "profile: T3 | tier: sonnet | review: sonnet | subject: T3 [TDD] - do the thing",
          "dirty: T2 | src/todo.ts",
          "orphan: lib/x.ts",
          "",
        ].join("\n"),
      ),
      `stdout: ${result.stdout}`,
    );
  });
});

// --- a done clause naming a contract block missing from its Uses -------------

/** Two blocks, both declared in no file: C1 is what the gapped task uses, C2 is
 *  what the second task uses. */
const TWO_CONTRACTS = [...CONTRACT, "", "### C2 - Logout endpoint", "", "File: none", "", "POST /logout -> 204"];

/** T1 uses `t1` and C2 sits in T2's Uses, so every block is used and the only
 *  thing the plan can be refused for is what T1's DoD or Delivers names. */
function usesGapPlan(t1: TaskFields): string {
  return planBody(
    [
      { id: "T1", files: "src/a.ts", ...t1 },
      { id: "T2", uses: "C2", files: "src/b.ts" },
    ],
    1,
    TWO_CONTRACTS,
  );
}

test("a DoD naming C2 outside backticks while Uses names only C1 exits 4, C2 missing from its Uses, with the error line for the DoD field", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, usesGapPlan({ uses: "C1", dod: "the handler follows C2" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: task T1: DoD names C2, missing from its Uses - add it to Uses\n");
  });
});

test("a Delivers naming C2 outside backticks while Uses names only C1 exits 4, C2 missing from its Uses, with the error line for the Delivers field", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, usesGapPlan({ uses: "C1", delivers: "a handler that implements C2" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: task T1: Delivers names C2, missing from its Uses - add it to Uses\n");
  });
});

test("the same task with C2 added to its Uses, no longer missing from its Uses, exits 0 (the block named in a done clause is carried into its task file)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, usesGapPlan({ uses: "C1, C2", dod: "the handler follows C2", delivers: "a handler that implements C2" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("C2 named only inside a backtick span of a done clause is not missing from its Uses and exits 0 (a quoted mention proves nothing)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, usesGapPlan({ uses: "C1", dod: "the fixture quotes `C2` as literal data", delivers: "a handler that quotes `C2`" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a token with no block in the appendix, such as C9, is never missing from its Uses and exits 0 when named in a done clause", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, usesGapPlan({ uses: "C1", dod: "the handler follows C9", delivers: "a handler that implements C9" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("a word merely containing the block id, such as C21 or C2x, is not missing from its Uses and exits 0 (only a whole token names a block)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, usesGapPlan({ uses: "C1", dod: "the handler follows C21 and C2x" }));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("the plan with the gap missing from its Uses validates and decomposes under --split with exit 0 - a frozen plan resumed after the rule lands must still decompose", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, usesGapPlan({ uses: "C1", dod: "the handler follows C2" }));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(taskFiles(dir), ["T1.md", "T2.md"]);
  });
});

test("the plan with a block missing from its Uses still validates on a plain call with status.md beside it (a landed run plan)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, usesGapPlan({ uses: "C1", dod: "the handler follows C2" }));
    seedStatus(dir, { done: "none" });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("the plain index and the --split index are the same lines as before the scope command existed", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedScope(dir, "lib/new.ts\n");

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      [
        `plan: ${PLAN_REL}`,
        "title: Add login",
        "progress: 2/4",
        "tasks: id | state | tdd | excl | hard | deps | feeds | files | title",
        "T1 | done | required | - | - | - | - | src/done-a.ts,src/done-a2.ts | do the thing",
        "T2 | todo | required | - | - | - | - | src/todo.ts | do the thing",
        "T3 | todo | required | - | - | - | - | src/own.ts | do the thing",
        "T4 | done | required | - | - | - | - | src/done-b.ts | do the thing",
        "verify: T1 | npm test",
        "verify: T2 | npm test",
        "verify: T3 | npm test",
        "verify: T4 | npm test",
        "profile: T2 | tier: sonnet | review: sonnet | subject: T2 [TDD] - do the thing",
        "profile: T3 | tier: sonnet | review: sonnet | subject: T3 [TDD] - do the thing",
        "",
      ].join("\n"),
    );
  });
});

// --- task ids, contract ids and a commit-typed title on a fresh plan ----------

/** Tasks T1 and T3: the second block is the 2nd, so its id has to be T2. */
function skippedTaskId(): string {
  return planBody([
    { id: "T1", title: "Add the login handler", files: "src/login.ts" },
    { id: "T3", title: "Reject a bad password", covers: "AC2", uses: "none", deps: "T1", files: "src/reject.ts" },
  ]);
}

/** Blocks C1 and C3: the second block is the 2nd, so its id has to be C2. */
function skippedBlockId(): string {
  return planBody(
    [
      { id: "T1", title: "Add the login handler", uses: "C1", files: "src/login.ts" },
      { id: "T2", title: "Add the logout handler", covers: "AC2", uses: "C3", deps: "T1", files: "src/logout.ts" },
    ],
    2,
    [...CONTRACT, "", "### C3 - Logout endpoint", "", "File: none", "", "POST /logout -> 204"],
  );
}

function titledPlan(title: string): string {
  return planBody([{ id: "T1", title }], 1);
}

test("a fresh plan whose tasks are T1 and T3 exits 4 with the Ids error naming T3 and nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, skippedTaskId());

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "error: task T3: id must be T2, the 2th task block in order - renumber the tasks (Ids)\n",
    );
  });
});

test("a fresh plan whose contract blocks are C1 and C3 exits 4 with the Blocks error naming C3 and nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, skippedBlockId());

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "error: contract C3: id must be C2, the 2th block in order - renumber the blocks (Blocks)\n",
    );
  });
});

const COMMIT_TYPED_TITLES: Array<[string, string]> = [
  ["feat(viber): Add x", "feat(viber):"],
  ["fix: Add x", "fix:"],
  ["Fix: Add x", "Fix:"],
  ["chore!: Add x", "chore!:"],
];

for (const [title, prefix] of COMMIT_TYPED_TITLES) {
  test(`a fresh plan whose task is titled "${title}" exits 4 with the Title error naming the prefix ${prefix}`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, titledPlan(title));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 4, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.equal(
        result.stderr,
        `error: task T1: title opens with the commit type prefix "${prefix}" - drop it, the commit subject is "<id> - <title>" (Title)\n`,
      );
    });
  });
}

test("a fresh plan whose task is titled \"Fix the parser\" exits 0 (a word that is no prefix, with no colon after it)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, titledPlan("Fix the parser"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

/** A one-task plan whose Goal's second line (line 6) is replaced by `text`. */
function slotGoal(text: string): string {
  return planBody([{ id: "T1" }], 1).replace("The session is durable.", text);
}

/** A copy of the script under `dir`, so its own directory is the one the planner templates are
 *  located from; each template holds a slot of its own, none holding the real ones. */
function installScript(dir: string, templates: boolean): string {
  const script = path.join(dir, "viber/scripts/plan-index.sh");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(SUT, script);
  if (templates) {
    for (const name of ["spec-full.md", "spec-lite.md", "tasks.md"]) {
      write(dir, `viber/skills/planner/templates/${name}`, "# template\n\n<!-- <hidden> -->\n\n<brand new slot>\n");
    }
  }
  return script;
}

const SLOT_EXEMPT: Array<[string, () => string]> = [
  ["a fenced block", () => slotGoal("```\n<n>\n```")],
  ["a backtick span", () => slotGoal("Write `<repo-relative path>` here.")],
  ["an HTML comment on one line", () => slotGoal("<!-- <n> -->")],
  ["an HTML comment over several lines", () => slotGoal("<!--\n<repo-relative path>\n-->")],
  ["the Contracts appendix", () => planBody([{ id: "T1" }], 1, [...CONTRACT, "", "Path: <repo-relative path> and <n>"])],
];

test("Filled check: the Goal slot of the template left in a fresh plan exits 4 with the C1 error naming line 5 and the slot, nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, planBody([{ id: "T1" }], 1).replace("Users can log in.", "<2-4 sentences: what gets built and why. No description of the solution.>"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "error: line 5: template slot <2-4 sentences: what gets built and why. No description of the solution.> left unfilled - replace it (Filled)\n",
    );
  });
});

test("Filled check: a heading S<n> - Login left in a fresh plan exits 4 with the C1 error naming line 6 and the slot <n>", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, slotGoal("### S<n> - Login"));

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: line 6: template slot <n> left unfilled - replace it (Filled)\n");
  });
});

for (const [place, build] of SLOT_EXEMPT) {
  test(`Filled check: a slot inside ${place} exits 0 (it is not plan text)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, build());

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });
}

test("Filled check: a slot added to a template is read at run time, so a plan keeping it exits 4 naming it (the script holds no slot list)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const script = installScript(dir, true);
    seed(dir, slotGoal("<brand new slot>"));

    const result = await runScript(script, [PLAN_REL], { cwd: dir, env: {}, shell: "bash" });
    assert.equal(result.status, 4, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "error: line 6: template slot <brand new slot> left unfilled - replace it (Filled)\n");
  });
});

test("Filled check: a <...> span inside an HTML comment of a template is no slot, so a plan keeping it exits 0 (a template comment read as slots rejects plain plan text)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const script = installScript(dir, true);
    seed(dir, slotGoal("<hidden>"));

    const result = await runScript(script, [PLAN_REL], { cwd: dir, env: {}, shell: "bash" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

test("Filled check: a script whose templates directory is missing skips the check and exits 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const script = installScript(dir, false);
    seed(dir, slotGoal("<n>"));

    const result = await runScript(script, [PLAN_REL], { cwd: dir, env: {}, shell: "bash" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});

const FRESH_PLAN_DEFECTS: Array<[string, () => string]> = [
  ["a skipped task id", skippedTaskId],
  ["a skipped contract id", skippedBlockId],
  ["a commit-typed title", () => titledPlan("feat(viber): Add x")],
  ["a template slot", () => slotGoal("<n>")],
];

for (const [defect, build] of FRESH_PLAN_DEFECTS) {
  test(`a plan with ${defect} still decomposes under --split (a frozen plan resumed after the rule lands)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, build());

      const result = await run(dir, {}, [PLAN_REL, "--split"]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });

  test(`a plan with ${defect} still validates on a plain call with status.md beside it (a landed run plan)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, build());
      seedStatus(dir, { done: "none" });

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    });
  });
}

// --- the review instruction on a fresh plan ------------------------------------

/** `count` independent tasks T1..Tcount, each on its own file, all covering AC1. */
function plannedTasks(count: number): string {
  return planBody(
    Array.from({ length: count }, (_, i) => ({
      id: `T${i + 1}`,
      title: `Do thing ${i + 1}`,
      files: `src/t${i + 1}.ts`,
    })),
    1,
  );
}

const SPEC_AND_GRAPH = [
  "dispatch: viber:planner-spec-review",
  "dispatch: viber:planner-graph-review",
];

const REVIEW_TAILS: Array<[number, string[]]> = [
  [1, ["review: single", "dispatch: viber:planner-review"]],
  [12, ["review: single", "dispatch: viber:planner-review"]],
  [
    13,
    [
      "review: set",
      ...SPEC_AND_GRAPH,
      "dispatch: viber:planner-task-review | tasks: T1-T7",
      "dispatch: viber:planner-task-review | tasks: T8-T13",
    ],
  ],
  [
    30,
    [
      "review: set",
      ...SPEC_AND_GRAPH,
      "dispatch: viber:planner-task-review | tasks: T1-T8",
      "dispatch: viber:planner-task-review | tasks: T9-T16",
      "dispatch: viber:planner-task-review | tasks: T17-T23",
      "dispatch: viber:planner-task-review | tasks: T24-T30",
    ],
  ],
  [
    31,
    [
      "review: set",
      ...SPEC_AND_GRAPH,
      "dispatch: viber:planner-task-review | tasks: T1-T8",
      "dispatch: viber:planner-task-review | tasks: T9-T16",
      "dispatch: viber:planner-task-review | tasks: T17-T24",
      "dispatch: viber:planner-task-review | tasks: T25-T31",
      "threshold: 31 tasks, past 30",
    ],
  ],
];

for (const [count, tail] of REVIEW_TAILS) {
  test(`a fresh plan of ${count} tasks ends its index on the review instruction naming the reviewers to dispatch`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seed(dir, plannedTasks(count));

      const result = await run(dir, {}, [PLAN_REL]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout.slice(result.stdout.indexOf("review: ")), [...tail, ""].join("\n"));
    });
  });
}

test("a landed plan of 13 tasks (status.md beside it) prints no review instruction (the index of a landed run is parsed by other scripts)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, plannedTasks(13));
    seedStatus(dir, { done: "none" });

    const result = await run(dir, {}, [PLAN_REL]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^(review|dispatch|threshold):/m);
  });
});

test("--split of a plan of 13 tasks prints no review instruction", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, plannedTasks(13));

    const result = await run(dir, {}, [PLAN_REL, "--split"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^(review|dispatch|threshold):/m);
  });
});

test("--extra of a plan of 13 tasks prints the extra line alone, no review instruction", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seed(dir, plannedTasks(13));
    write(dir, `${PLAN_DIR}/work/T1-extra.md`, "lib/x.ts\n");

    const result = await run(dir, {}, [PLAN_REL, "--extra", "T1"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "extra: lib/x.ts\n");
  });
});

// --- the dispatch lines: plan-index.sh <plan> --dispatch <task-id> coder|reviewer --

/** T3 depends on T2, which depends on T1; T4 stands alone. */
const DISPATCH_TASKS: TaskFields[] = [
  { id: "T1", files: "src/one.ts" },
  { id: "T2", deps: "T1", files: "src/two.ts" },
  { id: "T3", deps: "T2", files: "src/three.ts" },
  { id: "T4", files: "src/four.ts" },
];

const DISPATCH_ROOT = slash(SUT).replace(/\/scripts\/plan-index\.sh$/, "");

function seedDispatch(dir: string, status: string[] = [], tasks: TaskFields[] = DISPATCH_TASKS): void {
  seed(dir, planBody(tasks, 1));
  write(dir, `${PLAN_DIR}/status.md`, ["# status", "", "progress: 0/4", "done: none", ...status, ""].join("\n"));
}

function dispatch(dir: string, id: string, form: string, env: Record<string, string> = {}) {
  return run(dir, env, [PLAN_REL, "--dispatch", id, form]);
}

test("the coder form prints the fixed coder lines in order, every path under the run directory and no baseline line while build.baseline-tests is off", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedDispatch(dir);

    const result = await dispatch(dir, "T3", "coder");
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      [
        `task: ${PLAN_DIR}/tasks/T3.md`,
        `notes: ${PLAN_DIR}/work/T3-coder.md`,
        "out: .temp/viber/T3/",
        `refs: ${DISPATCH_ROOT}/references`,
        `extras: ${PLAN_DIR}/work/T3-extra.md`,
        `decide-file: ${PLAN_DIR}/work/T3-options.md`,
        `prior: ${PLAN_DIR}/work/T2-coder.md`,
        "",
      ].join("\n"),
    );
  });
});

for (const value of ["fast", "full"]) {
  test(`build.baseline-tests ${value} adds the baseline line of the coder form after decide-file`, async () => {
    await withGitRepo(async (repo) => {
      seedDispatch(repo.dir);
      write(repo.dir, ".claude/viber.yml", `build:\n  baseline-tests: ${value}\n`);

      const result = await dispatch(repo.dir, "T1", "coder", repo.env);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        [
          `task: ${PLAN_DIR}/tasks/T1.md`,
          `notes: ${PLAN_DIR}/work/T1-coder.md`,
          "out: .temp/viber/T1/",
          `refs: ${DISPATCH_ROOT}/references`,
          `extras: ${PLAN_DIR}/work/T1-extra.md`,
          `decide-file: ${PLAN_DIR}/work/T1-options.md`,
          `baseline: ${PLAN_DIR}/work/tests-baseline.md`,
          "",
        ].join("\n"),
      );
    });
  });
}

test("deferred joins every status entry naming the task, a bracketed path intact, and prior names the notes of the task's own deps only", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedDispatch(dir, ["deferred: T3:src/x.ts T1:src/other.ts T3:src/[id]/y.ts"]);

    const result = await dispatch(dir, "T3", "coder");
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      [
        `task: ${PLAN_DIR}/tasks/T3.md`,
        `notes: ${PLAN_DIR}/work/T3-coder.md`,
        "out: .temp/viber/T3/",
        `refs: ${DISPATCH_ROOT}/references`,
        `extras: ${PLAN_DIR}/work/T3-extra.md`,
        `decide-file: ${PLAN_DIR}/work/T3-options.md`,
        "deferred: src/x.ts, src/[id]/y.ts",
        `prior: ${PLAN_DIR}/work/T2-coder.md`,
        "",
      ].join("\n"),
    );
  });
});

test("a task with two deps names both notes on its prior line in dep order", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedDispatch(dir, [], [
      { id: "T1", files: "src/one.ts" },
      { id: "T2", files: "src/two.ts" },
      { id: "T3", deps: "T1, T2", files: "src/three.ts" },
    ]);

    const result = await dispatch(dir, "T3", "coder");
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.endsWith(`\nprior: ${PLAN_DIR}/work/T1-coder.md, ${PLAN_DIR}/work/T2-coder.md\n`),
      `stdout: ${result.stdout}`,
    );
  });
});

test("decision lines of the task and of every task it depends on, directly or through another, print in file order and those of any other task do not", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedDispatch(dir, [
      "decision: T2: scope: src/two.ts only",
      "decision: T4: unrelated",
      "decision: T3: keep the handler",
      "decision: T1: older ruling",
    ]);

    const result = await dispatch(dir, "T3", "coder");
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.endsWith(
        `\nprior: ${PLAN_DIR}/work/T2-coder.md\ndecision: T2: scope: src/two.ts only\ndecision: T3: keep the handler\ndecision: T1: older ruling\n`,
      ),
      `stdout: ${result.stdout}`,
    );
  });
});

test("refs and scope name the plugin root in the spelling the script was invoked with, never resolved", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    seedDispatch(dir);
    const detourSut = `${DISPATCH_ROOT}/scripts/../scripts/plan-index.sh`;
    const root = `${DISPATCH_ROOT}/scripts/..`;

    const result = await runScript(detourSut, [PLAN_REL, "--dispatch", "T1", "reviewer"], { cwd: dir, shell: "bash" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes(`\nrefs: ${root}/references\n`), `stdout: ${result.stdout}`);
    assert.ok(
      result.stdout.endsWith(`\nscope: "${root}/scripts/plan-index.sh" "${PLAN_REL}" --extra "T1"\n`),
      `stdout: ${result.stdout}`,
    );
  });
});

for (const [form, second] of [
  ["a list line with the run-failures prefix", "lessons: Public x2, State x1"],
  ["a bare list line", "Public x2, State x1"],
] as const) {
  test(`run-lessons carries the second line of .temp/viber/lessons (${form}) as the last coder line`, async () => {
    await withGitRepo(async (repo) => {
      seedDispatch(repo.dir);
      write(repo.dir, ".temp/viber/lessons", `started: 100\n${second}\n`);

      const result = await dispatch(repo.dir, "T1", "coder", repo.env);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.ok(result.stdout.endsWith("\nrun-lessons: Public x2, State x1\n"), `stdout: ${result.stdout}`);
    });
  });
}

test("run-lessons is absent with no lessons file", async () => {
  await withGitRepo(async (repo) => {
    seedDispatch(repo.dir);

    const result = await dispatch(repo.dir, "T1", "coder", repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^run-lessons:/m);
  });
});

test("run-lessons is absent with an empty list line", async () => {
  await withGitRepo(async (repo) => {
    seedDispatch(repo.dir);
    write(repo.dir, ".temp/viber/lessons", "started: 100\n\n");

    const result = await dispatch(repo.dir, "T1", "coder", repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /^run-lessons:/m);
  });
});

test("the reviewer form prints the reviewer lines in order with no prior, decide-file or run-lessons line, even when a lessons file exists", async () => {
  await withGitRepo(async (repo) => {
    seedDispatch(repo.dir, ["deferred: T3:src/x.ts", "decision: T1: older ruling"]);
    write(repo.dir, ".claude/viber.yml", "build:\n  baseline-tests: fast\n");
    write(repo.dir, ".temp/viber/lessons", "started: 100\nlessons: Public x2\n");

    const result = await dispatch(repo.dir, "T3", "reviewer", repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      [
        `task: ${PLAN_DIR}/tasks/T3.md`,
        `notes: ${PLAN_DIR}/work/T3-coder.md`,
        "out: .temp/viber/T3/",
        `refs: ${DISPATCH_ROOT}/references`,
        `baseline: ${PLAN_DIR}/work/tests-baseline.md`,
        "deferred: src/x.ts",
        "decision: T1: older ruling",
        `extras: ${PLAN_DIR}/work/T3-extra-review.md`,
        `scope: "${DISPATCH_ROOT}/scripts/plan-index.sh" "${PLAN_REL}" --extra "T3"`,
        "",
      ].join("\n"),
    );
  });
});

for (const [label, args] of [
  ["an id the plan does not hold", [PLAN_REL, "--dispatch", "T9", "coder"]],
  ["a form other than coder or reviewer", [PLAN_REL, "--dispatch", "T1", "arbiter"]],
  ["a missing form", [PLAN_REL, "--dispatch", "T1"]],
  ["--split beside it", [PLAN_REL, "--split", "--dispatch", "T1", "coder"]],
  ["--extra beside it", [PLAN_REL, "--dispatch", "T1", "coder", "--extra", "T1"]],
] as const) {
  test(`--dispatch with ${label} exits 2 with nothing on stdout and no decomposition`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      seedDispatch(dir);

      const result = await run(dir, {}, [...args]);
      assert.equal(result.status, 2, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.equal(fs.existsSync(path.join(dir, PLAN_DIR, "tasks")), false);
    });
  });
}

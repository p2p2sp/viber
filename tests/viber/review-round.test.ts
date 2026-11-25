/*
 * review-round.test.ts - proves the events of
 * viber/skills/planner/scripts/review-round.sh.
 *
 * `review-round.sh <plan> start` runs plan-index.sh on the plan and prints one
 * dispatch block per reviewer of the round, the lines the planner sends as the
 * reviewer's prompt, so a wrong block is a reviewer given the wrong plan, the
 * wrong input or the wrong slice of tasks. The cases pin the blocks of a single
 * and of a set round, the `--input` form, the `sum:` line (the checksum
 * `plan_part_sum` of viber/scripts/plan-parts.sh gives, which the plan gate
 * compares with the plan), the briefs a start outside the skeleton stage has
 * plan-build.sh write for its task reviewers, the `brief:`, `reach:` and
 * `candidates:` lines that appear only with their files (a task reviewer left
 * with no brief, on a machine with no node, falls back to `reach:`), the round
 * a start opens on (the first one on no
 * state, on the state of another plan or on `--fresh`, which also removes the
 * findings an earlier round left), the refusal of a start on a round still
 * open, of a plan plan-index.sh refuses and of an unknown event.
 *
 * `start --skeleton` opens the skeleton stage of a plan whose tasks are still
 * to be written: only the spec and graph reviewers are sent, the stage ends on
 * `NEXT: detail`, and the start after it sends the task reviewers and whoever
 * holds no PASS on the part as it stands. A plan of 12 tasks or fewer has
 * nobody to send in that stage.
 *
 * `returned <k>=<word>... [--out <k>=<file>]...` takes the verdict word of each
 * reply and the findings file it wrote: the file is copied to
 * `findings-<k>.md` beside the state, one `member:` line per verdict reports its
 * counts, a member at none is redispatched once and counts as FAIL at its
 * second none, a FAIL with no findings file to read is a none, a member holding
 * a verdict keeps it, and once every member holds one DENIED outranks FAIL
 * outranks PASS in the answer (ASK:, NEXT: fix, NEXT: detail, NEXT: exit-plan).
 * `NEXT: fix` is followed by the block of the fixer plan-build.sh prints, over
 * the findings files of the failed members and the briefs of the task reviewers
 * among them, and stands alone when no member has a findings file; a Minor
 * finding ending in `(behaviour)` of a member that passed is fixed like a
 * FAIL, beside the failed members or alone, once per member and never while a
 * member is DENIED; `NEXT: exit-plan` is followed by one
 * `MINOR:` line per Minor finding ending in `(inferred)`, `(untouched)` or
 * `(behaviour)`, the last being one that outlived its one fix round. A
 * wrong answer sends the planner to fix a plan that passed, or out of the
 * review with one that failed.
 *
 * `retry-denied` and `stop` move a round closed on `ASK:` on: `retry-denied`
 * redispatches the DENIED members after the planner added a permission, `stop`
 * ends the review. A `start` after `NEXT: fix`, `NEXT: detail` or
 * `NEXT: exit-plan` opens the next round, and after any other answer needs
 * `--fresh`. That round sends only the members without a PASS and the members
 * whose part of the plan changed (planner-review every time), the whole set
 * with no previous findings when the members changed, each
 * block naming the member's previous findings and the fixes file when those
 * exist; `--answered` adds the readers of the `Answered:` lines, and a member
 * that returned no verdict at all takes the previous findings off the round. A
 * wrong move leaves a plan unreviewed, reviewed in the wrong round, or a
 * changed part passed unread.
 *
 * The plans are lite plans with no `## Behaviour` section and only `add` file
 * map lines, so plan-index.sh accepts them. Every case builds its own throwaway
 * repository and reads the script's stdout and stderr, compared through
 * `shaped` of the fixture: `<dir>` stands for the absolute path of
 * `.temp/viber/planner` and `<sum>` for the checksum of a `sum:` line.
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
import { shellUtilsPath } from "../harness/stub.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { SUT, REFS, PLAN_REL, DIR_REL, write, litePlan, review, start, shaped } from "./review-round-fixture.ts";

const PLAN_INDEX = path.resolve(import.meta.dirname, "../../viber/scripts/plan-index.sh");
const PLAN_PARTS = path.resolve(import.meta.dirname, "../../viber/scripts/plan-parts.sh");
const OTHER_PLAN_REL = "docs/_specs/2026-09-21-10-00-00_add-logout/plan.md";
const STATE_REL = `${DIR_REL}/review-round`;
const NOT_CLOSED_ERROR = "error: round 1 is not closed on NEXT: fix, NEXT: detail or NEXT: exit-plan - run start --fresh\n";

/** The block of one member as `shaped` prints it: `rest` are the lines between `sum:` and `out:`. */
function block(k: number, agent: string, round: number, opts: { adds?: string; memory?: boolean; tasks?: string; rest?: string[] } = {}): string[] {
  return [
    `NEXT: review | member: ${k} | agent: viber:${agent} | round: ${round}${opts.adds ?? ""}`,
    `plan: ${PLAN_REL}`,
    `refs: ${REFS}`,
    ...(opts.memory === false ? [] : ["memory: false"]),
    ...(opts.tasks === undefined ? [] : [`tasks: ${opts.tasks}`]),
    "sum: <sum>",
    ...(opts.rest ?? []),
    `out: <dir>/review-${k}.md`,
  ];
}

const READER = " | add: input | add: answered";
const single = (round: number, rest: string[] = []) => block(1, "planner-review", round, { adds: READER, rest });
const spec = (round: number, rest: string[] = []) => block(1, "planner-spec-review", round, { adds: READER, memory: false, rest });
const graph = (round: number, rest: string[] = []) => block(2, "planner-graph-review", round, { rest });
// A start outside the skeleton stage writes the brief of every slice, so a task block names its own.
const tasks3 = (round: number, rest: string[] = []) => block(3, "planner-task-review", round, { tasks: "T1-T7", rest: ["brief: <dir>/slice-T1-T7.md", ...rest] });
const tasks4 = (round: number, rest: string[] = []) => block(4, "planner-task-review", round, { tasks: "T8-T13", rest: ["brief: <dir>/slice-T8-T13.md", ...rest] });

/** The line `returned` prints for a member given a verdict: `file` is its findings file once copied. */
function member(k: number, agent: string, verdict: string, blocking = 0, minor = 0, file = false): string {
  return `member: ${k} | viber:${agent} | ${verdict} | blocking: ${blocking} | minor: ${minor}${file ? ` | <dir>/findings-${k}.md` : ""}`;
}

/** The lines an answer opens its blocks on, the member blocks left out. */
function directives(stdout: string): string[] {
  return stdout.split("\n").filter((line) => /^(NEXT|ASK|STOP|MINOR): /.test(line) && !line.startsWith("NEXT: review "));
}

function nextLines(stdout: string): string[] {
  return stdout.split("\n").filter((line) => line.startsWith("NEXT: "));
}

function valuesOf(stdout: string, label: string): string[] {
  return stdout
    .split("\n")
    .filter((line) => line.startsWith(`${label}: `))
    .map((line) => line.slice(label.length + 2));
}

const FIXER = "NEXT: dispatch | agent: viber:plan-fixer | add: answered | add: input";
const BLOCKING = ["VERDICT: FAIL", "FINDINGS:", "Blocking", "- T1: the Verification names no command"];

/** Writes the findings file member `k` would have written and returns the `--out` pair naming it. */
function wrote(repo: GitRepo, k: number, lines: string[] = BLOCKING): string[] {
  write(repo.dir, `${DIR_REL}/review-${k}.md`, `${lines.join("\n")}\n`);
  return ["--out", `${k}=${path.join(repo.dir, DIR_REL, `review-${k}.md`)}`];
}

function exists(repo: GitRepo, rel: string): boolean {
  return fs.existsSync(path.join(repo.dir, rel));
}

test("start on a plan of more than 12 tasks prints one block per dispatch line, the task reviewers each with their slice and its brief", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(13));

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), [...spec(1), ...graph(1), ...tasks3(1), ...tasks4(1), ""].join("\n"));
  });
});

test("start --input puts the summary file path on the input line and drops the input addition", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2));

    const result = await start(repo, PLAN_REL, "--input", ".temp/viber/intent/summary-1.md");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      shaped(repo, result.stdout),
      [
        "NEXT: review | member: 1 | agent: viber:planner-review | round: 1 | add: answered",
        `plan: ${PLAN_REL}`,
        `refs: ${REFS}`,
        "memory: false",
        "input: .temp/viber/intent/summary-1.md",
        "sum: <sum>",
        "out: <dir>/review-1.md",
        "",
      ].join("\n"),
    );
  });
});

test("the sum line of every block is the checksum plan_part_sum gives for that member's part of the plan (the plan gate compares the two)", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(13));
    write(repo.dir, "sums.sh", ['. "$1"', 'plan="$2"', "shift 2", 'while [ "$#" -ge 2 ]; do', '  plan_part_sum "$plan" "$1" "$2"', "  printf '\\n'", "  shift 2", "done", ""].join("\n"));
    const sums = await runScript(
      path.join(repo.dir, "sums.sh"),
      [PLAN_PARTS, PLAN_REL, "viber:planner-spec-review", "-", "viber:planner-graph-review", "-", "viber:planner-task-review", "T1-T7", "viber:planner-task-review", "T8-T13"],
      { cwd: repo.dir, env: repo.env, shell: "bash" },
    );
    assert.equal(sums.status, 0, `stderr: ${sums.stderr}`);
    const expected = sums.stdout.trim().split("\n");
    assert.equal(new Set(expected).size, 4, "the four parts differ");

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(valuesOf(result.stdout, "sum"), expected);
  });
});

test("start past 12 tasks with no brief written yet writes one per slice from the plan as it stands and drops the brief of another cut (a plan written whole never went through plan-build.sh slices)", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(13));
    write(repo.dir, `${DIR_REL}/slice-T1-T6.md`, "## Tasks\n");

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(valuesOf(shaped(repo, result.stdout), "brief"), ["<dir>/slice-T1-T7.md", "<dir>/slice-T8-T13.md"]);
    assert.deepEqual(fs.readdirSync(path.join(repo.dir, DIR_REL)).filter((name) => name.startsWith("slice-")).sort(), ["slice-T1-T7.md", "slice-T8-T13.md"]);
    const brief = fs.readFileSync(path.join(repo.dir, DIR_REL, "slice-T8-T13.md"), "utf8");
    assert.match(brief, /^### T13 - Do thing 13$/m);
    assert.doesNotMatch(brief, /^### T7 - /m);
  });
});

test("start names the reach file to every member but a task reviewer holding a brief, and the candidates file to all, only when plan-build.sh left them", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(13));
    write(repo.dir, `${DIR_REL}/reach-paths.md`, "## src/t1.ts\n");
    write(repo.dir, `${DIR_REL}/reach-1.md`, "## src/t1.ts\n");
    write(repo.dir, `${DIR_REL}/plan-build`, `plan: ${PLAN_REL}\ninput: \ncandidates: ${DIR_REL}/reach-1.md\n`);
    const reach = "reach: <dir>/reach-paths.md";
    const candidates = `candidates: ${DIR_REL}/reach-1.md`;

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      shaped(repo, result.stdout),
      [...spec(1, [reach, candidates]), ...graph(1, [reach, candidates]), ...tasks3(1, [candidates]), ...tasks4(1, [candidates]), ""].join("\n"),
    );
  });
});

// A state naming round 3 closed on NEXT: fix would open round 4 on the previous findings: each
// case below is a start that must not, so each seeds the state that would.
const FIX_STATE = (plan: string) => `plan: ${plan}\nround: 3\nanswer: fix\n`;

test("start with the state of another plan prints round 1 with no previous findings", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2));
    write(repo.dir, STATE_REL, FIX_STATE(OTHER_PLAN_REL));
    write(repo.dir, `${DIR_REL}/findings-1.md`, `${BLOCKING.join("\n")}\n`);
    write(repo.dir, `${DIR_REL}/fixes.md`, "fix: T1 - a command\n");

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), [...single(1), ""].join("\n"));
  });
});

test("start --fresh on a round closed on NEXT: fix prints round 1 with no previous findings and removes the findings and review files of the earlier round", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2));
    write(repo.dir, STATE_REL, FIX_STATE(PLAN_REL));
    write(repo.dir, `${DIR_REL}/findings-1.md`, `${BLOCKING.join("\n")}\n`);
    write(repo.dir, `${DIR_REL}/review-1.md`, `${BLOCKING.join("\n")}\n`);
    write(repo.dir, `${DIR_REL}/fixes.md`, "fix: T1 - a command\n");

    const result = await start(repo, PLAN_REL, "--fresh");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), [...single(1), ""].join("\n"));
    assert.deepEqual([exists(repo, `${DIR_REL}/findings-1.md`), exists(repo, `${DIR_REL}/review-1.md`), exists(repo, `${DIR_REL}/fixes.md`)], [false, false, true]);
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
    assert.equal(result.stderr, NOT_CLOSED_ERROR);
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

// The `returned` cases open a round through the script itself: a plan of 2 tasks is a round of
// one member (planner-review), a plan of 13 tasks a set round of four (spec, graph, two task
// reviewers). Every call before the last one of a case is arrangement.
async function begin(repo: GitRepo, tasks: number, ...flags: string[]): Promise<void> {
  write(repo.dir, PLAN_REL, litePlan(tasks));
  const opened = await start(repo, PLAN_REL, ...flags);
  assert.equal(opened.status, 0, `stderr: ${opened.stderr}`);
}

async function returned(repo: GitRepo, ...words: string[]) {
  return review(repo, [PLAN_REL, "returned", ...words]);
}

test("returned with the only member at none prints NEXT: redispatch naming it, then its block again", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);

    const result = await returned(repo, "1=none");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), ["NEXT: redispatch | members: 1", ...single(1), ""].join("\n"));
  });
});

test("returned leaving an awaited member unnamed reports the named ones and redispatches the unnamed one as a first none (the others hold their verdict)", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);

    const result = await returned(repo, "1=PASS", "2=PASS", "3=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      shaped(repo, result.stdout),
      [
        member(1, "planner-spec-review", "PASS"),
        member(2, "planner-graph-review", "PASS"),
        member(3, "planner-task-review", "PASS"),
        "NEXT: redispatch | members: 4",
        ...tasks4(1),
        "",
      ].join("\n"),
    );
  });
});

test("a second none of a member counts as FAIL and is named on no-verdict, and a NEXT: fix with no findings file among its members carries no fixer block (there is nothing to fix from)", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);
    await returned(repo, "1=none");

    const result = await returned(repo, "1=none");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, [member(1, "planner-review", "FAIL"), "NEXT: fix | members: 1 | no-verdict: 1", ""].join("\n"));
  });
});

const NO_FINDINGS: { name: string; words: (repo: GitRepo) => string[] }[] = [
  { name: "with no --out", words: () => ["1=FAIL"] },
  { name: "with an --out naming a file that does not exist", words: (repo) => ["1=FAIL", "--out", `1=${path.join(repo.dir, DIR_REL, "review-1.md")}`] },
];

for (const row of NO_FINDINGS) {
  test(`returned 1=FAIL ${row.name} counts as none: the member is redispatched, and a second one is a FAIL on no-verdict (there is nothing to fix from)`, async () => {
    await withGitRepo(async (repo) => {
      await begin(repo, 2);

      const first = await returned(repo, ...row.words(repo));
      const second = await returned(repo, ...row.words(repo));

      assert.equal(first.status, 0, `stderr: ${first.stderr}`);
      assert.equal(shaped(repo, first.stdout), ["NEXT: redispatch | members: 1", ...single(1), ""].join("\n"));
      assert.equal(second.status, 0, `stderr: ${second.stderr}`);
      assert.equal(second.stdout, [member(1, "planner-review", "FAIL"), "NEXT: fix | members: 1 | no-verdict: 1", ""].join("\n"));
    });
  });
}

test("returned --out copies each findings file to findings-<k>.md and prints one member line per verdict with its Blocking and Minor counts", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    const failed = [...BLOCKING, "- T2: the DoD restates the title", "Minor", "- T3: wording"];
    const passed = ["VERDICT: PASS", "FINDINGS:", "### Minor", "- T9: wording", "- T10: a longer name would read better"].join("\r\n");
    write(repo.dir, "notes/passed.md", `${passed}\r\n`);

    const result = await returned(repo, "1=PASS", "2=FAIL", "3=PASS", "4=PASS", ...wrote(repo, 2, failed), "--out", "4=notes/passed.md");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(shaped(repo, result.stdout).split("\n").slice(0, 5), [
      member(1, "planner-spec-review", "PASS"),
      member(2, "planner-graph-review", "FAIL", 2, 1, true),
      member(3, "planner-task-review", "PASS"),
      member(4, "planner-task-review", "PASS", 0, 2, true),
      "NEXT: fix | members: 2",
    ]);
    assert.equal(fs.readFileSync(path.join(repo.dir, DIR_REL, "findings-2.md"), "utf8"), `${failed.join("\n")}\n`);
    assert.equal(fs.readFileSync(path.join(repo.dir, DIR_REL, "findings-4.md"), "utf8"), `${passed}\r\n`);
    assert.deepEqual([exists(repo, `${DIR_REL}/findings-1.md`), exists(repo, `${DIR_REL}/findings-3.md`)], [false, false]);
  });
});

test("NEXT: fix is followed by the fixer block naming the findings file of every failed member and the brief of each failed task reviewer only", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);

    const result = await returned(repo, "1=PASS", "2=FAIL", "3=FAIL", "4=PASS", ...wrote(repo, 2), ...wrote(repo, 3));

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const text = shaped(repo, result.stdout);
    assert.deepEqual(directives(text), ["NEXT: fix | members: 2,3", FIXER]);
    assert.deepEqual(valuesOf(text, "plan"), [PLAN_REL]);
    assert.deepEqual(valuesOf(text, "findings"), ["<dir>/findings-2.md", "<dir>/findings-3.md"]);
    assert.deepEqual(valuesOf(text, "brief"), ["<dir>/slice-T1-T7.md"]);
    assert.deepEqual(valuesOf(text, "out"), ["<dir>/fix.md"]);
  });
});

// The fixer block comes from plan-build.sh, which needs node: the git directory joins the shell
// utilities so the script still finds its repository, and the case skips where node sits there too.
const BARE_PATH = (() => {
  const dirs = shellUtilsPath().split(path.delimiter);
  const names = (tool: string) => (process.platform === "win32" ? [`${tool}.exe`, tool] : [tool]);
  const holds = (dir: string, tool: string) => names(tool).some((name) => fs.existsSync(path.join(dir, name)));
  const gitDir = (process.env.PATH ?? "").split(path.delimiter).find((dir) => dir !== "" && holds(dir, "git"));
  const all = gitDir === undefined || dirs.includes(gitDir) ? dirs : [...dirs, gitDir];
  return { value: all.join(path.delimiter), usable: gitDir !== undefined && !all.some((dir) => holds(dir, "node")) };
})();

test("returned with no node on PATH prints NEXT: fix with no fixer block after it", { skip: BARE_PATH.usable ? false : "no PATH holding git and no node can be staged here" }, async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);

    const result = await runScript(SUT, [PLAN_REL, "returned", "1=FAIL", ...wrote(repo, 1)], { cwd: repo.dir, env: { ...repo.env, PATH: BARE_PATH.value }, shell: "bash" });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), [member(1, "planner-review", "FAIL", 1, 0, true), "NEXT: fix | members: 1", ""].join("\n"));
  });
});

const NO_NODE_START: { name: string; reach: string[] }[] = [
  { name: "the reach line every other member gets when the reach paths file exists", reach: ["reach: <dir>/reach-paths.md"] },
  { name: "neither line when no reach paths file exists either", reach: [] },
];

for (const row of NO_NODE_START) {
  test(`start past 12 tasks with no node on PATH writes no brief and gives a task reviewer ${row.name}`, { skip: BARE_PATH.usable ? false : "no PATH holding git and no node can be staged here" }, async () => {
    await withGitRepo(async (repo) => {
      write(repo.dir, PLAN_REL, litePlan(13));
      if (row.reach.length > 0) write(repo.dir, `${DIR_REL}/reach-paths.md`, "## src/t1.ts\n");

      const result = await runScript(SUT, [PLAN_REL, "start"], { cwd: repo.dir, env: { ...repo.env, PATH: BARE_PATH.value }, shell: "bash" });

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        shaped(repo, result.stdout),
        [
          ...spec(1, row.reach),
          ...graph(1, row.reach),
          ...block(3, "planner-task-review", 1, { tasks: "T1-T7", rest: row.reach }),
          ...block(4, "planner-task-review", 1, { tasks: "T8-T13", rest: row.reach }),
          "",
        ].join("\n"),
      );
      assert.deepEqual(fs.readdirSync(path.join(repo.dir, DIR_REL)).filter((name) => name.startsWith("slice-")), []);
    });
  });
}

test("a redispatch in the round after a fix keeps the round number and the previous findings line on the block", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);
    await returned(repo, "1=FAIL", ...wrote(repo, 1));
    const second = await start(repo, PLAN_REL);
    assert.equal(second.status, 0, `stderr: ${second.stderr}`);

    const result = await returned(repo, "1=none");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), ["NEXT: redispatch | members: 1", ...single(2, ["previous: <dir>/findings-1.md"]), ""].join("\n"));
  });
});

test("a second none in the round after a fix removes the findings file of the earlier round and prints NEXT: fix with no fixer block (those findings are fixed already)", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);
    await returned(repo, "1=FAIL", ...wrote(repo, 1));
    await start(repo, PLAN_REL);
    await returned(repo, "1=none");

    const result = await returned(repo, "1=none");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, [member(1, "planner-review", "FAIL"), "NEXT: fix | members: 1 | no-verdict: 1", ""].join("\n"));
    assert.equal(exists(repo, `${DIR_REL}/findings-1.md`), false);
  });
});

test("returned 1=PASS with no --out in the round after a fix removes the findings file of the earlier round", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);
    await returned(repo, "1=FAIL", ...wrote(repo, 1));
    await start(repo, PLAN_REL);

    const result = await returned(repo, "1=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, [member(1, "planner-review", "PASS"), "NEXT: exit-plan", ""].join("\n"));
    assert.equal(exists(repo, `${DIR_REL}/findings-1.md`), false);
  });
});

test("returned 2=PASS naming the redispatched member alone prints NEXT: exit-plan, the others keeping their PASS", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    await returned(repo, "1=PASS", "2=none", "3=PASS", "4=PASS");

    const result = await returned(repo, "2=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, [member(2, "planner-graph-review", "PASS"), "NEXT: exit-plan", ""].join("\n"));
  });
});

test("returned 2=PASS after a round where member 1 failed keeps that FAIL and prints NEXT: fix naming it", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    await returned(repo, "1=FAIL", "2=none", "3=PASS", "4=PASS", ...wrote(repo, 1));

    const result = await returned(repo, "2=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const text = shaped(repo, result.stdout);
    assert.deepEqual(text.split("\n").slice(0, 2), [member(2, "planner-graph-review", "PASS"), "NEXT: fix | members: 1"]);
    assert.deepEqual(valuesOf(text, "findings"), ["<dir>/findings-1.md"]);
  });
});

const RANKED: { name: string; words: string[]; failed: number[]; directives: string[] }[] = [
  {
    name: "a DENIED member over a FAIL one prints ASK: with the retry-denied and stop answers",
    words: ["1=PASS", "2=DENIED", "3=FAIL", "4=PASS"],
    failed: [3],
    directives: ["ASK: retry -> retry-denied | stop -> stop"],
  },
  {
    name: "FAIL members with no DENIED one print NEXT: fix naming every one of them in member order, then the fixer block",
    words: ["4=FAIL", "2=PASS", "3=PASS", "1=FAIL"],
    failed: [4, 1],
    directives: ["NEXT: fix | members: 1,4", FIXER],
  },
  {
    name: "every member PASS prints NEXT: exit-plan",
    words: ["1=PASS", "2=PASS", "3=PASS", "4=PASS"],
    failed: [],
    directives: ["NEXT: exit-plan"],
  },
];

for (const row of RANKED) {
  test(`returned once every member holds a verdict: ${row.name}`, async () => {
    await withGitRepo(async (repo) => {
      await begin(repo, 13);

      const result = await returned(repo, ...row.words, ...row.failed.flatMap((k) => wrote(repo, k)));

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(directives(result.stdout), row.directives);
      assert.equal(valuesOf(result.stdout, "member").length, 4);
    });
  });
}

test("a Minor finding ending in (behaviour) on a round with no FAIL prints NEXT: fix naming its member on behaviour, then the fixer block over its findings file", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    const minor = ["VERDICT: PASS", "FINDINGS:", "Minor", "- T2: wording", "- T3 drops the retry the client has today (behaviour)"];

    const result = await returned(repo, "1=PASS", "2=PASS", "3=PASS", "4=PASS", ...wrote(repo, 3, minor));

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const text = shaped(repo, result.stdout);
    assert.deepEqual(text.split("\n").slice(0, 6), [
      member(1, "planner-spec-review", "PASS"),
      member(2, "planner-graph-review", "PASS"),
      member(3, "planner-task-review", "PASS", 0, 2, true),
      member(4, "planner-task-review", "PASS"),
      "NEXT: fix | members: 3 | behaviour: 3",
      FIXER,
    ]);
    assert.deepEqual(valuesOf(text, "findings"), ["<dir>/findings-3.md"]);
    const state = fs.readFileSync(path.join(repo.dir, STATE_REL), "utf8");
    assert.match(state, /^sent: 1,2,3,4$/m);
    assert.match(state, /^member: 3 \| .* \| verdict: FAIL \| none: 0 \| raised: 1 \| sum: \d+-\d+$/m);
    assert.match(state, /^member: 4 \| .* \| verdict: PASS \| none: 0 \| raised: 0 \| sum: \d+-\d+$/m);
  });
});

const BEHAVIOUR = ["VERDICT: PASS", "FINDINGS:", "Minor", "- T3 drops the retry the client has today (behaviour)"];

test("a no-verdict member beside a failed one is named on no-verdict, and the fixer block names the findings file of the failed one alone", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    await returned(repo, "1=PASS", "2=FAIL", "3=none", "4=PASS", ...wrote(repo, 2));

    const result = await returned(repo, "3=none");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const text = shaped(repo, result.stdout);
    assert.deepEqual(text.split("\n").slice(0, 3), [member(3, "planner-task-review", "FAIL"), "NEXT: fix | members: 2,3 | no-verdict: 3", FIXER]);
    assert.deepEqual(valuesOf(text, "findings"), ["<dir>/findings-2.md"]);
  });
});

test("a (behaviour) Minor of a member that passed beside a failed member joins the same NEXT: fix on behaviour, its findings file on the fixer block (the finding is not lost with the round)", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    const plain = ["VERDICT: PASS", "FINDINGS:", "Minor", "- T9: wording"];

    const result = await returned(repo, "1=PASS", "2=FAIL", "3=PASS", "4=PASS", ...wrote(repo, 2), ...wrote(repo, 3, BEHAVIOUR), ...wrote(repo, 4, plain));
    const again = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const text = shaped(repo, result.stdout);
    assert.deepEqual(text.split("\n").slice(0, 6), [
      member(1, "planner-spec-review", "PASS"),
      member(2, "planner-graph-review", "FAIL", 1, 0, true),
      member(3, "planner-task-review", "PASS", 0, 1, true),
      member(4, "planner-task-review", "PASS", 0, 1, true),
      "NEXT: fix | members: 2,3 | behaviour: 3",
      FIXER,
    ]);
    assert.deepEqual(valuesOf(text, "findings"), ["<dir>/findings-2.md", "<dir>/findings-3.md"]);
    assert.deepEqual(valuesOf(text, "brief"), ["<dir>/slice-T1-T7.md"]);
    assert.match(fs.readFileSync(path.join(repo.dir, STATE_REL), "utf8"), /^member: 3 \| .* \| verdict: - \| none: 0 \| raised: 1 \| sum: \d+-\d+$/m);
    assert.equal(again.status, 0, `stderr: ${again.stderr}`);
    assert.deepEqual(nextLines(again.stdout), [
      "NEXT: review | member: 2 | agent: viber:planner-graph-review | round: 2",
      "NEXT: review | member: 3 | agent: viber:planner-task-review | round: 2",
    ]);
  });
});

test("a (behaviour) Minor beside a no-verdict member is named on behaviour after no-verdict, and the fixer block names its findings file alone", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    await returned(repo, "1=PASS", "2=none", "3=PASS", "4=PASS", ...wrote(repo, 3, BEHAVIOUR));

    const result = await returned(repo, "2=none");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const text = shaped(repo, result.stdout);
    assert.deepEqual(text.split("\n").slice(0, 3), [member(2, "planner-graph-review", "FAIL"), "NEXT: fix | members: 2,3 | no-verdict: 2 | behaviour: 3", FIXER]);
    assert.deepEqual(valuesOf(text, "findings"), ["<dir>/findings-3.md"]);
  });
});

test("a (behaviour) Minor beside a DENIED member waits for the retry: ASK: first, then NEXT: fix naming it once the DENIED member passed", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);

    const asked = await returned(repo, "1=PASS", "2=DENIED", "3=PASS", "4=PASS", ...wrote(repo, 3, BEHAVIOUR));
    await review(repo, [PLAN_REL, "retry-denied"]);
    const result = await returned(repo, "2=PASS");

    assert.deepEqual(directives(asked.stdout), ["ASK: retry -> retry-denied | stop -> stop"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(directives(result.stdout), ["NEXT: fix | members: 3 | behaviour: 3", FIXER]);
  });
});

test("a member whose (behaviour) Minor was raised once is sent alone in the next round and passes with the same finding, which NEXT: exit-plan then lists on a MINOR: line (a reviewer that insists is not asked a third time, and the user still sees the finding)", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    const minor = ["VERDICT: PASS", "FINDINGS:", "Minor", "- T3 drops the retry the client has today (behaviour)"];
    await returned(repo, "1=PASS", "2=PASS", "3=PASS", "4=PASS", ...wrote(repo, 3, minor));

    const again = await start(repo, PLAN_REL);
    const result = await returned(repo, "3=PASS", ...wrote(repo, 3, minor));

    assert.equal(again.status, 0, `stderr: ${again.stderr}`);
    assert.equal(shaped(repo, again.stdout), [...tasks3(2, ["previous: <dir>/findings-3.md"]), ""].join("\n"));
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      shaped(repo, result.stdout),
      [member(3, "planner-task-review", "PASS", 0, 1, true), "NEXT: exit-plan", "MINOR: viber:planner-task-review: T3 drops the retry the client has today (behaviour)", ""].join("\n"),
    );
  });
});

test("NEXT: exit-plan is followed by one MINOR: line per Minor finding ending in (inferred) or (untouched), in member order, the unmarked Minor findings left out", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    const first = ["VERDICT: PASS", "FINDINGS:", "Minor", "- AC1 names no status code (inferred)", "- Goal: wording"];
    const last = ["VERDICT: PASS", "FINDINGS:", "Minor", "- T9: wording (inferred) in the title", "- T12 reads a file no task lists (untouched)  "];

    const result = await returned(repo, "1=PASS", "2=PASS", "3=PASS", "4=PASS", ...wrote(repo, 4, last), ...wrote(repo, 1, first));

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      shaped(repo, result.stdout),
      [
        member(1, "planner-spec-review", "PASS", 0, 2, true),
        member(2, "planner-graph-review", "PASS"),
        member(3, "planner-task-review", "PASS"),
        member(4, "planner-task-review", "PASS", 0, 2, true),
        "NEXT: exit-plan",
        "MINOR: viber:planner-spec-review: AC1 names no status code (inferred)",
        "MINOR: viber:planner-task-review: T12 reads a file no task lists (untouched)",
        "",
      ].join("\n"),
    );
  });
});

test("returned with a verdict word outside PASS, FAIL, DENIED and none exits 2 with one error line and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);

    const result = await returned(repo, "1=MAYBE");

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: returned: unknown verdict word: MAYBE\n");
  });
});

const BAD_OUT: { name: string; words: string[]; stderr: string }[] = [
  { name: "with nothing after it", words: ["1=PASS", "--out"], stderr: "error: returned: --out needs <k>=<file>\n" },
  { name: "with no file after the member", words: ["--out", "1=", "1=PASS"], stderr: "error: returned: --out needs <k>=<file>, got: 1=\n" },
  { name: "naming a member the round does not hold", words: ["1=PASS", "--out", "2=notes.md"], stderr: "error: returned: member 2 is not in the round\n" },
];

for (const row of BAD_OUT) {
  test(`returned --out ${row.name} exits 2 with one error line and an empty stdout`, async () => {
    await withGitRepo(async (repo) => {
      await begin(repo, 2);

      const result = await returned(repo, ...row.words);

      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, row.stderr);
    });
  });
}

test("returned naming a member the round does not hold exits 2 with one error line and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);

    const result = await returned(repo, "2=PASS");

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: returned: member 2 is not in the round\n");
  });
});

test("returned before any start exits 2 with one error line and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2));

    const result = await returned(repo, "1=PASS");

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: returned: no round is open for this plan - run start first\n");
  });
});

test("returned with no member awaiting a verdict exits 2 with one error line and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);
    await returned(repo, "1=PASS");

    const result = await returned(repo, "1=PASS");

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: returned: no member is awaiting a verdict\n");
  });
});

// The events after a closed round. Each arranger opens a round through the script and brings it
// to the answer it names: a plan of 2 tasks is a round of one member, one of 13 a round of four.
type Arranger = (repo: GitRepo) => Promise<void>;

const AFTER_REDISPATCH: Arranger = async (repo) => {
  await begin(repo, 2);
  await returned(repo, "1=none");
};
const AFTER_ASK: Arranger = async (repo) => {
  await begin(repo, 2);
  await returned(repo, "1=DENIED");
};
const AFTER_EXIT_PLAN: Arranger = async (repo) => {
  await begin(repo, 2);
  await returned(repo, "1=PASS");
};

test("retry-denied after ASK: prints NEXT: redispatch naming the DENIED members, then only their blocks", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    const asked = await returned(repo, "1=PASS", "2=DENIED", "3=PASS", "4=DENIED");

    const result = await review(repo, [PLAN_REL, "retry-denied"]);

    assert.equal(valuesOf(asked.stdout, "member")[1], "2 | viber:planner-graph-review | DENIED | blocking: 0 | minor: 0");
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), ["NEXT: redispatch | members: 2,4", ...graph(1), ...tasks4(1), ""].join("\n"));
  });
});

test("returned naming a redispatched DENIED member alone prints NEXT: exit-plan, the others keeping their PASS", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    await returned(repo, "1=PASS", "2=DENIED", "3=PASS", "4=PASS");
    await review(repo, [PLAN_REL, "retry-denied"]);

    const result = await returned(repo, "2=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, [member(2, "planner-graph-review", "PASS"), "NEXT: exit-plan", ""].join("\n"));
  });
});

test("retry-denied after any answer but ASK: exits 2 with one error line and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    await AFTER_EXIT_PLAN(repo);

    const result = await review(repo, [PLAN_REL, "retry-denied"]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: retry-denied: only after ASK: retry\n");
  });
});

test("stop after ASK: prints the STOP: line", async () => {
  await withGitRepo(async (repo) => {
    await AFTER_ASK(repo);

    const result = await review(repo, [PLAN_REL, "stop"]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "STOP: the plan stays unreviewed - no hand-off\n");
  });
});

// The skeleton stage: the tasks of the plan still hold no Verification and no DoD, so the
// reviewers of the tasks wait for NEXT: detail.
test("start --skeleton on a plan of more than 12 tasks sends the spec and graph reviewers only and writes no brief (the tasks the others read are not written yet)", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(13));

    const result = await start(repo, PLAN_REL, "--fresh", "--skeleton");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), [...spec(1), ...graph(1), ""].join("\n"));
    assert.deepEqual(fs.readdirSync(path.join(repo.dir, DIR_REL)).filter((name) => name.startsWith("slice-")), []);
  });
});

test("the skeleton stage with every member sent at PASS prints NEXT: detail, not NEXT: exit-plan (the task reviewers have reviewed nothing)", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13, "--skeleton");

    const result = await returned(repo, "1=PASS", "2=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, [member(1, "planner-spec-review", "PASS"), member(2, "planner-graph-review", "PASS"), "NEXT: detail", ""].join("\n"));
  });
});

test("a FAIL in the skeleton stage keeps the stage: the start after the fix sends the failed member alone, and its PASS prints NEXT: detail", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13, "--skeleton");
    await returned(repo, "1=PASS", "2=FAIL", ...wrote(repo, 2));

    const again = await start(repo, PLAN_REL);
    const result = await returned(repo, "2=PASS");

    assert.equal(again.status, 0, `stderr: ${again.stderr}`);
    assert.equal(shaped(repo, again.stdout), [...graph(2, ["previous: <dir>/findings-2.md"]), ""].join("\n"));
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, [member(2, "planner-graph-review", "PASS"), "NEXT: detail", ""].join("\n"));
  });
});

const DETAILED: { name: string; edit: (plan: string) => string; blocks: string[] }[] = [
  {
    name: "with the tasks written since sends the task reviewers and the graph reviewer, whose part changed, the spec reviewer keeping its PASS",
    edit: (plan) => plan.replaceAll("- Verification: npm test -> green", "- Verification: node --test tests/login.unit.test.ts -> exit 0"),
    blocks: [...graph(2), ...tasks3(2), ...tasks4(2)],
  },
  {
    name: "with the plan unchanged sends the task reviewers alone, the spec and graph reviewers keeping their PASS",
    edit: (plan) => plan,
    blocks: [...tasks3(2), ...tasks4(2)],
  },
];

for (const row of DETAILED) {
  test(`start after NEXT: detail ${row.name}, at the next round with no previous findings`, async () => {
    await withGitRepo(async (repo) => {
      await begin(repo, 13, "--skeleton");
      await returned(repo, "1=PASS", "2=PASS", ...wrote(repo, 2, ["VERDICT: PASS", "FINDINGS:", "Minor", "- T2: wording"]));
      write(repo.dir, `${DIR_REL}/fixes.md`, "fix: T1 - a command\n");
      write(repo.dir, PLAN_REL, row.edit(litePlan(13)));

      const result = await start(repo, PLAN_REL);

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(shaped(repo, result.stdout), [...row.blocks, ""].join("\n"));
    });
  });
}

test("the round after NEXT: detail with every member at PASS prints NEXT: exit-plan", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13, "--skeleton");
    await returned(repo, "1=PASS", "2=PASS");
    await start(repo, PLAN_REL);

    const result = await returned(repo, "3=PASS", "4=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, [member(3, "planner-task-review", "PASS"), member(4, "planner-task-review", "PASS"), "NEXT: exit-plan", ""].join("\n"));
  });
});

test("start --skeleton on a plan of 12 tasks or fewer prints NEXT: detail at once, and the start after it sends planner-review", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(12));

    const result = await start(repo, PLAN_REL, "--fresh", "--skeleton");
    const after = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "NEXT: detail\n");
    assert.equal(after.status, 0, `stderr: ${after.stderr}`);
    assert.equal(shaped(repo, after.stdout), [...single(2), ""].join("\n"));
  });
});

// The rounds after a fix. FAILED_GRAPH closes round 1 of a set round on NEXT: fix | members: 2.
const FAILED_GRAPH: Arranger = async (repo) => {
  await begin(repo, 13);
  await returned(repo, "1=PASS", "2=FAIL", "3=PASS", "4=PASS", ...wrote(repo, 2));
};

test("start after NEXT: fix, the plan unchanged, prints only the failed member at round 2 with its previous findings (a member that passed is not reviewed again)", async () => {
  await withGitRepo(async (repo) => {
    await FAILED_GRAPH(repo);

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), [...graph(2, ["previous: <dir>/findings-2.md"]), ""].join("\n"));
  });
});

test("start without --fresh on a skeleton round with no returned yet exits 2 naming --fresh, never the PENDING lines of plan-index.sh --detailed (they would tell the model to write the tasks before the skeleton passed)", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(13).replaceAll("- Verification: npm test -> green", "- Verification: PENDING").replaceAll("- DoD: it works", "- DoD: PENDING"));
    const opened = await start(repo, PLAN_REL, "--fresh", "--skeleton");
    assert.equal(opened.status, 0, `stderr: ${opened.stderr}`);

    const result = await start(repo, PLAN_REL);

    assert.deepEqual([result.status, result.stdout, result.stderr], [2, "", NOT_CLOSED_ERROR]);
  });
});

// [case, the verdict words, whether the fixes file is still there]: plan-build.sh apply adds to the file.
const FIXES_KEPT: { name: string; words: string[]; kept: boolean }[] = [
  { name: "closed on NEXT: fix removes the fixes file (its lines would reach the next round beside the fixes applied after it)", words: ["1=FAIL"], kept: false },
  { name: "closed on NEXT: exit-plan removes the fixes file", words: ["1=PASS"], kept: false },
  { name: "sent again after a none keeps the fixes file (the member has yet to read it)", words: ["1=none"], kept: true },
  { name: "waiting on ASK: keeps the fixes file (the retry sends the member again)", words: ["1=DENIED"], kept: true },
];

for (const row of FIXES_KEPT) {
  test(`a round ${row.name}`, async () => {
    await withGitRepo(async (repo) => {
      await begin(repo, 2);
      write(repo.dir, `${DIR_REL}/fixes.md`, "fix: T1 - a command\n");

      const result = await returned(repo, ...row.words, ...(row.words[0] === "1=FAIL" ? wrote(repo, 1) : []));

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(exists(repo, `${DIR_REL}/fixes.md`), row.kept);
    });
  });
}

test("start after NEXT: fix names the fixes file after the previous findings once plan-build.sh apply wrote it", async () => {
  await withGitRepo(async (repo) => {
    await FAILED_GRAPH(repo);
    write(repo.dir, `${DIR_REL}/fixes.md`, "fix: T1 - a command\n");

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), [...graph(2, ["previous: <dir>/findings-2.md", "fixes: <dir>/fixes.md"]), ""].join("\n"));
  });
});

const CHANGED: { name: string; failed: number; edit: (plan: string) => string; members: number[] }[] = [
  {
    name: "a fix changing a task of another slice sends the failed slice, the changed slice and the graph reviewer, the spec reviewer keeping its PASS",
    failed: 3,
    edit: (plan) => plan.replace("### T9 - Do thing 9", "### T9 - Do thing nine"),
    members: [2, 3, 4],
  },
  {
    name: "a fix changing the text above the tasks sends the failed slice and the spec reviewer, the graph reviewer and the other slice keeping their PASS",
    failed: 4,
    edit: (plan) => plan.replace("Users can log in.", "Users can sign in."),
    members: [1, 4],
  },
  {
    name: "a fix changing a contract sends the failed slice, the spec reviewer and the graph reviewer, the other slice keeping its PASS",
    failed: 4,
    edit: (plan) => plan.replace("POST /login -> 200 | 401", "POST /login -> 200 | 403"),
    members: [1, 2, 4],
  },
];

for (const row of CHANGED) {
  test(`start after a fix: ${row.name}`, async () => {
    await withGitRepo(async (repo) => {
      await begin(repo, 13);
      await returned(repo, ...[1, 2, 3, 4].map((k) => `${k}=${k === row.failed ? "FAIL" : "PASS"}`), ...wrote(repo, row.failed));
      write(repo.dir, PLAN_REL, row.edit(litePlan(13)));

      const result = await start(repo, PLAN_REL);

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(
        nextLines(result.stdout).map((line) => Number(line.split(" | ")[1].replace("member: ", ""))),
        row.members,
      );
    });
  });
}

test("start after a fix that adds a task prints every member at round 2 on the new slices (a kept PASS would cover other tasks than it reviewed)", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    await returned(repo, "1=PASS", "2=PASS", "3=FAIL", "4=PASS", ...wrote(repo, 3));
    write(repo.dir, PLAN_REL, litePlan(14));

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(nextLines(result.stdout).length, 4);
    assert.match(result.stdout, /^tasks: T8-T14$/m);
    assert.deepEqual(valuesOf(result.stdout, "previous"), []);
    assert.equal(exists(repo, `${DIR_REL}/findings-3.md`), false);
  });
});

test("start after a fix that takes a plan past 12 tasks sends the whole review set with no previous findings and removes the findings file of planner-review (numbered 1, it would reach the spec reviewer, which would check the fixes of a part it never read)", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 12);
    await returned(repo, "1=FAIL", ...wrote(repo, 1));
    write(repo.dir, `${DIR_REL}/fixes.md`, "fix: T12 - split in two\n");
    write(repo.dir, PLAN_REL, litePlan(13));

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), [...spec(2), ...graph(2), ...tasks3(2), ...tasks4(2), ""].join("\n"));
    assert.equal(exists(repo, `${DIR_REL}/findings-1.md`), false);
  });
});

test("returned naming only the members a partial round 2 sent prints NEXT: exit-plan, the others keeping the PASS of round 1", async () => {
  await withGitRepo(async (repo) => {
    await FAILED_GRAPH(repo);
    await start(repo, PLAN_REL);

    const result = await returned(repo, "2=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, [member(2, "planner-graph-review", "PASS"), "NEXT: exit-plan", ""].join("\n"));
  });
});

test("a member that failed round 2 is the only one round 3 sends when the next fix leaves the other parts alone", async () => {
  await withGitRepo(async (repo) => {
    await FAILED_GRAPH(repo);
    await start(repo, PLAN_REL);
    await returned(repo, "2=FAIL", ...wrote(repo, 2));

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(nextLines(result.stdout), ["NEXT: review | member: 2 | agent: viber:planner-graph-review | round: 3"]);
  });
});

test("start --answered after a fix also sends the spec reviewer holding a PASS on an unchanged part (the answer changes what the readers of the Answered: lines gate)", async () => {
  await withGitRepo(async (repo) => {
    await FAILED_GRAPH(repo);

    const result = await start(repo, PLAN_REL, "--answered");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), [...spec(2), ...graph(2, ["previous: <dir>/findings-2.md"]), ""].join("\n"));
  });
});

test("start after a member returned no verdict twice sends it at round 2 with no previous findings and no fixes file (a reviewer given them checks the fixes alone, and this one reviewed nothing)", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    await returned(repo, "1=PASS", "2=none", "3=PASS", "4=PASS");
    await returned(repo, "2=none");
    write(repo.dir, `${DIR_REL}/findings-2.md`, `${BLOCKING.join("\n")}\n`);
    write(repo.dir, `${DIR_REL}/fixes.md`, "fix: T1 - a command\n");

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), [...graph(2), ""].join("\n"));
  });
});

// A change made after the review: the round was closed on NEXT: exit-plan, so a plain start
// sends whoever passed on another text and nobody else.
const PASSED_SET: Arranger = async (repo) => {
  await begin(repo, 13);
  await returned(repo, "1=PASS", "2=PASS", "3=PASS", "4=PASS", ...wrote(repo, 4, ["VERDICT: PASS", "FINDINGS:", "Minor", "- T9 reads a file no task lists (inferred)"]));
};

test("start after NEXT: exit-plan on a plan of 12 tasks or fewer sends planner-review again with the plan unchanged (the gate pairs its verdict with a dispatch after the last plan write, so a kept PASS would answer exit-plan to a plan the gate refuses)", async () => {
  await withGitRepo(async (repo) => {
    await AFTER_EXIT_PLAN(repo);

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(shaped(repo, result.stdout), [...single(2), ""].join("\n"));
  });
});

test("start outside the skeleton stage on a plan whose task still holds PENDING exits 2 on the FIX lines of plan-index.sh --detailed, while start --skeleton takes the same plan", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, PLAN_REL, litePlan(2).replace("- Verification: npm test -> green", "- Verification: PENDING").replace("- DoD: it works", "- DoD: PENDING"));

    const full = await start(repo, PLAN_REL, "--fresh");
    const skeleton = await start(repo, PLAN_REL, "--fresh", "--skeleton");

    assert.equal(full.status, 2);
    assert.equal(full.stdout, "");
    assert.equal(
      full.stderr,
      "error: plan-index.sh refused the plan\nFIX: task T1: Verification is still PENDING - dispatch the plan-detailer block of its slice and merge its file (Detailed)\nFIX: task T1: DoD is still PENDING - dispatch the plan-detailer block of its slice and merge its file (Detailed)\n",
    );
    assert.equal(skeleton.status, 0, `stderr: ${skeleton.stderr}`);
    assert.equal(skeleton.stdout, "NEXT: detail\n");
  });
});

test("start after NEXT: exit-plan with the plan unchanged sends nobody and prints NEXT: exit-plan at once, with its MINOR: lines", async () => {
  await withGitRepo(async (repo) => {
    await PASSED_SET(repo);

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "NEXT: exit-plan\nMINOR: viber:planner-task-review: T9 reads a file no task lists (inferred)\n");
  });
});

test("start after NEXT: exit-plan sends only the members whose part changed, each with the fixes file and, where it has one, its previous findings", async () => {
  await withGitRepo(async (repo) => {
    await PASSED_SET(repo);
    write(repo.dir, `${DIR_REL}/fixes.md`, "fix: T9 - a clearer title\n");
    write(repo.dir, PLAN_REL, litePlan(13).replace("### T9 - Do thing 9", "### T9 - Do thing nine"));

    const result = await start(repo, PLAN_REL);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      shaped(repo, result.stdout),
      [...graph(2, ["fixes: <dir>/fixes.md"]), ...tasks4(2, ["previous: <dir>/findings-4.md", "fixes: <dir>/fixes.md"]), ""].join("\n"),
    );
  });
});

const NOT_CLOSED: { name: string; arrange: Arranger }[] = [
  { name: "ASK:", arrange: AFTER_ASK },
  { name: "an open NEXT: redispatch", arrange: AFTER_REDISPATCH },
];

for (const row of NOT_CLOSED) {
  test(`start without --fresh after ${row.name} exits 2 with one error line naming --fresh and an empty stdout`, async () => {
    await withGitRepo(async (repo) => {
      await row.arrange(repo);

      const result = await start(repo, PLAN_REL);

      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, NOT_CLOSED_ERROR);
    });
  });
}

for (const row of [...NOT_CLOSED, { name: "NEXT: exit-plan", arrange: AFTER_EXIT_PLAN }]) {
  test(`start --fresh after ${row.name} prints round 1 with no previous findings`, async () => {
    await withGitRepo(async (repo) => {
      await row.arrange(repo);

      const result = await start(repo, PLAN_REL, "--fresh");

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(shaped(repo, result.stdout), [...single(1), ""].join("\n"));
    });
  });
}

/*
 * review-round.test.ts - proves the `start` and `returned` events of
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
 * `returned <k>=<word>...` takes the verdict word of each reply: a member at
 * none is redispatched once and counts as FAIL at its second none, a member
 * holding a verdict keeps it, and once every member holds one DENIED outranks
 * FAIL outranks PASS in the answer (ASK:, NEXT: fix, NEXT: exit-plan). A wrong
 * answer sends the planner to fix a plan that passed, or out of the review with
 * one that failed.
 *
 * `retry-denied`, `override` and `stop` move a closed round on: `retry-denied` redispatches the
 * DENIED members after the planner added a permission, `override` turns the members a Minor
 * finding overrides into FAIL after `NEXT: exit-plan`, `stop` ends the review. A `start` after
 * `NEXT: fix` opens the next round with the previous findings, and after any other answer needs
 * `--fresh`. A wrong move leaves a plan unreviewed, or reviewed in the wrong round.
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

// The `returned` cases open a round through the script itself: a plan of 2 tasks is a round of
// one member (planner-review), a plan of 13 tasks a set round of four (spec, graph, two task
// reviewers). Every call before the last one of a case is arrangement.
const SINGLE_BLOCK = [
  "NEXT: review | member: 1 | agent: viber:planner-review | round: 1 | add: input | add: answered",
  `plan: ${PLAN_REL}`,
  `refs: ${REFS}`,
  "memory: false",
];

const TASK_BLOCK_4 = [
  "NEXT: review | member: 4 | agent: viber:planner-task-review | round: 1",
  `plan: ${PLAN_REL}`,
  `refs: ${REFS}`,
  "memory: false",
  "tasks: T8-T13",
];

async function begin(repo: GitRepo, tasks: number): Promise<void> {
  write(repo.dir, PLAN_REL, litePlan(tasks));
  const opened = await start(repo, PLAN_REL);
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
    assert.equal(slash(result.stdout), ["NEXT: redispatch | members: 1", ...SINGLE_BLOCK, ""].join("\n"));
  });
});

test("returned leaving an awaited member unnamed redispatches it as a first none and only it (the others hold their verdict)", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);

    const result = await returned(repo, "1=PASS", "2=PASS", "3=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout), ["NEXT: redispatch | members: 4", ...TASK_BLOCK_4, ""].join("\n"));
  });
});

test("a second none of a member counts as FAIL and is named on no-verdict", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);
    await returned(repo, "1=none");

    const result = await returned(repo, "1=none");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "NEXT: fix | members: 1 | no-verdict: 1\n");
  });
});

test("a redispatch after a fix keeps the round number and the previous findings addition on the block", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);
    await returned(repo, "1=FAIL");
    const second = await start(repo, PLAN_REL);
    assert.equal(second.status, 0, `stderr: ${second.stderr}`);

    const result = await returned(repo, "1=none");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout.split("\n")[1],
      "NEXT: review | member: 1 | agent: viber:planner-review | round: 2 | add: input | add: answered | add: previous",
    );
  });
});

test("returned 2=PASS naming the redispatched member alone prints NEXT: exit-plan, the others keeping their PASS", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    await returned(repo, "1=PASS", "2=none", "3=PASS", "4=PASS");

    const result = await returned(repo, "2=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "NEXT: exit-plan\n");
  });
});

test("returned 2=PASS after a round where member 1 failed keeps that FAIL and prints NEXT: fix naming it", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    await returned(repo, "1=FAIL", "2=none", "3=PASS", "4=PASS");

    const result = await returned(repo, "2=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "NEXT: fix | members: 1\n");
  });
});

const RANKED: { name: string; words: string[]; stdout: string }[] = [
  {
    name: "a DENIED member over a FAIL one prints ASK: with the retry-denied and stop answers",
    words: ["1=PASS", "2=DENIED", "3=FAIL", "4=PASS"],
    stdout: "ASK: permission added -> retry-denied | stop -> stop\n",
  },
  {
    name: "FAIL members with no DENIED one print NEXT: fix naming every one of them in member order",
    words: ["4=FAIL", "2=PASS", "3=PASS", "1=FAIL"],
    stdout: "NEXT: fix | members: 1,4\n",
  },
  {
    name: "every member PASS prints NEXT: exit-plan",
    words: ["1=PASS", "2=PASS", "3=PASS", "4=PASS"],
    stdout: "NEXT: exit-plan\n",
  },
];

for (const row of RANKED) {
  test(`returned once every member holds a verdict: ${row.name}`, async () => {
    await withGitRepo(async (repo) => {
      await begin(repo, 13);

      const result = await returned(repo, ...row.words);

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, row.stdout);
    });
  });
}

test("returned with a verdict word outside PASS, FAIL, DENIED and none exits 2 with one error line and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 2);

    const result = await returned(repo, "1=MAYBE");

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: returned: unknown verdict word: MAYBE\n");
  });
});

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

const AFTER_START: Arranger = async (repo) => {
  await begin(repo, 2);
};
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
const AFTER_FIX: Arranger = async (repo) => {
  await begin(repo, 2);
  await returned(repo, "1=FAIL");
};

const GRAPH_BLOCK_2 = [
  "NEXT: review | member: 2 | agent: viber:planner-graph-review | round: 1",
  `plan: ${PLAN_REL}`,
  `refs: ${REFS}`,
  "memory: false",
];

test("retry-denied after ASK: prints NEXT: redispatch naming the DENIED members, then only their blocks", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    await returned(repo, "1=PASS", "2=DENIED", "3=PASS", "4=DENIED");

    const result = await review(repo, [PLAN_REL, "retry-denied"]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      slash(result.stdout),
      ["NEXT: redispatch | members: 2,4", ...GRAPH_BLOCK_2, ...TASK_BLOCK_4, ""].join("\n"),
    );
  });
});

test("returned naming a redispatched DENIED member alone prints NEXT: exit-plan, the others keeping their PASS", async () => {
  await withGitRepo(async (repo) => {
    await begin(repo, 13);
    await returned(repo, "1=PASS", "2=DENIED", "3=PASS", "4=PASS");
    await review(repo, [PLAN_REL, "retry-denied"]);

    const result = await returned(repo, "2=PASS");

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "NEXT: exit-plan\n");
  });
});

test("retry-denied after any answer but ASK: exits 2 with one error line and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    await AFTER_EXIT_PLAN(repo);

    const result = await review(repo, [PLAN_REL, "retry-denied"]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: retry-denied: only after ASK: permission added\n");
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

const OVERRIDES: { name: string; members: string; stdout: string }[] = [
  { name: "one member", members: "2", stdout: "NEXT: fix | members: 2\n" },
  { name: "two members, named out of order, in member order", members: "4,2", stdout: "NEXT: fix | members: 2,4\n" },
];

for (const row of OVERRIDES) {
  test(`override of ${row.name} after NEXT: exit-plan prints NEXT: fix naming them`, async () => {
    await withGitRepo(async (repo) => {
      await begin(repo, 13);
      await returned(repo, "1=PASS", "2=PASS", "3=PASS", "4=PASS");

      const result = await review(repo, [PLAN_REL, "override", row.members]);

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, row.stdout);
    });
  });
}

test("override of a member the round does not hold exits 2 with one error line and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    await AFTER_EXIT_PLAN(repo);

    const result = await review(repo, [PLAN_REL, "override", "3"]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: override: member 3 is not in the round\n");
  });
});

const OVERRIDE_REFUSED: { name: string; arrange: Arranger }[] = [
  { name: "a start", arrange: AFTER_START },
  { name: "NEXT: redispatch", arrange: AFTER_REDISPATCH },
  { name: "ASK:", arrange: AFTER_ASK },
  { name: "NEXT: fix", arrange: AFTER_FIX },
];

for (const row of OVERRIDE_REFUSED) {
  test(`override after ${row.name} exits 2 with one error line and an empty stdout`, async () => {
    await withGitRepo(async (repo) => {
      await row.arrange(repo);

      const result = await review(repo, [PLAN_REL, "override", "1"]);

      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "error: override: only after NEXT: exit-plan\n");
    });
  });
}

const ROUND_2_SET = [
  "NEXT: review | member: 1 | agent: viber:planner-spec-review | round: 2 | add: input | add: answered | add: previous",
  `plan: ${PLAN_REL}`,
  `refs: ${REFS}`,
  "NEXT: review | member: 2 | agent: viber:planner-graph-review | round: 2 | add: previous",
  `plan: ${PLAN_REL}`,
  `refs: ${REFS}`,
  "memory: false",
  "NEXT: review | member: 3 | agent: viber:planner-task-review | round: 2 | add: previous",
  `plan: ${PLAN_REL}`,
  `refs: ${REFS}`,
  "memory: false",
  "tasks: T1-T7",
  "NEXT: review | member: 4 | agent: viber:planner-task-review | round: 2 | add: previous",
  `plan: ${PLAN_REL}`,
  `refs: ${REFS}`,
  "memory: false",
  "tasks: T8-T13",
  "",
];

const FIXES: { name: string; arrange: Arranger }[] = [
  {
    name: "returned",
    arrange: async (repo) => {
      await begin(repo, 13);
      await returned(repo, "1=PASS", "2=FAIL", "3=PASS", "4=PASS");
    },
  },
  {
    name: "override",
    arrange: async (repo) => {
      await begin(repo, 13);
      await returned(repo, "1=PASS", "2=PASS", "3=PASS", "4=PASS");
      await review(repo, [PLAN_REL, "override", "2"]);
    },
  },
];

for (const row of FIXES) {
  test(`start after a NEXT: fix printed by ${row.name} prints every member at round 2 with add: previous`, async () => {
    await withGitRepo(async (repo) => {
      await row.arrange(repo);

      const result = await start(repo, PLAN_REL);

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(slash(result.stdout), ROUND_2_SET.join("\n"));
    });
  });
}

const NOT_CLOSED: { name: string; arrange: Arranger }[] = [
  { name: "NEXT: exit-plan", arrange: AFTER_EXIT_PLAN },
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
      assert.equal(result.stderr, "error: round 1 is not closed on NEXT: fix - run start --fresh\n");
    });
  });

  test(`start --fresh after ${row.name} prints round 1 with no previous findings`, async () => {
    await withGitRepo(async (repo) => {
      await row.arrange(repo);

      const result = await start(repo, PLAN_REL, "--fresh");

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(slash(result.stdout), [...SINGLE_BLOCK, ""].join("\n"));
    });
  });
}

/*
 * split.unit.test.ts - the decomposition of --split: the specification and the
 * phases cut out of the plan, the one file per task that is a coder's whole input,
 * the state file, the attachments, and the one commit of what it owns. What git
 * itself does is held by the contract cases of the GitWrite port.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { CONTRACT, liteHead, PLAN_DIR, PLAN_REL, planBody, SCOPE_TASKS, TWO_TASKS } from "../../plan-body.ts";
import { indexOf, ROOT, type Scene } from "./scene.ts";

const PLAN = planBody(TWO_TASKS);
const HEAD = liteHead(2).join("\n");
const split = (plan: string, given: Scene = {}) => indexOf(plan, ["--split"], given);
const specOf = (plan: string): string | null => split(plan).read("spec.md");
const taskOf = (plan: string, id = "T1"): string => split(plan).read(`tasks/${id}.md`) ?? "";
/** The text of a task file under one of its headings. */
const under = (text: string, heading: string): string | undefined => text.split(/^(?=## )/m).find((part) => part.startsWith(`## ${heading}\n`));

const T1_FILE = [
  "### T1 - Add the login handler",
  "- TDD: required",
  "- Covers: AC1",
  "- Uses: C1",
  "- Depends-on: none",
  "- Files: src/login.ts",
  "- Delivers: the thing",
  "- Verification: npm test -> green",
  "- DoD.1: it works",
  "",
  "## Goal",
  "Users can log in.",
  "The session is durable.",
  "",
  "## Covered criteria",
  "1. A user with valid credentials gets a session.",
  "   The session survives a reload.",
  "",
  "## Contracts",
  "",
  ...CONTRACT,
  "",
  "## Out of scope",
  "- Password reset.",
  "- OAuth.",
  "",
].join("\n");
const T2_FILE = [
  "### T2 - Reject a bad password",
  "- TDD: required",
  "- Covers: AC2",
  "- Uses: none",
  "- Depends-on: T1",
  "- Files: src/reject.ts",
  "- Delivers: the thing",
  "- Verification: npm test -> green",
  "- DoD.1: it works",
  "",
  "## Goal",
  "Users can log in.",
  "The session is durable.",
  "",
  "## Covered criteria",
  "2. An invalid password is rejected.",
  "",
  "## Out of scope",
  "- Password reset.",
  "- OAuth.",
  "",
].join("\n");
const STATE = "# status\n\nprogress: 0/2\ndone: none\nskipped: none\nunreviewed: none\ndeferred: none\nclosed: none\n";

test("--split outside a repository writes the specification, each task's whole job and the empty state, and leaves the plan as it was", () => {
  const at = split(PLAN);
  assert.deepEqual([at.exit, at.stderr], [0, `decomposed: 2 tasks into ${PLAN_DIR}\n`]);
  assert.deepEqual(at.run(), ["plan.md", "spec.md", "status.md", "tasks/T1.md", "tasks/T2.md"]);
  assert.deepEqual([at.read("plan.md"), at.read("spec.md"), at.read("status.md"), at.read("tasks/T1.md"), at.read("tasks/T2.md")], [PLAN, HEAD, STATE, T1_FILE, T2_FILE]);
});

test("a spec-full plan hands each task the same file, its regression boundary ahead of the out-of-scope list, the rest of that shape kept in spec.md", () => {
  const at = split(planBody(TWO_TASKS, 2, CONTRACT, "full"));
  assert.equal(at.read("tasks/T1.md"), T1_FILE.replace("\n## Out of scope", "\n## Must not change\n- The public catalogue stays reachable without an account.\n\n## Out of scope"));
  assert.match(at.read("spec.md") ?? "", /^## Glossary$/m);
});

test("a spec-full plan with no Must not change section hands each task the file of a spec-lite one", () => {
  const plan = planBody(TWO_TASKS, 2, CONTRACT, "full").replace("### Must not change\n\n- The public catalogue stays reachable without an account.\n\n", "");
  assert.equal(taskOf(plan), T1_FILE);
});

// --- the specification ---

const SPECS: Array<[string, string, string]> = [
  [
    "the frontmatter and every HTML comment, the blank runs they leave collapsed into one",
    ["---", "source: /home/u/plans/add-login.md", "---", ""].join("\n") + PLAN.replace("# Add login\n", "# Add login\n\n<!-- source: /legacy.md -->\n\nBuild: skill\n\n<!-- Guidance:\n     it ends here. -->\n\n"),
    HEAD.replace("# Add login\n", "# Add login\n\nBuild: skill\n"),
  ],
  ["a frontmatter whose issue: is empty", ["---", "source: /p.md", "issue:", "---", ""].join("\n") + PLAN, HEAD],
  ["a comment opened outside a fence whole, a fence line inside it included", PLAN.replace("## Scope\n", "<!-- guidance\n```\nan example\n-->\n\n## Scope\n"), HEAD],
];
for (const [label, plan, spec] of SPECS) {
  test(`spec.md leaves out ${label}`, () => {
    assert.equal(specOf(plan), spec);
  });
}

for (const [label, block] of [
  ["a backtick fence, its comment and blank lines included", ["```html", "<!-- slot -->", "", "", "~~~", "<!-- still inside -->", "```"]],
  ["a tilde fence", ["~~~html", "<!-- slot -->", "", "", "```", "~~~"]],
  ["a four-backtick fence holding a bare three-backtick line and a heading", ["````md", "```", "## Quoted heading", "````"]],
  ["a fenced example opening ## Tasks", ["```md", "## Tasks", "```"]],
] as const) {
  test(`spec.md keeps ${label}, and what follows it`, () => {
    const example = block.join("\n");
    assert.equal(specOf(PLAN.replace("## Scope\n", `<!-- guidance -->\n\n${example}\n\n## Scope\n`)), HEAD.replace("## Scope\n", `${example}\n\n## Scope\n`));
  });
}

test("the issue: key alone outlives the run: spec.md opens on its own frontmatter", () => {
  const front = ["---", "source: /p.md", "issue: https://github.com/acme/widgets/issues/42", "---", ""].join("\n");
  assert.equal(specOf(front + PLAN), `---\nissue: https://github.com/acme/widgets/issues/42\n---\n\n${HEAD}`);
});

const PHASE_LINES = ["Phase 2 of 3 - Add login", "", "1. Account model (built)", "2. Add login (this plan)", "3. Session expiry", "   - Idle sessions end after one hour.", ""];
const withPhases = (heading: string): string => PLAN.replace("## Acceptance criteria\n", [heading, "", "<!-- Only when the change was split;", "     otherwise drop it. -->", "", ...PHASE_LINES, "## Acceptance criteria", ""].join("\n"));
for (const heading of ["## Phases", "## Roadmap"]) {
  test(`a ${heading} section goes to phases.md under ## Phases and not into spec.md, an earlier roadmap.md removed`, () => {
    const at = split(withPhases(heading), { files: { [`${PLAN_DIR}/roadmap.md`]: "stale\n" } });
    assert.deepEqual([at.read("phases.md"), at.read("spec.md"), at.read("roadmap.md")], [["## Phases", "", ...PHASE_LINES].join("\n"), HEAD, null]);
  });
}

// --- the task files ---

test("a contract whose fenced shape holds headings reaches its task whole, closing fence included", () => {
  const shape = ["### C1 - Report shape", "", "File: none", "", "```md", "# Report", "", "## Findings", "```"];
  assert.ok(taskOf(planBody(TWO_TASKS, 2, shape)).includes(`\n## Contracts\n\n${shape.join("\n")}\n\n## Out of scope\n`));
});

test("a fenced block inside Current behaviour hides no regression boundary behind its ## line", () => {
  const plan = planBody(TWO_TASKS, 2, CONTRACT, "full").replace("Every page is public.\n", "Every page is public.\n\n````md\n```\n## Quoted heading\n````\n");
  assert.equal(under(taskOf(plan), "Must not change"), "## Must not change\n- The public catalogue stays reachable without an account.\n\n");
});

test("a task covering two criteria carries both", () => {
  assert.equal(
    under(taskOf(planBody([{ id: "T1", covers: "AC1, AC2" }])), "Covered criteria"),
    "## Covered criteria\n1. A user with valid credentials gets a session.\n   The session survives a reload.\n2. An invalid password is rejected.\n\n",
  );
});

test("the DoD is one numbered line per clause, the numbers contiguous", () => {
  const text = taskOf(planBody([{ id: "T1", dod: "the endpoint answers 200;; `a; b` holds ; " }], 1));
  assert.deepEqual(text.split("\n").filter((line) => line.includes("DoD")), ["- DoD.1: the endpoint answers 200", "- DoD.2: `a; b` holds"]);
});

// --- what stands beside the plan ---

test("a later --split rebuilds tasks/ from scratch and leaves the progress in status.md untouched", () => {
  const state = "# status\n\nprogress: 1/2\ndone: T1\n";
  const at = split(planBody([TWO_TASKS[0]], 1), { files: { [`${PLAN_DIR}/tasks/T2.md`]: "stale\n", [`${PLAN_DIR}/phases.md`]: "stale\n", [`${PLAN_DIR}/status.md`]: state } });
  assert.deepEqual(at.run(), ["plan.md", "spec.md", "status.md", "tasks/T1.md"]);
  assert.equal(at.read("status.md"), state);
});

test("the coder and reviewer extras files of a task not done are removed, those of a done task kept", () => {
  const work = ["T1-extra.md", "T1-extra-review.md", "T2-extra.md", "T3-extra.md", "T3-extra-review.md"];
  const at = split(planBody(SCOPE_TASKS, 1), { status: ["done: T1 T4"], files: Object.fromEntries(work.map((name) => [`${PLAN_DIR}/work/${name}`, "x\n"])) });
  assert.deepEqual(at.run().filter((path) => path.startsWith("work/")), ["work/T1-extra-review.md", "work/T1-extra.md"]);
});

const ATTACHMENTS: Array<[string, Scene, string]> = [
  ["two files, by name", { files: { [`${PLAN_DIR}/attachments/prototype.html`]: "x\n", [`${PLAN_DIR}/attachments/findings.md`]: "x\n", [`${PLAN_DIR}/attachments/.hidden`]: "x\n" } }, `\n## Attachments\n${PLAN_DIR}/attachments/findings.md\n${PLAN_DIR}/attachments/prototype.html\n`],
  ["a directory, on a trailing slash", { files: { [`${PLAN_DIR}/attachments/bench/run.json`]: "{}\n" } }, `\n## Attachments\n${PLAN_DIR}/attachments/bench/\n`],
  ["nothing for an empty directory", { dirs: [`${ROOT}/${PLAN_DIR}/attachments`] }, ""],
];
for (const [label, given, section] of ATTACHMENTS) {
  test(`spec.md ends on the attachments of the run: ${label}; no task file carries them`, () => {
    const at = split(PLAN, given);
    assert.deepEqual([at.read("spec.md"), at.read("tasks/T1.md"), at.read("tasks/T2.md")], [HEAD + section, T1_FILE, T2_FILE]);
  });
}

test("a file that cannot be written ends the call on 1 after the index, naming it", () => {
  const at = split(PLAN, { fs: { writeBytes: () => false } });
  assert.deepEqual([at.exit, at.stderr, at.lines[0]], [1, `error: ${PLAN_DIR}/spec.md could not be written\n`, `plan: ${PLAN_REL}`]);
});

// --- the commit ---

const OWNED = [`${PLAN_DIR}/plan.md`, `${PLAN_DIR}/spec.md`, `${PLAN_DIR}/status.md`, `${PLAN_DIR}/tasks/T1.md`, `${PLAN_DIR}/tasks/T2.md`];
const SUBJECT = "chore(viber): decompose plan 2026-09-20-10-00-00_add-login";
const SEED = { "README.md": "seed\n" };
const IN_REPO: Scene = { writes: { head: SEED }, files: SEED };
/** Each commit as its message and the files it holds beside the seed. */
const commitsOf = (at: ReturnType<typeof split>) => at.commits.map(({ message, files }) => [message, Object.keys(files).filter((path) => path !== "README.md").sort()]);

const COMMITS: Array<[string, string, Scene, string, string[]]> = [
  ["the decomposition alone, a trail file under work/ left out", PLAN, { files: { [`${PLAN_DIR}/work/T3-notes.md`]: "a trail\n", "src/other.ts": "open work\n" } }, SUBJECT, OWNED],
  ["phases.md with it", withPhases("## Phases"), {}, SUBJECT, [...OWNED, `${PLAN_DIR}/phases.md`].sort()],
  ["every file under attachments/ with it", PLAN, { files: { [`${PLAN_DIR}/attachments/a.html`]: "x\n", [`${PLAN_DIR}/attachments/d/b.md`]: "x\n" } }, SUBJECT, [...OWNED, `${PLAN_DIR}/attachments/a.html`, `${PLAN_DIR}/attachments/d/b.md`].sort()],
  ["a Refs footer for a plan tied to an issue", `---\nissue: https://github.com/acme/widgets/issues/42#c-1\n---\n${PLAN}`, {}, `${SUBJECT}\n\nRefs: #42`, OWNED],
  ["no footer for an issue: that is no issue URL", `---\nissue: https://github.com/acme/widgets/pull/42\n---\n${PLAN}`, {}, SUBJECT, OWNED],
];
for (const [label, plan, given, message, files] of COMMITS) {
  test(`--split commits ${label}`, () => {
    const at = split(plan, { ...IN_REPO, files: { ...SEED, ...given.files } });
    assert.deepEqual(commitsOf(at), [[message, files]]);
    assert.equal(at.exit, 0);
  });
}

test("what the user staged elsewhere stays staged and out of the commit, on a later --split of the changed plan too", () => {
  const at = split(PLAN, IN_REPO);
  at.fs.writeBytes(`${ROOT}/README.md`, new TextEncoder().encode("edited\n"));
  at.fs.writeBytes(`${ROOT}/${PLAN_REL}`, new TextEncoder().encode(planBody(TWO_TASKS).replace("OAuth", "SSO")));
  at.write.stage(ROOT, ["README.md"]);
  at.call(PLAN_REL, "--split");
  assert.deepEqual([at.commits.length, at.commits[1].files["README.md"].text, at.staged()], [2, "seed\n", ["README.md"]]);
});

test("a second --split with the plan unchanged commits nothing", () => {
  const at = split(PLAN, IN_REPO);
  assert.equal(at.call(PLAN_REL, "--split").exit, 0);
  assert.equal(at.commits.length, 1);
});

test("the removal of a committed roadmap.md is part of the commit", () => {
  const roadmap = { [`${PLAN_DIR}/roadmap.md`]: "old\n" };
  const at = split(withPhases("## Roadmap"), { writes: { head: { ...SEED, ...roadmap } }, files: { ...SEED, ...roadmap } });
  assert.deepEqual(commitsOf(at), [[SUBJECT, [...OWNED, `${PLAN_DIR}/phases.md`].sort()]]);
});

for (const fails of ["stage", "commit"] as const) {
  test(`a ${fails} git refuses changes neither the exit nor the files on disk`, () => {
    const at = split(PLAN, { ...IN_REPO, writes: { head: SEED, fails: { [fails]: 1 } } });
    assert.deepEqual([at.exit, at.commits.length, at.read("tasks/T1.md")], [0, 0, T1_FILE]);
  });
}

/*
 * run.unit.test.ts - the plan-index core as called: the arguments it refuses, the
 * spellings of a plan path it folds, the run directory --split insists on, the
 * modes that take a plan as frozen, the config it resolves and the blocks --split
 * prints after the index. What each mode answers is the unit file of its module.
 * `planDefects(text, opts)` is the same contract over a text, for the plan-build
 * core: the checks of a fresh plan and those of an input text, no file read.
 */

import assert from "node:assert/strict";
import { test } from "../../../harness/test.ts";
import { PLAN_DIR, PLAN_REL, planBody, TWO_TASKS } from "../../plan-body.ts";
import { fakeFs } from "../../../harness/fakes.ts";
import { planDefects, templateSlots } from "../../../../viber/lib/plan-index/run.ts";
import { answerOf, indexOf, labelled, PLUGIN, refused, ROOT, type Scene } from "./scene.ts";

const PLAN = planBody(TWO_TASKS);
const USAGE =
  "error: usage: plan-index.sh <plan-file> [--split | --extra <task-id> | --dispatch <task-id> coder|reviewer | --slice <id>[,<id>]... | --final-review | --input <summary-file>] [--accepted <n>]";

const UNPARSED: Array<[string, string[]]> = [
  ["an unknown flag", ["--decompose"]],
  ["an unknown flag with a value", ["--decompose", "x"]],
  ["--extra with no id", ["--extra"]],
  ["--slice with no id", ["--slice"]],
  ["--slice naming no id at all", ["--slice", ","]],
  ["--dispatch with no form", ["--dispatch", "T1"]],
  ["--input with no file", ["--input"]],
  ["--accepted with no value", ["--accepted"]],
  ["--accepted with an empty value", ["--accepted", ""]],
  ["--accepted with a letter in its value", ["--accepted", "3a"]],
  ["--accepted with a negative value", ["--accepted", "-1"]],
];
for (const [label, argv] of UNPARSED) {
  test(`${label} exits 2 on the usage line with nothing on stdout`, () => {
    assert.deepEqual(answerOf(indexOf(PLAN, argv)), refused(2, USAGE));
  });
}

test("a call with no plan exits 2 on the usage line", () => {
  assert.deepEqual(answerOf(indexOf(PLAN, [], {}, "")), refused(2, USAGE));
});

const ALL_FIVE = "--split, --extra, --dispatch, --slice or --final-review";
const MODES: Array<[string, string[]]> = [
  ["--split", ["--split"]],
  ["--extra", ["--extra", "T1"]],
  ["--dispatch", ["--dispatch", "T1", "coder"]],
  ["--slice", ["--slice", "T1"]],
  ["--final-review", ["--final-review"]],
];
const OPTIONS: Array<[string, string[]]> = [
  ["--input", ["--input", "input.md"]],
  ["--accepted", ["--accepted", "5"]],
];
const CLASHES: Array<[string[], string]> = [
  [["--extra", "T1", "--split"], "--extra cannot be combined with --split"],
  [["--split", "--dispatch", "T1", "coder"], "--dispatch cannot be combined with --split or --extra"],
  [["--dispatch", "T1", "coder", "--extra", "T1"], "--dispatch cannot be combined with --split or --extra"],
  [["--dispatch", "T1", "arbiter"], "--dispatch form must be coder or reviewer, got: arbiter"],
  [["--split", "--slice", "T1"], "--slice cannot be combined with --split, --extra or --dispatch"],
  [["--slice", "T1", "--extra", "T1"], "--slice cannot be combined with --split, --extra or --dispatch"],
  [["--slice", "T1", "--dispatch", "T1", "coder"], "--slice cannot be combined with --split, --extra or --dispatch"],
  ...MODES.slice(0, 4).map(([, mode]): [string[], string] => [["--final-review", ...mode], "--final-review cannot be combined with --split, --extra, --dispatch or --slice"]),
  ...OPTIONS.flatMap(([name, option]) => MODES.map(([, mode]): [string[], string] => [[...option, ...mode], `${name} cannot be combined with ${ALL_FIVE}`])),
];
for (const [argv, reason] of CLASHES) {
  test(`${argv.join(" ")} exits 2 naming the clash, with nothing on stdout and nothing decomposed`, () => {
    const at = indexOf(PLAN, argv, { files: { "input.md": "\n" } });
    assert.deepEqual(answerOf(at), refused(2, `error: ${reason}`));
    assert.deepEqual(at.run(), ["plan.md"]);
  });
}

const UNKNOWN: Array<[string[], string]> = [
  [["--extra", "T9"], "--extra: no such task: T9"],
  [["--dispatch", "T9", "coder"], "--dispatch: no such task: T9"],
  [["--slice", "T1,T9"], "--slice: no such task: T9"],
];
for (const [argv, reason] of UNKNOWN) {
  test(`${argv.join(" ")} over a plan holding no T9 exits 2 with nothing on stdout`, () => {
    assert.deepEqual(answerOf(indexOf(PLAN, argv)), refused(2, `error: ${reason}`));
  });
}

for (const path of ["docs/_specs/nope/plan.md", `${PLAN_REL}/`, PLAN_DIR]) {
  test(`${path}, which names no file, exits 2 on its error line`, () => {
    assert.deepEqual(answerOf(indexOf(PLAN, [], {}, path)), refused(2, `error: plan file not found: ${path}`));
  });
}

test("a missing --input file exits 2 on its error line", () => {
  assert.deepEqual(answerOf(indexOf(PLAN, ["--input", "nope.md"])), refused(2, "error: input file not found: nope.md"));
});

// [spelling, its label]: one that keeps its own spelling would report the run directory's own files as orphans.
const SPELLINGS: Array<[string, string]> = [
  [`${ROOT}/${PLAN_REL}`, "absolute"],
  [`./${PLAN_REL}`, "with a leading ./"],
  [PLAN_REL.replaceAll("/", "\\"), "with Windows separators"],
];
for (const [spelling, label] of SPELLINGS) {
  test(`a plan path ${label} prints the index of the relative one`, () => {
    const given: Scene = { repo: { status: [{ code: "??", path: `${PLAN_DIR}/work/T1.round1.md` }] } };
    const relative = indexOf(PLAN, [], given);
    assert.deepEqual(answerOf(indexOf(PLAN, [], given, spelling)), answerOf(relative));
  });
}

test("a plan outside the cwd is printed as it was given", () => {
  assert.equal(indexOf(PLAN, [], { files: { "/plans/p.md": PLAN } }, "/plans/p.md").lines[0], "plan: /plans/p.md");
});

for (const plan of ["plan.md", `${PLAN_DIR}/steps.md`]) {
  test(`--split refuses ${plan}, which is no run's own <dir>/plan.md, and leaves a tasks directory beside it alone (it rebuilds <dir>/tasks)`, () => {
    const at = indexOf(PLAN, ["--split"], { files: { [plan]: PLAN, "tasks/keep.txt": "kept\n" } }, plan);
    assert.deepEqual(answerOf(at), refused(2, `error: --split expects the run's own <dir>/plan.md, got: ${plan}`));
    assert.equal(at.fs.readText(`${ROOT}/tasks/keep.txt`), "kept\n");
  });
}

for (const [mode, argv] of MODES) {
  test(`${mode} on a plan with a defect prints it as a FIX line, exits 4 and writes nothing`, () => {
    const at = indexOf(planBody([{ id: "T1", deps: "T9" }], 1), argv);
    assert.deepEqual(answerOf(at), refused(4, "FIX: task T1: Depends-on T9, no such task"));
    assert.deepEqual(at.run(), ["plan.md"]);
  });

  test(`${mode} takes a plan as frozen, so a check added after it landed does not refuse it`, () => {
    const at = indexOf(planBody([{ id: "T1", title: "feat: Add x" }], 1), argv);
    assert.deepEqual(at.exit, 0);
  });
}

const MEMORY = "FIX: task T1: Files lists src/CLAUDE.md while build.memory is on - drop it, the build close updates every CLAUDE.md (Memory-owned)";
const memoryPlan = planBody([{ id: "T1", files: "src/CLAUDE.md" }], 1);

test("the memory switch is read in the caller's cwd, so a plan file outside it still gets the check", () => {
  const given = { config: "build:\n  memory: true\n", files: { "/plans/p.md": memoryPlan } };
  assert.deepEqual(answerOf(indexOf(memoryPlan, [], given, "/plans/p.md")), refused(4, MEMORY));
});

const MEMORY_OFF: Array<[string, string | undefined]> = [
  ["with build.memory false", "build:\n  memory: false\n"],
  ["with no .claude/viber.yml", undefined],
  ["with memory: true at column 0", "memory: true\n"],
  ["with memory: true under another group", "planning:\n  memory: true\n"],
];
for (const [label, config] of MEMORY_OFF) {
  test(`a CLAUDE.md in Files passes ${label}`, () => {
    assert.equal(indexOf(memoryPlan, [], { config }).exit, 0);
  });
}

const TEMPLATES = `${PLUGIN}/skills/planner/templates`;
test("a slot of a planner template left in the plan is refused, the templates read at run time from beside the entry", () => {
  const plan = PLAN.replace("The session is durable.", "<brand new slot>");
  const at = indexOf(plan, [], { files: { [`${TEMPLATES}/tasks.md`]: "<brand new slot>\n" } });
  assert.deepEqual(answerOf(at), refused(4, "FIX: line 6: template slot <brand new slot> left unfilled - replace it (Filled)"));
});

test("a plugin with no templates directory refuses no slot", () => {
  assert.equal(indexOf(PLAN.replace("The session is durable.", "<n>")).exit, 0);
});

const extension = (step: number, name: string): string[] => [
  `NEXT: extension | step: ${step} | name: ${name}`,
  `run: ${PLAN_DIR}`,
  `spec: ${PLAN_DIR}/spec.md`,
  `notes: ${PLAN_DIR}/work/`,
  `out: .temp/viber/extension-${name}/`,
];
const AGENTS = Object.fromEntries(["a", "b", "c", "d"].map((name) => [`.claude/agents/${name}.md`, "<!-- viber:extension -->\n"]));
const withExtensions = (...lines: string[]): string => ["build:", "  extensions:", ...lines.map((line) => `    ${line}`), ""].join("\n");
/** The lines --split prints after the index. */
const closing = (lines: string[]): string[] => lines.slice(Math.max(lines.findIndex((line) => line.startsWith("NEXT:")), 0)).filter((line) => !/^(plan|title|progress|tasks|verify|profile|T[0-9])/.test(line));

const EXTENSIONS: Array<[string, string, string[], string[]]> = [
  ["one block per name, the names of a step sharing its number", withExtensions("a:", "  parallel: true", "b:", "  parallel: true", "c:"), ["done: none"], [...extension(1, "a"), ...extension(1, "b"), ...extension(2, "c")]],
  ["no block for a closed name, a step whose every name is closed taking no number", withExtensions("a:", "b:", "c:", "  parallel: true", "d:", "  parallel: true"), ["closed: memory extension:a extension:c extension:d"], extension(1, "b")],
  ["a block for a name a closed one only starts with", withExtensions("a:"), ["closed: extension:ab"], extension(1, "a")],
  ["no block with no extension", "", ["done: none"], []],
];
for (const [label, config, status, blocks] of EXTENSIONS) {
  test(`--split prints ${label}`, () => {
    const at = indexOf(planBody([{ id: "T1" }], 1), ["--split"], { config, status, files: AGENTS });
    assert.deepEqual(closing(at.lines).filter((line) => !line.startsWith("closed:")), blocks);
  });
}

test("the extension blocks follow the orphan lines and the qa-kept block comes last, qa.md before qa.e2e.md", () => {
  const at = indexOf(planBody([{ id: "T1" }], 1), ["--split"], {
    config: `${withExtensions("a:")}  qa: true\n`,
    status: ["done: none"],
    files: { ...AGENTS, [`${PLAN_DIR}/qa.e2e.md`]: "q\n", [`${PLAN_DIR}/qa.md`]: "q\n" },
    repo: { status: [{ code: "??", path: "lib/x.ts" }] },
  });
  assert.deepEqual(at.lines.slice(-8), [
    "orphan: lib/x.ts",
    ...extension(1, "a"),
    "NEXT: qa-kept",
    `RUN: "${PLUGIN}/scripts/commit-task.sh" --qa "${PLAN_REL}" "${PLAN_DIR}/qa.md" "${PLAN_DIR}/qa.e2e.md"`,
  ]);
});

const QA_ON = "build:\n  qa: true\n";
const KEPT: Array<[string, string[], string, string[], string[]]> = [
  ["names only the QA document that exists", ["qa.e2e.md"], QA_ON, ["done: none"], ["NEXT: qa-kept", `RUN: "${PLUGIN}/scripts/commit-task.sh" --qa "${PLAN_REL}" "${PLAN_DIR}/qa.e2e.md"`]],
  ["is absent when no QA document exists", [], QA_ON, ["done: none"], []],
  ["is absent with build.qa off", ["qa.md"], "build:\n  qa: false\n", ["done: none"], []],
  ["is absent once status.md closes qa", ["qa.md", "qa.e2e.md"], QA_ON, ["closed: memory qa"], []],
];
for (const [label, docs, config, status, block] of KEPT) {
  test(`the qa-kept block ${label}`, () => {
    const files = Object.fromEntries(docs.map((name) => [`${PLAN_DIR}/${name}`, "q\n"]));
    assert.deepEqual(labelled(indexOf(PLAN, ["--split"], { files, config, status }).lines, "NEXT", "RUN"), block);
  });
}

const NO_DEFECT = { slots: [], held: () => true, memory: false, input: null };

test("planDefects of a sound plan text answers no line, and reads no file of its own", () => {
  assert.deepEqual(planDefects(PLAN, NO_DEFECT), []);
});

test("planDefects answers the defects of a fresh plan in the order plan-index.sh prints them: a single line first, then the blocks together", () => {
  const plan = planBody([{ id: "T1", title: "feat: Add x", files: "src/CLAUDE.md" }, { id: "T3", covers: "AC2", uses: "none", files: "src/b.ts" }]).replace("Users can log in.", "Users can <log in>.");
  assert.deepEqual(planDefects(plan, { ...NO_DEFECT, slots: ["<log in>"], memory: true }), [
    "FIX: line 5: template slot <log in> left unfilled - replace it (Filled)",
    'FIX: task T1: title opens with the commit type prefix "feat:" - drop it, the commit subject is "<id> - <title>" (Title)',
    MEMORY,
    "FIX: task T3: id must be T2, the 2th task block in order - renumber the tasks (Ids)",
  ]);
});

test("planDefects asks the tree for a file map path through held, and takes the input text as --input takes its file", () => {
  const plan = planBody([{ id: "T1" }], 1).replace("- add - src/login.ts - the handler", "- modify - src/login.ts - the handler");
  assert.deepEqual(planDefects(plan, { ...NO_DEFECT, held: (path) => path !== "src/login.ts" }), ["FIX: file map: modify src/login.ts, which the tree does not hold - correct the path or list it as add (File map)"]);
  assert.deepEqual(planDefects(PLAN, { ...NO_DEFECT, input: "Root cause: the loop never ends\n" }), ['FIX: input gives a root cause but the plan has no "## Root cause" section - add it (Root cause)']);
});

test("planDefects of a text with no task block, or with task blocks and no Tasks heading, answers that one defect", () => {
  assert.deepEqual(planDefects("# Plan\n", NO_DEFECT), ["FIX: no <!-- TASK --> blocks in the plan"]);
  assert.deepEqual(planDefects(PLAN.replace("## Tasks\n", ""), NO_DEFECT), ['FIX: the plan carries <!-- TASK --> blocks but no "## Tasks" heading - that heading is where the specification is cut off']);
});

test("templateSlots reads the slots of the three planner templates of the plugin, a missing template adding none", () => {
  const fs = fakeFs({ [`${PLUGIN}/skills/planner/templates/spec-lite.md`]: "# <change title>\n", [`${PLUGIN}/skills/planner/templates/tasks.md`]: "### T1 - <title>\n<!-- a <comment> -->\n" });
  assert.deepEqual(templateSlots(PLUGIN, fs), ["<change title>", "<title>"]);
});

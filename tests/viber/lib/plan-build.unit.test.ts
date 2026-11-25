/*
 * plan-build.unit.test.ts - the plan-build core on fake ports:
 * `<command> <plan> ...` prints the dispatch blocks of the planner's writing
 * agents (survey, outline, frame, assemble, apply, fix) and of the plan judge
 * (judge), cuts a mapped change into slices (outline), moves what the agents
 * wrote into the plan (frame, assemble, apply) and counts the review rounds
 * (judge, judged, apply, open), keeping its work files under
 * `.temp/viber/planner/` of the repository.
 *
 * The cases pin what the planner skill and the agents rely on: the lines of
 * every block and the `add:` fields on its first line, the slice cut at its two
 * limits, the outline counts and thresholds with their split proposal, the
 * frame file cut at its markers with its defects, the order, the numbering of
 * the tasks and of the local contract blocks of an assembled plan (a task
 * behind the task that writes what it uses, whichever slice wrote which, a ring
 * of tasks a defect of the frame), every `Depends-on` line computed from
 * `Files` and contract use, every file of the reach paths page placed in a
 * task, on a File map line or on an Out of scope line (an `OUTSIDE:` line of
 * an author or of a fix puts it there, under a heading that keeps it out of the
 * task files), a file a `| new` target names placed nowhere, each defect and
 * finding routed to the owner of the text it names, the one correction of the
 * frame with the defects of the frame beside its gaps, a fix applied all or
 * none and refused whole when its candidate holds a defect, and the refusals:
 * exit 2 on misuse, 4 with one `FIX:` line per defect and nothing written (a
 * file an agent was to write that cannot be read among them, in every command),
 * 5 when the plan file itself cannot be written.
 *
 * The review cases pin the two rounds: no command opens or accepts a third, the
 * round counter starts again only at the assemble that follows a survey, a
 * note lands in the Open items section of the plan with at most 3 per task, a
 * FAIL the script cannot read is reported again as no verdict (the call the
 * plan gate takes as its answer), and from the fix of round two on, and for a
 * change made once the review is over, every answer ends on `NEXT: exit-plan`
 * and its `OPEN:` lines, never on a line asking the user.
 *
 * The reach search is held by reach.unit.test.ts, the plan reader and the
 * cutters by plan-text.unit.test.ts, the graph by plan-graph.unit.test.ts; the
 * wrapper's exec bit by the `invocations` lint rule.
 */

import assert from "node:assert/strict";
import { fakeClock, fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runPlanBuild } from "../../../viber/lib/plan-build.ts";

const ROOT = "/r";
const DIR = `${ROOT}/.temp/viber/planner`;
const PLAN = "/plans/plan.md";
const SCRIPT = "/plug/skills/planner/scripts/plan-build.ts";
const HEAD = [`plan: ${PLAN}`, "refs: /plug/references"];
const WRITING = [...HEAD, "templates: /plug/skills/planner/templates", "memory: false"];
const AT = new Date(2026, 10, 24, 17, 14, 16);
const USAGE = "usage: plan-build.sh <survey|outline|frame|assemble|keep|judge|judged|apply|open|fix> <plan> [arguments]";

const rows = (...lines: string[]): string => lines.map((line) => `${line}\n`).join("");

interface StateFields {
  plan?: string;
  input?: string;
  candidates?: string;
  split?: string;
  round?: number;
  await?: string;
  retry?: number;
  accepted?: string;
  slices?: number;
  fixes?: number;
  surveyed?: number;
}
/** The state file: a new plan with one slice unless a field says otherwise. */
const stateOf = (given: StateFields = {}): string => {
  const state = { plan: PLAN, input: "", candidates: "", split: "no", round: 0, await: "none", retry: 0, accepted: "none", slices: 1, fixes: 0, surveyed: 0, ...given };
  return rows(`plan: ${state.plan}`, `input: ${state.input}`, `candidates: ${state.candidates}`, `split: ${state.split}`, `round: ${state.round}`, `await: ${state.await}`, `retry: ${state.retry}`, `accepted: ${state.accepted}`, `slices: ${state.slices}`, `frame-fixes: ${state.fixes}`, `surveyed: ${state.surveyed}`);
};
const STATE = `${DIR}/plan-build`;
const roundOf = (fs: { readText(path: string): string | null }): string[] => (fs.readText(STATE) ?? "").split("\n").slice(4, 7);

/** files: what the file system holds; texts: the text files git searches. */
function build(argv: string[], files: Record<string, string> = {}, texts: Record<string, string> = {}, dirs = [ROOT, "/plans", "/a"]) {
  const fs = fakeFs(files, { dirs });
  const git = fakeGit({ root: ROOT, tracked: [], texts });
  return { ...runPlanBuild(argv, ROOT, SCRIPT, { fs, git, clock: fakeClock(AT) }), fs };
}

/** One planning session: every call runs on the files the calls before it left. */
function session(files: Record<string, string>) {
  const fs = fakeFs(files, { dirs: [ROOT, "/plans", "/a"] });
  const git = fakeGit({ root: ROOT, tracked: [], texts: {} });
  return { fs, run: (...argv: string[]) => runPlanBuild(argv, ROOT, SCRIPT, { fs, git, clock: fakeClock(AT) }) };
}

interface TaskGiven {
  id?: string;
  uses?: string;
  deps?: string;
  files?: string;
  covers?: string;
  delivers?: string;
  dod?: string;
}
/** One task block, the fields of a written task; n is its place and the number in its file name. */
const task = (n: number, given: TaskGiven = {}): string[] => [
  "<!-- TASK -->",
  `### ${given.id ?? `T${n}`} - Task ${n}`,
  "- TDD: required",
  `- Covers: ${given.covers ?? "AC1"}`,
  `- Uses: ${given.uses ?? "none"}`,
  `- Depends-on: ${given.deps ?? "none"}`,
  `- Files: ${given.files ?? `src/f${n}.ts`}`,
  `- Delivers: ${given.delivers ?? `thing ${n}`}`,
  "- Verification: npm test -> green",
  `- DoD: ${given.dod ?? "it works"}`,
  "<!-- /TASK -->",
];
const tasks = (...blocks: string[][]): string[] => blocks.flatMap((block) => [...block, ""]);

const SPEC = ["---", `source: ${PLAN}`, "---", "", "# Change", "", "## Current behaviour", "", "### Must not change", "", "- the login keeps its route", "", "## Acceptance criteria", "", "1. First criterion.", "2. Second criterion.", "", "## Scope", "", "### File map", "", "- add - src/f1.ts - the loop", "- add - src/f9.ts - its helper", "- add - docs/y.md - the guide of the helper", "", "### Out of scope", "", "- the reset flow", ""];
const C1 = ["### C1 - Retry", "", "File: src/f1.ts", "", "retry(n)"];
/** A plan: the specification half, the task blocks given and the contract blocks given. */
const planText = (blocks: string[][], contracts: string[][] = [C1]): string => rows(...SPEC, "## Tasks", "", ...tasks(...blocks), ...(contracts.length === 0 ? [] : ["## Contracts", "", ...contracts.flatMap((block, at) => (at === 0 ? block : ["", ...block]))]));
/** A written plan of count tasks that holds no defect: T1 writes C1 and covers both criteria, each later task its own file. */
const WRITTEN = (count = 3): string => planText(Array.from({ length: count }, (_, i) => task(i + 1, i === 0 ? { uses: "C1", covers: "AC1, AC2" } : {})));
const openSection = (text: string | null): string[] => {
  const lines = (text ?? "").split("\n");
  const at = lines.indexOf("## Open items");
  return at < 0 ? [] : lines.slice(at + 2, lines.indexOf("## Tasks") - 1);
};
/** The value of each Depends-on line of a plan text, in task order. */
const depends = (text: string | null): string[] => (text ?? "").split("\n").flatMap((line) => (line.startsWith("- Depends-on: ") ? [line.slice(14)] : []));
const headings = (text: string | null): string[] => (text ?? "").split("\n").filter((line) => /^### (T|C|L)\d/.test(line));

// ---------------------------------------------------------------------------
// survey
// ---------------------------------------------------------------------------

test("survey of a new plan path removes every work file of the earlier plan, forgets the kept count and the frame correction, leaves the review rounds to the assemble that follows it and prints the surveyor block asking for the input text", () => {
  const result = build(["survey", PLAN], {
    [STATE]: stateOf({ plan: "/plans/other.md", input: "/s.md", candidates: "/c.md", round: 2, await: "fix", retry: 1, accepted: "40", slices: 3, fixes: 1 }),
    [`${DIR}/outline.md`]: "AREA: a | 3 | x\n",
    [`${DIR}/slice-2.md`]: "x\n",
    [`${DIR}/judge-2.md`]: "x\n",
    [`${DIR}/changed.md`]: "x\n",
    [`${DIR}/author-1.md`]: "x\n",
    [`${DIR}/owners.md`]: "x\n",
  });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("NEXT: dispatch | agent: viber:plan-surveyor | add: input", ...HEAD, `out: ${DIR}/survey.md`));
  assert.deepEqual(result.fs.listDir(DIR), ["plan-build"]);
  assert.equal(result.fs.readText(STATE), stateOf({ slices: 0, round: 2, await: "fix", retry: 1, surveyed: 1 }));
});

test("survey of the plan path surveyed last with no --phase removes its work files and names no outline: the path alone tells no phase from an abandoned plan", () => {
  const result = build(["survey", PLAN], { [STATE]: stateOf({ input: "/s.md", candidates: "/c.md", split: "yes" }), [`${DIR}/outline.md`]: "AREA: a | 3 | x\n", [`${DIR}/slice-1.md`]: "x\n" });
  assert.equal(result.stdout, rows("NEXT: dispatch | agent: viber:plan-surveyor | add: input", ...HEAD, `out: ${DIR}/survey.md`));
  assert.deepEqual(result.fs.listDir(DIR), ["plan-build"]);
  assert.equal(result.fs.readText(STATE), stateOf({ slices: 0, surveyed: 1 }));
});

test("survey --phase of the plan path surveyed last, whose outline printed a split proposal, keeps its files and names the outline to start from, a summary file going on the input line", () => {
  const result = build(["survey", PLAN, "--phase", "--input", "/s.md"], { [STATE]: stateOf({ candidates: "/c.md", split: "yes", round: 1, await: "judge", retry: 1, slices: 4 }), [`${DIR}/outline.md`]: "AREA: a | 3 | x\n" });
  assert.equal(result.stdout, rows("NEXT: dispatch | agent: viber:plan-surveyor", ...HEAD, `outline: ${DIR}/outline.md`, `out: ${DIR}/survey.md`, "input: /s.md"));
  assert.equal(result.fs.readText(STATE), stateOf({ input: "/s.md", candidates: "/c.md", split: "yes", round: 1, await: "judge", retry: 1, slices: 4, surveyed: 1 }));
});

// [case, the split value of the state]
for (const [name, split] of [
  ["printed no split proposal", "no"],
  ["left a state with another split value", "maybe"],
] as [string, string][]) {
  test(`survey --phase of the plan path surveyed last, whose outline ${name}, removes its work files and names no outline (an abandoned plan of the session has the same path, and its outline would pass for the wider change)`, () => {
    const result = build(["survey", PLAN, "--phase"], { [STATE]: stateOf({ input: "/s.md", candidates: "/c.md", split }), [`${DIR}/outline.md`]: "AREA: a | 3 | x\n", [`${DIR}/changed.md`]: "fix: T1 - x\n" });
    assert.equal(result.stdout, rows("NEXT: dispatch | agent: viber:plan-surveyor | add: input", ...HEAD, `out: ${DIR}/survey.md`));
    assert.deepEqual(result.fs.listDir(DIR), ["plan-build"]);
  });
}

// ---------------------------------------------------------------------------
// outline
// ---------------------------------------------------------------------------

const SURVEY = rows(
  "AREA: core | 3 | the login loop",
  "AREA: page | 2 | the screen",
  "FILE: modify | src/auth.ts | core | the loop",
  "FILE: add | src/b.ts | core | its helper",
  "FILE: modify | src/page.ts | page | the screen",
  "TARGET: src/auth.ts",
  "TARGET: src/auth.ts | login",
  "DECIDE: Keep the old route? | yes | no | both",
  "NOTE: src/auth.ts retries twice",
);
const authorBlock = (slice: number, mode: string, more: string[], add = " | add: answered"): string[] => [`NEXT: dispatch | agent: viber:plan-author | slice: ${slice}${add}`, ...WRITING, `mode: ${mode}`, `slice: ${slice}`, ...more, `out: ${DIR}/author-${slice}.md`];
const frameBlock = (more: string[], add = " | add: answered"): string[] => [`NEXT: dispatch | agent: viber:plan-architect${add}`, ...WRITING, `outline: ${DIR}/outline.md`, `slices: ${DIR}/slices.md`, ...more, `out: ${DIR}/frame.md`];

test("outline of a change that fits one slice copies the survey file, writes both reach files and the slices file, sums the task estimates of the areas and prints the counts, the decisions and the block of the one author writing the whole plan", () => {
  const result = build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": SURVEY, [STATE]: stateOf({ input: "/s.md", slices: 0 }), [`${ROOT}/src/auth.ts`]: "x".repeat(1200), [`${ROOT}/src/page.ts`]: "x".repeat(300), [`${ROOT}/src/b.ts`]: "an added path already there counts for nothing" }, { "docs/x.md": "See src/auth.ts and login.\n" });
  const candidates = `${DIR}/reach-2026-11-24-17-14-16.md`;
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(
    result.stdout,
    rows("TASKS: 5", "FILES: 3", "SLICES: 1", "DECIDE: Keep the old route? | yes | no | both", ...authorBlock(1, "whole", [`outline: ${DIR}/outline.md`, `reach: ${DIR}/reach-paths.md`, `candidates: ${candidates}`]), "input: /s.md"),
  );
  assert.equal(result.fs.readText(`${DIR}/outline.md`), SURVEY);
  assert.equal(result.fs.readText(`${DIR}/slices.md`), rows("SLICE: 1 | core, page | 1500 | src/auth.ts, src/b.ts, src/page.ts"));
  assert.equal(result.fs.readText(`${DIR}/reach-paths.md`), rows("## src/auth.ts", "docs/x.md | 1", "## src/auth.ts | login", "docs/x.md | 1"));
  assert.equal(result.fs.readText(candidates), rows("## src/auth.ts", "terms: src/auth.ts, auth.ts, auth", "docs/x.md:1: See src/auth.ts and login.", "## src/auth.ts | login", "terms: login", "docs/x.md:1: See src/auth.ts and login."));
  assert.equal(result.fs.readText(STATE), stateOf({ input: "/s.md", candidates }));
});

test("outline of a survey whose one target is a file the change adds writes the lines naming its directory to the candidates file and no reach paths page, so the assembly places none of those files", () => {
  const survey = rows("AREA: core | 2 | the loop", "FILE: add | src/new/b.ts | core | its helper", "TARGET: src/new/b.ts | new");
  const at = session({ "/a/survey.md": survey, [STATE]: stateOf({ slices: 0 }), [`${DIR}/reach-paths.md`]: "## old\n" });
  const fake = fakeGit({ root: ROOT, tracked: [], texts: { "docs/x.md": "Every file under src/new is listed here.\n" } });
  const result = runPlanBuild(["outline", PLAN, "/a/survey.md"], ROOT, SCRIPT, { fs: at.fs, git: fake, clock: fakeClock(AT) });
  const candidates = `${DIR}/reach-2026-11-24-17-14-16.md`;
  assert.equal(result.stdout, rows("TASKS: 2", "FILES: 1", "SLICES: 1", ...authorBlock(1, "whole", [`outline: ${DIR}/outline.md`, `candidates: ${candidates}`], " | add: answered | add: input")));
  assert.equal(at.fs.readText(candidates), rows("## src/new/b.ts | new", "terms: src/new", "docs/x.md:1: Every file under src/new is listed here."));
  assert.equal(at.fs.exists(`${DIR}/reach-paths.md`), false);
  at.fs.writeBytes("/a/one.md", new TextEncoder().encode(WRITTEN()));
  assert.equal(at.run("assemble", PLAN, "1=/a/one.md").stdout, rows("assembled: 3 tasks", "NEXT: judge"));
});

test("outline of a survey file that cannot be read exits 4 on one FIX line, as every command does for a file an agent was to write", () => {
  const result = build(["outline", PLAN, "/a/none.md"], { [STATE]: stateOf({ slices: 0 }) });
  assert.deepEqual([result.exit, result.stdout, result.stderr], [4, "", "FIX: cannot read /a/none.md\n"]);
});

test("outline with no target and no summary file prints no reach line, asks for the input text and drops an earlier reach paths file", () => {
  const result = build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": "AREA: x | 8 | y\nFILE: add | a.ts | x | y\n", [`${DIR}/reach-paths.md`]: "## old\n" });
  assert.equal(result.stdout, rows("TASKS: 8", "FILES: 1", "SLICES: 1", ...authorBlock(1, "whole", [`outline: ${DIR}/outline.md`], " | add: answered | add: input")));
  assert.equal(result.fs.exists(`${DIR}/reach-paths.md`), false);
});

test("outline cuts a second slice where the next area would take the first past 8 estimated tasks, and prints the block of the architect who writes the frame", () => {
  const survey = rows("AREA: core | 5 | the loop", "AREA: page | 3 | the screen", "AREA: docs | 1 | the guide", "FILE: add | src/a.ts | core | x", "FILE: add | src/p.ts | page | x", "FILE: add | docs/g.md | docs | x", "TARGET: src/a.ts | new", "TARGET: src/q.ts");
  const result = build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": survey, [STATE]: stateOf({ input: "/s.md", slices: 0 }) });
  const candidates = `${DIR}/reach-2026-11-24-17-14-16.md`;
  assert.equal(result.stdout, rows("TASKS: 9", "FILES: 3", "SLICES: 2", ...frameBlock([`reach: ${DIR}/reach-paths.md`, `candidates: ${candidates}`]), "input: /s.md"));
  assert.equal(result.fs.readText(`${DIR}/slices.md`), rows("SLICE: 1 | core, page | 0 | src/a.ts, src/p.ts", "SLICE: 2 | docs | 0 | docs/g.md"));
  assert.equal(result.fs.readText(STATE), stateOf({ input: "/s.md", candidates, slices: 2 }));
});

test("outline cuts a second slice where the existing files of the next area would take the first past 200000 bytes, a file the change adds counting for nothing", () => {
  const survey = rows("AREA: core | 2 | the loop", "AREA: page | 2 | the screen", "FILE: modify | src/a.ts | core | x", "FILE: add | src/new.ts | core | x", "FILE: modify | src/p.ts | page | x");
  const sized = (a: number, p: number) => build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": survey, [`${ROOT}/src/a.ts`]: "x".repeat(a), [`${ROOT}/src/p.ts`]: "x".repeat(p), [`${ROOT}/src/new.ts`]: "x".repeat(500000) });
  assert.equal(sized(150000, 50000).fs.readText(`${DIR}/slices.md`), rows("SLICE: 1 | core, page | 200000 | src/a.ts, src/new.ts, src/p.ts"));
  const cut = sized(150000, 50001);
  assert.equal(cut.fs.readText(`${DIR}/slices.md`), rows("SLICE: 1 | core | 150000 | src/a.ts, src/new.ts", "SLICE: 2 | page | 50001 | src/p.ts"));
  assert.equal(cut.stdout.split("\n")[2], "SLICES: 2");
});

test("an area past 200000 bytes alone is cut into runs of its files in map order, joined with no other area, and an area past 8 tasks alone stays one slice", () => {
  const survey = rows("AREA: small | 1 | x", "AREA: big | 3 | x", "AREA: many | 12 | x", "AREA: last | 1 | x", "FILE: modify | s.ts | small | x", "FILE: modify | b1.ts | big | x", "FILE: modify | b2.ts | big | x", "FILE: modify | b3.ts | big | x", "FILE: modify | m.ts | many | x", "FILE: modify | l.ts | last | x");
  const result = build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": survey, [`${ROOT}/s.ts`]: "x", [`${ROOT}/b1.ts`]: "x".repeat(120000), [`${ROOT}/b2.ts`]: "x".repeat(70000), [`${ROOT}/b3.ts`]: "x".repeat(250000), [`${ROOT}/m.ts`]: "xx", [`${ROOT}/l.ts`]: "x" });
  assert.equal(
    result.fs.readText(`${DIR}/slices.md`),
    rows("SLICE: 1 | small | 1 | s.ts", "SLICE: 2 | big | 190000 | b1.ts, b2.ts", "SLICE: 3 | big | 250000 | b3.ts", "SLICE: 4 | many | 2 | m.ts", "SLICE: 5 | last | 1 | l.ts"),
  );
});

test("outline past 30 tasks and past 60 files prints both threshold lines and the split proposal with the open decisions, and records the proposal in the state", () => {
  const survey = rows("AREA: a | 31 | x", ...Array.from({ length: 61 }, (_, i) => `FILE: add | src/f${i}.ts | a | x`), "DECIDE: Keep the route? | yes | no | both", "PHASE: 1. Core - owns: the loop; consumes: nothing; files: src/a.ts; tasks: 16", "PHASE: 2. Screen - owns: the page; consumes: the loop; files: src/b.ts; tasks: 15");
  const result = build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": survey, [STATE]: stateOf({ slices: 0 }) });
  assert.deepEqual(result.stdout.split("\n").slice(0, 12), [
    "TASKS: 31",
    "FILES: 61",
    "SLICES: 1",
    "threshold: 31 tasks, past 30",
    "threshold: 61 files, past 60",
    "DECIDE: Keep the route? | yes | no | both",
    "Split proposal:",
    "1. Core - owns: the loop; consumes: nothing; files: src/a.ts; tasks: 16",
    "2. Screen - owns: the page; consumes: the loop; files: src/b.ts; tasks: 15",
    "Open decisions:",
    "- Keep the route?",
    "NEXT: dispatch | agent: viber:plan-author | slice: 1 | add: answered | add: input",
  ]);
  assert.equal(result.fs.readText(STATE), stateOf({ split: "yes" }));
});

test("outline of a survey file with no AREA line, an estimate that is no number or a FILE of an area no AREA line names exits 4 on one FIX line each and writes no outline", () => {
  const none = build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": "TASKS: 3\n" });
  assert.deepEqual([none.exit, none.stdout, none.stderr], [4, "", 'FIX: the survey file holds no AREA: line - write one "AREA: <name> | <estimated tasks> | <what it delivers>" per area\n']);
  const bad = build(["outline", PLAN, "/a/survey.md"], { "/a/survey.md": "AREA: core - the loop\nAREA: page | two | x\nAREA: ok | 2 | x\nFILE: add | a.ts | gone | y\nFILE: add | b.ts | ok | y\n" });
  assert.equal(
    bad.stderr,
    rows('FIX: AREA core - the loop: its task estimate is no number - write "AREA: <name> | <estimated tasks> | <what it delivers>"', 'FIX: AREA page: its task estimate is no number - write "AREA: <name> | <estimated tasks> | <what it delivers>"', 'FIX: FILE a.ts: its area "gone" is on no AREA: line'),
  );
  assert.deepEqual([bad.exit, bad.fs.exists(`${DIR}/outline.md`), bad.fs.exists(`${DIR}/slices.md`)], [4, false, false]);
});

// ---------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------

const MAP = rows("SLICE: 1 | core | 1200 | src/f1.ts, src/f2.ts", "SLICE: 2 | page | 300 | src/f9.ts");
const OUTLINE = rows("AREA: core | 5 | the loop", "AREA: page | 4 | the screen", "FILE: add | src/f1.ts | core | the loop", "FILE: modify | src/f2.ts | core | its caller", "FILE: add | src/f9.ts | page | its helper", "NOTE: src/f1.ts retries twice", "NOTE: src/f9.ts has no caller yet", "NOTE: the build takes a minute");
const FRAME_SLICES = rows("SLICE: 1 | covers: AC1 | uses: C1 | the login loop", "SLICE: 2 | covers: AC2 | uses: none | the screen");
/** The work files of a change cut into two slices, as outline left them. */
const CUT = { [STATE]: stateOf({ candidates: "/c.md", slices: 2 }), [`${DIR}/slices.md`]: MAP, [`${DIR}/outline.md`]: OUTLINE, [`${DIR}/reach-paths.md`]: rows("## src/f1.ts | retry", "docs/x.md | 2", "## src/f9.ts", "docs/y.md | 1"), [`${ROOT}/src/f2.ts`]: "x".repeat(1200) };
/** The plan as frame writes it: the specification half, an empty Tasks section and the shared contract blocks. */
const FRAMED = rows(...SPEC, "## Tasks", "", "## Contracts", "", ...C1);
const FRAME_FILE = `\n${FRAMED}<!-- SLICES -->\n${FRAME_SLICES}<!-- DECISIONS -->\n\n- one writer: no lock\n</content>\n`;
/** The work files once frame ran on that plan. */
const FRAMED_FILES = { ...CUT, [PLAN]: FRAMED, [`${DIR}/frame-slices.md`]: FRAME_SLICES, [`${DIR}/owners.md`]: "C1 | frame\n", [`${DIR}/decisions.md`]: "- one writer: no lock\n" };

test("frame writes the lines above the slices marker into the plan, the SLICE: lines, the decision log, the owner of each shared block and one brief per slice, a leaked closing tag dropped, and prints one author block per slice", () => {
  const result = build(["frame", PLAN, "/a/frame.md"], { ...CUT, "/a/frame.md": FRAME_FILE });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows(`plan: ${PLAN}`, "slices: 2", ...authorBlock(1, "slice", [`brief: ${DIR}/slice-1.md`, "candidates: /c.md"]), ...authorBlock(2, "slice", [`brief: ${DIR}/slice-2.md`, "candidates: /c.md"])));
  assert.equal(result.fs.readText(PLAN), FRAMED);
  assert.equal(result.fs.readText(`${DIR}/frame-slices.md`), FRAME_SLICES);
  assert.equal(result.fs.readText(`${DIR}/decisions.md`), "- one writer: no lock\n");
  assert.equal(result.fs.readText(`${DIR}/owners.md`), "C1 | frame\n");
  assert.equal(
    result.fs.readText(`${DIR}/slice-1.md`),
    rows(
      "# Slice 1",
      "",
      "## Delivers",
      "",
      "the login loop",
      "",
      "## Must not change",
      "",
      "- the login keeps its route",
      "",
      "## Acceptance criteria",
      "",
      "1. First criterion.",
      "",
      "## Tasks",
      "",
      "## Contracts",
      "",
      ...C1,
      "",
      "## Files",
      "",
      "FILE: add | src/f1.ts | core | the loop | 0",
      "FILE: modify | src/f2.ts | core | its caller | 1200",
      "",
      "## File map",
      "",
      "- add - src/f1.ts - the loop",
      "",
      "## Reach",
      "",
      "## src/f1.ts | retry",
      "docs/x.md | 2",
      "",
      "## Notes",
      "",
      "NOTE: src/f1.ts retries twice",
      "",
    ),
  );
  const second = result.fs.readText(`${DIR}/slice-2.md`) ?? "";
  assert.deepEqual([second.includes("2. Second criterion."), second.includes("### C1 - Retry"), second.includes("## src/f9.ts\ndocs/y.md | 1"), second.includes("NOTE: src/f9.ts has no caller yet"), second.includes("1. First criterion.")], [true, false, true, true, false]);
});

test("frame of a file with no decisions marker removes an earlier decision log", () => {
  const result = build(["frame", PLAN, "/a/frame.md"], { ...CUT, "/a/frame.md": `${FRAMED}<!-- SLICES -->\n${FRAME_SLICES}`, [`${DIR}/decisions.md`]: "old\n" });
  assert.deepEqual([result.exit, result.fs.exists(`${DIR}/decisions.md`)], [0, false]);
});

test("frame exits 4 with one FIX line per defect and writes no plan: no frontmatter, no Tasks heading, a task block, a slice with no SLICE: line, a SLICE: line of no slice, a criterion on no SLICE: line, a block no plan text holds", () => {
  const text = ["# Change", "", "## Acceptance criteria", "", "1. First.", "2. Second.", "", ...task(1), "<!-- SLICES -->", "SLICE: 1 | covers: AC1 | uses: C7 | the loop", "SLICE: 3 | covers: AC1 | the rest"];
  const result = build(["frame", PLAN, "/a/frame.md"], { ...CUT, "/a/frame.md": rows(...text) });
  assert.deepEqual([result.exit, result.stdout], [4, ""]);
  assert.equal(
    result.stderr,
    rows(
      "FIX: the plan text does not open with its frontmatter line ---",
      'FIX: the plan text holds no "## Tasks" heading on a line of its own',
      "FIX: the plan text holds a task block - the author of each slice writes its tasks",
      "FIX: slice 2 has no SLICE: line",
      "FIX: SLICE: 3 names no slice of the slices file",
      "FIX: AC2 is on no SLICE: line",
      "FIX: slice 1 uses C7, no contract block of the plan text",
    ),
  );
  assert.deepEqual([result.fs.exists(PLAN), result.fs.exists(`${DIR}/slice-1.md`)], [false, false]);
});

test("frame refuses a plan text whose frontmatter names no source, and a frame file that cannot be read: exit 4, one FIX line, no plan written", () => {
  const bare = build(["frame", PLAN, "/a/frame.md"], { ...CUT, "/a/frame.md": FRAME_FILE.replace(`source: ${PLAN}\n`, "issue: none\n") });
  assert.deepEqual([bare.exit, bare.stdout, bare.stderr], [4, "", 'FIX: the frontmatter holds no "source: <plan path>" line - write it, the plan path as its value\n']);
  assert.equal(bare.fs.exists(PLAN), false);
  const gone = build(["frame", PLAN, "/a/none.md"], CUT);
  assert.deepEqual([gone.exit, gone.stdout, gone.stderr], [4, "", "FIX: cannot read /a/none.md\n"]);
});

test("frame exits 5 when the plan file cannot be written (its directory is absent), and 2 for a change the outline cut into one slice", () => {
  const lost = build(["frame", "/gone/plan.md", "/a/frame.md"], { ...CUT, "/a/frame.md": FRAME_FILE });
  assert.deepEqual([lost.exit, lost.stdout, lost.stderr], [5, "", "error: cannot write the plan file: /gone/plan.md\n"]);
  const whole = build(["frame", PLAN, "/a/frame.md"], { [STATE]: stateOf(), "/a/frame.md": FRAME_FILE });
  assert.deepEqual([whole.exit, whole.stderr], [2, "error: frame: the outline cut this change into one slice - its author writes the whole plan\n"]);
});

// ---------------------------------------------------------------------------
// assemble
// ---------------------------------------------------------------------------

const OUTSIDE = "- docs/x.md - the old route stays documented";
/** The heading the script lists its lines under, below the lines of Out of scope an author wrote. */
const KEPT = "#### References kept";
const withOutside = (text: string): string => text.replace("- the reset flow\n", `- the reset flow\n\n${KEPT}\n\n${OUTSIDE}\n`);
const L1 = ["### L1 - Local", "", "File: src/f2.ts", "", "shape"];
const AUTHOR_1 = rows(...tasks(task(1, { id: "T1", uses: "C1" }), task(2, { id: "T2", uses: "L1", delivers: "the L1 shape" })), ...L1, "<!-- NOTES -->", "FACT: src/f1.ts:3 | retry(2) | the loop retries twice", "OUTSIDE: docs/x.md | the old route stays documented");
const AUTHOR_2 = rows("A remark the author left.", ...tasks(task(9, { id: "T1", uses: "L1", covers: "AC2", dod: "it reads src/f1.ts" })), "### L1 - Page shape", "", "File: src/f9.ts", "</content>");
const ASSEMBLED = withOutside(
  planText(
    [task(1, { uses: "C1" }), task(2, { uses: "C2", delivers: "the C2 shape" }), task(9, { id: "T3", uses: "C3", covers: "AC2", dod: "it reads src/f1.ts", deps: "T1" })],
    [C1, ["### C2 - Local", "", "File: src/f2.ts", "", "shape"], ["### C3 - Page shape", "", "File: src/f9.ts"]],
  ),
);
const OWNERS = rows("C1 | frame", "C2 | 1", "C3 | 2", "T1 | 1", "T2 | 1", "T3 | 2");

test("assemble of a framed plan numbers the tasks T1.. in slice order when no task needs a later one, gives each local block the next free C<k> and renames it in the tasks of its author, computes every Depends-on, lists each OUTSIDE: line under the References kept heading of Out of scope and writes the facts, the owners and the briefs", () => {
  const result = build(["assemble", PLAN, "2=/a/two.md", "1=/a/one.md"], { ...FRAMED_FILES, "/a/one.md": AUTHOR_1, "/a/two.md": AUTHOR_2, [`${DIR}/notes-2.md`]: "stale\n", [`${DIR}/gaps.md`]: "stale\n" });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("assembled: 3 tasks", "NEXT: judge"));
  assert.equal(result.fs.readText(PLAN), ASSEMBLED);
  assert.deepEqual(depends(result.fs.readText(PLAN)), ["none", "none", "T1"]);
  assert.equal(result.fs.readText(`${DIR}/owners.md`), OWNERS);
  assert.equal(result.fs.readText(`${DIR}/notes-1.md`), "FACT: src/f1.ts:3 | retry(2) | the loop retries twice\n");
  assert.deepEqual([result.fs.exists(`${DIR}/notes-2.md`), result.fs.exists(`${DIR}/gaps.md`)], [false, false]);
  const first = result.fs.readText(`${DIR}/slice-1.md`) ?? "";
  assert.deepEqual([first.includes("### T1 - Task 1"), first.includes("### T2 - Task 2"), first.includes("### T3 - Task 9"), first.includes("### C2 - Local"), first.includes("### C3 - Page shape")], [true, true, false, true, false]);
  assert.equal((result.fs.readText(`${DIR}/slice-2.md`) ?? "").includes("### T3 - Task 9"), true);
});

/** Five tasks whose order no author wrote: T2 shares a file with T1, T3 consumes the block T1 writes, T4 reads a file of T3 and shares one with T1 and T2, T5 touches nothing of the others. */
const GRAPH = [
  task(1, { id: "T7", uses: "C1", covers: "AC1, AC2", files: "src/f1.ts, src/session.ts", deps: "T4" }),
  task(2, { id: "A", files: "src/session.ts" }),
  task(3, { id: "T1", uses: "C1", files: "src/form.ts", deps: "T5" }),
  task(4, { id: "T2", files: "src/page.ts, src/session.ts", dod: "the page renders the form of `src/form.ts`" }),
  task(5, { id: "T3", files: "docs/notes.md" }),
];

test("assemble of an unframed plan takes the whole author file as the plan, numbers its tasks in order and computes every Depends-on from Files and contract use: a shared file, a contract writer and its consumer, a path read in a DoD, a redundant edge dropped and an unrelated task left on none", () => {
  const result = build(["assemble", PLAN, "1=/a/one.md"], { [STATE]: stateOf(), "/a/one.md": `${planText(GRAPH)}<!-- NOTES -->\nFACT: src/f1.ts:1 | x | y\nOUTSIDE: docs/x.md | the old route stays documented\n` });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("assembled: 5 tasks", "shared: src/session.ts | T1, T2, T4", "NEXT: judge"));
  assert.deepEqual(depends(result.fs.readText(PLAN)), ["none", "T1", "T1", "T2, T3", "none"]);
  assert.deepEqual(headings(result.fs.readText(PLAN)), ["### T1 - Task 1", "### T2 - Task 2", "### T3 - Task 3", "### T4 - Task 4", "### T5 - Task 5", "### C1 - Retry"]);
  assert.equal((result.fs.readText(PLAN) ?? "").includes(`- the reset flow\n\n${KEPT}\n\n${OUTSIDE}\n\n## Tasks\n`), true);
  assert.equal(result.fs.readText(`${DIR}/owners.md`), rows("T1 | 1", "T2 | 1", "T3 | 1", "T4 | 1", "T5 | 1", "C1 | 1"));
  assert.deepEqual([result.fs.readText(`${DIR}/notes-1.md`), result.fs.exists(`${DIR}/slice-1.md`)], ["FACT: src/f1.ts:1 | x | y\n", false]);
});

/** A frame whose shared block is declared in a file of slice 2, and the two author files: the task of slice 1 uses the block, the task of slice 2 writes it. */
const LATE = { ...FRAMED_FILES, [PLAN]: FRAMED.replace("File: src/f1.ts", "File: src/f9.ts") };
const KEEPS = ["<!-- NOTES -->", "OUTSIDE: docs/x.md | the old route stays documented"];
const CONSUMER = (given: TaskGiven = {}): string => rows(...task(1, { id: "T1", uses: "C1", files: "src/f2.ts", ...given }), ...KEEPS);
const WRITER = (given: TaskGiven = {}): string => rows(...task(9, { id: "T1", uses: "C1", covers: "AC2", files: "src/f9.ts", ...given }));

test("assemble puts a task behind the task of a later slice that writes the contract block it uses: the tasks are numbered in that order, the consumer depends on its writer and each owner follows its task", () => {
  const result = build(["assemble", PLAN, "1=/a/one.md", "2=/a/two.md"], { ...LATE, "/a/one.md": CONSUMER(), "/a/two.md": WRITER() });
  assert.deepEqual([result.exit, result.stderr, result.stdout], [0, "", rows("assembled: 2 tasks", "NEXT: judge")]);
  assert.deepEqual(headings(result.fs.readText(PLAN)), ["### T1 - Task 9", "### T2 - Task 1", "### C1 - Retry"]);
  assert.deepEqual(depends(result.fs.readText(PLAN)), ["none", "T1"]);
  assert.equal(result.fs.readText(`${DIR}/owners.md`), rows("C1 | frame", "T1 | 2", "T2 | 1"));
  assert.deepEqual([(result.fs.readText(`${DIR}/slice-1.md`) ?? "").includes("### T2 - Task 1"), (result.fs.readText(`${DIR}/slice-2.md`) ?? "").includes("### T1 - Task 9")], [true, true]);
});

test("assemble puts a task behind the task of a later slice that creates the file its DoD names, in place of a defect its author could not fix", () => {
  const result = build(["assemble", PLAN, "1=/a/one.md", "2=/a/two.md"], { ...FRAMED_FILES, "/a/one.md": rows(...task(1, { id: "T1", uses: "C1", dod: "it calls the helper of src/f9.ts" }), ...KEEPS), "/a/two.md": rows(...task(9, { id: "T1", covers: "AC2" })) });
  assert.deepEqual([result.exit, result.stderr, result.stdout], [0, "", rows("assembled: 2 tasks", "NEXT: judge")]);
  assert.deepEqual([headings(result.fs.readText(PLAN)), depends(result.fs.readText(PLAN))], [["### T1 - Task 9", "### T2 - Task 1", "### C1 - Retry"], ["none", "T1"]]);
});

const CYCLE = "FIX: cycle: T1 needs C1 of T2, T2 needs src/f2.ts of T1 - no order builds each after what it needs: move a contract block or a file so that one of them needs nothing of the next";

test("two tasks of two slices that need each other are one defect of the frame, whose owner can move the shape: the tasks keep their order and the cycle goes to the architect", () => {
  const result = build(["assemble", PLAN, "1=/a/one.md", "2=/a/two.md"], { ...LATE, "/a/one.md": CONSUMER(), "/a/two.md": WRITER({ dod: "it renders what src/f2.ts returns" }) });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("assembled: 2 tasks", "NEXT: fix | defects", ...fixBlock("frame", [DECISIONS, findings("frame")], " | add: answered | add: input")));
  assert.equal(result.fs.readText(`${DIR}/fix-in-frame.md`), `${CYCLE}\n`);
  assert.deepEqual(headings(result.fs.readText(PLAN)), ["### T1 - Task 1", "### T2 - Task 9", "### C1 - Retry"]);
});

test("a ring of tasks one author wrote goes to that author, and an apply that leaves it is refused", () => {
  const two = rows(...tasks(task(8, { id: "T1", uses: "L1", covers: "AC2", files: "src/f8.ts" }), task(9, { id: "T2", uses: "L1", files: "src/f9.ts", dod: "it renders what src/f8.ts returns" })), "### L1 - Page shape", "", "File: src/f9.ts");
  const at = session({ ...FRAMED_FILES, [`${ROOT}/src/f8.ts`]: "x\n", "/a/one.md": rows(...task(1, { id: "T1", uses: "C1" }), ...KEEPS), "/a/two.md": two });
  const result = at.run("assemble", PLAN, "1=/a/one.md", "2=/a/two.md");
  assert.equal(result.stdout, rows("assembled: 3 tasks", "NEXT: fix | defects", ...fixBlock("2", [`brief: ${DIR}/slice-2.md`, findings("2")])));
  assert.equal(at.fs.readText(`${DIR}/fix-in-2.md`), "FIX: cycle: T2 needs C2 of T3, T3 needs src/f8.ts of T2 - no order builds each after what it needs: move a contract block or a file so that one of them needs nothing of the next\n");
  at.fs.writeBytes("/a/fix.md", new TextEncoder().encode(rows("@@ EDIT", "- Delivers: thing 8", "@@ WITH", "- Delivers: the page", "@@ END", "fix: T2 - reworded")));
  const still = at.run("apply", PLAN, "2=/a/fix.md");
  assert.deepEqual([still.exit, still.stderr.startsWith("FIX: owner 2: cycle: T2 needs C2 of T3")], [4, true]);
  at.fs.writeBytes("/a/fix.md", new TextEncoder().encode(rows("@@ EDIT", "- DoD: it renders what src/f8.ts returns", "@@ WITH", "- DoD: it renders the page", "@@ END", "fix: T3 - reads nothing of T2")));
  assert.equal(at.run("apply", PLAN, "2=/a/fix.md").stdout, rows("applied: 1 edits", "NEXT: judge"));
  assert.deepEqual([headings(at.fs.readText(PLAN)), depends(at.fs.readText(PLAN))], [["### T1 - Task 1", "### T2 - Task 9", "### T3 - Task 8", "### C1 - Retry", "### C2 - Page shape"], ["none", "none", "T2"]]);
});

test("assemble reads a task id an author wrote in a Delivers, Verification or DoD line through the new numbers: the id of its own slice, outside backticks, and no plain word", () => {
  const two = rows(...tasks(task(8, { id: "T1", covers: "AC2", files: "src/f8.ts" }), task(9, { id: "T2", delivers: "the page T1 opens, and the type `T1` it exports, for T1.", dod: "it works as T1 does" }).map((line) => (line.startsWith("- Verification:") ? "- Verification: npm test -> green, as T1 is" : line))));
  const result = build(["assemble", PLAN, "1=/a/one.md", "2=/a/two.md"], { ...FRAMED_FILES, "/a/one.md": rows(...tasks(task(1, { id: "T1", uses: "C1" }), task(2, { id: "T2", delivers: "what T1 starts" })), ...KEEPS), "/a/two.md": two });
  const text = (result.fs.readText(PLAN) ?? "").split("\n");
  assert.deepEqual(
    text.filter((line) => /T\d/.test(line) && /^- (Delivers|Verification|DoD):/.test(line)),
    ["- Delivers: what T1 starts", "- Delivers: the page T3 opens, and the type `T1` it exports, for T3.", "- Verification: npm test -> green, as T3 is", "- DoD: it works as T3 does"],
  );
});

test("apply reads the task ids of the plan text through the new numbers when a fix adds a task", () => {
  const plan = WRITTEN().replace("- Delivers: thing 3", "- Delivers: the caller of what T2 builds");
  const fix = rows("@@ EDIT", ...task(2), "@@ WITH", ...task(5, { id: "NEW1", files: "src/f5.ts" }), "", ...task(2, { delivers: "what NEW1 prepares" }), "@@ END", "fix: T2 - split in two");
  const result = build(["apply", PLAN, "1=/a/fix.md"], { [PLAN]: plan, [STATE]: stateOf(), "/a/fix.md": fix });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.deepEqual((result.fs.readText(PLAN) ?? "").split("\n").filter((line) => line.startsWith("- Delivers:")), ["- Delivers: thing 1", "- Delivers: thing 5", "- Delivers: what T2 prepares", "- Delivers: the caller of what T3 builds"]);
});

const NO_SOURCE = 'the frontmatter holds no "source: <plan path>" line - write it, the plan path as its value';

test("assemble refuses the whole plan of an unframed change whose frontmatter names no source (the plan gate would take it for a plan written outside the planner), and apply a fix that drops the line", () => {
  const bare = build(["assemble", PLAN, "1=/a/one.md"], { [STATE]: stateOf(), "/a/one.md": WRITTEN().replace(`source: ${PLAN}\n`, "issue: none\n") });
  assert.deepEqual([bare.exit, bare.stdout, bare.stderr, bare.fs.exists(PLAN)], [4, "", `FIX: slice 1: ${NO_SOURCE}\n`, false]);
  const dropped = build(["apply", PLAN, "1=/a/fix.md"], { [PLAN]: WRITTEN(), [STATE]: stateOf(), "/a/fix.md": rows("@@ EDIT", `source: ${PLAN}`, "@@ WITH", "issue: none", "@@ END", "fix: spec - the issue named") });
  assert.deepEqual([dropped.exit, dropped.stdout, dropped.stderr], [4, "", `FIX: owner 1: ${NO_SOURCE}\n`]);
  assert.equal(dropped.fs.readText(PLAN), WRITTEN());
});

test("the round counter starts again only at the assemble that follows a survey: a judge after a survey alone opens no round of the finished plan, and a plan assembled again with no survey keeps its rounds", () => {
  const at = session({ [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 1, await: "done" }), "/a/one.md": WRITTEN() });
  at.run("survey", PLAN);
  assert.deepEqual(roundOf(at.fs), ["round: 1", "await: done", "retry: 0"]);
  assert.equal(at.run("judge", PLAN).stdout, rows("NEXT: exit-plan"));
  at.fs.writeBytes(STATE, new TextEncoder().encode(stateOf({ round: 1, await: "done", surveyed: 1 })));
  assert.equal(at.run("assemble", PLAN, "1=/a/one.md").stdout, rows("assembled: 3 tasks", "NEXT: judge"));
  assert.equal(at.fs.readText(STATE), stateOf());
  assert.equal(at.run("judge", PLAN).stdout.split("\n")[0], "NEXT: dispatch | agent: viber:plan-judge | round: 1 | add: input | add: answered");

  const again = session({ [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 2, await: "done" }), "/a/one.md": WRITTEN() });
  assert.equal(again.run("assemble", PLAN, "1=/a/one.md").stdout, rows("assembled: 3 tasks", "NEXT: judge"));
  assert.deepEqual(roundOf(again.fs), ["round: 2", "await: done", "retry: 0"]);
  assert.equal(again.run("judge", PLAN).stdout, rows("NEXT: exit-plan"));
});

const fixBlock = (owner: string, more: string[], add = " | add: answered"): string[] =>
  owner === "frame"
    ? [`NEXT: dispatch | agent: viber:plan-architect | owner: frame${add}`, ...WRITING, "mode: fix", `outline: ${DIR}/outline.md`, `slices: ${DIR}/slices.md`, ...more, `out: ${DIR}/fix-frame.md`]
    : [`NEXT: dispatch | agent: viber:plan-author | owner: ${owner}${add}`, ...WRITING, "mode: fix", `slice: ${owner}`, ...more, `out: ${DIR}/fix-${owner}.md`];
const DECISIONS = `decisions: ${DIR}/decisions.md`;
const findings = (owner: string): string => `findings: ${DIR}/fix-in-${owner}.md`;
const TITLE = 'FIX: task T2: title opens with the commit type prefix "feat:" - drop it, the commit subject is "<id> - <title>" (Title)';

test("assemble writes a plan holding defects and sends each one to the owner of the text it names: a task to its slice, an uncovered criterion to the slice whose SLICE: line covers it, a shared block to the frame", () => {
  const one = rows(...task(1), "<!-- NOTES -->", "OUTSIDE: docs/x.md | the old route stays documented");
  const two = rows(...task(9, { id: "T1" }).map((line) => line.replace("### T1 - Task 9", "### T1 - feat: Task 9")));
  const result = build(["assemble", PLAN, "1=/a/one.md", "2=/a/two.md"], { ...FRAMED_FILES, "/a/one.md": one, "/a/two.md": two });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("assembled: 2 tasks", "NEXT: fix | defects", ...fixBlock("frame", [DECISIONS, findings("frame")], " | add: answered | add: input"), ...fixBlock("2", [`brief: ${DIR}/slice-2.md`, findings("2")])));
  assert.equal(result.fs.readText(`${DIR}/fix-in-frame.md`), rows("FIX: contract C1 is used by no task", "FIX: contract C1 declares src/f1.ts, held by T1, but no holder names C1 in Uses - its writer would never see the shape"));
  assert.equal(result.fs.readText(`${DIR}/fix-in-2.md`), rows(TITLE, "FIX: acceptance criterion AC2 is covered by no task"));
  assert.deepEqual(headings(result.fs.readText(PLAN)), ["### T1 - Task 1", "### T2 - feat: Task 9", "### C1 - Retry"]);
});

test("assemble accepts the dependency it computes on an Exclusive task: no author wrote that edge, so none could fix a refusal of it", () => {
  const alone = task(1, { uses: "C1", covers: "AC1, AC2" }).flatMap((line) => (line.startsWith("- Covers:") ? ["- Exclusive: true", line] : [line]));
  const result = build(["assemble", PLAN, "1=/a/one.md"], { [STATE]: stateOf(), "/a/one.md": planText([alone, task(2, { files: "src/f1.ts" })]) });
  assert.deepEqual([result.exit, result.stdout], [0, rows("assembled: 2 tasks", "shared: src/f1.ts | T1, T2", "NEXT: judge")]);
  assert.deepEqual(depends(result.fs.readText(PLAN)), ["none", "T1"]);
});

const unplaced = (path: string, target: string): string => `FIX: reach: ${path} refers to ${target} and sits in no task Files, no File map line and no Out of scope line - list it or write an OUTSIDE: line`;
/** A reach paths page over the written plan: docs/x.md and docs/z.md sit nowhere in it, src/f2.ts in a task, src/f9.ts on a File map line, docs/guide.md wherever the author puts it. */
const REACH_PAGE = rows("## src/f1.ts | retry", "docs/x.md | 2", "src/f2.ts | 1", "src/f9.ts | 1", "## src/f1.ts", "docs/guide.md | 3", "docs/x.md | 1", "docs/z.md | 1", "truncated: 400 lines, 200 kept in /c.md");
const PLACED_GUIDE = `${WRITTEN()}<!-- NOTES -->\nOUTSIDE: docs/guide.md | the guide keeps its wording\n`;

test("assemble places every file of the reach paths page: one in a task Files, on a File map line or on an Out of scope line is placed, and each other one is one defect naming its first target, sent to the author as a fix", () => {
  const result = build(["assemble", PLAN, "1=/a/one.md"], { [STATE]: stateOf(), [`${DIR}/reach-paths.md`]: REACH_PAGE, "/a/one.md": PLACED_GUIDE });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("assembled: 3 tasks", "NEXT: fix | defects", ...fixBlock("1", [findings("1")], " | add: answered | add: input")));
  assert.equal(result.fs.readText(`${DIR}/fix-in-1.md`), rows(unplaced("docs/x.md", "src/f1.ts | retry"), unplaced("docs/z.md", "src/f1.ts")));
});

test("assemble of a plan placing every reach file prints NEXT: judge, and one with no reach paths page checks no placement", () => {
  const author = `${PLACED_GUIDE}OUTSIDE: docs/x.md | the old route stays documented\n- OUTSIDE: docs/z.md | the page links the loop by name only\n`;
  const placed = build(["assemble", PLAN, "1=/a/one.md"], { [STATE]: stateOf(), [`${DIR}/reach-paths.md`]: REACH_PAGE, "/a/one.md": author });
  assert.equal(placed.stdout, rows("assembled: 3 tasks", "NEXT: judge"));
  assert.equal(build(["assemble", PLAN, "1=/a/one.md"], { [STATE]: stateOf(), "/a/one.md": WRITTEN() }).stdout, rows("assembled: 3 tasks", "NEXT: judge"));
});

test("an unplaced reach file of a framed plan goes to the author of the slice holding the file of its target, and to the frame owner when no slice holds it", () => {
  const page = rows("## src/f1.ts | retry", "docs/x.md | 2", "## src/f9.ts", "docs/q.md | 1", "## lib/other.ts | helper", "docs/w.md | 1");
  const result = build(["assemble", PLAN, "1=/a/one.md", "2=/a/two.md"], { ...FRAMED_FILES, [`${DIR}/reach-paths.md`]: page, "/a/one.md": AUTHOR_1, "/a/two.md": AUTHOR_2 });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("assembled: 3 tasks", "NEXT: fix | defects", ...fixBlock("frame", [DECISIONS, findings("frame")], " | add: answered | add: input"), ...fixBlock("2", [`brief: ${DIR}/slice-2.md`, findings("2")])));
  assert.deepEqual([result.fs.readText(`${DIR}/fix-in-frame.md`), result.fs.readText(`${DIR}/fix-in-2.md`)], [`${unplaced("docs/w.md", "lib/other.ts | helper")}\n`, `${unplaced("docs/q.md", "src/f9.ts")}\n`]);
});

test("apply places a reach file through an OUTSIDE: line of the fix file, listed under Out of scope, or through a task that lists it, and refuses a fix that leaves a file of its owner unplaced", () => {
  const planning = session({ [STATE]: stateOf(), [`${DIR}/reach-paths.md`]: REACH_PAGE, "/a/one.md": PLACED_GUIDE });
  planning.run("assemble", PLAN, "1=/a/one.md");
  const lists = ["@@ EDIT", "- Files: src/f3.ts", "@@ WITH", "- Files: src/f3.ts, docs/z.md", "@@ END", "fix: T3 - lists the page it changes"];
  planning.fs.writeBytes("/a/half.md", new TextEncoder().encode(rows(...lists)));
  const half = planning.run("apply", PLAN, "1=/a/half.md");
  assert.deepEqual([half.exit, half.stdout, half.stderr], [4, "", `${unplaced("docs/x.md", "src/f1.ts | retry").replace("FIX: ", "FIX: owner 1: ")}\n`]);
  planning.fs.writeBytes("/a/fix.md", new TextEncoder().encode(rows(...lists, "- OUTSIDE: docs/x.md | the old route stays documented", "OUTSIDE: no bar names no path")));
  const whole = planning.run("apply", PLAN, "1=/a/fix.md");
  assert.deepEqual([whole.exit, whole.stderr, whole.stdout], [0, "", rows("applied: 1 edits", "NEXT: judge")]);
  assert.equal((planning.fs.readText(PLAN) ?? "").includes(`- the reset flow\n\n${KEPT}\n\n- docs/guide.md - the guide keeps its wording\n${OUTSIDE}\n\n## Tasks\n`), true);
});

test("a fix file of OUTSIDE: lines alone holds no edit block: its lines are listed once, and in a review round they reach the changed file as one edit more", () => {
  const fix = rows("OUTSIDE: docs/x.md | the old route stays documented", "OUTSIDE: docs/x.md | the old route stays documented", "fix: spec - docs/x.md left outside");
  const result = build(["apply", PLAN, "1=/a/fix.md"], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 1, await: "fix" }), [`${DIR}/judge-1.md`]: "VERDICT: FAIL\nCRITICAL: spec | docs/x.md is in no scope | list it\n", "/a/fix.md": fix });
  assert.deepEqual([result.exit, result.stderr, result.stdout], [0, "", rows("applied: 0 edits", "NEXT: judge")]);
  assert.equal(result.fs.readText(PLAN), withOutside(WRITTEN()));
  assert.equal(result.fs.readText(`${DIR}/changed.md`), rows("fix: spec - docs/x.md left outside", "## edit 1", OUTSIDE));
});

test("assemble sends the GAP: lines of the authors to the architect once: the gaps file, the gaps count and the correction block, the frame correction recorded in the state", () => {
  const result = build(["assemble", PLAN, "1=/a/one.md", "2=/a/two.md"], { ...FRAMED_FILES, "/a/one.md": `${AUTHOR_1}- GAP: C1 names no error code\n`, "/a/two.md": `${AUTHOR_2.replace("</content>\n", "")}<!-- NOTES -->\nGAP: AC2 needs the admin role\n` });
  assert.equal(result.stdout, rows("assembled: 3 tasks", "gaps: 2", ...fixBlock("frame", [DECISIONS, `gaps: ${DIR}/gaps.md`], " | add: answered | add: input")));
  assert.equal(result.fs.readText(`${DIR}/gaps.md`), rows("GAP: slice 1 | C1 names no error code", "GAP: slice 2 | AC2 needs the admin role"));
  assert.equal(result.fs.readText(STATE), stateOf({ candidates: "/c.md", slices: 2, fixes: 1 }));
  assert.deepEqual(openSection(result.fs.readText(PLAN)), []);
});

test("the correction block of the architect names the defects of the frame beside the gaps of the authors (a fix that left a defect it was never shown would be refused), the defects of another owner waiting for the apply of the correction", () => {
  const one = rows(...task(1), "<!-- NOTES -->", "OUTSIDE: docs/x.md | the old route stays documented", "GAP: C1 names no error code");
  const two = rows(...task(9, { id: "T1" }).map((line) => line.replace("### T1 - Task 9", "### T1 - feat: Task 9")));
  const result = build(["assemble", PLAN, "1=/a/one.md", "2=/a/two.md"], { ...FRAMED_FILES, "/a/one.md": one, "/a/two.md": two });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("assembled: 2 tasks", "gaps: 1", ...fixBlock("frame", [DECISIONS, findings("frame"), `gaps: ${DIR}/gaps.md`], " | add: answered | add: input")));
  assert.equal(result.fs.readText(`${DIR}/fix-in-frame.md`), rows("FIX: contract C1 is used by no task", "FIX: contract C1 declares src/f1.ts, held by T1, but no holder names C1 in Uses - its writer would never see the shape"));
  assert.equal(result.fs.exists(`${DIR}/fix-in-2.md`), false);
});

test("a GAP: line arriving once the frame was corrected, or in a plan with no frame, becomes an open critical item of the plan and sends no block", () => {
  const late = build(["assemble", PLAN, "1=/a/one.md", "2=/a/two.md"], { ...FRAMED_FILES, [STATE]: stateOf({ slices: 2, fixes: 1 }), "/a/one.md": `${AUTHOR_1}GAP: C1 names no error code\n`, "/a/two.md": AUTHOR_2 });
  assert.equal(late.stdout, rows("assembled: 3 tasks", "NEXT: judge"));
  assert.deepEqual(openSection(late.fs.readText(PLAN)), ["- critical | plan | frame gap: C1 names no error code"]);
  assert.equal(late.fs.exists(`${DIR}/gaps.md`), false);
  const whole = build(["assemble", PLAN, "1=/a/one.md"], { [STATE]: stateOf(), "/a/one.md": `${WRITTEN()}<!-- NOTES -->\nGAP: the summary names no rollback\n` });
  assert.deepEqual(openSection(whole.fs.readText(PLAN)), ["- critical | plan | gap: the summary names no rollback"]);
});

test("assemble past 30 tasks prints the threshold line, and none once the user kept that many", () => {
  const big = planText(Array.from({ length: 31 }, (_, i) => task(i + 1, i === 0 ? { uses: "C1", covers: "AC1, AC2" } : {})));
  const lines = (accepted: string): string[] => build(["assemble", PLAN, "1=/a/one.md"], { [STATE]: stateOf({ accepted }), "/a/one.md": big }).stdout.split("\n").slice(0, -1);
  assert.deepEqual(lines("none"), ["assembled: 31 tasks", "threshold: 31 tasks, past 30", "NEXT: judge"]);
  assert.deepEqual(lines("30"), ["assembled: 31 tasks", "threshold: 31 tasks, past 30", "NEXT: judge"]);
  assert.deepEqual(lines("31"), ["assembled: 31 tasks", "NEXT: judge"]);
});

test("assemble exits 4 with one FIX line per author file it cannot use and leaves the plan as it was: a file that cannot be read, one with no task block, a task block with no heading", () => {
  const gone = build(["assemble", PLAN, "1=/a/one.md", "2=/a/gone.md"], { ...FRAMED_FILES, "/a/one.md": AUTHOR_1 });
  assert.deepEqual([gone.exit, gone.stdout, gone.stderr], [4, "", "FIX: slice 2: cannot read /a/gone.md\n"]);
  const result = build(["assemble", PLAN, "1=/a/one.md", "2=/a/two.md"], { ...FRAMED_FILES, "/a/one.md": "### L1 - Alone\n", "/a/two.md": rows(...task(1), "<!-- TASK -->", "- Uses: none", "<!-- /TASK -->") });
  assert.deepEqual([result.exit, result.stdout], [4, ""]);
  assert.equal(result.stderr, rows("FIX: slice 1: the author file holds no task block", 'FIX: slice 2: task block 2 has no "### <id> - <title>" heading'));
  assert.deepEqual([result.fs.readText(PLAN), result.fs.readText(`${DIR}/owners.md`)], [FRAMED, "C1 | frame\n"]);
  const whole = build(["assemble", PLAN, "1=/a/one.md"], { [STATE]: stateOf(), "/a/one.md": "# Title\n" });
  assert.deepEqual([whole.exit, whole.stderr, whole.fs.exists(PLAN)], [4, rows("FIX: slice 1: the plan text does not open with its frontmatter line ---", "FIX: slice 1: the plan text holds no task block"), false]);
});

test("assemble exits 5 when the plan file cannot be written", () => {
  const result = build(["assemble", "/gone/plan.md", "1=/a/one.md"], { [STATE]: stateOf({ plan: "/gone/plan.md" }), "/a/one.md": WRITTEN() });
  assert.deepEqual([result.exit, result.stdout, result.stderr], [5, "", "error: cannot write the plan file: /gone/plan.md\n"]);
});

// ---------------------------------------------------------------------------
// keep, fix
// ---------------------------------------------------------------------------

test("keep records the task count the user kept and prints it", () => {
  const result = build(["keep", PLAN, "34"], { [STATE]: stateOf({ slices: 3 }) });
  assert.deepEqual([result.exit, result.stdout], [0, "accepted: 34\n"]);
  assert.equal(result.fs.readText(STATE), stateOf({ slices: 3, accepted: "34" }));
});

test("fix prints the fix block of the frame owner of a framed plan and of the one author of an unframed plan, each asking for the lines to fix", () => {
  const framedPlan = build(["fix", PLAN], { ...FRAMED_FILES, [STATE]: stateOf({ input: "/s.md", slices: 2 }) });
  assert.equal(framedPlan.stdout, rows(...fixBlock("frame", [DECISIONS], " | add: lines | add: answered"), "input: /s.md"));
  const whole = build(["fix", PLAN], { [STATE]: stateOf(), [`${DIR}/notes-1.md`]: "FACT: a | b | c\n" });
  assert.equal(whole.stdout, rows(...fixBlock("1", [`notes: ${DIR}/notes-1.md`], " | add: lines | add: answered | add: input")));
  const fed = build(["fix", PLAN], { [STATE]: stateOf({ input: "/s.md" }) });
  assert.equal(fed.stdout, rows(...fixBlock("1", [], " | add: lines | add: answered"), "input: /s.md"));
});

// ---------------------------------------------------------------------------
// apply outside a review round
// ---------------------------------------------------------------------------

test("apply before the review replaces the text of each edit block in order, numbers a task the fix adds and every task after it, moves the open items and the owners with them, computes every Depends-on again and prints NEXT: judge", () => {
  const plan = WRITTEN().replace("## Tasks\n", "## Open items\n\n- note | T3 | name the cap\n\n## Tasks\n");
  const fix = rows("@@ EDIT", ...task(2), "@@ WITH", ...task(2), "", ...task(5, { id: "NEW", files: "src/f2.ts", deps: "T9" }), "@@ END", "fix: T2 - split in two", "@@ EDIT", "- the login keeps its route   ", "@@ WITH", "- the login keeps its route and its name", "- the audit stays", "@@ END", "fix: spec - the audit added");
  const result = build(["apply", PLAN, "1=/a/fix.md"], { [PLAN]: plan, [STATE]: stateOf(), "/a/fix.md": fix, [`${DIR}/owners.md`]: rows("T1 | 1", "T2 | 1", "T3 | 1", "C1 | 1") });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("applied: 2 edits", "NEXT: judge"));
  const text = result.fs.readText(PLAN);
  assert.deepEqual(headings(text), ["### T1 - Task 1", "### T2 - Task 2", "### T3 - Task 5", "### T4 - Task 3", "### C1 - Retry"]);
  assert.deepEqual(depends(text), ["none", "none", "T2", "none"]);
  assert.deepEqual(openSection(text), ["- note | T4 | name the cap"]);
  assert.equal((text ?? "").includes("- the login keeps its route and its name\n- the audit stays\n"), true);
  assert.equal(result.fs.readText(`${DIR}/owners.md`), rows("T1 | 1", "T2 | 1", "T3 | 1", "T4 | 1", "C1 | 1"));
  assert.equal(result.fs.exists(`${DIR}/changed.md`), false);
});

test("apply refuses whole a fix whose candidate plan holds a script defect: exit 4 on the defect naming its owner, and nothing written", () => {
  const fix = rows("@@ EDIT", "### T2 - Task 2", "@@ WITH", "### T2 - feat: Task 2", "@@ END", "fix: T2 - retitled", "@@ EDIT", "1. First criterion.", "@@ WITH", "1. First criterion, sharper.", "@@ END", "fix: AC1 - sharper");
  const result = build(["apply", PLAN, "1=/a/fix.md"], { [PLAN]: WRITTEN(), [STATE]: stateOf(), "/a/fix.md": fix });
  assert.deepEqual([result.exit, result.stdout, result.stderr], [4, "", `${TITLE.replace("FIX: ", "FIX: owner 1: ")}\n`]);
  assert.equal(result.fs.readText(PLAN), WRITTEN());
  assert.equal(result.fs.exists(`${DIR}/owners.md`), false);
});

test("apply exits 4 and writes nothing when one edit matches no text or more than one place, naming each on a FIX line of its owner", () => {
  const fix = rows("@@ EDIT", "1. First criterion.", "@@ WITH", "1. First.", "@@ END", "@@ EDIT", "", "@@ WITH", "x", "@@ END", "@@ EDIT", "no such line", "@@ WITH", "y", "@@ END", "fix: AC1 - shortened");
  const result = build(["apply", PLAN, "1=/a/fix.md"], { [PLAN]: WRITTEN(), [STATE]: stateOf(), "/a/fix.md": fix });
  assert.deepEqual([result.exit, result.stdout], [4, ""]);
  assert.match(result.stderr, /^FIX: owner 1: edit 2: its text occurs \d+ times in the plan, it must occur once: \nFIX: owner 1: edit 3: its text occurs 0 times in the plan, it must occur once: no such line\n$/);
  assert.equal(result.fs.readText(PLAN), WRITTEN());
});

const BLOCK = "a block is @@ EDIT, the text to replace, @@ WITH, the new text, @@ END";

// [case, the fix file, the FIX line below its owner]
for (const [name, fix, line] of [
  ["no edit block", "fix: nothing\n", "the fix file holds no @@ EDIT block"],
  ["neither an edit block nor a fix, unfixed or GAP line", "nothing to say\n", "the fix file holds no @@ EDIT block"],
  ["an edit block never closed", "@@ EDIT\nx\n@@ WITH\ny\n", "the last @@ EDIT block of the fix file has no @@ END line"],
  ["a block opened before the one above it closed", "@@ EDIT\n1. First criterion.\n@@ WITH\n1. First.\n@@ EDIT\n2. Second criterion.\n@@ END\nfix: AC1 - shortened\n", `line 5 of the fix file: @@ EDIT is out of place - ${BLOCK}`],
  ["a block closed before its @@ WITH line", "@@ EDIT\n1. First criterion.\n@@ END\nfix: AC1 - dropped\n", `line 3 of the fix file: @@ END is out of place - ${BLOCK}`],
  ["no fix line outside its blocks", "@@ EDIT\n1. First criterion.\n@@ WITH\n1. First.\nfix: AC1 - shortened\n@@ END\n", "the fix file holds no fix: line outside its blocks - add one per fix applied, below the @@ END line of its block"],
  ["a task added under an id the plan holds", `@@ EDIT\n### T2 - Task 2\n@@ WITH\n### T3 - Task 2\n@@ END\nfix: T2 - renamed\n`, "two task blocks carry the id T3 - give a task you add an id no task of the plan holds, the script numbers the tasks"],
] as [string, string, string][]) {
  test(`apply of a fix file with ${name} exits 4 on its FIX line and leaves the plan as it was`, () => {
    const result = build(["apply", PLAN, "1=/a/fix.md"], { [PLAN]: WRITTEN(), [STATE]: stateOf(), "/a/fix.md": fix });
    assert.deepEqual([result.exit, result.stdout, result.stderr], [4, "", `FIX: owner 1: ${line}\n`]);
    assert.equal(result.fs.readText(PLAN), WRITTEN());
  });
}

test("apply once the review is over prints NEXT: exit-plan and the open items, opening no round more (a change the user asked for at the approval)", () => {
  const plan = WRITTEN().replace("## Tasks\n", "## Open items\n\n- note | T2 | the helper has no caller\n\n## Tasks\n");
  const files = { [PLAN]: plan, "/a/fix.md": rows("@@ EDIT", "- Delivers: thing 3", "@@ WITH", "- Delivers: the report", "@@ END", "fix: T3 - renamed") };
  const result = build(["apply", PLAN, "1=/a/fix.md"], { ...files, [STATE]: stateOf({ round: 1, await: "done" }) });
  assert.equal(result.stdout, rows("applied: 1 edits", "NEXT: exit-plan", "OPEN: note | T2 | the helper has no caller"));
  assert.deepEqual(roundOf(result.fs), ["round: 1", "await: done", "retry: 0"]);
  // Between the two rounds the same call is no end of the review: round 2 is still due.
  assert.equal(build(["apply", PLAN, "1=/a/fix.md"], { ...files, [STATE]: stateOf({ round: 1 }) }).stdout, rows("applied: 1 edits", "NEXT: judge"));
});

test("open once the review is over gives up a change made after it: the plan records that the change was not applied and the answer is NEXT: exit-plan, never a question (a fix of the user's change that cannot be had)", () => {
  const at = session({ [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 2, await: "done" }) });
  for (const _ of [1, 2]) {
    const opened = at.run("open", PLAN);
    assert.deepEqual([opened.exit, opened.stderr], [0, ""]);
    assert.equal(opened.stdout, rows("NEXT: exit-plan", "OPEN: critical | plan | a change asked for after the review was not applied"));
  }
  assert.deepEqual(openSection(at.fs.readText(PLAN)), ["- critical | plan | a change asked for after the review was not applied"]);
  assert.deepEqual(roundOf(at.fs), ["round: 2", "await: done", "retry: 0"]);
});

test("apply of a fix file that cannot be read exits 4 on a FIX line naming its owner", () => {
  const result = build(["apply", PLAN, "1=/a/none.md"], { [PLAN]: WRITTEN(), [STATE]: stateOf() });
  assert.deepEqual([result.exit, result.stdout, result.stderr], [4, "", "FIX: owner 1: cannot read /a/none.md\n"]);
});

/** The assembled framed plan and its work files: T1 and T2 of slice 1, T3 of slice 2, C1 of the frame. */
const BUILT = { ...FRAMED_FILES, [PLAN]: ASSEMBLED, [`${DIR}/owners.md`]: OWNERS, [STATE]: stateOf({ slices: 2 }) };
const DELIVERS_3 = rows("@@ EDIT", "- Covers: AC2", "@@ WITH", "- Covers: AC2", "- Hard: the role is not settled", "@@ END", "fix: T3 - marked hard");

test("a GAP: line of the frame owner naming a task goes to the author of that task: NEXT: fix | gaps, its fix block and the line in its fix-in file", () => {
  const fix = rows("@@ EDIT", "retry(n)", "@@ WITH", "retry(n, delay)", "@@ END", "fix: C1 - the delay added", "GAP: T3 | call retry with the delay", "- GAP: T1 | pass the delay through");
  const result = build(["apply", PLAN, "frame=/a/fix.md"], { ...BUILT, "/a/fix.md": fix });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("applied: 1 edits", "NEXT: fix | gaps", ...fixBlock("1", [`brief: ${DIR}/slice-1.md`, findings("1")]), ...fixBlock("2", [`brief: ${DIR}/slice-2.md`, findings("2")])));
  assert.deepEqual([result.fs.readText(`${DIR}/fix-in-1.md`), result.fs.readText(`${DIR}/fix-in-2.md`)], ["GAP: T1 | pass the delay through\n", "GAP: T3 | call retry with the delay\n"]);
  assert.equal((result.fs.readText(`${DIR}/slice-1.md`) ?? "").includes("retry(n, delay)"), true);
  assert.deepEqual(roundOf(result.fs), ["round: 0", "await: none", "retry: 0"]);
});

test("a GAP: line of a slice author naming the frame goes to the architect once; after that, and a gap sent to a task of another author, stays in the plan as an open critical item", () => {
  const fix = `${DELIVERS_3}GAP: frame | AC2 never says who may see the page\nGAP: T1 | the loop should export retry\nGAP: C1 | names no error code\nGAP: no bar at all\n`;
  const first = build(["apply", PLAN, "2=/a/fix.md"], { ...BUILT, "/a/fix.md": fix });
  assert.equal(first.stdout, rows("applied: 1 edits", "NEXT: fix | gaps", ...fixBlock("frame", [DECISIONS, findings("frame")], " | add: answered | add: input")));
  assert.equal(first.fs.readText(`${DIR}/fix-in-frame.md`), "GAP: frame | AC2 never says who may see the page\n");
  assert.deepEqual(openSection(first.fs.readText(PLAN)), ["- critical | T1 | gap: the loop should export retry", "- critical | plan | gap: C1 - names no error code", "- critical | plan | gap: no bar at all"]);
  assert.equal(first.fs.readText(STATE), stateOf({ slices: 2, fixes: 1 }));
  const late = build(["apply", PLAN, "2=/a/fix.md"], { ...BUILT, [STATE]: stateOf({ slices: 2, fixes: 1 }), "/a/fix.md": `${DELIVERS_3}GAP: frame | AC2 never says who may see the page\n` });
  assert.equal(late.stdout, rows("applied: 1 edits", "NEXT: judge"));
  assert.deepEqual(openSection(late.fs.readText(PLAN)), ["- critical | plan | frame gap: AC2 never says who may see the page"]);
});

test("a fix file of GAP: lines alone holds no edit block and is applied as it is", () => {
  const result = build(["apply", PLAN, "frame=/a/fix.md"], { ...BUILT, "/a/fix.md": "GAP: T3 | cover the admin role\n" });
  assert.deepEqual([result.exit, result.stdout.split("\n").slice(0, 2)], [0, ["applied: 0 edits", "NEXT: fix | gaps"]]);
  assert.equal(result.fs.readText(PLAN), ASSEMBLED);
});

/** The assembled plan with a defect of slice 2 in it, as assemble may leave one beside the gaps it sends to the architect. */
const DEFECTIVE = ASSEMBLED.replace("### T3 - Task 9", "### T3 - feat: Task 9");
const TITLE_3 = TITLE.replace("T2", "T3");

test("apply of the frame correction leaves a defect another owner held before it to that owner (NEXT: fix | defects and its block), and refuses a defect of the frame owner itself", () => {
  const result = build(["apply", PLAN, "frame=/a/fix.md"], { ...BUILT, [PLAN]: DEFECTIVE, "/a/fix.md": rows("@@ EDIT", "retry(n)", "@@ WITH", "retry(n, delay)", "@@ END", "fix: C1 - the delay added") });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("applied: 1 edits", "NEXT: fix | defects", ...fixBlock("2", [`brief: ${DIR}/slice-2.md`, findings("2")])));
  assert.equal(result.fs.readText(`${DIR}/fix-in-2.md`), `${TITLE_3}\n`);
  const own = build(["apply", PLAN, "frame=/a/fix.md"], { ...BUILT, [PLAN]: DEFECTIVE, "/a/fix.md": rows("@@ EDIT", "File: src/f1.ts", "@@ WITH", "File: src/gone.ts", "@@ END", "fix: C1 - moved") });
  assert.deepEqual([own.exit, own.stdout, own.stderr], [4, "", "FIX: owner frame: contract C1 declares src/gone.ts, which no task creates - put it in the Files of the task that writes the shape\n"]);
  assert.equal(own.fs.readText(PLAN), DEFECTIVE);
});

test("apply of the owner of a defect must leave none of its own: the defect still there is refused on a line naming that owner, and a new defect in the text of an owner no gap was sent to is refused on every owner of the call", () => {
  const still = build(["apply", PLAN, "2=/a/fix.md"], { ...BUILT, [PLAN]: DEFECTIVE, "/a/fix.md": DELIVERS_3 });
  assert.deepEqual([still.exit, still.stderr], [4, `${TITLE_3.replace("FIX: ", "FIX: owner 2: ")}\n`]);
  const fresh = build(["apply", PLAN, "frame=/a/f.md", "2=/a/fix.md"], { ...BUILT, "/a/fix.md": DELIVERS_3, "/a/f.md": rows("@@ EDIT", "2. Second criterion.", "@@ WITH", "2. Second criterion.", "3. Third criterion.", "@@ END", "fix: spec - a criterion added") });
  assert.deepEqual([fresh.exit, fresh.stderr], [4, "FIX: owner frame: acceptance criterion AC3 is covered by no task\n"]);
});

// ---------------------------------------------------------------------------
// The review rounds
// ---------------------------------------------------------------------------

const judgeBlock = (round: number, more: string[] = []): string[] => [`NEXT: dispatch | agent: viber:plan-judge | round: ${round} | add: input | add: answered`, `plan: ${PLAN}`, `round: ${round}`, ...more, `out: ${DIR}/judge-${round}.md`];
const ownFix = fixBlock("1", [findings("1")], " | add: answered | add: input");
const CRITICAL_T1 = "CRITICAL: T1 | the DoD contradicts AC1 | name the session in the DoD";
const CRITICAL_AC2 = "CRITICAL: AC2 | no task proves it | add a Covers";
const JUDGE_FAIL = rows("VERDICT: FAIL", CRITICAL_T1, `  - ${CRITICAL_AC2}`, "NOTE: T2 | the helper has no caller yet");
const FIX_T1 = rows("@@ EDIT", "- Delivers: thing 1", "@@ WITH", "- Delivers: the session", "@@ END", "fix: T1 - the DoD names the session");

test("judge opens round 1: it counts the round, awaits the verdict and prints the judge block, a summary file on its input line", () => {
  const text = build(["judge", PLAN], { [PLAN]: WRITTEN(), [STATE]: stateOf() });
  assert.deepEqual([text.exit, text.stderr], [0, ""]);
  assert.equal(text.stdout, rows(...judgeBlock(1)));
  assert.deepEqual(roundOf(text.fs), ["round: 1", "await: judge", "retry: 0"]);
  const file = build(["judge", PLAN], { [PLAN]: WRITTEN(), [STATE]: stateOf({ input: "/s.md", candidates: "/c.md" }) });
  assert.equal(file.stdout, rows("NEXT: dispatch | agent: viber:plan-judge | round: 1 | add: answered", `plan: ${PLAN}`, "round: 1", "input: /s.md", `out: ${DIR}/judge-1.md`));
});

test("judge of a plan file holding no task block exits 4 and opens no round", () => {
  const result = build(["judge", PLAN], { [PLAN]: FRAMED, [STATE]: stateOf() });
  assert.deepEqual([result.exit, result.stdout, result.stderr], [4, "", "FIX: the plan holds no task block\n"]);
  assert.deepEqual(roundOf(result.fs), ["round: 0", "await: none", "retry: 0"]);
});

test("judge while a verdict is awaited prints the block of the same round again and counts nothing, the changed file named in round 2 when it exists", () => {
  const result = build(["judge", PLAN], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 2, await: "judge", retry: 1 }), [`${DIR}/changed.md`]: "fix: T1 - x\n" });
  assert.equal(result.stdout, rows(...judgeBlock(2, [`changed: ${DIR}/changed.md`])));
  assert.deepEqual(roundOf(result.fs), ["round: 2", "await: judge", "retry: 1"]);
});

for (const waits of ["fix", "gaps"]) {
  test(`judge while the round awaits its ${waits} exits 2 and names the two commands that close it, in round 2 as in round 1`, () => {
    for (const round of [1, 2]) {
      const result = build(["judge", PLAN], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round, await: waits }) });
      assert.deepEqual([result.exit, result.stdout, result.stderr], [2, "", `error: judge: the fix of round ${round} is open - run apply with its fix file, or open\n`]);
    }
  });
}

test("a third judge prints NEXT: exit-plan and no judge block, and judged with no open round exits 2: no command opens or accepts a round 3", () => {
  const at = session({ [PLAN]: WRITTEN(), [STATE]: stateOf(), "/a/judge.md": JUDGE_FAIL, "/a/fix.md": FIX_T1 });
  const outputs: string[] = [];
  const run = (...argv: string[]) => {
    const result = at.run(...argv);
    outputs.push(result.stdout);
    return result;
  };
  assert.equal(run("judge", PLAN).stdout, rows(...judgeBlock(1)));
  assert.match(run("judged", PLAN, "FAIL", "--out", "/a/judge.md").stdout, /^NEXT: fix \| round: 1$/m);
  assert.match(run("apply", PLAN, "1=/a/fix.md").stdout, /^NEXT: judge$/m);
  assert.equal(run("judge", PLAN).stdout, rows(...judgeBlock(2, [`changed: ${DIR}/changed.md`])));
  at.fs.writeBytes("/a/fix.md", new TextEncoder().encode(rows("@@ EDIT", "- Delivers: thing 2", "@@ WITH", "- Delivers: the helper", "@@ END", "fix: T1 - reworded")));
  assert.match(run("judged", PLAN, "FAIL", "--out", "/a/judge.md").stdout, /^NEXT: fix \| round: 2$/m);
  assert.match(run("apply", PLAN, "1=/a/fix.md").stdout, /^NEXT: exit-plan$/m);
  assert.deepEqual(roundOf(at.fs), ["round: 2", "await: done", "retry: 0"]);

  const third = run("judge", PLAN);
  assert.deepEqual([third.exit, third.stderr], [0, ""]);
  assert.equal(third.stdout.split("\n")[0], "NEXT: exit-plan");
  assert.deepEqual(third.stdout.split("\n").slice(1, -1).filter((line) => !line.startsWith("OPEN: ")), []);
  assert.deepEqual(roundOf(at.fs), ["round: 2", "await: done", "retry: 0"]);
  const late = run("judged", PLAN, "PASS", "--out", "/a/judge.md");
  assert.deepEqual([late.exit, late.stdout, late.stderr], [2, "", "error: no review round is open\n"]);
  assert.doesNotMatch(outputs.join(""), /round: 3|judge-3/);
  assert.equal(at.fs.exists(`${DIR}/judge-3.md`), false);
});

test("judged PASS writes the notes of the judge file into the Open items section, at most 3 per task and the rest as plan notes, copies the file and ends on NEXT: exit-plan with one OPEN line per item", () => {
  const judge = rows("VERDICT: PASS", "NOTE: T1 | one", "NOTE: T1 | two", "NOTE: T2 | the helper has no caller", "NOTE: T1 | three", "NOTE: T1 | four", "NOTE: plan | the summary names no rollback", "NOTE: C1 | the block names no error code", "NOTE: T9 | names no task", "NOTE: no bar at all");
  const result = build(["judged", PLAN, "PASS", "--out", "/a/judge.md"], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 1, await: "judge" }), "/a/judge.md": judge });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  const items = ["note | T1 | one", "note | T1 | two", "note | T1 | three", "note | T2 | the helper has no caller", "note | plan | the summary names no rollback", "note | plan | C1 - the block names no error code", "note | plan | T9 - names no task", "note | plan | no bar at all", "note | plan | (T1) four"];
  assert.equal(result.stdout, rows("judge: round 1 | PASS | critical: 0 | notes: 9", "NEXT: exit-plan", ...items.map((item) => `OPEN: ${item}`)));
  assert.deepEqual(openSection(result.fs.readText(PLAN)), items.map((item) => `- ${item}`));
  assert.equal(result.fs.readText(PLAN)?.replace(["## Open items", "", ...items.map((item) => `- ${item}`), "", ""].join("\n"), ""), WRITTEN());
  assert.equal(result.fs.readText(`${DIR}/judge-1.md`), judge);
  assert.deepEqual(roundOf(result.fs), ["round: 1", "await: done", "retry: 0"]);
});

test("a judge after a PASS of round 1 opens no second round of the text that passed: NEXT: exit-plan", () => {
  const at = session({ [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 1, await: "judge" }) });
  at.run("judged", PLAN, "PASS");
  assert.equal(at.run("judge", PLAN).stdout, rows("NEXT: exit-plan"));
  assert.deepEqual(roundOf(at.fs), ["round: 1", "await: done", "retry: 0"]);
});

test("judged PASS with no file leaves the plan as it was and ends on NEXT: exit-plan alone (a plan with no notes builds as before)", () => {
  const result = build(["judged", PLAN, "PASS"], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 1, await: "judge" }) });
  assert.equal(result.stdout, rows("judge: round 1 | PASS | critical: 0 | notes: 0", "NEXT: exit-plan"));
  assert.equal(result.fs.readText(PLAN), WRITTEN());
});

test("judged FAIL records the notes, copies the judge file and prints NEXT: fix with its round and the fix block of the plan's one author naming its critical lines as findings, a file holding a CRITICAL line failing whatever word came with it", () => {
  for (const word of ["FAIL", "PASS"]) {
    const result = build(["judged", PLAN, word, "--out", "/a/judge.md"], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 1, await: "judge", retry: 1 }), "/a/judge.md": `${JUDGE_FAIL}</content>\n` });
    assert.equal(result.stdout, rows("judge: round 1 | FAIL | critical: 2 | notes: 1", "NEXT: fix | round: 1", ...ownFix));
    assert.equal(result.fs.readText(`${DIR}/judge-1.md`), JUDGE_FAIL);
    assert.equal(result.fs.readText(`${DIR}/fix-in-1.md`), rows(CRITICAL_T1, CRITICAL_AC2));
    assert.deepEqual(openSection(result.fs.readText(PLAN)), ["- note | T2 | the helper has no caller yet"]);
    assert.deepEqual(roundOf(result.fs), ["round: 1", "await: fix", "retry: 0"]);
  }
});

test("judged FAIL on a framed plan sends each critical line to the owner of the text it names: a task to the author of its slice, a block to its owner, a criterion or the specification to the frame", () => {
  const judge = rows("VERDICT: FAIL", CRITICAL_T1, CRITICAL_AC2, "CRITICAL: T3 | reads a file it does not list | list it", "CRITICAL: C2 | the shape names no error | add one", "CRITICAL: spec | the goal contradicts the summary | reword it");
  const result = build(["judged", PLAN, "FAIL", "--out", "/a/judge.md"], { ...BUILT, [STATE]: stateOf({ slices: 2, round: 1, await: "judge" }), "/a/judge.md": judge });
  assert.equal(
    result.stdout,
    rows("judge: round 1 | FAIL | critical: 5 | notes: 0", "NEXT: fix | round: 1", ...fixBlock("frame", [DECISIONS, findings("frame")], " | add: answered | add: input"), ...fixBlock("1", [`brief: ${DIR}/slice-1.md`, findings("1")]), ...fixBlock("2", [`brief: ${DIR}/slice-2.md`, findings("2")])),
  );
  assert.equal(result.fs.readText(`${DIR}/fix-in-frame.md`), rows(CRITICAL_AC2, "CRITICAL: spec | the goal contradicts the summary | reword it"));
  assert.equal(result.fs.readText(`${DIR}/fix-in-1.md`), rows(CRITICAL_T1, "CRITICAL: C2 | the shape names no error | add one"));
  assert.equal(result.fs.readText(`${DIR}/fix-in-2.md`), "CRITICAL: T3 | reads a file it does not list | list it\n");
});

test("judged none the first time in a round asks for the same judge block again and keeps the round open, the plan untouched", () => {
  const result = build(["judged", PLAN, "none"], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 1, await: "judge" }) });
  assert.equal(result.stdout, rows("judge: round 1 | none | critical: 0 | notes: 0", "NEXT: redispatch", ...judgeBlock(1)));
  assert.deepEqual(roundOf(result.fs), ["round: 1", "await: judge", "retry: 1"]);
  assert.equal(result.fs.readText(PLAN), WRITTEN());
});

const UNREAD_FAIL: [string, string[], Record<string, string>][] = [
  ["no file", ["FAIL"], {}],
  ["a file that cannot be read", ["FAIL", "--out", "/a/none.md"], {}],
  ["a file holding no CRITICAL and no NOTE line", ["FAIL", "--out", "/a/judge.md"], { "/a/judge.md": "VERDICT: FAIL\nThe second task is wrong.\n" }],
];

// [case, argv after the plan, the files beside the plan]
for (const [name, argv, files] of UNREAD_FAIL) {
  test(`judged FAIL with ${name} counts nothing and writes nothing: it asks for the reply to be reported as none, the one report of it the plan gate takes as an answer to a FAIL`, () => {
    for (const retry of [0, 1]) {
      const result = build(["judged", PLAN, ...argv], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 2, await: "judge", retry }), ...files });
      assert.deepEqual([result.exit, result.stderr], [0, ""]);
      assert.equal(result.stdout, rows("judge: round 2 | FAIL | critical: 0 | notes: 0", "NEXT: judged | none"));
      assert.deepEqual(roundOf(result.fs), ["round: 2", "await: judge", `retry: ${retry}`]);
      assert.equal(result.fs.readText(PLAN), WRITTEN());
    }
  });
}

test("judged FAIL with a file holding NOTE lines and no CRITICAL line puts the notes into the plan before it asks for the none report, in either round and whether or not the judge was sent again (the none report names no file, so a note not placed here never reached the plan)", () => {
  const judge = rows("VERDICT: FAIL", "The second task is wrong.", "NOTE: T2 | name the stream in the DoD", "- NOTE: plan | the summary names no log format", "NOTE: T9 | no such task");
  const NOTES = ["- note | T2 | name the stream in the DoD", "- note | plan | the summary names no log format", "- note | plan | T9 - no such task"];
  for (const round of [1, 2]) {
    for (const retry of [0, 1]) {
      const result = build(["judged", PLAN, "FAIL", "--out", "/a/judge.md"], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round, await: "judge", retry }), "/a/judge.md": judge });
      assert.deepEqual([result.exit, result.stderr], [0, ""]);
      assert.equal(result.stdout, rows(`judge: round ${round} | FAIL | critical: 0 | notes: 3`, "NEXT: judged | none"));
      assert.deepEqual(roundOf(result.fs), [`round: ${round}`, "await: judge", `retry: ${retry}`]);
      assert.deepEqual(openSection(result.fs.readText(PLAN)), NOTES);
    }
  }
});

test("a round 2 judge failing the plan twice with notes and no critical line ends on NEXT: exit-plan with its notes in the plan beside the note that the review returned no usable result, each kept once", () => {
  const judge = rows("VERDICT: FAIL", "NOTE: T2 | name the stream in the DoD");
  const at = session({ [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 2, await: "judge" }), "/a/judge.md": judge });
  for (const argv of [["FAIL", "--out", "/a/judge.md"], ["none"], ["FAIL", "--out", "/a/judge.md"]]) assert.equal(at.run("judged", PLAN, ...argv).exit, 0);
  const NOTE = "note | plan | review round 2 returned no usable result";
  assert.equal(at.run("judged", PLAN, "none").stdout, rows("judge: round 2 | none | critical: 0 | notes: 0", "NEXT: exit-plan", "OPEN: note | T2 | name the stream in the DoD", `OPEN: ${NOTE}`));
  assert.deepEqual(openSection(at.fs.readText(PLAN)), ["- note | T2 | name the stream in the DoD", `- ${NOTE}`]);
});

test("a round 2 judge failing the plan twice with a file the script cannot use ends on NEXT: exit-plan through the none reports alone: the plan notes that the review returned no usable result, the review is over and a later judge or judged opens nothing", () => {
  const at = session({ [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 2, await: "judge" }), "/a/judge.md": "VERDICT: FAIL\nThe second task is wrong.\n" });
  const calls = [
    at.run("judged", PLAN, "FAIL", "--out", "/a/judge.md").stdout,
    at.run("judged", PLAN, "none").stdout,
    at.run("judged", PLAN, "FAIL", "--out", "/a/judge.md").stdout,
    at.run("judged", PLAN, "none").stdout,
  ];
  const told = rows("judge: round 2 | FAIL | critical: 0 | notes: 0", "NEXT: judged | none");
  const NOTE = "note | plan | review round 2 returned no usable result";
  assert.deepEqual(calls, [told, rows("judge: round 2 | none | critical: 0 | notes: 0", "NEXT: redispatch", ...judgeBlock(2)), told, rows("judge: round 2 | none | critical: 0 | notes: 0", "NEXT: exit-plan", `OPEN: ${NOTE}`)]);
  assert.doesNotMatch(calls.join(""), /^ASK:/m);
  assert.deepEqual(openSection(at.fs.readText(PLAN)), [`- ${NOTE}`]);
  assert.deepEqual(roundOf(at.fs), ["round: 2", "await: done", "retry: 0"]);
  assert.equal(at.run("judge", PLAN).stdout, rows("NEXT: exit-plan", `OPEN: ${NOTE}`));
  const late = at.run("judged", PLAN, "FAIL", "--out", "/a/judge.md");
  assert.deepEqual([late.exit, late.stderr], [2, "error: no review round is open\n"]);
});

test("a second judged none in round 1 stops with the plan unreviewed, and in round 2 notes that the review returned no usable result and ends on NEXT: exit-plan", () => {
  const first = build(["judged", PLAN, "none"], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 1, await: "judge", retry: 1 }) });
  assert.equal(first.stdout, rows("judge: round 1 | none | critical: 0 | notes: 0", "STOP: the plan stays unreviewed - no hand-off"));
  assert.equal(first.fs.readText(PLAN), WRITTEN());
  const second = build(["judged", PLAN, "none"], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 2, await: "judge", retry: 1 }) });
  assert.equal(second.stdout, rows("judge: round 2 | none | critical: 0 | notes: 0", "NEXT: exit-plan", "OPEN: note | plan | review round 2 returned no usable result"));
  assert.deepEqual(openSection(second.fs.readText(PLAN)), ["- note | plan | review round 2 returned no usable result"]);
  assert.deepEqual(roundOf(second.fs), ["round: 2", "await: done", "retry: 0"]);
});

test("judged DENIED in round 2 notes the refused call and ends on NEXT: exit-plan; in round 1 it exits 2, the refusal being the user\x27s to answer", () => {
  const second = build(["judged", PLAN, "DENIED"], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 2, await: "judge" }) });
  assert.equal(second.stdout, rows("judge: round 2 | DENIED | critical: 0 | notes: 0", "NEXT: exit-plan", "OPEN: note | plan | review round 2 did not run: a tool call was refused"));
  assert.deepEqual(roundOf(second.fs), ["round: 2", "await: done", "retry: 0"]);
  const first = build(["judged", PLAN, "DENIED"], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 1, await: "judge" }) });
  assert.deepEqual([first.exit, first.stdout, first.stderr], [2, "", "error: judged: a DENIED reply of round 1 is the user\x27s to answer - dispatch the judge block again or stop\n"]);
  assert.deepEqual(roundOf(first.fs), ["round: 1", "await: judge", "retry: 0"]);
});

test("apply answering the fix of round 1 writes the changed file (every fix line, then each edit under its number), records the critical problems no fix line names as open and prints NEXT: judge", () => {
  const fix = rows("@@ EDIT", "- Delivers: thing 1", "@@ WITH", "- Delivers: the session", "- Hard: lockout races", "@@ END", "  fix: T1 - the DoD names the session  ", "@@ EDIT", "- the login keeps its route", "@@ WITH", "@@ END", "- fix: T3 - a line dropped");
  const result = build(["apply", PLAN, "1=/a/fix.md"], { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 1, await: "fix" }), [`${DIR}/judge-1.md`]: JUDGE_FAIL, "/a/fix.md": fix });
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  assert.equal(result.stdout, rows("applied: 2 edits", "NEXT: judge"));
  assert.equal(result.fs.readText(`${DIR}/changed.md`), rows("fix: T1 - the DoD names the session", "fix: T3 - a line dropped", "## edit 1", "- Delivers: the session", "- Hard: lockout races", "## edit 2"));
  assert.deepEqual(openSection(result.fs.readText(PLAN)), ["- critical | plan | AC2 - no task proves it"]);
  assert.deepEqual(roundOf(result.fs), ["round: 1", "await: none", "retry: 0"]);
});

test("after judged FAIL of round 2 no later output of apply or open holds an ASK: line and each ends on NEXT: exit-plan and its OPEN lines", () => {
  const files = { [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 2, await: "judge" }), "/a/judge.md": JUDGE_FAIL };
  const fixes: Array<[string, string, string[]]> = [
    ["a fix of every critical problem", rows(FIX_T1.trimEnd(), "@@ EDIT", "2. Second criterion.", "@@ WITH", "2. Second criterion, proven.", "@@ END", "fix: AC2 - a task covers it"), ["note | T2 | the helper has no caller yet", "note | T1 | fixed after the last review: the DoD names the session", "note | plan | fixed after the last review: AC2 - a task covers it"]],
    ["a fix leaving one critical problem unfixed", rows(FIX_T1.trimEnd(), "unfixed: AC2 - the summary never says who may see it"), ["critical | plan | AC2 - no task proves it (not fixed: the summary never says who may see it)", "note | T2 | the helper has no caller yet", "note | T1 | fixed after the last review: the DoD names the session"]],
    ["a fix file of unfixed lines alone", rows("unfixed: T1 - needs the user\x27s decision", "unfixed: T3 - not in the review"), ["critical | T1 | the DoD contradicts AC1 (not fixed: needs the user\x27s decision)", "critical | plan | AC2 - no task proves it", "critical | T3 | not fixed: not in the review", "note | T2 | the helper has no caller yet"]],
  ];
  for (const [name, fix, items] of fixes) {
    const at = session({ ...files, "/a/fix.md": fix });
    assert.match(at.run("judged", PLAN, "FAIL", "--out", "/a/judge.md").stdout, /^NEXT: fix \| round: 2$/m, name);
    const applied = at.run("apply", PLAN, "1=/a/fix.md");
    assert.deepEqual([applied.exit, applied.stderr], [0, ""], name);
    assert.deepEqual(applied.stdout.split("\n").slice(1, -1), ["NEXT: exit-plan", ...items.map((item) => `OPEN: ${item}`)], name);
    assert.doesNotMatch(applied.stdout, /^ASK:/m, name);
    assert.deepEqual(openSection(at.fs.readText(PLAN)), items.map((item) => `- ${item}`), name);
    assert.deepEqual(roundOf(at.fs), ["round: 2", "await: done", "retry: 0"], name);
    assert.equal(at.fs.exists(`${DIR}/changed.md`), false, name);
    assert.equal(at.run("judge", PLAN).stdout.split("\n")[0], "NEXT: exit-plan", name);
  }

  const refused = session({ ...files, "/a/fix.md": rows("@@ EDIT", "### T2 - Task 2", "@@ WITH", "### T2 - feat: Task 2", "@@ END", "fix: T1 - retitled") });
  refused.run("judged", PLAN, "FAIL", "--out", "/a/judge.md");
  assert.deepEqual([refused.run("apply", PLAN, "1=/a/fix.md").exit, roundOf(refused.fs)], [4, ["round: 2", "await: fix", "retry: 0"]]);

  for (const at of [refused, session(files)]) {
    if (at !== refused) at.run("judged", PLAN, "FAIL", "--out", "/a/judge.md");
    const opened = at.run("open", PLAN);
    assert.deepEqual([opened.exit, opened.stderr], [0, ""]);
    assert.equal(opened.stdout, rows("NEXT: exit-plan", "OPEN: critical | T1 | the DoD contradicts AC1", "OPEN: critical | plan | AC2 - no task proves it", "OPEN: note | T2 | the helper has no caller yet"));
    assert.doesNotMatch(opened.stdout, /^ASK:/m);
    assert.deepEqual(roundOf(at.fs), ["round: 2", "await: done", "retry: 0"]);
  }
});

test("open after the fix of round 1 could not be applied records every critical problem of that round as open and prints NEXT: judge, the next judge opening round 2", () => {
  const at = session({ [PLAN]: WRITTEN(), [STATE]: stateOf({ round: 1, await: "fix" }), [`${DIR}/judge-1.md`]: JUDGE_FAIL, [`${DIR}/changed.md`]: "stale\n" });
  assert.equal(at.run("open", PLAN).stdout, rows("NEXT: judge"));
  assert.deepEqual(openSection(at.fs.readText(PLAN)), ["- critical | T1 | the DoD contradicts AC1", "- critical | plan | AC2 - no task proves it"]);
  assert.equal(at.run("judge", PLAN).stdout, rows(...judgeBlock(2)));
});

test("a fix of round 2 naming the place of a critical problem left open after round 1 closes that open item", () => {
  const open = WRITTEN().replace("## Tasks\n", "## Open items\n\n- critical | T1 | the DoD contradicts AC1\n- critical | plan | AC2 - no task proves it\n\n## Tasks\n");
  const result = build(["apply", PLAN, "1=/a/fix.md"], { [PLAN]: open, [STATE]: stateOf({ round: 2, await: "fix" }), [`${DIR}/judge-2.md`]: `VERDICT: FAIL\n${CRITICAL_T1}\n`, "/a/fix.md": FIX_T1 });
  assert.equal(result.stdout, rows("applied: 1 edits", "NEXT: exit-plan", "OPEN: critical | plan | AC2 - no task proves it", "OPEN: note | T1 | fixed after the last review: the DoD names the session"));
});

const FRAME_FIX = rows("@@ EDIT", "retry(n)", "@@ WITH", "retry(n, delay)", "@@ END", "fix: C1 - the delay added", "GAP: T3 | call retry with the delay");
const REVIEWED = (round: number) => ({ ...BUILT, [STATE]: stateOf({ slices: 2, round, await: "fix" }), [`${DIR}/judge-${round}.md`]: "VERDICT: FAIL\nCRITICAL: C1 | the shape names no delay | add it\n", "/a/frame.md": FRAME_FIX, "/a/two.md": DELIVERS_3 });

test("a review fix that sends a gap on keeps its round open for the owner it names: NEXT: fix | gaps, then that owner\x27s fix joins the changed file and the round ends on NEXT: judge", () => {
  const at = session(REVIEWED(1));
  const first = at.run("apply", PLAN, "frame=/a/frame.md");
  assert.equal(first.stdout, rows("applied: 1 edits", "NEXT: fix | gaps", ...fixBlock("2", [`brief: ${DIR}/slice-2.md`, findings("2")])));
  assert.deepEqual(roundOf(at.fs), ["round: 1", "await: gaps", "retry: 0"]);
  assert.equal(at.fs.readText(`${DIR}/pending.md`), "GAP: T3 | call retry with the delay\n");
  assert.deepEqual(openSection(at.fs.readText(PLAN)), []);
  const second = at.run("apply", PLAN, "2=/a/two.md");
  assert.equal(second.stdout, rows("applied: 1 edits", "NEXT: judge"));
  assert.equal(at.fs.readText(`${DIR}/changed.md`), rows("fix: C1 - the delay added", "fix: T3 - marked hard", "## edit 1", "retry(n, delay)", "## edit 2", "- Covers: AC2", "- Hard: the role is not settled"));
  assert.deepEqual([roundOf(at.fs), at.fs.exists(`${DIR}/pending.md`)], [["round: 1", "await: none", "retry: 0"], false]);
});

test("in round 2 the fix of an owner a gap was sent on to leaves its note too and ends on NEXT: exit-plan, and open in its place records the gap it still owed as an open critical item", () => {
  const fixed = session(REVIEWED(2));
  fixed.run("apply", PLAN, "frame=/a/frame.md");
  assert.equal(fixed.run("apply", PLAN, "2=/a/two.md").stdout, rows("applied: 1 edits", "NEXT: exit-plan", "OPEN: note | T3 | fixed after the last review: marked hard", "OPEN: note | plan | fixed after the last review: C1 - the delay added"));
  const given = session(REVIEWED(2));
  given.run("apply", PLAN, "frame=/a/frame.md");
  assert.equal(given.run("open", PLAN).stdout, rows("NEXT: exit-plan", "OPEN: critical | T3 | gap: call retry with the delay", "OPEN: note | plan | fixed after the last review: C1 - the delay added"));
  assert.deepEqual([roundOf(given.fs), given.fs.exists(`${DIR}/pending.md`)], [["round: 2", "await: done", "retry: 0"], false]);
});

// ---------------------------------------------------------------------------
// Misuse
// ---------------------------------------------------------------------------

// [case, argv, the error line, the state]: a refusal prints one error line on stderr and nothing on stdout.
for (const [name, argv, reason, state] of [
  ["an unknown command", ["constructor", PLAN], USAGE, {}],
  ["a command of the earlier pipeline", ["merge", PLAN], USAGE, {}],
  ["no plan", ["survey"], USAGE, {}],
  ["an unknown flag", ["survey", PLAN, "--nope"], "survey: unknown argument: --nope", {}],
  ["a flag with no value", ["survey", PLAN, "--input"], "survey: --input needs a value", {}],
  ["an argument to fix", ["fix", PLAN, "--gaps"], "fix: unexpected argument: --gaps", {}],
  ["keep with no count", ["keep", PLAN, "many"], "keep: name the task count the user kept", {}],
  ["assemble before any outline", ["assemble", PLAN, "1=/a/x.md"], "assemble: no outline cut this plan into slices - run outline first", { slices: 0 }],
  ["an assemble pair with no file", ["assemble", PLAN, "1="], "assemble: expected <slice>=<author file>, got: 1=", {}],
  ["an assemble pair of a slice the plan lacks", ["assemble", PLAN, "1=/a/x.md", "3=/a/y.md"], "assemble: 3 names no slice of this plan", { slices: 2 }],
  ["an assemble call leaving a slice out", ["assemble", PLAN, "2=/a/y.md"], "assemble: slice 1 has no <slice>=<author file> pair - name every slice in one call", { slices: 2 }],
  ["a slice named twice", ["assemble", PLAN, "1=/a/x.md", "1=/a/y.md"], "assemble: expected <slice>=<author file>, 1 is named twice", {}],
  ["assemble over a framed plan that holds its tasks", ["assemble", PLAN, "1=/a/x.md", "2=/a/x.md"], "assemble: the plan already holds its tasks - change it through apply", { slices: 2 }],
  ["apply with no pair", ["apply", PLAN], "apply: name at least one <owner>=<fix file>", {}],
  ["apply with a bare file", ["apply", PLAN, "/a/fix.md"], "apply: expected <owner>=<fix file>, got: /a/fix.md", {}],
  ["apply for the frame of a plan with none", ["apply", PLAN, "frame=/a/x.md"], "apply: frame names no owner of this plan", {}],
  ["apply for a slice the plan lacks", ["apply", PLAN, "3=/a/x.md"], "apply: 3 names no owner of this plan", { slices: 2 }],
  ["apply while a verdict is awaited", ["apply", PLAN, "1=/a/x.md"], "apply: the verdict of round 1 is awaited - report it with judged", { round: 1, await: "judge" }],
  ["a verdict reported while no review round is open", ["judged", PLAN, "PASS"], "no review round is open", {}],
  ["a verdict word that is none of the four", ["judged", PLAN, "MAYBE"], "judged: expected PASS, FAIL, DENIED or none, got: MAYBE", {}],
  ["open with no fix to give up", ["open", PLAN], "open: no fix is open", {}],
  ["open between the two rounds, the fix of the first applied", ["open", PLAN], "open: no fix is open", { round: 1 }],
] as [string, string[], string, StateFields][]) {
  test(`${name} exits 2 on one error line`, () => {
    const result = build(argv, { [PLAN]: WRITTEN(), [STATE]: stateOf(state), "/a/x.md": WRITTEN() });
    assert.deepEqual([result.exit, result.stdout, result.stderr], [2, "", `error: ${reason}\n`]);
  });
}

test("a call outside a repository exits 2", () => {
  const outside = runPlanBuild(["survey", PLAN], "/x", SCRIPT, { fs: fakeFs({}), git: fakeGit(null), clock: fakeClock(AT) });
  assert.deepEqual([outside.exit, outside.stderr], [2, "error: not inside a git repository\n"]);
});

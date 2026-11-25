/*
 * reach-prose.unit.test.ts - pins the prose that carries the reach of a change from the outline to
 * the plan and its review, as files a script writes and agents read.
 *
 * `plan-surveyor.md` lists the reach targets in its outline, none only when the change adds,
 * modifies, moves or deletes nothing, each added file as a `| new` target, and proposes a split by
 * the task and file counts alone. The planner's outline step runs `plan-build.sh outline` on the
 * surveyor's file: the script searches the `TARGET:` lines, writes the reach files and prints the
 * thresholds and the architect block, so the planner names no target and no reach file itself.
 * `plan-architect.md` reads the reach file, opens the candidates file only for a hit its path does
 * not explain, searches itself only where the search was cut short, and lands every file the reach
 * names in the plan. The four plan reviewers take their callers from the same file, the task
 * reviewer from `## Reach` of its brief.
 *
 * No case binds a classification of the candidates, a kind of reference or a `REF:` line: no agent
 * classifies the hits and no file carries such a line. The user guides are bound by no case here.
 *
 * The files read here are shipped prompts and a script header, whose text is the behaviour.
 * Nothing is spawned. Each phrase is matched with any run of whitespace between its words, so
 * rewrapping a line breaks no test.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/reach-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { section } from "../harness/markdown.ts";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(relative: string): string {
  return fs.readFileSync(path.join(VIBER, relative), "utf8");
}

const PLANNER = read("skills/planner/SKILL.md");
const SURVEYOR = read("agents/plan-surveyor.md");
const ARCHITECT = read("agents/plan-architect.md");
const DETAILER = read("agents/plan-detailer.md");
const PLAN_REVIEW = read("agents/planner-review.md");
const SPEC_REVIEW = read("agents/planner-spec-review.md");
const GRAPH_REVIEW = read("agents/planner-graph-review.md");
const TASK_REVIEW = read("agents/planner-task-review.md");
// The header of the entry without its comment prefixes, so a phrase wrapped over two lines still matches.
const PLAN_BUILD = read("skills/planner/scripts/plan-build.ts").replace(/\r?\n \*/g, "\n");

function has(haystack: string, text: string): boolean {
  const escaped = text.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("\\s+")).test(haystack);
}

// ---------------------------------------------------------------------------
// The surveyor lists the reach targets
// ---------------------------------------------------------------------------

test("the surveyor skips the reach targets only when the change adds, modifies, moves or deletes no file or symbol", () => {
  assert.ok(has(section(SURVEYOR, "Map"), "Skip them only when the change adds, modifies, moves or deletes no file or symbol."));
});

test("the surveyor lists each file the change adds as a `| new` target", () => {
  assert.ok(has(section(SURVEYOR, "Map"), "or `<path> | new` for each file the change adds"));
});

test("the surveyor lists a whole file by its path and a symbol only where its name, signature, type or observable behaviour changes for its callers", () => {
  assert.ok(
    has(
      section(SURVEYOR, "Map"),
      "Otherwise one per line: one repo-relative path for a whole file the change modifies, moves or deletes, `<path> | <symbol>` for one symbol of it, a symbol only where its name, signature, type or observable behaviour changes for its callers,",
    ),
  );
});

test("the surveyor writes each reach target as a TARGET: line of its outline, the line plan-build.sh outline searches", () => {
  assert.ok(has(section(SURVEYOR, "Output"), "TARGET: <reach target>"));
  assert.ok(has(PLAN_BUILD, "Copies the survey file to <dir>/outline.md, searches its TARGET: lines"));
});

test("the surveyor names plan: as the plan path carried for the token report and never read", () => {
  assert.ok(has(section(SURVEYOR, "Input"), "`plan:` is the plan path, carried for the token report and never read."));
});

test("the surveyor owes the user a behaviour, scope or product choice as a DECIDE: line and never asks an implementation choice", () => {
  const map = section(SURVEYOR, "Map");
  assert.ok(has(map, "A behaviour, scope or product choice the input leaves open is owed to the user: one `DECIDE:` line with 3 options, your recommendation first."));
  assert.ok(has(map, "An implementation choice (a file, a name, a library, a structure, an algorithm) is never asked: it stays with you."));
});

test("the surveyor cuts the change into phases only once it is certain to pass 30 tasks or 60 files, the limits plan-build.sh outline prints a threshold: line past", () => {
  assert.ok(has(section(SURVEYOR, "Map"), "Once the change is certain to pass 30 tasks or 60 files, stop reading and cut it into phases from the map, a `viber:fixer` input putting the fix in phase 1."));
  assert.ok(has(section(SURVEYOR, "Output"), "`PHASE:` lines only past 30 tasks or 60 files"));
  assert.ok(has(PLAN_BUILD, "threshold: <n> tasks, past 30"));
  assert.ok(has(PLAN_BUILD, "threshold: <m> files, past 60"));
});

test("the surveyor never cuts or widens the scope by judgment: only the task and file counts propose a split", () => {
  assert.ok(has(section(SURVEYOR, "Map"), "Never cut or widen the scope by judgment: only the task and file counts propose a split."));
});

// ---------------------------------------------------------------------------
// The planner's outline step
// ---------------------------------------------------------------------------

test("the planner allows its plan-build.sh call through the skill directory", () => {
  assert.ok(has(PLANNER, "Bash(${CLAUDE_SKILL_DIR}/scripts/plan-build.sh:*)"));
});

test("the planner runs plan-build.sh outline with the plan path and the surveyor's OUT path as one literal line", () => {
  assert.ok(has(section(PLANNER, "1. Survey"), 'then run `"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" outline "<plan-path>" "<OUT path>"`'));
});

test("the planner says the plan-mode notice replaces no step and what its scripts write there", () => {
  assert.ok(has(PLANNER, "The plan-mode notice (its read-only limit, its own workflow) replaces no step here: `plan-build.sh` and `review-round.sh` write only the plan file and work files under `.temp/viber/planner/`, expected in plan mode."));
});

test("a script call the harness refuses is a question to the user, never a plan the planner writes itself", () => {
  assert.ok(has(PLANNER, "A script call the harness refuses: one `AskUserQuestion` quoting the refusal, retry or stop with no plan, never a plan you write yourself."));
});

test("step 1 always writes the plan file as its three-line stub (a stub left by an earlier plan of the session would arm no gate) and leaves every later plan change to plan-build.sh and the branch step", () => {
  const step = section(PLANNER, "1. Survey");
  assert.ok(has(step, "`Write` the plan file as three lines, `---`, `source: <plan-path>`, `---`, always: it arms the plan gate. Refused: `Read` its first 3 lines, `Write` again."));
  assert.ok(has(step, "From here on the plan changes only through `plan-build.sh` and the branch step."));
});

test("the planner dispatches the architect block the outline call printed, the block that carries the reach file", () => {
  assert.ok(has(section(PLANNER, "2. Write the plan"), "Dispatch the architect block `outline` printed."));
  assert.ok(has(PLAN_BUILD, 'then the block of viber:plan-architect, "mode: whole" at 8 tasks or fewer, else "mode: skeleton".'));
});

for (const line of ["TARGET:", "reach:", "candidates:", "REF:", "targets:"]) {
  test(`the planner holds no reach line of its own: ${line} (the script reads the targets and names the files to the agents)`, () => {
    assert.equal(has(PLANNER, line), false);
  });
}

test("the planner closes step 1 on the threshold: line of the outline call and composes no phase itself", () => {
  const step = section(PLANNER, "1. Survey");
  assert.ok(has(step, "on a `threshold:` line, ask through one `AskUserQuestion`: split the change into phases, or keep one plan of that size."));
  assert.ok(has(step, "With no `Split proposal:` block in the output the options are keep or stop: you compose no phase."));
});

test("the planner hands a split to viber:intent with the Split proposal: block as the outline call printed it", () => {
  assert.ok(has(section(PLANNER, "1. Survey"), "followed by the `Split proposal:` block as printed, from that line to the one above `NEXT:`, and write no plan."));
  assert.ok(has(PLAN_BUILD, "Split proposal:"));
});

// ---------------------------------------------------------------------------
// The architect reads the reach
// ---------------------------------------------------------------------------

test("the architect and the header of plan-build.ts agree on the reach file: a section per target, one `<path> | <hit count>` line per file", () => {
  assert.ok(has(section(ARCHITECT, "Input"), "`reach:` (optional) holds a `## <target>` section per reach target, one `<path> | <hit count>` line per file referring to it."));
  assert.ok(has(PLAN_BUILD, 'reach-paths.md (per target "## <target>" and one "<path> | <hit count>" line per file)'));
});

test("the architect and the header of plan-build.ts agree on the candidates file: the hit lines `<path>:<line>: <text>`", () => {
  assert.ok(has(section(ARCHITECT, "Input"), "`candidates:` (optional) holds the hit lines behind the reach file, `<path>:<line>: <text>`."));
  assert.ok(has(PLAN_BUILD, '"<path>:<line>: <text>"'));
});

test("the architect opens the candidates file only for a hit its path does not explain and searches itself only for a truncated target and a new target's glob or count not naming its directory", () => {
  assert.ok(
    has(
      section(ARCHITECT, "Read"),
      "The reach file answers Reach: open the candidates file for the lines of a hit only when its path alone does not tell what it refers to, and search yourself only for a target whose section ends on `truncated:` and, for a `| new` target, a glob or count that does not name its directory.",
    ),
  );
  assert.ok(has(PLAN_BUILD, '"truncated:" line past that cap'));
});

test("the architect drops a name shared with an unrelated symbol", () => {
  assert.ok(has(section(ARCHITECT, "Read"), "A name shared with an unrelated symbol is no reference."));
});

test("the architect lands every file the reach file names in a task's Files or under Out of scope naming the behaviour it keeps", () => {
  assert.ok(has(section(ARCHITECT, "Read"), "Every file the reach file names lands in a task's `Files`, through the file map, or under `### Out of scope` naming the behaviour that reference keeps."));
});

test("the architect reads the codebase for everything the Reach and Owned rules force into the file map", () => {
  assert.ok(has(section(ARCHITECT, "Read"), "Read the codebase for everything `plan-rules.md`'s Reach and Owned rules force into the file map."));
});

// ---------------------------------------------------------------------------
// The reach in a slice brief and in the review
// ---------------------------------------------------------------------------

test("the header of plan-build.ts puts the Reach sections of a slice's files into its brief, which the detailer and the task reviewer read as Reach", () => {
  assert.ok(has(PLAN_BUILD, "the File map lines of their Files and the Reach sections of those files."));
  assert.ok(has(section(DETAILER, "Input"), "and Reach, the files referring to their `Files`, one `<path> | <hit count>` line each."));
  assert.ok(has(section(TASK_REVIEW, "Input"), "`brief:` and `candidates:` (optional): your part of the plan, its `## Reach` naming the files that refer to your tasks' `Files`, and the hit lines behind them."));
});

const REACH_INPUT = "`reach:` and `candidates:` (optional): the files referring to each file or symbol the plan changes, and the hit lines behind them.";
const REACH_ALREADY_RUN = "The reach file holds that search already run: grep yourself only for a symbol or path it lacks.";

for (const [name, text] of [["planner-review", PLAN_REVIEW], ["planner-spec-review", SPEC_REVIEW], ["planner-graph-review", GRAPH_REVIEW]] as [string, string][]) {
  test(`${name} names reach: and candidates: as the files referring to what the plan changes and the hit lines behind them`, () => {
    assert.ok(has(section(text, "Input"), REACH_INPUT));
  });
}

for (const [name, text] of [["planner-review", PLAN_REVIEW], ["planner-spec-review", SPEC_REVIEW]] as [string, string][]) {
  test(`${name} takes the reach file as its search already run and greps itself only for a symbol or path it lacks`, () => {
    assert.ok(has(section(text, "Input"), REACH_ALREADY_RUN));
  });
}

test("planner-graph-review takes its callers from the reach file and searches itself only for one it lacks", () => {
  assert.ok(has(section(GRAPH_REVIEW, "Input"), "taking the callers from the reach file and searching yourself only for one it lacks."));
});

test("planner-task-review takes its callers from the Reach section of its brief, which it reads in place of the plan", () => {
  const input = section(TASK_REVIEW, "Input");
  assert.ok(has(input, "Read the brief in place of the plan, and open the plan by range only for a section the brief lacks"));
  assert.ok(has(input, "Callers come from `## Reach`:"));
});

/*
 * reach-prose.unit.test.ts - pins the prose that carries the reach of a change from the outline to
 * the plan and its review, as files a script writes and agents read.
 *
 * `plan-surveyor.md` lists the reach targets in its outline, none only when the change adds,
 * modifies, moves or deletes nothing, each added file as a `| new` target, and proposes a split by
 * the task and file counts alone. The planner's outline step runs `plan-build.sh outline` on the
 * surveyor's file: the script searches the `TARGET:` lines, writes the reach files and prints the
 * thresholds and the block of the next writer, so the planner names no target and no reach file
 * itself. `plan-author.md` reads the reach sections, opens the candidates file only for a hit its
 * path does not explain, searches for no target the search cut short (the candidates file holds
 * lines of every file), and lands every file the reach names in a task or on an `OUTSIDE:` line.
 * A `| new` target forces no file into the plan: it has no section on the paths page, the lines
 * naming its directory go to the candidates file alone, and the lines the script lists under
 * Out of scope stand below a heading that keeps them out of the task files.
 * `plan-architect.md` takes the file map of a frame from the reach file. A slice brief carries
 * the `## Reach` sections of its files, which the author of the slice reads.
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
const AUTHOR = read("agents/plan-author.md");
const REACH_CORE = read("lib/reach.ts");
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
  assert.ok(has(map, "An implementation choice (a file, a name, a library, a structure, an algorithm) is never asked: it stays with the authors of the plan."));
});

test("the surveyor cuts the change into phases only once it is certain to pass 30 tasks or 60 files, the limits plan-build.sh outline prints a threshold: line past", () => {
  assert.ok(has(section(SURVEYOR, "Map"), "Once the change is certain to pass 30 tasks or 60 files, stop searching and cut it into phases from the map, a `viber:fixer` input putting the fix in phase 1."));
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
  assert.ok(has(PLANNER, "The plan-mode notice (its read-only limit, its own workflow) replaces no step here: `plan-build.sh` writes only the plan file and work files under `.temp/viber/planner/`, expected in plan mode."));
});

test("a script call the harness refuses is a question to the user, never a plan the planner writes itself", () => {
  assert.ok(has(PLANNER, "A script call the harness refuses: one `AskUserQuestion` quoting the refusal, retry or stop with no plan, never a plan you write yourself."));
});

test("step 1 always writes the plan file as its three-line stub (a stub left by an earlier plan of the session would arm no gate) and leaves every later plan change to plan-build.sh and the branch step", () => {
  const step = section(PLANNER, "1. Survey");
  assert.ok(has(step, "`Write` the plan file as three lines, `---`, `source: <plan-path>`, `---`, always: it arms the plan gate. Refused: `Read` its first 3 lines, `Write` again."));
  assert.ok(has(step, "From here on the plan changes only through `plan-build.sh` and the branch step."));
});

test("the planner dispatches the block the outline call printed, the block that carries the reach file: the architect's for a change cut into slices, else its one author's", () => {
  assert.ok(has(section(PLANNER, "2. Write the plan"), "Dispatch the block `outline` printed: the architect's for a change cut into slices, else the block of its one author."));
  assert.ok(has(PLAN_BUILD, 'then, for one slice, the block of viber:plan-author with "mode: whole" (that author writes the whole plan), and for two or more the block of viber:plan-architect, who writes the frame.'));
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

test("the author of a whole plan and the architect take the same reach: and candidates: lines", () => {
  assert.ok(has(section(AUTHOR, "Input"), "`reach:` (`whole`, optional) holds a `## <target>` section per reach target, one `<path> | <hit count>` line per file referring to it."));
  assert.ok(has(section(AUTHOR, "Input"), "`candidates:` (optional) holds the hit lines behind Reach, `<path>:<line>: <text>`."));
});

test("the author opens the candidates file only for a hit its path does not explain and searches itself only for a new target's glob or count not naming its directory", () => {
  const step = section(AUTHOR, "Read");
  assert.ok(has(step, "Reach answers the Reach rule: open the candidates file for the lines of a hit only when its path alone does not tell what it refers to."));
  assert.ok(has(step, "A `| new` target has candidates lines alone, naming its directory: search yourself only for a glob or count not naming it."));
});

test("a `| new` target forces no file into the plan: the header of plan-build.ts keeps it off the paths page the plan places file by file, and the reach core writes it to the candidates page alone", () => {
  assert.ok(has(PLAN_BUILD, 'That page holds the files referring to a path or symbol the change modifies, moves or deletes: a "<path> | new" target has nothing referring to it, so the lines naming its directory go to the candidates file alone and place nothing.'));
  assert.ok(has(PLAN_BUILD, 'which holds no section for a "<path> | new" target and is not written when no target has one'));
  assert.ok(REACH_CORE.includes("if (!added) paths.push(`## ${target}`);"));
});

test("the lines plan-build.sh lists under Out of scope stand below the References kept heading, which keeps them out of every task file", () => {
  assert.ok(has(PLAN_BUILD, 'below the heading "#### References kept" it writes there'));
  assert.ok(has(PLAN_BUILD, 'a task file takes "### Out of scope" up to the first heading below it, so they stay in the specification and reach no task file.'));
  assert.ok(read("lib/plan-build.ts").includes('const KEPT = "#### References kept";'));
});

test("a target cut short points at the candidates file, never at a search of its own: the author, the header of plan-build.ts and the reach core", () => {
  assert.ok(has(section(AUTHOR, "Read"), "A section ending on `truncated:` still lists every file, and the candidates file holds 2 lines of each."));
  assert.ok(has(PLAN_BUILD, '"truncated: <kept> of <total> lines kept, 2 per file at most" in the candidates file and on "truncated: <total> lines, <kept> kept in <candidates file>" in reach-paths.md'));
  for (const text of [AUTHOR, ARCHITECT, PLAN_BUILD, REACH_CORE]) assert.equal(has(text, "search this target yourself"), false);
});

test("the header of plan-build.ts names the noise rule: a derived term of a whole-file target naming more than 25 files is dropped and named on common:, the path and a symbol never", () => {
  assert.ok(has(PLAN_BUILD, 'whose hits span more than 25 files is searched no more and named on "common: <term> (<n> files)"; the path itself and a symbol are never dropped.'));
  assert.ok(REACH_CORE.includes("const COMMON = 25;"));
});

test("the author and the architect drop a name shared with an unrelated symbol", () => {
  assert.ok(has(section(AUTHOR, "Read"), "A name shared with an unrelated symbol is no reference."));
  assert.ok(has(section(ARCHITECT, "Read"), "a name shared with an unrelated symbol is no reference."));
});

test("the author lands every file Reach names in a task's Files or on an OUTSIDE: line naming the behaviour it keeps, which plan-build.sh lists under Out of scope", () => {
  assert.ok(has(section(AUTHOR, "Write"), "Every file Reach names lands in a task's `Files`, or on an `OUTSIDE:` line naming the behaviour that reference keeps."));
  assert.ok(has(PLAN_BUILD, 'lists each OUTSIDE: line under "### Out of scope" as "- <path> - <text>"'));
});

test("the author of a whole plan reads the code the Reach and Owned rules force into the file map, and the architect takes the file map of a frame from the reach file", () => {
  assert.ok(has(section(AUTHOR, "Read"), "On `whole`, also the code `plan-rules.md`'s Reach and Owned rules force into the file map."));
  assert.ok(has(section(ARCHITECT, "Read"), "The reach file answers `plan-rules.md`'s Reach rule for the file map"));
  assert.ok(has(section(ARCHITECT, "Write"), "`### File map` holds every `FILE:` line of the outline and every file the reach file forces in."));
});

// ---------------------------------------------------------------------------
// The reach in a slice brief
// ---------------------------------------------------------------------------

test("the header of plan-build.ts puts the Reach sections of a slice's files into its brief, which the author of the slice reads as Reach", () => {
  assert.ok(has(PLAN_BUILD, "Reach (the sections of the paths page naming them)"));
  assert.ok(has(section(AUTHOR, "Input"), "Reach (the files referring to them, one `<path> | <hit count>` line each)"));
});

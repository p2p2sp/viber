/*
 * plan-review-prose.unit.test.ts - pins where the scripted plan rules live: every rule `plan-index.sh`
 * rejects, tagged `(script)`, sits in `references/plan-rules-script.md`, which `planner` reads
 * beside `plan-rules.md` and no planner reviewer reads. `plan-rules.md` keeps the `(review)` rules in
 * its four sections and says where the scripted ones went. The planner reviewers also carry no
 * check `plan-index.sh` decides (attachment names, template slots outside fences, whole-path
 * reads) and keep the part no script can make. Three of them search the code only where the plan
 * changes something callers see, the graph reviewer keeps its exploration, and all four narrow a
 * re-review to the text the fixes changed. The files read here are shipped prompts,
 * whose text is the behaviour. Nothing is spawned. Each check is a pure function proven on a
 * synthetic bad sample before it is held to the tree.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/plan-review-prose.unit.test.ts
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

const PLAN_RULES = read("references/plan-rules.md");
const SCRIPT_RULES = read("references/plan-rules-script.md");
const PLANNER = read("skills/planner/SKILL.md");
const REVIEWERS = ["planner-review", "planner-spec-review", "planner-graph-review", "planner-task-review"];

function allowedToolsLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.startsWith("allowed-tools:")) ?? "";
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function scriptLines(text: string): string[] {
  return lines(text).filter((line) => line.trimEnd().endsWith("(script)"));
}

function namesScriptRules(text: string): boolean {
  return text.includes("plan-rules-script.md") || text.includes("(script)");
}

function plannerReadsBoth(text: string): boolean {
  const step = section(text, "1. Map the files first");
  return step.includes("references/plan-rules.md") && step.includes("references/plan-rules-script.md");
}

function ruleName(line: string): string {
  return line.slice(2, line.indexOf(":"));
}

const SAMPLE_PLANNER = "## 1. Map the files first\n\nRead `${CLAUDE_PLUGIN_ROOT}/references/plan-rules.md` and `${CLAUDE_PLUGIN_ROOT}/references/plan-rules-script.md` first.\n";

test("a line ending in (script) is found and a (review) line is not", () => {
  assert.deepEqual(scriptLines("- A: x. (script)\n- B: y. (review)\n"), ["- A: x. (script)"]);
});

const REVIEWER_SAMPLES: [string, string, boolean][] = [
  ["names the script rule file", "Read plan-rules-script.md too.", true],
  ["names a (script) rule", "The `(script)` rules are validated.", true],
  ["names only (review) rules", "Gate every `(review)` rule.", false],
];

for (const [label, sample, caught] of REVIEWER_SAMPLES) {
  test(`a reviewer text that ${label} is ${caught ? "caught" : "passed"}`, () => {
    assert.equal(namesScriptRules(sample), caught);
  });
}

const PLANNER_SAMPLES: [string, string, boolean][] = [
  ["reads both rule files", SAMPLE_PLANNER, true],
  ["stops reading the script rule file", SAMPLE_PLANNER.replace("plan-rules-script.md", "other.md"), false],
];

for (const [label, sample, passes] of PLANNER_SAMPLES) {
  test(`a planner step that ${label} is ${passes ? "passed" : "caught"}`, () => {
    assert.equal(plannerReadsBoth(sample), passes);
  });
}

test("plan-rules.md holds no line ending in (script)", () => {
  assert.deepEqual(scriptLines(PLAN_RULES), []);
});

test("plan-rules.md keeps exactly its four sections", () => {
  assert.deepEqual(lines(PLAN_RULES).filter((line) => line.startsWith("## ")), ["## Spec", "## Graph", "## Task", "## Contracts"]);
});

for (const heading of ["Spec", "Graph", "Task", "Contracts"]) {
  test(`the ${heading} section of plan-rules.md holds review rules only, at least one`, () => {
    const rules = lines(section(PLAN_RULES, heading)).filter((line) => line.startsWith("- "));
    assert.ok(rules.length > 0 && rules.every((line) => line.endsWith("(review)")));
  });
}

test("plan-rules.md opens by saying the scripted rules live in plan-rules-script.md", () => {
  const opening = lines(PLAN_RULES).find((line) => line.startsWith("Every rule a plan must hold.")) ?? "";
  assert.ok(opening.includes("`plan-rules-script.md`"));
});

test("plan-rules-script.md keeps the sections of plan-rules.md its scripted rules came from", () => {
  assert.deepEqual(lines(SCRIPT_RULES).filter((line) => line.startsWith("## ")), ["## Spec", "## Graph", "## Task", "## Contracts"]);
});

const SCRIPT_SECTIONS: [string, string[]][] = [
  ["Spec", ["Attachments", "Filled", "Scenarios", "File map", "Input"]],
  ["Graph", ["Ids", "Depends", "Minimal", "Read after", "Disjoint", "Leaf", "Covers"]],
  ["Task", ["Title", "Paths", "Exclusive", "Hard", "Uses", "Supplied", "Provable", "Memory-owned", "Reproduced", "Self-proven", "Layered"]],
  ["Contracts", ["Blocks", "Block body", "Named", "Homed", "Seen", "Consumed after"]],
];

for (const [heading, names] of SCRIPT_SECTIONS) {
  test(`the ${heading} section of plan-rules-script.md holds the scripted ${heading} rules by name`, () => {
    assert.deepEqual(lines(section(SCRIPT_RULES, heading)).filter((line) => line.startsWith("- ")).map(ruleName), names);
  });

  test(`every rule of the ${heading} section of plan-rules-script.md ends in (script)`, () => {
    assert.ok(lines(section(SCRIPT_RULES, heading)).filter((line) => line.startsWith("- ")).every((line) => line.endsWith("(script)")));
  });
}

const ERROR_MESSAGES: [string, string][] = [
  ["Attachments", "with `FIX: attachments: name \"<name>\" is not one path component of letters, digits, _, . and - opening on a letter or digit - rename it (Attachments)`, `FIX: attachments: name \"<name>\" repeats an earlier one - rename one of them (Attachments)` or `FIX: task <id>: DoD names attachments/<name>, absent from the attachments map - add a <name> entry or drop the reference (Attachments)`. With `--input`, an `Attachment: <path>` line of the input summary file whose path no map entry holds is rejected too, with `FIX: input: Attachment <path> has no entry in the attachments map - add one (Attachments)`. (script)"],
  ["Scenarios", "with `FIX: line <n>: scenario heading \"<heading>\" must be \"### S<k> - <title>\", the <k>th scenario in order - number it (Scenarios)`. (script)"],
  ["File map", "with `FIX: file map: <modify|delete> <path>, which the tree does not hold - correct the path or list it as add (File map)`. (script)"],
  ["Input", "with `FIX: input gives a root cause but the plan has no \"## Root cause\" section - add it (Root cause)`, `FIX: the plan carries a \"## Root cause\" section its input gives no cause for - drop it (Root cause)` or `FIX: input: Repro <path> is on no task Repro: line - put it on the fixing task (Reproduced)`. (script)"],
  ["Filled", "with `FIX: line <n>: template slot <slot> left unfilled - replace it (Filled)`. (script)"],
  ["Uses", "with `FIX: task <id>: <DoD|Delivers> names <block id>, missing from its Uses - add it to Uses`. (script)"],
  ["Provable", "with `FIX: task <id>: Verification runs git grep without --untracked over <path>, which this task creates and git grep never reads - add --untracked or use grep (Provable)`. (script)"],
  ["Layered", "with `FIX: task <id>: Files writes <path> under an integration test directory, which no Verification command names - list or type-check that file or its test project there (Layered)`. (script)"],
];

test("plan-rules-script.md quotes no message with the error: prefix (every defect line opens on FIX:)", () => {
  assert.ok(!SCRIPT_RULES.includes("`error:"));
});

for (const [rule, text] of ERROR_MESSAGES) {
  test(`the ${rule} rule keeps its error message word for word in plan-rules-script.md`, () => {
    assert.ok(SCRIPT_RULES.includes(text));
  });
}

function ruleOf(text: string, heading: string, name: string): string {
  return lines(section(text, heading)).find((line) => line.startsWith(`- ${name}:`)) ?? "";
}

test("the Read after rule of plan-rules-script.md names Delivers, the forward case, the decision record exemption and both error messages", () => {
  const rule = ruleOf(SCRIPT_RULES, "Graph", "Read after");
  assert.ok(rule.includes("`Verification`, `Delivers` or `DoD`"));
  assert.ok(rule.includes("the tree does not hold that only a higher-numbered task lists"));
  assert.ok(rule.includes("every `Files` path under `docs/adr/`"));
  assert.ok(rule.includes("`FIX: task <id> reads <path>, listed by <other>, but has no dependency path to <other> - add <other> to its Depends-on`"));
  assert.ok(rule.includes("`FIX: task <id> reads <path>, which only the later task <other> creates - move the reading after <other> (Read after)`"));
});

test("the Ordered rule of plan-rules.md asks a Depends-on for each route, symbol or file another task creates or changes, leaving a file named by its whole path to Read after and any other file naming to the reviewer", () => {
  const rule = ruleOf(PLAN_RULES, "Graph", "Ordered");
  assert.ok(rule.includes("Every route, symbol or file a task's `Verification`, `Delivers` or a done clause reads that another task creates or changes needs that task among its `Depends-on`, directly or through another;"));
  assert.ok(rule.includes("a file named by its whole repo-relative path is left to `Read after`, and a file named any other way (a bare file name, a file read without its path) stays yours."));
});

test("planner step 1 reads plan-rules.md together with plan-rules-script.md", () => {
  assert.ok(plannerReadsBoth(PLANNER));
});

test("planner step 1 holds the plan to every rule in both rule files", () => {
  assert.ok(section(PLANNER, "1. Map the files first").includes("hold the plan to every rule in both"));
});

for (const name of REVIEWERS) {
  test(`${name} names neither plan-rules-script.md nor a (script) rule`, () => {
    assert.ok(!namesScriptRules(read(`agents/${name}.md`)));
  });
}

const RE_REVIEW = "On a re-review, check only the text a `fix:` line changed and what refers to it, searching the codebase for nothing else: verify each previous finding was addressed, and treat a new finding outside that text as Minor.";

for (const name of REVIEWERS) {
  test(`${name} narrows a re-review to the text the fixes changed (a re-review repeating the whole review costs a full round per fix)`, () => {
    assert.ok(section(read(`agents/${name}.md`), "Calibration").includes(RE_REVIEW));
  });
}

function bulletOf(text: string, label: string): string {
  return lines(text).find((line) => line.startsWith(`- ${label}:`)) ?? "";
}

function memoryLine(text: string): string {
  return lines(text).find((line) => line.includes("`memory:` (")) ?? "";
}

test("a check bullet is found by its label and a missing one reads empty", () => {
  const sample = "- Faithful: a.\n- Filled: b.\n";
  assert.deepEqual([bulletOf(sample, "Filled"), bulletOf(sample, "Wired")], ["- Filled: b.", ""]);
});

test("the memory line is the one naming the memory: input with its reading", () => {
  assert.equal(memoryLine("The prompt carries `memory:` (the value x), a path.\nOther.\n"), "The prompt carries `memory:` (the value x), a path.");
});

const REVIEWS_ATTACHMENTS = ["planner-review", "planner-spec-review"];
const REVIEWS_WIRED = ["planner-review", "planner-graph-review"];
const MEMORY_READERS = ["planner-review", "planner-graph-review", "planner-task-review"];

// [reviewer, check label, phrase]: a phrase of a check `plan-index.sh` now decides, which no reviewer carries.
const DROPPED_PHRASES: [string, string, string][] = [
  ...REVIEWS_ATTACHMENTS.flatMap((name): [string, string, string][] => [
    [name, "Faithful", "a name repeated within that map"],
    [name, "Faithful", "^[A-Za-z0-9][A-Za-z0-9_.-]*$"],
    [name, "Faithful", "`attachments/<name>` reference in a `DoD`"],
    [name, "Filled", "not one template slot survives"],
    [name, "Filled", "an `S<n>` left unnumbered"],
  ]),
  ...REVIEWS_WIRED.map((name): [string, string, string] => [name, "Wired", "every file, route or symbol"]),
];

// [reviewer, check label, phrase]: a phrase of a check no script can make, which the reviewer keeps.
const KEPT_PHRASES: [string, string, string][] = [
  ...REVIEWS_ATTACHMENTS.flatMap((name): [string, string, string][] => [
    [name, "Faithful", "an `Attachment:` line of an input given as text with no entry in the frontmatter `attachments:` map"],
    [name, "Faithful", "an input given as a summary file is left to `plan-index.sh --input`"],
    [name, "Filled", "inside a fenced block, a backtick span, an HTML comment or a contract block"],
    [name, "Filled", "an example line nobody replaced"],
  ]),
  ...REVIEWS_WIRED.flatMap((name): [string, string, string][] => [
    [name, "Wired", "every route, symbol and file not named by its whole repo-relative path (a bare file name, a file read without its path)"],
    [name, "Wired", "a file named by its whole repo-relative path being left to `plan-index.sh`"],
    [name, "Wired", "an edge whose dependent consumes nothing from its target as Minor"],
  ]),
];

for (const name of ["planner-review", "planner-task-review"]) {
  test(`${name} leaves to plan-index.sh a modify or delete path the tree lacks, in its Grounded check`, () => {
    assert.ok(bulletOf(read(`agents/${name}.md`), "Grounded").includes("a `modify` or `delete` path the tree lacks is left to `plan-index.sh`"));
  });
}

for (const [name, label, phrase] of DROPPED_PHRASES) {
  test(`${name} drops from its ${label} check the part plan-index.sh decides: ${phrase}`, () => {
    assert.ok(!bulletOf(read(`agents/${name}.md`), label).includes(phrase));
  });
}

for (const [name, label, phrase] of KEPT_PHRASES) {
  test(`${name} keeps in its ${label} check the part no script can make: ${phrase}`, () => {
    assert.ok(bulletOf(read(`agents/${name}.md`), label).includes(phrase));
  });
}

for (const name of MEMORY_READERS) {
  test(`the memory: line of ${name} names the Provable grep exclusion and never the Memory-owned rule`, () => {
    const line = memoryLine(read(`agents/${name}.md`));
    assert.deepEqual([line.includes("the `Provable` grep exclusion"), line.includes("Memory-owned")], [true, false]);
  });
}

test("the memory: line of planner-graph-review also names its check of a fix it proposes", () => {
  assert.ok(memoryLine(read("agents/planner-graph-review.md")).includes("the check of a fix you propose"));
});

const COUNTING_PHRASES = ["ceil", "T1-T7", "T8-T13", "12 tasks", "rows under the `tasks:` header"];

function countingPhrases(text: string): string[] {
  return COUNTING_PHRASES.filter((phrase) => text.includes(phrase));
}

test("a planner text counting tasks or cutting slices itself is caught by the phrases it holds", () => {
  assert.deepEqual(countingPhrases("n tasks: ceil(n / 8) runs, 13 -> T1-T7, T8-T13; a plan of 12 tasks or fewer"), ["ceil", "T1-T7", "T8-T13", "12 tasks"]);
});

test("planner/SKILL.md counts no task, computes no slice and names no 12-task count", () => {
  assert.deepEqual(countingPhrases(PLANNER), []);
});

test("planner step 2 passes --accepted once the user kept a plan and asks the threshold question again on every threshold: line, comparing no count", () => {
  assert.ok(section(PLANNER, "2. Write the plan").includes("Once the user kept a plan, add `--accepted \"<accepted count>\"` to every `plan-index.sh` call. Ask the step 1 question again on every `threshold:` line of that output, a keep recording that line's count as the accepted one."));
});

const INPUT_FLAG = '--input "<summary file>"';

for (const step of ["2. Write the plan", "3. Review gate", "4. Hand off"]) {
  test(`planner step ${step.slice(0, 1)} runs plan-index.sh with ${INPUT_FLAG} on a summary file input`, () => {
    assert.ok(section(PLANNER, step).includes(INPUT_FLAG));
  });
}

const STEP_TWO_PHRASES = [
  "fix every `FIX:` line",
  "split every task a `SPLIT:` line names",
];

for (const phrase of STEP_TWO_PHRASES) {
  test(`planner step 2 acts on the defect lines of plan-index.sh: ${phrase}`, () => {
    assert.ok(section(PLANNER, "2. Write the plan").includes(phrase));
  });
}

const REVIEW_ROUND_CALL = '"${CLAUDE_SKILL_DIR}/scripts/review-round.sh" "<plan-path>"';

const STEP_THREE_PHRASES = [
  `${REVIEW_ROUND_CALL} start`,
  "`--answered` after an answer to a finding, and `--fresh` after any plan write following `NEXT: exit-plan` except an `override`'s fix, which runs plain `start`",
  "run `start --answered`",
  "one `fix: <where> - <change>` per fix applied",
  "Dispatch every block in one message",
  "then the text of each `add:` field",
  `${REVIEW_ROUND_CALL} returned <k>=<word>`,
  "`NEXT: redispatch`",
  "`NEXT: fix`",
  "`NEXT: exit-plan`",
  "`ASK:`",
  "`STOP:`",
  `${REVIEW_ROUND_CALL} override <k>`,
  "never a `SendMessage` to an earlier reviewer",
];

for (const phrase of STEP_THREE_PHRASES) {
  test(`planner step 3 runs review-round.sh and follows its directives as written: ${phrase}`, () => {
    assert.ok(section(PLANNER, "3. Review gate").includes(phrase));
  });
}

const OWN_ROUND_RULES = [
  "when any member returned it",
  "one more dispatch",
  "From round 2 on",
  "dispatch the `dispatch:` lines",
  "as a fresh round 1",
];

for (const phrase of OWN_ROUND_RULES) {
  test(`planner step 3 keeps no verdict ranking, retry count or round prompt rule of its own: ${phrase}`, () => {
    assert.ok(!section(PLANNER, "3. Review gate").includes(phrase));
  });
}

test("planner step 4 re-reviews after a later write with start --fresh", () => {
  assert.ok(section(PLANNER, "4. Hand off").includes("start --fresh"));
});

test("planner allows its review-round.sh call through the skill directory", () => {
  assert.ok(allowedToolsLine(PLANNER).includes("Bash(${CLAUDE_SKILL_DIR}/scripts/review-round.sh:*)"));
});

for (const name of ["allowed", "required"]) {
  test(`the ${name} branching-fix fragment opens on a fix after NEXT: fix`, () => {
    assert.ok(read(`skills/planner/fragments/branching-fix.${name}.md`).startsWith("After a `NEXT: fix` fix"));
  });
}

const SCOPED_SEARCH = "grep callers only of the symbols whose signature or observable behaviour the plan changes (a moved or deleted file changing all of its symbols), and the documents and `.claude/rules/` files naming a path the plan modifies, moves or deletes";
const CONFIRM_ONLY = "Read a file only to confirm a hit or to check a task's change against the code it modifies.";
const SCOPED_READERS = ["planner-review", "planner-spec-review", "planner-task-review"];

function readsScoped(text: string): boolean {
  return text.includes(SCOPED_SEARCH) && text.includes(CONFIRM_ONLY) && !text.includes("explore the codebase broadly");
}

test("a reviewer text is scoped only when it states the scoped search and the confirm-only read and never explores broadly", () => {
  assert.deepEqual(
    [SCOPED_SEARCH + " " + CONFIRM_ONLY, "explore the codebase broadly " + SCOPED_SEARCH + " " + CONFIRM_ONLY, SCOPED_SEARCH, "Then explore the codebase broadly before judging."].map(readsScoped),
    [true, false, false, false],
  );
});

for (const name of SCOPED_READERS) {
  test(`${name} states the scoped search and the confirm-only read, and never says to explore the codebase broadly`, () => {
    assert.ok(readsScoped(read(`agents/${name}.md`)));
  });

  test(`${name} never tells to read files the plan does not name`, () => {
    assert.equal(/files? the plan does not name|ones the plan does not name/.test(read(`agents/${name}.md`)), false);
  });
}

const END_TO_END_SEARCH = "the one search past it is the end-to-end spec search of `Grounded`";
const OUTSIDE_FINDING = "A reference the search reaches that sits in neither the `### File map`, a task's `Files` nor `### Out of scope` is a finding";

for (const name of ["planner-review", "planner-task-review"]) {
  test(`${name} names the end-to-end spec search of Grounded as the one search past the scoped one`, () => {
    assert.ok(read(`agents/${name}.md`).includes(END_TO_END_SEARCH));
  });
}

test("planner-spec-review names no search past the scoped one", () => {
  const text = read("agents/planner-spec-review.md");
  assert.deepEqual([text.includes("it runs no search past it"), text.includes("end-to-end spec search")], [true, false]);
});

for (const name of ["planner-review", "planner-spec-review"]) {
  test(`${name} makes a reference outside the File map, a task's Files and Out of scope a finding`, () => {
    assert.ok(read(`agents/${name}.md`).includes(OUTSIDE_FINDING));
  });
}

test("planner-task-review checks a reference against the File map and Out of scope alone", () => {
  assert.ok(read("agents/planner-task-review.md").includes("A reference the search reaches is checked against the `### File map` and `### Out of scope` alone"));
});

test("planner-graph-review keeps its exploration sentence and states no scoped search", () => {
  const text = read("agents/planner-graph-review.md");
  assert.deepEqual([text.includes("explore the codebase broadly before judging"), text.includes(SCOPED_SEARCH)], [true, false]);
});

test("planner-graph-review keeps its check that a proposed fix never adds a CLAUDE.md to Files while memory is on", () => {
  const check = bulletOf(read("agents/planner-graph-review.md"), "Fix");
  assert.ok(check.includes("with `memory: true`, a fix you propose never adds any `CLAUDE.md` file to a task's `Files`"));
});

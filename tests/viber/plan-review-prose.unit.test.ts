/*
 * plan-review-prose.unit.test.ts - pins where the scripted plan rules live and what the planner
 * keeps of a review: every rule `plan-index.sh` rejects, tagged `(script)`, sits in
 * `references/plan-rules-script.md`, which `plan-architect` and `plan-author` read beside
 * `plan-rules.md`, each in the sections of the part it writes. `plan-rules.md` keeps the `(review)`
 * rules in its four sections and says where the scripted ones went; neither file asks an author
 * for a dependency or argues parallel safety, and the placement of a reach file is a defect line
 * of `plan-build.sh` both owners of plan text answer. The planner skill runs
 * `plan-build.sh` alone and acts on its directives as printed (`NEXT: fix`, `NEXT: judge`,
 * `NEXT: exit-plan`), counts no task and no review round itself, and shares each reply verdict with
 * the planning agent that gives it; the edit block markers and the `fix:` and `unfixed:` lines are
 * shared by the two owners of plan text and the header of `plan-build.ts`, which applies them.
 *
 * Nothing here binds a message label or a prompt composed by the planner: the planner sends no
 * label, and every planning agent writes its own file.
 *
 * The files read here are shipped prompts and script headers, whose text is the behaviour. Nothing
 * is spawned. Each check is a pure function proven on a synthetic bad sample before it is held to
 * the tree.
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
const ARCHITECT = read("agents/plan-architect.md");
const AUTHOR = read("agents/plan-author.md");
/** The two agents that own plan text and fix it. */
const OWNERS: [string, string][] = [["plan-architect", ARCHITECT], ["plan-author", AUTHOR]];
const SURVEYOR = read("agents/plan-surveyor.md");
// The header of the entry as one line of text, so a rewrapped comment breaks no case.
const PLAN_BUILD = read("skills/planner/scripts/plan-build.ts").replace(/\r?\n \*/g, " ").replace(/\s+/g, " ");

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

function readsBoth(text: string): boolean {
  const step = section(text, "Read");
  return step.includes("/plan-rules.md") && step.includes("/plan-rules-script.md");
}

function ruleName(line: string): string {
  return line.slice(2, line.indexOf(":"));
}

const SAMPLE_READER = "## Read\n\nRead `<refs>/plan-rules.md` and `<refs>/plan-rules-script.md` first.\n";

test("a line ending in (script) is found and a (review) line is not", () => {
  assert.deepEqual(scriptLines("- A: x. (script)\n- B: y. (review)\n"), ["- A: x. (script)"]);
});


const READER_SAMPLES: [string, string, boolean][] = [
  ["reads both rule files", SAMPLE_READER, true],
  ["stops reading the script rule file", SAMPLE_READER.replace("plan-rules-script.md", "other.md"), false],
];

for (const [label, sample, passes] of READER_SAMPLES) {
  test(`a Read section that ${label} is ${passes ? "passed" : "caught"}`, () => {
    assert.equal(readsBoth(sample), passes);
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
  ["Graph", ["Ids", "Read after", "Covers"]],
  ["Task", ["Title", "Paths", "Exclusive", "Hard", "Uses", "Supplied", "Provable", "Memory-owned", "Reproduced", "Self-proven", "Layered"]],
  ["Contracts", ["Blocks", "Block body", "Named", "Homed", "Seen"]],
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

test("the Read after rule of plan-rules-script.md keeps the one case an author can cause: a file only a later task creates, named in Verification, Delivers or DoD, with the decision record exemption and its error message", () => {
  const rule = ruleOf(SCRIPT_RULES, "Graph", "Read after");
  assert.ok(rule.includes("`Verification`, `Delivers` or `DoD`"));
  assert.ok(rule.includes("the tree does not hold that only a higher-numbered task lists"));
  assert.ok(rule.includes("every `Files` path under `docs/adr/`"));
  assert.ok(rule.includes("`FIX: task <id> reads <path>, which only the later task <other> creates - move the reading after <other> (Read after)`"));
  assert.ok(!rule.includes("add <other> to its Depends-on"));
});

test("plan-rules-script.md says under Graph that Depends-on is written none and computed by plan-build.sh, and names no fix an author would make by writing a dependency", () => {
  assert.ok(section(SCRIPT_RULES, "Graph").includes("\n`Depends-on` is written `none`; `plan-build.sh` computes it from `Files` and contract use.\n"));
  assert.ok(!SCRIPT_RULES.includes("to its Depends-on"));
});

test("the Ordered rule of plan-rules.md sits in the Task section every task author reads, names what the script orders the tasks from and how a task that reads what another creates gets behind it, and asks no author for a dependency", () => {
  const rule = ruleOf(PLAN_RULES, "Task", "Ordered");
  assert.ok(rule.includes("the script orders the tasks from their `Files`, their `Uses` and each file their `Verification`, `Delivers` or `DoD` names by its whole repo-relative path, and from nothing else."));
  assert.ok(rule.includes("A task that reads a route, symbol or file another task creates names that file by its whole path, or its contract block in `Uses`."));
  assert.ok(!rule.includes("Depends-on"));
});

test("plan-rules.md holds no rule on Exclusive, on wasted parallelism or on the order of cutting: the plan proves no parallel safety", () => {
  const names = lines(PLAN_RULES).filter((line) => line.startsWith("- ")).map(ruleName);
  assert.deepEqual(names.filter((name) => name === "Exclusive" || name === "Sequenced"), []);
  assert.doesNotMatch(PLAN_RULES, /burns parallelism|collision check|not `Exclusive`|no `Exclusive`/);
});

test("the header of plan-build.ts quotes the reach placement defect, which both owners of plan text answer in their Fix section", () => {
  assert.ok(PLAN_BUILD.includes("FIX: reach: <path> refers to <target> and sits in no task Files, no File map line and no Out of scope line - list it or write an OUTSIDE: line"));
  assert.ok(section(AUTHOR, "Fix").includes("- A `FIX: reach:` line: add its file to the `Files` of the task that changes it, else write its `OUTSIDE:` line."));
  assert.ok(section(AUTHOR, "Fix").includes("\nGAP: frame | <what the frame owner must change>\nOUTSIDE: <path> | <the behaviour that reference keeps>\n"));
  assert.ok(section(ARCHITECT, "Fix").includes("- A `FIX: reach:` line: list its file on a `### File map` or `### Out of scope` line."));
  assert.ok(PLAN_BUILD.includes('lists each "OUTSIDE: <path> | <the behaviour that reference keeps>" line under "### Out of scope" as assemble does'));
});

test("plan-architect reads plan-rules.md together with plan-rules-script.md before it writes", () => {
  assert.ok(readsBoth(ARCHITECT));
});

test("plan-architect reads both rule files in the sections of the frame and holds the frame to them", () => {
  const step = section(ARCHITECT, "Read");
  assert.ok(step.includes("`<refs>/plan-rules.md` and `<refs>/plan-rules-script.md` in `## Spec`, `## Graph` and `## Contracts`"));
  assert.ok(step.includes("Hold the frame to every rule there."));
});

test("plan-author reads both rule files, whole when it writes the whole plan and in their Task section alone for a slice, and holds every line to them", () => {
  assert.ok(readsBoth(AUTHOR));
  const step = section(AUTHOR, "Read");
  assert.ok(step.includes("`<refs>/plan-rules.md` and `<refs>/plan-rules-script.md`, on `whole` both files, else their section `## Task` only"));
  assert.ok(step.includes("Hold every line you write to each rule you read."));
});

test("plan-author holds each fix to the rules it read (a fix breaking a scripted rule is refused by plan-build.sh apply)", () => {
  assert.ok(section(AUTHOR, "Fix").includes("each fix held to the rules of `## Read`"));
});

test("plan-surveyor reads no rule file: it maps by search and the authors hold the plan to the rules", () => {
  assert.ok(!namesScriptRules(SURVEYOR));
  assert.ok(!SURVEYOR.includes("plan-rules"));
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

const PLAN_BUILD_CALL = '"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh"';

test("the planner records a kept task count with plan-build.sh keep and asks the threshold question again on every threshold: line of assemble, comparing no count", () => {
  assert.ok(section(PLANNER, "1. Survey").includes(`- Keep: run \`${PLAN_BUILD_CALL} keep "<plan-path>" "<count>"\`, \`<count>\` the number on the \`TASKS:\` line, and go on.`));
  assert.ok(section(PLANNER, "3. Assemble").includes("- A `threshold:` line: ask the step 1 question again, a keep running `keep` with that line's count."));
});

const INPUT_FLAG = '--input "<summary file>"';

test(`planner step 1 shows its survey call with ${INPUT_FLAG}`, () => {
  assert.ok(section(PLANNER, "1. Survey").includes(INPUT_FLAG));
});

test("the planner drops the --input flag and its value on a text input, stated once above the steps", () => {
  assert.ok(PLANNER.slice(0, PLANNER.indexOf("## Rules")).includes(`The calls below show \`${INPUT_FLAG}\` for a summary file input: drop the flag and its value on a text input.`));
});

test("the planner makes no plan-index.sh call: assemble and apply check the plan in process", () => {
  assert.ok(!PLANNER.includes("plan-index.sh"));
  assert.ok(PLAN_BUILD.includes("checks the written plan in process with the plan-index core"));
});

const WRITE_PHRASES: [string, string][] = [
  ["2. Write the plan", `${PLAN_BUILD_CALL} frame "<plan-path>" "<OUT path>"`],
  ["2. Write the plan", "then dispatch every author block it prints in one message"],
  ["3. Assemble", `${PLAN_BUILD_CALL} assemble "<plan-path>" "<slice>=<OUT path>"`],
  ["3. Assemble", "one pair per author block in the one call, `<slice>` the block's `slice:` field"],
  ["3. Assemble", "- A `gaps:` line or `NEXT: fix | defects`: a fix step."],
  ["Rules", `${PLAN_BUILD_CALL} apply "<plan-path>" "<owner>=<OUT path>"`],
  ["Rules", "A fix step is a `NEXT: fix` line or a `gaps:` line with fix blocks below it: dispatch every block in one message"],
  ["Rules", `${PLAN_BUILD_CALL} fix "<plan-path>"`],
  ["Rules", "`NEXT: judge` says the plan is written and holds no defect: go on with the step you are in. Step 4 alone runs `judge`."],
  ["Rules", "dispatch again the block of each agent a `FIX:` line names (`FIX: slice <k>:` that author, `FIX: owner <o>:` that fix block, any other line the one block of the command)"],
  ["Rules", "Otherwise, and on an exit 5: show the `error:` line and stop, no hand-off."],
];

for (const [step, phrase] of WRITE_PHRASES) {
  test(`planner ${step} runs plan-build.sh and follows what it prints: ${phrase}`, () => {
    assert.ok(section(PLANNER, step).includes(phrase));
  });
}

test("plan-build.sh names the owner of a refused file on each FIX: line, the two forms the planner Rules route by", () => {
  assert.ok(PLAN_BUILD.includes('every line "FIX: owner <owner>: <defect>"'));
  assert.ok(read("lib/plan-build.ts").includes("FIX: slice ${"));
});

for (const [name, text] of OWNERS) {
  test(`${name} fixes every line of its findings: the critical problems of the review, the defects of the scripted check and the gaps sent to it`, () => {
    assert.ok(section(text, "Fix").includes("Fix every `CRITICAL:`, `FIX:` and `GAP:` line"));
  });
}

test("plan-author splits every task a SPLIT: line of the scripted check names", () => {
  assert.ok(section(AUTHOR, "Fix").includes("split every task a `SPLIT:` line names"));
});


const GATE_PHRASES = [
  `${PLAN_BUILD_CALL} judge "<plan-path>"`,
  `${PLAN_BUILD_CALL} judged "<plan-path>" "<word>" --out "<OUT path>"`,
  "or `none` without one or for a `FAIL` with no `OUT:` line",
  "Show the user the `judge:` line",
  "`NEXT: judged | none`",
  "`NEXT: redispatch`",
  "`NEXT: fix | round: <r>`",
  "`NEXT: judge`",
  "`NEXT: exit-plan`",
  "`STOP:`",
  `${PLAN_BUILD_CALL} open "<plan-path>"`,
  "never a `SendMessage` to an earlier judge",
];

for (const phrase of GATE_PHRASES) {
  test(`planner step 4 runs plan-build.sh and follows its directives as written: ${phrase}`, () => {
    assert.ok(section(PLANNER, "4. Review gate").includes(phrase));
  });
}

test("planner step 4 names no review round past the second: the script counts them, and the step runs judge again only on NEXT: judge", () => {
  const gate = section(PLANNER, "4. Review gate");
  assert.ok(gate.includes("At most two review rounds, counted by the script."));
  assert.ok(gate.includes("- `NEXT: judge`: run `judge` again, for the second and last round."));
  assert.doesNotMatch(gate, /round: 3|third round/);
});

test("the planner Rules build a dispatch prompt from the block lines below NEXT: and then the text of each add: field", () => {
  const rule = section(PLANNER, "Rules");
  assert.ok(rule.includes("The prompt is the block's lines below its `NEXT:` line, never that line, then the text of each `add:` field"));
});

for (const field of ["add: input", "add: answered", "add: lines"]) {
  test(`the planner Rules and the header of plan-build.ts both name the ${field} text`, () => {
    assert.deepEqual([section(PLANNER, "Rules").includes(`\`${field}\``), PLAN_BUILD.includes(`"${field}"`)], [true, true]);
  });
}

const SCRIPT_OWNED = ["override", "add: previous", "previous findings", "fix: <where>", "@@ EDIT"];

for (const phrase of SCRIPT_OWNED) {
  test(`the planner names nothing the scripts keep between a fixer and a reviewer: ${phrase}`, () => {
    assert.ok(!PLANNER.includes(phrase));
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
  test(`planner step 4 keeps no verdict ranking, retry count or round prompt rule of its own: ${phrase}`, () => {
    assert.ok(!section(PLANNER, "4. Review gate").includes(phrase));
  });
}

test("planner step 5 makes a change after a refused ExitPlanMode a fix of its own and calls ExitPlanMode again with no review round and no question", () => {
  assert.ok(section(PLANNER, "5. Hand off").includes("A change the user asks for after a refused `ExitPlanMode` is a fix of your own whose `add: lines` is `change:` then what to change; after it call `ExitPlanMode` again, with no review round and no question."));
});

test("planner step 5 shows the OPEN: lines of NEXT: exit-plan as one list before it leaves plan mode, the critical ones named as open critical problems", () => {
  assert.ok(section(PLANNER, "5. Hand off").includes("Call `ExitPlanMode` only on a `NEXT: exit-plan`, after showing the user its `OPEN:` lines as one list, the `critical` ones named as open critical problems."));
});

test("planner steps 2 and 3 open no review round: they dispatch the writers and assemble their files", () => {
  assert.doesNotMatch(section(PLANNER, "2. Write the plan") + section(PLANNER, "3. Assemble"), /judge|review/);
});

test("planner allows plan-build.sh as the one script of its own directory", () => {
  const own = [...allowedToolsLine(PLANNER).matchAll(/Bash\(\$\{CLAUDE_SKILL_DIR\}\/scripts\/([a-z-]+\.sh):\*\)/g)].map((match) => match[1]);
  assert.deepEqual(own, ["plan-build.sh"]);
});

for (const name of ["allowed", "required"]) {
  test(`the ${name} branching-fix fragment opens on the fix of NEXT: fix | round: 1`, () => {
    assert.ok(read(`skills/planner/fragments/branching-fix.${name}.md`).startsWith("After the fix of `NEXT: fix | round: 1` is applied"));
  });
}


test("planner reads no code and composes no plan text (the code a plan reaches stays out of the session's context)", () => {
  assert.ok(PLANNER.includes("You read no code and compose no plan text"));
});

test("planner relays no content: agents write files, scripts move them, the session passes paths, verdict words and answers", () => {
  assert.ok(PLANNER.includes("and you relay no content: agents write files, scripts move them, you pass paths, verdict words and the user's answers. Never `Read` the plan or a file an agent wrote unless a step says so."));
});

// [verdict, the planning agents that reply it]: the planner acts on each by its word.
const REPLY_VERDICTS: [string, [string, string][]][] = [
  ["VERDICT: MAPPED", [["plan-surveyor", SURVEYOR]]],
  ["VERDICT: WRITTEN", OWNERS],
  ["VERDICT: FIXED", OWNERS],
  ["VERDICT: DECIDE", OWNERS],
  ["VERDICT: DENIED", [["plan-surveyor", SURVEYOR], ...OWNERS]],
];

for (const [verdict, agents] of REPLY_VERDICTS) {
  for (const [name, text] of agents) {
    test(`${name} names the reply ${verdict} in its Output and the planner acts on it`, () => {
      assert.deepEqual([section(text, "Output").includes(verdict), PLANNER.includes(verdict)], [true, true]);
    });
  }
}

test("the planner Rules name which writing agent replies which verdict above its OUT: line", () => {
  assert.ok(section(PLANNER, "Rules").includes("A writing agent replies `OUT: <path>` above its verdict: the surveyor `VERDICT: MAPPED`, the architect and an author `VERDICT: WRITTEN`, either on a fix block `VERDICT: FIXED`."));
});

test("plan-surveyor never replies VERDICT: DECIDE: it writes its DECIDE: lines into the outline, which plan-build.sh outline prints", () => {
  assert.ok(!SURVEYOR.includes("VERDICT: DECIDE"));
});

test("the planner continues an agent that replied VERDICT: DECIDE through SendMessage and dispatches its block again when that fails", () => {
  assert.ok(section(PLANNER, "Rules").includes("Then send that agent those lines through `SendMessage` (refused, or no answer: its block dispatched again)."));
});

for (const [name, text] of OWNERS) {
  for (const marker of ["@@ EDIT", "@@ WITH", "@@ END"]) {
    test(`${name} writes and the header of plan-build.ts applies the edit block marker ${marker}`, () => {
      assert.deepEqual([section(text, "Fix").includes(`\n${marker}\n`), PLAN_BUILD.includes(`"${marker}"`)], [true, true]);
    });
  }

  test(`${name} writes one fix: line per fix applied and one unfixed: line per critical problem it cannot fix, the two lines the header of plan-build.ts reads outside the blocks`, () => {
    assert.ok(section(text, "Fix").includes("\nfix: <where> - <change>\nunfixed: <where> - <why you cannot fix it>\n"));
    assert.ok(PLAN_BUILD.includes('"fix: <where> - <change>" and "unfixed: <where> - <why>" lines'));
  });

  test(`${name} answers a critical problem it cannot fix with an unfixed: line, never a DECIDE: reply`, () => {
    assert.ok(section(text, "Fix").includes("is an `unfixed:` line, never a `DECIDE:` reply"));
  });

  test(`${name} and the header of plan-build.ts agree that the text of an edit occurs exactly once in the plan and the blocks apply in order, all or none`, () => {
    const fix = section(text, "Fix");
    assert.ok(fix.includes("<lines of the plan file as they stand, enough of them to occur exactly once>"));
    assert.ok(fix.includes("The blocks apply in order, all or none"));
    assert.ok(PLAN_BUILD.includes("in order, all or none: the lines up to \"@@ WITH\" must occur exactly once in the plan"));
  });
}

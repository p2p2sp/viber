/*
 * planner-agents-prose.unit.test.ts - pins the contracts the planner's agents share with each other
 * and with the script that prints their dispatch blocks, `plan-build.sh`.
 *
 * - The carrier rule: the three planning agents (`plan-surveyor`, `plan-architect`, `plan-author`)
 *   and the plan judge hold no `Bash`, name `plan:` first and `out:` among their input lines, write
 *   their result to the file plan mode names as theirs or to the `out:` path, and reply
 *   `OUT: <path>` above the `VERDICT:` line. The planner passes that path on and the script header
 *   names the `out:` line.
 * - The judge: its `tools:` is exactly `Read, Write` (no `Grep`, `Glob` or `Bash`: it searches no
 *   code), it holds one rule for what is critical, and its file holds `VERDICT:`, `CRITICAL:` and
 *   `NOTE:` lines, the lines an owner reads as its findings.
 * - The files the writers hand to the script: the outline of the surveyor, who searches and reads
 *   no code file; the frame file of the architect, who reads no file body; the author file with
 *   its facts, every task line written and no dependency; and the fix file both owners write.
 * - The review gate of the planner skill: after review round two no branch of it asks the user.
 * - Every `viber:<name>` the planner skill, its ADR reference and the script name is a skill or an
 *   agent `plugin.json` lists, with an existing file.
 *
 * The files read here are shipped prompts and script headers, whose text is the behaviour. Nothing
 * is spawned. Each phrase is matched with any run of whitespace between its words, so rewrapping a
 * line breaks no test, and each derived check is a pure function proven on a synthetic sample first.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/planner-agents-prose.unit.test.ts
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

const WRITERS = ["plan-surveyor", "plan-architect", "plan-author"];
const REVIEWERS = ["plan-judge"];
const AGENTS: Record<string, string> = Object.fromEntries([...WRITERS, ...REVIEWERS].map((name) => [name, read(`agents/${name}.md`)]));

const PLANNER = read("skills/planner/SKILL.md");
const ADR_TASKS = read("skills/planner/references/adr-tasks.md");
const PLUGIN_JSON = read(".claude-plugin/plugin.json");
const PLAN_BUILD_CORE = read("lib/plan-build.ts");
// The header of the script without its comment prefix, so a phrase wrapped over two lines still matches.
const PLAN_BUILD = read("skills/planner/scripts/plan-build.ts").replace(/\r?\n \*/g, "\n");

function has(haystack: string, text: string): boolean {
  const escaped = text.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("\\s+")).test(haystack);
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** The labels of the lines a `## Input` names in its bullets: `label:` alone in backticks, or `tasks: T<a>-T<b>`. */
function inputLabels(text: string): string[] {
  const bullets = lines(section(text, "Input")).filter((line) => line.startsWith("- "));
  const labels = bullets.flatMap((line) => [...line.matchAll(/`([a-z]+):(?:`| T<)/g)].map((match) => match[1]));
  return [...new Set(labels)].sort();
}

/** Every `viber:<name>` of a text, the `/viber:<name>` command form left out. */
function viberNames(text: string): string[] {
  return [...new Set([...text.matchAll(/(?<![/\w])viber:([a-z][a-z-]*)/g)].map((match) => match[1]))].sort();
}

function unlisted(names: string[], pluginJson: string, exists: (entry: string) => boolean): string[] {
  const plugin = JSON.parse(pluginJson) as { skills: string[]; agents: string[] };
  return names.filter((name) => {
    if (plugin.skills.includes(`./skills/${name}/`)) return false;
    return !plugin.agents.includes(`./agents/${name}.md`) || !exists(`agents/${name}.md`);
  });
}

// ---------------------------------------------------------------------------
// Self-checks
// ---------------------------------------------------------------------------

test("the labels of an Input are the backticked `label:` words of its bullets, a `tasks: T<a>-T<b>` included and a value line such as `fix: <where>` left out", () => {
  const sample = "## Input\n\nThe prompt carries `skipped:` lines:\n\n- `plan:` (the path) and `sum:`.\n- `tasks: T<a>-T<b>`, the range.\n- `fixes:`: one `fix: <where> - <change>` line each, an `Answered: <a> -> <b>` line too.\n\n## Check\n\n- `late:`\n";
  assert.deepEqual(inputLabels(sample), ["fixes", "plan", "sum", "tasks"]);
});

test("a viber:<name> that is neither a listed skill nor a listed agent with a file is reported, a /viber: command is no name", () => {
  const plugin = JSON.stringify({ skills: ["./skills/intent/"], agents: ["./agents/plan-author.md", "./agents/gone.md"] });
  const names = viberNames("Run `/viber:help`, invoke `viber:intent`, dispatch viber:plan-author, viber:gone and viber:nobody.");
  assert.deepEqual(names, ["gone", "intent", "nobody", "plan-author"]);
  assert.deepEqual(unlisted(names, plugin, (entry) => entry !== "agents/gone.md"), ["gone", "nobody"]);
});

// ---------------------------------------------------------------------------
// The carrier rule
// ---------------------------------------------------------------------------

const TOOLS: [string[], string][] = [
  [["plan-surveyor"], "tools: Read, Grep, Glob, Write"],
  [["plan-architect", "plan-author"], "tools: Read, Grep, Glob, Write, Edit"],
  [REVIEWERS, "tools: Read, Write"],
];

for (const [names, tools] of TOOLS) {
  for (const name of names) {
    test(`${name} holds exactly ${tools.slice(7)} (a Bash in the list would let it write past the plan-mode notice)`, () => {
      assert.ok(lines(AGENTS[name]).includes(tools));
    });
  }
}

test("plan-judge tools: is exactly Read, Write, holding no Grep, Glob or Bash (the judge searches no code: it reads the plan and the confirmed summary)", () => {
  const front = AGENTS["plan-judge"].slice(0, AGENTS["plan-judge"].indexOf("\n---", 3));
  const tools = lines(front).filter((line) => line.startsWith("tools:"));
  assert.deepEqual(tools, ["tools: Read, Write"]);
  assert.doesNotMatch(tools[0], /Grep|Glob|Bash/);
});

const WRITES_TO = "to the plan file the plan-mode notice names as yours; with no such notice, to the `out:` path. Write no other file.";
const REPLIES_OUT = "Reply with `OUT: <the path written>` on its own line, then";

for (const name of [...WRITERS, ...REVIEWERS]) {
  test(`${name} names plan: as the first line of its input (run-summary.sh finds a planning transcript by it)`, () => {
    const first = lines(section(AGENTS[name], "Input")).find((line) => line.startsWith("- ")) ?? "";
    assert.ok(first.startsWith("- `plan:`"));
  });

  test(`${name} names out: among its input lines as the file it writes when plan mode names it none`, () => {
    const bullet = lines(section(AGENTS[name], "Input")).find((line) => line.startsWith("- `out:`")) ?? "";
    assert.ok(has(bullet, "when plan mode names you"));
  });

  test(`${name} writes its result to the file the plan-mode notice names as its own, else to the out: path, and to no other file`, () => {
    assert.ok(has(section(AGENTS[name], "Output"), WRITES_TO));
  });

  test(`${name} replies OUT: with the path written on its own line above its verdict`, () => {
    assert.ok(has(section(AGENTS[name], "Output"), REPLIES_OUT));
  });

  test(`${name} states in its opening that it writes one file`, () => {
    assert.ok(has(AGENTS[name].slice(0, AGENTS[name].indexOf("## Input")), "You write one file, "));
  });
}

const REPLY_VERDICT: [string, string][] = [
  ["plan-surveyor", "`VERDICT: MAPPED`, and nothing else."],
  ["plan-architect", "`VERDICT: WRITTEN` (`VERDICT: FIXED` on `mode: fix`), and nothing else."],
  ["plan-author", "`VERDICT: WRITTEN` (`VERDICT: FIXED` on `mode: fix`), and nothing else."],
  ...REVIEWERS.map((name): [string, string] => [name, "the `VERDICT:` line, as plain text and nothing else."]),
];

for (const [name, ending] of REPLY_VERDICT) {
  test(`${name} ends its reply on its verdict and nothing else: ${ending}`, () => {
    assert.ok(has(section(AGENTS[name], "Output"), `${REPLIES_OUT} ${ending}`));
  });
}

for (const name of REVIEWERS) {
  test(`${name} writes no file and replies VERDICT: PASS alone when it has nothing to report`, () => {
    assert.ok(has(section(AGENTS[name], "Output"), "With nothing to report, write no file and reply `VERDICT: PASS` alone."));
  });
}

for (const name of ["plan-architect", "plan-author"]) {
  test(`${name} writes no file when it owes the user a decision before the plan is written and replies its DECIDE: lines, then VERDICT: DECIDE`, () => {
    const output = section(AGENTS[name], "Output");
    assert.ok(has(output, "write no file and reply with one `DECIDE: <decision> | <recommended option> | <option> | <option>` line per"));
    assert.ok(has(output, "then `VERDICT: DECIDE`."));
  });
}

test("the header of plan-build.ts opens every block on plan:, a writing block then on refs:, and names out: as the file the agent writes when plan mode names it none", () => {
  assert.ok(has(PLAN_BUILD, 'Every block opens on "plan: <plan>", a writing block then on "refs: <plugin root>/references"; "out:" is the file the agent writes when plan mode names it none of its own.'));
});

test("the planner passes the OUT: path of a writing agent to the next script and treats a writing verdict with no OUT: line as no verdict", () => {
  const rules = section(PLANNER, "Rules");
  assert.ok(has(rules, "A writing agent replies `OUT: <path>` above its verdict"));
  assert.ok(has(rules, "Pass that path to the next script as `<OUT path>`."));
  assert.ok(has(rules, "A reply with no `VERDICT:` line, or with one of those verdicts and no `OUT:` line, is handled as `VERDICT: DENIED` with `REASON: no verdict returned`."));
});

test("the planner reports the judge's OUT: path with --out and a FAIL with no OUT: line as none, the forms judged of plan-build.ts takes", () => {
  const gate = section(PLANNER, "4. Review gate");
  assert.ok(has(gate, "or `none` without one or for a `FAIL` with no `OUT:` line; a reply with no `OUT:` line drops `--out` and its value."));
  assert.ok(has(PLAN_BUILD, "judged <plan> <PASS|FAIL|DENIED|none> [--out <file>]"));
  assert.ok(has(PLAN_BUILD, "none, the first time in the round"));
});

test("a FAIL whose file plan-build.sh cannot use is reported again as none: the directive the script prints, the step 4 bullet that acts on it and the one judged call the plan gate takes as the answer to a FAIL", () => {
  assert.ok(has(PLAN_BUILD, 'FAIL with no readable file or with a file holding no CRITICAL: line: "NEXT: judged | none" and no round counted. The NOTE: lines of a readable file go into "## Open items" first (the none report names no file)'));
  assert.ok(has(section(PLANNER, "4. Review gate"), "- `NEXT: judged | none`: report that reply again as `none`, with no `--out`."));
  const gate = read("hooks/scripts/plan-gate.sh");
  assert.ok(gate.includes('judged${plan_arg}${next_word}none${word_end}'));
  assert.ok(has(gate.replace(/\n# ?/g, "\n"), "A `judged` call with PASS or FAIL answers nothing."));
});

// ---------------------------------------------------------------------------
// The files the writers hand to the script
// ---------------------------------------------------------------------------

const SURVEYOR = AGENTS["plan-surveyor"];
const ARCHITECT = AGENTS["plan-architect"];
const AUTHOR = AGENTS["plan-author"];

test("no planning prompt, the planner skill or the script header names a PENDING line: an author writes every line of its tasks", () => {
  for (const text of [...Object.values(AGENTS), PLANNER, PLAN_BUILD, PLAN_BUILD_CORE]) assert.ok(!text.includes("PENDING"));
});

test("the surveyor maps by search alone: it reads only the input and the outline: file and opens no code file", () => {
  assert.ok(has(section(SURVEYOR, "Map"), "Search, never read: `Read` only the input and the `outline:` file."));
  assert.ok(has(section(SURVEYOR, "Map"), "and open no code file"));
  assert.doesNotMatch(SURVEYOR, /by range|plan-rules|`Size`/);
});

test("the surveyor writes one AREA: line per area with its task estimate and no TASKS: line: plan-build.sh outline sums the estimates", () => {
  assert.ok(section(SURVEYOR, "Output").includes("\nAREA: <name> | <estimated task count, the number alone> | <what it delivers>\n"));
  assert.ok(!SURVEYOR.includes("TASKS:"));
  assert.ok(has(PLAN_BUILD, "TASKS: <n> the sum of the estimates of its AREA: lines"));
});

test("the architect writes the frame and no task, reading no file body: a declaration by range only for a contract block it writes", () => {
  assert.ok(has(ARCHITECT, "The tasks are written by the author of each slice, never by you."));
  assert.ok(has(section(ARCHITECT, "Read"), "No file body: the authors read the code. Read a declaration by range only for a contract block you write"));
  assert.ok(has(section(ARCHITECT, "Write"), "Below it write the line `## Tasks` alone, then `## Contracts`."));
  assert.ok(!ARCHITECT.includes("skeleton"));
});

test("the frame file of the architect and the header of plan-build.ts agree on its two markers and on the SLICE: line", () => {
  const write = section(ARCHITECT, "Write");
  assert.ok(write.includes("\n<!-- SLICES -->\nSLICE: <k> | covers: AC1, AC3 | uses: C1 | <what the slice delivers>\n<!-- DECISIONS -->\n"));
  assert.ok(has(PLAN_BUILD, '"<!-- SLICES -->" and "<!-- DECISIONS -->" lines'));
  assert.ok(has(PLAN_BUILD, '"SLICE: <k> | covers: AC1, AC3 | uses: C1 | <what the slice delivers>" lines'));
  assert.ok(has(write, "every criterion on at least one line"));
});

test("an author writes every line of every task, Depends-on as none on each: the script computes the order", () => {
  const write = section(AUTHOR, "Write");
  assert.ok(has(write, "Every line of every task is written, `Verification` and `DoD` each on one line. `- Depends-on: none` on every task: a script computes the order from `Files` and `Uses`."));
  assert.ok(has(PLAN_BUILD, 'No author writes a dependency: every "- Depends-on:" line is "none" or the ids of the earlier tasks a task waits for, ascending.'));
  assert.ok(has(read("skills/planner/templates/tasks.md"), '"Depends-on:" is written "none" on every task: a script computes it from "Files" and "Uses".'));
});

test("an author takes every command and identifier from a file it read and writes a FACT: line for it, the notes its fix dispatch gets back", () => {
  assert.ok(has(section(AUTHOR, "Write"), "Take every command, test path and identifier from a file you read, and write one `FACT:` line for it"));
  assert.ok(section(AUTHOR, "Write").includes("\n<!-- NOTES -->\nFACT: <path>:<line> | <short quote> | <what the plan takes from it>\nGAP: <what the frame lacks or states wrong, and why>\nOUTSIDE: <path> | <the behaviour that reference keeps>\n"));
  assert.ok(has(section(AUTHOR, "Input"), "`notes:` (`fix`, optional) is the `FACT:` lines of your author file: what you read in the code."));
  assert.ok(has(PLAN_BUILD, "the FACT: lines of each slice to <dir>/notes-<k>.md"));
});

test("an author fixing its text reads its notes and findings and opens no code file a FACT: line covers", () => {
  assert.ok(has(section(AUTHOR, "Fix"), "Open no code file a `FACT:` line covers: the fact is what you read there."));
});

test("an author of a slice names its own contract blocks L<n>, which the script numbers, and reports what the frame lacks as a GAP: line", () => {
  const write = section(AUTHOR, "Write");
  assert.ok(has(write, "one `### L<n> - <name>` block per shape your slice alone introduces or consumes, its `File:` line first, named `L<n>` in your `Uses`."));
  assert.ok(has(write, "What the frame lacks or states wrong (a criterion, a shared block, a file another slice holds) is one `GAP:` line"));
  assert.ok(has(PLAN_BUILD, "gives each L<n> block the next free C<k>"));
});

const FIX_FILE = "\n@@ EDIT\n<lines of the plan file as they stand, enough of them to occur exactly once>\n@@ WITH\n<the lines replacing them>\n@@ END\nfix: <where> - <change>\nunfixed: <where> - <why you cannot fix it>\nGAP: ";

for (const [name, text, gap] of [
  ["plan-author", AUTHOR, "GAP: frame | <what the frame owner must change>"],
  ["plan-architect", ARCHITECT, "GAP: <task id> | <what its author must change>"],
] as [string, string, string][]) {
  test(`${name} writes its fix as edit blocks with one fix: or unfixed: line each, and sends what another owner must change as ${gap.slice(0, gap.indexOf(" |"))}`, () => {
    const fix = section(text, "Fix");
    assert.ok(fix.includes(FIX_FILE));
    assert.ok(fix.includes(`\n${gap}\n`));
    assert.ok(has(fix, "The blocks apply in order, all or none"));
    assert.ok(has(fix, "is an `unfixed:` line, never a `DECIDE:` reply."));
    assert.ok(has(fix, "A file of `unfixed:` or `GAP:` lines alone holds no block."));
    assert.doesNotMatch(text, /Blocking|Minor|\(behaviour\)/);
  });

  test(`${name} adds a task under an id no task of the plan holds, with Depends-on none: the script numbers and orders the tasks`, () => {
    assert.ok(has(section(text, "Fix"), "an id no task of the plan holds (`NEW1`)"));
    assert.ok(has(section(text, "Fix"), "a script numbers and orders the tasks"));
  });

  test(`${name} reads a records: block by the Record tasks and Record shape sections of its rules: file, the sections adr-tasks.md holds`, () => {
    assert.ok(has(section(text, "Fix"), "A `records:` block holds accepted decision records, with `rules:`, `stamp:` and `today:` lines: read `## Record tasks` and `## Record shape` of the `rules:` file and add the tasks they define"));
    assert.deepEqual(["## Record tasks", "## Record shape"].filter((heading) => !lines(ADR_TASKS).includes(heading)), []);
  });
}

test("the header of plan-build.ts sends a GAP: line of the frame owner to the author of the task it names and one of a slice author to the architect once", () => {
  assert.ok(has(PLAN_BUILD, "A GAP: line of the frame owner naming a task goes to the author of that task"));
  assert.ok(has(PLAN_BUILD, 'one of a slice author naming "frame" goes to the architect once per plan'));
});

// ---------------------------------------------------------------------------
// The judge
// ---------------------------------------------------------------------------

const JUDGE = AGENTS["plan-judge"];

test("the Input of plan-judge names exactly the lines of the judge block the header of plan-build.ts lists", () => {
  assert.deepEqual(inputLabels(JUDGE), ["changed", "input", "out", "plan", "round"]);
  assert.ok(has(PLAN_BUILD, "plan-judge plan, round, input, changed, out"));
});

test("plan-judge reads the plan and the input alone: it searches no code and reads no rule file", () => {
  assert.ok(has(section(JUDGE, "Judge"), "Read the plan and the input, and nothing else: you search no code and read no rule file."));
  assert.doesNotMatch(JUDGE, /refs|plan-rules|test-strategy/);
});

test("plan-judge holds one rule for what is critical and makes everything else a note or nothing, by its negative list", () => {
  const judge = section(JUDGE, "Judge");
  assert.ok(has(judge, "A problem is critical only when the plan contradicts the input or an `Answered:` line, or when a coder cannot resolve it without changing a `DoD` clause, a `## Contracts` block or a file outside its task's `Files`."));
  assert.ok(has(judge, "Everything else is a note or nothing: wording, style, test strategy and anything a coder can settle inside its own `Files`."));
  assert.doesNotMatch(JUDGE, /Blocking|Minor/);
});

test("plan-judge reads in round 2 only the text its changed: file names and what refers to it", () => {
  assert.ok(has(section(JUDGE, "Judge"), "Round 2 with a `changed:` file: judge only the text that file names and what in the plan refers to it."));
});

test("the judge file holds VERDICT:, CRITICAL: and NOTE: lines and nothing else, FAIL exactly on a CRITICAL: line, at most 3 notes per task", () => {
  const output = section(JUDGE, "Output");
  assert.ok(output.includes("\nVERDICT: PASS | FAIL\nCRITICAL: <where> | <what is wrong> | <what to change>\nNOTE: <T<n>|plan> | <one line>\n"));
  assert.ok(has(output, "`FAIL` exactly when the file holds a `CRITICAL:` line."));
  assert.ok(has(section(JUDGE, "Judge"), "at most 3 per task"));
});

for (const name of ["plan-architect", "plan-author"]) {
  test(`${name} reads the critical lines of the judge as its findings, by the CRITICAL: line the judge writes`, () => {
    assert.ok(has(section(AGENTS[name], "Input"), "`CRITICAL: <where> | <what is wrong> | <what to change>` lines of the review"));
  });
}

test("the second review of a plan written outside the planner is sent the CRITICAL lines of the first and what was changed for each: the Input of outside-plan-review, the plan-mode hint and the refusal of plan-gate.sh name the same dispatch", () => {
  assert.ok(has(section(read("agents/outside-plan-review.md"), "Input"), "The prompt carries the plan path, one sentence stating the user's goal, and on the second and last review the `CRITICAL:` lines of the first plus what was changed for each."));
  assert.ok(has(read("hooks/content/plan-hints.md"), "On FAIL fix its CRITICAL lines and dispatch it once more, adding those lines and what you changed for each to the plan path and the goal: that second review is the last."));
  assert.ok(read("hooks/scripts/plan-gate.sh").includes(`dispatch_with="the plan path and one sentence stating the user's goal, and on a second review the CRITICAL lines of the first plus what you changed for each"`));
});

test("plan-judge reads the Answered: lines as part of its input", () => {
  assert.ok(JUDGE.includes("`Answered:"));
});

// ---------------------------------------------------------------------------
// The review gate of the planner skill
// ---------------------------------------------------------------------------

test("step 4 of the planner skill names no AskUserQuestion and its rule for round 2 runs open: after round two no branch of it asks the user", () => {
  const gate = section(PLANNER, "4. Review gate");
  assert.ok(!gate.includes("AskUserQuestion"));
  assert.ok(has(gate, "Round 2, and every fix step after a `NEXT: exit-plan`: ask the user nothing. A refused fix file (the first exit 4), a `VERDICT: DENIED` or a `DECIDE:` reply runs `open`."));
  assert.ok(has(gate, '"${CLAUDE_SKILL_DIR}/scripts/plan-build.sh" open "<plan-path>"'));
  assert.doesNotMatch(gate, /\bask the user\b(?! nothing)/i);
});

test("a change the user asks for after a refused ExitPlanMode asks nothing either: step 5 names no question, its fix falls under the round 2 rule of step 4, and open of plan-build.sh has a path once the review is over", () => {
  const hand = section(PLANNER, "5. Hand off");
  assert.ok(!hand.includes("AskUserQuestion"));
  assert.ok(has(hand, "is a fix of your own whose `add: lines` is `change:` then what to change; after it call `ExitPlanMode` again, with no review round and no question."));
  assert.ok(has(PLAN_BUILD, 'Once the review is over it gives up the fix of a change made after it: the plan gets "- critical | plan | a change asked for after the review was not applied" and "NEXT: exit-plan" with the OPEN: lines follows.'));
});

for (const name of ["allowed", "required"]) {
  test(`the ${name} branching-fix fragment runs the branch command again after the fix of round 1 alone: after round two it asks nothing, a new branch question included`, () => {
    const text = read(`skills/planner/fragments/branching-fix.${name}.md`);
    assert.ok(text.startsWith("After the fix of `NEXT: fix | round: 1` is applied, run the branch step's last `plan-path.sh --branch` command again"));
    assert.ok(has(text, "After a fix of round 2 or of step 5 never run it: the recorded keys stand, and nothing is asked."));
  });
}

test("every exit code of plan-build.sh has a branch in the Rules of the planner skill: 4 for what an agent wrote, 2 for a call to correct, 5 and an exit 2 that names no call to stop on", () => {
  const rules = section(PLANNER, "Rules");
  assert.ok(has(rules, "A `plan-build.sh` exit 4 refused a file and wrote nothing"));
  assert.ok(has(rules, "A `plan-build.sh` exit 2: make the call its `error:` line names, once. Otherwise, and on an exit 5: show the `error:` line and stop, no hand-off."));
  assert.deepEqual([...new Set([...read("lib/plan-build.ts").matchAll(/fail\((\d)/g)].map((match) => match[1]))].sort(), ["2", "4", "5"]);
  assert.ok(has(PLAN_BUILD, "4 when what an agent wrote cannot be used, a file of its that cannot be read included"));
});

test("the Rules of the planner skill send the two questions a review fix would ask to step 4, which runs open in their place", () => {
  const rules = section(PLANNER, "Rules");
  assert.ok(has(rules, "Step 4 names the replies that ask nothing."));
  assert.ok(has(rules, "step 4 names the fixes that run `open` instead."));
});

// ---------------------------------------------------------------------------
// Every name the planner dispatches is registered
// ---------------------------------------------------------------------------

const DISPATCH_SOURCES: [string, string][] = [
  ["planner/SKILL.md", PLANNER],
  ["planner/references/adr-tasks.md", ADR_TASKS],
  ["planner/scripts/plan-build.ts", PLAN_BUILD],
  ["lib/plan-build.ts", PLAN_BUILD_CORE],
];

for (const [name, text] of DISPATCH_SOURCES) {
  test(`every viber:<name> of ${name} is a skill or an agent plugin.json lists, with an existing file`, () => {
    const names = viberNames(text);
    assert.ok(names.length > 0);
    assert.deepEqual(unlisted(names, PLUGIN_JSON, (entry) => fs.existsSync(path.join(VIBER, entry))), []);
  });
}

for (const name of [...WRITERS, ...REVIEWERS]) {
  test(`plan-build prints a block for viber:${name}, in its core and in the header of its entry`, () => {
    assert.deepEqual([PLAN_BUILD_CORE.includes(`agent: viber:${name}`), PLAN_BUILD.includes(`viber:${name}`)], [true, true]);
  });
}

test("the planner names no planning agent and no judge by its dispatch name (the scripts name them on the agent: field)", () => {
  const planning = viberNames(PLANNER).filter((name) => [...WRITERS, ...REVIEWERS].includes(name));
  assert.deepEqual(planning, []);
  assert.ok(has(section(PLANNER, "Rules"), "one `Agent` call per block a script printed, the agent named on its `agent:` field."));
});

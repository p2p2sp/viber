/*
 * planner-agents-prose.unit.test.ts - pins the contracts the planner's agents share with each other
 * and with the two scripts that print their dispatch blocks, `plan-build.sh` and `review-round.sh`.
 *
 * - The carrier rule: the four planning agents (`plan-surveyor`, `plan-architect`, `plan-detailer`,
 *   `plan-fixer`) and the four plan reviewers hold no `Bash`, name `plan:` first and `out:` among
 *   their input lines, write their result to the file plan mode names as theirs or to the `out:`
 *   path, and reply `OUT: <path>` above the `VERDICT:` line. The planner passes that path on and both
 *   script headers name the `out:` line.
 * - The `PENDING` skeleton: the architect writes `- Verification: PENDING` and `- DoD: PENDING`, the
 *   detailer fills those two lines alone, the header of `plan-build.ts` tells a skeleton by them, and
 *   the two reviewers the skeleton stage sends, like the fixer, treat one as no finding.
 * - The finding markers `(inferred)`, `(untouched)` and `(behaviour)`: one sentence in the `## Output`
 *   of the four reviewers, which `review-round.sh` reads back and the fixer acts on.
 * - The block of a review member: the lines the header of `review-round.sh` gives each reviewer are
 *   the lines its `## Input` names. The blocks of the planning agents are held to what the core
 *   prints by planner-blocks.unit.test.ts.
 * - Every `viber:<name>` the planner skill, its ADR reference and the two scripts name is a skill or
 *   an agent `plugin.json` lists, with an existing file.
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

const WRITERS = ["plan-surveyor", "plan-architect", "plan-detailer", "plan-fixer"];
const REVIEWERS = ["planner-review", "planner-spec-review", "planner-graph-review", "planner-task-review"];
const AGENTS: Record<string, string> = Object.fromEntries([...WRITERS, ...REVIEWERS].map((name) => [name, read(`agents/${name}.md`)]));

const PLANNER = read("skills/planner/SKILL.md");
const ADR_TASKS = read("skills/planner/references/adr-tasks.md");
const PLUGIN_JSON = read(".claude-plugin/plugin.json");
const PLAN_BUILD_CORE = read("lib/plan-build.ts");
const REVIEW_ROUND = read("skills/planner/scripts/review-round.sh");
// The header of each script without its comment prefix, so a phrase wrapped over two lines still matches.
const PLAN_BUILD = read("skills/planner/scripts/plan-build.ts").replace(/\r?\n \*/g, "\n");
const REVIEW_ROUND_HEADER = REVIEW_ROUND.slice(0, REVIEW_ROUND.indexOf("\nset -u")).replace(/^#/gm, "");

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

/**
 * The lines of a member block as the header of review-round.sh lists them, each with the reviewers it
 * goes to: the ones its note names, every reviewer when it names none, and for "every other member"
 * the ones the line before it left out.
 */
function memberBlock(header: string): [string, string[]][] {
  const all = lines(header);
  const start = all.findIndex((line) => line.startsWith(" Block of a member"));
  const end = all.findIndex((line, index) => index > start && line.startsWith(" <dir> is"));
  const rows: [string, string[]][] = [];
  for (const line of all.slice(start + 1, end)) {
    const match = /^ {3}([a-z]+): (.*)$/.exec(line);
    if (match === null) continue;
    const named = REVIEWERS.filter((name) => new RegExp(`(?<![a-z-])${name}(?![a-z-])`).test(match[2]));
    const before = rows.length > 0 ? rows[rows.length - 1][1] : REVIEWERS;
    const others = REVIEWERS.filter((name) => !before.includes(name));
    rows.push([match[1], match[2].includes("every other member") ? others : named.length > 0 ? named : REVIEWERS]);
  }
  return rows;
}

function blockLabels(block: [string, string[]][], reviewer: string): string[] {
  return block.filter(([, members]) => members.includes(reviewer)).map(([label]) => label).sort();
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

test("a member block line goes to the reviewers its note names, to all four when it names none, and to the rest for every other member", () => {
  const sample = [
    " Block of a member, in order:",
    "   NEXT: review | member: <k>",
    "   plan: <plan>",
    "   memory: <value>   planner-review, planner-graph-review, planner-task-review",
    "   brief: <file>     planner-task-review, when written",
    "                     a continuation naming planner-spec-review",
    "   reach: <file>     every other member",
    " <dir> is the state directory.",
    "   late: <x>",
  ].join("\n");
  assert.deepEqual(memberBlock(sample), [
    ["plan", REVIEWERS],
    ["memory", ["planner-review", "planner-graph-review", "planner-task-review"]],
    ["brief", ["planner-task-review"]],
    ["reach", ["planner-review", "planner-spec-review", "planner-graph-review"]],
  ]);
});

test("a viber:<name> that is neither a listed skill nor a listed agent with a file is reported, a /viber: command is no name", () => {
  const plugin = JSON.stringify({ skills: ["./skills/intent/"], agents: ["./agents/plan-fixer.md", "./agents/gone.md"] });
  const names = viberNames("Run `/viber:help`, invoke `viber:intent`, dispatch viber:plan-fixer, viber:gone and viber:nobody.");
  assert.deepEqual(names, ["gone", "intent", "nobody", "plan-fixer"]);
  assert.deepEqual(unlisted(names, plugin, (entry) => entry !== "agents/gone.md"), ["gone", "nobody"]);
});

// ---------------------------------------------------------------------------
// The carrier rule
// ---------------------------------------------------------------------------

const TOOLS: [string[], string][] = [
  [WRITERS, "tools: Read, Grep, Glob, Write, Edit"],
  [REVIEWERS, "tools: Read, Grep, Glob, Write"],
];

for (const [names, tools] of TOOLS) {
  for (const name of names) {
    test(`${name} holds exactly ${tools.slice(7)} (a Bash in the list would let it write past the plan-mode notice)`, () => {
      assert.ok(lines(AGENTS[name]).includes(tools));
    });
  }
}

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
  ["plan-architect", "`VERDICT: WRITTEN`, and nothing else."],
  ["plan-detailer", "`VERDICT: WRITTEN`, and nothing else."],
  ["plan-fixer", "`VERDICT: FIXED`, and nothing else."],
  ...REVIEWERS.map((name): [string, string] => [name, "the `VERDICT:` line, as plain text and nothing else."]),
];

for (const [name, ending] of REPLY_VERDICT) {
  test(`${name} ends its reply on its verdict and nothing else: ${ending}`, () => {
    assert.ok(has(section(AGENTS[name], "Output"), `${REPLIES_OUT} ${ending}`));
  });
}

for (const name of REVIEWERS) {
  test(`${name} writes no file and replies VERDICT: PASS alone when it has no finding at all`, () => {
    assert.ok(has(section(AGENTS[name], "Output"), "With no finding at all, write no file and reply `VERDICT: PASS` alone."));
  });
}

for (const name of ["plan-architect", "plan-fixer"]) {
  test(`${name} writes no file when it owes the user a decision and replies its DECIDE: lines, then VERDICT: DECIDE`, () => {
    const output = section(AGENTS[name], "Output");
    assert.ok(has(output, "write no file and reply with one `DECIDE: <decision> | <recommended option> | <option> | <option>` line per"));
    assert.ok(has(output, "then `VERDICT: DECIDE`."));
  });
}

test("the header of plan-build.ts opens every block on plan: and refs: and names out: as the file the agent writes when plan mode names it none", () => {
  assert.ok(has(PLAN_BUILD, 'Every block opens on "plan: <plan>" and "refs: <plugin root>/references"; "out:" is the file the agent writes when plan mode names it none of its own.'));
});

test("the header of review-round.sh opens a member block on plan: and names out: as where the member writes its findings when plan mode names it no file", () => {
  const block = memberBlock(REVIEW_ROUND_HEADER);
  assert.equal(block[0][0], "plan");
  assert.ok(has(REVIEW_ROUND_HEADER, "out: <dir>/review-<k>.md where the member writes its findings when plan mode names it no file of its own"));
});

test("the planner passes the OUT: path of a writing agent to the next script and treats a writing verdict with no OUT: line as no verdict", () => {
  const rules = section(PLANNER, "Rules");
  assert.ok(has(rules, "A writing agent replies `OUT: <path>` above its verdict"));
  assert.ok(has(rules, "Pass that path to the next script as `<OUT path>`."));
  assert.ok(has(rules, "A reply with no `VERDICT:` line, or with one of those verdicts and no `OUT:` line, is handled as `VERDICT: DENIED` with `REASON: no verdict returned`."));
});

test("the planner reports a reviewer's OUT: path with --out and a FAIL with no OUT: line as none, the two forms the usage of review-round.sh takes", () => {
  const gate = section(PLANNER, "4. Review gate");
  assert.ok(has(gate, "or `none` without one or for a `FAIL` with no `OUT:` line, one `--out \"<k>=<OUT path>\"` per reply carrying an `OUT:` line."));
  assert.ok(has(REVIEW_ROUND_HEADER, "review-round.sh <plan> returned <k>=<PASS|FAIL|DENIED|none> [<k>=<word>]... [--out <k>=<file>]..."));
  assert.ok(has(REVIEW_ROUND_HEADER, "a FAIL without a readable one counts as none, since there is nothing to fix from."));
});

// ---------------------------------------------------------------------------
// The PENDING skeleton
// ---------------------------------------------------------------------------

test("the architect writes a skeleton with every task block complete except Verification and DoD, both written as PENDING, and leaves no other line to their author", () => {
  assert.ok(
    has(
      section(AGENTS["plan-architect"], "Write"),
      "`mode: skeleton`: every task block is complete, its `Files` down to each test file the task writes or changes, except two lines written as `- Verification: PENDING` and `- DoD: PENDING`. Their author fills those two and may change no other line, so every other line has to stand without them.",
    ),
  );
});

test("the architect writes every line of every task in whole mode", () => {
  assert.ok(has(section(AGENTS["plan-architect"], "Write"), "`mode: whole`: every line of every task is written."));
});

test("the detailer writes the Verification and DoD lines of its tasks and no other line of the plan", () => {
  const text = AGENTS["plan-detailer"];
  assert.ok(has(text, "its `Verification` and `DoD` lines, and no other line of the plan."));
  assert.ok(has(section(text, "Write"), "Every task of the range gets both lines, each on one line, neither reading `PENDING`."));
  assert.ok(has(section(text, "Write"), "Change nothing else. A file, dependency or contract block a task lacks is one line `GAP: <task id> | <what is missing and why>`, never a line you rewrite"));
});

test("the detailer writes each task as a ### heading with its two lines, the shape the merge of plan-build.ts reads", () => {
  const write = section(AGENTS["plan-detailer"], "Write");
  assert.ok(has(write, "### <task id>\n- Verification: <command> -> <result that counts as proof>\n- DoD: <observable done condition>; <the next one>"));
  assert.ok(has(PLAN_BUILD, 'Puts the "- Verification:" and "- DoD:" lines each task file gives under a "### <id>" heading into that task of the plan, no other line of it touched'));
});

test("the header of plan-build.ts tells a skeleton by a task holding PENDING as its Verification or DoD and names the tasks still holding it after a merge", () => {
  assert.ok(has(PLAN_BUILD, '"mode: skeleton" when a task holds PENDING as its Verification or DoD (else "mode: whole")'));
  assert.ok(has(PLAN_BUILD, '"pending: <id>, ..." for tasks still holding PENDING'));
});

test("the header of plan-build.ts writes the GAP: lines of the task files to the gaps file the fixer reads as gaps:", () => {
  assert.ok(has(PLAN_BUILD, 'writes the "GAP: " lines of the files to <dir>/gaps.md'));
  assert.ok(has(section(AGENTS["plan-fixer"], "Input"), "`gaps:` (optional) is a file of `GAP: <task id> | <what is missing and why>` lines."));
});

const PENDING_IS_NO_FINDING = "task's `Verification` or `DoD` reading `PENDING` is written later and is no finding";

for (const name of ["planner-spec-review", "planner-graph-review"]) {
  test(`${name}, sent in the skeleton stage, treats a Verification or DoD reading PENDING as no finding`, () => {
    assert.ok(has(section(AGENTS[name], "Input"), PENDING_IS_NO_FINDING));
  });
}

for (const name of ["planner-review", "planner-task-review"]) {
  test(`${name}, which waits for the tasks to be written, names no PENDING line`, () => {
    assert.ok(!AGENTS[name].includes("PENDING"));
  });
}

test("the header of review-round.sh sends only the spec and graph reviewers in the skeleton stage, the two that pass over PENDING", () => {
  assert.ok(has(REVIEW_ROUND_HEADER, "so only planner-spec-review and planner-graph-review are sent; the task reviewers and planner-review wait."));
});

test("the fixer leaves a Verification or DoD reading PENDING as it stands", () => {
  assert.ok(has(section(AGENTS["plan-fixer"], "Fix"), "A `Verification` or `DoD` reading `PENDING` is no defect: leave that line as it stands."));
});

test("the planner runs its Tasks step only on mode: skeleton and merges again on a pending: line", () => {
  const step = section(PLANNER, "3. Tasks");
  assert.ok(has(step, "Only on `mode: skeleton`; `mode: whole` goes to step 4."));
  assert.ok(has(step, "A `pending:` line: a block has no pair yet, run `merge` with its pair."));
});

// ---------------------------------------------------------------------------
// The three finding markers
// ---------------------------------------------------------------------------

const MARKERS = "a Minor finding that would be Blocking ends in `(inferred)` when unverified in the plan or the code, `(untouched)` when outside the fixed text, and one where the plan changes a behaviour today's code has that no acceptance criterion asks for ends in `(behaviour)`.";

for (const name of REVIEWERS) {
  test(`${name} ends a Minor finding in (inferred), (untouched) or (behaviour) by the one sentence of its Output`, () => {
    assert.ok(has(section(AGENTS[name], "Output"), MARKERS));
  });
}

for (const heading of ["Calibration", "Output"]) {
  test(`the four plan reviewers carry the same ${heading} section, word for word`, () => {
    const sections = REVIEWERS.map((name) => section(AGENTS[name], heading));
    assert.deepEqual(sections, REVIEWERS.map(() => sections[0]));
  });
}

test("review-round.sh lists to the user the Minor findings ending in (inferred), (untouched) or (behaviour), in its header and in the pattern it reads them by", () => {
  assert.ok(has(REVIEW_ROUND_HEADER, "MINOR: viber:<name>: <a Minor finding ending in (inferred), (untouched) or (behaviour)>"));
  assert.ok(REVIEW_ROUND.includes("'\\((inferred|untouched|behaviour)\\)[[:space:]]*$'"));
});

test("review-round.sh counts a PASS whose findings file holds a Minor line ending in (behaviour) as a FAIL, in its header and in the pattern it reads it by", () => {
  assert.ok(has(REVIEW_ROUND_HEADER, "A member sent this round that holds a PASS while its findings file holds a Minor line ending in (behaviour) counts as FAIL too, once per member and plan"));
  assert.ok(REVIEW_ROUND.includes("'\\(behaviour\\)[[:space:]]*$'"));
});

test("the fixer fixes every Minor finding ending in (behaviour) across its whole class, and any other Minor one only where a Blocking fix rewrites its text", () => {
  assert.ok(
    has(
      section(AGENTS["plan-fixer"], "Fix"),
      "A findings file: fix every Blocking finding, and every Minor one ending in `(behaviour)`, a change of a behaviour today's code has that neither the input nor an `Answered:` line asks for, across its whole class in the plan; any other Minor one only where a Blocking fix rewrites its text.",
    ),
  );
});

test("the reviewers group their findings under the lines Blocking and Minor, one line opening on `- ` each, the shape the fixer reads as a findings file", () => {
  assert.ok(has(section(AGENTS["planner-review"], "Output"), "`FINDINGS:` grouped Blocking then Minor, each group under its own line `Blocking` or `Minor`, one line opening on `- ` per finding"));
  assert.ok(has(section(AGENTS["plan-fixer"], "Input"), "`findings:` (any number) is one reviewer's file: `FINDINGS:` grouped Blocking then Minor."));
});

test("the planner shows the user the MINOR: lines of NEXT: exit-plan as one list before it leaves plan mode", () => {
  assert.ok(has(section(PLANNER, "5. Hand off"), "Call `ExitPlanMode` only on a `NEXT: exit-plan`, after showing the user its `MINOR:` lines as one list."));
});

// ---------------------------------------------------------------------------
// The block of a review member against each reviewer's Input
// ---------------------------------------------------------------------------

const MEMBER_BLOCK = memberBlock(REVIEW_ROUND_HEADER);

test("the member block of review-round.sh lists its lines in dispatch order", () => {
  assert.deepEqual(MEMBER_BLOCK.map(([label]) => label), ["plan", "refs", "memory", "input", "tasks", "sum", "brief", "reach", "candidates", "previous", "fixes", "out"]);
});

for (const name of REVIEWERS) {
  test(`the Input of ${name} names exactly the lines review-round.sh puts in its block`, () => {
    assert.deepEqual(inputLabels(AGENTS[name]), blockLabels(MEMBER_BLOCK, name));
  });
}

for (const name of REVIEWERS) {
  test(`${name} names sum: as carried for the plan gate and never read`, () => {
    assert.ok(has(section(AGENTS[name], "Input"), "`sum:` (carried for the plan gate, never read)"));
  });
}

const ANSWERED_READERS = ["planner-review", "planner-spec-review"];

test("review-round.sh adds the input and the Answered: lines to the blocks of planner-review and planner-spec-review alone", () => {
  assert.ok(has(REVIEW_ROUND_HEADER, 'add: input planner-review, planner-spec-review, without --input: append "input:" and the confirmed summary or fixer diagnosis verbatim'));
  assert.ok(has(REVIEW_ROUND_HEADER, 'add: answered planner-review, planner-spec-review: append one "Answered: <decision> -> <option>" per user answer'));
});

for (const name of REVIEWERS) {
  const reads = ANSWERED_READERS.includes(name);
  test(`${name} ${reads ? "reads" : "names no"} Answered: line${reads ? "s below its input" : ""}`, () => {
    assert.equal(AGENTS[name].includes("`Answered:"), reads);
  });
}

// ---------------------------------------------------------------------------
// Every name the planner dispatches is registered
// ---------------------------------------------------------------------------

const DISPATCH_SOURCES: [string, string][] = [
  ["planner/SKILL.md", PLANNER],
  ["planner/references/adr-tasks.md", ADR_TASKS],
  ["planner/scripts/plan-build.ts", PLAN_BUILD],
  ["lib/plan-build.ts", PLAN_BUILD_CORE],
  ["planner/scripts/review-round.sh", REVIEW_ROUND],
];

for (const [name, text] of DISPATCH_SOURCES) {
  test(`every viber:<name> of ${name} is a skill or an agent plugin.json lists, with an existing file`, () => {
    const names = viberNames(text);
    assert.ok(names.length > 0);
    assert.deepEqual(unlisted(names, PLUGIN_JSON, (entry) => fs.existsSync(path.join(VIBER, entry))), []);
  });
}

for (const name of WRITERS) {
  test(`plan-build prints a block for viber:${name}, in its core and in the header of its entry`, () => {
    assert.deepEqual([PLAN_BUILD_CORE.includes(`agent: viber:${name}`), PLAN_BUILD.includes(`viber:${name}`)], [true, true]);
  });
}

for (const name of REVIEWERS) {
  test(`review-round.sh names viber:${name} as a member it prints a block for`, () => {
    assert.ok(REVIEW_ROUND.includes(`viber:${name}`));
  });
}

test("the planner names viber:plan-fixer as the block of a fix and no other planning agent or reviewer by its dispatch name (the scripts name them on the agent: field)", () => {
  const planning = viberNames(PLANNER).filter((name) => [...WRITERS, ...REVIEWERS].includes(name));
  assert.deepEqual(planning, ["plan-fixer"]);
  assert.ok(has(section(PLANNER, "Rules"), "one `Agent` call per block a script printed, the agent named on its `agent:` field."));
});

/*
 * guard-prose.unit.test.ts - pins the agent prose that goes with the viber guards.
 *
 * `hooks/scripts/kill-guard.sh` and `shell-guard.sh` open every refusal with the
 * `viber guard:` marker, and so does the file guard, whose deny line
 * `lib/file-guard.ts` builds. The agents holding `Bash` (and the extension template)
 * say in their tools paragraph that such a refusal is a correction, the three
 * auditor agents say it in their hard rules, and the guarded rules of
 * `task-coder`, `task-reviewer` and `final-reviewer` (the cd rule among them)
 * stay one line each, their rationale living in the header of `shell-guard.sh`.
 * `task-coder` answers a file guard refusal as the refusal says, with the `WAIT:`
 * line that refusal names. A `DENIED` output carries the refusal text on a `REFUSAL:` line, which the
 * asking skills quote. The files read here are shipped prompts, whose text is
 * the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/guard-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

const MARKER = "viber guard:";
const MARKER_SENTENCE =
  "A refusal whose reason opens with `viber guard:` is no refusal either: correct the command as the reason says, then go on.";
const FALLBACK = "`No such tool available`";
const AUDITOR_RULE =
  "- A refusal whose reason opens with `viber guard:` is a correction: change the command as the reason says, then go on.";
const CODER_LINES = [
  "- One command per `Bash` call, never chained with `;`, `&&` or `||`.",
  "- Never `cd` to a path holding a glob or a variable: pass each path in full, as your prompt gives it.",
  "- Files change through `Edit` and `Write` alone, never through `Bash`.",
  "- `Bash` never runs inline or scratch interpreter code - change a file with `Edit` or `Write`, a large rewrite as one `Write` of the whole file, and run tests and project scripts by their own command.",
  "- Remove a file or directory with `git rm -r -q -- <path>`, never `rm`.",
  "- Git is read-only (`status`, `diff`, `log`, `show`), never `stash`, `checkout`, `restore` or `clean`; your only index writes are `git rm` and `git update-index --chmod=+x`.",
];
const CODER_PHRASES = [
  "never commit",
  "never branch",
  "protected file",
  "`FILES:` or `EXTRA:` line",
  "git show HEAD:<path>",
  "a copy of your file under your `out` directory",
];
const REVIEWER_CLAUSE =
  "your git is read-only (`status`, `diff`, `log`, `show`), never `stash`, `checkout`, `restore` or `clean`";
const CD_RULE = "Never `cd` to a path holding a glob or a variable: pass each path in full, as your prompt gives it.";

const TOOLS_PARAGRAPH_FILES = [
  "agents/task-coder.md",
  "agents/task-reviewer.md",
  "agents/final-reviewer.md",
  "agents/closeout.md",
  "agents/e2e-writer.md",
  "agents/memory-node-writer.md",
  "agents/memory-writer.md",
  "agents/rules-writer.md",
  "agents/test-runner.md",
  "skills/extension/templates/extension.md",
];
const AUDITORS = ["agents/mapper.md", "agents/hunter.md", "agents/critic.md"];
const REVIEWERS = ["agents/task-reviewer.md", "agents/final-reviewer.md"];
const GUARDS = ["hooks/scripts/shell-guard.sh", "hooks/scripts/kill-guard.sh", "lib/file-guard.ts"];
const FILE_GUARD_CLAUSE = "n edit refused with `viber guard: ... belongs to task` is answered as the refusal says";
const FILE_GUARD_REASON = " belongs to task ";
const FILE_GUARD_STEP = "then return VERDICT: FAIL with WAIT: ";

function read(rel: string): string {
  return fs.readFileSync(path.join(VIBER, rel), "utf8");
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function toolsParagraph(text: string): string {
  return lines(text).find((line) => line.startsWith("Only a call the harness refuses")) ?? "";
}

function markerAfterFallback(paragraph: string): boolean {
  const fallback = paragraph.indexOf(FALLBACK);
  const marker = paragraph.indexOf(MARKER_SENTENCE);
  return fallback >= 0 && marker > fallback;
}

function hardRules(text: string): string[] {
  const all = lines(text);
  const start = all.indexOf("## Hard rules");
  const rest = all.slice(start + 1);
  const next = rest.findIndex((line) => line.startsWith("## "));
  return next < 0 ? rest : rest.slice(0, next);
}

for (const rel of TOOLS_PARAGRAPH_FILES) {
  test(`${rel} tools paragraph carries the guard marker sentence after its No such tool available sentence`, () => {
    assert.ok(markerAfterFallback(toolsParagraph(read(rel))));
  });
}

for (const rel of AUDITORS) {
  test(`${rel} hard rules carry the guard correction rule`, () => {
    assert.ok(hardRules(read(rel)).includes(AUDITOR_RULE));
  });
}

for (const rel of GUARDS) {
  test(`${rel} deny text holds the marker the agent prose names`, () => {
    assert.ok(read(rel).includes(`"permissionDecisionReason":"${MARKER} `));
  });
}

test("task-coder.md answers a file guard refusal as the refusal says, in its rule on a file outside its Files", () => {
  const rule = lines(read("agents/task-coder.md")).find((line) => line.startsWith("- Touch the files in the task's `Files`")) ?? "";
  assert.ok(rule.includes(FILE_GUARD_CLAUSE));
});

test("task-coder.md reads no other task file to learn what it may not touch (the file guard answers at the edit)", () => {
  assert.ok(!read("agents/task-coder.md").includes("another task file in your `tasks` directory lists"));
});

test("lib/file-guard.ts words its refusal as task-coder.md names it and ends it on the WAIT line task-coder.md returns", () => {
  const core = read("lib/file-guard.ts");
  assert.ok(core.includes(FILE_GUARD_REASON) && core.includes(FILE_GUARD_STEP));
  assert.ok(read("agents/task-coder.md").includes("- on FAIL only: `WAIT: <repo-relative path>"));
});

test("hooks.json runs file-guard.sh through bash on Edit and Write with timeout 10, and its description names the guard", () => {
  const hooks = JSON.parse(read("hooks/hooks.json")) as { description: string; hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string; timeout: number }> }> } };
  const entry = hooks.hooks.PreToolUse.find((each) => each.matcher === "Edit|Write");
  assert.deepEqual(entry?.hooks, [{ type: "command", command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/file-guard.sh"', timeout: 10 }]);
  assert.match(hooks.description, /file-guard\.sh/);
});

test("file-guard.sh lets only a viber:task-coder call reach node, and runs file-guard.ts beside it", () => {
  const wrapper = read("hooks/scripts/file-guard.sh");
  assert.ok(wrapper.includes('\\"agent_type\\"[[:space:]]*:[[:space:]]*\\"viber:task-coder\\" ]] || exit 0'));
  assert.ok(wrapper.includes('node "${0%[/\\\\]*}/file-guard.ts"'));
});

test("file-guard.sh answers from the head of the payload and never reads a whole payload byte by byte (bash reads a pipe one byte per system call: 1.7 s for a 5 MB Write)", () => {
  const code = read("hooks/scripts/file-guard.sh")
    .split("\n")
    .filter((line) => !line.startsWith("#"));
  const reads = code.filter((line) => /(^|[ ;])read /.test(line));
  assert.deepEqual(reads, ["IFS= read -r -n 4096 -d '' input || whole=1"]);
  const text = code.join("\n");
  // A caller that is no coder and whose agent_type stands in the head leaves before the rest is read.
  assert.ok(text.indexOf('\\"agent_type\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\" ]]') < text.indexOf('input="$input$(</dev/stdin)"'));
  assert.ok(text.includes('{ printf \'%s\' "$input"; cat; } | node "${0%[/\\\\]*}/file-guard.ts" 2>/dev/null'));
});

for (const line of CODER_LINES) {
  test(`task-coder.md carries the rule line ${line.slice(0, 40)}`, () => {
    assert.ok(lines(read("agents/task-coder.md")).includes(line));
  });
}

for (const phrase of CODER_PHRASES) {
  test(`task-coder.md still holds the phrase ${phrase}`, () => {
    assert.ok(read("agents/task-coder.md").includes(phrase));
  });
}

for (const rel of REVIEWERS) {
  test(`${rel} carries the read-only git clause`, () => {
    assert.ok(read(rel).includes(REVIEWER_CLAUSE));
  });
}

for (const rel of REVIEWERS) {
  test(`${rel} carries the cd rule shell-guard.sh enforces as R6`, () => {
    assert.ok(read(rel).includes(CD_RULE));
  });
}

test("shell-guard.sh holds the rationale of the cd rule (it stays out of the agents)", () => {
  assert.ok(read("hooks/scripts/shell-guard.sh").includes("a cd whose target it cannot resolve"));
});

for (const rel of ["agents/task-coder.md", ...REVIEWERS]) {
  test(`${rel} does not hold the stash stack rationale (it lives in the shell-guard.sh header)`, () => {
    assert.ok(!read(rel).includes("stash stack"));
  });
}

const R5_WORDS = "never runs inline or scratch interpreter code - change a file with";

for (const rel of ["hooks/scripts/shell-guard.sh", "agents/task-coder.md"]) {
  test(`${rel} words the interpreter rule as the R5 reason`, () => {
    assert.ok(read(rel).includes(R5_WORDS));
  });
}

test("plan-rules-script.md Provable rule makes a Verification running inline interpreter code a finding", () => {
  const rule = lines(read("references/plan-rules-script.md")).find((line) => line.startsWith("- Provable:")) ?? "";
  assert.ok(rule.includes("A `Verification` running inline interpreter code"));
});

test("plan-rules.md Provable rule no longer states the interpreter and backtick checks", () => {
  const rule = lines(read("references/plan-rules.md")).find((line) => line.startsWith("- Provable:")) ?? "";
  assert.ok(!rule.includes("inline interpreter code") && !rule.includes("wrapped in backticks"));
});

const REASON_LINE = "REASON: <refused tool name>:";
const REFUSAL_LINE = "REFUSAL: <the refusal text, on one line>";
const DENIED_FILES = [
  ...fs.readdirSync(path.join(VIBER, "agents")).map((name: string) => `agents/${name}`),
  "skills/extension/templates/extension.md",
].filter((rel) => !path.basename(rel).startsWith("CLAUDE") && read(rel).includes(REASON_LINE));
const ASKING_SKILLS = [
  "skills/implementor/SKILL.md",
  "skills/planner/SKILL.md",
  "skills/planner/references/adr-tasks.md",
  "skills/memory/SKILL.md",
  "skills/rules/SKILL.md",
  "skills/e2e/SKILL.md",
  "skills/prototype/SKILL.md",
  "skills/talk/SKILL.md",
];

test("the DENIED output is worded in more than twenty agent files (the sweep below reads them all)", () => {
  assert.ok(DENIED_FILES.length > 20);
});

for (const rel of DENIED_FILES) {
  test(`${rel} returns the refusal text beside the refused call (a REASON alone hides why the harness refused)`, () => {
    assert.ok(read(rel).includes(REFUSAL_LINE));
  });
}

for (const rel of ASKING_SKILLS) {
  test(`${rel} puts the REFUSAL line into its question and offers a plain retry`, () => {
    const text = read(rel);
    assert.ok(text.includes("`REFUSAL:`"));
    assert.ok(!text.includes("permission added") && !text.includes("add the permission"));
  });
}

test("shell-guard.sh holds the stash stack rationale", () => {
  assert.ok(read("hooks/scripts/shell-guard.sh").includes("stash stack"));
});

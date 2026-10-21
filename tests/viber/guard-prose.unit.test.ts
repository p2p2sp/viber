/*
 * guard-prose.unit.test.ts - pins the agent prose that goes with the viber guards.
 *
 * `hooks/scripts/kill-guard.sh` and `shell-guard.sh` open every refusal with the
 * `viber guard:` marker. The agents holding `Bash` (and the extension template)
 * say in their tools paragraph that such a refusal is a correction, the three
 * auditor agents say it in their hard rules, and the guarded rules of
 * `task-coder`, `task-reviewer` and `final-reviewer` stay one line each, their
 * rationale living in the header of `shell-guard.sh`. The files read here are
 * shipped prompts, whose text is the behaviour. Nothing is spawned.
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
const GUARDS = ["hooks/scripts/shell-guard.sh", "hooks/scripts/kill-guard.sh"];

function read(rel: string): string {
  return fs.readFileSync(path.join(VIBER, rel), "utf8");
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function toolsParagraph(text: string): string {
  return lines(text).find((line) => line.startsWith("Your tools are")) ?? "";
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

test("plan-rules.md Provable rule makes a Verification running inline interpreter code a finding", () => {
  const rule = lines(read("references/plan-rules.md")).find((line) => line.startsWith("- Provable:")) ?? "";
  assert.ok(rule.includes("A `Verification` running inline interpreter code"));
});

test("shell-guard.sh holds the stash stack rationale", () => {
  assert.ok(read("hooks/scripts/shell-guard.sh").includes("stash stack"));
});

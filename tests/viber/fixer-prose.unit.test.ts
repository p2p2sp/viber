/*
 * fixer-prose.unit.test.ts - pins the three tracing checks of `fixer` (the premise two refuted
 * hypotheses share, the legitimacy of the state at the divergence, the commit that broke a
 * behaviour that used to work) and its temporary instrumentation (Law 3, the `git status` record
 * and the handoff gate comparing against it, both through `tree-record.sh`, the session
 * manifest's exception), and its `Same
 * defect elsewhere` field (the search, the field after `Blast radius`, the user's pick in step 5).
 *
 * `fixer/SKILL.md` and `hooks/content/manifest.md` are shipped prompts whose text is the
 * behaviour. Each check is one bullet of its `## Tracing checks` or `## Instrumentation` section,
 * found by its bold lead; the diagnosis payload names the introducing commit on its `Root cause`
 * line. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/fixer-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FIXER = fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/skills/fixer/SKILL.md"), "utf8");
const LINES = FIXER.split(/\r?\n/);

function bullet(lead: string): string {
  return LINES.find((l) => l.startsWith(`- **${lead}**`)) ?? "";
}

test("fixer requires the premise two hypotheses refuted by the same check share, written in one sentence and checked directly before a third hypothesis", () => {
  const rule = bullet("Shared premise");
  assert.ok(rule.includes("two hypotheses refuted by the same check"), rule);
  assert.ok(rule.includes("in one sentence"), rule);
  assert.ok(rule.includes("check it directly before a third hypothesis"), rule);
});

test("fixer places the root cause on the code breaking on a legitimate state, and on the place producing a state that should never exist, never on a guard at the symptom", () => {
  const rule = bullet("Legitimate state");
  assert.ok(rule.includes("the code breaking on it is the root cause"), rule);
  assert.ok(rule.includes("state that should never exist"), rule);
  assert.ok(rule.includes("the place producing it"), rule);
  assert.ok(rule.includes("a guard at the symptom is no fix direction"), rule);
});

test("fixer finds the commit that introduced a divergence of a behaviour that used to work through git log -L, and names it in the diagnosis", () => {
  const rule = bullet("Used to work");
  assert.ok(rule.includes("the commit that introduced the divergence"), rule);
  assert.ok(rule.includes("`git log -L`"), rule);
  const root = LINES.find((l) => l.startsWith("- **Root cause**")) ?? "";
  assert.ok(root.includes("the introducing commit"), root);
});

test("fixer allows temporary instrumentation of production code only when reading the code cannot state the actual value, each edit reverted through Edit before the handoff", () => {
  const law = LINES.find((l) => l.startsWith("**3.")) ?? "";
  assert.ok(law.includes("temporary instrumentation of production code"), law);
  assert.ok(law.includes("only when reading the code cannot state the actual value (timing, environment, persisted state)"), law);
  assert.ok(law.includes("each instrumentation edit reverted through `Edit` before the handoff"), law);
});

test("fixer records the changed paths before its first edit by running tree-record.sh --save, its recorded: paths being the record", () => {
  const rule = bullet("Record");
  assert.ok(rule.includes('`"${CLAUDE_SKILL_DIR}/scripts/tree-record.sh" --save`'), rule);
  assert.ok(rule.includes("before your first edit"), rule);
  assert.ok(rule.includes("`recorded:` paths"), rule);
});

test("fixer never instruments a file the record shows already changed", () => {
  const rule = bullet("Instrument");
  assert.ok(rule.includes("never a file already changed in the record"), rule);
});

test("the handoff gate runs tree-record.sh --check with the reproduction test path, stops naming each path: line on STOP: and invokes viber:planner on NEXT: handoff", () => {
  const start = LINES.findIndex((l) => l.startsWith("## Handoff"));
  const gate = LINES.slice(start, start + 4).join("\n");
  assert.ok(gate.includes('`"${CLAUDE_SKILL_DIR}/scripts/tree-record.sh" --check "<reproduction test path>"`'), gate);
  assert.ok(gate.includes("On `STOP:`, stop, naming each `path:`"), gate);
  assert.ok(gate.includes("leaving every recorded path untouched"), gate);
  assert.ok(gate.includes("On `NEXT: handoff`, invoke the `viber:planner` skill"), gate);
});

test("the session manifest's plan-approval exception names fixer's reproduction test and its temporary instrumentation", () => {
  const manifest = fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/hooks/content/manifest.md"), "utf8");
  const rule = manifest.split(/\r?\n/).find((l) => l.startsWith("- Write or edit no code")) ?? "";
  assert.ok(rule.includes("Exception: `viber:fixer`'s reproduction test and its temporary instrumentation."), rule);
});

function step(n: number): string {
  return LINES.find((l) => l.startsWith(`${n}. `)) ?? "";
}

test("fixer searches for the root cause's pattern beyond the reported place, and the diagnosis carries the Same defect elsewhere field right after Blast radius, none when no other place repeats it", () => {
  const search = step(4);
  assert.ok(search.includes("search the repository for each other place repeating the root cause's pattern"), search);
  const at = LINES.findIndex((l) => l.startsWith("- **Blast radius**"));
  const field = LINES[at + 1] ?? "";
  assert.ok(field.startsWith("- **Same defect elsewhere**"), field);
  assert.ok(field.includes("`<repo-relative path> | <symbol> | picked`"), field);
  assert.ok(field.includes("`<repo-relative path> | <symbol> | not picked`"), field);
  assert.ok(field.includes("`none` when no place repeats it"), field);
  assert.ok(field.includes("Only a `picked` place enters the plan."), field);
});

test("fixer asks which listed places enter the plan inside the fix-approach question when that one is asked and as its own AskUserQuestion otherwise, and writes each place's picked or not picked mark from the answer", () => {
  const ask = step(5);
  assert.ok(ask.includes("which listed `Same defect elsewhere` places enter the plan"), ask);
  assert.ok(ask.includes("inside that `AskUserQuestion` when the fix-approach one is asked, as its own `AskUserQuestion` otherwise"), ask);
  assert.ok(ask.includes("write each place's `picked` or `not picked` mark from the answer"), ask);
});

test("fixer's place question past four places offers all of them or none and takes the places a free answer names", () => {
  const ask = step(5);
  assert.ok(ask.includes("past four places it offers all of them or none and takes the places a free answer names"), ask);
});

test("fixer asks no place question when the Same defect elsewhere field reads none", () => {
  const ask = step(5);
  assert.ok(ask.includes("no place question when the field reads `none`"), ask);
});

test("fixer runs git bisect only on a tree with no uncommitted change and ends it on git bisect reset (a bisect would move files the handoff must leave untouched)", () => {
  const rule = bullet("Used to work");
  assert.ok(rule.includes("`git bisect` only on a tree with no uncommitted change"), rule);
  assert.ok(rule.includes("`git bisect reset`"), rule);
});

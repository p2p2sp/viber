/*
 * fixer-prose.unit.test.ts - pins the three tracing checks of `fixer`: the premise two refuted
 * hypotheses share, the legitimacy of the state at the divergence, and the commit that broke a
 * behaviour that used to work.
 *
 * `fixer/SKILL.md` is a shipped prompt whose text is the behaviour. Each check is one bullet of
 * its `## Tracing checks` section, found by its bold lead; the diagnosis payload names the
 * introducing commit on its `Root cause` line. Nothing is spawned.
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

test("fixer runs git bisect only on a tree with no uncommitted change and ends it on git bisect reset (a bisect would move files the handoff must leave untouched)", () => {
  const rule = bullet("Used to work");
  assert.ok(rule.includes("`git bisect` only on a tree with no uncommitted change"), rule);
  assert.ok(rule.includes("`git bisect reset`"), rule);
});

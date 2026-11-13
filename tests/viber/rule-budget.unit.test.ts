/*
 * rule-budget.unit.test.ts - holds the text each of five roles reads on a dispatch to a byte cap.
 *
 * A read set is a list of entries: a shipped file, or a shipped file with the `## ` sections read
 * from it. The five read sets (planner, planner-review, task-coder, task-reviewer, hunter) each
 * stay within 115% of their size before the test rules were rewritten as one source. A section
 * runs from its `## ` line to the next `## ` line or the end of the file, as `section()` of
 * `tests/harness/markdown.ts` cuts it. The files read here are shipped prompts, whose text is the
 * behaviour. Nothing is spawned. The measuring functions are proven on synthetic input.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/rule-budget.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { section } from "../harness/markdown.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");

type Entry = { file: string; sections?: string[] };
type ReadSet = { role: string; cap: number; entries: Entry[] };

function entryBytes(text: string, sections?: string[]): number {
  const read = sections === undefined ? text : sections.map((heading) => section(text, heading)).join("");
  return Buffer.byteLength(read, "utf8");
}

function readSetBytes(entries: Entry[], read: (file: string) => string): number {
  return entries.reduce((sum, entry) => sum + entryBytes(read(entry.file), entry.sections), 0);
}

function capFailure(role: string, bytes: number, cap: number): string | undefined {
  return bytes > cap ? `${role} reads ${bytes} bytes, over its cap of ${cap}` : undefined;
}

const TEST_STRATEGY = "viber/references/test-strategy.md";
const SYNTHESIS = "viber/skills/code-auditor/references/synthesis.md";

const READ_SETS: ReadSet[] = [
  {
    role: "planner",
    cap: 43826,
    entries: [
      { file: "viber/skills/planner/SKILL.md" },
      { file: "viber/references/plan-rules.md" },
      { file: "viber/skills/planner/templates/spec-full.md" },
      { file: "viber/skills/planner/templates/tasks.md" },
      { file: TEST_STRATEGY, sections: ["Layers", "Proves", "Ports"] },
    ],
  },
  {
    role: "planner-review",
    cap: 29475,
    entries: [
      { file: "viber/agents/planner-review.md" },
      { file: "viber/references/plan-rules.md" },
      { file: TEST_STRATEGY, sections: ["Layers", "Proves", "Ports"] },
    ],
  },
  {
    role: "task-coder",
    cap: 25975,
    entries: [
      { file: "viber/agents/task-coder.md" },
      { file: "viber/references/tdd.md" },
      { file: TEST_STRATEGY },
    ],
  },
  {
    role: "task-reviewer",
    cap: 16721,
    entries: [
      { file: "viber/agents/task-reviewer.md" },
      { file: TEST_STRATEGY, sections: ["Layers", "Proves", "Writing"] },
    ],
  },
  {
    role: "hunter",
    cap: 18463,
    entries: [
      { file: "viber/agents/hunter.md" },
      { file: "viber/skills/code-auditor/references/lenses/tests.md" },
      { file: SYNTHESIS, sections: ["Hunter report schema", "Claim sidecar schema"] },
      { file: TEST_STRATEGY, sections: ["Proves"] },
    ],
  },
];

function readFromTree(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

const SAMPLE = "intro\n## One\naaa\n## Two\nbb\n## Three\nc\n";

test("a section entry counts the bytes from each named heading to the next heading, and the last one to the end of the file", () => {
  assert.equal(entryBytes(SAMPLE, ["One", "Three"]), "## One\naaa\n".length + "## Three\nc\n".length);
});

test("a section entry leaves out the text before the first heading and every section it does not name", () => {
  assert.equal(entryBytes(SAMPLE, ["Two"]), "## Two\nbb\n".length);
});

test("an entry naming no sections counts every byte of the file, multi-byte characters by their UTF-8 size", () => {
  assert.equal(entryBytes("é\n"), 3);
});

test("a read set adds the bytes of its entries, each file read once per entry", () => {
  const files: Record<string, string> = { "a.md": "1234", "b.md": "## S\nxy\n## T\nz\n" };
  assert.equal(readSetBytes([{ file: "a.md" }, { file: "b.md", sections: ["S"] }, { file: "a.md" }], (file) => files[file]), 4 + 8 + 4);
});

test("a read set one byte over its cap is reported with the role, its bytes and its cap", () => {
  assert.equal(capFailure("hunter", 101, 100), "hunter reads 101 bytes, over its cap of 100");
});

test("a read set exactly at its cap passes", () => {
  assert.equal(capFailure("hunter", 100, 100), undefined);
});

for (const { role, cap, entries } of READ_SETS) {
  test(`the ${role} read set stays within its cap of ${cap} bytes on the tree`, () => {
    assert.equal(capFailure(role, readSetBytes(entries, readFromTree), cap), undefined);
  });
}

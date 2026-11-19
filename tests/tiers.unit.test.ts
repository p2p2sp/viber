/*
 * tiers.unit.test.ts - keeps the three test tiers in shape. A file's tier is
 * its name: `*.unit.test.ts` spawns nothing, `*.critical.test.ts` holds the
 * few cases every operating system runs on every push, and any other
 * `*.test.ts` is the logic tier, run on Linux only.
 *
 * The critical tier is what a Windows or macOS push run pays for, one spawned
 * script per case, so two things must hold or the split decays. Every logic
 * file needs a critical sibling: without one its script is never started on
 * Windows or macOS before a release. And the critical tier stays small: a
 * case added there costs every push on the slowest runner, so the number of
 * `test(` call sites is capped and the cap is raised only on purpose.
 *
 * Each rule is a pure function over a list of file names or a source text,
 * with a self-check on a synthetic bad sample, so a green run is never
 * vacuous. The files are read from the working tree, so an untracked test
 * file is checked too.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/tiers.unit.test.ts
 */

import { test } from "./harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const TESTS_ROOT = import.meta.dirname;

/** The cap on `test(` call sites across the critical tier. A loop counts
 *  once however many cases it registers, so a table in a critical file stays
 *  short. Raised only on purpose. */
const CRITICAL_BUDGET = 270;

/** Logic files with no critical sibling, each with the reason its script
 *  never runs off Linux. */
const LINUX_ONLY: Record<string, string> = {
  "github/release.test.ts": "release.sh runs only in the release workflow, on ubuntu-latest",
};

type Tier = "unit" | "critical" | "logic";

function tierOf(file: string): Tier | null {
  if (file.endsWith(".unit.test.ts")) return "unit";
  if (file.endsWith(".critical.test.ts")) return "critical";
  if (file.endsWith(".test.ts")) return "logic";
  return null;
}

/** Every logic file with neither a critical sibling nor an exemption. */
function missingCritical(files: string[], exempt: Record<string, string>): string[] {
  const present = new Set(files);
  return files.filter(
    (file) =>
      tierOf(file) === "logic" && !(file in exempt) && !present.has(file.replace(/\.test\.ts$/, ".critical.test.ts")),
  );
}

/** Every exemption naming a file that is not a logic file of the tree, or
 *  that has a critical sibling after all. */
function staleExemptions(files: string[], exempt: Record<string, string>): string[] {
  const present = new Set(files);
  return Object.keys(exempt).filter(
    (file) => !present.has(file) || tierOf(file) !== "logic" || present.has(file.replace(/\.test\.ts$/, ".critical.test.ts")),
  );
}

/** The `test(` call sites of one source text: a call opening a line, at any
 *  indentation, so a case inside a loop or a block counts once. */
function caseSites(source: string): number {
  return (source.match(/^[ \t]*test\(/gm) ?? []).length;
}

function testFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...testFiles(path.join(dir, entry.name), rel));
    else if (tierOf(entry.name) !== null) out.push(rel);
  }
  return out.sort();
}

const FILES = testFiles(TESTS_ROOT);

function read(file: string): string {
  return fs.readFileSync(path.join(TESTS_ROOT, file), "utf-8");
}

test("self-check: a logic file with no critical sibling is reported, one with a sibling or an exemption is not", () => {
  const files = ["viber/a.test.ts", "viber/a.critical.test.ts", "viber/b.test.ts", "viber/c.unit.test.ts", "github/r.test.ts"];
  assert.deepEqual(missingCritical(files, { "github/r.test.ts": "linux only" }), ["viber/b.test.ts"]);
});

test("self-check: an exemption for a missing file, a non-logic file or a file that has a sibling is reported stale", () => {
  const files = ["viber/a.test.ts", "viber/a.critical.test.ts", "viber/c.unit.test.ts", "github/r.test.ts"];
  assert.deepEqual(
    staleExemptions(files, {
      "github/r.test.ts": "kept",
      "viber/gone.test.ts": "no such file",
      "viber/c.unit.test.ts": "not a logic file",
      "viber/a.test.ts": "has a sibling",
    }),
    ["viber/gone.test.ts", "viber/c.unit.test.ts", "viber/a.test.ts"],
  );
});

test("self-check: a case site is a test( call opening a line, indented or not, and a mention inside a line is none", () => {
  const source = ['test("one", () => {});', "for (const x of xs) {", '  test(`two ${x}`, () => {});', "}", '// see test("three")', "const t = retest(1);"].join("\n");
  assert.equal(caseSites(source), 2);
});

test("every logic file has a critical sibling, so its script is started on every operating system", () => {
  assert.deepEqual(missingCritical(FILES, LINUX_ONLY), []);
});

test("every Linux-only exemption still names a logic file with no critical sibling", () => {
  assert.deepEqual(staleExemptions(FILES, LINUX_ONLY), []);
});

test("every critical file registers at least one case", () => {
  const empty = FILES.filter((file) => tierOf(file) === "critical" && caseSites(read(file)) === 0 && !/\breaderContract\(/.test(read(file)));
  assert.deepEqual(empty, []);
});

test(`the critical tier holds at most ${CRITICAL_BUDGET} case sites (every one runs on the slowest runner on every push)`, () => {
  const total = FILES.filter((file) => tierOf(file) === "critical").reduce((sum, file) => sum + caseSites(read(file)), 0);
  assert.ok(total <= CRITICAL_BUDGET, `${total} case sites in the critical tier, the budget is ${CRITICAL_BUDGET}`);
});

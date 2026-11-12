/*
 * lenses.unit.test.ts - holds every audit lens file present in
 * viber/skills/code-auditor/references/lenses/ to the lens file shape the
 * code-auditor skill and its agents read: exactly the headings `## Hunts`,
 * `## Excluded`, `## Verify`, `## Severity` in that order, 3 to 7
 * `### <angle>` entries under `## Hunts`, no ```bash block, a
 * `Worktree: required` or `Worktree: none` line under `## Verify`, and at most
 * 9000 bytes. Beside each lens `<lens>.md` sits its `<lens>.signals.md`, read
 * by the mapper alone, holding at least one ```bash block, every `<scope>`
 * single-quoted and no `\b` word boundary.
 *
 * The `tests` lens, its signals file, the code-auditor README and SKILL.md are
 * product text (prompts and guides), so the wasteful-tests cases below assert
 * the wording they carry.
 *
 * Every rule lives in the pure functions `lensProblems` and `signalsProblems`,
 * proven to fire on a synthetic bad file before it is trusted on the real
 * files, so a green run is never vacuous. One case per lens file carries the
 * file name, so `--test-name-pattern "bugs\.md"` selects that lens alone.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/lenses.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const LENSES = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/references/lenses");
const HEADINGS = ["## Hunts", "## Excluded", "## Verify", "## Severity"];
const MAX_BYTES = 9000;
const MAX_ANGLES = 7;
const SIGNALS_SUFFIX = ".signals.md";

type Rule = "headings" | "angles" | "bash" | "worktree" | "size";

interface Problem {
  rule: Rule;
  detail: string;
}

interface Parsed {
  headings: string[];
  lines: Map<string, string[]>;
  bashSections: string[];
}

/** Splits a lens text into its `## ` sections, ignoring headings inside fences,
 *  and records the section each ```bash block sits in. */
function parse(text: string): Parsed {
  const headings: string[] = [];
  const lines = new Map<string, string[]>();
  const bashSections: string[] = [];
  let section = "";
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("```")) {
      if (!fenced && line.trim() === "```bash") bashSections.push(section);
      fenced = !fenced;
      continue;
    }
    if (!fenced && line.startsWith("## ")) {
      section = line.trimEnd();
      headings.push(section);
      continue;
    }
    if (!fenced) lines.set(section, [...(lines.get(section) ?? []), line]);
  }
  return { headings, lines, bashSections };
}

function lensProblems(text: string): Problem[] {
  const parsed = parse(text);
  const problems: Problem[] = [];
  if (parsed.headings.join("\n") !== HEADINGS.join("\n")) {
    problems.push({ rule: "headings", detail: `found ${JSON.stringify(parsed.headings)}` });
  }
  const angles = (parsed.lines.get("## Hunts") ?? []).filter((line) => line.startsWith("### ")).length;
  if (angles < 3 || angles > MAX_ANGLES) problems.push({ rule: "angles", detail: `found ${angles} angles, want 3 to ${MAX_ANGLES}` });
  if (parsed.bashSections.length > 0) {
    problems.push({ rule: "bash", detail: `bash block under ${JSON.stringify(parsed.bashSections)}` });
  }
  if (!(parsed.lines.get("## Verify") ?? []).some((line) => /^Worktree: (required|none)$/.test(line.trimEnd()))) {
    problems.push({ rule: "worktree", detail: "no `Worktree: required | none` line under ## Verify" });
  }
  const bytes = Buffer.byteLength(text, "utf-8");
  if (bytes > MAX_BYTES) problems.push({ rule: "size", detail: `${bytes} bytes, want at most ${MAX_BYTES}` });
  return problems;
}

/** A signals file is the mapper's command list: at least one ```bash block,
 *  every `<scope>` single-quoted, so a directory holding a space stays one
 *  pathspec, and no `\b`, which `git grep -E` honours only on some builds. */
function signalsProblems(text: string): string[] {
  const problems = parse(text).bashSections.length > 0 ? [] : ["no bash block"];
  if (/(^|[^'])<scope>/m.test(text)) problems.push("unquoted <scope>");
  if (text.includes("\\b")) problems.push("word boundary \\b");
  return problems;
}

function rulesBroken(text: string): Rule[] {
  return lensProblems(text).map((problem) => problem.rule);
}

const hunts = (count: number) =>
  `## Hunts\n${Array.from({ length: count }, (_, i) => `### angle-${i + 1}\nWhat makes it a finding.\n`).join("\n")}`;
const EXCLUDED = "## Excluded\n- Style.\n";
const EXCLUDED_WITH_BASH = "## Excluded\n- Style.\n```bash\nls <scope>\n```\n";
const VERIFY = "## Verify\nWorktree: required\nRun the reproduction.\n";
const VERIFY_NO_WORKTREE = "## Verify\nRun the reproduction.\n";
const SEVERITY = "## Severity\n- 1-10: anything.\n";

const lens = (...sections: string[]) => ["# Sample lens\nAudits a sample; the other lens owns the rest.\n", ...sections].join("\n");

/** Pads a lens text with trailing letters to exactly `bytes` bytes. */
const padTo = (text: string, bytes: number) => text + "a".repeat(bytes - Buffer.byteLength(text, "utf-8"));

const BAD: { name: string; text: string; rule: Rule }[] = [
  { name: "a lens missing the ## Excluded heading", text: lens(hunts(3), VERIFY, SEVERITY), rule: "headings" },
  { name: "a lens holding ## Verify before ## Excluded", text: lens(hunts(3), VERIFY, EXCLUDED, SEVERITY), rule: "headings" },
  { name: "a lens still holding a ## Map signals section", text: lens(hunts(3), "## Map signals\nRank units by hits.\n", EXCLUDED, VERIFY, SEVERITY), rule: "headings" },
  { name: "a lens carrying 2 angles", text: lens(hunts(2), EXCLUDED, VERIFY, SEVERITY), rule: "angles" },
  { name: "a lens carrying 8 angles", text: lens(hunts(8), EXCLUDED, VERIFY, SEVERITY), rule: "angles" },
  { name: "a lens lacking the Worktree line", text: lens(hunts(3), EXCLUDED, VERIFY_NO_WORKTREE, SEVERITY), rule: "worktree" },
  { name: "a lens holding a bash block", text: lens(hunts(3), EXCLUDED_WITH_BASH, VERIFY, SEVERITY), rule: "bash" },
  { name: "a lens over 9000 bytes", text: `${lens(hunts(3), EXCLUDED, VERIFY, SEVERITY)}\n${"a".repeat(MAX_BYTES)}\n`, rule: "size" },
  { name: "a lens of exactly 9001 bytes", text: padTo(lens(hunts(3), EXCLUDED, VERIFY, SEVERITY), MAX_BYTES + 1), rule: "size" },
];

for (const bad of BAD) {
  test(`${bad.name} breaks the ${bad.rule} rule and no other (a rule that never fires makes every lens check vacuous)`, () => {
    assert.deepEqual(rulesBroken(bad.text), [bad.rule]);
  });
}

test("a lens of 7 angles passes the lens shape (the wasteful-tests angle is the seventh)", () => {
  assert.deepEqual(rulesBroken(lens(hunts(7), EXCLUDED, VERIFY, SEVERITY)), []);
});

test("a lens of exactly 9000 bytes passes the lens shape (the limit is inclusive)", () => {
  assert.deepEqual(rulesBroken(padTo(lens(hunts(3), EXCLUDED, VERIFY, SEVERITY), MAX_BYTES)), []);
});

test("a signals file holding prose and no bash block is flagged (a rule that never fires makes the signals check vacuous)", () => {
  assert.deepEqual(signalsProblems("# Sample lens map signals\nRank units by hits.\n"), ["no bash block"]);
});

test("a signals file holding a bare -- <scope> is flagged (a directory holding a space splits into two pathspecs)", () => {
  assert.deepEqual(signalsProblems("# Sample lens map signals\nHits:\n```bash\ngit log -- <scope>\n```\n"), ["unquoted <scope>"]);
});

test("a signals file holding a \\b word boundary is flagged (git grep -E on macOS does not promise \\b, so the pattern silently matches nothing)", () => {
  assert.deepEqual(signalsProblems("# Sample lens map signals\nHits:\n```bash\ngit grep -n -E '\\bfor\\b' -- '<scope>'\n```\n"), ["word boundary \\b"]);
});

test("a signals file holding a bash block passes", () => {
  assert.deepEqual(signalsProblems("# Sample lens map signals\nHits:\n```bash\ngit log -- '<scope>'\n```\n"), []);
});

const ALL_FILES = fs.readdirSync(LENSES).filter((name) => name.endsWith(".md")).sort();
const LENS_FILES = ALL_FILES.filter((name) => !name.endsWith(SIGNALS_SUFFIX));

for (const file of LENS_FILES) {
  test(`the lens file ${file} holds the lens shape: four headings in order, 3 to 7 angles, no bash block, a Worktree line, at most 9000 bytes`, () => {
    assert.deepEqual(lensProblems(fs.readFileSync(path.join(LENSES, file), "utf-8")), []);
  });

  const signals = file.replace(/\.md$/, SIGNALS_SUFFIX);
  test(`the lens file ${file} has its signals file ${signals} holding at least one bash block, every <scope> single-quoted and no \\b`, () => {
    const target = path.join(LENSES, signals);
    assert.ok(fs.existsSync(target), `${signals} is missing`);
    assert.deepEqual(signalsProblems(fs.readFileSync(target, "utf-8")), []);
  });
}

const AUDITOR = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor");
const TESTS_LENS = fs.readFileSync(path.join(LENSES, "tests.md"), "utf-8");
const TESTS_SIGNALS = fs.readFileSync(path.join(LENSES, "tests.signals.md"), "utf-8");
const README = fs.readFileSync(path.join(AUDITOR, "README.md"), "utf-8");
const SKILL = fs.readFileSync(path.join(AUDITOR, "SKILL.md"), "utf-8");

const sectionOf = (text: string, heading: string) => (parse(text).lines.get(heading) ?? []).join("\n");
const readmeSection = (name: string) => README.split(/^## /m).find((part) => part.startsWith(`${name}\n`)) ?? "";
const lineOf = (text: string, prefix: string) => text.split(/\r?\n/).find((line) => line.startsWith(prefix)) ?? "";
const anglesOf = (text: string) =>
  (parse(text).lines.get("## Hunts") ?? []).filter((line) => line.startsWith("### ")).map((line) => line.slice(4).trim());

test("the tests lens names cost in its opening sentence and holds wasteful-tests as its seventh angle", () => {
  assert.ok(TESTS_LENS.split(/\r?\n/)[1].includes("and tests that are skipped or never run; and whether they cost more than they prove."));
  assert.equal(anglesOf(TESTS_LENS)[6], "wasteful-tests");
});

test("the wasteful-tests angle names the redundant, trivial and misplaced classes", () => {
  const hunts = sectionOf(TESTS_LENS, "## Hunts");
  const body = hunts.split("### wasteful-tests\n")[1] ?? "";
  assert.ok(body.startsWith("Redundant: two tests failing on exactly the same regressions, or variants of one input outside a parameterised form. Trivial: assertions only on a name, a field's presence, a data shape, an accessor or a constant. Misplaced: a decision only an integration test asserts, though a unit test could reach it."));
});

test("the tests lens excludes by the three C9 bullets: a trivial getter, test style and a higher-layer gap unless filed as misplaced", () => {
  const excluded = sectionOf(TESTS_LENS, "## Excluded");
  assert.ok(excluded.includes("- A missing test for a trivial getter, setter, DTO or constant."));
  assert.ok(excluded.includes("- Test style, structure, naming, repeated set-up code and readability."));
  assert.ok(excluded.includes("- A gap already closed by a test at a higher layer, unless filed as misplaced: the mutant is killed there."));
});

test("the tests lens verify section carries the oracle sentence naming the waste procedure", () => {
  assert.ok(sectionOf(TESTS_LENS, "## Verify").includes("The oracle is a surviving mutant for a coverage or assertion finding, a reproduced failure for a flakiness finding, the dead-test procedure for a dead-test finding and the waste procedure for a `wasteful-tests` finding."));
});

test("the waste procedure runs its misplaced step on the fast tier alone and never the integration test", () => {
  const verify = sectionOf(TESTS_LENS, "## Verify");
  const procedure = verify.split("Waste procedure:\n")[1] ?? "";
  assert.ok(procedure.startsWith("1. Redundant: run the mutants of mutation step 3 with the cited test removed; every mutant it kills is still killed, VERIFIED; one survives, REFUTED.\n2. Trivial: apply a change keeping the observed behaviour (a rename, a reorder); the cited test fails and alone kills no behaviour mutant, VERIFIED; else REFUTED.\n3. Misplaced: an integration test asserts the decision; mutate it and run the fast tier alone, never the integration test; the mutant survives, VERIFIED; a unit or component test kills it, REFUTED."));
  assert.ok(verify.indexOf("Dead-test procedure:") < verify.indexOf("Waste procedure:"));
});

test("the tests lens scores a wasteful-tests finding by the tests' cost", () => {
  const severity = sectionOf(TESTS_LENS, "## Severity");
  assert.ok(severity.includes("A `wasteful-tests` finding scores by the tests' cost."));
  assert.ok(lineOf(severity, "- 4-6:").endsWith("; a core decision proven only in the integration layer, or redundant integration tests."));
  assert.ok(lineOf(severity, "- 1-3:").endsWith("Redundant or trivial tests in the fast tier."));
});

test("the tests signals file closes on the duplication and misplaced-layer commands, each after its lead-in line and with a single-quoted scope", () => {
  assert.ok(TESTS_SIGNALS.includes("mock-heavy, wasteful"));
  assert.ok(TESTS_SIGNALS.includes(String.raw`Test declarations per test file; far more tests than the source has branches is a duplication lead:
${"```"}bash
git -c core.quotePath=false grep -c -E '^[[:space:]]*(it|test)[(]|^[[:space:]]*def test_|^func Test|@Test|\[(Fact|Theory|Test|TestMethod)\]|#\[test\]' -- '<scope>' | sort -t: -k2 -nr | head -30
${"```"}`));
  assert.ok(TESTS_SIGNALS.includes(String.raw`Integration test files per directory, told by path alone; a directory rich in them is a misplaced-layer lead:
${"```"}bash
git -c core.quotePath=false ls-files -- '<scope>' | grep -E '(^|/)(tests?|__tests__|specs?|e2e|cypress)/|[._-](test|spec|cy)[.]|(^|/)test_|(Test|Tests|Spec)[.][A-Za-z]+$' | grep -i -E '(^|/)(integration|integ)[^/]*/|[._-](integration|integ|it)[._-]|integration(tests?|spec)?[.]|[.]integrationtests/' | sed 's|/[^/]*$||' | sort | uniq -c | sort -nr | head -30
${"```"}`));
  assert.ok(TESTS_SIGNALS.trimEnd().endsWith("head -30\n```"));
});

const LENS_ANGLES = LENS_FILES.flatMap((file) =>
  anglesOf(fs.readFileSync(path.join(LENSES, file), "utf-8")).map((angle) => ({ file, angle })),
);

for (const { file, angle } of LENS_ANGLES) {
  test(`the code-auditor README lists the angle ${angle} of ${file} by its slug`, () => {
    assert.ok(README.includes(`- \`${angle}\`:`), `${angle} missing from the README angle lists`);
  });
}

test("the README tests section names wasteful tests on its Audits line and the waste procedure on its Verified by line", () => {
  const section = readmeSection("tests");
  assert.ok(lineOf(section, "Audits:").includes("wasteful tests"));
  assert.ok(lineOf(section, "Verified by:").includes("waste procedure"));
});

test("the code-auditor SKILL tests line names wasteful tests", () => {
  assert.ok(lineOf(SKILL.replace(/^ +/gm, ""), "5. `tests`:").includes("wasteful tests"));
});

test("every signals file belongs to a lens file (an orphan signals file is never read)", () => {
  const orphans = ALL_FILES.filter((name) => name.endsWith(SIGNALS_SUFFIX)).filter(
    (name) => !LENS_FILES.includes(name.slice(0, -SIGNALS_SUFFIX.length) + ".md"),
  );
  assert.deepEqual(orphans, []);
});

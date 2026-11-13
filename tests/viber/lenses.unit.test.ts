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
 * The `tests` and `design` lenses, their signals files, the code-auditor README
 * and SKILL.md are product text (prompts and guides), so the wasteful-tests and
 * untestable-decisions cases below assert the wording they carry.
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
const HUNTER = fs.readFileSync(path.resolve(import.meta.dirname, "../../viber/agents/hunter.md"), "utf-8");

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
  assert.ok(body.startsWith("Redundant: two tests failing on exactly the same regressions, or variants of one input outside a parameterised form. Trivial: "));
  assert.ok(body.includes("Misplaced: a decision only an integration test asserts, though a unit or component test could reach it"));
});

test("the wasteful-tests Trivial class covers what Public, Source and Earned rule out", () => {
  const trivial = (sectionOf(TESTS_LENS, "## Hunts").split("### wasteful-tests\n")[1] ?? "").split("Trivial: ")[1] ?? "";
  assert.ok(trivial.startsWith("what Public, Source or Earned rule out."));
});

test("the wasteful-tests Misplaced class makes a suite whose integration tests exceed about a tenth of its tests a candidate, counted by the host's layer marker", () => {
  const body = sectionOf(TESTS_LENS, "## Hunts").split("### wasteful-tests\n")[1] ?? "";
  assert.ok(body.includes("a suite whose integration tests, counted by the host's layer marker, exceed about a tenth of its tests is a candidate as a whole"));
});

test("the over-mocking angle covers a double for a module of the code's own and a test asserting only interactions, a finding naming Boundary or State", () => {
  const body = sectionOf(TESTS_LENS, "## Hunts").split("### over-mocking\n")[1]?.split("### untested-error-paths")[0] ?? "";
  assert.ok(body.includes("a double for a module of the code's own (Boundary)"));
  assert.ok(body.includes("a test asserting only interactions or repeating the implementation's call sequence (State)"));
  assert.ok(body.includes("A finding names the rule and the behaviour change that would pass."));
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

const DESIGN_LENS = fs.readFileSync(path.join(LENSES, "design.md"), "utf-8");
const DESIGN_SIGNALS = fs.readFileSync(path.join(LENSES, "design.signals.md"), "utf-8");

test("the design lens names decisions no fast test can reach in its opening sentence and holds untestable-decisions as its seventh angle", () => {
  assert.ok(DESIGN_LENS.split(/\r?\n/)[1].includes("dependencies pointing the wrong way, decisions no fast test can reach, dead or drifted code"));
  assert.equal(anglesOf(DESIGN_LENS)[6], "untestable-decisions");
});

test("the untestable-decisions angle names the decision, the dependency it sits in with no port between and the port whose fake would let a component test reach it", () => {
  const body = sectionOf(DESIGN_LENS, "## Hunts").split("### untestable-decisions\n")[1] ?? "";
  assert.ok(body.startsWith("A decision (a branch, a rule, a calculation, a validation) written inside code that reaches a database, queue, broker or network with no port between them, so a test reaches it only through the real dependency or a chain of doubles. Name the decision and the port whose fake would let a component test reach it."));
});

test("gate 7 of the design lens passes an untestable-decisions claim through gates 3 and 4, naming the port in gate 3 and the tests that assert the decision in gate 4", () => {
  const gate = lineOf(sectionOf(DESIGN_LENS, "## Verify"), "7. ");
  assert.ok(gate.endsWith("An untestable-decisions claim passes 3 by a change to the decision and the port whose fake would let a component test reach it, and 4 by its tests: only integration tests assert it, its fast test builds 3 or more doubles, or none asserts it."));
});

test("the design lens scores an untestable decision on its 3-4 line, naming the port", () => {
  const line = lineOf(sectionOf(DESIGN_LENS, "## Severity"), "- 3-4:");
  assert.ok(line.endsWith("A decision reachable only through the real dependency or 3 or more doubles, with the port whose fake would reach it named."));
});

test("the design lens and the README name no function over plain values for a decision", () => {
  assert.ok(!DESIGN_LENS.includes("function over plain values"));
  assert.ok(!README.includes("function over plain values"));
});

test("the tests lens closes its exclusions by handing a decision no fast test can reach to the design lens", () => {
  const excluded = sectionOf(TESTS_LENS, "## Excluded").trimEnd();
  assert.ok(excluded.endsWith("\n- A decision no fast test can reach as written: the design lens."));
});

test("the design signals file closes on the mock-density command after its lead-in line, with a single-quoted scope", () => {
  assert.ok(DESIGN_SIGNALS.includes(String.raw`Mock density per test file; the source a mock-heavy test covers is an untestable-decisions lead:
${"```"}bash
git -c core.quotePath=false grep -c -E 'jest[.]mock|vi[.]mock|mock[.]patch|@patch[(]|MagicMock|mocker[.]|Mockito|sinon[.]|toHaveBeenCalled|gomock|[.]On[(]|new Mock<|Substitute[.]For|mockk|every [{]|instance_double|allow[(]|createMock[(]|page[.]route|cy[.]intercept' -- '<scope>' | sort -t: -k2 -nr | head -30
${"```"}`));
  assert.ok(DESIGN_SIGNALS.trimEnd().endsWith("head -30\n```"));
});

test("the README design section lists untestable-decisions and the ownership table hands a decision no fast test can reach from tests to design under it", () => {
  assert.ok(readmeSection("design").includes("- `untestable-decisions`:"));
  assert.ok(README.includes("| decision no fast test can reach | tests | design | `untestable-decisions` |"));
  assert.ok(lineOf(readmeSection("design"), "Audits:").includes("decisions no fast test can reach"));
});

test("the README describes the three angles as the lenses do: the module double and interactions of over-mocking, the Public, Source and Earned rules of trivial tests with the integration share, and the port of untestable-decisions", () => {
  const tests = readmeSection("tests");
  assert.ok(lineOf(tests, "- `over-mocking`:").includes("a double for a module of the code's own, or a test asserting only interactions"));
  assert.ok(lineOf(tests, "- `wasteful-tests`:").includes("trivial tests (what Public, Source or Earned rule out)"));
  assert.ok(lineOf(tests, "- `wasteful-tests`:").includes("a suite whose integration tests exceed about a tenth of its tests"));
  assert.ok(lineOf(readmeSection("design"), "- `untestable-decisions`:").includes("the port whose fake would let a component test reach it"));
});

test("every hunter brief of the code-auditor SKILL carries the Test rules line, and the hunter agent reads its ## Proves by range before hunting on the tests lens and before writing a test as proof", () => {
  const brief = lineOf(SKILL, "Every `viber:hunter` brief:");
  assert.ok(brief.includes("`Schema: ${CLAUDE_SKILL_DIR}/references/synthesis.md`, `Test rules: ${CLAUDE_PLUGIN_ROOT}/references/test-strategy.md`, `Hunt: <hunt id>`"));
  const input = lineOf(HUNTER, "- `Test rules: <path>`");
  assert.ok(input.includes("`## Proves`"));
  assert.ok(input.includes("by range"));
  assert.ok(input.includes("before hunting on the tests lens and before writing a test as proof on any lens"));
});

test("the hunter agent holds a test it writes as proof to the ## Proves section", () => {
  assert.ok(lineOf(HUNTER, "- A test you write as proof holds the `## Proves` section of the `Test rules:` file").length > 0);
});

test("the code-auditor SKILL design line names untestable decisions", () => {
  assert.ok(lineOf(SKILL.replace(/^ +/gm, ""), "6. `design`:").includes("untestable decisions"));
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

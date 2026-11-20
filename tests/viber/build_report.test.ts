/*
 * build_report.test.ts - the file-writing half of idea-validator's report builder
 * CLI: unparsable input and invalid data exit 1 and write nothing, valid data
 * exits 0 and writes the filled template with LF line endings; `--prompts
 * research`, `council-r1` and `council-r2` over the real reference texts and `--prompts
 * research` over a copied script beside a stub references/ directory. Integration tier (each case builds a temp-dir
 * fixture); it calls `main` in-process, the `--prompts` cases run the script.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is
 * run directly by Node's native test runner + TypeScript type stripping:
 *   CI=true node --test tests/viber/build_report.test.ts
 */

import { test } from "../harness/test.ts";
import { withTempDir } from "../harness/tmp.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { buildPrompts, main } from "../../viber/skills/idea-validator/scripts/build_report.mjs";
import { SUT, capture, validReport } from "./build_report-fixture.ts";

const REFERENCES = path.resolve(import.meta.dirname, "../../viber/skills/idea-validator/references");

test("unparsable input exits 1 with a 'Cannot parse' line and writes no report", async () => {
  await withTempDir("idea-validator-", (dir) => {
    const src = path.join(dir, "report-data.json");
    const dest = path.join(dir, "report.html");
    fs.writeFileSync(src, "{not json", "utf-8");
    const out = capture();
    assert.equal(main([src, dest], out.log), 1);
    assert.match(out.lines[0], /^Cannot parse /);
    assert.ok(!fs.existsSync(dest));
  });
});

test("invalid data exits 1, prints the problem count and one line per problem, and writes no report (the skill fixes the JSON, never the HTML)", async () => {
  await withTempDir("idea-validator-", (dir) => {
    const d = validReport();
    d.thresholds = {};
    const src = path.join(dir, "report-data.json");
    const dest = path.join(dir, "report.html");
    fs.writeFileSync(src, JSON.stringify(d), "utf-8");
    const out = capture();
    assert.equal(main([src, dest], out.log), 1);
    assert.match(out.lines[0], /^3 problem\(s\) in /);
    assert.equal(out.lines.length, 4);
    assert.ok(!fs.existsSync(dest));
  });
});

test("a fact text holding a comment marker and a script tag builds OK and its report-data element holds no '<' and parses back to the input (a live '<!--' or '<script' would swallow the rest of the page)", async () => {
  await withTempDir("idea-validator-", (dir) => {
    const d = validReport();
    d.research.problem.facts = [{ text: "Users paste <!-- comment markers and a <script src=x> embed snippet" }];
    const src = path.join(dir, "report-data.json");
    const dest = path.join(dir, "report.html");
    fs.writeFileSync(src, JSON.stringify(d), "utf-8");
    const out = capture();
    assert.equal(main([src, dest], out.log), 0);
    assert.match(out.lines[0], /^OK /);
    const html = fs.readFileSync(dest, "utf-8");
    const open = html.indexOf('<script id="report-data" type="application/json">');
    const start = html.indexOf(">", open) + 1;
    const payload = html.slice(start, html.indexOf("</script>", start));
    assert.ok(!payload.includes("<"), payload);
    assert.equal(JSON.parse(payload).research.problem.facts[0].text, d.research.problem.facts[0].text);
  });
});

const REAL_REFS = {
  process: fs.readFileSync(path.join(REFERENCES, "process.md"), "utf-8"),
  dimensions: fs.readFileSync(path.join(REFERENCES, "dimensions.md"), "utf-8"),
};
const RULES_AND_PATHS = String.raw`## Research rules[\s\S]*## Open questions / no data found\n  \`\`\`[\s\S]*Never reproduce long passages[^\n]*\n\nRead these files:\n- [^\n]*01-normalized\.md\n- [^\n]*02-hypotheses\.md\n\nWrite your output to [^\n]*`;

const REAL_PROMPTS: Array<[string, RegExp, RegExp]> = [
  ["problem",
    new RegExp(String.raw`^### Problem research brief[\s\S]*evidence for and against\.\n\n\*\*Problem strength\*\*\n- 1: [^\n]*\n[\s\S]*- 5: people hack[^\n]*\n\n${RULES_AND_PATHS}03-research-problem\.md\.\n$`),
    /### Market research brief|### Competition research brief/],
  ["market",
    new RegExp(String.raw`^### Market research brief[\s\S]*Timing: what changed recently[^\n]*\n\n${RULES_AND_PATHS}04-research-market\.md\.\n$`),
    /\*\*Problem strength\*\*|### Problem research brief|### Competition research brief/],
  ["competition",
    new RegExp(String.raw`^### Competition research brief[\s\S]*Threat from incumbents[^\n]*\n\n${RULES_AND_PATHS}05-research-competition\.md\.\n$`),
    /\*\*Problem strength\*\*|### Problem research brief|### Market research brief/],
];

for (const [name, expected, forbidden] of REAL_PROMPTS) {
  test(`buildPrompts over the real reference texts makes the ${name} prompt its brief, the research rules, the two input paths and its output path in that order, holding no other brief`, () => {
    const found = buildPrompts("research", path.resolve("wd"), "en", REAL_REFS).find((f: any) => f.name === name);
    assert.match(found!.text, expected);
    assert.doesNotMatch(found!.text, forbidden);
  });
}

test("--prompts research on a missing working directory exits 1 naming it and writes nothing", async () => {
  await withTempDir("idea-validator-", async (dir) => {
    const result = await runScript(SUT, ["--prompts", "research", "absent"], { cwd: dir });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /absent/);
    assert.ok(!fs.existsSync(path.join(dir, "absent")));
  });
});

const MEMBER_NAMES = ["customer", "skeptic", "analyst", "growth", "operator", "risk", "visionary"];
const MEMBER_FILES = MEMBER_NAMES.map((name, i) => [name, fs.readFileSync(path.join(REFERENCES, "council", `0${i + 1}-${name}.md`), "utf-8")]);
const REAL_COUNCIL_REFS = { ...REAL_REFS, council: fs.readFileSync(path.join(REFERENCES, "council.md"), "utf-8"), members: Object.fromEntries(MEMBER_FILES) };
const R1_FORMAT_AND_ISOLATION = String.raw`Write your output to [^\n]*10-council-r1[\\/]visionary\.md\.\n\n\`\`\`\n# <Member name> - round 1\n## Position\n[\s\S]*## <Each extra section your member file asks for, under the name it gives>\n\`\`\`\n\nDo not look for or read any file under 10-council-r1/ or 11-council-r2/\.\n$`;

test("buildPrompts over the real reference texts makes the visionary council-r1 prompt its member file, the language line, the nine inputs, its output path, the whole round-1 format and the isolation line", () => {
  const found = buildPrompts("council-r1", path.resolve("wd"), "Polish", REAL_COUNCIL_REFS).find((f: any) => f.name === "visionary");
  assert.match(found!.text, new RegExp(String.raw`^# Council member: [^\n]*[\s\S]*\n\nWrite in Polish\.\n\nRead these files:\n- [^\n]*01-normalized\.md\n- [^\n]*02-hypotheses\.md\n[\s\S]*- [^\n]*09-autopilot-fit\.md\n\nRead all of them before answering and cite the file, and the URL inside it, for every fact you use\.\n\n${R1_FORMAT_AND_ISOLATION}`));
});

test("--prompts council-r1 writes the seven prompt files under prompts/ and prints one PROMPT line each with an absolute path", async () => {
  await withTempDir("idea-validator-", async (dir) => {
    fs.mkdirSync(path.join(dir, "wd"));
    const real = fs.realpathSync(dir);
    const result = await runScript(SUT, ["--prompts", "council-r1", "wd", "Polish"], { cwd: dir });
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout.trim().split(/\r?\n/), MEMBER_NAMES.map((name) => `PROMPT: ${name} | ${path.join(real, "wd", "prompts", `council-r1-${name}.md`)}`));
    const risk = fs.readFileSync(path.join(dir, "wd", "prompts", "council-r1-risk.md"), "utf-8");
    assert.ok(risk.includes("Write in Polish.\n"));
    assert.ok(risk.includes(`Write your output to ${path.join(real, "wd", "10-council-r1", "risk.md")}.`));
    assert.equal(fs.readdirSync(path.join(dir, "wd", "prompts")).length, 7);
  });
});

const R2_FORMAT_AND_RESPOND = String.raw`Write your output to [^\n]*11-council-r2[\\/]visionary\.md\.\n\n\`\`\`\n# <Member name> - round 2\n## Responses to other members\n[\s\S]*## Unresolved disagreement I want recorded\n\`\`\`\n\nRespond to specific arguments by name, never restate round 1, and change position whenever an argument convinces you\.\n$`;

test("buildPrompts over the real reference texts makes the visionary council-r2 prompt its member file, its own round-1 path, the six others, the language line, its output path, the whole round-2 format and the respond-by-name line", () => {
  const found = buildPrompts("council-r2", path.resolve("wd"), "Polish", REAL_COUNCIL_REFS).find((f: any) => f.name === "visionary");
  assert.match(found!.text, new RegExp(String.raw`^# Council member: [^\n]*[\s\S]*\n\nYour round-1 file: [^\n]*10-council-r1[\\/]visionary\.md\n\nThe other members' round-1 files:\n- [^\n]*10-council-r1[\\/]customer\.md\n[\s\S]*- [^\n]*10-council-r1[\\/]risk\.md\n\nWrite in Polish\.\n\n${R2_FORMAT_AND_RESPOND}`));
  assert.doesNotMatch(found!.text, /10-council-r1[\\/]visionary\.md\n- /);
});

test("--prompts council-r2 writes the seven prompt files under prompts/ and prints one PROMPT line each with an absolute path", async () => {
  await withTempDir("idea-validator-", async (dir) => {
    fs.mkdirSync(path.join(dir, "wd"));
    const real = fs.realpathSync(dir);
    const result = await runScript(SUT, ["--prompts", "council-r2", "wd", "Polish"], { cwd: dir });
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout.trim().split(/\r?\n/), MEMBER_NAMES.map((name) => `PROMPT: ${name} | ${path.join(real, "wd", "prompts", `council-r2-${name}.md`)}`));
    const risk = fs.readFileSync(path.join(dir, "wd", "prompts", "council-r2-risk.md"), "utf-8");
    assert.ok(risk.includes("Write in Polish.\n"));
    assert.ok(risk.includes(`Write your output to ${path.join(real, "wd", "11-council-r2", "risk.md")}.`));
    assert.equal(fs.readdirSync(path.join(dir, "wd", "prompts")).length, 7);
  });
});

test("--prompts research exits 1 naming the section when a reference lacks it, and writes no prompt", async () => {
  await withTempDir("idea-validator-", async (dir) => {
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.mkdirSync(path.join(dir, "references"));
    fs.mkdirSync(path.join(dir, "wd"));
    fs.copyFileSync(SUT, path.join(dir, "scripts", "build_report.mjs"));
    fs.writeFileSync(path.join(dir, "references", "process.md"), "# Process\n\n## Research rules\n\n- rule\n", "utf-8");
    fs.writeFileSync(path.join(dir, "references", "dimensions.md"), "# Dimensions\n", "utf-8");
    const result = await runScript(path.join(dir, "scripts", "build_report.mjs"), ["--prompts", "research", "wd"], { cwd: dir });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /### Problem research brief/);
    assert.ok(!fs.existsSync(path.join(dir, "wd", "prompts")));
  });
});

/*
 * build_report.test.ts - the file-writing half of idea-validator's report builder
 * CLI: unparsable input and invalid data exit 1 and write nothing, valid data
 * exits 0 and writes the filled template with LF line endings; `--prompts
 * research` over the real reference texts and over a copied script beside a
 * stub references/ directory. Integration tier (each case builds a temp-dir
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
import { capture, validReport } from "./build_report-fixture.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/idea-validator/scripts/build_report.mjs");
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

test("valid data exits 0 and writes the filled template with every placeholder replaced and LF line endings", async () => {
  await withTempDir("idea-validator-", (dir) => {
    const src = path.join(dir, "report-data.json");
    const dest = path.join(dir, "report.html");
    fs.writeFileSync(src, JSON.stringify(validReport()), "utf-8");
    const out = capture();
    assert.equal(main([src, dest], out.log), 0);
    assert.match(out.lines[0], /^OK → .*report\.html \(\d+ KB\)$/);
    const html = fs.readFileSync(dest, "utf-8");
    assert.ok(html.includes('<html lang="pl">'));
    assert.ok(html.includes("<title>Idea</title>"));
    assert.ok(!/__REPORT_DATA__|__LANG__|__TITLE__/.test(html));
    assert.ok(!html.includes("\r\n"));
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
    assert.match(found.text, expected);
    assert.doesNotMatch(found.text, forbidden);
  });
}

test("--prompts research on a relative working directory creates its prompts/ and writes the three files, printing one PROMPT line each with an absolute path", async () => {
  await withTempDir("idea-validator-", async (dir) => {
    fs.mkdirSync(path.join(dir, "wd"));
    const real = fs.realpathSync(dir);
    const result = await runScript(SUT, ["--prompts", "research", "wd"], { cwd: dir });
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
      `PROMPT: problem | ${path.join(real, "wd", "prompts", "research-problem.md")}`,
      `PROMPT: market | ${path.join(real, "wd", "prompts", "research-market.md")}`,
      `PROMPT: competition | ${path.join(real, "wd", "prompts", "research-competition.md")}`,
    ]);
    const problem = fs.readFileSync(path.join(dir, "wd", "prompts", "research-problem.md"), "utf-8");
    assert.match(problem, /^### Problem research brief/);
    assert.ok(problem.includes(`Write your output to ${path.join(real, "wd", "03-research-problem.md")}.`));
    assert.ok(fs.existsSync(path.join(dir, "wd", "prompts", "research-market.md")));
    assert.ok(fs.existsSync(path.join(dir, "wd", "prompts", "research-competition.md")));
  });
});

test("--prompts research on a missing working directory exits 1 naming it and writes nothing", async () => {
  await withTempDir("idea-validator-", async (dir) => {
    const result = await runScript(SUT, ["--prompts", "research", "absent"], { cwd: dir });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /absent/);
    assert.ok(!fs.existsSync(path.join(dir, "absent")));
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
